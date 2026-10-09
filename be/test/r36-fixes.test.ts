// Round 36 and 37 backend fixes (A36-001, A37-001). Written before the fixes: each scaling test failed on the previous code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STEP_COMPETENCIES } from '../src/content.ts';
import { correct, harness, mission, solve, wrong } from './helpers.ts';
import type { Harness } from './helpers.ts';

// The round-35 query, kept verbatim as the oracle: one correlated subquery per row, scanning every step_results row of the step.
const OLD_SQL = `SELECT sr.step_id, sr.competency, sr.wrong, sr.hints
         FROM step_results sr JOIN attempts a ON a.id = sr.attempt_id
        WHERE a.user_id = ? AND sr.solved_at IS NOT NULL
          AND sr.solved_at = (SELECT MAX(sr2.solved_at) FROM step_results sr2 JOIN attempts a2 ON a2.id = sr2.attempt_id
                               WHERE a2.user_id = a.user_id AND sr2.step_id = sr.step_id AND sr2.solved_at IS NOT NULL)`;

function oracle(h: Harness, uid: number) {
  const rows = h.app.db.prepare(OLD_SQL).all(uid) as { step_id: string; competency: string; wrong: number; hints: number }[];
  const by = new Map<string, number[]>();
  for (const r of rows) by.set(r.competency, [...(by.get(r.competency) ?? []), Math.max(0, 1 - 0.34 * r.wrong - 0.15 * r.hints)]);
  return STEP_COMPETENCIES.filter((c) => by.has(c)).map((c) => ({ name: c, pct: Math.round((100 * by.get(c)!.reduce((a, b) => a + b, 0)) / by.get(c)!.length), steps: by.get(c)!.length }));
}

/** Plays a mission step by step: `misses` wrong answers on the first step, then every step correctly. */
async function play(h: Harness, token: string, missionId: string, misses: number) {
  const s = await h.call('POST', `/api/missions/${missionId}/start`, { token });
  assert.equal(s.status, 201);
  const id = s.body.attempt.attemptId as string;
  for (const [i, step] of mission(missionId).steps.entries()) {
    if (i === 0) for (let k = 0; k < misses; k++) assert.equal((await h.call('POST', `/api/attempts/${id}/answer`, { token, body: { stepId: step.id, response: wrong(step) } })).status, 200);
    assert.equal((await h.call('POST', `/api/attempts/${id}/answer`, { token, body: { stepId: step.id, response: correct(step) } })).status, 200);
  }
}

test('A36-001: the latest-solved-result rule is unchanged, ties on solved_at included', async () => {
  const h = await harness();
  try {
    const { token, id } = await h.signup('Ana Latest');
    // Same instant (the test clock does not move): two results for hem-01 tie on solved_at and BOTH count, as before.
    await play(h, token, 'hem-01', 1);
    await play(h, token, 'hem-01', 0);
    // A later replay with two misses replaces the tied pair as the latest result of that step.
    h.clock.t += 60_000;
    await play(h, token, 'hem-01', 2);
    // A multi-step mission, one miss on its first step, and a later perfect replay of it.
    await play(h, token, 'hem-02', 1);
    h.clock.t += 60_000;
    await play(h, token, 'hem-02', 0);
    // An attempt left unfinished never counts (solved_at is null on its unsolved steps).
    await h.call('POST', '/api/missions/mic-01/start', { token });

    const expected = oracle(h, id);
    assert.ok(expected.length >= 2, 'the scenario must cover several competencies');
    const got = h.app.game.competencies(id);
    const byName = (xs: { name: string; pct: number; steps: number }[]) => Object.fromEntries(xs.map((x) => [x.name, { pct: x.pct, steps: x.steps }]));
    assert.deepEqual(byName(got.items), byName(expected));
    const api = await h.call('GET', '/api/competencies', { token });
    assert.equal(api.status, 200);
    assert.deepEqual(byName(api.body.items ?? api.body.competencies ?? []), byName(expected));
  } finally { await h.close(); }
});

test('A36-001: two results of one step that tie on solved_at BOTH count (RANK, not ROW_NUMBER) - a pure tie, nothing supersedes it', async () => {
  const h = await harness();
  try {
    const { token, id } = await h.signup('Tie Student');
    // The test clock does not move: both completions of hem-01 are solved at the same instant. One has a wrong answer (score 0.66), one is perfect (1.0).
    await play(h, token, 'hem-01', 1);
    await play(h, token, 'hem-01', 0);
    const rows = h.app.db.prepare(OLD_SQL).all(id) as { step_id: string }[];
    assert.equal(rows.length, 2, 'the old query keeps both tied rows');
    const comp = h.app.game.competencies(id).items.find((c) => c.name === mission('hem-01').steps[0]!.competency);
    // Both tied rows count: two steps, mean (66 + 100) / 2 = 83. A ROW_NUMBER() rewrite would keep one row and give 1 step with 66 or 100.
    assert.deepEqual({ pct: comp?.pct, steps: comp?.steps }, { pct: 83, steps: 2 });
  } finally { await h.close(); }
});

