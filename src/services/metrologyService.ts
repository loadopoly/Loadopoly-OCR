/**
 * metrologyService — GeoGraph OCR's side of the photogrammetric connection.
 *
 * Writes camera facts and scale observations to the shared Supabase tables
 * (migration 20261010000000_photo_metrology.sql) under the photo's content
 * key, where StockOpoly's mirrored observations for the same JPEG meet them.
 * Reads the fused per-photo scale back from the `metrology_photo_scales` view.
 *
 * Personal local standards (a person's calibrated finger, palm, shoe) are
 * stored owner-only and need an explicit consent timestamp. When a standard
 * is used on a photo, only the resulting scale is stored — never the pixel
 * span, which together with the scale would reveal the body measurement.
 * A standard is only ever applied to its owner's own photos.
 *
 * Uses the primary client (the one the user is signed in on): RLS checks
 * `auth.uid()`, which only that session carries.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import * as pm from '../lib/photoMetrology';

const SOURCE_APP = 'geograph';

// The metrology tables are not in the generated Database types yet.
const db = (): SupabaseClient | null => supabase as unknown as SupabaseClient | null;

async function uid(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export interface CameraFacts {
  widthPx: number;
  heightPx: number;
  focal35mm?: number | null;
  focusDistanceM?: number | null;
  cameraModel?: string | null;
}

/** Register a photo by content and log its EXIF prior when the camera facts allow. */
export async function registerPhoto(bytes: ArrayBuffer | Uint8Array, cam: CameraFacts): Promise<string> {
  const key = await pm.photoKey(bytes);
  const client = db();
  if (!client) return key;
  const { error } = await client.from('metrology_photos').upsert({
    photo_key: key,
    width_px: cam.widthPx,
    height_px: cam.heightPx,
    focal_35mm: cam.focal35mm ?? null,
    focus_distance_m: cam.focusDistanceM ?? null,
    camera_model: cam.cameraModel ?? null,
    first_seen_app: SOURCE_APP,
  }, { onConflict: 'photo_key', ignoreDuplicates: true });
  if (error) logger.warn('metrology: photo upsert failed', { module: 'metrology', error: error.message });
  if (cam.focal35mm && cam.focusDistanceM) {
    // stored raw (static prior): the field statistics must measure the camera itself
    const s = pm.scaleFromExif(cam.widthPx, cam.heightPx, cam.focal35mm, cam.focusDistanceM);
    await insertObservation(client, key, 'exif', s, {});
  }
  return key;
}

async function insertObservation(
  client: SupabaseClient, photoKey: string, refKind: 'standard' | 'reference' | 'exif' | 'grid' | 'tape',
  s: pm.Scale, extra: { refKey?: string; pixels?: number; pixelSigma?: number },
): Promise<boolean> {
  const observer = await uid(client);
  if (!observer) {
    logger.warn('metrology: not signed in; observation kept local only', { module: 'metrology' });
    return false;
  }
  const { error } = await client.from('metrology_observations').insert({
    photo_key: photoKey,
    source_app: SOURCE_APP,
    observer_uid: observer,
    ref_kind: refKind,
    ref_key: extra.refKey ?? null,
    source_class: s.sourceClass,
    plane: s.plane,
    // a personal standard's span never leaves the device
    pixels: refKind === 'standard' ? null : extra.pixels ?? null,
    pixel_sigma: refKind === 'standard' ? null : extra.pixelSigma ?? null,
    ln_mm_per_px: s.lnMmPerPx,
    sigma_ln: s.sigmaLn,
  });
  if (error) logger.warn('metrology: observation insert failed', { module: 'metrology', error: error.message });
  return !error;
}

/** A published reference (card, pegboard, pallet…) spanning `pixels` in the photo. */
export async function recordReferenceSpan(
  photoKey: string, refKey: string, pixels: number, pixelSigma = 2, plane = 'default',
): Promise<pm.Scale> {
  const r = pm.REFERENCES[refKey];
  if (!r) throw new Error(`unknown reference ${refKey}`);
  const s = pm.scaleFromSpan(r.lengthMm, pm.referenceSigmaLn(r), pixels, pixelSigma,
    { sourceClass: 'recorded', basis: `reference:${refKey}`, plane });
  const client = db();
  if (client) await insertObservation(client, photoKey, 'reference', s, { refKey, pixels, pixelSigma });
  return s;
}

