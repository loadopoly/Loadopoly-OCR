/**
 * photoMetrology — TypeScript port of the holon.metrology/1 contract.
 *
 * Canonical source: `Metrology/photometrology.py` in the umbrella repo. This
 * port must reproduce `src/lib/__fixtures__/metrology_golden.json` (synced by
 * `python Metrology/metrology_cli.py sync`); `npm run test:metrology` checks it.
 * Keep it to erasable TypeScript (no enums / parameter properties) so Node can
 * run it with --experimental-strip-types.
 *
 * Model: a known length L spanning p pixels gives the photo's scale on that
 * plane, s = L / p (mm per pixel). Every source of scale becomes ln s with a
 * log-space sigma and is fused by inverse variance. Source classes:
 *   measured  — tape, caliper, or a person's calibrated local standard
 *   recorded  — published size (ISO card, pegboard pitch, pallet)
 *   projected — camera only: EXIF focus distance + 35 mm-equivalent focal length
 *   simulated — game/synthetic; unit "tile", never converts to mm
 * Photos are identified across apps by `sha256:<hex>` of the original bytes.
 *
 * @module lib/photoMetrology
 */

export const SCHEMA = 'holon.metrology/1';
export const VERSION = '1.0.0';
export const SOURCE_CLASSES = ['measured', 'recorded', 'projected', 'simulated'] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];
export const PRIVACY = ['public', 'tenant', 'personal'] as const;
export type Privacy = (typeof PRIVACY)[number];
export const UNIT_TO_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };
export const FULL_FRAME_DIAG_MM = Math.hypot(36, 24);
export const EXIF_SIGMA_LN = 0.35;
export const OUTLIER_Z = 3.0;
export const GRID_SIGMA_K = 3.0;

