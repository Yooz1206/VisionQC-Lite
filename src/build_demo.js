/* Rebuild the standalone, self-contained demo page from template + core algorithm.
 * Usage: node src/build_demo.js
 * The generated demo/index.html has no external script dependency, so it works
 * from file://, the WorkBuddy preview panel, and offline double-click launches.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'demo', 'index.template.html');
const corePath = path.join(root, 'src', 'vision-core.js');
const outputPath = path.join(root, 'demo', 'index.html');

const template = fs.readFileSync(templatePath, 'utf8');
const core = fs.readFileSync(corePath, 'utf8');
if (/<\/script/i.test(core)) throw new Error('core script contains an unsafe </script sequence');

const start = '<!-- demo-core:start -->';
const end = '<!-- demo-core:end -->';
const si = template.indexOf(start);
const ei = template.indexOf(end, si);
if (si < 0 || ei < 0) throw new Error('demo-core markers not found in template');

const inlined = `${start}\n<script>\n/* VisionQC-Lite core algorithm — inlined for standalone offline demo */\n${core}\n</script>\n${end}`;
const out = template.slice(0, si) + inlined + template.slice(ei + end.length);
fs.writeFileSync(outputPath, out, 'utf8');
console.log(`built ${path.relative(root, outputPath)} (${out.length} bytes, core ${core.length} bytes)`);
