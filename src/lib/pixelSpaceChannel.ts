/**
 * Pixel-space lossy channel — Fisher / Cramér–Rao floor plus QUIPU rhythm.
 *
 * The imaging / OCR encode chain is a lossy channel:
 *
 *     true glyph / edge  →  optical blur  →  pixel sampling  →  noise
 *                        →  JPEG/WebP quantisation  →  data
 *
 * Information theory gives a hard lower bound (Cramér–Rao) on any unbiased
 * estimator of an edge or glyph position. QUIPU's temporal-spatial layer
 * then coordinates the channel observables as a six-sense rhythm:
 *
 *   coherence        weighted mean activity × (1 − normalised dispersion)
 *   relational wash  (touch + decay + spread) / 3
 *   weyl centroid    circular mean of sense angles on a 7-D torus
 *   boost            clamp(1 + (coherence − gradient) × 0.5, 0.5, 1.5)
 *
 * Boost never invents Fisher information. It only scales the *effective*
 * independent-sample count used when fusing repeated observations of the
 * same document — the same job QUIPU's period_factor does for cadence.
 *
 * Sense mapping (weights match QUIPU / Bakugo exactly):
 *   vision     contrast / (contrast + noise)          edge / glyph visibility
 *   touch      1 / (1 + shotRatio)                    photon corroboration
 *   smell      1 / (1 + extra blur above 0.4 px)      decay / wash
 *   body       rows / (rows + 200)                    coverage / mass
 *   brain      audit efficiency, else 0               estimator honesty
 *   perception 1 / (1 + chi2/dof − 1)                 multi-frame agreement
 *
 * @module lib/pixelSpaceChannel
 */

// ============================================
// Constants (shared with QUIPU temporal_spatiality / Bakugo information)
// ============================================

/** ∫ φ(u)² du over ℝ, φ the standard normal density. */
const PHI_SQ_INTEGRAL = 1 / (2 * Math.sqrt(Math.PI));

export const SENSE_WEIGHTS = {
  vision: 0.22,
  touch: 0.22,
  smell: 0.18,
  body: 0.12,
  brain: 0.12,
  perception: 0.14,
} as const;

export type SenseName = keyof typeof SENSE_WEIGHTS;

export const TORUS_DIMS = 7;
export const BOOST_MIN = 0.5;
export const BOOST_MAX = 1.5;
export const BOOST_NEUTRAL = 1.0;
const BODY_ROW_SCALE = 200;
const SMELL_PSF_FLOOR = 0.4;

// ============================================
// Channel types
// ============================================

/** Observables of one imaging / OCR encode pass. */
export interface ChannelConditions {
  /** Step height across the edge / glyph, grey levels. */
  contrast: number;
  /** Per-pixel noise, grey levels. */
  noiseSigma: number;
  /** Optical + motion + encode blur, pixels. */
  psfSigmaPx: number;
  /** 1.0 unless the image was downsampled. */
  pixelPitchPx: number;
  /** Independent samples along the edge (rows, or fused frames). */
  rows: number;
}

export interface SenseSignals {
  vision: number;
  touch: number;
  smell: number;
  body: number;
  brain: number;
  perception: number;
}

export interface TemporalSpatialRhythm {
  coherence: number;
  gradient: number;
  weyl: number;
  boost: number;
  periodFactor: number;
  lrFactor: number;
  signals: SenseSignals;
  effectiveRows: number;
}

export interface ChannelAudit {
  boundPx: number;
  fisher: number;
  snr: number;
  physicallyPossible: boolean;
  efficiency: number;
  channel: ChannelConditions;
  rhythm: TemporalSpatialRhythm;
  fusedBoundPx: number;
  advice: string[];
}

export interface CompressionChannelHint {
  /** JPEG / WebP quality actually used, 0–1. */
  quality: number;
  /** Downsample factor relative to the source (≤ 1). */
  scale: number;
  /** Encoded bytes / source bytes. */
  ratio: number;
}

