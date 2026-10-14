import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadgeRow } from './progress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const earned = { id: 'first-escape', name: 'First Escape', description: 'Open your first lab exit.', earned: true, earnedAt: Date.UTC(2026, 9, 10, 8, 5) };
const locked = { id: 'no-hint', name: 'No Hint', description: 'Complete a mission without using a hint.', earned: false, earnedAt: null };

describe('BadgeRow (server-awarded milestones)', () => {
  it('dates an earned badge with the server timestamp and shows the trophy', () => {
    act(() => root.render(createElement('ul', null, createElement(BadgeRow, { badge: earned }))));
    const time = host.querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe(new Date(earned.earnedAt).toISOString());
    expect(time?.textContent).toMatch(/^Earned on /);
    expect(host.querySelector('.badge-icon svg')?.classList.contains('lucide-trophy')).toBe(true);
    expect(host.querySelector('.badge-state')?.textContent).toBe('EARNED');
  });

  it('shows a lock and no date for a badge not yet earned', () => {
    act(() => root.render(createElement('ul', null, createElement(BadgeRow, { badge: locked }))));
    expect(host.querySelector('time')).toBeNull();
    expect(host.querySelector('.badge-icon svg')?.classList.contains('lucide-lock-keyhole')).toBe(true);
    expect(host.querySelector('.badge-state')?.textContent).toBe('LOCKED');
  });

  it('never invents a date for an earned badge whose timestamp is missing or unreadable', () => {
    act(() => root.render(createElement('ul', null, createElement(BadgeRow, { badge: { ...earned, earnedAt: null } }))));
    expect(host.querySelector('time')).toBeNull();
    act(() => root.render(createElement('ul', null, createElement(BadgeRow, { badge: { ...earned, earnedAt: Number.NaN } }))));
    expect(host.querySelector('time')).toBeNull();
  });
});
