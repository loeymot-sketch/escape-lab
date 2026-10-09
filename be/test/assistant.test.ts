import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicHintProvider, leaksAnswer } from '../src/assistant.ts';
import { mission, harness, correct } from './helpers.ts';

const step = mission('hem-03').steps[0]!; // answer: Microcytic

function fakeFetch(reply: string | Error, status = 200): typeof fetch {
  return (async () => {
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: reply }] }), { status });
  }) as unknown as typeof fetch;
}

test('leak guard catches the answer label and "the answer is"', () => {
  assert.equal(leaksAnswer('This is a microcytic anemia.', step), true);
  assert.equal(leaksAnswer('The correct answer is A.', step), true);
  assert.equal(leaksAnswer('Compare the MCV with the reference range first.', step), false);
});

test('provider returns clean text, and null on leaks, HTTP errors, network errors and timeouts', async () => {
  const clean = 'Compare the MCV with the reference range first.';
  assert.equal(await new AnthropicHintProvider('k', 'm', 1000, fakeFetch(clean)).hint({ step, level: 1, wrongSoFar: 0 }), clean);
  assert.equal(await new AnthropicHintProvider('k', 'm', 1000, fakeFetch('It is microcytic.')).hint({ step, level: 1, wrongSoFar: 0 }), null);
  assert.equal(await new AnthropicHintProvider('k', 'm', 1000, fakeFetch(clean, 500)).hint({ step, level: 1, wrongSoFar: 0 }), null);
  assert.equal(await new AnthropicHintProvider('k', 'm', 1000, fakeFetch(new Error('offline'))).hint({ step, level: 1, wrongSoFar: 0 }), null);
  const hang = ((_: unknown, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
  assert.equal(await new AnthropicHintProvider('k', 'm', 30, hang).hint({ step, level: 1, wrongSoFar: 0 }), null);
});

test('hint endpoint uses the assistant when it answers and the standard hint otherwise; same penalty', async () => {
  const nudge = 'Compare the MCV with the reference range first.';
  for (const [reply, source, expected] of [[nudge, 'assistant', nudge], ['The answer is A', 'standard', step.hints[0]!]] as const) {
    const h = await harness({ assistant: new AnthropicHintProvider('k', 'm', 1000, fakeFetch(reply)) });
    try {
      const u = await h.signup('AI');
      const m = mission('hem-01');
      const a = (await h.call('POST', `/api/missions/${m.id}/start`, { token: u.token })).body.attempt;
      const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } });
      assert.equal(r.body.source, source);
      assert.equal(r.body.hint, source === 'assistant' ? nudge : m.steps[0]!.hints[0]);
      assert.equal(r.body.penaltyXp, -15);
      assert.equal(r.body.attempt.hintsUsed, 1);
      void expected; void correct;
    } finally { await h.close(); }
  }
});
