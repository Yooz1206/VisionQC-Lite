/* Rebuild the standalone visual-inspection studio from template + core algorithm.
 * Usage: node src/build_studio.js
 * Output: studio/index.html (single self-contained file, no server required)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'demo', 'studio.template.html');
const corePath = path.join(root, 'src', 'vision-core.js');
const outputPath = path.join(root, 'studio', 'index.html');

const template = fs.readFileSync(templatePath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
if (/<\/script/i.test(core)) throw new Error('core contains an unsafe </script sequence');

const tag = '<script src="../src/vision-core.js"></script>';
if (!template.includes(tag)) throw new Error('core script tag not found in studio template');
const inlined = `<script>\n/* VisionQC core — inlined for standalone offline studio */\n${core}\n</script>`;
const out = template.replace(tag, inlined);
fs.writeFileSync(outputPath, out, 'utf8');
console.log(`built ${path.relative(root, outputPath)} (${out.length} bytes, core ${core.length} bytes)`);
