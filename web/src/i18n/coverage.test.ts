import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conflicts, frEntries } from './core';
import './fr';

// Every literal `t('...')` in the source must have a French text with the same placeholders, and no key may be registered twice differently.
const root = resolve(process.cwd(), 'src');
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'i18n') walk(full); } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(full);
  }
})(root);

const CALL = /(?<![\w.$])t\(\s*(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
const used: { key: string; where: string }[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(CALL)) {
    const raw = match[2]!;
    if (raw.includes('${')) continue;
    const key = raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
    const line = source.slice(0, match.index).split('\n').length;
    used.push({ key, where: `${relative(root, file)}:${line}` });
  }
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(',');
/** Texts that are legitimately the same in both languages (no letters, brand names, product words). */
const SAME = /^(?:[^A-Za-zÀ-ÿ]*|Escape Lab|LabEscape|XP|OK|Master|Score)$/;

describe('French coverage', () => {
  it('has no key registered twice with different texts', () => { expect(conflicts).toEqual([]); });
  it('has a French text for every t() literal in the source', () => {
    const missing = used.filter(({ key }) => !frEntries().has(key) && !SAME.test(key)).map(({ key, where }) => `${where}  ${JSON.stringify(key)}`);
    expect(missing, `${missing.length} missing`).toEqual([]);
  });
  it('keeps the same placeholders in French', () => {
    const bad = used.filter(({ key }) => { const fr = frEntries().get(key); return fr !== undefined && placeholders(fr) !== placeholders(key); }).map(({ key, where }) => `${where}  ${JSON.stringify(key)}`);
    expect(bad).toEqual([]);
  });
  it('never leaves a French text identical to the English one when it contains words', () => {
    const same = [...frEntries()].filter(([en, fr]) => en === fr && !SAME.test(en)).map(([en]) => JSON.stringify(en));
    expect(same).toEqual([]);
  });
});
