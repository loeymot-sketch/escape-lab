import { describe, expect, it } from 'vitest';
import { normalizeAttempt, normalizeAttemptResult, normalizeHint, normalizeMissionAnswer, normalizeStart, normalizeStep } from './attempt';
import { attemptView, clone, completedView, expiredView, finalAnswer, hintReply, resultPayload, rightAnswer, steps, wrongAnswer } from './fixtures';

describe('attempt payload normalization', () => {
  it('preserves the server attempt identity, step, timer snapshot and revealed values', () => {
    const a = normalizeAttempt(attemptView());
    expect(a).toMatchObject({
      attemptId: 'attempt-42', missionId: 'hem-03', missionTitle: 'Anemia Detective', labSlug: 'hematology', engine: 'stepper',
      status: 'in_progress', expired: false, remainingSec: 200, stepIndex: 1, stepCount: 3, penalties: 2, hintsUsed: 1, penaltyXp: -35, elapsedSec: 40, timeLimitSec: 240,
    });
    expect(a.step?.kind).toBe('choice');
    expect(a.revealed).toHaveLength(3);
    expect(a.revealed[1]).toMatchObject({ name: 'pH', unit: '', flag: 'L' });
    expect(a.revealed[2]!.flag).toBeUndefined();
  });

  it('keeps legitimate zero values rather than replacing them with client defaults', () => {
    const view = attemptView();
    Object.assign(view, { stepsSolved: 0, wrongTotal: 0, elapsedSec: 0, hintsUsed: 0, penaltyXp: 0, remainingSec: 0 });
    expect(normalizeAttempt(view)).toMatchObject({ stepIndex: 0, penalties: 0, elapsedSec: 0, remainingSec: 0, penaltyXp: 0 });
  });

  it.each(['attemptId', 'status', 'expired', 'remainingSec', 'elapsedSec', 'timeLimitSec', 'stepsSolved', 'wrongTotal', 'hintsUsed', 'penaltyXp', 'mission', 'step', 'revealed'])('rejects an attempt without %s', (field) => {
    const view = clone(attemptView()) as Record<string, unknown>;
    delete view[field];
    expect(() => normalizeAttempt(view)).toThrow();
  });

  it('rejects mission fields that the player needs', () => {
    for (const field of ['id', 'title', 'labSlug', 'engine', 'steps']) {
      const view = clone(attemptView()) as { mission: Record<string, unknown> };
      delete view.mission[field];
      expect(() => normalizeAttempt(view)).toThrow(field === 'id' ? 'mission.id' : field);
    }
  });

  it('models completed and expired attempts explicitly', () => {
    expect(normalizeAttempt(completedView())).toMatchObject({ status: 'completed', remainingSec: null, step: null });
    expect(normalizeAttempt(expiredView())).toMatchObject({ status: 'expired', expired: true, remainingSec: 0 });
    const lying = expiredView();
    lying.expired = false;
    expect(() => normalizeAttempt(lying)).toThrow('expired');
    const stepInCompleted = completedView();
    Object.assign(stepInCompleted, { step: steps.choice });
    expect(() => normalizeAttempt(stepInCompleted)).toThrow('step');
    const noTimer = attemptView();
    Object.assign(noTimer, { remainingSec: null });
    expect(() => normalizeAttempt(noTimer)).toThrow('remainingSec');
  });

  it('validates a start reply', () => {
    expect(normalizeStart({ resumed: true, attempt: attemptView() }).resumed).toBe(true);
    expect(() => normalizeStart({ attempt: attemptView() })).toThrow('resumed');
  });
});

