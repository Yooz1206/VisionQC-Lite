/* Rebuild the standalone visual-inspection studio from template + algorithms + real samples.
 * Usage: node src/build_studio.js
 * Output: studio/index.html (single self-contained file, no server required)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'demo', 'studio.template.html');
const outputPath = path.join(root, 'studio', 'index.html');
const sampleDir = path.join(root, 'samples', 'real');

let out = fs.readFileSync(templatePath, 'utf8');

/* inline an algorithm source file in place of its <script src> tag */
function inlineCore(file, tag) {
  const src = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  if (/<\/script/i.test(src)) throw new Error(file + ' contains an unsafe </script sequence');
  if (!out.includes(tag)) throw new Error('script tag not found: ' + tag);
  out = out.replace(tag, `<script>\n/* ${file} — inlined for standalone offline studio */\n${src}\n</script>`);
  return src.length;
}
const coreLen = inlineCore('vision-core.js', '<script src="../src/vision-core.js"></script>');
const chipLen = inlineCore('chip-inspect.js', '<script src="../src/chip-inspect.js"></script>');

/* embed the three real photos so the demo works offline and in preview panels */
const marker = '<!-- real-samples:inject -->';
if (!out.includes(marker)) throw new Error('real-samples marker not found');
const samples = [1, 2, 3].map(i => {
  const p = path.join(sampleDir, 'sample_' + i + '.jpg');
  return 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64');
});
out = out.replace(marker, `<script>window.REAL_SAMPLES=${JSON.stringify(samples)};</script>`);

fs.writeFileSync(outputPath, out, 'utf8');
console.log(`built ${path.relative(root, outputPath)} (${out.length} bytes, core ${coreLen} + chip ${chipLen} bytes, ${samples.length} samples)`);
