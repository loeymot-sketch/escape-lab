import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { PayloadError } from '../lib/guard';
import { ErrorBoundary, ErrorPanel, describeError, useLoad } from './state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe('ErrorBoundary', () => {
  it('contains a render failure behind an alert and recovers on "Try again"', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    const Bomb = () => { if (broken) throw new Error('boom'); return createElement('p', null, 'recovered'); };
    act(() => root.render(createElement(ErrorBoundary, null, createElement(Bomb))));
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Something went wrong on this screen');
    expect(alert?.textContent).toContain('Your progress is stored on the server');
    broken = false;
    act(() => { (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Try again') as HTMLButtonElement).click(); });
    expect(host.textContent).toBe('recovered');
  });
});

describe('describeError', () => {
  it('speaks plainly about each failure class', () => {
    expect(describeError(new ApiError(0, 'network_error', 'Cannot reach the Escape Lab server.'))).toContain('Cannot reach');
    expect(describeError(new ApiError(403, 'wrong_role', 'This endpoint is for teacher accounts.'))).toBe('This endpoint is for teacher accounts.');
    expect(describeError(new ApiError(404, 'not_found', 'Unknown class.'))).toBe('Unknown class.');
    expect(describeError(new ApiError(503, undefined, 'Temporary outage'))).toBe('Temporary outage');
    expect(describeError(new PayloadError('Invalid server dashboard payload: user.'))).toContain('unexpected response');
    expect(describeError('weird')).toBe('Something went wrong.');
  });

  it('gives a rate limit a retry hint, with or without the server quoting a delay', () => {
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts.', { retryAfterSeconds: 7 }))).toBe('Too many attempts. Try again in 7 seconds.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts.', { retryAfterSeconds: 1 }))).toBe('Too many attempts. Try again in 1 second.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts.', { retryAfterSeconds: 'soon' }))).toBe('Too many attempts. Please wait a moment, then try again.');
    expect(describeError(new ApiError(429, 'rate_limited'))).toContain('try again');
  });

  it('R10-C-09: gives ONE retry instruction when the server message already says "try again"', () => {
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts. Try again shortly.', { retryAfterSeconds: 60 }))).toBe('Too many attempts. Try again in 60 seconds.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts. Try again shortly.'))).toBe('Too many attempts. Try again shortly.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Slow down. Please try again later.', { retryAfterSeconds: 1 }))).toBe('Slow down. Try again in 1 second.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Too many attempts. Try again shortly.', { retryAfterSeconds: 60 })).match(/try again/gi)).toHaveLength(1);
  });
});

describe('describeError copy (round 11)', () => {
  it('R11-B-07: an empty-bodied 5xx (ApiError default message) gets the friendly fallback, not "Request failed (503)"', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(describeError(new ApiError(status))).toBe('The server had a problem. Please retry.');
      expect(describeError(new ApiError(status, undefined, `Request failed (${status})`))).toBe('The server had a problem. Please retry.');
    }
    expect(describeError(new ApiError(503, 'unavailable', 'Settings service unavailable'))).toBe('Settings service unavailable');
  });
  it('R11-B-07: the same for an empty 403, 404 and 429 body', () => {
    expect(describeError(new ApiError(403))).toBe('You do not have access to this area.');
    expect(describeError(new ApiError(404))).toBe('This item could not be found.');
    expect(describeError(new ApiError(429, undefined, 'Request failed (429)', { retryAfterSeconds: 4 }))).toBe('Too many requests. Try again in 4 seconds.');
    expect(describeError(new ApiError(429))).toBe('Too many requests. Please wait a moment, then try again.');
  });
  it('R11-B-02: "Wait before trying again." counts as a retry instruction, and a long delay is given in minutes', () => {
    const lock = (seconds: number) => describeError(new ApiError(429, 'rate_limited', 'Too many incorrect codes. Wait before trying again.', { retryAfterSeconds: seconds }));
    expect(lock(598)).toBe('Too many incorrect codes. Try again in 10 minutes.');
    expect(lock(120)).toBe('Too many incorrect codes. Try again in 2 minutes.');
    expect(lock(119)).toBe('Too many incorrect codes. Try again in 119 seconds.');
    expect(lock(1)).toBe('Too many incorrect codes. Try again in 1 second.');
    expect(lock(598).match(/again/gi)).toHaveLength(1);
  });
});

describe('describeError long waits (R14-B-04)', () => {
  const wait = (seconds: number) => describeError(new ApiError(429, 'rate_limited', 'Too many attempts.', { retryAfterSeconds: seconds }));
  it('speaks minutes up to two hours, then hours up to a day', () => {
    expect(wait(7199)).toBe('Too many attempts. Try again in 2 hours.');
    expect(wait(7200)).toBe('Too many attempts. Try again in 2 hours.');
    expect(wait(3600 * 5 + 1)).toBe('Too many attempts. Try again in 6 hours.');
    expect(wait(86400)).toBe('Too many attempts. Try again in 24 hours.');
  });
  it('R15-B-01: rounds first, then picks the unit, so no figure reads 60 or 120 minutes', () => {
    const cases: Array<[number, string]> = [[59, '59 seconds'], [60, '60 seconds'], [119, '119 seconds'], [120, '2 minutes'], [3540, '59 minutes'], [3599, '1 hour'], [3600, '1 hour'],
      [3601, '61 minutes'], [7140, '119 minutes'], [7141, '2 hours'], [7199, '2 hours'], [7200, '2 hours'], [7201, '3 hours'], [86399, '24 hours'], [86400, '24 hours']];
    for (const [seconds, spoken] of cases) expect(wait(seconds), String(seconds)).toBe(`Too many attempts. Try again in ${spoken}.`);
  });
  it('never prints an absurd figure: beyond a day it just says later', () => {
    for (const seconds of [86401, 1_666_666_667 * 60, 99_999_999_999, 1e21]) {
      const text = wait(seconds);
      expect(text, String(seconds)).toBe('Too many attempts. Try again later.');
    }
    expect(describeError(new ApiError(429, 'rate_limited', 'Wait before trying again.', { retryAfterSeconds: 1e12 }))).toBe('Too many requests. Try again later.');
  });
});