/** Packed RGBA (or RGBX) buffer used to estimate a pre-encode channel. */
export interface RgbaSample {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

// ============================================
// Fisher / Cramér–Rao
// ============================================

export function channelSnr(c: ChannelConditions): number {
  return c.contrast / Math.max(c.noiseSigma, 1e-9);
}

/**
 * Fisher information about edge / glyph position, in 1/px².
 *
 * I = N × (C² / σ_n²) × ∫φ² / (σ_p × Δ)
 */
export function fisherInformationEdge(c: ChannelConditions): number {
  if (c.contrast <= 0 || c.noiseSigma <= 0 || c.psfSigmaPx <= 0) return 0;
  const perRow =
    ((c.contrast * c.contrast) / (c.noiseSigma * c.noiseSigma)) *
    PHI_SQ_INTEGRAL /
    (c.psfSigmaPx * Math.max(c.pixelPitchPx, 1e-9));
  return perRow * Math.max(1, c.rows);
}

/** Lower bound on the SE of ANY unbiased edge estimator, px. */
export function cramerRaoEdgePx(c: ChannelConditions): number {
  const info = fisherInformationEdge(c);
  return info <= 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(info);
}

// ============================================
// Temporal-spatial interactions (QUIPU port)
// ============================================

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampBoost(v: number): number {
  return Math.max(BOOST_MIN, Math.min(BOOST_MAX, v));
}

/** Joint activity × (1 − normalised dispersion), in [0, 1]. */
export function measureCoherence(signals: Partial<SenseSignals>): number {
  const senses = Object.keys(SENSE_WEIGHTS) as SenseName[];
  const activities = senses.map(s => clamp01(signals[s] ?? 0));
  const weights = senses.map(s => SENSE_WEIGHTS[s]);
  const meanA = activities.reduce((acc, a, i) => acc + a * weights[i], 0);
  if (meanA <= 0) return 0;
  const variance = activities.reduce(
    (acc, a, i) => acc + weights[i] * (a - meanA) ** 2,
    0
  );
  const normDisp = Math.min(1, Math.sqrt(variance) / Math.max(meanA, 1e-9));
  return clamp01(meanA * (1 - normDisp));
}

/**
 * Synaptic-wash damper: (touch + decay + spread) / 3, in [0, 1].
 * `decay` defaults to 1 − smell (extra blur as stale / washed signal).
 */
export function relationalGradient(
  signals: Partial<SenseSignals>,
  decay?: number
): number {
  const touch = clamp01(signals.touch ?? 0);
  const resolvedDecay =
    decay === undefined ? 1 - clamp01(signals.smell ?? 0) : clamp01(decay);
  const activities = (Object.keys(SENSE_WEIGHTS) as SenseName[]).map(s =>
    clamp01(signals[s] ?? 0)
  );
  const spread =
    activities.length === 0 ? 0 : Math.max(...activities) - Math.min(...activities);
  return clamp01((touch + resolvedDecay + spread) / 3);
}

/**
 * Circular mean of sense angles on the first n of `torusDims`, in [0, 2π].
 * Empty activity returns 0.
 */
export function weylCentroid(
  signals: Partial<SenseSignals>,
  torusDims = TORUS_DIMS
): number {
  const dims = Math.max(1, torusDims);
  let sx = 0;
  let sy = 0;
  (Object.keys(SENSE_WEIGHTS) as SenseName[]).forEach((sense, i) => {
    const theta = 2 * Math.PI * (i / dims);
    const a = clamp01(signals[sense] ?? 0);
    sx += a * Math.cos(theta);
    sy += a * Math.sin(theta);
  });
  if (sx === 0 && sy === 0) return 0;
  let mean = Math.atan2(sy, sx);
  if (mean < 0) mean += 2 * Math.PI;
  return mean;
}

/**
 * Combine coherence, wash, and Weyl into the QUIPU rhythm.
 * `boost = clamp(1 + (coherence − gradient) × 0.5, 0.5, 1.5)`,
 * with recursive-strengthening floor `1 + 0.25 × potential`.
 */
export function modulate(
  signals: Partial<SenseSignals>,
  opts: { decay?: number; potential?: number } = {}
): Omit<TemporalSpatialRhythm, 'effectiveRows'> {
  const filled: SenseSignals = {
    vision: clamp01(signals.vision ?? 0),
    touch: clamp01(signals.touch ?? 0),
    smell: clamp01(signals.smell ?? 0),
    body: clamp01(signals.body ?? 0),
    brain: clamp01(signals.brain ?? 0),
    perception: clamp01(signals.perception ?? 0),
  };
  const coherence = measureCoherence(filled);
  const gradient = relationalGradient(filled, opts.decay);
  const weyl = weylCentroid(filled);
  const potential = clamp01(opts.potential ?? 0);
  // Zero potential must not pin boost at 1.0 — that would disable wash.
  let raw = BOOST_NEUTRAL + (coherence - gradient) * 0.5;
  if (potential > 0) {
    raw = Math.max(raw, BOOST_NEUTRAL + 0.25 * potential);
  }
  const boost = clampBoost(raw);
  return {
    coherence: round4(coherence),
    gradient: round4(gradient),
    weyl: round4(weyl),
    boost: round4(boost),
    periodFactor: round4(1 / boost),
    lrFactor: round4(boost),
    signals: {
      vision: round4(filled.vision),
      touch: round4(filled.touch),
      smell: round4(filled.smell),
      body: round4(filled.body),
      brain: round4(filled.brain),
      perception: round4(filled.perception),
    },
  };
}

/** Project a measured imaging channel onto the six QUIPU sense slots. */
export function channelSenseSignals(
  c: ChannelConditions,
  opts: {
    efficiency?: number;
    shotRatio?: number;
    frameChi2Dof?: number;
  } = {}
): SenseSignals {
  const vision = c.contrast / (c.contrast + Math.max(c.noiseSigma, 1e-9));
  const touch =
    opts.shotRatio === undefined
      ? Math.min(1, channelSnr(c) / (channelSnr(c) + 25))
      : 1 / (1 + Math.max(0, opts.shotRatio));
  const smell = 1 / (1 + Math.max(0, c.psfSigmaPx - SMELL_PSF_FLOOR));
  const rows = Math.max(1, c.rows);
  const body = rows / (rows + BODY_ROW_SCALE);
  const brain =
    opts.efficiency === undefined ? 0 : clamp01(opts.efficiency);
  const perception =
    opts.frameChi2Dof === undefined
      ? 0
      : 1 / (1 + Math.max(0, opts.frameChi2Dof - 1));
  return {
    vision: clamp01(vision),
    touch: clamp01(touch),
    smell: clamp01(smell),
    body: clamp01(body),
    brain,
    perception: clamp01(perception),
  };
}

/**
 * Rhythm for one measured channel, plus the wash-adjusted row count.
 * `effectiveRows = rows × boost`. Boost ∈ [0.5, 1.5] so a washed channel
 * cannot claim the full 1/√N the CRB would otherwise grant.
 */
export function temporalSpatialRhythm(
  c: ChannelConditions,
  opts: {
    efficiency?: number;
    shotRatio?: number;
    frameChi2Dof?: number;
    potential?: number;
  } = {}
): TemporalSpatialRhythm {
  const signals = channelSenseSignals(c, opts);
  const rhythm = modulate(signals, {
    decay: 1 - signals.smell,
    potential: opts.potential,
  });
  return {
    ...rhythm,
    effectiveRows: Math.max(1, c.rows) * rhythm.boost,
  };
}

export function applyRhythmToChannel(
  c: ChannelConditions,
  rhythm: TemporalSpatialRhythm
): ChannelConditions {
  return { ...c, rows: Math.max(1, Math.round(rhythm.effectiveRows)) };
}

/**
 * Inverse-variance blend of repeated channel measurements of one edge.
 * Independence is then discounted by `temporalSpatialRhythm`, not here.
 */
export function fuseChannelConditions(
  channels: ChannelConditions[]
): ChannelConditions | null {
  const usable = channels.filter(c => c.noiseSigma > 0 && c.rows > 0);
  if (usable.length === 0) return null;
  const weights = usable.map(c => c.rows / (c.noiseSigma * c.noiseSigma));
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return null;
  const wavg = (getter: (c: ChannelConditions) => number) =>
    usable.reduce((acc, c, i) => acc + getter(c) * weights[i], 0) / wsum;
  return {
    contrast: wavg(c => c.contrast),
    noiseSigma: Math.sqrt(wavg(c => c.noiseSigma * c.noiseSigma)),
    psfSigmaPx: wavg(c => c.psfSigmaPx),
    pixelPitchPx: wavg(c => c.pixelPitchPx),
    rows: usable.reduce((acc, c) => acc + Math.max(1, c.rows), 0),
  };
}

// ============================================
// Encode-aware channel + audit
// ============================================

/**
 * Approximate the extra blur and noise a lossy encode adds.
 *
 * JPEG / WebP quantisation is a low-pass plus a correlated residual.
 * Quality 1.0 / scale 1.0 / ratio 1.0 leaves the optical channel alone;
 * aggressive downsample and low quality inflate PSF and noise so the
 * CRB (correctly) gets worse.
 */
export function applyCompressionToChannel(
  optical: ChannelConditions,
  hint: CompressionChannelHint
): ChannelConditions {
  const quality = clamp01(hint.quality);
  const scale = Math.max(1e-6, Math.min(1, hint.scale));
  const ratio = Math.max(1e-6, Math.min(1, hint.ratio));
  const quantBlur = 0.35 * (1 - quality) / scale;
  const quantNoise = optical.noiseSigma * (1 + 0.8 * (1 - quality) + 0.4 * (1 - ratio));
  return {
    contrast: optical.contrast * (0.55 + 0.45 * quality),
    noiseSigma: quantNoise,
    psfSigmaPx: optical.psfSigmaPx / scale + quantBlur,
    pixelPitchPx: optical.pixelPitchPx / scale,
    rows: Math.max(1, Math.round(optical.rows * scale)),
  };
}

/**
 * Compare a reported localisation uncertainty against the CRB, then
 * attach the QUIPU rhythm so fusion credit can be washed.
 */
export function auditChannel(
  channel: ChannelConditions,
  reportedSigmaPx: number,
  opts: {
    shotRatio?: number;
    frameChi2Dof?: number;
    potential?: number;
  } = {}
): ChannelAudit {
  const fisher = fisherInformationEdge(channel);
  const boundPx = cramerRaoEdgePx(channel);
  const possible = reportedSigmaPx >= boundPx * 0.98;
  const efficiency =
    reportedSigmaPx > 0 && Number.isFinite(boundPx)
      ? Math.min(1, boundPx / reportedSigmaPx)
      : 0;
  const rhythm = temporalSpatialRhythm(channel, {
    ...opts,
    efficiency,
  });
  const fusedBoundPx = cramerRaoEdgePx(applyRhythmToChannel(channel, rhythm));
  const advice: string[] = [];

  if (!possible) {
    advice.push(
      'the reported error bar is smaller than any estimator can achieve on this image; treat the measurement as unvalidated'
    );
  } else if (efficiency > 0.5) {
    advice.push(
      'the detector is near the information limit. Better code will not help; only a better photograph will.'
    );
  } else if (efficiency > 0.05) {
    advice.push(
      `the detector is using about ${(efficiency * 100).toFixed(0)}% of the available photon information`
    );
  } else {
    advice.push(
      'reported uncertainty is far above the photon floor. The limit is the specimen (ink, paper, print wander), not the capture.'
    );
  }

  if (rhythm.boost < 0.85) {
    advice.push(
      `temporal-spatial wash is active (boost ${rhythm.boost.toFixed(2)}, coherence ${rhythm.coherence.toFixed(2)} vs gradient ${rhythm.gradient.toFixed(2)}); do not credit the full 1/√N from extra rows or frames`
    );
  } else if (rhythm.coherence > 0.6 && rhythm.boost > 1.05) {
    advice.push(
      `channel observables are coherent (weyl ${rhythm.weyl.toFixed(2)} rad, boost ${rhythm.boost.toFixed(2)}); extra frames can tighten the fusion bound, but not the single-shot CRB`
    );
  }

  return {
    boundPx,
    fisher,
    snr: channelSnr(channel),
    physicallyPossible: possible,
    efficiency,
    channel,
    rhythm,
    fusedBoundPx,
    advice,
  };
}

/**
 * Recommended JPEG / WebP quality given the current rhythm.
 *
 * High wash (boost < 1) keeps more bits — the channel is already
 * disagreeing, so further quantisation would throw away the remaining
 * independent samples. High coherence can drop quality slightly because
 * the fusion bound, not the encode, is what will tighten next.
 */
export function recommendedEncodeQuality(
  rhythm: TemporalSpatialRhythm,
  baseQuality = 0.85
): number {
  const q = baseQuality * (1.15 - 0.15 * rhythm.boost);
  return Math.max(0.55, Math.min(0.95, q));
}

/**
 * Scale a torus / jitter radius by the wash. Boost > 1 collapses the
 * uncertainty band; boost < 1 refuses to let a disagreeing channel
 * shrink the neighbourhood.
 */
export function washSpatialRadius(radius: number, boost: number): number {
  if (!(radius > 0) || !Number.isFinite(radius)) return radius;
  return radius / clampBoost(boost);
}

/**
 * Estimate optical channel observables from a packed RGBA buffer.
 *
 * Contrast is the 10–90 luminance span; noise is the MAD of neighbour
 * differences; blur is recovered from the 10–90 rise of the stronger
 * axis profile. Used by encode so callers that omit a rhythm still
 * breathe JPEG/WebP quality from the actual canvas, not a dummy boost.
 */
export function estimateChannelFromRgba(
  sample: RgbaSample,
  opts: { pixelPitchPx?: number; rows?: number } = {}
): ChannelConditions {
  const w = Math.max(1, sample.width | 0);
  const h = Math.max(1, sample.height | 0);
  const data = sample.data;
  const n = Math.min(w * h, Math.floor(data.length / 4));
  if (n < 16) {
    return {
      contrast: 1,
      noiseSigma: 1,
      psfSigmaPx: 1,
      pixelPitchPx: opts.pixelPitchPx ?? 1,
      rows: Math.max(1, opts.rows ?? 1),
    };
  }

  const luma = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    luma[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }

  const sorted = Float64Array.from(luma);
  sorted.sort();
  const p10 = sorted[Math.floor(0.10 * (n - 1))];
  const p90 = sorted[Math.floor(0.90 * (n - 1))];
  const contrast = Math.max(p90 - p10, 1e-6);

  const diffs: number[] = [];
  const stride = Math.max(1, Math.floor(w / 64));
  for (let y = 1; y < h; y += stride) {
    for (let x = 1; x < w; x += stride) {
      const i = y * w + x;
      if (i >= n) continue;
      diffs.push(Math.abs(luma[i] - luma[i - 1]));
      diffs.push(Math.abs(luma[i] - luma[i - w]));
    }
  }
  diffs.sort((a, b) => a - b);
  const mid = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 1;
  const noiseSigma = Math.max(mid * 1.4826, 0.5);

  const col = new Float64Array(w);
  const row = new Float64Array(h);
  const colN = new Uint32Array(w);
  const rowN = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (i >= n) continue;
      col[x] += luma[i];
      colN[x] += 1;
      row[y] += luma[i];
      rowN[y] += 1;
    }
  }
  for (let x = 0; x < w; x++) col[x] = colN[x] ? col[x] / colN[x] : 0;
  for (let y = 0; y < h; y++) row[y] = rowN[y] ? row[y] / rowN[y] : 0;
  const rise = Math.max(profileRise(col), profileRise(row));
  const psfSigmaPx = rise > 0 ? Math.max(0.4, rise / 2.563) : 1.0;

  return {
    contrast,
    noiseSigma,
    psfSigmaPx,
    pixelPitchPx: Math.max(opts.pixelPitchPx ?? 1, 1e-9),
    rows: Math.max(1, opts.rows ?? Math.min(w, h)),
  };
}

/** Rhythm from a canvas / ImageData sample of the image about to be encoded. */
export function rhythmFromRgba(
  sample: RgbaSample,
  opts: { pixelPitchPx?: number; rows?: number } = {}
): TemporalSpatialRhythm {
  return temporalSpatialRhythm(estimateChannelFromRgba(sample, opts));
}

function profileRise(profile: ArrayLike<number>): number {
  if (profile.length < 4) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < profile.length; i++) {
    const v = profile[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  if (span < 2) return 0;
  const t10 = lo + 0.1 * span;
  const t90 = lo + 0.9 * span;
  let i10 = -1;
  let i90 = -1;
  for (let i = 0; i < profile.length; i++) {
    if (i10 < 0 && profile[i] >= t10) i10 = i;
    if (profile[i] >= t90) {
      i90 = i;
      break;
    }
  }
  return i10 >= 0 && i90 >= 0 ? Math.abs(i90 - i10) : 0;
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
