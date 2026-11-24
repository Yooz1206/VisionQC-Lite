/* ChipInspect — 实拍工件「圆标记定位 + 缺口检测」轻量算法
 * 无依赖，可在 Node 与浏览器中运行；浏览器挂载 window.ChipInspect。
 *
 * 思路（针对托盘中的方形/异形工件）：
 *   1) Otsu 自适应阈值 + 中心区域约束，分割工件本体（银色圆标记与本体连通）。
 *   2) 局部「亮度 × 纹理」响应定位银色圆形基准点（旋转 / 光照变化下稳定）。
 *   3) 对工件轮廓求凸包，凸包与实体之间的空缺即为候选缺口。
 *   4) 合并相邻空缺，按面积阈值区分设计小圆角与真实缺口。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChipInspect = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function otsu(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    let total = 0, sum = 0;
    for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
    let wB = 0, sB = 0, best = -1, th = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = total - wB; if (!wF) break;
      sB += t * hist[t];
      const d = sB / wB - (sum - sB) / wF;
      const score = wB * wF * d * d;
      if (score > best) { best = score; th = t; }
    }
    return th;
  }

  /* 八邻域连通域，返回按面积降序的点索引数组 */
  function components(mask, w, h, minArea) {
    const seen = new Uint8Array(mask.length), out = [], stack = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      let pts = []; stack.length = 0; stack.push(i); seen[i] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p / w) | 0;
        pts.push(p);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      if (pts.length >= (minArea || 1)) out.push(pts);
    }
    return out.sort((a, b) => b.length - a.length);
  }

  function integral(gray, w, h) {
    const W = w + 1;
    const s = new Float64Array(W * (h + 1)), s2 = new Float64Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0, row2 = 0;
      for (let x = 0; x < w; x++) {
        const v = gray[y * w + x]; row += v; row2 += v * v;
        s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row;
        s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + row2;
      }
    }
    return { s, s2, W };
  }
  function rectSum(t, w, x0, y0, x1, y1) {
    const W = t.W, h = t.s.length / W - 1;
    x0 = clamp(x0, 0, w - 1); y0 = clamp(y0, 0, h - 1);
    x1 = clamp(x1, 0, w - 1); y1 = clamp(y1, 0, h - 1);
    return t.s[(y1 + 1) * W + x1 + 1] - t.s[y0 * W + x1 + 1] - t.s[(y1 + 1) * W + x0] + t.s[y0 * W + x0];
  }

  /* 银色圆标记：局部均值较高且纹理最强的圆形区域 */
  function findFiducial(gray, w, h, bbox, radius) {
    const t = integral(gray, w, h), R = radius, n = (2 * R + 1) * (2 * R + 1);
    let best = -1, bx = 0, by = 0;
    const x0 = bbox[0] + R, x1 = bbox[2] - R, y0 = bbox[1] + R, y1 = bbox[3] - R;
    for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
      const A = rectSum(t, w, x - R, y - R, x + R, y + R);
      const B = rectSum({ s: t.s2, W: t.W }, w, x - R, y - R, x + R, y + R);
      const mean = A / n;
      const sd = Math.sqrt(Math.max(0, B / n - mean * mean));
      const score = sd * Math.max(0, mean - 70);
      if (score > best) { best = score; bx = x; by = y; }
    }
    // 以响应中心为圆心，向外估计实际半径（灰度显著高于工件本体的连通区域）
    let localSum = 0, localN = 0;
    for (let y = by - R; y <= by + R; y++) for (let x = bx - R; x <= bx + R; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      localSum += gray[y * w + x]; localN++;
    }
    const localMean = localSum / Math.max(1, localN);
    let area = 0;
    for (let y = by - R; y <= by + R; y++) for (let x = bx - R; x <= bx + R; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (gray[y * w + x] > localMean + 18) area++;
    }
    return { x: bx, y: by, radius: Math.round(Math.sqrt(area / Math.PI)), score: Math.round(best) };
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function convexHull(points) {
    const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function bboxOfPoints(pts, w) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
    for (const p of pts) { const x = p % w, y = (p / w) | 0; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { bbox: [x0, y0, x1, y1], cx: +(sx / pts.length).toFixed(1), cy: +(sy / pts.length).toFixed(1), area: pts.length };
  }
  function near(a, b, gap) {
    return !(a[2] + gap < b[0] || b[2] + gap < a[0] || a[3] + gap < b[1] || b[3] + gap < a[1]);
  }
  function mergeDefects(defs, gap) {
    const list = defs.map(d => ({ ...d }));
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (!near(list[i].bbox, list[j].bbox, gap)) continue;
        const a = list[i], b = list[j];
        a.area = a.area + b.area;
        a.bbox = [Math.min(a.bbox[0], b.bbox[0]), Math.min(a.bbox[1], b.bbox[1]), Math.max(a.bbox[2], b.bbox[2]), Math.max(a.bbox[3], b.bbox[3])];
        a.cx = +((a.cx * (a.area - b.area) + b.cx * b.area) / a.area).toFixed(1);
        a.cy = +((a.cy * (a.area - b.area) + b.cy * b.area) / a.area).toFixed(1);
        list.splice(j, 1); changed = true; break outer;
      }
    }
    return list.sort((a, b) => b.area - a.area);
  }

  function inspect(img, opts) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const { gray, w, h } = img;
    const o = opts || {};
    const sensitivity = o.sensitivity || 1; // 越大越灵敏（面积阈值越低）
    const th = o.threshold != null ? o.threshold : otsu(gray);
    const mask = new Uint8Array(w * h);
    const region = o.roi && o.roi.x1 > o.roi.x0 ? o.roi : { x0: w * 0.12, y0: h * 0.04, x1: w * 0.78, y1: h * 0.82 };
    for (let y = Math.max(0, region.y0 | 0); y < Math.min(h, region.y1 | 0); y++) {
      for (let x = Math.max(0, region.x0 | 0); x < Math.min(w, region.x1 | 0); x++) {
        const i = y * w + x; mask[i] = gray[i] > th ? 1 : 0;
      }
    }
    const comps = components(mask, w, h, Math.max(400, w * h * 0.008));
    if (!comps.length) return { ok: false, reason: '未分割出工件', threshold: th, ms: 0 };
    const pts = comps[0];
    const solid = new Uint8Array(w * h);
    for (const p of pts) solid[p] = 1;
    const chip = bboxOfPoints(pts, w);
    const size = Math.min(chip.bbox[2] - chip.bbox[0], chip.bbox[3] - chip.bbox[1]);

    const fiducial = findFiducial(gray, w, h, chip.bbox, clamp(Math.round(size * 0.075), 8, 26));

    const border = [];
    for (const p of pts) {
      const x = p % w, y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      if (!solid[p - 1] || !solid[p + 1] || !solid[p - w] || !solid[p + w]) border.push([x, y]);
    }
    const hull = convexHull(border);
    const dil = new Uint8Array(w * h);
    for (const p of pts) { dil[p] = 1; if (p > 0) dil[p - 1] = 1; if (p < dil.length - 1) dil[p + 1] = 1; if (p >= w) dil[p - w] = 1; if (p < dil.length - w) dil[p + w] = 1; }
    const voidMask = new Uint8Array(w * h);
    for (let y = chip.bbox[1]; y <= chip.bbox[3]; y++) for (let x = chip.bbox[0]; x <= chip.bbox[2]; x++) {
      const i = y * w + x;
      if (!dil[i] && inPoly(x, y, hull)) voidMask[i] = 1;
    }
    const raw = components(voidMask, w, h, 30).map(p => bboxOfPoints(p, w));
    const merged = mergeDefects(raw, Math.max(8, Math.round(size * 0.03)))
      .filter(d => d.area >= Math.max(220, chip.area * 0.003 / sensitivity));

    const largest = merged.length ? merged[0].area : 0;
    const ratio = largest / Math.max(1, chip.area);
    const ngThreshold = Math.max(700, chip.area * 0.014 / sensitivity);
    const ng = largest > ngThreshold;
    const reasons = [];
    if (!fiducial.score) reasons.push('圆标记定位不可靠');
    if (ng) reasons.push('凸包缺口面积 ' + largest + ' px，占工件 ' + (ratio * 100).toFixed(1) + '%');
    else reasons.push('仅存在设计性小圆角，最大空缺 ' + largest + ' px');

    return {
      ok: true, threshold: th,
      chip: { bbox: chip.bbox, cx: chip.cx, cy: chip.cy, area: chip.area },
      fiducial, defects: merged.slice(0, 6),
      verdict: ng ? 'NG' : 'OK',
      maxDefectArea: largest, defectRatio: +ratio.toFixed(4),
      reasons, ms: +((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0).toFixed(1)
    };
  }

  return { inspect, otsu, convexHull, components };
});
