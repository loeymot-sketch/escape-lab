import { describe, expect, it } from 'vitest';
import { formatSeconds, initialOf, resolveView, secondsLeft } from './common';

describe('secondsLeft', () => {
  it('counts down from the server snapshot', () => {
    expect(secondsLeft(240, 1_000, 1_000)).toBe(240);
    expect(secondsLeft(240, 1_000, 1_999)).toBe(240);
    expect(secondsLeft(240, 1_000, 11_000)).toBe(230);
  });

  it('never adds time when `now` predates the snapshot (stale tick after a fresh snapshot)', () => {
    expect(secondsLeft(240, 10_500, 10_000)).toBe(240);
    expect(secondsLeft(240, 10_500, 0)).toBe(240);
  });

  it('never goes below zero, and has no number when the attempt has no limit', () => {
    expect(secondsLeft(5, 0, 60_000)).toBe(0);
    expect(secondsLeft(null, 0, 60_000)).toBeNull();
  });

  it('formats as mm:ss', () => {
    expect(formatSeconds(0)).toBe('00:00');
    expect(formatSeconds(245)).toBe('04:05');
  });
});

describe('initialOf (R13-C-05)', () => {
  it('keeps the whole first letter or emoji sequence', () => {
    expect(initialOf('Inès Moreau')).toBe('I');
    expect(initialOf('  \u00e9lise')).toBe('\u00e9');
    expect(initialOf('\u{1F469}\u{1F3FD}\u200D\u{1F52C} Ada')).toBe('\u{1F469}\u{1F3FD}\u200D\u{1F52C}');
  });
  it('R14-C-05: a flag (a pair of regional indicators) is a grapheme of its own and is kept whole, like the leaderboard abbreviation keeps it', () => {
    expect(initialOf('\u{1F1EB}\u{1F1F7} Fran')).toBe('\u{1F1EB}\u{1F1F7}');
    expect(initialOf('\u{1F1EB}\u{1F1F7}Fran')).toBe('\u{1F1EB}\u{1F1F7}');
    expect(initialOf('\u200f\u{1F1E9}\u{1F1EA} Max')).toBe('\u{1F1E9}\u{1F1EA}');
  });
  it('skips invisible leading characters, marks and brackets to the first visible letter', () => {
    for (const lead of ['\u200f', '\u200b', '\u00ad', '\u2800', '\u3164', '\uffa0', '\u202e', '\u0301', '\u2060', '\ufeff', '(', '\u200f\u200b(']) {
      expect(initialOf(`${lead}\u0645\u0631\u064a\u0645`), lead.codePointAt(0)!.toString(16)).toBe('\u0645');
      expect(initialOf(`${lead}Mia`), lead.codePointAt(0)!.toString(16)).toBe('M');
    }
  });
  it('falls back to a neutral glyph when nothing visible is left', () => {
    expect(initialOf('\u200f\u200b')).toBe('\u2022');
    expect(initialOf('\u3164\u2800')).toBe('\u2022');
    expect(initialOf('...')).toBe('\u2022');
    expect(initialOf('')).toBe('\u2022');
  });
});

describe('resolveView (a role only ever sees its own screens)', () => {
  it('keeps each role on its own views', () => {
    expect(resolveView('labs', false)).toBe('labs');
    expect(resolveView('profile', false)).toBe('profile');
    expect(resolveView('teacher', true)).toBe('teacher');
    expect(resolveView('content', true)).toBe('content');
  });

  it('sends a role that asks for the other role\'s screen to its own start screen', () => {
    expect(resolveView('teacher', false)).toBe('home');
    expect(resolveView('content', false)).toBe('home');
    expect(resolveView('labs', true)).toBe('teacher');
    expect(resolveView('home', true)).toBe('teacher');
  });

  it('shows the About & demo guide to both roles', () => {
    expect(resolveView('about', false)).toBe('about');
    expect(resolveView('about', true)).toBe('about');
  });
});