describe('vault unlock messages (R11-B-02)', () => {
  it('routes the 429 lock through describeError: one instruction, a human duration, no invented "short pause"', async () => {
    const { unlockMessage } = await import('../pages/progress');
    expect(unlockMessage(new ApiError(429, 'rate_limited', 'Too many incorrect codes. Wait before trying again.', { retryAfterSeconds: 598 }))).toBe('Too many incorrect codes. Try again in 10 minutes.');
    expect(unlockMessage(new ApiError(429, 'rate_limited', 'Too many incorrect codes. Wait before trying again.', { retryAfterSeconds: 1 }))).toBe('Too many incorrect codes. Try again in 1 second.');
    const wrong = unlockMessage(new ApiError(422, 'incorrect_code', 'That code is not correct.', { attemptsLeft: 2 }));
    expect(wrong).toContain('2 attempts left');
    expect(wrong).not.toContain('short pause');
  });
});

describe('useLoad', () => {
  it('ignores a stale response that arrives after a newer one', async () => {
    const resolvers: Array<(v: string) => void> = [];
    let setDep: (n: number) => void = () => undefined;
    const View = () => {
      const [dep, set] = useState(0);
      setDep = set;
      const { state } = useLoad(() => new Promise<string>((resolve) => { resolvers.push(resolve); }), [dep]);
      return createElement('p', null, state.phase === 'ready' ? state.data : state.phase);
    };
    act(() => root.render(createElement(View)));
    act(() => setDep(1));
    expect(resolvers.length).toBeGreaterThanOrEqual(2);
    const last = resolvers.length - 1;
    await act(async () => { resolvers[last]!('new'); });
    await act(async () => { resolvers[last - 1]!('old'); });
    expect(host.textContent).toBe('new');
  });
});

describe('ErrorPanel heading level (R9-C-08)', () => {
  it('is the page h1 by default and an h2 under a page that already has its own h1', () => {
    act(() => root.render(createElement(ErrorPanel, { error: new Error('x'), title: 'Page failed' })));
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    act(() => root.render(createElement(ErrorPanel, { error: new Error('x'), title: 'Faculty view unavailable', level: 2 })));
    expect(host.querySelectorAll('h1')).toHaveLength(0);
    expect(host.querySelector('h2')?.textContent).toBe('Faculty view unavailable');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('describeError copy (round 12)', () => {
  it('R12-B-02 / R12-C-04: an empty-bodied 4xx of any status gets a sentence, never "Request failed (n)"', () => {
    for (const status of [400, 401, 402, 405, 406, 408, 409, 410, 413, 415, 418, 422, 423, 451]) {
      const text = describeError(new ApiError(status, undefined, `Request failed (${status})`));
      expect(text, String(status)).not.toMatch(/Request failed/);
      expect(text, String(status)).toMatch(/\.$/);
    }
    expect(describeError(new ApiError(413))).toMatch(/too large/i);
    expect(describeError(new ApiError(408))).toMatch(/too long|timed out/i);
  });
  it('R12-B-02: a sentence the server really sent still passes through for every status', () => {
    for (const status of [400, 408, 409, 413, 418, 422]) expect(describeError(new ApiError(status, 'x', 'Exactly this.'))).toBe('Exactly this.');
  });
  it('R12-B-04: a 429 sentence without final punctuation is joined with a sentence break', () => {
    expect(describeError(new ApiError(429, 'rate_limited', 'Slow down', { retryAfterSeconds: 5 }))).toBe('Slow down. Try again in 5 seconds.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Slow down'))).toBe('Slow down. Please wait a moment, then try again.');
    expect(describeError(new ApiError(429, 'rate_limited', 'Slow down!', { retryAfterSeconds: 5 }))).toBe('Slow down! Try again in 5 seconds.');
  });
  it('R12-B-02: the unlock message with attempts left does not print the generic text when the body was empty', async () => {
    const { unlockMessage } = await import('../pages/progress');
    const text = unlockMessage(new ApiError(422, undefined, 'Request failed (422)', { attemptsLeft: 3 }));
    expect(text).not.toMatch(/Request failed/);
    expect(text).toContain('3 attempts left');
  });
});

describe('describeError plain strict-normalizer errors (R16-B-03)', () => {
  it('prefixes the friendly sentence, keeps the technical detail after it', () => {
    expect(describeError(new Error('Invalid server demo login payload: demo.'))).toBe('The server sent an unexpected response. Invalid server demo login payload: demo.');
    expect(describeError(new Error('Invalid server unlock payload: unlocked.'))).toBe('The server sent an unexpected response. Invalid server unlock payload: unlocked.');
  });
  it('leaves every other plain Error alone', () => {
    expect(describeError(new Error('Boom'))).toBe('Boom');
  });
});
