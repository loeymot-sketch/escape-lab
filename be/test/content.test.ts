import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABS, MISSIONS, STANDARD_LAB_SLUGS, exitCode, fragmentSlots, missionsOf } from '../src/content.ts';
import { checkResponse } from '../src/engines.ts';
import { correct } from './helpers.ts';

test('content catalogue matches the MVP spec', () => {
  assert.equal(LABS.filter((l) => l.playable).length, 4);
  assert.equal(LABS.filter((l) => !l.playable).length, 7, 'seven locked future labs');
  for (const s of STANDARD_LAB_SLUGS) assert.equal(missionsOf(s).length, 3);
  assert.equal(missionsOf('master')[0]!.steps.length, 4);
  assert.deepEqual(new Set(MISSIONS.map((m) => m.engine)), new Set(['image_identify', 'decision', 'stepper', 'drag_order', 'matching']));
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length, 'unique mission ids');
  assert.equal(new Set(MISSIONS.flatMap((m) => m.steps.map((s) => s.id))).size, MISSIONS.flatMap((m) => m.steps).length, 'unique step ids');
});

test('exit codes: right length, single digits, distinct between labs', () => {
  for (const l of LABS.filter((x) => x.playable)) {
    const code = exitCode(l.slug);
    assert.equal(code.length, l.codeLength);
    assert.match(code, /^[0-9]+$/);
    assert.equal(fragmentSlots(l.slug).map((f) => f.position).join(','), Array.from({ length: l.codeLength }, (_, i) => i + 1).join(','));
  }
  const codes = LABS.filter((l) => l.playable).map((l) => exitCode(l.slug));
  assert.equal(new Set(codes).size, codes.length);
});

test('every step is internally consistent and its authored key is accepted', () => {
  for (const m of MISSIONS) {
    assert.ok(m.timeLimitSec > 0 && m.estMinutes > 0);
    for (const s of m.steps) {
      assert.ok(s.explanation.length > 20 && s.recheck.length > 10 && s.hints.length >= 1, `${s.id} has teaching text`);
      assert.ok(checkResponse(s, correct(s)).correct, `${s.id} authored key is accepted`);
      const k = s.key;
      if (k.kind === 'choice') assert.ok(s.data.options!.some((o) => o.id === k.answer), `${s.id} answer is an option`);
      if (k.kind === 'decision') assert.ok((s.data.options ?? [{ id: 'accept' }, { id: 'reject' }, { id: 'repeat' }]).some((o) => o.id === k.answer));
      if (k.kind === 'point') assert.ok(k.x - k.r >= 0 && k.x + k.r <= 100 && k.y - k.r >= 0 && k.y + k.r <= 100, `${s.id} hotspot inside the image`);
      if (k.kind === 'order') {
        assert.deepEqual([...k.order].sort(), s.data.items!.map((i) => i.id).sort());
        assert.notDeepEqual(s.data.items!.map((i) => i.id), k.order, `${s.id} is authored scrambled`);
      }
      if (k.kind === 'match') {
        assert.deepEqual(Object.keys(k.pairs).sort(), s.data.left!.map((i) => i.id).sort());
        assert.deepEqual(Object.values(k.pairs).sort(), s.data.right!.map((i) => i.id).sort());
      }
      assert.ok(!s.hints.some((hnt) => hnt.length < 5));
    }
  }
});

test('choice answers are spread across options (no "always B" tell)', () => {
  const answers = MISSIONS.flatMap((m) => m.steps).flatMap((s) => (s.key.kind === 'choice' ? [s.key.answer] : []));
  const counts = new Map<string, number>();
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  assert.ok(Math.max(...counts.values()) / answers.length <= 0.5, JSON.stringify([...counts]));
});

test('malformed answers are rejected with a validation error, never treated as wrong', () => {
  const pt = MISSIONS.find((m) => m.id === 'hem-01')!.steps[0]!;
  for (const bad of [{ x: 'a', y: 1 }, { x: 101, y: 5 }, { x: NaN, y: 1 }, {}, null, 'x']) assert.throws(() => checkResponse(pt, bad), /must/);
  const ord = MISSIONS.find((m) => m.id === 'mic-02')!.steps[0]!;
  assert.throws(() => checkResponse(ord, { order: ['heat', 'heat', 'crystal', 'iodine', 'decolor'] }), /every item/);
  const mt = MISSIONS.find((m) => m.id === 'mic-03')!.steps[0]!;
  assert.throws(() => checkResponse(mt, { pairs: { 'pink-mac': 'ecoli', 'beta-hemo': 'ecoli', swarm: 'proteus', green: 'pseudo' } }), /once/);
});

test('image hotspots sit on the visible feature of the shipped artwork (percent of the natural image)', () => {
  // Landmarks measured on the artwork files in web/src/assets, in artwork pixels.
  const artwork: Record<string, { w: number; h: number; feature: { x: number; y: number }; what: string }> = {
    'smear-schistocyte-01': { w: 1672, h: 941, feature: { x: 1230, y: 440 }, what: 'the schistocyte in blood-smear-hero.png' },
    'panel-hemolysis-01': { w: 1600, h: 900, feature: { x: 880, y: 395 }, what: 'the potassium result cell in chemistry-panel.svg' },
  };
  const points = MISSIONS.flatMap((m) => m.steps).filter((s) => s.key.kind === 'point');
  assert.equal(points.length, 2);
  for (const s of points) {
    const k = s.key as { kind: 'point'; x: number; y: number; r: number };
    const art = artwork[s.data.image!.asset];
    assert.ok(art, `${s.id} uses a known illustrative asset`);
    const dx = k.x - (100 * art.feature.x) / art.w;
    const dy = k.y - (100 * art.feature.y) / art.h;
    assert.ok(Math.hypot(dx, dy) < 0.5, `${s.id} key is on ${art.what}`);
    assert.ok(k.r >= 4 && k.r <= 8, `${s.id} hotspot radius is a fair target`);
  }
  assert.notEqual(points[0]!.data.image!.asset, points[1]!.data.image!.asset, 'each point mission has its own artwork');
});
