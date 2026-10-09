// @vitest-environment node
// Contrast pairs that the stylesheets promise, checked against the CSS source itself (the E2E suite re-checks the
// computed styles in a real browser): control borders >= 3:1 (WCAG 1.4.11) and the white caption text >= 4.5:1.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../src/polish.css', import.meta.url)), 'utf8');
const channel = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
const luminance = (rgb) => rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const hex = (value) => [0, 1, 2].map((i) => channel(value, i));

// The surfaces controls sit on: card cream, matching row, white, page background.
const SURFACES = { card: '#fffdfa', matching: '#f3f7f4', white: '#ffffff', page: '#f7f4ef' };

describe('stylesheet contrast pairs', () => {
  const token = /--control-border:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];

  it('defines one control-border token', () => {
    expect(token, '--control-border must be declared in polish.css').toBeDefined();
  });

  it.each(Object.entries(SURFACES))('control borders reach 3:1 on the %s surface', (_name, surface) => {
    expect(ratio(hex(token), hex(surface))).toBeGreaterThanOrEqual(3);
  });

  it('applies the token to the answer, move and select controls', () => {
    const rule = /([^{}]*)\{border-color:var\(--control-border\)\}/.exec(css)?.[1] ?? '';
    for (const selector of ['.answer-options button', '.move-buttons button', '.match-row select', '.picker-label select']) expect(rule).toContain(selector);
  });

  it('draws the small caption text pure white, and white on the lightest possible scrim reaches 4.5:1', () => {
    expect(css).toMatch(/\.visual-caption small\{color:#fff\}/);
    // rgba(34,57,60,.72) scrim over a white photograph: the worst case.
    const worst = [34, 57, 60].map((v) => v * 0.72 + 255 * 0.28);
    expect(ratio([255, 255, 255], worst)).toBeGreaterThanOrEqual(4.5);
  });
});
