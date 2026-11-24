/* VisionQC-Lite core algorithm — dependency-free (Node + browser UMD) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const W = 128, H = 128, CX = 64, CY = 64, R0 = 22, R1 = 52;
  const PW = 360, PH = 30; // polar: angle columns x radius rows

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function illumination(x, y, mode) {
    if (mode === 1) return 45 * (x / W) - 22;                    // linear gradient
    if (mode === 2) return 42 * Math.exp(-(((x - 34) ** 2 + (y - 92) ** 2) / 650)); // specular
    return 0;                                                     // uniform
  }

  function generateImage(seed, cfg) {
    cfg = cfg || {};
    const rnd = mulberry32(seed);
    const mode = cfg.lightMode == null ? (seed % 3) : cfg.lightMode; // 0/1/2
    const kind = cfg.kind || 'normal'; // normal | scratch | notch | stain
    const g = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - CX + 0.5, dy = y - CY + 0.5;
        const d = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx);
        let base;
        if (d < R0) base = 88 + 5 * Math.sin(ang * 3);
        else if (d > R1) base = 104 + 3 * Math.cos(x * 0.2);
        else base = 172 + 7 * Math.sin(ang * 9) + 4 * Math.cos(d * 0.9);
        const noise = (rnd() + rnd() + rnd() - 1.5) * 6;
        g[y * W + x] = clamp(Math.round(base + illumination(x, y, mode) + noise), 0, 255);
      }
    }
    const truth = [];
    const delta = new Float32Array(W * H); // most-negative applied once per pixel
    const track = { minX: 1e9, minY: 1e9, maxX: -1, maxY: -1, n: 0 };
    function mark(x, y, d) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x;
      if (d < delta[i]) delta[i] = d;
      if (x < track.minX) track.minX = x; if (x > track.maxX) track.maxX = x;
      if (y < track.minY) track.minY = y; if (y > track.maxY) track.maxY = y;
      track.n++;
    }
    function finish(t) {
      if (track.n > 0) truth.push({ type: t, bbox: [track.minX, track.minY, track.maxX, track.maxY], n: track.n });
      track.minX = 1e9; track.minY = 1e9; track.maxX = -1; track.maxY = -1; track.n = 0;
    }

    if (kind === 'scratch' || kind === 'stain') {
      const a0 = rnd() * Math.PI * 2;
      const rc = 28 + rnd() * 16;
      if (kind === 'scratch') {
        const span = 0.22 + rnd() * 0.28;
        const width = 1.2 + rnd() * 1.0;
        const depth = 46 + rnd() * 28;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
          let ang = Math.atan2(dy, dx);
          let da = ang - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
          if (Math.abs(da) <= span / 2 && Math.abs(r - rc) <= width) mark(x, y, -depth);
        }
      } else {
        const rad = 3.2 + rnd() * 2.6;
        const cx = CX + rc * Math.cos(a0), cy = CY + rc * Math.sin(a0);
        for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
          for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= rad) mark(x, y, -42 * (1 - d / (rad + 0.6)));
          }
        }
      }
      finish(kind);
    } else if (kind === 'notch') {
      const a0 = rnd() * Math.PI * 2, span = 0.10 + rnd() * 0.08;
      const depth = 3 + rnd() * 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
        let ang = Math.atan2(dy, dx);
        let da = ang - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) <= span / 2 && r >= R1 - depth && r <= R1) mark(x, y, -72);
      }
      finish('notch');
    }
    for (let i = 0; i < g.length; i++) if (delta[i] < 0) g[i] = clamp(Math.round(g[i] + delta[i]), 0, 255);
    return { w: W, h: H, gray: g, truth, meta: { seed, mode, kind } };
  }

  // row-major: index = r * PW + c  (r = radius row, c = angle column)
  function polarUnwrap(img) {
    const out = new Float32Array(PW * PH);
    const g = img.gray;
    for (let c = 0; c < PW; c++) {
      const a = (c / PW) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 0; r < PH; r++) {
        const rr = R0 + r * ((R1 - R0) / PH);
        const x = Math.round(CX + rr * ca), y = Math.round(CY + rr * sa);
        out[r * PW + c] = g[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)];
      }
    }
    return out;
  }

  function boxBlur(src, w, h, kw, kh) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const hw = kw >> 1, hh = kh >> 1;
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -hw; k <= hw; k++) sum += src[y * w + clamp(k, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / kw;
        sum += src[y * w + clamp(x + hw + 1, 0, w - 1)] - src[y * w + clamp(x - hw, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -hh; k <= hh; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / kh;
        sum += tmp[clamp(y + hh + 1, 0, h - 1) * w + x] - tmp[clamp(y - hh, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  function boxBlurCircular(src, w, h, kw, kh) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const hw = kw >> 1, hh = kh >> 1;
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -hw; k <= hw; k++) sum += src[y * w + ((k % w) + w) % w];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / kw;
        sum += src[y * w + ((x + hw + 1) % w)] - src[y * w + ((x - hw) % w + w) % w];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -hh; k <= hh; k++) sum += tmp[clamp(k, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / kh;
        sum += tmp[clamp(y + hh + 1, 0, h - 1) * w + x] - tmp[clamp(y - hh, 0, h - 1) * w + x];
      }
    }
    return out;
  }

  function connectedComponents(mask, w, h) {
    const seen = new Uint8Array(w * h), comps = [], stack = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
      stack.length = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p / w) | 0;
        area++; if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      comps.push({ minX, minY, maxX, maxY, area });
    }
    return comps;
  }

  function polarBoxToCartesian(minC, minR, maxC, maxR) {
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let c = minC; c <= maxC; c += Math.max(1, Math.floor((maxC - minC) / 6) || 1)) {
      for (let r = minR; r <= maxR; r++) {
        const a = (c / PW) * Math.PI * 2, rr = R0 + r * ((R1 - R0) / PH);
        const x = CX + rr * Math.cos(a), y = CY + rr * Math.sin(a);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return [Math.floor(minX - 1), Math.floor(minY - 1), Math.ceil(maxX + 1), Math.ceil(maxY + 1)];
  }

  function detectOurs(img) {
    const polar = polarUnwrap(img);
    const smooth = boxBlurCircular(polar, PW, PH, 3, 3);
    const bg = boxBlurCircular(smooth, PW, PH, 61, 15);
    const residual = Float32Array.from(smooth, (v, i) => bg[i] - v);
    const mask = new Uint8Array(PW * PH);
    // ignore outer 2 radial rows to avoid ring-boundary bias
    for (let r = 2; r < PH - 2; r++) for (let c = 0; c < PW; c++) {
      mask[r * PW + c] = residual[r * PW + c] > 12 ? 1 : 0;
    }
    const comps = connectedComponents(mask, PW, PH);
    const out = [];
    for (const c of comps) {
      const angleSpan = c.maxX - c.minX + 1, radialSpan = c.maxY - c.minY + 1;
      // angular elongation: real defects span multiple adjacent angle columns
      if (c.area < 5 || angleSpan < 4 || radialSpan < 1 || radialSpan > 14) continue;
      let peak = -1e9;
      for (let rr = c.minY; rr <= c.maxY; rr++) for (let cc = c.minX; cc <= c.maxX; cc++) {
        const v = residual[rr * PW + cc]; if (v > peak) peak = v;
      }
      if (peak < 20) continue;
      out.push({ bbox: polarBoxToCartesian(c.minX, c.minY, c.maxX, c.maxY), area: c.area, peak: +peak.toFixed(1) });
    }
    return { boxes: out, polar, residual };
  }

  // ablation: polar unwrap + background suppression, WITHOUT angular-consistency filter
  function detectOursNoFilter(img) {
    const polar = polarUnwrap(img);
    const smooth = boxBlurCircular(polar, PW, PH, 3, 3);
    const bg = boxBlurCircular(smooth, PW, PH, 61, 15);
    const residual = Float32Array.from(smooth, (v, i) => bg[i] - v);
    const mask = new Uint8Array(PW * PH);
    for (let r = 2; r < PH - 2; r++) for (let c = 0; c < PW; c++) mask[r * PW + c] = residual[r * PW + c] > 12 ? 1 : 0;
    const out = connectedComponents(mask, PW, PH).filter(c => c.area >= 3)
      .map(c => ({ bbox: polarBoxToCartesian(c.minX, c.minY, c.maxX, c.maxY), area: c.area }));
    return { boxes: out, residual };
  }

  function detectBaselineOtsu(img) {
    const g = img.gray, hist = new Float64Array(256);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - CX, y - CY);
      if (d >= R0 && d <= R1) hist[g[y * W + x]]++;
    }
    let total = 0, sum = 0;
    for (let t = 0; t < 256; t++) { total += hist[t]; sum += t * hist[t]; }
    let wB = 0, sumB = 0, best = -1, thr = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - CX, y - CY);
      mask[y * W + x] = (d >= R0 && d <= R1 && g[y * W + x] < thr) ? 1 : 0;
    }
    return { boxes: connectedComponents(mask, W, H).filter(c => c.area >= 3).map(c => ({ bbox: [c.minX, c.minY, c.maxX, c.maxY], area: c.area })), threshold: thr };
  }

  function detectBaselineAdaptive(img) {
    const g = Float32Array.from(img.gray);
    const bg = boxBlur(g, W, H, 25, 25);
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - CX, y - CY);
      const i = y * W + x;
      mask[i] = (d >= R0 && d <= R1 && bg[i] - g[i] > 18) ? 1 : 0;
    }
    return { boxes: connectedComponents(mask, W, H).filter(c => c.area >= 3).map(c => ({ bbox: [c.minX, c.minY, c.maxX, c.maxY], area: c.area })) };
  }

  function match(predBoxes, truth) {
    const used = new Set(); let tp = 0;
    for (const t of truth) {
      const tx = (t.bbox[0] + t.bbox[2]) / 2, ty = (t.bbox[1] + t.bbox[3]) / 2;
      let best = -1, bd = 1e9;
      for (let i = 0; i < predBoxes.length; i++) {
        if (used.has(i)) continue;
        const b = predBoxes[i].bbox;
        const d = Math.hypot((b[0] + b[2]) / 2 - tx, (b[1] + b[3]) / 2 - ty);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0 && bd <= 7) { tp++; used.add(best); }
    }
    return { tp, fp: predBoxes.length - used.size, fn: truth.length - tp };
  }

  function makeDataset(count, seedBase) {
    const items = [], kinds = ['normal', 'scratch', 'notch', 'stain'];
    for (let i = 0; i < count; i++) {
      const kind = i % 4 === 0 ? 'normal' : kinds[i % 4];
      const mode = (i / 4 | 0) % 3;
      items.push(generateImage((seedBase || 1000) + i, { kind, lightMode: mode }));
    }
    return items;
  }

  function evaluate(items, detectors) {
    const res = {};
    for (const name of Object.keys(detectors)) {
      const agg = { tp: 0, fp: 0, fn: 0, byMode: [0, 1, 2].map(() => ({ tp: 0, fp: 0, fn: 0 })) };
      for (const img of items) {
        const det = detectors[name](img);
        const m = match(det.boxes, img.truth);
        agg.tp += m.tp; agg.fp += m.fp; agg.fn += m.fn;
        const bm = agg.byMode[img.meta.mode];
        bm.tp += m.tp; bm.fp += m.fp; bm.fn += m.fn;
      }
      const p = agg.tp / (agg.tp + agg.fp) || 0;
      const r = agg.tp / (agg.tp + agg.fn) || 0;
      res[name] = { tp: agg.tp, fp: agg.fp, fn: agg.fn, precision: +p.toFixed(4), recall: +r.toFixed(4), f1: +(2 * p * r / (p + r) || 0).toFixed(4), byMode: agg.byMode.map(b => ({ ...b, recall: +(b.tp / (b.tp + b.fn) || 0).toFixed(4), precision: +(b.tp / (b.tp + b.fp) || 0).toFixed(4) })) };
    }
    return res;
  }

  /* ----------------------------------------------------------------------
   * Generic / parameterized API for the visual-inspection studio.
   * These functions work on images of any size and do not alter the
   * legacy 128x128 pipeline above, so the published evaluation is stable.
   * -------------------------------------------------------------------- */

  function toGray(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < g.length; i++, p += 4) {
      g[i] = clamp(Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]), 0, 255);
    }
    return g;
  }

  function autoStretch(src) {
    let lo = 255, hi = 0;
    for (let i = 0; i < src.length; i++) { const v = src[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (hi - lo < 8) return Uint8Array.from(src);
    const out = new Uint8Array(src.length), k = 255 / (hi - lo);
    for (let i = 0; i < src.length; i++) out[i] = clamp(Math.round((src[i] - lo) * k), 0, 255);
    return out;
  }

  function estimateROI(img) {
    const { w, h, gray: g } = img;
    // border median approximates the background / conveyor colour
    const border = [];
    const step = Math.max(1, Math.floor(Math.min(w, h) / 60));
    for (let x = 0; x < w; x += step) { border.push(g[x], g[(h - 1) * w + x]); }
    for (let y = 0; y < h; y += step) { border.push(g[y * w], g[y * w + w - 1]); }
    border.sort((a, b) => a - b);
    const bg = border[border.length >> 1] || 128;
    let minX = w, minY = h, maxX = -1, maxY = -1, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Math.abs(g[y * w + x] - bg) > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        n++;
      }
    }
    if (n < 20 || maxX < 0) {
      const r = Math.min(w, h) * 0.36;
      return { cx: w / 2, cy: h / 2, r0: r * 0.45, r1: r * 0.95, x0: w / 2 - r, y0: h / 2 - r, x1: w / 2 + r, y1: h / 2 + r, bg, auto: false };
    }
    const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
    const rOuter = Math.max(4, Math.min((maxX - minX + 1), (maxY - minY + 1)) * 0.48);
    return {
      cx, cy,
      r0: Math.max(2, rOuter * 0.42), r1: rOuter * 0.98,
      x0: minX, y0: minY, x1: maxX, y1: maxY,
      bg, auto: true
    };
  }

  function polarUnwrapEx(img, cfg) {
    const pw = cfg.pw || 360, ph = cfg.ph || 30;
    const { cx, cy, r0, r1 } = cfg;
    const out = new Float32Array(pw * ph);
    const { w, h, gray: g } = img;
    for (let c = 0; c < pw; c++) {
      const a = (c / pw) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 0; r < ph; r++) {
        const rr = r0 + r * ((r1 - r0) / ph);
        const x = Math.round(cx + rr * ca), y = Math.round(cy + rr * sa);
        out[r * pw + c] = (x >= 0 && y >= 0 && x < w && y < h) ? g[y * w + x] : 128;
      }
    }
    return out;
  }

  function polarBoxToCartesianEx(minC, minR, maxC, maxR, cfg) {
    const pw = cfg.pw || 360, ph = cfg.ph || 30;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    const stepCol = Math.max(1, Math.floor((maxC - minC) / 6) || 1);
    for (let c = minC; c <= maxC; c += stepCol) {
      for (let r = minR; r <= maxR; r++) {
        const a = (c / pw) * Math.PI * 2, rr = cfg.r0 + r * ((cfg.r1 - cfg.r0) / ph);
        const x = cfg.cx + rr * Math.cos(a), y = cfg.cy + rr * Math.sin(a);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return [Math.floor(minX - 1), Math.floor(minY - 1), Math.ceil(maxX + 1), Math.ceil(maxY + 1)];
  }

  // Standard-order convenience detector using the generic primitives.
  function detectEx(img, cfg) {
    const roi = cfg.roi || estimateROI(img);
    const polar = polarUnwrapEx(img, { ...roi, pw: cfg.pw || 360, ph: cfg.ph || 30 });
    const smooth = boxBlurCircular(polar, cfg.pw || 360, cfg.ph || 30, cfg.smoothKw || 3, cfg.smoothKh || 3);
    const bg = boxBlurCircular(smooth, cfg.pw || 360, cfg.ph || 30, cfg.bgKw || 61, cfg.bgKh || 15);
    const residual = Float32Array.from(smooth, (v, i) => bg[i] - v);
    const mask = new Uint8Array(polar.length);
    for (let i = 0; i < mask.length; i++) mask[i] = residual[i] > (cfg.threshold || 12) ? 1 : 0;
    const comps = connectedComponents(mask, cfg.pw || 360, cfg.ph || 30);
    const boxes = [];
    for (const c of comps) {
      const span = c.maxX - c.minX + 1, rspan = c.maxY - c.minY + 1;
      if (c.area < (cfg.minArea || 5) || span < (cfg.minSpan || 4) || rspan > 14) continue;
      boxes.push({ bbox: polarBoxToCartesianEx(c.minX, c.minY, c.maxX, c.maxY, roi), area: c.area });
    }
    return { boxes, roi, polar, residual, mask };
  }

  return { W, H, R0, R1, PW, PH, mulberry32, generateImage, polarUnwrap, boxBlur, boxBlurCircular, connectedComponents, detectOurs, detectOursNoFilter, detectBaselineOtsu, detectBaselineAdaptive, match, makeDataset, evaluate, toGray, autoStretch, estimateROI, polarUnwrapEx, polarBoxToCartesianEx, detectEx };
});