describe('step validation per kind', () => {
  it('accepts a complete step of every kind', () => {
    for (const step of Object.values(steps)) expect(normalizeStep(step).id).toBe(step.id);
  });

  it('rejects a step with a missing or unknown kind (it used to crash the renderer)', () => {
    const noKind = clone(steps.choice) as Record<string, unknown>;
    delete noKind.kind;
    expect(() => normalizeStep(noKind)).toThrow('step.kind');
    expect(() => normalizeStep({ ...steps.choice, kind: 'slider' })).toThrow('step.kind');
  });

  it.each([
    ['id', 'choice'], ['prompt', 'choice'], ['ordinal', 'choice'], ['of', 'choice'], ['values', 'choice'], ['hintsAvailable', 'choice'], ['wrongOnStep', 'choice'], ['hintsOnStep', 'choice'], ['hintsGiven', 'choice'],
    ['options', 'choice'], ['options', 'decision'], ['items', 'order'], ['left', 'match'], ['right', 'match'], ['image', 'point'],
  ] as const)('requires %s on a %s step', (field, kind) => {
    const step = clone(steps[kind]) as Record<string, unknown>;
    delete step[field];
    expect(() => normalizeStep(step)).toThrow();
  });

  it('rejects empty option lists, blank labels and malformed values', () => {
    expect(() => normalizeStep({ ...steps.choice, options: [] })).toThrow('options');
    expect(() => normalizeStep({ ...steps.choice, options: [{ id: 'A' }] })).toThrow('label');
    expect(() => normalizeStep({ ...steps.order, items: [{ id: '', label: 'x' }] })).toThrow('items');
    expect(() => normalizeStep({ ...steps.choice, values: [{ name: 'Hb', unit: 'g/dL' }] })).toThrow('value');
    expect(() => normalizeStep({ ...steps.choice, values: [{ name: 'Hb', value: '1', unit: 'g/dL', flag: 'X' }] })).toThrow('flag');
    expect(() => normalizeStep({ ...steps.point, image: { asset: 'a' } })).toThrow('caption');
  });
});

describe('hints already delivered on the step (R9-B-06)', () => {
  const given = [{ level: 1, text: 'First nudge', source: 'standard' }, { level: 2, text: 'Second nudge', source: 'assistant' }];

  it('reads the stored hints in level order', () => {
    expect(normalizeStep({ ...steps.choice, hintsOnStep: 2, hintsGiven: given }).hintsGiven).toEqual(given);
    expect(normalizeStep(steps.choice).hintsGiven).toEqual([]);
    expect(normalizeAttempt(attemptView({ ...steps.choice, hintsOnStep: 1, hintsGiven: [given[0]] })).step?.hintsGiven).toEqual([given[0]]);
  });

  it('requires the field: a missing or non-list value is an invalid payload, not a silent empty list', () => {
    const missing = clone(steps.choice) as Record<string, unknown>;
    delete missing.hintsGiven;
    expect(() => normalizeStep(missing)).toThrow('hintsGiven');
    for (const bad of [null, 'First nudge', {}, 3]) expect(() => normalizeStep({ ...steps.choice, hintsGiven: bad })).toThrow('hintsGiven');
    const view = clone(attemptView()) as Record<string, any>;
    delete view.step.hintsGiven;
    expect(() => normalizeAttempt(view)).toThrow('hintsGiven');
    expect(() => normalizeHint({ ...hintReply(), attempt: view })).toThrow('hintsGiven');
  });

  it.each([
    ['a missing text', [{ level: 1, source: 'standard' }]],
    ['an empty text', [{ level: 1, text: '', source: 'standard' }]],
    ['a numeric text', [{ level: 1, text: 4, source: 'standard' }]],
    ['an unknown source', [{ level: 1, text: 'x', source: 'model' }]],
    ['a missing source', [{ level: 1, text: 'x' }]],
    ['a missing level', [{ text: 'x', source: 'standard' }]],
    ['level 0', [{ level: 0, text: 'x', source: 'standard' }]],
    ['a fractional level', [{ level: 1.5, text: 'x', source: 'standard' }]],
    ['a level beyond the hints the step offers', [{ level: 3, text: 'x', source: 'standard' }]],
    ['a repeated level', [given[0], given[0]]],
    ['levels out of order', [given[1], given[0]]],
    ['a non-object entry', ['First nudge']],
  ])('rejects %s', (_label, hintsGiven) => {
    expect(() => normalizeStep({ ...steps.choice, hintsGiven })).toThrow('hintsGiven');
  });
});

