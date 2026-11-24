/* Export the controllable synthetic washer dataset in YOLO format.
 * Usage: node src/make_yolo_dataset.js [total]
 * Output: dataset/yolo/{images,labels}/{train,val}, data.yaml, classes.txt,
 *         manifest.csv with seed / defect type / lighting / ground-truth box.
 *
 * Innovation note: YOLO is only the detector backbone. The contribution here
 * is the controllable data construction (defect type x lighting x rotation)
 * and the reusable polar-prior pipeline, not "we used YOLO".
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const V = require('./vision-core.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dataset', 'yolo');
const TOTAL = parseInt(process.argv[2] || '800', 10);
const CLASSES = ['scratch', 'notch', 'stain'];
const KINDS = ['normal', ...CLASSES];

// minimal dependency-free PNG encoder
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePNG(file, w, h, gray) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1); raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const v = gray[y * w + x], d = row + 1 + x * 3;
      raw[d] = raw[d + 1] = raw[d + 2] = v;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(file, png);
}

for (const split of ['train', 'val']) for (const sub of ['images', 'labels']) fs.mkdirSync(path.join(OUT, sub, split), { recursive: true });

const manifest = ['filename,split,seed,kind,light_mode,bbox_x0,bbox_y0,bbox_x1,bbox_y1'];
let counts = { train: 0, val: 0 }, labelCounts = { scratch: 0, notch: 0, stain: 0, normal: 0 };

for (let i = 0; i < TOTAL; i++) {
  const kind = KINDS[i % KINDS.length];
  const lightMode = (Math.floor(i / KINDS.length) % 3);
  const seed = 5000 + i;
  const im = V.generateImage(seed, { kind, lightMode });
  const split = (i % 5 === 4) ? 'val' : 'train';
  const count = ++counts[split];
  const name = String(count).padStart(4, '0') + '_' + kind + '_' + lightMode;
  writePNG(path.join(OUT, 'images', split, name + '.png'), im.w, im.h, im.gray);

  const lines = [];
  for (const t of im.truth) {
    const [x0, y0, x1, y1] = t.bbox;
    const cx = ((x0 + x1 + 1) / 2) / im.w;
    const cy = ((y0 + y1 + 1) / 2) / im.h;
    const bw = (x1 - x0 + 1) / im.w;
    const bh = (y1 - y0 + 1) / im.h;
    const cls = CLASSES.indexOf(t.type);
    if (cls >= 0) { lines.push([cls, cx.toFixed(6), cy.toFixed(6), bw.toFixed(6), bh.toFixed(6)].join(' ')); labelCounts[t.type]++; }
  }
  fs.writeFileSync(path.join(OUT, 'labels', split, name + '.txt'), lines.join('\n'));
  labelCounts[kind === 'normal' ? 'normal' : kind] += kind === 'normal' ? 1 : 0;
  const b = im.truth[0] ? im.truth[0].bbox : ['', '', '', ''];
  manifest.push([name + '.png', split, seed, kind, lightMode, ...b].join(','));
}

fs.writeFileSync(path.join(OUT, 'manifest.csv'), manifest.join('\n'));
fs.writeFileSync(path.join(OUT, 'classes.txt'), CLASSES.join('\n'));
fs.writeFileSync(path.join(OUT, 'data.yaml'), [
  "path: ./dataset/yolo",
  "train: images/train",
  "val: images/val",
  "nc: 3",
  "names: ['scratch', 'notch', 'stain']",
  '',
  '# 可控合成垫片缺陷数据集：3 类缺陷 × 3 种光照 × 随机角度',
  '# YOLO 仅作检测骨干；创新点在数据构造与极坐标先验流程'
].join('\n'));

console.log('YOLO dataset written to', path.relative(ROOT, OUT));
console.log('images:', counts, 'label objects:', labelCounts, 'total:', TOTAL);
