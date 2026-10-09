import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MISSION_BY_ID, exitCode } from '../src/content.ts';
import { computeScore } from '../src/scoring.ts';
import { correct, harness, solve, wrong } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Regression tests for the adversarial backend audit (ADV-01 .. ADV-07).
let h: Harness;
before(async () => { h = await harness({ teacherInviteCode: 'T-INVITE' }); });
after(async () => { await h.close(); });

const mission = (id: string) => MISSION_BY_ID.get(id)!;

/** A response whose first field, when read by the pre-transaction check, runs `side` once (a "second process" slipping in). */
function racing(step: Parameters<typeof correct>[0], side: () => void): unknown {
  const base = correct(step) as Record<string, unknown>;
  const key = Object.keys(base)[0]!;
  const value = base[key];
  let fired = false;
  const out: Record<string, unknown> = { ...base };
  Object.defineProperty(out, key, { enumerable: true, get() { if (!fired) { fired = true; side(); } return value; } });
  return out;
}

test('ADV-01: an answer whose attempt moved on after the first check is rejected inside the transaction (no double step, no skipped step)', async () => {
  const u = await h.signup('Race Student');
  const m = mission('mic-01'); // three steps: the stale answer would skip one
  const a = (await h.call('POST', '/api/missions/mic-01/start', { token: u.token })).body.attempt;
  const response = racing(m.steps[0]!, () => {
    // Another process answered the same step between the stale read and the write lock.
    h.app.db.prepare('UPDATE attempts SET current_step = current_step + 1 WHERE id = ?').run(a.attemptId);
  });
  assert.throws(() => h.app.game.answer(u.id, a.attemptId, m.steps[0]!.id, response), (e: any) => e.status === 409 && e.code === 'wrong_step');
  const after = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
  assert.equal(after.stepsSolved, 1, 'exactly the other process\'s step is applied, nothing from the rejected answer');
  assert.equal(after.wrongTotal, 0);
});

test('ADV-01: an answer for an attempt that completed after the first check is rejected, not scored twice', async () => {
  const u = await h.signup('Race Finisher');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  const response = racing(m.steps[0]!, () => {
    h.app.db.prepare("UPDATE attempts SET status = 'completed', completed_at = ? WHERE id = ?").run(h.clock.t, a.attemptId);
  });
  assert.throws(() => h.app.game.answer(u.id, a.attemptId, m.steps[0]!.id, response), (e: any) => e.status === 409 && e.code === 'attempt_finished');
  assert.equal((h.app.db.prepare('SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ?').get(u.id) as { n: number }).n, 0);
});

test('ADV-01: starting a mission another request already started resumes it instead of failing', async () => {
  const u = await h.signup('Race Starter');
  const first = h.app.game.startMission(u.id, 'hem-01');
  assert.equal(first.resumed, false);
  const again = h.app.game.startMission(u.id, 'hem-01');
  assert.equal(again.resumed, true);
  assert.equal(again.attempt.attemptId, first.attempt.attemptId);
});

test('ADV-02: when penalties would push a mission below zero they are capped and the ledger sums to the awarded score', async () => {
  const m = mission('hem-01');
  const s = computeScore({ profile: m.scoring, stepCount: m.steps.length, firstTrySteps: 0, wrong: 40, hints: 2, elapsedSec: m.timeLimitSec, timeLimitSec: m.timeLimitSec });
  assert.equal(s.total, 0);
  assert.equal(s.rows.reduce((a, r) => a + r.points, 0), s.total);
  assert.ok(s.rows.every((r) => r.points >= 0 || r.kind === 'penalty'), 'no positive filler row: only penalties shrink');
  assert.ok(s.rows.find((r) => r.id === 'wrong')!.reason.includes('capped'));
  const small = computeScore({ profile: m.scoring, stepCount: m.steps.length, firstTrySteps: m.steps.length, wrong: 1, hints: 0, elapsedSec: 10, timeLimitSec: m.timeLimitSec });
  assert.ok(!small.rows.some((r) => r.reason.includes('capped')), 'a normal penalty is untouched');
});

test('ADV-03: a deeply nested response never turns an answer into a 500', async () => {
  const u = await h.signup('Deep Nester');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  const depth = 9000;
  const deep = `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
  const body = `{"stepId":${JSON.stringify(m.steps[0]!.id)},"response":${JSON.stringify(correct(m.steps[0]!)).slice(0, -1)},"z":${deep}}}`;
  const res = await fetch(`${h.base}/api/attempts/${a.attemptId}/answer`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${u.token}` }, body });
  assert.notEqual(res.status, 500);
});

test('ADV-05: a class name needs visible characters', async () => {
  const t = await h.signup('Prof Names', 'prof-names@uni.edu', { teacherInviteCode: 'T-INVITE' });
  for (const name of ['   ', 'a ', '\u0000\u0000']) {
    const res = await h.call('POST', '/api/classes', { token: t.token, body: { name } });
    assert.equal(res.status, 400, JSON.stringify(name));
  }
  assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: '  L1 Biologie  ' } })).body.name, 'L1 Biologie');
});

test('ADV-06: the roster search ignores accents and case', async () => {
  const t = await h.signup('Prof Search', 'prof-search@uni.edu', { teacherInviteCode: 'T-INVITE' });
  const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Search class' } })).body;
  const s = await h.signup('Inès Moreau');
  assert.equal((await h.call('POST', '/api/classes/join', { token: s.token, body: { joinCode: cls.joinCode } })).status, 200);
  for (const q of ['ines', 'INÈS', 'Inès', 'moreau']) {
    const res = await h.call('GET', `/api/classes/${cls.id}/students?q=${encodeURIComponent(q)}`, { token: t.token });
    assert.equal(res.body.total, 1, q);
  }
});