// ───────────────────────────────────────────────────────────── identity
/** `sha256:<hex>` of the original file bytes (WebCrypto; browser + Node ≥ 18). */
export async function photoKey(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export function toMm(value: number, unit: string): number {
  if (unit === 'tile') throw new Error('tile is a game unit with no physical size; keep it as tiles');
  const f = UNIT_TO_MM[unit];
  if (f === undefined) throw new Error(`unknown unit ${unit}`);
  return value * f;
}

// ─────────────────────────────────────────────────────────── value types
export interface Scale {
  lnMmPerPx: number;
  sigmaLn: number;
  sourceClass: SourceClass;
  basis: string;
  plane: string;
}

export const mmPerPx = (s: Scale): number => Math.exp(s.lnMmPerPx);
export const relSigma = (s: Scale): number => Math.expm1(s.sigmaLn);

function makeScale(ln: number, sigmaLn: number, sourceClass: SourceClass, basis = '', plane = 'default'): Scale {
  if (!(sigmaLn > 0 && Number.isFinite(sigmaLn))) throw new Error('sigmaLn must be positive and finite');
  return { lnMmPerPx: ln, sigmaLn, sourceClass, basis, plane };
}

export interface Length {
  mm: number;
  sigmaLn: number;
  sourceClass: SourceClass;
  basis: string;
}

export interface LocalStandard {
  owner: string;
  part: string;
  value_mm: number;
  sigma_mm: number;
  method: string;
  calibrated_at: string;
  valid_until?: string | null;
  definition?: string;
  privacy?: Privacy;
}

export const standardKey = (s: LocalStandard): string => `${s.owner}:${s.part}`;
export const standardSigmaLn = (s: LocalStandard): number => Math.log1p(s.sigma_mm / s.value_mm);

export interface Reference {
  key: string;
  name: string;
  lengthMm: number;
  sigmaMm: number;
  note?: string;
}

const ref = (key: string, name: string, lengthMm: number, sigmaMm: number, note = ''): Reference =>
  ({ key, name, lengthMm, sigmaMm, note });

/** Shared catalogue — identical to photometrology.REFERENCES. */
export const REFERENCES: Record<string, Reference> = Object.fromEntries([
  ref('iso_id1.width', 'ISO/IEC 7810 ID-1 card, long edge', 85.6, 0.13, 'bank/credit card'),
  ref('iso_id1.height', 'ISO/IEC 7810 ID-1 card, short edge', 53.98, 0.13),
  ref('tcg_standard.width', 'Standard TCG card (Pokémon), short edge', 63.0, 0.5),
  ref('tcg_standard.height', 'Standard TCG card (Pokémon), long edge', 88.0, 0.5),
  ref('pegboard.pitch_1in', 'Pegboard hole pitch (1 in grid)', 25.4, 0.25),
  ref('rack.teardrop_pitch_2in', 'Teardrop pallet-rack upright punch pitch', 50.8, 0.5),
  ref('pallet.gma.length', 'GMA pallet, 48 in side', 1219.2, 6.0),
  ref('pallet.gma.width', 'GMA pallet, 40 in side', 1016.0, 6.0),
  ref('paper.us_letter.width', 'US Letter, short edge', 215.9, 0.5),
  ref('paper.a4.width', 'A4, short edge', 210.0, 0.5),
].map((r) => [r.key, r]));

export const referenceSigmaLn = (r: Reference): number => Math.log1p(r.sigmaMm / r.lengthMm);

// ─────────────────────────────────────────────────────────── scale sources
export function scaleFromSpan(
  lengthMm: number, lengthSigmaLn: number, pixels: number, pixelSigma: number,
  opts: { sourceClass: SourceClass; basis: string; plane?: string },
): Scale {
  if (pixels <= 0) throw new Error('pixels must be positive');
  const s = Math.hypot(lengthSigmaLn, Math.log1p(pixelSigma / pixels));
  return makeScale(Math.log(lengthMm / pixels), s, opts.sourceClass, opts.basis, opts.plane ?? 'default');
}

/**
 * Camera-only prior on the focus plane: d · 43.27 / (f35 · diag_px).
 * `sigmaLn`/`biasLn` are dynamic — pass `exifParams(lens, params)` to use what
 * the field has learned for this lens; store the raw value, apply these at use.
 */
export function scaleFromExif(
  widthPx: number, heightPx: number, focal35mm: number, focusDistanceM: number,
  sigmaLn: number | null = null, biasLn = 0.0,
): Scale {
  if (focal35mm <= 0 || focusDistanceM <= 0) throw new Error('focal35mm and focusDistanceM must be positive');
  const diag = Math.hypot(widthPx, heightPx);
  const mmpp = (focusDistanceM * 1000.0 * FULL_FRAME_DIAG_MM) / (focal35mm * diag);
  return makeScale(Math.log(mmpp) - biasLn, sigmaLn ?? EXIF_SIGMA_LN, 'projected', biasLn === 0 ? 'exif' : 'exif:debiased', 'focus');
}

export interface FuseResult {
  scale: Scale;
  chi2Red: number;
  n: number;
  outliers: { basis: string; z: number }[];
}

const round = (x: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export function fuse(items: Scale[]): FuseResult {
  if (!items.length) throw new Error('nothing to fuse');
  const planes = new Set(items.filter((s) => s.plane !== 'focus').map((s) => s.plane));
  const w = items.map((s) => 1.0 / s.sigmaLn ** 2);
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = items.reduce((a, s, i) => a + w[i] * s.lnMmPerPx, 0) / sw;
  const sig = 1.0 / Math.sqrt(sw);
  const chi2 = items.reduce((a, s, i) => a + w[i] * (s.lnMmPerPx - mu) ** 2, 0);
  const dof = Math.max(items.length - 1, 1);
  const outliers: { basis: string; z: number }[] = [];
  items.forEach((s, i) => {
    const rest = items.map((t, j) => [w[j], t] as const).filter((_, j) => j !== i);
    if (!rest.length) return;
    const wRest = rest.reduce((a, [wj]) => a + wj, 0);
    const muRest = rest.reduce((a, [wj, t]) => a + wj * t.lnMmPerPx, 0) / wRest;
    const z = (s.lnMmPerPx - muRest) / Math.sqrt(s.sigmaLn ** 2 + 1.0 / wRest);
    if (Math.abs(z) > OUTLIER_Z) outliers.push({ basis: s.basis, z: round(z, 3) });
  });
  let k = 0;
  w.forEach((wi, i) => { if (wi > w[k]) k = i; });
  const basis = 'fused:' + Array.from(new Set(items.map((s) => s.basis))).sort().join('+');
  const plane = planes.size === 1 ? Array.from(planes)[0] : 'default';
  return { scale: makeScale(mu, sig, items[k].sourceClass, basis, plane), chi2Red: round(chi2 / dof, 4), n: items.length, outliers };
}

export function measure(scale: Scale, pixels: number, pixelSigma = 1.0, basis = ''): Length {
  if (pixels <= 0) throw new Error('pixels must be positive');
  const s = Math.hypot(scale.sigmaLn, Math.log1p(pixelSigma / pixels));
  return { mm: mmPerPx(scale) * pixels, sigmaLn: s, sourceClass: scale.sourceClass, basis: basis || scale.basis };
}

export function relational(aPixels: number, bPixels: number, sigmaPx = 1.0): { ratio: number; sigmaLn: number } {
  return {
    ratio: aPixels / bPixels,
    sigmaLn: Math.hypot(Math.log1p(sigmaPx / aPixels), Math.log1p(sigmaPx / bPixels)),
  };
}

// ─────────────────────────────────────────────────── linear least squares
function solve(a: number[][], b: number[]): number[] {
  const n = a[0].length;
  const ata = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => a.reduce((s, r) => s + r[i] * r[j], 0)));
  const atb = Array.from({ length: n }, (_, i) => a.reduce((s, r, k) => s + r[i] * b[k], 0));
  const m = ata.map((row, i) => [...row, atb[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error('degenerate grid points');
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r !== c) {
        const f = m[r][c] / m[c][c];
        m[r] = m[r].map((x, j) => x - f * m[c][j]);
      }
    }
  }
  return Array.from({ length: n }, (_, i) => m[i][n] / m[i][i]);
}

