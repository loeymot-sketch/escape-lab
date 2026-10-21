import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), process.env.BUDGET_DIR ?? 'dist');
const assetsDir = join(distDir, 'assets');
const publicDir = join(process.cwd(), 'public');
const files = readdirSync(assetsDir);
/**
 * `js` is the ENTRY file that index.html loads on every first visit. `lazyJs` is everything a learner may load on demand (the point engine,
 * the teacher-rooms player): English visitors never download it. `frJs` is the French dictionary (a lazy `index-*.js` chunk), loaded only
 * when the page is shown in French. `studioJs` is the Teacher Studio (`studio-*.js`), loaded only by the faculty guest. `css` is the entry
 * stylesheet; `lazyCss` the stylesheets of the on-demand pages (teacher rooms and Studio).
 * 2026-10-14: the neon game-world theme and the visual polish pass sit on top of three earlier stylesheets, so the ceilings were raised
 * once, from 400 000 / 120 000 to 440 000 / 140 000 bytes (minified, before compression). Measured transfer sizes at that date: entry JS
 * 120 KB gzip, CSS 28 KB gzip, well inside a phone's first-load budget. A further raise needs a new measurement written here.
 * 2026-10-21 (Teacher Studio): the entry ceiling is unchanged. The French dictionary and the Studio got their own lines instead of sharing
 * `lazyJs`. Measured: entry 419 600, learner lazy 38 610, French dictionary 146 430 (48.8 KB gzip), Studio 68 030 (18.4 KB gzip),
 * entry CSS 135 880, lazy CSS 35 700 bytes.
 */
const budgets = { js: 440_000, lazyJs: 160_000, frJs: 180_000, studioJs: 120_000, css: 140_000, lazyCss: 60_000 };
/** Every single raster image (hero artwork included) must stay small enough for a first load on a phone. */
const IMAGE_BUDGET = 300_000;
const entryName = readFileSync(join(distDir, 'index.html'), 'utf8').match(/<script[^>]*\btype="module"[^>]*\bsrc="[^"]*\/assets\/([^"?]+\.js)"/)?.[1];
if (!entryName) throw new Error('Build budget: the entry script of index.html was not found, so the entry budget cannot be measured.');
const entryCss = readFileSync(join(distDir, 'index.html'), 'utf8').match(/<link[^>]*\bhref="[^"]*\/assets\/([^"?]+\.css)"/)?.[1];
const measured = { js: 0, lazyJs: 0, frJs: 0, studioJs: 0, css: 0, lazyCss: 0 };
const images = [];

for (const file of files) {
  const size = statSync(join(assetsDir, file)).size;
  if (file.endsWith('.js')) {
    const kind = file === entryName ? 'js' : /^studio-/.test(file) ? 'studioJs' : /^index-/.test(file) ? 'frJs' : 'lazyJs';
    measured[kind] += size;
  } else if (file.endsWith('.css')) measured[!entryCss || file === entryCss ? 'css' : 'lazyCss'] += size;
  else if (/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file)) images.push({ file, size });
}

// Static public assets bypass Vite's dist/assets inventory, so include them in the same raster budget.
for (const file of readdirSync(publicDir)) {
  const path = join(publicDir, file);
  if (/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file)) images.push({ file: `public/${file}`, size: statSync(path).size });
}

for (const kind of Object.keys(budgets)) {
  if (measured[kind] > budgets[kind]) throw new Error(`Build ${kind} budget exceeded: ${measured[kind]} > ${budgets[kind]} bytes.`);
}
const heavy = images.filter(({ size }) => size > IMAGE_BUDGET);
if (heavy.length) throw new Error(`Image budget exceeded (max ${IMAGE_BUDGET} bytes each): ${heavy.map(({ file, size }) => `${file} ${size}`).join(', ')}.`);
if (!images.length) throw new Error('Image budget: no raster image found in the build, so the budget is not looking at the right directory.');

console.log(`Build budget passed: JS ${measured.js} / ${budgets.js} bytes (entry), lazy JS ${measured.lazyJs} / ${budgets.lazyJs} bytes (loaded on demand), French dictionary ${measured.frJs} / ${budgets.frJs}, Teacher Studio ${measured.studioJs} / ${budgets.studioJs}, CSS ${measured.css} / ${budgets.css} bytes (entry), lazy CSS ${measured.lazyCss} / ${budgets.lazyCss}, ${images.length} raster image(s) all <= ${IMAGE_BUDGET} bytes (${images.map(({ file, size }) => `${file} ${size}`).join(', ')}).`);
