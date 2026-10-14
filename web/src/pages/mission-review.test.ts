import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { earnedCode, exitReady, investigationPhase, nextSteps, progressDelta, SavedResponse, xpGained } from './mission';
import { normalizeStep } from '../lib/attempt';
import { steps } from '../lib/fixtures';
import { initLang } from '../i18n/core';
import '../i18n/fr';

afterEach(() => initLang('en'));
const render = (step: Parameters<typeof SavedResponse>[0]['step'], answer: Parameters<typeof SavedResponse>[0]['answer']) => {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(createElement(SavedResponse, { step, answer }));
  return host;
};

describe('saved responses display the submitted input for every engine', () => {
  it('names the investigation phase without adding case-specific claims', () => {
    expect(investigationPhase('point')).toBe('Observe');
    expect(investigationPhase('choice')).toBe('Reason');
    expect(investigationPhase('decision')).toBe('Decide');
    expect(investigationPhase('order')).toBe('Reconstruct');
    expect(investigationPhase('match')).toBe('Connect');
  });

  it('shows the chosen label and letter, not the internal id, for a choice or decision', () => {
    const choice = normalizeStep({ ...steps.choice, options: [{ id: 'first', label: 'Microcytic' }, { id: 'second', label: 'Macrocytic' }] });
    const host = render(choice, { choice: 'second' });
    expect(host.textContent).toBe('BMacrocytic');
    expect(host.textContent).not.toContain('second');
    const decision = normalizeStep({ ...steps.decision, options: [{ id: 'accept', label: 'Accept and report' }, { id: 'reject', label: 'Reject and request a new sample' }, { id: 'repeat', label: 'Correct the interference and re-measure' }] });
    expect(render(decision, { decision: 'reject' }).textContent).toContain('Reject and request a new sample');
  });

  it('keeps the submitted ordering, including a different sequence than the initial public arrangement', () => {
    const step = normalizeStep({ ...steps.order, items: [{ id: 'a', label: 'Crystal violet' }, { id: 'b', label: 'Read the slide' }, { id: 'c', label: 'Lugol (mordant)' }] });
    const host = render(step, { order: ['c', 'a', 'b'] });
    expect([...host.querySelectorAll('li')].map((item) => item.textContent)).toEqual(['Lugol (mordant)', 'Crystal violet', 'Read the slide']);
    expect(host.querySelectorAll('button,input,select')).toHaveLength(0);
  });

  it('shows the submitted pair names without reading any answer key', () => {
    const step = normalizeStep({ ...steps.match, left: [{ id: 'a', label: 'Pink colonies on MacConkey agar' }, { id: 'b', label: 'Green pigment with a sweet, fruity odor' }], right: [{ id: 'ecoli', label: 'Escherichia coli' }, { id: 'pseudo', label: 'Pseudomonas aeruginosa' }] });
    const host = render(step, { pairs: { a: 'pseudo', b: 'ecoli' } });
    expect([...host.querySelectorAll('dd')].map((item) => item.textContent)).toEqual(['Pseudomonas aeruginosa', 'Escherichia coli']);
    expect(host.querySelectorAll('button,input,select')).toHaveLength(0);
  });

  it('draws the actual point on the image at its unchanged aspect ratio', () => {
    const host = render(normalizeStep(steps.point), { x: 40, y: 60 });
    const marker = host.querySelector('.marker') as HTMLElement;
    expect(marker.style.left).toBe('40%');
    expect(marker.style.top).toBe('60%');
    expect(host.querySelector('figcaption')?.textContent).toBe('Marker at 40% across, 60% down.');
    expect(host.querySelectorAll('button,input,select')).toHaveLength(0);
  });

  it('translates the saved labels in French while keeping scientific names and coordinates', () => {
    initLang('fr');
    const step = normalizeStep({ ...steps.order, items: [{ id: 'crystal', label: 'Crystal violet' }, { id: 'read', label: 'Read the slide' }] });
    const host = render(step, { order: ['read', 'crystal'] });
    expect([...host.querySelectorAll('li')].map((item) => item.textContent)).toEqual(['Lire la lame', 'Cristal violet']);
    expect(render(normalizeStep(steps.point), { x: 40, y: 60 }).querySelector('figcaption')?.textContent).toBe('Repère à 40 % en largeur, 60 % en hauteur.');
  });
});

describe('xpGained (whether the result adds XP to the total)', () => {
  it('is true only for a new best that really added XP', () => {
    expect(xpGained({ newBest: true, xpAwarded: 180 })).toBe(true);
    expect(xpGained({ newBest: true, xpAwarded: 0 })).toBe(false);
    expect(xpGained({ newBest: false, xpAwarded: 180 })).toBe(false);
    expect(xpGained({ newBest: false, xpAwarded: 0 })).toBe(false);
  });
});

describe('result debrief helpers (presentation of server fields)', () => {
  const base = { lab: { slug: 'hematology', exited: false }, fragments: [7, 4, 2] as (number | null)[] };
  it('offers the exit only when every fragment is earned and the lab is still sealed', () => {
    expect(exitReady(base)).toBe(true);
    expect(exitReady({ ...base, lab: { slug: 'hematology', exited: true } })).toBe(false);
    expect(exitReady({ ...base, fragments: [7, null, 2] })).toBe(false);
    expect(exitReady({ lab: undefined, fragments: undefined })).toBe(false);
    expect(exitReady({ ...base, fragments: [] })).toBe(false);
  });
  it('assembles the earned digits in vault order, never from anything else', () => {
    expect(earnedCode(base)).toBe('742');
    expect(earnedCode({ ...base, fragments: [3, 9, 1, 6] })).toBe('3916');
  });
  it('reports the progress against the previous best only when the server sent one', () => {
    expect(progressDelta({ score: 180, previousBest: 150 })).toBe(30);
    expect(progressDelta({ score: 120, previousBest: 150 })).toBe(-30);
    expect(progressDelta({ score: 180, previousBest: null })).toBeNull();
    expect(progressDelta({ score: 180 })).toBeNull();
  });
});

describe('nextSteps (which mission the debrief proposes, from the server continue target and recommendation)', () => {
  const cont = { kind: 'mission' as const, missionId: 'hem-02', labSlug: 'hematology', title: 'Fix the Sample', resume: false };
  const rec = { missionId: 'mic-01', labSlug: 'microbiology', title: 'Microbe Detective', reason: 'Next mission in an open lab.' };
  it('puts the continue target first and the recommendation second when they differ', () => {
    expect(nextSteps({ mission: { id: 'hem-01' }, continue: cont, recommended: rec })).toEqual({ primary: { missionId: 'hem-02', labSlug: 'hematology', title: 'Fix the Sample', reason: null }, secondary: rec });
  });
  it('never proposes the mission just finished, nor an unlock target, nor a duplicate', () => {
    expect(nextSteps({ mission: { id: 'hem-02' }, continue: cont, recommended: rec })).toEqual({ primary: { ...rec }, secondary: null });
    expect(nextSteps({ mission: { id: 'hem-01' }, continue: { ...cont, kind: 'unlock', missionId: null }, recommended: rec })).toEqual({ primary: rec, secondary: null });
    expect(nextSteps({ mission: { id: 'hem-01' }, continue: cont, recommended: { ...rec, missionId: 'hem-02', title: 'Fix the Sample' } })).toEqual({ primary: { missionId: 'hem-02', labSlug: 'hematology', title: 'Fix the Sample', reason: null }, secondary: null });
    expect(nextSteps({ mission: { id: 'hem-01' } })).toEqual({ primary: null, secondary: null });
  });
});