/** Read a length off a tape in the photo: ticks = [pixelPosition, graduation]. */
export function tapeSpan(ticks: [number, number][], aPx: number, bPx: number, edgeSigmaPx = 2.0) {
  if (ticks.length < 2) throw new Error('need ≥ 2 ticks');
  const deg = Math.min(2, ticks.length - 1);
  const rows = ticks.map(([x]) => Array.from({ length: deg + 1 }, (_, k) => x ** k));
  const coef = solve(rows, ticks.map(([, g]) => g));
  const u = (x: number) => coef.reduce((s, c, k) => s + c * x ** k, 0);
  const du = (x: number) => coef.reduce((s, c, k) => (k ? s + k * c * x ** (k - 1) : s), 0);
  const resid = ticks.map(([x, g]) => u(x) - g);
  const dof = Math.max(ticks.length - deg - 1, 1);
  const fitRms = ticks.length > deg + 1 ? Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / dof) : 0;
  const span = Math.abs(u(bPx) - u(aPx));
  const edge = Math.hypot(du(aPx), du(bPx)) * edgeSigmaPx;
  return { span, sigma: Math.hypot(edge, fitRms * Math.sqrt(2.0)), unitsPerPxMid: Math.abs(du((aPx + bPx) / 2)), fitRms };
}

/** Scale from a regular grid seen in perspective (see photometrology.grid_scale). */
export function gridScale(
  pointsPx: [number, number][], indices: [number, number][], pitch: number,
  opts: { at?: [number, number]; unit?: string; residualFloorPx?: number; k?: number } = {},
): { scale?: Scale; tilesPerPx?: number; sigmaLn?: number; rmsPx: number; sourceClass?: SourceClass;
     fit: { node_sigma_px: number; span_px: number; n: number } } {
  const unit = opts.unit ?? 'mm';
  const floor = opts.residualFloorPx ?? 0.5;
  if (pointsPx.length !== indices.length || pointsPx.length < 4) throw new Error('need ≥ 4 matched points');
  const rows: number[][] = [];
  const rhs: number[] = [];
  pointsPx.forEach(([u, v], k) => {
    const [i, j] = indices[k];
    const x = i * pitch, y = j * pitch;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.push(v);
  });
  const h = [...solve(rows, rhs), 1.0];
  const proj = (x: number, y: number): [number, number] => {
    const w = h[6] * x + h[7] * y + 1.0;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
  const res = pointsPx.map(([u, v], k) => {
    const [pu, pv] = proj(indices[k][0] * pitch, indices[k][1] * pitch);
    return Math.hypot(pu - u, pv - v);
  });
  const rms = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / res.length);
  const n = pointsPx.length;
  const [cu, cv] = opts.at ?? [pointsPx.reduce((s, p) => s + p[0], 0) / n, pointsPx.reduce((s, p) => s + p[1], 0) / n];
  let x = 0, y = 0;
  for (let it = 0; it < 30; it++) {
    const [pu, pv] = proj(x, y);
    const e = 1e-6 * Math.max(pitch, 1.0);
    const duDx = (proj(x + e, y)[0] - pu) / e, dvDx = (proj(x + e, y)[1] - pv) / e;
    const duDy = (proj(x, y + e)[0] - pu) / e, dvDy = (proj(x, y + e)[1] - pv) / e;
    const det = duDx * dvDy - duDy * dvDx;
    if (Math.abs(det) < 1e-18) break;
    const ru = cu - pu, rv = cv - pv;
    x += (dvDy * ru - duDy * rv) / det;
    y += (-dvDx * ru + duDx * rv) / det;
    if (Math.hypot(ru, rv) < 1e-9) break;
  }
  const e = 1e-4 * Math.max(pitch, 1.0);
  const [pu, pv] = proj(x, y);
  const j11 = (proj(x + e, y)[0] - pu) / e, j21 = (proj(x + e, y)[1] - pv) / e;
  const j12 = (proj(x, y + e)[0] - pu) / e, j22 = (proj(x, y + e)[1] - pv) / e;
  const unitPerPx = 1.0 / Math.sqrt(Math.abs(j11 * j22 - j12 * j21));
  let spanPx = 0;
  for (const a of pointsPx) for (const b of pointsPx) spanPx = Math.max(spanPx, Math.hypot(a[0] - b[0], a[1] - b[1]));
  const nodeSigma = (rms / Math.sqrt(2.0)) * (n > 4 ? Math.sqrt((2 * n) / (2 * n - 8)) : 1.0);
  const nodeUsed = Math.max(nodeSigma, floor);
  const sig = Math.log1p(((opts.k ?? GRID_SIGMA_K) * nodeUsed) / (spanPx * Math.sqrt(n)));
  const fit = { node_sigma_px: nodeUsed, span_px: spanPx, n };
  if (unit === 'tile') return { tilesPerPx: unitPerPx, sigmaLn: sig, rmsPx: rms, sourceClass: 'simulated', fit };
  const pitchMm = toMm(pitch, unit);
  return { scale: makeScale(Math.log(unitPerPx * (pitchMm / pitch)), sig, 'recorded', `grid:${pitchMm}mm`), rmsPx: rms, fit };
}

