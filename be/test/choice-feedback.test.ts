import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DECISIONS, publicStep, recheckForResponse } from '../src/engines.ts';
import { MISSIONS } from '../src/content.ts';
import { leaksAnswer } from '../src/assistant.ts';
import { correct, harness, mission } from './helpers.ts';

test('all authored distractor feedback belongs to wrong options, passes the answer-leak guard and stays out of public steps', () => {
  for (const m of MISSIONS) for (const [index, current] of m.steps.entries()) {
    if (!current.recheckByOption) continue;
    assert.ok(current.key.kind === 'choice' || current.key.kind === 'decision');
    for (const [id, message] of Object.entries(current.recheckByOption)) {
      assert.ok((current.data.options ?? DEFAULT_DECISIONS).some((option) => option.id === id));
      assert.notEqual(id, (current.key as { answer: string }).answer);
      assert.equal(leaksAnswer(message, current), false, `${current.id}/${id} exposes the answer`);
      assert.ok(!JSON.stringify(publicStep(current, index, m.steps.length)).includes(message));
    }
  }
  const step = mission('mic-01').steps[2]!;
  assert.deepEqual(Object.keys(step.recheckByOption!).sort(), ['A', 'B', 'D']);
  for (const [id, message] of Object.entries(step.recheckByOption!)) {
    assert.match(message, /catalase-positive and tube-coagulase-negative/);
    assert.equal(recheckForResponse(step, { choice: id }), message);
  }
  assert.equal(recheckForResponse(step, {}), step.recheck);
  assert.equal(recheckForResponse(step, { choice: 'unknown' }), step.recheck);
});

test('coagulase errors explain the selected organism, preserve the live attempt and allow completion', async () => {
  const h = await harness();
  try {
    const user = await h.signup('Feedback learner');
    const m = mission('mic-01');
    const started = await h.call('POST', '/api/missions/mic-01/start', { token: user.token });
    assert.equal(started.status, 201);
    const attemptId = started.body.attempt.attemptId;
    for (const step of m.steps.slice(0, 2)) {
      const reply = await h.call('POST', `/api/attempts/${attemptId}/answer`, { token: user.token, body: { stepId: step.id, response: correct(step) } });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.correct, true);
    }
    const step = m.steps[2]!;
    let wrongCount = 0;
    for (const option of step.data.options!.filter((item) => item.id !== 'C')) {
      const reply = await h.call('POST', `/api/attempts/${attemptId}/answer`, { token: user.token, body: { stepId: step.id, response: { choice: option.id } } });
      assert.equal(reply.status, 200);
      assert.equal(reply.body.correct, false);
      assert.equal(reply.body.feedback.message, `Not quite. ${step.recheckByOption![option.id]}`);
      assert.ok(reply.body.feedback.message.includes(option.label));
      assert.ok(!reply.body.feedback.message.includes('Staphylococcus aureus'));
      assert.equal(reply.body.attempt.wrongTotal, ++wrongCount);
      assert.equal(reply.body.attempt.status, 'in_progress');
      assert.equal(reply.body.attempt.step.id, step.id);
    }
    const finished = await h.call('POST', `/api/attempts/${attemptId}/answer`, { token: user.token, body: { stepId: step.id, response: correct(step) } });
    assert.equal(finished.status, 200);
    assert.equal(finished.body.completed, true);
    const lobby = await h.call('GET', '/api/labs/microbiology', { token: user.token });
    assert.equal(lobby.body.missions.find((item: { id: string }) => item.id === 'mic-01').state, 'completed');
    assert.notEqual(lobby.body.missions.find((item: { id: string }) => item.id === 'mic-02').state, 'locked');
  } finally { await h.close(); }
});
