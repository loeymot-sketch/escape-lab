import { describe, expect, it } from 'vitest';
import { blankQuestion, move, splitProblem, toCsv, toNatural, zoneDistance, QUESTION_TYPES } from './rooms';

describe('teacher rooms helpers', () => {
  it('maps a pointer on a scaled picture to natural pixels, clamped to the picture', () => {
    const box = { left: 100, top: 50, width: 836, height: 470.5 };
    expect(toNatural(100 + 418, 50 + 235.25, box, { width: 1672, height: 941 })).toEqual({ x: 836, y: 470.5 });
    expect(toNatural(0, 0, box, { width: 1672, height: 941 })).toEqual({ x: 0, y: 0 });
    expect(toNatural(5000, 5000, box, { width: 1672, height: 941 })).toEqual({ x: 1672, y: 941 });
  });

  it('measures the distance to a zone edge like the server (0 inside, Euclidean outside a rectangle corner)', () => {
    expect(zoneDistance({ id: 'c', label: '', shape: 'circle', x: 100, y: 100, r: 10 }, 115, 100)).toBe(5);
    expect(zoneDistance({ id: 'c', label: '', shape: 'circle', x: 100, y: 100, r: 10 }, 104, 100)).toBe(0);
    expect(zoneDistance({ id: 'r', label: '', shape: 'rect', x: 0, y: 0, w: 10, h: 10 }, 13, 14)).toBe(5);
  });

  it('exports CSV that a spreadsheet opens safely (quotes, separators, no formula injection)', () => {
    const csv = toCsv([['Name', 'Score'], ['=HYPERLINK("x")', '12'], ['Dupont, Léa', 'a "b"']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Dupont, Léa","a ""b"""');
  });

  it('points a server problem at its question', () => {
    expect(splitProblem('room.questions[2].options[1].label is required')).toEqual({ question: 2, text: 'options[1].label is required' });
    expect(splitProblem('room.title must have at least 2 characters')).toEqual({ question: null, text: 'title must have at least 2 characters' });
  });

  it('creates a blank question of every type with unique ids, and moves items without mutating', () => {
    const ids = new Set(QUESTION_TYPES.map((t) => blankQuestion(t).id));
    expect(ids.size).toBe(QUESTION_TYPES.length);
    const choice = blankQuestion('choice');
    expect(choice.type === 'choice' && choice.options.filter((o) => o.correct)).toHaveLength(1);
    expect(choice.type === 'choice' && choice.options.some((o) => o.trap)).toBe(true);
    const list = [1, 2, 3];
    expect(move(list, 0, 2)).toEqual([2, 3, 1]);
    expect(list).toEqual([1, 2, 3]);
    expect(move(list, 0, -1)).toBe(list);
  });
});
