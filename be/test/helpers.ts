import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import type { App, Config } from '../src/app.ts';
import { MISSIONS } from '../src/content.ts';
import type { Step } from '../src/types.ts';

export interface Harness {
  app: App;
  base: string;
  clock: { t: number };
  call: (method: string, path: string, opts?: { token?: string; body?: unknown }) => Promise<{ status: number; body: any; headers: Headers }>;
  signup: (name: string, email?: string, extra?: Record<string, unknown>) => Promise<{ token: string; id: number }>;
  close: () => Promise<void>;
}

export async function harness(cfg: Partial<Config> = {}): Promise<Harness> {
  const clock = { t: 1_700_000_000_000 };
  const app = createApp({ dbPath: ':memory:', secret: 'test-secret', corsOrigin: '*', teacherInviteCode: 'FACULTY-INVITE', limits: { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000 }, now: () => clock.t, ...cfg });
  await new Promise<void>((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  let n = 0;
  const call: Harness['call'] = async (method, path, opts = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  };
  const signup: Harness['signup'] = async (name, email = `user${++n}@uni.edu`, extra = {}) => {
    const r = await call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });
    if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.body)}`);
    return { token: r.body.token, id: r.body.user.id };
  };
  return { app, base, clock, call, signup, close: () => app.close() };
}

/** The correct response for a step, built from the secret key. Test-only. */
export function correct(step: Step): unknown {
  const k = step.key;
  switch (k.kind) {
    case 'choice': return { choice: k.answer };
    case 'decision': return { decision: k.answer };
    case 'point': return { x: k.x, y: k.y };
    case 'order': return { order: k.order };
    case 'match': return { pairs: k.pairs };
  }
}

/** A well-formed but incorrect response. */
export function wrong(step: Step): unknown {
  const k = step.key;
  switch (k.kind) {
    case 'choice': return { choice: step.data.options!.find((o) => o.id !== k.answer)!.id };
    case 'decision': { const ids = (step.data.options ?? [{ id: 'accept' }, { id: 'reject' }, { id: 'repeat' }]).map((o) => o.id); return { decision: ids.find((i) => i !== k.answer) }; }
    case 'point': return { x: (k.x + 50) % 100, y: (k.y + 50) % 100 };
    case 'order': { const o = [...k.order]; [o[0], o[1]] = [o[1]!, o[0]!]; return { order: o }; }
    case 'match': {
      const lefts = Object.keys(k.pairs); const rights = lefts.map((l) => k.pairs[l]!);
      return { pairs: Object.fromEntries(lefts.map((l, i) => [l, rights[(i + 1) % rights.length]!])) };
    }
  }
}

export const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

/** Starts a mission and solves it perfectly; returns the final answer payload. */
export async function solve(h: Harness, token: string, missionId: string, opts: { elapsedSec?: number } = {}) {
  const m = mission(missionId);
  const s = await h.call('POST', `/api/missions/${missionId}/start`, { token });
  if (s.status !== 201) throw new Error(`start ${missionId}: ${s.status} ${JSON.stringify(s.body)}`);
  const attemptId = s.body.attempt.attemptId as string;
  let last: any;
  for (const [i, step] of m.steps.entries()) {
    if (i === m.steps.length - 1 && opts.elapsedSec !== undefined) h.clock.t += opts.elapsedSec * 1000;
    last = await h.call('POST', `/api/attempts/${attemptId}/answer`, { token, body: { stepId: step.id, response: correct(step) } });
    if (last.status !== 200 || !last.body.correct) throw new Error(`answer ${step.id}: ${JSON.stringify(last.body)}`);
  }
  return { attemptId, last: last.body };
}