describe('answer payload normalization', () => {
  it('reads a wrong answer: feedback without the verdict word, progress, penalty and the refreshed attempt', () => {
    const a = normalizeMissionAnswer(wrongAnswer());
    expect(a).toMatchObject({ correct: false, completed: false, message: 'Look for fragments, not whole cells.', progress: { correct: 1, total: 2 }, penaltyXp: -10, fragment: null });
    expect(a.attempt.penalties).toBe(2);
  });

  it('reads the TOP-LEVEL fragment of a correct answer (it is not inside result)', () => {
    const a = normalizeMissionAnswer(rightAnswer());
    expect(a.fragment).toEqual({ labSlug: 'hematology', position: 1, digit: 7 });
    expect(a.completed).toBe(false);
  });

  it('accepts a null fragment, requires the key itself, and rejects a malformed one', () => {
    const none = rightAnswer();
    Object.assign(none, { fragment: null });
    expect(normalizeMissionAnswer(none).fragment).toBeNull();
    const missing = clone(rightAnswer()) as Record<string, unknown>;
    delete missing.fragment;
    expect(() => normalizeMissionAnswer(missing)).toThrow('fragment');
    for (const bad of [{ labSlug: 'hematology', position: 1 }, { labSlug: 'hematology', digit: 7 }, { position: 1, digit: 7 }, { labSlug: 'hematology', position: 0, digit: 7 }, { labSlug: 'hematology', position: 1, digit: 12 }, 'seven']) {
      const answer = rightAnswer();
      Object.assign(answer, { fragment: bad });
      expect(() => normalizeMissionAnswer(answer)).toThrow('fragment');
    }
  });

  it('keeps the final result and the completed attempt', () => {
    const a = normalizeMissionAnswer(finalAnswer());
    expect(a.completed).toBe(true);
    expect(a.result).toMatchObject({ score: 168, maxScore: 180, newBest: true, stats: { elapsed: '01:30', accuracyPct: 75 } });
    expect(a.result?.ledger[1]).toMatchObject({ kind: 'penalty', points: -10 });
    expect(a.result?.newBadges[0]?.name).toBe('No Hint');
    expect(a.attempt.status).toBe('completed');
  });

  it('requires an explicit result when the server marks an answer complete', () => {
    const answer = finalAnswer() as Record<string, unknown>;
    delete answer.result;
    expect(() => normalizeMissionAnswer(answer)).toThrow('result');
    const partial = finalAnswer();
    delete (partial.result.stats as Record<string, unknown>).elapsed;
    expect(() => normalizeMissionAnswer(partial)).toThrow('elapsed');
  });

  it('never invents feedback text when the server sends none', () => {
    const noFeedback = wrongAnswer() as Record<string, unknown>;
    delete noFeedback.feedback;
    expect(() => normalizeMissionAnswer(noFeedback)).toThrow('feedback');
    const emptyMessage = wrongAnswer();
    emptyMessage.feedback.message = '';
    expect(() => normalizeMissionAnswer(emptyMessage)).toThrow('feedback.message');
    expect(() => normalizeMissionAnswer({ correct: 'yes' })).toThrow('correct');
  });

  it('rejects a malformed progress object instead of ignoring it', () => {
    const answer = wrongAnswer();
    Object.assign(answer, { progress: { correct: 1 } });
    expect(() => normalizeMissionAnswer(answer)).toThrow('progress.total');
  });

  it('requires the attempt that follows an answer', () => {
    const answer = wrongAnswer() as Record<string, unknown>;
    delete answer.attempt;
    expect(() => normalizeMissionAnswer(answer)).toThrow();
  });
});

describe('result and hint payloads', () => {
  it('reads the stored result with its lab and vault context', () => {
    const payload = { ...resultPayload(), lab: { slug: 'hematology', exited: false }, fragments: [7, null, 2], masterCode: null, competencies: [] };
    const r = normalizeAttemptResult(payload);
    expect(r.lab).toEqual({ slug: 'hematology', exited: false });
    expect(r.fragments).toEqual([7, null, 2]);
    expect(r.masterCode).toBeNull();
    expect(() => normalizeAttemptResult(resultPayload())).toThrow('lab');
  });

  it('accepts a complete server hint and nothing less', () => {
    expect(normalizeHint(hintReply())).toMatchObject({ text: 'Compare the reference interval first.', level: 1, remaining: 1, penaltyXp: -15 });
    for (const field of ['hint', 'source', 'level', 'remaining', 'penaltyXp', 'attempt']) {
      const reply = hintReply() as Record<string, unknown>;
      delete reply[field];
      expect(() => normalizeHint(reply)).toThrow();
    }
    expect(() => normalizeHint({ ...hintReply(), hint: '' })).toThrow('hint');
  });
});

describe('audit hardening: a wrong answer is never silently completed with defaults', () => {
  it('requires the penalty and the progress key on a wrong answer', () => {
    const noPenalty = wrongAnswer() as Record<string, unknown>;
    delete noPenalty.penaltyXp;
    expect(() => normalizeMissionAnswer(noPenalty)).toThrow('penaltyXp');
    const noProgress = wrongAnswer() as Record<string, unknown>;
    delete noProgress.progress;
    expect(() => normalizeMissionAnswer(noProgress)).toThrow('progress');
    expect(normalizeMissionAnswer({ ...wrongAnswer(), progress: null }).progress).toBeNull();
  });
  it('refuses an accuracy outside 0..100 in a result', () => {
    const bad = resultPayload() as { stats: { accuracyPct: number } };
    bad.stats.accuracyPct = 140;
    expect(() => normalizeAttemptResult(bad)).toThrow('accuracyPct');
  });
});
