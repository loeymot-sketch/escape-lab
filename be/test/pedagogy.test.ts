// The visible pedagogical loop (2026-10-15): investigation journal, public competency, result debrief, recommendation and mastery.
// Everything is computed by the server from stored attempts; none of it may carry a key, an answer or an unearned prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTERY_PCT, REVIEW_PCT, masteryOf } from '../src/scoring.ts';
import { correct, harness, mission, solve, wrong } from './helpers.ts';

const JOURNAL_KEYS = ['competency', 'hints', 'ordinal', 'state', 'stepId', 'wrong'];

test('the attempt view carries an investigation journal and the public competency, never a key or an unearned prompt', async () => {
  const h = await harness();
  try {
    const { token } = await h.signup('Journal');
    await solve(h, token, 'hem-01'); // Fix the Sample opens once Blood Smear Code is done
    const m = mission('hem-02');
    const s = await h.call('POST', '/api/missions/hem-02/start', { token });
    assert.equal(s.status, 201);
    const a = s.body.attempt;
    assert.equal(a.step.competency, m.steps[0]!.competency, 'the current public step names its competency');
    assert.deepEqual(
      a.journal.map((r: Record<string, unknown>) => [r.ordinal, r.stepId, r.competency, r.state, r.wrong, r.hints]),
      m.steps.map((st, i) => [i + 1, st.id, st.competency, i === 0 ? 'current' : 'upcoming', 0, 0]),
    );
    const w = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
    assert.equal(w.status, 200);
    assert.equal(w.body.correct, false);
    assert.equal(w.body.attempt.journal[0].wrong, 1, 'a wrong answer is counted on the current row');
    const hint = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token, body: { stepId: m.steps[0]!.id } });
    assert.equal(hint.status, 200);
    assert.equal(hint.body.attempt.journal[0].hints, 1, 'a hint is counted on the current row');
    const ok = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(ok.body.correct, true);
    const journal = ok.body.attempt.journal as Record<string, unknown>[];
    assert.deepEqual(journal.map((r) => r.state), ['solved', 'current', 'upcoming']);
    assert.deepEqual(journal.map((r) => [r.wrong, r.hints]), [[1, 1], [0, 0], [0, 0]]);
    for (const row of journal) assert.deepEqual(Object.keys(row).sort(), JOURNAL_KEYS);
    const text = JSON.stringify(journal);
    for (const st of m.steps) {
      assert.ok(!text.includes(st.prompt), 'no prompt in the journal');
      assert.ok(!text.includes(st.explanation), 'no explanation in the journal');
    }
    // A reload sees the same journal.
    const again = await h.call('GET', `/api/attempts/${a.attemptId}`, { token });
    assert.deepEqual(again.body.journal, journal);
  } finally { await h.close(); }
});

test('a completed result carries the step debrief, the previous best and the dashboard recommendation', async () => {
  const h = await harness();
  try {
    const { token } = await h.signup('Debrief');
    const m = mission('hem-01');
    const first = await solve(h, token, 'hem-01');
    assert.equal(first.last.result.previousBest, null, 'first completion: no previous best');
    const r1 = await h.call('GET', `/api/attempts/${first.attemptId}/result`, { token });
    assert.equal(r1.status, 200);
    // The final answer embeds the same complete result as GET (lab, fragments, competencies, recommendation): one screen, one source.
    assert.deepEqual(first.last.result, r1.body, 'the embedded result equals the stored result');
    assert.deepEqual(
      r1.body.steps.map((s: Record<string, unknown>) => [s.ordinal, s.id, s.prompt, s.competency, s.wrong, s.hints, s.explanation]),
      m.steps.map((st, i) => [i + 1, st.id, st.prompt, st.competency, 0, 0, st.explanation]),
    );
    assert.equal(r1.body.previousBest, null);
    const dash = await h.call('GET', '/api/dashboard', { token });
    assert.deepEqual(r1.body.recommended, dash.body.recommended, 'one recommendation rule for the result and the dashboard');
    assert.ok(r1.body.recommended, 'something is recommended after the first mission');
    assert.notEqual(r1.body.recommended.missionId, 'hem-01');
    const startable = await h.call('POST', `/api/missions/${r1.body.recommended.missionId}/start`, { token });
    assert.equal(startable.status, 201, 'the recommendation is never a locked mission');

    // Replay with one mistake: the previous best is the first score, the debrief records the mistake.
    const s2 = await h.call('POST', '/api/missions/hem-01/start', { token });
    const id2 = s2.body.attempt.attemptId as string;
    await h.call('POST', `/api/attempts/${id2}/answer`, { token, body: { stepId: m.steps[0]!.id, response: wrong(m.steps[0]!) } });
    const done = await h.call('POST', `/api/attempts/${id2}/answer`, { token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(done.body.completed, true);
    assert.equal(done.body.result.previousBest, first.last.result.score);
    assert.equal(done.body.result.steps[0].wrong, 1);
    const stored = await h.call('GET', `/api/attempts/${id2}/result`, { token });
    assert.equal(stored.body.previousBest, first.last.result.score, 'frozen with the result');
    assert.equal(stored.body.steps[0].wrong, 1);
  } finally { await h.close(); }
});

test('mastery follows the published thresholds, on the boundaries, and the lobby carries it', async () => {
  assert.equal(MASTERY_PCT, 80);
  assert.equal(REVIEW_PCT, 50);
  assert.equal(masteryOf(null, 180), null);
  assert.equal(masteryOf(144, 180), 'mastered', 'exactly 80 % is mastered');
  assert.equal(masteryOf(143, 180), 'completed');
  assert.equal(masteryOf(90, 180), 'completed', 'exactly 50 % is completed');
  assert.equal(masteryOf(89, 180), 'review');
  assert.equal(masteryOf(0, 180), 'review');
  const h = await harness();
  try {
    const { token } = await h.signup('Mastery');
    await solve(h, token, 'hem-01');
    const lobby = await h.call('GET', '/api/labs/hematology', { token });
    assert.equal(lobby.status, 200);
    const rows = lobby.body.missions as { id: string; mastery: string | null; bestScore: number | null; maxScore: number }[];
    assert.equal(rows.find((x) => x.id === 'hem-01')!.mastery, 'mastered');
    assert.equal(rows.find((x) => x.id === 'hem-02')!.mastery, null);
    for (const row of rows) assert.equal(row.mastery, masteryOf(row.bestScore, row.maxScore), `${row.id}: lobby mastery is the published rule`);
    const rules = await h.call('GET', '/api/rules', { token });
    assert.equal(rules.status, 200);
    assert.equal(rules.body.mastery.masteredPct, 80);
    assert.equal(rules.body.mastery.reviewPct, 50);
    assert.equal(typeof rules.body.mastery.note, 'string');
  } finally { await h.close(); }
});
