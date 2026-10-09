// Round 17 backend fixes (R17-A-01 .. R17-A-04). Written before the fixes: each test failed on the round-16 code (see the fix report).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { leaksAnswer, presentedOptions } from '../src/assistant.ts';
import { MISSIONS, MISSION_BY_ID } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';
import { correct, harness } from './helpers.ts';
import type { Harness } from './helpers.ts';
import type { DatabaseSync } from 'node:sqlite';

const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const step = (id: string) => MISSIONS.flatMap((m) => m.steps).find((s) => s.id === id)!;

// ------------------------------------------------------------------ R17-A-01
/** hint_log rows == hints_total == step_results.hints, and (when completed) result_json.stats.hintsUsed too; returns the list of broken attempts. */
function hintMismatches(db: DatabaseSync): string[] {
  const out: string[] = [];
  const rows = db.prepare(`SELECT a.id, a.status, a.hints_total ht, a.result_json rj,
      (SELECT COALESCE(SUM(hints),0) FROM step_results WHERE attempt_id = a.id) sr,
      (SELECT COUNT(*) FROM hint_log WHERE attempt_id = a.id) hl FROM attempts a`).all() as Array<{ id: string; status: string; ht: number; rj: string | null; sr: number; hl: number }>;
  for (const r of rows) {
    const frozen = r.rj ? (JSON.parse(r.rj) as { stats: { hintsUsed: number } }).stats.hintsUsed : r.ht;
    if (r.ht !== r.sr || r.ht !== r.hl || r.ht !== frozen) out.push(`${r.id} ${r.status} hints_total=${r.ht} step_results=${r.sr} hint_log=${r.hl} result_json=${frozen}`);
  }
  return out;
}