test('ADV-07: content moves only along draft -> reviewed -> approved -> draft', async () => {
  const t = await h.signup('Prof Cycle', 'prof-cycle@uni.edu', { teacherInviteCode: 'T-INVITE' });
  const put = (status: string) => h.call('PUT', '/api/content/missions/mic-03/status', { token: t.token, body: { status } });
  assert.equal((await put('draft')).status, 200);
  assert.equal((await put('approved')).status, 409);
  assert.equal((await put('reviewed')).status, 200);
  const back = await put('draft');
  assert.equal(back.status, 409, 'reviewed -> draft is not part of the cycle');
  assert.equal(back.body.error.code, 'illegal_transition');
  assert.equal((await put('approved')).status, 200);
  assert.equal((await put('reviewed')).status, 409, 'approved -> reviewed is not part of the cycle');
  assert.equal((await put('approved')).status, 200, 're-asking for the current status is a no-op');
  assert.equal((await put('draft')).status, 200);
});

test('wrong answers still count exactly once each (sanity for the in-transaction re-read)', async () => {
  const u = await h.signup('Counter');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  for (let i = 0; i < 3; i++) assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } })).status, 200);
  assert.equal((await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body.wrongTotal, 3);
});

test('R2-B01: control characters and invisible-only text are rejected, never a 500 and never truncated', async () => {
  const u = await h.signup('Name Guard');
  for (const name of ['\u0000', 'A\u0000B', '\u200B\u200B', '\u2800', '\u3164', '\u0301\u0301']) {
    const reg = await h.call('POST', '/api/auth/register', { body: { name, email: `guard${Math.random().toString(36).slice(2)}@uni.edu`, password: 'correct horse battery' } });
    assert.equal(reg.status, 400, `register ${JSON.stringify(name)}`);
    const put = await h.call('PUT', '/api/profile', { token: u.token, body: { name } });
    assert.equal(put.status, 400, `profile ${JSON.stringify(name)}`);
  }
  const email = await h.call('POST', '/api/auth/register', { body: { name: 'Mail Guard', email: 'a\u0000b@uni.edu', password: 'correct horse battery' } });
  assert.equal(email.status, 400);
});

test('R2-B06: wrong unlock codes stop at the limit, a right code unlocks once, a replay is reported as already unlocked', async () => {
  const u = await h.signup('Unlocker');
  for (const id of ['hem-01', 'hem-02', 'hem-03']) await solve(h, u.token, id);
  const unlock = (code: string) => h.call('POST', '/api/labs/hematology/unlock', { token: u.token, body: { code } });
  const bad = exitCode('hematology') === '000' ? '111' : '000';
  for (let i = 0; i < 5; i++) assert.equal((await unlock(bad)).status, 422, `wrong code ${i + 1}`);
  const limited = await unlock(bad);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assert.equal((await unlock(exitCode('hematology'))).status, 429, 'the limit also blocks the right code until the window passes');
  h.clock.t += 11 * 60 * 1000;
  const ok = await unlock(exitCode('hematology'));
  assert.deepEqual([ok.status, ok.body.alreadyUnlocked], [200, false]);
  const replay = await unlock(exitCode('hematology'));
  assert.deepEqual([replay.status, replay.body.alreadyUnlocked], [200, true]);
});

test('405 tells the client which methods exist', async () => {
  const res = await h.call('DELETE', '/api/classes');
  assert.equal(res.status, 405);
  assert.match(res.headers.get('allow') ?? '', /GET.*POST|POST.*GET/);
});

test('R3-01/03/13: the cap is visible in the HUD, the lab results ledger and the public rules', async () => {
  const u = await h.signup('Capped Student');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  for (let i = 0; i < 40; i++) await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
  const hud = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
  assert.ok(hud.penaltyXp >= -m.scoring.base - m.scoring.firstTry - m.scoring.timeMax - m.scoring.noHint, 'the HUD never promises more loss than the mission can award');
  const done = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
  assert.equal(done.body.result.score, 0);
  assert.equal(done.body.result.ledger.reduce((s: number, r: any) => s + r.points, 0), 0);
  await solve(h, u.token, 'hem-02');
  await solve(h, u.token, 'hem-03');
  assert.equal((await h.call('POST', '/api/labs/hematology/unlock', { token: u.token, body: { code: exitCode('hematology') } })).status, 200);
  const results = (await h.call('GET', '/api/labs/hematology/results', { token: u.token })).body;
  const wrongRow = results.ledger.find((r: any) => r.id === 'wrong');
  assert.ok(wrongRow.reason.includes('capped'), wrongRow.reason);
  assert.equal(results.ledger.reduce((s: number, r: any) => s + r.points, 0), results.xp);
  const rules = (await h.call('GET', '/api/rules')).body;
  assert.match(rules.scoreFloor, /never scores below 0/);
});

test('R3-02: every POST/PUT operation declares 400, 413 and 415', async () => {
  const spec = (await h.call('GET', '/api/openapi.json')).body;
  for (const [path, ops] of Object.entries<any>(spec.paths)) {
    for (const method of ['post', 'put']) {
      if (!ops[method]) continue;
      for (const code of ['400', '413', '415']) assert.ok(ops[method].responses[code], `${method.toUpperCase()} ${path} declares ${code}`);
    }
  }
});
