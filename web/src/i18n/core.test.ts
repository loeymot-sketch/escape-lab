import { beforeEach, describe, expect, it } from 'vitest';
import { formatInt, plural, registerFr, registerNouns, resetForTests, setLangRaw, t } from './core';

describe('t()', () => {
  beforeEach(() => {
    resetForTests();
    registerFr({ 'Open the lab': 'Ouvrir le laboratoire', 'Level {level} · {xp} XP': 'Niveau {level} · {xp} XP', 'No activity for {n} days': 'Aucune activité depuis {n} jours', 'Complete {mission} to unlock.': 'Terminez {mission} pour déverrouiller.', 'Blood Smear Code': 'Code du frottis sanguin' });
    registerNouns({ mission: ['mission', 'missions'] });
  });
  it('returns the English text unchanged in English, and fills placeholders', () => {
    expect(t('Open the lab')).toBe('Open the lab');
    expect(t('Level {level} · {xp} XP', { level: 6, xp: '8,240' })).toBe('Level 6 · 8,240 XP');
    expect(t('Unknown {a}', { a: 1 })).toBe('Unknown 1');
  });
  it('translates exact texts and filled placeholders in French', () => {
    setLangRaw('fr');
    expect(t('Open the lab')).toBe('Ouvrir le laboratoire');
    expect(t('Level {level} · {xp} XP', { level: 6, xp: '8 240' })).toBe('Niveau 6 · 8 240 XP');
  });
  it('re-fills a server text that matches a template, translating known captured values', () => {
    setLangRaw('fr');
    expect(t('No activity for 10 days')).toBe('Aucune activité depuis 10 jours');
    expect(t('Complete Blood Smear Code to unlock.')).toBe('Terminez Code du frottis sanguin pour déverrouiller.');
  });
  it('falls back to English, never to an empty text', () => {
    setLangRaw('fr');
    expect(t('Something nobody translated')).toBe('Something nobody translated');
    expect(t('')).toBe('');
  });
  it('pluralises French nouns with 0 and 1 singular, and English as before', () => {
    expect(plural(1, 'mission')).toBe('1 mission');
    expect(plural(3, 'mission')).toBe('3 missions');
    expect(plural(2, 'code fragment')).toBe('2 code fragments');
    setLangRaw('fr');
    expect(plural(0, 'mission')).toBe('0 mission');
    expect(plural(2, 'mission')).toBe('2 missions');
    expect(plural(2, 'code fragment')).toBe('2 code fragments');
  });
  it('formats numbers for the display language', () => {
    expect(formatInt(8240)).toBe('8,240');
    setLangRaw('fr');
    expect(formatInt(8240).replace(/\s/g, ' ')).toBe('8 240');
  });
  it('does not let a key with almost no fixed text swallow unknown server texts', () => {
    registerFr({ '{pct}%': '{pct} %', '{lab}:': '{lab} :', '{n} x -10 XP': '{n} × -10 XP' });
    setLangRaw('fr');
    expect(t('Whatever%')).toBe('Whatever%');
    expect(t('Anything:')).toBe('Anything:');
    expect(t('3 x -10 XP')).toBe('3 × -10 XP');
    expect(t('{pct}%', { pct: 62 })).toBe('62 %');
  });
  it('reports a key registered twice with different texts', () => {
    registerFr({ 'Open the lab': 'Autre texte' });
    // (the module-level list is checked by coverage.test.ts on the real dictionaries)
    expect(t('Open the lab')).toBe('Open the lab');
  });
});
