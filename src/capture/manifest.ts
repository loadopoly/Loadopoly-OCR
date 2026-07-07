/**
 * Bundle manifest + export — turns a capture session into a portable
 * `bundle_<id>.zip` (photos + scb_manifest.json) for the Supply Chain Brain.
 *
 * Contract: `loadopoly.capture/1` — see docs/OPERATE_CONSOLE.md and the
 * Brain-side reader `pipeline/src/photogrammetry/` in Supply-Chain-Brain.
 */

import {
  CAPTURE_SCHEMA_VERSION,
  COVERAGE_SECTORS,
  CapturePhoto,
  CaptureProject,
  CaptureSession,
  ManifestPhoto,
  SCBManifest,
} from './types';
import { CAPTURE_PRESETS } from './presets';
import { ZipWriter } from './zip';

/** Stable, zero-padded photo file name inside the bundle. */
export function photoFileName(index: number): string {
  return `photos/IMG_${String(index + 1).padStart(4, '0')}.jpg`;
}

export function buildManifest(
  session: CaptureSession,
  project: CaptureProject,
  photos: CapturePhoto[],
): SCBManifest {
  const orbit = CAPTURE_PRESETS[session.preset].orbit;
  const filled = session.sectorsFilled.length;
  const manifestPhotos: ManifestPhoto[] = photos.map(p => ({
    file: photoFileName(p.index),
    index: p.index,
    capturedAt: p.capturedAt,
    pose: p.pose,
    sectorIdx: p.sectorIdx,
    ring: p.ring,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    sha256: p.sha256,
    quality: p.quality,
  }));

  return {
    schema: CAPTURE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    session: {
      id: session.id,
      name: session.name,
      preset: session.preset,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      operator: session.operator,
      notes: session.notes,
      origin: session.origin,
      device: {
        userAgent: navigator.userAgent,
        platform: (navigator as any).userAgentData?.platform ?? navigator.platform ?? '',
      },
    },
    project: {
      id: project.id,
      name: project.name,
      site: project.site,
      tags: project.tags,
    },
    photos: manifestPhotos,
    coverage: {
      sectors: orbit ? COVERAGE_SECTORS : 0,
      filled: orbit ? filled : 0,
      pct: orbit ? Math.round((filled / COVERAGE_SECTORS) * 100) : 100,
    },
    scb: {
      targetDataStore: 'supply-chain-brain',
      intakeModule: 'src.photogrammetry',
      kind: 'photogrammetry_capture',
    },
  };
}

/** Assemble the full bundle ZIP (manifest + photos). */
export async function buildBundle(
  session: CaptureSession,
  project: CaptureProject,
  photos: CapturePhoto[],
): Promise<{ blob: Blob; manifest: SCBManifest; fileName: string }> {
  const manifest = buildManifest(session, project, photos);
  const zip = new ZipWriter();
  await zip.addFile('scb_manifest.json', JSON.stringify(manifest, null, 2));
  for (const photo of photos) {
    await zip.addFile(photoFileName(photo.index), photo.blob);
  }
  const stamp = session.startedAt.slice(0, 10).replace(/-/g, '');
  const safeName = session.name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
  return {
    blob: zip.finalize(),
    manifest,
    fileName: `bundle_${stamp}_${safeName}_${session.id.slice(0, 8)}.zip`,
  };
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
