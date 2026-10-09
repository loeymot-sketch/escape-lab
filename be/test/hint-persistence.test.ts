// R9-B-06: a paid hint must survive a refresh, a new Game and a new process, and nothing else may leak with it.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AnthropicHintProvider } from '../src/assistant.ts';
import { MISSION_BY_ID } from '../src/content.ts';
import { migrate, openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';
import { correct, harness, solve } from './helpers.ts';

const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const m = MISSION_BY_ID.get('hem-01')!;
const step = m.steps[0]!;
const fakeFetch = (text: string): typeof fetch => (async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

const start = async (h: Awaited<ReturnType<typeof harness>>, token: string) => (await h.call('POST', `/api/missions/${m.id}/start`, { token })).body.attempt;
const hint = (h: Awaited<ReturnType<typeof harness>>, token: string, id: string, stepId = step.id) => h.call('POST', `/api/attempts/${id}/hint`, { token, body: { stepId } });
const get = async (h: Awaited<ReturnType<typeof harness>>, token: string, id: string) => (await h.call('GET', `/api/attempts/${id}`, { token })).body;

test('R9-B-06: the delivered hints are part of the attempt view, in level order, and survive a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-hint-'));
  const dbPath = join(dir, 'e.db');
  try {
    let h = await harness({ dbPath, limits: OPEN });
    const u = await h.signup('Hinter', 'hinter@uni.edu');
    const a = await start(h, u.token);
    assert.deepEqual(a.step.hintsGiven, [], 'nothing issued yet');
    const r1 = await hint(h, u.token, a.attemptId);
    const r2 = await hint(h, u.token, a.attemptId);
    assert.equal(r1.status, 200); assert.equal(r2.status, 200);
    assert.equal(r1.body.hint, step.hints[0]);
    assert.equal(r2.body.attempt.step.hintsGiven.length, 2, 'the hint response carries the same field');
    const expected = [{ level: 1, text: step.hints[0], source: 'standard' }, { level: 2, text: step.hints[1], source: 'standard' }];
    assert.deepEqual(r2.body.attempt.step.hintsGiven, expected);
    assert.equal(r2.body.attempt.step.hintsOnStep, 2);
    const hud = await get(h, u.token, a.attemptId);
    assert.deepEqual(hud.step.hintsGiven, expected);
    const penalty = hud.penaltyXp;
    await h.close();

    // New process: new database handle, new Game, new HTTP server.
    h = await harness({ dbPath, secret: 'test-secret', limits: OPEN });
    const login = await h.call('POST', '/api/auth/login', { body: { email: 'hinter@uni.edu', password: 'correct horse battery' } });
    const again = await get(h, login.body.token, a.attemptId);
    assert.deepEqual(again.step.hintsGiven, expected);
    assert.equal(again.hintsUsed, 2);
    assert.equal(again.penaltyXp, penalty, 'no extra charge for looking again');
    const resumed = (await h.call('POST', `/api/missions/${m.id}/start`, { token: login.body.token })).body.attempt;
    assert.deepEqual(resumed.step.hintsGiven, expected, 'resuming the attempt returns them too');
    assert.equal((await get(h, login.body.token, a.attemptId)).hintsUsed, 2);
    await h.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R9-B-06: an AI-written hint is stored and returned verbatim, never regenerated', async () => {
  const first = 'Compare the MCV with the reference range first.';
  let calls = 0;
  const h = await harness({ limits: OPEN, assistant: { hint: async () => { calls++; return calls === 1 ? first : 'A different sentence the second time.'; } } });
  try {
    const u = await h.signup('AI Reader');
    const a = await start(h, u.token);
    const r = await hint(h, u.token, a.attemptId);
    assert.equal(r.body.source, 'assistant');
    const callsAfter = calls;
    for (let i = 0; i < 3; i++) {
      const hud = await get(h, u.token, a.attemptId);
      assert.deepEqual(hud.step.hintsGiven, [{ level: 1, text: first, source: 'assistant' }]);
    }
    assert.equal(calls, callsAfter, 'reading the attempt never calls the assistant');
    const r2 = await hint(h, u.token, a.attemptId);
    assert.deepEqual(r2.body.attempt.step.hintsGiven.map((x: { level: number; source: string }) => [x.level, x.source]), [[1, 'assistant'], [2, 'assistant']]);
    assert.equal(r2.body.attempt.step.hintsGiven[0].text, first);
  } finally { await h.close(); }
  // A rejected AI reply (it leaks the answer) is stored as the standard hint it was replaced by.
  const h2 = await harness({ limits: OPEN, assistant: new AnthropicHintProvider('k', 'm', 1000, fakeFetch('The answer is A')) });
  try {
    const u = await h2.signup('Fallback');
    const a = await start(h2, u.token);
    await hint(h2, u.token, a.attemptId);
    assert.deepEqual((await get(h2, u.token, a.attemptId)).step.hintsGiven, [{ level: 1, text: step.hints[0], source: 'standard' }]);
  } finally { await h2.close(); }
});