// ─────────────────────────────────────────────── linking people (transfer)
export interface TransferLink { object: string; owner: string; ln_mm: number; sigma_ln: number }

export function transferOffsets(links: TransferLink[], anchor?: string) {
  const owners = Array.from(new Set(links.map((l) => l.owner))).sort();
  const objects = Array.from(new Set(links.map((l) => l.object))).sort();
  const ones = (os: string[]) => Object.fromEntries(os.map((o) => [o, 1.0]));
  if (owners.length < 2) return { anchor: owners[0] ?? null, factors: ones(owners), linked: false, sharedObjects: [] as string[] };
  const count = (o: string) => links.filter((l) => l.owner === o).length;
  const anc = anchor ?? owners.reduce((best, o) => (count(o) > count(best) ? o : best), owners[0]);
  const free = owners.filter((o) => o !== anc);
  const cols = new Map<string, number>();
  free.forEach((o, k) => cols.set(`b:${o}`, k));
  objects.forEach((ob, k) => cols.set(`x:${ob}`, free.length + k));
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const l of links) {
    const w = 1.0 / l.sigma_ln;
    const r = new Array(cols.size).fill(0);
    r[cols.get(`x:${l.object}`)!] = w;
    if (l.owner !== anc) r[cols.get(`b:${l.owner}`)!] = w;
    rows.push(r); rhs.push(w * l.ln_mm);
  }
  let sol: number[];
  try { sol = solve(rows, rhs); } catch { return { anchor: anc, factors: ones(owners), linked: false, sharedObjects: [] as string[] }; }
  const factors: Record<string, number> = { [anc]: 1.0 };
  free.forEach((o) => { factors[o] = round(Math.exp(sol[cols.get(`b:${o}`)!]), 6); });
  const sharedObjects = objects.filter((ob) => new Set(links.filter((l) => l.object === ob).map((l) => l.owner)).size > 1);
  return { anchor: anc, factors, linked: sharedObjects.length > 0, sharedObjects };
}

// ───────────────────────────────────────── resolution floors (the Planck gate)
/** CODATA 2018 Planck length, 1.616255(18)e-35 m — the floor under every floor. */
export const PLANCK_LENGTH_M = 1.616255e-35;
export const PLANCK_LENGTH_MM = PLANCK_LENGTH_M * 1000.0;
const PHI_SQ_INTEGRAL = 1.0 / (2.0 * Math.sqrt(Math.PI));

