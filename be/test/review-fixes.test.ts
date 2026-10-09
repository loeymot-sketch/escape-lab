import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { forbiddenPhrases, leaksAnswer } from '../src/assistant.ts';
import { configFromEnv } from '../src/app.ts';
import { MISSION_BY_ID, exitCode } from '../src/content.ts';
import { RateLimiter } from '../src/http.ts';
import { harness, solve } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Regression tests for the deep code review (ReDoS, login concurrency, limiter pruning, media type, blank env, leak guard,
// Master Lab counting, result() expiry).
let h: Harness;
before(async () => { h = await harness({ teacherInviteCode: 'T-INVITE' }); });
after(async () => { await h.close(); });

test('an oversized, backtracking-shaped email is refused fast (the pattern never runs on it)', async () => {
  const email = `a@${'b.'.repeat(20_000)}@c`;
  const started = performance.now();
  const res = await h.call('POST', '/api/auth/register', { body: { name: 'ReDoS', email, password: 'correct horse battery' } });
  const ms = performance.now() - started;
  assert.equal(res.status, 400);
  assert.ok(ms < 200, `took ${Math.round(ms)} ms`);
});

test('concurrent wrong passwords count against each other: the per-account limit holds', async () => {
  const p = await harness({ limits: { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000 } });
  try {
    await p.signup('Victim', 'victim@uni.edu');
    const replies = await Promise.all(Array.from({ length: 20 }, () => p.call('POST', '/api/auth/login', { body: { email: 'victim@uni.edu', password: 'definitely wrong pw' } })));
    const unauthorized = replies.filter((r) => r.status === 401).length;
    const limited = replies.filter((r) => r.status === 429).length;
    assert.equal(unauthorized, 8, 'exactly the per-account budget of failures is evaluated');
    assert.equal(limited, 12);
    // Once locked, the correct password from the same address waits for the window too (the lock is per address + account).
    const ok = await p.call('POST', '/api/auth/login', { body: { email: 'victim@uni.edu', password: 'correct horse battery' } });
    assert.equal(ok.status, 429, 'this address is locked for this account until the window passes');
  } finally { await p.close(); }
});

test('a successful sign-in gives back the slots it reserved', async () => {
  const p = await harness({ limits: { registerPerHour: 10_000, loginFailuresPerIp: 3, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000 } });
  try {
    await p.signup('Busy Class', 'class@uni.edu');
    for (let i = 0; i < 10; i++) assert.equal((await p.call('POST', '/api/auth/login', { body: { email: 'class@uni.edu', password: 'correct horse battery' } })).status, 200);
  } finally { await p.close(); }
});

test('the limiter prunes each key with its own window (a 60 s key never clears a 10 min lockout)', () => {
  let t = 0;
  const l = new RateLimiter(() => t);
  for (let i = 0; i < 3; i++) l.hit('lock', 3, 600_000);
  assert.throws(() => l.hit('lock', 3, 600_000), (e: any) => e.status === 429);
  t += 95_000;
  for (let i = 0; i < 10_050; i++) l.hit(`short:${i}`, 100, 60_000);
  t += 20_000;
  l.hit('short:trigger', 100, 60_000);
  assert.throws(() => l.peek('lock', 3, 600_000), (e: any) => e.status === 429, 'the 10-minute lockout survived the sweep');
});

test('only the application/json media type is accepted (not a CORS-safelisted text/plain carrying the words)', async () => {
  for (const type of ['text/plain; x=application/json', 'text/plain', 'application/jsonx']) {
    const res = await fetch(`${h.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': type }, body: JSON.stringify({ email: 'a@b.cd', password: 'whatever pw' }) });
    assert.equal(res.status, 415, type);
  }
  const ok = await fetch(`${h.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ email: 'nobody@b.cd', password: 'whatever pw' }) });
  assert.equal(ok.status, 401);
});

test('blank environment values fall back to the defaults (no throw-away temporary database)', () => {
  const cfg = configFromEnv({ DB_PATH: '', CORS_ORIGIN: '' } as NodeJS.ProcessEnv);
  assert.equal(cfg.dbPath, './data/escape-lab.db');
  assert.equal(cfg.corsOrigin, '*');
});

test('the AI hint guard also protects decision steps that use the default options', () => {
  const step = MISSION_BY_ID.get('hem-02')!.steps[0]!;
  assert.equal(step.data.options, undefined, 'this step relies on the default decisions');
  assert.ok(forbiddenPhrases(step).length > 0);
  for (const phrase of forbiddenPhrases(step)) assert.equal(leaksAnswer(`Maybe: ${phrase}.`, step), true);
});

test('the Master Lab counts the same everywhere: leaderboard labs equal the dashboard, and analytics never flags it', async () => {
  const t = await h.signup('Prof Master', 'prof-master@uni.edu', { teacherInviteCode: 'T-INVITE' });
  const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Master class' } })).body;
  const u = await h.signup('Full Escaper');
  assert.equal((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: cls.joinCode } })).status, 200);
  for (const slug of ['hematology', 'microbiology', 'biochemistry']) {
    for (const m of [...MISSION_BY_ID.values()].filter((x) => x.labSlug === slug).sort((a, b) => a.ordinal - b.ordinal)) await solve(h, u.token, m.id);
    assert.equal((await h.call('POST', `/api/labs/${slug}/unlock`, { token: u.token, body: { code: exitCode(slug) } })).status, 200);
  }
  await solve(h, u.token, 'master-01');
  assert.equal((await h.call('POST', '/api/labs/master/unlock', { token: u.token, body: { code: exitCode('master') } })).status, 200);
  const dashboard = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
  const board = (await h.call('GET', '/api/leaderboard?scope=all&cohort=class', { token: u.token })).body;
  assert.equal(board.me.labs, dashboard.labsCompleted);
  const analytics = (await h.call('GET', `/api/classes/${cls.id}/analytics`, { token: t.token })).body;
  assert.notEqual(analytics.hardestMission?.labSlug, 'master');
  assert.ok(!analytics.missions.some((m: any) => m.labSlug === 'master' && m.needsAttention));
});

test('result() answers time_expired for an expired attempt whether or not something read it first', async () => {
  const u = await h.signup('Late Reader');
  const m = MISSION_BY_ID.get('hem-01')!;
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  h.clock.t += (m.timeLimitSec + 5) * 1000;
  try {
    const res = await h.call('GET', `/api/attempts/${a.attemptId}/result`, { token: u.token });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'time_expired');
  } finally { h.clock.t -= (m.timeLimitSec + 5) * 1000; }
});