test('R17-A-01: a hint that finishes after the attempt was COMPLETED in another process keeps its charge, its row and the frozen result (no refund)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-r17-'));
  try {
    const path = join(dir, 'h.db');
    let release!: (v: string | null) => void;
    const slow = { hint: () => new Promise<string | null>((r) => { release = r; }) };
    const dbA = openDb(path); const dbB = openDb(path);
    const clock = { t: 1_700_000_000_000 };
    const gA = new Game(dbA, { now: () => clock.t, assistant: slow }); const gB = new Game(dbB, { now: () => clock.t });
    const uid = gA.createAccount('a@x.org', 'Stu A', 'x', 'student', clock.t);
    const m = MISSION_BY_ID.get('mic-01')!;
    const id = gA.startMission(uid, 'mic-01').attempt.attemptId;
    const pendingHint = gA.hint(uid, id, m.steps[0]!.id).then((v) => ({ v }), (e) => ({ e: e as { code?: string } }));
    await new Promise((r) => setTimeout(r, 5));
    clock.t += 1000;
    for (const s of m.steps) gB.answer(uid, id, s.id, correct(s)); // the OTHER process completes the attempt; its result already counts the hint
    const frozen = JSON.parse((dbA.prepare('SELECT result_json FROM attempts WHERE id = ?').get(id) as { result_json: string }).result_json) as { stats: { hintsUsed: number } };
    assert.equal(frozen.stats.hintsUsed, 1);
    release('Think about the stain.');
    await pendingHint;
    const a = dbA.prepare('SELECT hints_total, status FROM attempts WHERE id = ?').get(id) as { hints_total: number; status: string };
    assert.equal(a.status, 'completed');
    assert.equal(a.hints_total, 1, 'the charge stays: the frozen result already contains it');
    assert.equal((dbA.prepare('SELECT COUNT(*) n FROM hint_log WHERE attempt_id = ?').get(id) as { n: number }).n, 1);
    assert.deepEqual(hintMismatches(dbA), []);
    // No No-Hint badge for an attempt whose ledger shows a hint.
    assert.equal((dbA.prepare("SELECT COUNT(*) n FROM badges_earned WHERE user_id = ? AND badge_id = 'no-hint'").get(uid) as { n: number }).n, 0);
    dbA.close(); dbB.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R17-A-01: a hint that finishes after the attempt EXPIRED (no frozen result) is still refunded with its row', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-r17-'));
  try {
    const path = join(dir, 'h.db');
    let release!: (v: string | null) => void;
    const slow = { hint: () => new Promise<string | null>((r) => { release = r; }) };
    const db = openDb(path);
    const clock = { t: 1_700_000_000_000 };
    const g = new Game(db, { now: () => clock.t, assistant: slow });
    const uid = g.createAccount('a@x.org', 'Stu A', 'x', 'student', clock.t);
    const m = MISSION_BY_ID.get('mic-01')!;
    const id = g.startMission(uid, 'mic-01').attempt.attemptId;
    const p = g.hint(uid, id, m.steps[0]!.id).then(() => 'ok', (e) => (e as { code: string }).code);
    await new Promise((r) => setTimeout(r, 5));
    clock.t += m.timeLimitSec * 1000 + 5000;
    release('Think about the stain.');
    assert.equal(await p, 'time_expired');
    assert.deepEqual(hintMismatches(db), []);
    assert.equal((db.prepare('SELECT hints_total n FROM attempts WHERE id = ?').get(id) as { n: number }).n, 0);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R17-A-01: 3 threads (= 3 processes) playing the same students with slow hints: 0 attempts where hints_total, hint_log, step_results and result_json disagree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-r17-'));
  try {
    const path = join(dir, 'stress.db');
    const db = openDb(path);
    const game = new Game(db);
    const uids = [1, 2, 3].map((i) => game.createAccount(`s${i}@x.org`, `Stu ${i}`, 'x', 'student', Date.now()));
    db.close();
    const run = () => new Promise<Record<string, number>>((res, rej) => {
      const w = new Worker(new URL('./r17-hint-worker.ts', import.meta.url), { workerData: { path, uids, ms: 4000 } });
      w.once('message', res); w.once('error', rej);
    });
    const stats = await Promise.all([run(), run(), run()]);
    const check = openDb(path);
    const completed = (check.prepare("SELECT COUNT(*) n FROM attempts WHERE status = 'completed'").get() as { n: number }).n;
    const bad = hintMismatches(check);
    const hinted = (check.prepare("SELECT COUNT(*) n FROM attempts WHERE status = 'completed' AND hints_total > 0").get() as { n: number }).n;
    check.close();
    assert.ok(completed > 20, `the stress must complete attempts (${completed})`);
    assert.ok(hinted > 5, `the stress must buy hints on completed attempts (${hinted})`);
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${completed} completed attempts disagree (${JSON.stringify(stats)})`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R17-A-02
test('R17-A-02: ordinary AI openers starting with the article "A" pass on a step whose answer is A, the letter forms are still dropped', () => {
  const s = step('hem-03-s1'); // correct A
  assert.equal(presentedOptions(s).findIndex((o) => o.id === (s.key as { answer: string }).answer), 0);
  for (const t of ['A first look at the red cell indices will narrow this down.', 'A likely cause is reduced iron stores, so check the indices.', 'A most useful clue is the MCV.',
    'A clearly abnormal MCV should guide you.', 'A just reading of the MCV is enough.', 'A also useful check is the RDW.', 'A now familiar pattern appears in the indices.',
    'A simple comparison with the reference range helps.', 'A single index is enough here.', 'A quick check of the reference range will help.', 'A good approach is to compare the MCV with the range.',
    'A key point: look at the cell size.', 'A low MCV points at small cells.', 'A patient with a low ferritin.', 'A once common pattern.', 'A here useful clue.',
  ]) assert.equal(leaksAnswer(t, s), false, `should pass ${JSON.stringify(t)}`);
  for (const t of ['Option A', 'A is correct', 'A is the best choice', 'A seems plausible.', 'A looks right', 'Choose A', 'Choose A.', 'Try A', 'Stay with A', 'What about A?', '(A)', 'A)', '**A**', 'Answer: A', 'The answer is A', 'A, definitely', 'Look at A.',
  ]) assert.equal(leaksAnswer(t, s), true, `should reject ${JSON.stringify(t)}`);
});

test('R17-A-02: zero false positives on every faculty text of every step whose answer is A', () => {
  const guarded = MISSIONS.flatMap((m) => m.steps).filter((s) => (s.key.kind === 'choice' || s.key.kind === 'decision') && presentedOptions(s).findIndex((o) => o.id === (s.key as { answer: string }).answer) === 0);
  assert.ok(guarded.length >= 3);
  const fp: string[] = [];
  for (const s of guarded) for (const t of [...s.hints, s.prompt, ...(s.recheck ? [s.recheck] : []), ...(s.context ? [s.context] : [])] as string[]) if (typeof t === 'string' && leaksAnswer(t, s)) fp.push(`${s.id}: ${t}`);
  assert.deepEqual(fp, []);
});

// ------------------------------------------------------------------ R17-A-03
const SURR = ['\ud800', '\udc00', '\udbff'];
async function surrogateCases(h: Harness) {
  const stamp = Date.now();
  // email
  for (const [i, s] of SURR.entries()) {
    const r = await h.call('POST', '/api/auth/register', { body: { name: 'Stu Email', email: `e${stamp}${i}${s}@ex.org`, password: 'correct horse battery' } });
    assert.equal(r.status, 400, `register email ${i}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error.code, 'validation_error');
    assert.match(JSON.stringify(r.body), /surrogate/);
  }
  // password
  const pw = await h.call('POST', '/api/auth/register', { body: { name: 'Stu Pw', email: `p${stamp}@ex.org`, password: 'correct-horse-9\ud800' } });
  assert.equal(pw.status, 400, JSON.stringify(pw.body));
  // teacherInviteCode and name
  assert.equal((await h.call('POST', '/api/auth/register', { body: { name: 'Stu Inv', email: `i${stamp}@ex.org`, password: 'correct horse battery', teacherInviteCode: 'x\ud800' } })).status, 400);
  assert.equal((await h.call('POST', '/api/auth/register', { body: { name: 'Stu N\ud800', email: `n${stamp}@ex.org`, password: 'correct horse battery' } })).status, 400);
  // a normal account, then login attempts
  const u = await h.signup('Stu Ok', `ok${stamp}@ex.org`);
  assert.ok(u.token);
  const l1 = await h.call('POST', '/api/auth/login', { body: { email: `ok${stamp}\ud800@ex.org`, password: 'correct horse battery' } });
  assert.equal(l1.status, 400, JSON.stringify(l1.body));
  const l2 = await h.call('POST', '/api/auth/login', { body: { email: `ok${stamp}@ex.org`, password: 'correct horse battery\ud800' } });
  assert.equal(l2.status, 400, JSON.stringify(l2.body));
  assert.equal((await h.call('POST', '/api/auth/login', { body: { email: `ok${stamp}@ex.org`, password: 'correct horse battery' } })).status, 200);
  // profile fields
  const base = (await h.call('GET', '/api/profile', { token: u.token })).body;
  for (const [field, value] of [['program', 'Bio\ud800logy'], ['studyLevel', 'L\udc003'], ['name', 'Ann\ud800']] as const) {
    const r = await h.call('PUT', '/api/profile', { token: u.token, body: { [field]: value } });
    assert.equal(r.status, 400, `${field}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error.code, 'validation_error');
  }
  const after = (await h.call('GET', '/api/profile', { token: u.token })).body;
  assert.equal(JSON.stringify(after), JSON.stringify(base), 'a rejected update changes nothing');
  // well-formed astral text still works in every field
  const ok = await h.call('PUT', '/api/profile', { token: u.token, body: { program: 'Bio \u{1F9EC} logy', studyLevel: 'L3 \u{1F393}', name: 'Zoë \u{1F600} Lee' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await h.call('GET', '/api/profile', { token: u.token })).body.user.program, 'Bio \u{1F9EC} logy');
}

test('R17-A-03: a lone surrogate in e-mail, password, program, studyLevel, name or invite code is a 400 validation_error (register, login, profile)', async () => {
  const h = await harness({ limits: OPEN });
  try { await surrogateCases(h); } finally { await h.close(); }
});

test('R17-A-03: the generic rule also covers fields without a pattern (class code, join code, answer step id)', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const u = await h.signup('Stu Two');
    assert.equal((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: 'ABC12\ud800' } })).status, 400);
    const s = await h.call('POST', '/api/missions/mic-01/start', { token: u.token });
    const r = await h.call('POST', `/api/attempts/${s.body.attempt.attemptId}/answer`, { token: u.token, body: { stepId: 'x\ud800', response: {} } });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.match(JSON.stringify(r.body), /surrogate/);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R17-A-04
test('R17-A-04: the shared Node-level response declares that protocol-level 400 errors exist too (not per operation), and the document stays valid', async () => {
  const h = await harness();
  try {
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    const d = spec.components.responses.HeaderTooLarge.description as string;
    assert.match(d, /400 Bad Request/);
    assert.match(d, /malformed request line/);
    // Every $ref resolves, and every operation still references the shared response.
    const refs = new Set<string>();
    JSON.stringify(spec, (k, v) => { if (k === '$ref') refs.add(v as string); return v; });
    for (const r of refs) { let node: any = spec; for (const part of r.slice(2).split('/')) node = node?.[part]; assert.ok(node, `${r} resolves`); }
    for (const item of Object.values(spec.paths) as any[]) for (const op of Object.values(item) as any[]) assert.equal(op.responses['431'].$ref, '#/components/responses/HeaderTooLarge');
  } finally { await h.close(); }
});