test('R9-B-06: hints of another step, another user and a finished attempt are never exposed', async () => {
  const h = await harness({ limits: OPEN });
  const m3 = MISSION_BY_ID.get('hem-03')!;
  const step3 = m3.steps[0]!;
  try {
    const u = await h.signup('Owner');
    const other = await h.signup('Other');
    await solve(h, u.token, 'hem-01'); await solve(h, u.token, 'hem-02');
    const a = (await h.call('POST', `/api/missions/${m3.id}/start`, { token: u.token })).body.attempt;
    await hint(h, u.token, a.attemptId, step3.id);
    const secretText = step3.hints[0]!;

    assert.equal((await h.call('GET', `/api/attempts/${a.attemptId}`, { token: other.token })).status, 404, 'another user cannot read the attempt');
    assert.equal((await hint(h, other.token, a.attemptId, step3.id)).status, 404);

    const solved = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step3.id, response: correct(step3) } });
    assert.equal(solved.status, 200);
    const next = await get(h, u.token, a.attemptId);
    assert.equal(next.step.id, m3.steps[1]!.id);
    assert.deepEqual(next.step.hintsGiven, [], 'the next step starts with no hints');
    assert.equal(next.step.hintsOnStep, 0);
    assert.ok(!JSON.stringify(next).includes(secretText), 'the previous step hint text is gone from the view');
    assert.ok(!JSON.stringify(solved.body.attempt ?? {}).includes(secretText));

    // Finish the mission: the completed attempt exposes no step and no hint texts.
    let last = solved;
    for (const s of m3.steps.slice(1)) last = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: s.id, response: correct(s) } });
    const done = await get(h, u.token, a.attemptId);
    assert.equal(done.status, 'completed');
    assert.equal(done.step, null);
    assert.ok(!JSON.stringify(done).includes(secretText));
    assert.ok(!JSON.stringify(last.body.attempt ?? {}).includes(secretText));
  } finally { await h.close(); }
});

test('R9-B-06: an expired attempt exposes no hints', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const u = await h.signup('Late');
    const a = await start(h, u.token);
    await hint(h, u.token, a.attemptId);
    h.clock.t += (m.timeLimitSec + 10) * 1000;
    const late = await get(h, u.token, a.attemptId);
    assert.equal(late.status, 'expired');
    assert.deepEqual(late.step.hintsGiven, [], 'an expired attempt lists no hints');
    assert.ok(!JSON.stringify(late).includes(step.hints[0]!), 'an expired attempt hands out no hint text');
  } finally { await h.close(); }
});

test('R9-B-06: unissued hints never leak (only what was paid for is exposed)', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const u = await h.signup('Frugal');
    const a = await start(h, u.token);
    const before = await get(h, u.token, a.attemptId);
    assert.ok(!JSON.stringify(before).includes(step.hints[0]!));
    await hint(h, u.token, a.attemptId);
    const one = await get(h, u.token, a.attemptId);
    assert.ok(JSON.stringify(one).includes(step.hints[0]!));
    assert.ok(!JSON.stringify(one).includes(step.hints[1]!), 'level 2 text is not exposed before it is bought');
  } finally { await h.close(); }
});

