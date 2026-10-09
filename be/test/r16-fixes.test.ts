// Round 16 backend fixes (R16-A-01 .. R16-A-07). Written before the fixes: each test failed on the round-15 code (see the fix report).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { leaksAnswer } from '../src/assistant.ts';
import { MISSIONS, MISSION_BY_ID } from '../src/content.ts';
import { DEMO_STUDENT_EMAIL, seedDemo } from '../src/demo.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';
import { classNameKey, nameKey } from '../src/names.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'FACULTY-INVITE';
const step = (id: string) => MISSIONS.flatMap((m) => m.steps).find((s) => s.id === id)!;
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });

// ------------------------------------------------------------------ R16-A-01
test('R16-A-01: a lone surrogate in a class name is a 400, so the uniqueness rule cannot be dodged (and nothing is stored)', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const t = await h.signup('Teacher One', 't1@uni.edu', { teacherInviteCode: INVITE });
    const name = 'Lone\ud800Class';
    const first = await h.call('POST', '/api/classes', { token: t.token, body: { name } });
    assert.equal(first.status, 400, JSON.stringify(first.body));
    assert.equal(first.body.error.code, 'validation_error');
    const second = await h.call('POST', '/api/classes', { token: t.token, body: { name } });
    assert.equal(second.status, 400);
    const listed = (await h.call('GET', '/api/classes', { token: t.token })).body;
    assert.equal((Array.isArray(listed) ? listed : listed.classes).length, 0, 'nothing was stored');
    // The same text with the replacement character itself is a normal name: created once, then refused as a duplicate.
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Lone�Class' } })).status, 201);
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Lone�Class' } })).status, 409);
  } finally { await h.close(); }
});

