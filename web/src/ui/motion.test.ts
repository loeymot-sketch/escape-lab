import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion, useCountUp } from './motion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  delete document.documentElement.dataset.reduceMotion;
});

function Counter({ target }: { target: number }) { return createElement('p', null, String(useCountUp(target, 400))); }
const shown = () => Number(host.textContent);

describe('useCountUp (presentation of a server figure)', () => {
  it('counts from 0 up to the server figure and stops exactly there', () => {
    act(() => root.render(createElement(Counter, { target: 180 })));
    expect(shown()).toBe(0);
    act(() => { vi.advanceTimersByTime(100); });
    const early = shown();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(180);
    act(() => { vi.advanceTimersByTime(600); });
    expect(shown()).toBe(180);
  });

  it('shows the figure at once under the server-owned reduce-motion preference', () => {
    document.documentElement.dataset.reduceMotion = 'true';
    act(() => root.render(createElement(Counter, { target: 140 })));
    expect(shown()).toBe(140);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(shown()).toBe(140);
  });

  it('shows a zero score as zero without animating', () => {
    act(() => root.render(createElement(Counter, { target: 0 })));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(shown()).toBe(0);
  });
});

describe('prefersReducedMotion', () => {
  const stubMedia = (matches: boolean) => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener() { /* stub */ }, removeEventListener() { /* stub */ } })) as unknown as typeof window.matchMedia;
    return () => { window.matchMedia = original; };
  };
  it('follows the system media query when no server preference is set', () => {
    const restore = stubMedia(true);
    try { expect(prefersReducedMotion()).toBe(true); } finally { restore(); }
  });
  it('is false when neither the server preference nor the media query asks for it', () => {
    const restore = stubMedia(false);
    try { expect(prefersReducedMotion()).toBe(false); } finally { restore(); }
  });
  it('is true when the server preference is applied, whatever the media query says', () => {
    document.documentElement.dataset.reduceMotion = 'true';
    const restore = stubMedia(false);
    try { expect(prefersReducedMotion()).toBe(true); } finally { restore(); }
  });
});

describe('useCountUp follows a reduce-motion preference that arrives after mount', () => {
  it('jumps to the figure when the server preference is applied to <html> during the animation', async () => {
    act(() => root.render(createElement(Counter, { target: 180 })));
    act(() => { vi.advanceTimersByTime(60); });
    expect(shown()).toBeLessThan(180);
    // The attribute change is observed through a microtask (MutationObserver): let it run before reading the figure.
    await act(async () => { document.documentElement.dataset.reduceMotion = 'true'; await Promise.resolve(); });
    expect(shown()).toBe(180);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(shown()).toBe(180);
  });
});