/** Cramér–Rao bound on locating one edge, px (Gaussian channel; = Bakugo). */
export function cramerRaoEdgePx(contrast: number, noiseSigma: number, psfSigmaPx: number, rows = 1, pixelPitchPx = 1.0): number {
  if (contrast <= 0 || noiseSigma <= 0 || psfSigmaPx <= 0) return Infinity;
  const info = ((contrast ** 2 / noiseSigma ** 2) * PHI_SQ_INTEGRAL) / (psfSigmaPx * pixelPitchPx) * Math.max(1, rows);
  return 1.0 / Math.sqrt(info);
}

/** Standard Quantum Limit on locating one edge, px (photon shot noise; = Bakugo). */
export function quantumFloorEdgePx(
  contrast: number, backgroundLevel: number, psfSigmaPx: number, rows = 1, pixelPitchPx = 1.0,
  sensor: { fullWellE?: number; bitDepth?: number; iso?: number; baseIso?: number } = {},
): number {
  if (contrast <= 0 || psfSigmaPx <= 0) return Infinity;
  const ePerLevel = (sensor.fullWellE ?? 6000.0) / (2 ** (sensor.bitDepth ?? 8) - 1) / Math.max(1.0, (sensor.iso ?? 100) / (sensor.baseIso ?? 100));
  const cE = Math.max(0, contrast) * ePerLevel;
  const muE = Math.max(0, Math.max(backgroundLevel, contrast * 0.5)) * ePerLevel;
  if (muE <= 0) return Infinity;
  const info = ((cE ** 2 / muE) * PHI_SQ_INTEGRAL) / (psfSigmaPx * pixelPitchPx) * Math.max(1, rows);
  return 1.0 / Math.sqrt(info);
}

/** Smallest resolvable length on this plane (mm): mm/px · σ_edge · √edges, ≥ Planck length. */
export function planckFloor(scale: Scale, edgeSigmaPx: number, edges = 2): Length {
  const mm = Math.max(mmPerPx(scale) * edgeSigmaPx * Math.sqrt(edges), PLANCK_LENGTH_MM);
  return { mm, sigmaLn: scale.sigmaLn, sourceClass: scale.sourceClass, basis: `planck_floor:${scale.basis}` };
}

/** QUIPU's Planck gate: a difference below the floor is not a displacement. */
export const planckGate = (deltaMm: number, floorMm: number, k = 1.0): boolean =>
  Math.abs(deltaMm) >= k * Math.max(floorMm, PLANCK_LENGTH_MM);

// ─────────────────────────────────────────────────────── interstitial space
export function interstitialGap(edgeAPx: number, edgeBPx: number, edgeSigmaPx: number, scale?: Scale) {
  const gapPx = Math.abs(edgeBPx - edgeAPx);
  const sigmaPx = edgeSigmaPx * Math.sqrt(2.0);
  const out: { gapPx: number; sigmaPx: number; resolvable: boolean; gapMm?: number; sigmaMm?: number } =
    { gapPx, sigmaPx, resolvable: gapPx >= sigmaPx };
  if (scale) {
    const mm = gapPx * mmPerPx(scale);
    out.gapMm = mm;
    out.sigmaMm = Math.hypot(sigmaPx * mmPerPx(scale), mm * scale.sigmaLn);
  }
  return out;
}

export const INTERSTITIAL_ARC = { perception: 'perceptopoly', vision: 'loadopoly-ocr', touch: 'bakugo' } as const;

/** QUIPU's interstitial measure on metrology residuals (recorded, not routed). */
export function interstitialArc(residuals: { perception: number[]; vision: number[]; touch: number[] }) {
  const { perception: p, vision: v, touch: t } = residuals;
  if (!(p.length === v.length && v.length === t.length) || p.length < 2) {
    throw new Error('need ≥ 2 shared photos with residuals from all three outputs');
  }
  const coh = (a: number[], b: number[]) => {
    const den = Math.sqrt(a.reduce((s, x) => s + x * x, 0) * b.reduce((s, y) => s + y * y, 0));
    return den > 0 ? a.reduce((s, x, i) => s + x * b[i], 0) / den : 0;
  };
  const cPv = coh(p, v), cVt = coh(v, t), cPt = coh(p, t);
  const mediated = cPv * cVt;
  return { schema: SCHEMA, kind: 'interstitial_arc', n: p.length, cPv, cVt, cPt, mediated,
    interstitial: Math.abs(cPt - mediated) / (1.0 + Math.abs(cPt)), routed: false };
}

