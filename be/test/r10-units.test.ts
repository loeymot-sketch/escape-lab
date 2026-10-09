import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listenUrl } from '../src/app.ts';
import { plural } from '../src/game.ts';
import { imitatesReviewerSuffix, nameKey } from '../src/names.ts';

// Round 10 unit tests: the canonical teacher-name key, the reviewer-suffix guard, plural helper, listen URL.
test('R10-A-01: nameKey folds case, accents, whitespace, punctuation, invisible and compatibility characters', () => {
  const base = nameKey('Prof Alpha');
  for (const v of ['prof alpha', 'PROF  ALPHA', ' Prof\u00a0Alpha ', 'Pröf Alpha', 'Prof\u200b Alpha', 'Pro\u00adf Alpha', 'Ｐｒｏｆ Alpha', 'Prof. Alpha', 'Prof-Alpha', 'Prof Alpha\u202e', 'Prof Alpha\u0301', 'Prof\u2028Alpha', 'Prof\tAlpha']) {
    assert.equal(nameKey(v), base, JSON.stringify(v));
  }
  assert.equal(nameKey('Straße'), nameKey('STRASSE'));
});

test('R10-A-01: nameKey maps Cyrillic and Greek lookalikes to the Latin skeleton, but keeps real Cyrillic and Greek names apart', () => {
  assert.equal(nameKey('Prоf Alpha'), nameKey('Prof Alpha'));
  assert.equal(nameKey('Рrof Аlpha'), nameKey('Prof Alpha'));
  assert.equal(nameKey('Prοf Alpha'), nameKey('Prof Alpha'));
  assert.notEqual(nameKey('Оксана Петренко'), nameKey('Олександр Петренко'));
  assert.notEqual(nameKey('Αλέξανδρος'), nameKey('Αθανάσιος'));
  assert.notEqual(nameKey('李明'), nameKey('王明'));
  assert.notEqual(nameKey('कि'), nameKey('क'), 'combining marks of non-Latin scripts are significant');
  assert.notEqual(nameKey('Prof Alpha'), nameKey('Prof Alphonse'));
});

test('R10-A-01: nameKey never collapses a name made only of symbols to the empty key', () => {
  assert.notEqual(nameKey('!!!'), '');
  assert.notEqual(nameKey('!!!'), nameKey('???'));
});

test('R10-A-01: imitatesReviewerSuffix spots "(teacher #n)" through folding, and nothing else', () => {
  for (const v of ['X (teacher #1)', 'X (TEACHER #22)', 'X ( teacher # 3 )', 'X (teacher\u00a0#3)', 'X （teacher ＃3）', 'X (t\u200beacher #3)', 'X (tеacher #3)', '(teacher #9) X']) assert.equal(imitatesReviewerSuffix(v), true, v);
  // R13-A-04: a bare 'Teacher #5' is refused now (the check no longer needs brackets): see r13-fixes.test.ts.
  for (const v of ['Dr. Smith (Biology)', 'Room #5', '(teacher)', 'Dr. Smith (#1)', 'The teacher (5)', 'Teacher Smith']) assert.equal(imitatesReviewerSuffix(v), false, v);
});

test('R10-C-05: plural picks the singular for exactly one', () => {
  assert.equal(plural(0, 'mission'), '0 missions');
  assert.equal(plural(1, 'mission'), '1 mission');
  assert.equal(plural(2, 'mission'), '2 missions');
});

test('R10-A-06: listenUrl brackets IPv6 hosts and falls back to localhost', () => {
  assert.equal(listenUrl('127.0.0.1', 3000), 'http://127.0.0.1:3000');
  assert.equal(listenUrl('::', 3000), 'http://[::]:3000');
  assert.equal(listenUrl('::1', 4000), 'http://[::1]:4000');
  assert.equal(listenUrl(undefined, 3000), 'http://localhost:3000');
  assert.equal(listenUrl('example.org', 80), 'http://example.org:80');
});
