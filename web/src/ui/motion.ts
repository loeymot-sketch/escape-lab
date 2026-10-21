import { useEffect, useState } from 'react';

/** True when motion must be kept to a minimum: the server-owned preference (applied to <html>) or the system media query. */
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'true') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Counts from 0 up to `target` with an ease-out curve and settles exactly on it; under reduce-motion the target shows at once.
 * Presentation only: the figure counted to is the server's, the hook never changes it.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion() || target === 0) { setValue(target); return undefined; }
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16);
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : window.clearTimeout;
    const start = performance.now();
    let handle = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) handle = raf(tick);
    };
    handle = raf(tick);
    // The server-owned preference can be applied to <html> after this screen mounted (the profile loads in parallel): honour it at once.
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { if (document.documentElement.dataset.reduceMotion === 'true') { cancel(handle); setValue(target); observer?.disconnect(); } })
      : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion'] });
    return () => { cancel(handle); observer?.disconnect(); };
  }, [target, durationMs]);
  return value;
}