// ───────────────────────────────────────────────────── grading components
export const ASPECTS = ['centering', 'corners', 'edges', 'surface'] as const;
export type Aspect = (typeof ASPECTS)[number];

function borderRatio(aPx: number, bPx: number, borderSigmaPx: number): [number, number] {
  const tot = aPx + bPx;
  if (tot <= 0) throw new Error('borders must have positive total width');
  return [100.0 * aPx / tot, (100.0 * Math.hypot(bPx * borderSigmaPx, aPx * borderSigmaPx)) / tot ** 2];
}

/** Centering from the four borders in px (scale cancels); fields match bakugo_scans. */
export function centering(leftPx: number, rightPx: number, topPx: number, bottomPx: number, edgeSigmaPx: number,
  opts: { scale?: Scale; face?: string } = {}) {
  const sb = edgeSigmaPx * Math.sqrt(2.0);
  let [h, hs] = borderRatio(leftPx, rightPx, sb);
  let [v, vs] = borderRatio(topPx, bottomPx, sb);
  h = Math.max(h, 100.0 - h); v = Math.max(v, 100.0 - v);
  const worstAxis = h >= v ? 'horizontal' : 'vertical';
  const out: Record<string, unknown> & { h_ratio_pct: number; v_ratio_pct: number; worst_ratio_pct: number } = {
    schema: SCHEMA, kind: 'grading_component', aspect: 'centering', face: opts.face ?? 'front',
    h_ratio_pct: h, h_ratio_sigma: hs, v_ratio_pct: v, v_ratio_sigma: vs, worst_axis: worstAxis,
    worst_ratio_pct: worstAxis === 'horizontal' ? h : v, worst_ratio_sigma: worstAxis === 'horizontal' ? hs : vs,
    h_resolvable: planckGate(leftPx - rightPx, sb * Math.sqrt(2.0)),
    v_resolvable: planckGate(topPx - bottomPx, sb * Math.sqrt(2.0)),
  };
  if (opts.scale) {
    const mpp = mmPerPx(opts.scale);
    Object.assign(out, { left_mm: leftPx * mpp, right_mm: rightPx * mpp, top_mm: topPx * mpp, bottom_mm: bottomPx * mpp, px_per_mm: 1.0 / mpp });
  }
  return out;
}

/** Corner / edge / surface defect as a measurement, with its Planck floor. */
export function gradingComponent(aspect: Aspect, name: string, pixels: number, edgeSigmaPx: number, scale: Scale,
  opts: { face?: string; area?: boolean } = {}) {
  if (aspect === 'centering' || !ASPECTS.includes(aspect)) throw new Error('use centering() for centering; aspect must be corners, edges or surface');
  const floor = planckFloor(scale, edgeSigmaPx);
  let value: number, sigma: number, unit: string, resolvable: boolean;
  if (opts.area) {
    const mm2 = pixels * mmPerPx(scale) ** 2;
    const perimPx = 2.0 * Math.sqrt(Math.PI * pixels);
    value = mm2; unit = 'mm2';
    sigma = mm2 * Math.hypot(2.0 * scale.sigmaLn, (perimPx * edgeSigmaPx) / pixels);
    resolvable = Math.sqrt(mm2) >= floor.mm;
  } else {
    const L = measure(scale, pixels, edgeSigmaPx * Math.sqrt(2.0));
    value = L.mm; unit = 'mm'; sigma = L.mm * L.sigmaLn; resolvable = L.mm >= floor.mm;
  }
  return { schema: SCHEMA, kind: 'grading_component', aspect, name, face: opts.face ?? 'front', value, sigma, unit,
    planck_floor_mm: floor.mm, resolvable, source_class: scale.sourceClass };
}

// ───────────────────────────────────────────── dynamic parameters (learned)
export const PRIOR_WEIGHT_N = 3.0;
export const PARALLAX_PRIOR_MM: [number, number] = [6.0, 4.0];

export const shrink = (prior: number, observed: number, n: number, n0 = PRIOR_WEIGHT_N): number =>
  n > 0 ? (n0 * prior + n * observed) / (n0 + n) : prior;

export interface CalibrationParams {
  schema: string; kind: 'calibration_params'; updated_at: string | null;
  exif: Record<string, { bias_ln: number; sigma_ln: number; n: number }>;
  grid_sigma_k: { value: number; n: number; source: string };
}

export const defaultParams = (): CalibrationParams => ({
  schema: SCHEMA, kind: 'calibration_params', updated_at: null, exif: {},
  grid_sigma_k: { value: GRID_SIGMA_K, n: 0, source: 'prior' },
});