test('R16-A-01: a lone surrogate in a display name (register, rename) is a 400; a symbol-only teacher name cannot be registered twice', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const bad = '\u{1F9EC}\ud800';
    assert.equal((await register(h, bad, 'a@uni.edu', { teacherInviteCode: INVITE })).status, 400);
    assert.equal((await register(h, bad, 'b@uni.edu', { teacherInviteCode: INVITE })).status, 400);
    assert.equal((await register(h, '\u{1F9EC}�', 'c@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, '\u{1F9EC}�', 'd@uni.edu', { teacherInviteCode: INVITE })).status, 409);
    // Rename.
    const s = await h.signup('Student Name');
    const r = await h.call('PUT', '/api/profile', { token: s.token, body: { name: 'Bad\udc00Name' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'validation_error');
    assert.equal((await h.call('GET', '/api/profile', { token: s.token })).body.user.name, 'Student Name');
  } finally { await h.close(); }
});

test('R16-A-01: defence in depth: the keys, and the Game methods called directly, work on well-formed text (what is stored)', async () => {
  assert.equal(nameKey('\u{1F9EC}\ud800'), nameKey('\u{1F9EC}�'));
  assert.equal(classNameKey('Lone\ud800Class'), classNameKey('Lone�Class'));
  const h = await harness({ limits: OPEN });
  try {
    const g = new Game(h.app.db, { now: () => h.clock.t });
    const t1 = g.createAccount('x1@uni.edu', '\u{1F9EC}\ud800', 'h', 'teacher', 1);
    assert.throws(() => g.createAccount('x2@uni.edu', '\u{1F9EC}\ud800', 'h', 'teacher', 2), (e: { code?: string }) => e.code === 'name_taken');
    assert.equal((h.app.db.prepare('SELECT name FROM users WHERE id = ?').get(t1) as { name: string }).name, '\u{1F9EC}�');
    const c1 = g.createClass(t1, 'Lone\ud800Class');
    assert.equal(c1.name, 'Lone�Class', 'the create response echoes what is stored');
    assert.throws(() => g.createClass(t1, 'Lone\ud800Class'), (e: { code?: string }) => e.code === 'class_name_taken');
    const t2 = g.createAccount('x3@uni.edu', 'Other Teacher', 'h', 'teacher', 3);
    assert.throws(() => g.updateProfile(t2, { name: '\u{1F9EC}\ud800' }), (e: { code?: string }) => e.code === 'name_taken');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R16-A-02
test('R16-A-02: a paid hint is persisted in the reservation transaction: after a "crash" during the provider call the learner sees the standard hint and was charged once', async () => {
  let release!: (v: string | null) => void;
  const hang = new Promise<string | null>((r) => { release = r; });
  const h = await harness({ limits: OPEN, assistant: { hint: () => hang } });
  try {
    const s = await h.signup('Crash Hint');
    const a = (await h.call('POST', '/api/missions/mic-01/start', { token: s.token })).body.attempt;
    const sid = 'mic-01-s1';
    const p = h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: s.token, body: { stepId: sid } });
    await new Promise((r) => setTimeout(r, 150));
    const rows = h.app.db.prepare('SELECT source, text FROM hint_log WHERE attempt_id = ?').all(a.attemptId) as Array<{ source: string; text: string }>;
    assert.equal(rows.length, 1, 'the log row exists while the provider is still being awaited');
    // "Restart": a fresh Game on the same database, no in-flight memory.
    const g2 = new Game(h.app.db, { now: () => h.clock.t });
    const view = g2.getAttempt(s.id, a.attemptId);
    const hint0 = step(sid).hints[0]!;
    assert.deepEqual(view.step!.hintsGiven, [{ level: 1, text: hint0, source: 'standard' }]);
    assert.equal(view.hintsUsed, 1);
    assert.equal(view.penaltyXp, -15, 'charged exactly once');
    await assert.rejects(() => g2.hint(s.id, a.attemptId, sid), (e: { status?: number; code?: string }) => e.status === 409 && e.code === 'no_more_hints');
    assert.equal(g2.getAttempt(s.id, a.attemptId).penaltyXp, -15, 'the refused request charged nothing');
    // The provider finally answers (the first process was still alive): the row becomes the assistant text.
    release('Compare the cluster arrangement before naming the organism.');
    const r = await p;
    assert.equal(r.status, 200);
    assert.equal(r.body.source, 'assistant');
    const after = new Game(h.app.db, { now: () => h.clock.t }).getAttempt(s.id, a.attemptId);
    assert.deepEqual(after.step!.hintsGiven, [{ level: 1, text: 'Compare the cluster arrangement before naming the organism.', source: 'assistant' }]);
    assert.equal((h.app.db.prepare('SELECT COUNT(*) n FROM hint_log WHERE attempt_id = ?').get(a.attemptId) as { n: number }).n, 1, 'still one row');
    assert.equal(after.penaltyXp, -15);
  } finally { await h.close(); }
});

test('R16-A-02: provider failure, timeout-like rejection or a refused text all leave exactly one standard row; an expiry during the call refunds and removes it', async () => {
  for (const provider of [async () => { throw new Error('boom'); }, async () => null, async () => 'The answer is B']) {
    const h = await harness({ limits: OPEN, assistant: { hint: provider as () => Promise<string | null> } });
    try {
      const s = await h.signup('Fail Hint');
      const a = (await h.call('POST', '/api/missions/mic-01/start', { token: s.token })).body.attempt;
      const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: s.token, body: { stepId: 'mic-01-s1' } });
      assert.equal(r.status, 200); assert.equal(r.body.source, 'standard'); assert.equal(r.body.hint, step('mic-01-s1').hints[0]);
      assert.equal((h.app.db.prepare('SELECT COUNT(*) n FROM hint_log WHERE attempt_id = ?').get(a.attemptId) as { n: number }).n, 1);
      assert.deepEqual(r.body.attempt.step.hintsGiven, [{ level: 1, text: step('mic-01-s1').hints[0], source: 'standard' }]);
    } finally { await h.close(); }
  }
  // Expiry while the provider is being awaited: the charge is released and the row goes with it (the learner never received the text).
  let release!: (v: string | null) => void;
  const hang = new Promise<string | null>((r) => { release = r; });
  const h = await harness({ limits: OPEN, assistant: { hint: () => hang } });
  try {
    const s = await h.signup('Late Hint');
    const a = (await h.call('POST', '/api/missions/mic-01/start', { token: s.token })).body.attempt;
    const p = h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: s.token, body: { stepId: 'mic-01-s1' } });
    await new Promise((r) => setTimeout(r, 150));
    h.clock.t += MISSION_BY_ID.get('mic-01')!.timeLimitSec * 1000 + 5000;
    release(null);
    const r = await p;
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'time_expired');
    assert.equal((h.app.db.prepare('SELECT COUNT(*) n FROM hint_log WHERE attempt_id = ?').get(a.attemptId) as { n: number }).n, 0);
    assert.equal((h.app.db.prepare('SELECT hints_total FROM attempts WHERE id = ?').get(a.attemptId) as { hints_total: number }).hints_total, 0);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R16-A-04
test('R16-A-04: readOnlyRequest never leaves the process stuck when the PRAGMA exec fails (ON or OFF)', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const real = h.app.db;
    let failOn = 0; let failOff = 0;
    const wrapped = new Proxy(real, {
      get(target, prop) {
        if (prop === 'exec') return (sql: string) => {
          if (sql === 'PRAGMA query_only = ON' && failOn > 0) { failOn--; throw new Error('injected ON failure'); }
          if (sql === 'PRAGMA query_only = OFF' && failOff > 0) { failOff--; throw new Error('injected OFF failure'); }
          return target.exec(sql);
        };
        const v = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const g = new Game(wrapped, { now: () => h.clock.t });
    const flag = () => (g as unknown as { readOnly: boolean }).readOnly;
    const queryOnly = () => (real.prepare('PRAGMA query_only').get() as { query_only: number }).query_only;

    failOn = 1;
    assert.throws(() => g.readOnlyRequest(() => 'never'), /injected ON failure/);
    assert.equal(flag(), false, 'the flag is not left set when PRAGMA ON failed');
    assert.equal(queryOnly(), 0);

    failOff = 1;
    assert.equal(g.readOnlyRequest(() => { assert.equal(flag(), true); return 'ok'; }), 'ok');
    assert.equal(flag(), false, 'the flag is reset even when PRAGMA OFF failed once');
    assert.equal(queryOnly(), 0, 'query_only is switched off again (retried)');
    // And the connection can write again.
    real.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('w@uni.edu','W','x','student',1)").run();

    // fn throwing restores everything too.
    assert.throws(() => g.readOnlyRequest(() => { throw new Error('handler'); }), /handler/);
    assert.equal(flag(), false); assert.equal(queryOnly(), 0);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R16-A-05
test('R16-A-05: concurrent demo resets from two connections (two threads) all answer ok and leave the canonical state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-demo-race-'));
  const path = join(dir, 'demo.db');
  try {
    const db = openDb(path);
    await seedDemo(db, Date.now());
    const uid = (db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_STUDENT_EMAIL) as { id: number }).id;
    const snap = () => JSON.stringify(['attempts', 'mission_best', 'fragments', 'badges_earned', 'lab_exits', 'xp_events'].map((t) => (db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`).get(uid) as { n: number }).n));
    const canon = snap();
    db.close();
    const ROUNDS = 12;
    const barrier = new SharedArrayBuffer(4);
    const run = () => new Promise<string[]>((res, rej) => {
      const w = new Worker(new URL('./demo-reset-worker.ts', import.meta.url), { workerData: { path, uid, rounds: ROUNDS, barrier } });
      w.once('message', res); w.once('error', rej);
    });
    const [ra, rb] = await Promise.all([run(), run()]);
    assert.deepEqual([...ra, ...rb].filter((x) => x !== 'ok'), [], 'no reset surfaces the replay\'s own preconditions');
    const db2 = openDb(path);
    const uid2 = uid;
    const after = JSON.stringify(['attempts', 'mission_best', 'fragments', 'badges_earned', 'lab_exits', 'xp_events'].map((t) => (db2.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`).get(uid2) as { n: number }).n));
    db2.close();
    assert.equal(after, canon);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R16-A-03
test('R16-A-03: a standalone capital letter equal to the correct option letter drops the hint (choice and decision steps)', () => {
  const s = step('hem-03-s2'); // correct C
  for (const t of ['Try C', 'Try C next', 'What about C?', 'How about C', 'Is it C?', 'Probably C', 'Perhaps C', 'Maybe C', 'Likely C.', 'Surely C', 'That points to C.', 'This suggests C.',
    'C seems plausible.', 'C is a good candidate.', 'C stands out.', 'C fits the indices.', 'Stick with C.', 'Stay with C', 'Stick to C', 'Ans C', 'C bien sur', '**C**', '(C)', '"C"', 'Consider С here.', 'Option \u{1F172}',
  ]) assert.equal(leaksAnswer(t, s), true, `should reject ${JSON.stringify(t)}`);
  const a = step('hem-03-s1'); // correct A
  for (const t of ['Try A', 'A seems plausible.', 'Stay with A', 'What about A?']) assert.equal(leaksAnswer(t, a), true, `should reject ${JSON.stringify(t)}`);
  // Other letters, and the letter inside ordinary clinical vocabulary, are fine.
  for (const t of ['Try B', 'Try D next', 'Vitamin C deficiency is relevant here.', 'Think about vitamin C.', 'C-reactive protein is raised.', 'Incubate at 37 °C.', 'Hepatitis C and hepatitis B.', 'Look at the C3 and C4 complement.',
    'Clostridioides difficile (C. difficile) is anaerobic.', 'Blood group A or type AB.', 'Factor C is not a coagulation factor.', 'B-cells and T-cells.', 'Check the Gram stain.', 'Compare the MCV with the reference range first.',
  ]) assert.equal(leaksAnswer(t, s), false, `should pass ${JSON.stringify(t)}`);
  // The article "A" is not the option letter.
  for (const t of ['A low MCV points at small cells.', 'A patient with a low ferritin.', 'Vitamin A is fat soluble.', 'Hepatitis A is acute.', 'Take a look at the MCV.', 'HbA1c is glycated haemoglobin.']) assert.equal(leaksAnswer(t, a), false, `should pass ${JSON.stringify(t)}`);
});

test('R16-A-03: zero false positives on every faculty text of every choice / decision step (hints, re-check, case, prompt, explanation) and on cross-step faculty hints', () => {
  const guarded = MISSIONS.flatMap((m) => m.steps).filter((s) => s.key.kind === 'choice' || s.key.kind === 'decision');
  const texts = (s: typeof guarded[number]) => [...s.hints, s.recheck, s.context, s.prompt].filter((x): x is string => !!x);
  let own = 0; const fp: string[] = [];
  for (const s of guarded) for (const t of texts(s)) { own++; if (leaksAnswer(t, s)) fp.push(`${s.id}: ${t}`); }
  assert.deepEqual(fp, []);
  assert.ok(own > 60, `checked ${own}`);
  // Hints of OTHER steps against each guarded step: only a hint that really contains a standalone capital letter may be refused, and the cost is the faculty hint itself.
  let cross = 0; let refused = 0;
  for (const s of guarded) for (const o of guarded) if (o !== s) for (const t of o.hints) { cross++; if (leaksAnswer(t, s)) refused++; }
  assert.ok(cross > 300, `cross ${cross}`);
  assert.ok(refused / cross < 0.01, `cross-step refusals ${refused}/${cross}`);
});

// ------------------------------------------------------------------ R16-A-07
test('R16-A-07: 431 (header block above Node\'s limit, answered before the application runs) is declared on every operation', async () => {
  const h = await harness();
  try {
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    assert.ok(spec.components.responses.HeaderTooLarge, 'declared once in components');
    for (const [p, item] of Object.entries(spec.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)) {
      for (const [method, op] of Object.entries(item)) assert.ok(op.responses['431'], `${method} ${p} declares 431`);
    }
  } finally { await h.close(); }
});
