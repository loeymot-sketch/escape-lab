import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABS, MISSIONS, STANDARD_LAB_SLUGS, exitCode, fragmentSlots, missionsOf } from '../src/content.ts';
import { checkResponse, publicStep } from '../src/engines.ts';
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

test('guided point observations require every zone and keep coordinates server-side', () => {
  const step = {
    id: 'multi-point-fixture', kind: 'point' as const, competency: 'BIO', prompt: 'Observe both markers',
    data: { pointTargets: [{ id: 'index', label: 'Specimen index' }, { id: 'result', label: 'Affected result' }] },
    key: { kind: 'point' as const, x: 20, y: 20, r: 5, targets: [
      { id: 'index', x: 20, y: 20, r: 5, selection: 'Specimen index' }, { id: 'result', x: 70, y: 70, r: 5, selection: 'Affected result' },
    ] }, explanation: 'A sufficiently long explanation for the multi-observation fixture.', recheck: 'Recheck both observations carefully.', hints: ['Start with the specimen index.'],
  };
  assert.deepEqual(checkResponse(step, { points: { index: { x: 20, y: 20 }, result: { x: 70, y: 70 } } }), { correct: true, progress: { correct: 2, total: 2 } });
  assert.deepEqual(checkResponse(step, { points: { index: { x: 20, y: 20 }, result: { x: 0, y: 0 } } }), { correct: false, progress: { correct: 1, total: 2 } });
  assert.deepEqual(checkResponse(step, { points: { index: { x: 20, y: 20 } }, selections: { result: 'Affected result' } }), { correct: true, progress: { correct: 2, total: 2 } });
  assert.deepEqual(checkResponse(step, { points: { index: { x: 20, y: 20 } }, selections: { result: 'Wrong result' } }), { correct: false, progress: { correct: 1, total: 2 } });
  for (const response of [{ points: { index: { x: 20, y: 20 } } }, { points: { index: { x: 20, y: 20 }, result: { x: 101, y: 0 } } }, { points: { index: { x: 20, y: 20 }, result: { x: 70, y: 70 }, extra: { x: 1, y: 1 } } }]) {
    assert.throws(() => checkResponse(step, response), /points|point/);
  }
  assert.throws(() => checkResponse(step, { points: { index: { x: 20, y: 20 } }, selections: { index: 'Specimen index', result: 'Affected result' } }), /exactly once/);
  const publicView = publicStep(step, 0, 1);
  assert.deepEqual(publicView.pointTargets, step.data.pointTargets);
  assert.equal(JSON.stringify(publicView).includes('selection'), false);
  assert.equal(JSON.stringify(publicView).includes('20'), false);
  assert.equal(JSON.stringify(publicView).includes('70'), false);
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

test('every guided visual step keeps public labels and private targets in exact one-to-one parity', () => {
  const visualSteps = MISSIONS.flatMap((mission) => mission.steps).filter((step) => step.key.kind === 'point');
  for (const step of visualSteps) {
    assert.ok(step.data.image?.asset, `${step.id} needs an image asset`);
    // Point keys are the only ones with targets; the single-point assertion below still checks that no other key carries them.
    const key = step.key as { kind: string; targets?: { id: string; x: number; y: number; r: number; selection?: string }[] };
    const labels = step.data.pointTargets;
    if (labels) {
      assert.ok(key.targets, `${step.id} public zones require private targets`);
      assert.equal(labels.length, key.targets!.length, `${step.id} public/private zone count`);
      assert.equal(new Set(labels.map((target) => target.id)).size, labels.length, `${step.id} public zone ids are unique`);
      assert.deepEqual(labels.map((target) => target.id).sort(), key.targets!.map((target) => target.id).sort(), `${step.id} public/private zone ids match`);
      for (const target of key.targets!) {
        assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.r), `${step.id}/${target.id} has finite geometry`);
        assert.ok(target.r > 0 && target.r <= 10, `${step.id}/${target.id} has a bounded radius`);
        assert.ok(target.x - target.r >= 0 && target.x + target.r <= 100 && target.y - target.r >= 0 && target.y + target.r <= 100, `${step.id}/${target.id} stays inside the artwork`);
      }
    } else {
      assert.equal(key.targets, undefined, `${step.id} single-point content must not have hidden multi-zone targets`);
    }
    const publicView = publicStep(step, 0, 1);
    const serialized = JSON.stringify(publicView);
    assert.equal(serialized.includes('selection'), false, `${step.id} does not publish semantic corrections`);
    assert.equal(serialized.includes('"x"'), false, `${step.id} does not publish x coordinates`);
    assert.equal(serialized.includes('"y"'), false, `${step.id} does not publish y coordinates`);
  }
});
