/**
 * Pure-function checks for the QUIPU temporal-spatial overlay on the
 * pixel-space lossy channel. Mirrors Bakugo tests/test_information.py
 * so the two ports cannot drift independently.
 *
 * Run: node test-pixel-space-channel.cjs
 */
'use strict';

const assert = require('assert');

const PHI_SQ_INTEGRAL = 1 / (2 * Math.sqrt(Math.PI));
const SENSE_WEIGHTS = {
  vision: 0.22,
  touch: 0.22,
  smell: 0.18,
  body: 0.12,
  brain: 0.12,
  perception: 0.14,
};
const TORUS_DIMS = 7;
const BOOST_MIN = 0.5;
const BOOST_MAX = 1.5;
const BOOST_NEUTRAL = 1.0;
const BODY_ROW_SCALE = 200;
const SMELL_PSF_FLOOR = 0.4;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function channelSnr(c) {
  return c.contrast / Math.max(c.noiseSigma, 1e-9);
}

function fisherInformationEdge(c) {
  if (c.contrast <= 0 || c.noiseSigma <= 0 || c.psfSigmaPx <= 0) return 0;
  const perRow =
    ((c.contrast * c.contrast) / (c.noiseSigma * c.noiseSigma)) *
    PHI_SQ_INTEGRAL /
    (c.psfSigmaPx * Math.max(c.pixelPitchPx, 1e-9));
  return perRow * Math.max(1, c.rows);
}

function cramerRaoEdgePx(c) {
  const info = fisherInformationEdge(c);
  return info <= 0 ? Number.POSITIVE_INFINITY : 1 / Math.sqrt(info);
}