/** Save (or update) one of the signed-in user's own standards. Consent is required. */
export async function saveMyStandard(
  std: Omit<pm.LocalStandard, 'owner'> & { evidence?: unknown[] }, consent: { agreed: true },
): Promise<boolean> {
  if (consent?.agreed !== true) throw new Error('storing a body measurement needs the owner\'s consent');
  const client = db();
  if (!client) return false;
  const owner = await uid(client);
  if (!owner) return false;
  const { error } = await client.from('metrology_standards').upsert({
    owner_uid: owner,
    part: std.part,
    definition: std.definition ?? null,
    value_mm: std.value_mm,
    sigma_mm: std.sigma_mm,
    method: std.method,
    calibrated_at: std.calibrated_at || null,
    valid_until: std.valid_until ?? null,
    evidence: std.evidence ?? [],
    consent_at: new Date().toISOString(),
    source_app: SOURCE_APP,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_uid,part' });
  if (error) logger.warn('metrology: standard upsert failed', { module: 'metrology', error: error.message });
  return !error;
}

/** The signed-in user's standards (RLS returns only theirs). */
export async function listMyStandards(): Promise<pm.LocalStandard[]> {
  const client = db();
  if (!client) return [];
  const { data, error } = await client.from('metrology_standards')
    .select('part, definition, value_mm, sigma_mm, method, calibrated_at, valid_until');
  if (error || !data) return [];
  return data.map((r) => ({ owner: 'me', privacy: 'personal' as const, ...r })) as pm.LocalStandard[];
}

/**
 * Use one of the signed-in user's own standards visible in their own photo.
 * The pixel span is used locally to compute the scale and is not uploaded.
 */
export async function recordMyStandardSpan(
  photoKey: string, part: string, pixels: number, pixelSigma = 2, plane = 'default',
): Promise<pm.Scale | null> {
  const mine = (await listMyStandards()).find((s) => s.part === part);
  if (!mine) return null;
  const s = pm.scaleFromSpan(mine.value_mm, pm.standardSigmaLn(mine), pixels, pixelSigma,
    { sourceClass: 'measured', basis: `standard:me:${part}`, plane });
  const client = db();
  if (client) await insertObservation(client, photoKey, 'standard', s, {});
  return s;
}

/** Fused scale for a photo across every app that observed it. */
export async function getPhotoScale(photoKey: string, plane = 'default') {
  const client = db();
  if (!client) return null;
  const { data, error } = await client.from('metrology_photo_scales')
    .select('n_sources, mm_per_px, sigma_ln, apps, updated_at')
    .eq('photo_key', photoKey).eq('plane', plane).maybeSingle();
  if (error) return null;
  return data;
}

/**
 * The calibration parameters in force, learned from every app's anchored
 * photos via the `metrology_exif_error_stats` view (raw EXIF vs tape/caliper/
 * reference). Cached for five minutes; priors when offline or empty.
 */
let paramsCache: { at: number; params: pm.CalibrationParams } | null = null;
export async function learnedParams(force = false): Promise<pm.CalibrationParams> {
  if (!force && paramsCache && Date.now() - paramsCache.at < 300_000) return paramsCache.params;
  const client = db();
  let params = pm.defaultParams();
  if (client) {
    const { data, error } = await client.from('metrology_exif_error_stats')
      .select('kind, estimator, lens, n, mean_log_err, sd_log_err');
    if (!error && data) params = pm.paramsFromStats(data as pm.ErrorStat[], null, null, new Date().toISOString());
  }
  paramsCache = { at: Date.now(), params };
  return params;
}

/**
 * The EXIF prior for a photo with the learned per-lens bias and uncertainty
 * applied. Observations store the raw prior (registerPhoto) so the statistics
 * keep measuring the camera; the learned version is for use.
 */
export async function learnedExifPrior(cam: CameraFacts): Promise<pm.Scale | null> {
  if (!cam.focal35mm || !cam.focusDistanceM) return null;
  const e = pm.exifParams(cam.focal35mm, await learnedParams());
  return pm.scaleFromExif(cam.widthPx, cam.heightPx, cam.focal35mm, cam.focusDistanceM, e.sigmaLn, e.biasLn);
}

/** Measure something on a scaled plane: pixels → millimetres with uncertainty. */
export function measureOnPhoto(scale: pm.Scale, pixels: number, pixelSigma = 1) {
  const L = pm.measure(scale, pixels, pixelSigma);
  return { mm: L.mm, sigmaMm: L.mm * L.sigmaLn, sourceClass: L.sourceClass };
}
