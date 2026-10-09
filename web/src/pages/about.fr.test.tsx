import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLangRaw } from '../i18n/core';
import '../i18n';
import '../i18n/fr';
import { NavContext, type Nav } from '../ui/common';
import { About } from './about';

const nav = { go() {}, openLab() {}, busy: false } as unknown as Nav;
const render = (role: 'student' | 'teacher') => renderToStaticMarkup(<NavContext.Provider value={nav}><About role={role} /></NavContext.Provider>);
const texts = (html: string) => [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]!.trim()).filter(Boolean);
/** Proper nouns that are the same in both languages. */
const SAME = new Set(['Escape Lab', 'Monastir', 'HEPL / Liège', '&amp;']);

describe('About & demo guide in French', () => {
  afterEach(() => setLangRaw('en'));
  for (const role of ['student', 'teacher'] as const) {
    it(`${role}: every text of the page is translated (none stays English)`, () => {
      setLangRaw('en');
      const english = texts(render(role));
      setLangRaw('fr');
      const french = new Set(texts(render(role)));
      const left = english.filter((text) => /[A-Za-z]{3}/.test(text) && !SAME.has(text) && french.has(text));
      expect(left).toEqual([]);
    });
  }
  it('quotes the labels of the app through the dictionary (placeholders are all filled)', () => {
    setLangRaw('fr');
    for (const role of ['student', 'teacher'] as const) expect(render(role)).not.toMatch(/\{\w+\}/);
  });
});