function measureCoherence(signals) {
  const senses = Object.keys(SENSE_WEIGHTS);
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

function relationalGradient(signals, decay) {
  const touch = clamp01(signals.touch ?? 0);
  const resolvedDecay =
    decay === undefined ? 1 - clamp01(signals.smell ?? 0) : clamp01(decay);
  const activities = Object.keys(SENSE_WEIGHTS).map(s => clamp01(signals[s] ?? 0));
  const spread =
    activities.length === 0 ? 0 : Math.max(...activities) - Math.min(...activities);
  return clamp01((touch + resolvedDecay + spread) / 3);
}

function weylCentroid(signals, torusDims = TORUS_DIMS) {
  const dims = Math.max(1, torusDims);
  let sx = 0;
  let sy = 0;
  Object.keys(SENSE_WEIGHTS).forEach((sense, i) => {
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

function modulate(signals, opts = {}) {
  const filled = {};
  for (const k of Object.keys(SENSE_WEIGHTS)) filled[k] = clamp01(signals[k] ?? 0);
  const coherence = measureCoherence(filled);
  const gradient = relationalGradient(filled, opts.decay);
  const weyl = weylCentroid(filled);
  const potential = clamp01(opts.potential ?? 0);
  let raw = BOOST_NEUTRAL + (coherence - gradient) * 0.5;
  if (potential > 0) {
    raw = Math.max(raw, BOOST_NEUTRAL + 0.25 * potential);
  }
  const boost = Math.max(BOOST_MIN, Math.min(BOOST_MAX, raw));
  return {
    coherence,
    gradient,
    weyl,
    boost,
    periodFactor: 1 / boost,
    lrFactor: boost,
    signals: filled,
  };
}

function channelSenseSignals(c, opts = {}) {
  const vision = c.contrast / (c.contrast + Math.max(c.noiseSigma, 1e-9));
  const touch =
    opts.shotRatio === undefined
      ? Math.min(1, channelSnr(c) / (channelSnr(c) + 25))
      : 1 / (1 + Math.max(0, opts.shotRatio));
  const smell = 1 / (1 + Math.max(0, c.psfSigmaPx - SMELL_PSF_FLOOR));
  const rows = Math.max(1, c.rows);
  const body = rows / (rows + BODY_ROW_SCALE);
  const brain = opts.efficiency === undefined ? 0 : clamp01(opts.efficiency);
  const perception =
    opts.frameChi2Dof === undefined
      ? 0
      : 1 / (1 + Math.max(0, opts.frameChi2Dof - 1));
  return { vision, touch, smell, body, brain, perception };
}

function temporalSpatialRhythm(c, opts = {}) {
  const signals = channelSenseSignals(c, opts);
  const rhythm = modulate(signals, {
    decay: 1 - signals.smell,
    potential: opts.potential,
  });
  return { ...rhythm, effectiveRows: Math.max(1, c.rows) * rhythm.boost };
}

function recommendedEncodeQuality(rhythm, baseQuality = 0.85) {
  const q = baseQuality * (1.15 - 0.15 * rhythm.boost);
  return Math.max(0.55, Math.min(0.95, q));
}

function washSpatialRadius(radius, boost) {
  if (!(radius > 0) || !Number.isFinite(radius)) return radius;
  const b = Math.max(BOOST_MIN, Math.min(BOOST_MAX, boost));
  return radius / b;
}

function estimateChannelFromRgba(sample, opts = {}) {
  const w = Math.max(1, sample.width | 0);
  const h = Math.max(1, sample.height | 0);
  const data = sample.data;
  const n = Math.min(w * h, Math.floor(data.length / 4));
  if (n < 16) {
    return { contrast: 1, noiseSigma: 1, psfSigmaPx: 1, pixelPitchPx: opts.pixelPitchPx ?? 1, rows: Math.max(1, opts.rows ?? 1) };
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
  return {
    contrast: Math.max(p90 - p10, 1e-6),
    noiseSigma: 1,
    psfSigmaPx: 1,
    pixelPitchPx: opts.pixelPitchPx ?? 1,
    rows: Math.max(1, opts.rows ?? Math.min(w, h)),
  };
}

const BASE = { contrast: 80, noiseSigma: 4, psfSigmaPx: 1.2, pixelPitchPx: 1, rows: 400 };
const UNIFORM = {
  vision: 0.8, touch: 0.8, smell: 0.8, body: 0.8, brain: 0.8, perception: 0.8,
};
const ONE_HOT = {
  vision: 1, touch: 0, smell: 0, body: 0, brain: 0, perception: 0,
};

assert.ok(measureCoherence(UNIFORM) > 0.7, 'uniform high activity is coherent');
assert.ok(measureCoherence(ONE_HOT) < 0.15, 'one-hot activity is incoherent');

const r = modulate(UNIFORM);
assert.ok(r.boost >= 0.5 && r.boost <= 1.5, 'boost clamped');
assert.ok(Math.abs(r.periodFactor - 1 / r.boost) < 1e-9, 'period is 1/boost');
assert.ok(Math.abs(r.lrFactor - r.boost) < 1e-9, 'lr is boost');

const weyl = weylCentroid(UNIFORM);
assert.ok(weyl >= 0 && weyl <= 2 * Math.PI, 'weyl on the circle');
assert.strictEqual(weylCentroid({}), 0, 'empty weyl is 0');

const rawFisher = fisherInformationEdge(BASE);
const rhythm = temporalSpatialRhythm(BASE, { efficiency: 0.8, frameChi2Dof: 1 });
assert.strictEqual(fisherInformationEdge(BASE), rawFisher, 'boost does not change raw Fisher');
const fused = { ...BASE, rows: Math.max(1, Math.round(rhythm.effectiveRows)) };
if (Math.abs(rhythm.boost - 1) > 1e-9) {
  assert.notStrictEqual(fisherInformationEdge(fused), rawFisher, 'fusion rows do change Fisher');
}

const rawCrb = cramerRaoEdgePx(BASE);
const fusedCrb = cramerRaoEdgePx(fused);
const expected = rawCrb * Math.sqrt(BASE.rows / fused.rows);
assert.ok(Math.abs(fusedCrb - expected) / expected < 1e-6, 'fused CRB ~ 1/sqrt(effective rows)');

const highBlur = { touch: 0, smell: 0, vision: 0.5, body: 0.5, brain: 0.5, perception: 0.5 };
const sharp = { touch: 0, smell: 1, vision: 0.5, body: 0.5, brain: 0.5, perception: 0.5 };
assert.ok(relationalGradient(highBlur) > relationalGradient(sharp), 'blur raises wash');

const washedQ = recommendedEncodeQuality({ boost: 0.5 }, 0.85);
const coherentQ = recommendedEncodeQuality({ boost: 1.5 }, 0.85);
assert.ok(washedQ > coherentQ, 'wash keeps more encode bits');
assert.ok(washedQ <= 0.95 && coherentQ >= 0.55, 'quality stays in clamp');

assert.ok(Math.abs(washSpatialRadius(30, 1.5) - 20) < 1e-9, 'boost collapses torus');
assert.ok(Math.abs(washSpatialRadius(30, 0.5) - 60) < 1e-9, 'wash refuses to shrink torus');

const weightSum = Object.values(SENSE_WEIGHTS).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(weightSum - 1) < 1e-12, 'sense weights sum to 1');

const rgba = { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) };
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const v = x < 4 ? 20 : 220;
    const o = (y * 8 + x) * 4;
    rgba.data[o] = v;
    rgba.data[o + 1] = v;
    rgba.data[o + 2] = v;
    rgba.data[o + 3] = 255;
  }
}
const estimated = estimateChannelFromRgba(rgba, { rows: 8 });
assert.ok(estimated.contrast > 100, 'rgba estimator recovers a high-contrast step');
const canvasRhythm = temporalSpatialRhythm(estimated);
assert.ok(canvasRhythm.boost >= 0.5 && canvasRhythm.boost <= 1.5, 'canvas rhythm is a real boost');
assert.ok(
  recommendedEncodeQuality(canvasRhythm, 0.85) !== 0.85 || canvasRhythm.boost === 1,
  'canvas rhythm can move encode quality off the dummy'
);

console.log('pixel-space channel: %d assertions passed', 19);
