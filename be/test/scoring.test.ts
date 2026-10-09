import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MASTER_SCORING, STANDARD_SCORING } from '../src/content.ts';
import { computeScore, levelOf, maxScore, timeBonus } from '../src/scoring.ts';

const base = { profile: STANDARD_SCORING, stepCount: 1, firstTrySteps: 1, wrong: 0, hints: 0, elapsedSec: 0, timeLimitSec: 240 };

test('perfect standard mission is worth 180 XP', () => {
  const r = computeScore(base);
  assert.equal(r.total, 180);
  assert.equal(r.max, 180);
  assert.deepEqual(r.rows.map((x) => [x.id, x.points]), [['base', 100], ['first_attempt', 30], ['time_bonus', 30], ['no_hint', 20]]);
});

test('time bonus: full inside par, linear to zero at the limit', () => {
  assert.equal(timeBonus(60, 240, 30), 30);
  assert.equal(timeBonus(150, 240, 30), 15);
  assert.equal(timeBonus(240, 240, 30), 0);
  assert.equal(timeBonus(999, 240, 30), 0);
});

test('penalties: -10 per wrong answer, -15 per hint, hints forfeit the no-hint bonus', () => {
  const r = computeScore({ ...base, wrong: 2, hints: 1, firstTrySteps: 0, elapsedSec: 240 });
  // 100 base, 0 first try, 0 time, 0 no-hint, -15 hint, -20 wrong
  assert.equal(r.total, 65);
  assert.equal(r.rows.find((x) => x.id === 'wrong')!.points, -20);
  assert.equal(r.rows.find((x) => x.id === 'hints')!.points, -15);
  assert.equal(r.rows.find((x) => x.id === 'first_attempt')!.kind, 'unearned');
});

test('score never goes below zero', () => {
  assert.equal(computeScore({ ...base, wrong: 99, hints: 9, firstTrySteps: 0, elapsedSec: 999 }).total, 0);
});

test('master lab: base 300, 30 per first-try step, max 570', () => {
  assert.equal(maxScore(MASTER_SCORING, 4), 570);
  const r = computeScore({ profile: MASTER_SCORING, stepCount: 4, firstTrySteps: 3, wrong: 1, hints: 1, elapsedSec: 0, timeLimitSec: 900 });
  assert.equal(r.rows.find((x) => x.id === 'first_attempt')!.points, 90);
  assert.equal(r.total, 300 + 90 + 90 + 0 - 15 - 10);
});

test('levels follow the design curve: level n starts at 250 n (n - 1) XP', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(499), 1);
  assert.equal(levelOf(500), 2);
  assert.equal(levelOf(1500), 3);
  assert.equal(levelOf(7500), 6);
  assert.equal(levelOf(8240), 6, 'Alex Martin: level 6');
  assert.equal(levelOf(10500), 7);
});
