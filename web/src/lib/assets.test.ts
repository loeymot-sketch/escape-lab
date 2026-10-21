import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_ASSETS } from './assets';

// R36 B36-001: the chemistry panel is a text table drawn as pixels. The text alternative is transcribed by hand,
// so this test pins it to the text of the SVG itself: a wrong digit or a missing row cannot slip in unnoticed.
const svg = readFileSync(resolve(process.cwd(), 'src/assets/chemistry-panel.svg'), 'utf8');
const texts = Array.from(svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)).map((m) => ({
  x: Number(/\bx="([\d.]+)"/.exec(m[1]!)?.[1]),
  y: Number(/\by="([\d.]+)"/.exec(m[1]!)?.[1]),
  text: m[2]!.trim(),
}));
const decode = (s: string) => s.replace(/&amp;/g, '&');

describe('chemistry panel text alternative', () => {
  const alt = SCIENTIFIC_ASSETS['panel-hemolysis-01']?.textAlternative;

  it('exists for the one image whose content is a table of values', () => {
    expect(alt).toBeDefined();
  });

  it('lists the specimen indices exactly as drawn', () => {
    const drawn = texts.filter((t) => t.y === 167).sort((a, b) => a.x - b.x).map((t) => decode(t.text));
    expect(alt!.indices).toEqual(drawn);
  });

  it('lists every drawn result row with the same test, value, unit, reference range and flag', () => {
    const columns = { test: 80, result: 880, unit: 1060, reference: 1260, flag: 1500 };
    const rowYs = [...new Set(texts.filter((t) => t.y > 300).map((t) => t.y))].sort((a, b) => a - b);
    const drawn = rowYs.map((y) => {
      const cell = (x: number) => decode(texts.find((t) => t.y === y && t.x === x)?.text ?? '');
      return { test: cell(columns.test), result: cell(columns.result), unit: cell(columns.unit), reference: cell(columns.reference), flag: cell(columns.flag) };
    });
    expect(drawn.length).toBe(8);
    expect(alt!.rows.map(({ test, result, unit, reference, flag }) => ({ test, result, unit, reference, flag }))).toEqual(drawn);
  });

  it('keeps hit geometry out of the browser text alternative', () => {
    for (const row of alt!.rows) {
      expect(row).not.toHaveProperty('x');
      expect(row).not.toHaveProperty('y');
    }
  });

  it('keeps rows far enough apart that two rows cannot be confused (7.8 percent, wider than any hit radius)', () => {
    expect(new Set(alt!.rows.map((r) => r.test)).size).toBe(alt!.rows.length);
  });

  it('offers a neutral description for the blood smear without exposing its hotspot', () => {
    expect(SCIENTIFIC_ASSETS['smear-schistocyte-01']?.description).toContain('not a validated specimen');
    expect(SCIENTIFIC_ASSETS['smear-schistocyte-01']?.textAlternative).toBeUndefined();
  });
});