export interface ErrorStat { kind?: string; estimator: string; lens?: string; n: number; mean_log_err: number; sd_log_err: number | null }

export function paramsFromStats(stats: ErrorStat[], gridFit?: { k: number; n: number; source?: string } | null,
  base?: CalibrationParams | null, updatedAt: string | null = null): CalibrationParams {
  const p: CalibrationParams = base ? JSON.parse(JSON.stringify(base)) : defaultParams();
  for (const st of stats) {
    if (st.kind !== 'error_stat' || st.estimator !== 'exif' || !st.n) continue;
    const n = st.n;
    const varObs = st.sd_log_err != null ? st.sd_log_err ** 2 : EXIF_SIGMA_LN ** 2;
    p.exif[String(st.lens ?? '')] = {
      bias_ln: shrink(0.0, st.mean_log_err, n),
      sigma_ln: Math.sqrt(shrink(EXIF_SIGMA_LN ** 2, varObs, Math.max(n - 1, 0))),
      n,
    };
  }
  if (gridFit && gridFit.n) {
    p.grid_sigma_k = { value: Math.sqrt(shrink(GRID_SIGMA_K ** 2, gridFit.k ** 2, gridFit.n)), n: gridFit.n, source: gridFit.source ?? 'fit' };
  }
  p.updated_at = updatedAt;
  return p;
}

export function exifParams(lens: number | string | null | undefined, params?: CalibrationParams | null) {
  const key = lens === null || lens === undefined || lens === '' ? '' : String(Math.trunc(Number(lens)));
  const row = params?.exif?.[key];
  return row ? { sigmaLn: row.sigma_ln, biasLn: row.bias_ln } : { sigmaLn: EXIF_SIGMA_LN, biasLn: 0.0 };
}

export const gridK = (params?: CalibrationParams | null): number => params?.grid_sigma_k?.value ?? GRID_SIGMA_K;

export function fitGridSigmaK(samples: { log_err: number; fit: { node_sigma_px: number; span_px: number; n: number } }[], source = 'fit') {
  if (!samples.length) return { k: GRID_SIGMA_K, n: 0, source: 'prior' };
  const z = samples.map((s) => s.log_err / (s.fit.node_sigma_px / (s.fit.span_px * Math.sqrt(s.fit.n))));
  return { k: Math.sqrt(z.reduce((a, x) => a + x * x, 0) / z.length), n: z.length, source };
}

/** Edge sharpness measured from intensity profiles across one edge (dynamic Planck floor input). */
export function edgeSigmaFromProfiles(profiles: number[][], sensor: { fullWellE?: number; bitDepth?: number; iso?: number } = {}) {
  const rows = profiles.length;
  if (rows < 2) throw new Error('need ≥ 2 profiles across the edge');
  const m = profiles[0].length;
  if (m < 8 || profiles.some((p) => p.length !== m)) throw new Error('profiles must share a length ≥ 8');
  const mean = Array.from({ length: m }, (_, i) => profiles.reduce((a, p) => a + p[i], 0) / rows);
  const third = Math.max(Math.floor(m / 3), 2);
  const lo = mean.slice(0, third).reduce((a, b) => a + b, 0) / third;
  const hi = mean.slice(-third).reduce((a, b) => a + b, 0) / third;
  const contrast = Math.abs(hi - lo);
  const resid = profiles.flatMap((p) => p.map((v, i) => Math.abs(v - mean[i]))).sort((a, b) => a - b);
  const noise = 1.4826 * resid[Math.floor(resid.length / 2)] * Math.sqrt(rows / Math.max(rows - 1, 1));
  if (contrast <= 0) return { edgeSigmaPx: Infinity, contrast: 0, noise, psfSigmaPx: null, rows, limitedBy: 'no edge' };
  let norm = mean.map((v) => (v - lo) / (hi - lo));
  if (!(hi > lo)) norm = norm.map((x) => 1 - x);
  const cross = (level: number): number => {
    for (let i = 0; i < m - 1; i++) {
      const a = norm[i], b = norm[i + 1];
      if ((a - level) * (b - level) <= 0 && a !== b) return i + (level - a) / (b - a);
    }
    return m;
  };
  const psf = Math.max((cross(0.9) - cross(0.1)) / 2.563, 0.3);
  const cr = cramerRaoEdgePx(contrast, Math.max(noise, 1e-6), psf, rows);
  const q = quantumFloorEdgePx(contrast, Math.min(lo, hi), psf, rows, 1.0, sensor);
  return { edgeSigmaPx: Math.max(cr, q), cramerRaoPx: cr, quantumPx: q, contrast, noise, psfSigmaPx: psf, rows,
    limitedBy: cr >= q ? 'channel noise' : 'photon shot noise' };
}

