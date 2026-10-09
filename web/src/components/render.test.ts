import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameEngine, initialAnswer, type EngineAnswer } from './engines';
import { normalizeStep } from '../lib/attempt';
import { steps } from '../lib/fixtures';
import { CompetencyBars } from '../ui/common';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('option chips', () => {
  it('shows A/B/C for a decision step, never the raw option id', () => {
    const step = normalizeStep({ ...steps.decision, options: [{ id: 'accept', label: 'Accept and report' }, { id: 'reject', label: 'Reject and request a new sample' }, { id: 'repeat', label: 'Correct the interference and re-measure' }] });
    act(() => root.render(createElement(GameEngine, { step, answer: {}, setAnswer: () => undefined, disabled: false })));
    expect(Array.from(host.querySelectorAll('.chip')).map((c) => c.textContent)).toEqual(['A', 'B', 'C']);
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.map((b) => b.querySelector('.opt-label')?.textContent)).toEqual(['Accept and report', 'Reject and request a new sample', 'Correct the interference and re-measure']);
    for (const b of buttons) expect(b.textContent).not.toMatch(/\b(accept|reject|repeat)\b(?! and| the)/);
    expect(host.querySelector('.chip')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('reports the selected option by its server id, not its letter', () => {
    const step = normalizeStep(steps.decision);
    let picked: unknown;
    act(() => root.render(createElement(GameEngine, { step, answer: {}, setAnswer: (a) => { picked = a; }, disabled: false })));
    act(() => { (host.querySelectorAll('button')[1] as HTMLButtonElement).click(); });
    expect(picked).toEqual({ decision: 'reject' });
  });
});

describe('illustrative image frame', () => {
  it('keeps the label outside the clickable button and draws the marker without text', () => {
    const step = normalizeStep(steps.point);
    act(() => root.render(createElement(GameEngine, { step, answer: { x: 40, y: 60 }, setAnswer: () => undefined, disabled: false })));
    const button = host.querySelector('button.scientific')!;
    const label = host.querySelector('.image-watermark')!;
    expect(label.textContent).toBe('Illustrative training image');
    expect(button.contains(label)).toBe(false);
    expect(label.parentElement).toBe(button.parentElement);
    const marker = host.querySelector('.marker') as HTMLElement;
    expect(marker.textContent).toBe('');
    expect(marker.style.left).toBe('40%');
    expect(marker.style.top).toBe('60%');
  });
});

describe('competency bars', () => {
  it('prints each percentage next to a decorative bar, plus the strongest area and advice', () => {
    act(() => root.render(createElement(CompetencyBars, { title: 'Competencies', data: { items: [{ name: 'Hematology interpretation', pct: 92, steps: 4 }, { name: 'Pre-analytical quality', pct: 74, steps: 1 }], strongest: 'Hematology interpretation', improvement: { name: 'Pre-analytical quality', advice: 'Pre-analytical quality: revisit specimen rejection.' } } })));
    const rows = Array.from(host.querySelectorAll('li'));
    expect(rows.map((r) => r.textContent)).toEqual(['Hematology interpretation4 steps92%', 'Pre-analytical quality1 step74%']);
    expect((host.querySelector('.bar i') as HTMLElement).style.width).toBe('92%');
    expect(host.querySelector('.bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.textContent).toContain('Strongest area: Hematology interpretation.');
    expect(host.textContent).toContain('To improve: Pre-analytical quality: revisit specimen rejection.');
  });
  it('says so when there is no competency data and clamps out-of-range bars', () => {
    act(() => root.render(createElement(CompetencyBars, { title: 'x', data: { items: [], strongest: null, improvement: null } })));
    expect(host.textContent).toBe('No competency data yet.');
    act(() => root.render(createElement(CompetencyBars, { title: 'x', data: { items: [{ name: 'A', pct: 140, steps: 1 }], strongest: null, improvement: null } })));
    expect((host.querySelector('.bar i') as HTMLElement).style.width).toBe('100%');
  });
});

describe('order engine keyboard focus (R9-B-01, R10-B-04)', () => {
  function Harness({ items }: { items: Array<{ id: string; label: string }> }) {
    const step = normalizeStep({ ...steps.order, items });
    const [answer, setAnswer] = useState<EngineAnswer>(initialAnswer(step));
    return createElement(GameEngine, { step, answer, setAnswer, disabled: false });
  }
  const labels = () => Array.from(host.querySelectorAll('.drag-row b')).map((b) => b.textContent);
  const press = (name: string) => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    button.focus();
    act(() => { button.click(); });
  };
  const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }, { id: 'c', label: 'Charlie' }];

  // R10-B-04 replaces the R9-B-01 behaviour of jumping to the opposite button: at an end the pressed button stays focused and is
  // aria-disabled (never `disabled`, which would drop focus), so pressing Enter again is a no-op instead of sending the item back.
  it('keeps focus on the pressed Move up button when the item reaches the top, and a further press changes nothing', () => {
    act(() => root.render(createElement(Harness, { items })));
    press('Move up: Bravo');
    expect(labels()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    const active = document.activeElement as HTMLButtonElement;
    expect(active.getAttribute('aria-label')).toBe('Move up: Bravo');
    expect(active.disabled).toBe(false);
    expect(active.getAttribute('aria-disabled')).toBe('true');
    act(() => { active.click(); });
    act(() => { active.click(); });
    expect(labels()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect((document.activeElement as HTMLButtonElement).getAttribute('aria-label')).toBe('Move up: Bravo');
    expect(host.querySelector('p.sr-only[role="status"]')?.textContent).toBe('Bravo is already in position 1 of 3.');
  });

  it('keeps focus on the pressed Move down button when the item reaches the bottom, and a further press changes nothing', () => {
    act(() => root.render(createElement(Harness, { items })));
    press('Move down: Bravo');
    expect(labels()).toEqual(['Alpha', 'Charlie', 'Bravo']);
    const active = document.activeElement as HTMLButtonElement;
    expect(active.getAttribute('aria-label')).toBe('Move down: Bravo');
    expect(active.getAttribute('aria-disabled')).toBe('true');
    act(() => { active.click(); });
    expect(labels()).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect((document.activeElement as HTMLButtonElement).getAttribute('aria-label')).toBe('Move down: Bravo');
  });

  it('R11-B-03: every press on a boundary button touches the live region again, so a screen reader announces it each time', () => {
    act(() => root.render(createElement(Harness, { items })));
    press('Move up: Alpha');
    const status = host.querySelector('p.sr-only[role="status"]')!;
    const observer = new MutationObserver(() => undefined);
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Move up: Alpha"]')!;
    for (let press_ = 1; press_ <= 3; press_ += 1) {
      act(() => { button.click(); });
      const seen = observer.takeRecords();
      expect(seen.length, `press ${press_} changed the live region`).toBeGreaterThan(0);
      expect(status.textContent).toBe('Alpha is already in position 1 of 3.');
    }
    observer.disconnect();
  });

  it('marks only the boundary buttons aria-disabled', () => {
    act(() => root.render(createElement(Harness, { items })));
    const state = (name: string) => host.querySelector(`button[aria-label="${name}"]`)!.getAttribute('aria-disabled');
    expect(state('Move up: Alpha')).toBe('true');
    expect(state('Move down: Alpha')).toBeNull();
    expect(state('Move down: Charlie')).toBe('true');
    expect(state('Move up: Charlie')).toBeNull();
  });

  it('keeps focus on the same button while it is still usable', () => {
    act(() => root.render(createElement(Harness, { items })));
    press('Move up: Charlie');
    expect((document.activeElement as HTMLButtonElement).getAttribute('aria-label')).toBe('Move up: Charlie');
  });
});

describe('mission result XP note (R9-B-13)', () => {
  it('announces a personal best only when XP was really added', async () => {
    const { resultXpNote } = await import('../pages/mission');
    expect(resultXpNote({ newBest: true, xpAwarded: 168 })).toBe('New personal best: +168 XP added to your total.');
    expect(resultXpNote({ newBest: true, xpAwarded: 0 })).toBe('No XP was added to your total.');
    expect(resultXpNote({ newBest: false, xpAwarded: 0 })).toBe('This replay did not beat your best score, so your total XP is unchanged.');
  });
});
