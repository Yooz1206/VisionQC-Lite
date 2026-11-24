/* Reproducible batch evaluation — node src/evaluate.js [count] */
const fs = require('fs');
const path = require('path');
const V = require('./vision-core.js');

const COUNT = parseInt(process.argv[2] || '480', 10);
const SEED = 2026;

const dataset = V.makeDataset(COUNT, SEED);
const detectors = {
  'A_otsu_global': V.detectBaselineOtsu,
  'B_adaptive_local': V.detectBaselineAdaptive,
  'C_polar_no_filter': V.detectOursNoFilter,
  'D_ours_full': V.detectOurs,
};

const metrics = V.evaluate(dataset, detectors);

// per-defect-type breakdown for the proposed method
const byKind = {};
for (const img of dataset) {
  const k = img.meta.kind;
  if (k === 'normal') continue;
  byKind[k] = byKind[k] || { tp: 0, fp: 0, fn: 0, total: 0 };
  byKind[k].total++;
  const r = V.match(V.detectOurs(img).boxes, img.truth);
  byKind[k].tp += r.tp; byKind[k].fp += r.fp; byKind[k].fn += r.fn;
}
for (const k of Object.keys(byKind)) {
  const b = byKind[k];
  b.precision = +(b.tp / (b.tp + b.fp) || 0).toFixed(4);
  b.recall = +(b.tp / (b.tp + b.fn) || 0).toFixed(4);
}

// latency benchmark (CPU, single thread, excludes image generation)
const benchImgs = dataset.slice(0, 120);
const latency = {};
for (const name of Object.keys(detectors)) {
  const t0 = process.hrtime.bigint();
  for (const im of benchImgs) detectors[name](im);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / benchImgs.length;
  latency[name] = { msPerImage: +ms.toFixed(3), fps: +(1000 / ms).toFixed(1) };
}

const report = {
  project: 'VisionQC-Lite v1.0.0',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, imageSize: `${V.W}x${V.H}` },
  dataset: {
    count: COUNT, seed: SEED, source: 'procedurally synthesized washer images with pixel-level ground truth',
    composition: { normal: Math.floor(COUNT / 4), scratch: Math.floor(COUNT / 4), notch: Math.floor(COUNT / 4), stain: Math.floor(COUNT / 4) },
    lightingModes: ['uniform', 'linear_gradient', 'local_specular'],
    caveat: 'Synthetic data enables repeatable controlled comparison; real factory validation is a stated limitation.'
  },
  metrics,
  byKind,
  latency,
  matchingRule: 'A detection is TP if its box center lies within 7 px of a ground-truth defect center; each GT matched at most once.',
  ablation: {
    A: 'global Otsu threshold inside annulus + connected components (traditional baseline)',
    B: 'Cartesian local-background subtraction + connected components (no polar unwrapping)',
    C: 'polar unwrapping + background suppression, no angular-consistency filter',
    D: 'full method: circular blur + polar unwrapping + background suppression + angular-consistency filter'
  }
};

const out = path.join(__dirname, '..', 'reports', 'evaluation.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
