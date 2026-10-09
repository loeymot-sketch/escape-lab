import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), process.env.BUDGET_DIR ?? 'dist');
const assetsDir = join(distDir, 'assets');
const files = readdirSync(assetsDir);
/**
 * `js` is the ENTRY file that index.html loads on every first visit (the original 400 kB budget, unchanged).
 * `lazyJs` is everything loaded only on demand (the French dictionary): English visitors never download it.
 */
const budgets = { js: 400_000, lazyJs: 160_000, css: 120_000 };
/** Every single raster image (hero artwork included) must stay small enough for a first load on a phone. */
const IMAGE_BUDGET = 300_000;
const entryName = readFileSync(join(distDir, 'index.html'), 'utf8').match(/<script[^>]*\btype="module"[^>]*\bsrc="[^"]*\/assets\/([^"?]+\.js)"/)?.[1];
if (!entryName) throw new Error('Build budget: the entry script of index.html was not found, so the entry budget cannot be measured.');
const measured = { js: 0, lazyJs: 0, css: 0 };
const images = [];

for (const file of files) {
  const size = statSync(join(assetsDir, file)).size;
  const kind = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : null;
  if (kind === 'js') measured[file === entryName ? 'js' : 'lazyJs'] += size;
  else if (kind) measured[kind] += size;
  else if (/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file)) images.push({ file, size });
}

for (const kind of Object.keys(budgets)) {
  if (measured[kind] > budgets[kind]) throw new Error(`Build ${kind} budget exceeded: ${measured[kind]} > ${budgets[kind]} bytes.`);
}
const heavy = images.filter(({ size }) => size > IMAGE_BUDGET);
if (heavy.length) throw new Error(`Image budget exceeded (max ${IMAGE_BUDGET} bytes each): ${heavy.map(({ file, size }) => `${file} ${size}`).join(', ')}.`);
if (!images.length) throw new Error('Image budget: no raster image found in the build, so the budget is not looking at the right directory.');

console.log(`Build budget passed: JS ${measured.js} / ${budgets.js} bytes (entry), lazy JS ${measured.lazyJs} / ${budgets.lazyJs} bytes (loaded on demand), CSS ${measured.css} / ${budgets.css} bytes, ${images.length} raster image(s) all <= ${IMAGE_BUDGET} bytes (${images.map(({ file, size }) => `${file} ${size}`).join(', ')}).`);