test('R9-B-06: rows written before the column existed are backfilled from the faculty hint, or omitted when AI-written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-hint-old-'));
  const path = join(dir, 'old.db');
  try {
    const old = new DatabaseSync(path);
    old.exec('PRAGMA foreign_keys = ON');
    migrate(old, 5); // the schema just before hint_log.text (v6)
    assert.equal((old.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('hint_log') WHERE name = 'text'").get() as { n: number }).n, 0, 'precondition: the old schema has no text column');
    old.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('o@b.co','Old','x','student',1)").run();
    old.prepare("INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at, hints_total) VALUES ('old-att',1,'hem-01','in_progress',0,1700000000000,2)").run();
    old.prepare("INSERT INTO step_results (attempt_id, step_id, competency, hints) VALUES ('old-att',?,'c',2)").run(step.id);
    old.prepare("INSERT INTO hint_log (attempt_id, step_id, level, source, created_at) VALUES ('old-att',?,1,'standard',1)").run(step.id);
    old.prepare("INSERT INTO hint_log (attempt_id, step_id, level, source, created_at) VALUES ('old-att',?,2,'assistant',2)").run(step.id);
    old.close();

    const db = openDb(path);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('hint_log') WHERE name = 'text'").get() as { n: number }).n, 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM hint_log WHERE text IS NULL').get() as { n: number }).n, 2, 'old rows keep a NULL text');
    const game = new Game(db, { now: () => 1_700_000_000_000 + 1000 });
    const view = game.getAttempt(1, 'old-att') as { hintsUsed: number; step: { hintsOnStep: number; hintsGiven: unknown[] } };
    assert.equal(view.hintsUsed, 2);
    assert.equal(view.step.hintsOnStep, 2);
    assert.deepEqual(view.step.hintsGiven, [{ level: 1, text: step.hints[0], source: 'standard' }], 'level 2 was AI-written and its text is lost: omitted, not invented');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R9-B-06: parallel hint requests cost exactly one hint each and never duplicate a level', async () => {
  // Same process: the in-flight guard lets exactly one through.
  const h = await harness({ limits: OPEN, assistant: { hint: async () => { await new Promise((r) => setTimeout(r, 20)); return null; } } });
  try {
    const u = await h.signup('Racer');
    const a = await start(h, u.token);
    const rs = await Promise.all([hint(h, u.token, a.attemptId), hint(h, u.token, a.attemptId), hint(h, u.token, a.attemptId)]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
    const rows = h.app.db.prepare('SELECT level FROM hint_log WHERE attempt_id = ? ORDER BY level').all(a.attemptId) as Array<{ level: number }>;
    assert.deepEqual(rows.map((r) => r.level), [1]);
    assert.equal((await get(h, u.token, a.attemptId)).hintsUsed, 1);
  } finally { await h.close(); }

  // Two Game instances (as two processes would be) sharing one database file.
  const dir = mkdtempSync(join(tmpdir(), 'el-hint-race-'));
  const dbPath = join(dir, 'race.db');
  try {
    const dbA = openDb(dbPath); const dbB = openDb(dbPath);
    dbA.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('r@b.co','R','x','student',1)").run();
    const slow = { hint: async () => { await new Promise((r) => setTimeout(r, 15)); return null; } };
    const ga = new Game(dbA, { now: () => 1_700_000_000_000, assistant: slow });
    const gb = new Game(dbB, { now: () => 1_700_000_000_000, assistant: slow });
    const { attempt } = ga.startMission(1, m.id) as { attempt: { attemptId: string } };
    const settled = await Promise.allSettled([ga.hint(1, attempt.attemptId, step.id), gb.hint(1, attempt.attemptId, step.id)]);
    assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 2, 'different processes are both served');
    const rows = dbA.prepare('SELECT level, text FROM hint_log WHERE attempt_id = ? ORDER BY level').all(attempt.attemptId) as Array<{ level: number; text: string }>;
    assert.deepEqual(rows.map((r) => r.level), [1, 2]);
    assert.deepEqual(rows.map((r) => r.text), [...step.hints]);
    assert.equal((dbA.prepare('SELECT hints_total FROM attempts WHERE id = ?').get(attempt.attemptId) as { hints_total: number }).hints_total, 2);
    // A third request is refused: no more hints, no extra charge.
    await assert.rejects(() => ga.hint(1, attempt.attemptId, step.id), /No more hints/);
    assert.equal((dbA.prepare('SELECT hints_total FROM attempts WHERE id = ?').get(attempt.attemptId) as { hints_total: number }).hints_total, 2);
    dbA.close(); dbB.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