test('A36-001: competencies() is linear in the account\'s own results, not quadratic (one account cannot stall the event loop)', async () => {
  const h = await harness();
  try {
    const { token, id } = await h.signup('Bulk Student');
    // 1,500 completed attempts of the one-step mission hem-01: the round-35 query took about 0.7 s for this (about 1.3 s for 2,000).
    for (let i = 0; i < 1500; i++) { await solve(h, token, 'hem-01'); h.clock.t += 1000; }
    const t0 = performance.now();
    const r = h.app.game.competencies(id);
    const ms = performance.now() - t0;
    assert.ok(r.items.length >= 1);
    // The linear query answers in a few milliseconds; the bound leaves a wide margin for a loaded machine.
    assert.ok(ms < 150, `competencies() took ${Math.round(ms)} ms for 1,500 solved attempts (expected well under 150 ms)`);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ A37-001
// The round-36 audit found the same class of defect in Game.analytics(): a correlated MIN() subquery, quadratic in one student's completed attempts.
const OLD_FIRST_SQL = (inList: string) => `SELECT a.user_id, a.mission_id, a.wrong_total, a.hints_total FROM attempts a
        WHERE a.user_id IN (${inList}) AND a.status = 'completed'
          AND a.started_at = (SELECT MIN(b.started_at) FROM attempts b WHERE b.user_id = a.user_id AND b.mission_id = a.mission_id AND b.status = 'completed')`;

async function classWith(h: Harness, names: string[]) {
  const t = await h.signup('Prof Analytics', `prof-${names.length}@uni.edu`, { teacherInviteCode: 'FACULTY-INVITE' });
  const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Class A37' } })).body;
  const students: { token: string; id: number }[] = [];
  for (const [i, name] of names.entries()) {
    const st = await h.signup(name, `st${i}-${names.length}@uni.edu`);
    assert.equal((await h.call('POST', '/api/classes/join', { token: st.token, body: { joinCode: cls.joinCode } })).status, 200);
    students.push(st);
  }
  return { teacher: t, classId: cls.id as number, students };
}

test('A37-001: the clean-first-try figure is unchanged (first COMPLETED attempt, ties on started_at included)', async () => {
  const h = await harness({ teacherInviteCode: 'FACULTY-INVITE' });
  try {
    const { teacher, classId, students } = await classWith(h, ['Ann First', 'Bo Replay', 'Cy Tied']);
    // hem-02 unlocks after hem-01, so every student completes hem-01 first.
    // Ann: a wrong answer on the first completed attempt of hem-01, then a perfect replay: the FIRST one counts, so it is not a clean first try.
    await play(h, students[0]!.token, 'hem-01', 1);
    h.clock.t += 60_000;
    await play(h, students[0]!.token, 'hem-01', 0);
    // Bo: a clean first completed attempt, then a worse replay.
    await play(h, students[1]!.token, 'hem-01', 0);
    h.clock.t += 60_000;
    await play(h, students[1]!.token, 'hem-01', 2);
    // Cy: two completed attempts started at the same instant (the test clock does not move): both are "first", as with the old MIN().
    await play(h, students[2]!.token, 'hem-01', 1);
    await play(h, students[2]!.token, 'hem-01', 0);
    // A second mission with one dirty and one clean first attempt, and an unfinished attempt that never counts.
    h.clock.t += 60_000;
    await play(h, students[0]!.token, 'hem-02', 1);
    await play(h, students[1]!.token, 'hem-02', 0);
    await h.call('POST', '/api/missions/hem-03/start', { token: students[1]!.token });

    const ids = students.map((s) => s.id);
    const rows = h.app.db.prepare(OLD_FIRST_SQL(ids.map(() => '?').join(','))).all(...ids) as { user_id: number; mission_id: string; wrong_total: number }[];
    const expected = (missionId: string) => { const f = rows.filter((r) => r.mission_id === missionId); return f.length ? Math.round((100 * f.filter((r) => r.wrong_total === 0).length) / f.length) : null; };
    const an = (await h.call('GET', `/api/classes/${classId}/analytics`, { token: teacher.token })).body;
    for (const m of an.missions as { missionId: string; cleanFirstTryPct: number | null }[]) assert.equal(m.cleanFirstTryPct, expected(m.missionId), m.missionId);
    // The scenario really exercises the rule: hem-01 has Ann dirty, Bo clean and Cy's tie of one dirty and one clean row (2 clean of 4 rows); hem-02 is 1 clean of 2.
    assert.equal(expected('hem-01'), 50);
    assert.equal(expected('hem-02'), 50);
  } finally { await h.close(); }
});

test('A37-001: analytics() is linear in a student\'s own attempts (one account cannot stall the event loop)', async () => {
  const h = await harness({ teacherInviteCode: 'FACULTY-INVITE' });
  try {
    const { teacher, classId, students } = await classWith(h, ['Bulk Student']);
    // 3,000 completed attempts of hem-01 followed by 3,000 of hem-02 (a history in mission order): the round-36 query took about 0.6 s here
    // and about 1.1 s at 4,000 + 4,000 (3.6 s through the real API in the audit). With the missions interleaved SQLite's MIN() shortcut hides the problem.
    const insert = h.app.db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at, completed_at, wrong_total, hints_total, score) VALUES (?, ?, ?, 'completed', 1, ?, ?, 0, 0, 100)");
    h.app.db.exec('BEGIN');
    for (let i = 0; i < 6000; i++) insert.run(`synthetic-${i}`, students[0]!.id, i < 3000 ? 'hem-01' : 'hem-02', 1_700_000_000_000 + i * 1000, 1_700_000_000_000 + i * 1000 + 500);
    h.app.db.exec('COMMIT');
    const t0 = performance.now();
    const an = h.app.game.analytics(teacher.id, classId);
    const ms = performance.now() - t0;
    assert.ok(an.missions.length > 0);
    assert.ok(ms < 150, `analytics() took ${Math.round(ms)} ms for 6,000 completed attempts of one student (expected well under 150 ms)`);
  } finally { await h.close(); }
});