/** Depth of an object behind the reference plane, from frames at different focus distances (see Python). */
export function solveParallax(frames: { raw_mm: number; sigma_mm: number; z_mm: number; group?: string }[],
  prior: [number, number] = PARALLAX_PRIOR_MM, maxDepthMm = 60.0, stepMm = 0.1) {
  const [mu0, s0] = prior;
  const groups = frames.map((f) => String(f.group ?? '_'));
  const names = Array.from(new Set(groups)).sort();
  const n = frames.length;
  const dof = n - names.length - 1;
  if (dof < 1 || new Set(frames.map((f) => Math.round(f.z_mm * 10) / 10)).size < 2) {
    return { depthMm: mu0, sigmaMm: s0, informative: 1.0, source: 'prior', scatterMm: null as number | null };
  }
  const grid: number[] = [];
  for (let k = 0; k * stepMm <= maxDepthMm + 1e-9; k++) grid.push(k * stepMm);
  const corrected = (d: number) => frames.map((f) => (f.raw_mm * (f.z_mm + d)) / f.z_mm);
  const groupChi2 = (vals: number[], w: number[]) => names.reduce((tot, g) => {
    const ix = groups.map((gi, i) => (gi === g ? i : -1)).filter((i) => i >= 0);
    const t = ix.reduce((a, i) => a + w[i] * vals[i], 0) / ix.reduce((a, i) => a + w[i], 0);
    return tot + ix.reduce((a, i) => a + w[i] * (vals[i] - t) ** 2, 0);
  }, 0);
  const posterior = (tau2: number): [number, number] => {
    const w = frames.map((f) => 1 / (f.sigma_mm ** 2 + tau2));
    const logp = grid.map((d) => -0.5 * groupChi2(corrected(d), w) - 0.5 * ((d - mu0) / s0) ** 2);
    const top = Math.max(...logp);
    const pw = logp.map((lp) => Math.exp(lp - top));
    const z = pw.reduce((a, b) => a + b, 0);
    const mean = grid.reduce((a, g, i) => a + g * pw[i], 0) / z;
    const v = grid.reduce((a, g, i) => a + (g - mean) ** 2 * pw[i], 0) / z;
    return [mean, Math.sqrt(Math.max(v, 1e-12))];
  };
  let tau2 = 0;
  let [mean, sd] = posterior(tau2);
  for (let it = 0; it < 5; it++) {
    const excess = groupChi2(corrected(mean), frames.map(() => 1)) / dof - frames.reduce((a, f) => a + f.sigma_mm ** 2, 0) / n;
    const nt = Math.max(0, excess);
    if (Math.abs(nt - tau2) < 1e-6) break;
    tau2 = nt;
    [mean, sd] = posterior(tau2);
  }
  return { depthMm: mean, sigmaMm: sd, informative: s0 / sd, source: 'posterior', scatterMm: Math.sqrt(tau2) };
}

// ─────────────────────────────────────────── what may leave a private store
export function errorStats(residuals: { estimator: string; lens?: string; log_err: number }[]) {
  const groups = new Map<string, number[]>();
  for (const r of residuals) {
    const k = `${r.estimator}\u0000${r.lens ?? ''}`;
    groups.set(k, [...(groups.get(k) ?? []), r.log_err]);
  }
  return Array.from(groups.keys()).sort().map((k) => {
    const [estimator, lens] = k.split('\u0000');
    const xs = groups.get(k)!;
    const n = xs.length;
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    const sd = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : null;
    return { schema: SCHEMA, kind: 'error_stat', estimator, lens, n, mean_log_err: round(mean, 6), sd_log_err: sd === null ? null : round(sd, 6) };
  });
}

/** Strip a record for sharing: personal standards never leave; scales drop basis/owner. */
export function publicView<T extends Record<string, unknown>>(record: T): Partial<T> | null {
  if (record.kind === 'local_standard' || record.privacy === 'personal') return null;
  if (record.kind === 'error_stat' || record.kind === 'ratio') return { ...record };
  const { basis: _b, owner: _o, evidence: _e, ...rest } = record;
  return rest as Partial<T>;
}
