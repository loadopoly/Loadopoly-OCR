/**
 * Parity gate: the TypeScript port must reproduce the canonical Python
 * golden vectors (Metrology/golden_vectors.json, synced into
 * src/lib/__fixtures__/metrology_golden.json).
 *
 * Run: npm run test:metrology   (node --experimental-strip-types)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pm from './src/lib/photoMetrology.ts';

const gv = JSON.parse(readFileSync(new URL('./src/lib/__fixtures__/metrology_golden.json', import.meta.url), 'utf8'));
const c = gv.cases;
const close = (a, b, label, rel = 1e-9) =>
  assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${label}: ${a} vs ${b}`);
let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log(`ok ${n} - ${name}`); };

check('schema', () => assert.equal(gv.schema, pm.SCHEMA));

const key = await pm.photoKey(c.photo_key.in);
check('photoKey', () => assert.equal(key, c.photo_key.out));

check('scaleFromExif', () => {
  const s = pm.scaleFromExif(...c.scale_from_exif.in);
  close(s.lnMmPerPx, c.scale_from_exif.out.ln, 'ln');
  close(s.sigmaLn, c.scale_from_exif.out.sigma_ln, 'sigma');
});

const span = () => {
  const [L, sl, px, ps] = c.scale_from_span.in;
  return pm.scaleFromSpan(L, sl, px, ps, { sourceClass: 'measured', basis: 'std' });
};

check('scaleFromSpan', () => {
  const s = span();
  close(s.lnMmPerPx, c.scale_from_span.out.ln, 'ln');
  close(s.sigmaLn, c.scale_from_span.out.sigma_ln, 'sigma');
});

check('fuse', () => {
  const f = pm.fuse([span(), pm.scaleFromExif(3072, 4080, 12, 0.088)]);
  close(f.scale.lnMmPerPx, c.fuse.out.ln, 'ln');
  close(f.scale.sigmaLn, c.fuse.out.sigma_ln, 'sigma');
  close(f.chi2Red, c.fuse.out.chi2_red, 'chi2');
});

check('measure', () => {
  const L = pm.measure(span(), ...c.measure.in);
  close(L.mm, c.measure.out.mm, 'mm');
  close(L.sigmaLn, c.measure.out.sigma_ln, 'sigma');
});

check('relational', () => {
  const r = pm.relational(...c.relational.in);
  close(r.ratio, c.relational.out.ratio, 'ratio');
  close(r.sigmaLn, c.relational.out.sigma_ln, 'sigma');
});

check('tapeSpan', () => {
  const t = c.tape_span.in;
  const r = pm.tapeSpan(t.ticks, t.a, t.b, t.edge_sigma_px);
  close(r.span, c.tape_span.out.span, 'span', 1e-8);
  close(r.sigma, c.tape_span.out.sigma, 'sigma', 1e-6);
});

check('gridScale', () => {
  const g = c.grid_scale.in;
  const r = pm.gridScale(g.points, g.indices, g.pitch, { unit: g.unit });
  close(r.scale.lnMmPerPx, c.grid_scale.out.ln, 'ln', 1e-8);
  close(r.scale.sigmaLn, c.grid_scale.out.sigma_ln, 'sigma', 1e-3);
});

check('transferOffsets', () => {
  const t = pm.transferOffsets(c.transfer_offsets.in);
  for (const [k, v] of Object.entries(c.transfer_offsets.out)) close(t.factors[k], v, k, 1e-6);
});

check('cramerRaoEdgePx', () => close(pm.cramerRaoEdgePx(...c.cramer_rao_edge_px.in), c.cramer_rao_edge_px.out, 'cr'));
check('quantumFloorEdgePx', () => close(pm.quantumFloorEdgePx(...c.quantum_floor_edge_px.in), c.quantum_floor_edge_px.out, 'sql'));
check('planckFloor', () => {
  close(pm.planckFloor(span(), 0.8).mm, c.planck_floor.out, 'floor');
  assert.equal(pm.planckFloor(span(), 1e-60).mm, pm.PLANCK_LENGTH_MM);
});
check('interstitialGap', () => {
  const g = pm.interstitialGap(...c.interstitial_gap.in, span());
  close(g.gapMm, c.interstitial_gap.out.gap_mm, 'gap'); close(g.sigmaMm, c.interstitial_gap.out.sigma_mm, 'sigma');
});
check('interstitialArc', () => {
  const a = pm.interstitialArc(c.interstitial_arc.in);
  close(a.cPv, c.interstitial_arc.out.c_pv, 'pv'); close(a.cVt, c.interstitial_arc.out.c_vt, 'vt');
  close(a.cPt, c.interstitial_arc.out.c_pt, 'pt'); close(a.interstitial, c.interstitial_arc.out.interstitial, 'arc');
  assert.equal(a.routed, false);
});
check('centering', () => {
  const r = pm.centering(...c.centering.in, { scale: span() });
  for (const [k, v] of Object.entries(c.centering.out)) close(r[k], v, k);
});
check('gradingComponent', () => {
  const s = span();
  const L = pm.gradingComponent('corners', 'top_left.wear', 25.0, 0.7, s);
  const A = pm.gradingComponent('surface', 'scratch.area', 400.0, 0.7, s, { area: true });
  close(L.value, c.grading_component.out.length[0], 'len'); close(L.sigma, c.grading_component.out.length[1], 'len σ');
  close(A.value, c.grading_component.out.area[0], 'area'); close(A.sigma, c.grading_component.out.area[1], 'area σ');
  assert.throws(() => pm.gradingComponent('centering', 'x', 1, 1, s));
});

check('paramsFromStats', () => {
  const inp = c.params_from_stats.in;
  const p = pm.paramsFromStats(inp.stats, inp.grid_fit);
  const e = c.params_from_stats.out.exif24;
  close(p.exif['24'].bias_ln, e.bias_ln, 'bias'); close(p.exif['24'].sigma_ln, e.sigma_ln, 'sigma');
  close(pm.gridK(p), c.params_from_stats.out.grid_k, 'k');
  const learned = pm.exifParams(24, p);
  const deb = pm.scaleFromExif(3072, 4080, 24, 0.135, learned.sigmaLn, learned.biasLn);
  close(pm.scaleFromExif(3072, 4080, 24, 0.135).lnMmPerPx - deb.lnMmPerPx, e.bias_ln, 'debias');
});
check('solveParallax', () => {
  const r = pm.solveParallax(c.solve_parallax.in);
  close(r.depthMm, c.solve_parallax.out.depth_mm, 'depth', 1e-6); close(r.sigmaMm, c.solve_parallax.out.sigma_mm, 'sd', 1e-6);
});
check('edgeSigmaFromProfiles', () => {
  const r = pm.edgeSigmaFromProfiles(c.edge_sigma_from_profiles.in);
  const o = c.edge_sigma_from_profiles.out;
  close(r.edgeSigmaPx, o.edge_sigma_px, 'edge'); close(r.contrast, o.contrast, 'contrast'); close(r.psfSigmaPx, o.psf_sigma_px, 'psf');
});

check('tile never converts', () => assert.throws(() => pm.toMm(1, 'tile'), /tile/));

check('publicView blocks personal standards', () => {
  assert.equal(pm.publicView({ kind: 'local_standard', owner: 'x', value_mm: 15 }), null);
  const pub = pm.publicView({ kind: 'scale', basis: 'standard:x:finger', owner: 'x', mm_per_px: 0.04 });
  assert.deepEqual(pub, { kind: 'scale', mm_per_px: 0.04 });
});

console.log(`\n${n} checks passed (parity with holon.metrology/1 ${gv.version})`);
