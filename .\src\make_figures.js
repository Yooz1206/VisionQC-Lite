/* Generate result figures (PNG) from real detector outputs — no external deps */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const V = require('./vision-core.js');

// ---- minimal PNG encoder ----
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3, d = y * (w * 3 + 1) + 1 + x * 3;
      raw[d] = rgb[s]; raw[d + 1] = rgb[s + 1]; raw[d + 2] = rgb[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  console.log('wrote', path.basename(file), w + 'x' + h, png.length + 'B');
}

function canvas(w, h, bg) { const a = new Uint8Array(w * h * 3); for (let i = 0; i < a.length; i += 3) { a[i] = bg[0]; a[i + 1] = bg[1]; a[i + 2] = bg[2]; } return a; }
function px(a, w, x, y, c) { if (x < 0 || y < 0 || x >= w || y < 0) return; const i = (y * w + x) * 3; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; }
function rect(a, w, x0, y0, x1, y1, c, t) {
  t = t || 1;
  for (let x = x0; x <= x1; x++) for (let s = 0; s < t; s++) { px(a, w, x, y0 + s, c); px(a, w, x, y1 - s, c); }
  for (let y = y0; y <= y1; y++) for (let s = 0; s < t; s++) { px(a, w, x0 + s, y, c); px(a, w, x1 - s, y, c); }
}
function blitGray(a, w, ox, oy, gray, gw, gh, scale) {
  scale = scale || 1;
  for (let y = 0; y < gh * scale; y++) for (let x = 0; x < gw * scale; x++) {
    const v = gray[Math.floor(y / scale) * gw + Math.floor(x / scale)];
    px(a, w, ox + x, oy + y, [v, v, v]);
  }
}
function label(a, w, ox, oy, text, color) {
  // tiny 3x5 bitmap font for A-Z 0-9 . : space
  const F = {
    'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],'C':['011','100','100','100','011'],
    'D':['110','101','101','101','110'],'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
    'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],'I':['111','010','010','010','111'],
    'J':['001','001','001','101','010'],'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
    'M':['101','111','111','101','101'],'N':['101','111','111','111','101'],'O':['010','101','101','101','010'],
    'P':['110','101','110','100','100'],'Q':['010','101','101','111','011'],'R':['110','101','110','101','101'],
    'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],'U':['101','101','101','101','111'],
    'V':['101','101','101','101','010'],'W':['101','101','111','111','101'],'X':['101','101','010','101','101'],
    'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
    '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],
    '3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],
    '6':['011','100','110','101','010'],'7':['111','001','010','010','010'],'8':['010','101','010','101','010'],
    '9':['010','101','011','001','110'],'.':['000','000','000','000','010'],':':['000','010','000','010','000'],
    ' ':['000','000','000','000','000'],'%':['101','001','010','100','101'],'/':['001','001','010','100','100']
  };
  let cx = ox;
  for (const ch of text.toUpperCase()) {
    const g = F[ch] || F[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === '1') {
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) px(a, w, cx + c * 2 + sx, oy + r * 2 + sy, color);
    }
    cx += 8;
  }
}

const OUT = path.join(__dirname, '..', 'reports', 'figures');
fs.mkdirSync(OUT, { recursive: true });

// Figure 1: four samples with real detections (green) and ground truth (red)
{
  const S = 2, PAD = 8, CELL = V.W * S;
  const W = CELL * 2 + PAD * 3, Hh = CELL * 2 + PAD * 3 + 14;
  const a = canvas(W, Hh, [16, 28, 44]);
  const specs = [
    { kind: 'scratch', seed: 1001, name: 'SCRATCH' },
    { kind: 'notch', seed: 1002, name: 'NOTCH' },
    { kind: 'stain', seed: 1003, name: 'STAIN' },
    { kind: 'normal', seed: 1004, name: 'NORMAL' }
  ];
  specs.forEach((s, idx) => {
    const im = V.generateImage(s.seed, { kind: s.kind, lightMode: idx % 3 });
    const det = V.detectOurs(im);
    const ox = PAD + (idx % 2) * (CELL + PAD), oy = PAD + Math.floor(idx / 2) * (CELL + PAD) + 14;
    blitGray(a, W, ox, oy, im.gray, V.W, V.H, S);
    for (const t of im.truth) { const b = t.bbox; rect(a, W, ox + b[0] * S, oy + b[1] * S, ox + b[2] * S, oy + b[3] * S, [255, 70, 90], 2); }
    for (const d of det.boxes) { const b = d.bbox; rect(a, W, ox + b[0] * S, oy + b[1] * S, ox + b[2] * S, oy + b[3] * S, [40, 230, 140], 1); }
    label(a, W, ox, oy - 11, s.name + ' L' + (idx % 3), [180, 220, 255]);
  });
  label(a, W, PAD, Hh - 9, 'GREEN=OURS  RED=GROUND TRUTH', [130, 165, 200]);
  writePNG(path.join(OUT, 'fig_detections.png'), W, Hh, a);
}

// Figure 2: polar unwrap + residual heatmap for a scratch sample
{
  const im = V.generateImage(1001, { kind: 'scratch', lightMode: 1 });
  const det = V.detectOurs(im);
  const PW = V.PW, PH = V.PH, S = 2;
  const W = PW * S + 16, H = PH * S * 2 + 40;
  const a = canvas(W, H, [16, 28, 44]);
  // top: polar unwrapped
  for (let y = 0; y < PH * S; y++) for (let x = 0; x < PW * S; x++) {
    const v = det.polar[Math.floor(y / S) * PW + Math.floor(x / S)];
    px(a, W, 8 + x, 18 + y, [v, v, v]);
  }
  // bottom: residual heatmap
  for (let y = 0; y < PH * S; y++) for (let x = 0; x < PW * S; x++) {
    const v = det.residual[Math.floor(y / S) * PW + Math.floor(x / S)];
    const u = Math.max(0, Math.min(1, v / 60));
    px(a, W, 8 + x, 18 + PH * S + 10 + y, [Math.round(20 + 235 * u), Math.round(28 + 120 * u), Math.round(44 + 30 * u)]);
  }
  label(a, W, 8, 5, 'POLAR UNWRAP 360x30', [180, 220, 255]);
  label(a, W, 8, 18 + PH * S + 12 - 10, 'BACKGROUND-SUPPRESSED RESIDUAL', [180, 220, 255]);
  writePNG(path.join(OUT, 'fig_polar_residual.png'), W, H, a);
}

console.log('figures done');
