import { arr, bool, nonNeg, nullable, num, oneOf, optional, pct, rec, str, text } from './guard';

const L = 'attempt';

export type StepKind = 'point' | 'choice' | 'decision' | 'order' | 'match';
export type ValueFlag = '' | 'L' | 'H' | 'LL' | 'HH';
export type LabValue = { name: string; value: string; unit: string; ref?: string; flag?: ValueFlag };
export type Labelled = { id: string; label: string };
export type HintSource = 'standard' | 'assistant';
/** A hint the learner already paid for on the current step, as stored by the server. */
export type HintGiven = { level: number; text: string; source: HintSource };
export type PublicStep = {
  id: string;
  kind: StepKind;
  ordinal: number;
  of: number;
  prompt: string;
  context?: string;
  image?: { asset: string; caption: string };
  options?: Labelled[];
  items?: Labelled[];
  left?: Labelled[];
  right?: Labelled[];
  sample?: Labelled;
  values: LabValue[];
  hintsAvailable: number;
  wrongOnStep: number;
  hintsOnStep: number;
  /** Every hint already delivered on this step, by ascending level. Empty once the attempt is expired. */
  hintsGiven: HintGiven[];
};

export type AttemptStatus = 'in_progress' | 'completed' | 'expired';
export type Attempt = {
  attemptId: string;
  missionId: string;
  missionTitle: string;
  labSlug: string;
  engine: string;
  status: AttemptStatus;
  expired: boolean;
  /** Server-owned snapshot of the time left. null once completed, 0 once expired. */
  remainingSec: number | null;
  elapsedSec: number;
  timeLimitSec: number;
  stepIndex: number;
  stepCount: number;
  penalties: number;
  hintsUsed: number;
  penaltyXp: number;
  step: PublicStep | null;
  /** Cumulative values the server has revealed so far (a stepper accumulates; other engines show the current step). */
  revealed: LabValue[];
};

const labelled = (value: unknown, field: string): Labelled => {
  const row = rec(value, L, field);
  return { id: str(row.id, L, `${field}.id`), label: str(row.label, L, `${field}.label`) };
};

const labelledList = (value: unknown, field: string): Labelled[] => {
  const list = arr(value, L, field).map((item, i) => labelled(item, `${field}[${i}]`));
  if (list.length === 0) throw new Error(`Invalid server ${L} payload: ${field} is empty.`);
  return list;
};

const FLAGS = ['', 'L', 'H', 'LL', 'HH'] as const;

export function normalizeLabValue(value: unknown, field = 'value'): LabValue {
  const row = rec(value, L, field);
  return {
    name: str(row.name, L, `${field}.name`),
    value: str(row.value, L, `${field}.value`),
    unit: text(row.unit, L, `${field}.unit`),
    ref: optional(row.ref, (v) => str(v, L, `${field}.ref`)),
    flag: optional(row.flag, (v) => oneOf(v, FLAGS, L, `${field}.flag`)),
  };
}

const HINT_SOURCES = ['standard', 'assistant'] as const;

/** Hints already delivered on a step: whole levels, strictly ascending, never more than the step offers, each with its stored text. */
export function normalizeHintsGiven(value: unknown, hintsAvailable: number, field = 'step.hintsGiven'): HintGiven[] {
  let previous = 0;
  return arr(value, L, field).map((item, i) => {
    const row = rec(item, L, `${field}[${i}]`);
    const level = nonNeg(row.level, L, `${field}[${i}].level`);
    if (!Number.isInteger(level) || level <= previous || level > hintsAvailable) throw new Error(`Invalid server ${L} payload: ${field}[${i}].level.`);
    previous = level;
    return { level, text: str(row.text, L, `${field}[${i}].text`), source: oneOf(row.source, HINT_SOURCES, L, `${field}[${i}].source`) };
  });
}

const KINDS = ['point', 'choice', 'decision', 'order', 'match'] as const;

/** Validates one public step against the contract of its kind. */
export function normalizeStep(value: unknown): PublicStep {
  const row = rec(value, L, 'step');
  const kind = oneOf(row.kind, KINDS, L, 'step.kind');
  const step: PublicStep = {
    id: str(row.id, L, 'step.id'),
    kind,
    ordinal: nonNeg(row.ordinal, L, 'step.ordinal'),
    of: nonNeg(row.of, L, 'step.of'),
    prompt: str(row.prompt, L, 'step.prompt'),
    context: optional(row.context, (v) => str(v, L, 'step.context')),
    values: arr(row.values, L, 'step.values').map((v, i) => normalizeLabValue(v, `step.values[${i}]`)),
    hintsAvailable: nonNeg(row.hintsAvailable, L, 'step.hintsAvailable'),
    wrongOnStep: nonNeg(row.wrongOnStep, L, 'step.wrongOnStep'),
    hintsOnStep: nonNeg(row.hintsOnStep, L, 'step.hintsOnStep'),
    hintsGiven: [],
    sample: optional(row.sample, (v) => labelled(v, 'step.sample')),
  };
  step.hintsGiven = normalizeHintsGiven(row.hintsGiven, step.hintsAvailable);
  if (row.image !== undefined) {
    const image = rec(row.image, L, 'step.image');
    step.image = { asset: str(image.asset, L, 'step.image.asset'), caption: str(image.caption, L, 'step.image.caption') };
  }
  if (kind === 'point' && !step.image) throw new Error(`Invalid server ${L} payload: step.image.`);
  if (kind === 'choice' || kind === 'decision') step.options = labelledList(row.options, 'step.options');
  if (kind === 'order') step.items = labelledList(row.items, 'step.items');
  if (kind === 'match') {
    step.left = labelledList(row.left, 'step.left');
    step.right = labelledList(row.right, 'step.right');
  }
  return step;
}

const STATUSES = ['in_progress', 'completed', 'expired'] as const;

/**
 * Maps a complete server attempt view into the player view model. No timer, score
 * or progression value is inferred on the client when the payload is malformed.
 */
export function normalizeAttempt(payload: unknown): Attempt {
  const attempt = rec(payload, L);
  const mission = rec(attempt.mission, L, 'mission');
  const status = oneOf(attempt.status, STATUSES, L, 'status');
  const completed = status === 'completed';
  let step: PublicStep | null = null;
  if (completed) {
    if (attempt.step !== null) throw new Error(`Invalid server ${L} payload: step must be null once completed.`);
  } else {
    step = normalizeStep(attempt.step);
  }
  const expired = bool(attempt.expired, L, 'expired');
  const remainingSec = nullable(attempt.remainingSec, (v) => nonNeg(v, L, 'remainingSec'));
  if (!completed && remainingSec === null) throw new Error(`Invalid server ${L} payload: remainingSec.`);
  if (status === 'expired' && !expired) throw new Error(`Invalid server ${L} payload: expired.`);
  return {
    attemptId: str(attempt.attemptId, L, 'attemptId'),
    missionId: str(mission.id, L, 'mission.id'),
    missionTitle: str(mission.title, L, 'mission.title'),
    labSlug: str(mission.labSlug, L, 'mission.labSlug'),
    engine: str(mission.engine, L, 'mission.engine'),
    status,
    expired,
    remainingSec,
    elapsedSec: nonNeg(attempt.elapsedSec, L, 'elapsedSec'),
    timeLimitSec: nonNeg(attempt.timeLimitSec, L, 'timeLimitSec'),
    stepIndex: nonNeg(attempt.stepsSolved, L, 'stepsSolved'),
    stepCount: nonNeg(mission.steps, L, 'mission.steps'),
    penalties: nonNeg(attempt.wrongTotal, L, 'wrongTotal'),
    hintsUsed: nonNeg(attempt.hintsUsed, L, 'hintsUsed'),
    penaltyXp: num(attempt.penaltyXp, L, 'penaltyXp'),
    step,
    revealed: arr(attempt.revealed, L, 'revealed').map((v, i) => normalizeLabValue(v, `revealed[${i}]`)),
  };
}

/** POST /missions/:id/start: a fresh attempt or the one already in progress. */
export function normalizeStart(payload: unknown): { resumed: boolean; attempt: Attempt } {
  const root = rec(payload, 'mission start');
  return { resumed: bool(root.resumed, 'mission start', 'resumed'), attempt: normalizeAttempt(root.attempt) };
}

export type Fragment = { labSlug: string; position: number; digit: number };
export type LedgerRow = { id: string; label: string; reason: string; points: number; kind: 'earned' | 'penalty' | 'unearned' };
export type AwardedBadge = { id: string; name: string; description: string };
export type MissionResult = {
  attemptId: string;
  mission: { id: string; title: string; labSlug: string };
  score: number;
  maxScore: number;
  xpAwarded: number;
  totalXp: number;
  newBest: boolean;
  ledger: LedgerRow[];
  stats: { accuracyPct: number; elapsed: string; elapsedSec: number; hintsUsed: number; wrongAnswers: number; firstTrySteps: number; steps: number };
  newBadges: AwardedBadge[];
  /** Present on GET /attempts/:id/result only. */
  lab?: { slug: string; exited: boolean };
  fragments?: (number | null)[];
  masterCode?: string | null;
};

const R = 'result';
export function normalizeFragment(value: unknown, field = 'fragment'): Fragment {
  const row = rec(value, 'fragment', field);
  const position = nonNeg(row.position, 'fragment', `${field}.position`);
  const digit = nonNeg(row.digit, 'fragment', `${field}.digit`);
  if (!Number.isInteger(position) || position < 1 || !Number.isInteger(digit) || digit > 9) throw new Error(`Invalid server fragment payload: ${field}.`);
  return { labSlug: str(row.labSlug, 'fragment', `${field}.labSlug`), position, digit };
}

function readResult(payload: unknown): MissionResult {
  const root = rec(payload, R);
  const mission = rec(root.mission, R, 'mission');
  const stats = rec(root.stats, R, 'stats');
  return {
    attemptId: str(root.attemptId, R, 'attemptId'),
    mission: { id: str(mission.id, R, 'mission.id'), title: str(mission.title, R, 'mission.title'), labSlug: str(mission.labSlug, R, 'mission.labSlug') },
    score: nonNeg(root.score, R, 'score'),
    maxScore: nonNeg(root.maxScore, R, 'maxScore'),
    xpAwarded: num(root.xpAwarded, R, 'xpAwarded'),
    totalXp: nonNeg(root.totalXp, R, 'totalXp'),
    newBest: bool(root.newBest, R, 'newBest'),
    ledger: arr(root.ledger, R, 'ledger').map((item, i) => {
      const row = rec(item, R, `ledger[${i}]`);
      return {
        id: str(row.id, R, `ledger[${i}].id`),
        label: str(row.label, R, `ledger[${i}].label`),
        reason: str(row.reason, R, `ledger[${i}].reason`),
        points: num(row.points, R, `ledger[${i}].points`),
        kind: oneOf(row.kind, ['earned', 'penalty', 'unearned'] as const, R, `ledger[${i}].kind`),
      };
    }),
    stats: {
      accuracyPct: pct(stats.accuracyPct, R, 'stats.accuracyPct'),
      elapsed: str(stats.elapsed, R, 'stats.elapsed'),
      elapsedSec: nonNeg(stats.elapsedSec, R, 'stats.elapsedSec'),
      hintsUsed: nonNeg(stats.hintsUsed, R, 'stats.hintsUsed'),
      wrongAnswers: nonNeg(stats.wrongAnswers, R, 'stats.wrongAnswers'),
      firstTrySteps: nonNeg(stats.firstTrySteps, R, 'stats.firstTrySteps'),
      steps: nonNeg(stats.steps, R, 'stats.steps'),
    },
    newBadges: arr(root.newBadges, R, 'newBadges').map((item, i) => {
      const row = rec(item, R, `newBadges[${i}]`);
      return { id: str(row.id, R, `newBadges[${i}].id`), name: str(row.name, R, `newBadges[${i}].name`), description: str(row.description, R, `newBadges[${i}].description`) };
    }),
  };
}

/** The result embedded in the final answer response. */
export function normalizeMissionResult(payload: unknown): MissionResult {
  return readResult(payload);
}

/** GET /attempts/:id/result: the same figures plus lab and vault context. */
export function normalizeAttemptResult(payload: unknown): MissionResult {
  const base = readResult(payload);
  const root = rec(payload, R);
  const lab = rec(root.lab, R, 'lab');
  return {
    ...base,
    lab: { slug: str(lab.slug, R, 'lab.slug'), exited: bool(lab.exited, R, 'lab.exited') },
    fragments: arr(root.fragments, R, 'fragments').map((slot, i) => nullable(slot, (v) => nonNeg(v, R, `fragments[${i}]`))),
    masterCode: root.masterCode === null ? null : str(root.masterCode, R, 'masterCode'),
  };
}

export type MissionAnswer = {
  correct: boolean;
  /** Server feedback text without the leading verdict word (the UI renders its own heading). */
  message: string;
  progress: { correct: number; total: number } | null;
  penaltyXp: number | null;
  fragment: Fragment | null;
  completed: boolean;
  result?: MissionResult;
  attempt: Attempt;
};

const A = 'answer';
/** Validates presentation fields returned after an answer without interpreting correctness locally. */
export function normalizeMissionAnswer(payload: unknown): MissionAnswer {
  const root = rec(payload, A);
  const correct = bool(root.correct, A, 'correct');
  const feedback = rec(root.feedback, A, 'feedback');
  const message = str(feedback.message, A, 'feedback.message').replace(/^(?:Correct|Not quite)\.\s*/i, '');
  if (message.length === 0) throw new Error(`Invalid server ${A} payload: feedback.message.`);
  const progress = root.progress === undefined || root.progress === null
    ? null
    : (() => {
        const p = rec(root.progress, A, 'progress');
        return { correct: nonNeg(p.correct, A, 'progress.correct'), total: nonNeg(p.total, A, 'progress.total') };
      })();
  const attempt = normalizeAttempt(root.attempt);

  if (!correct) {
    // A wrong answer always carries the penalty set by the server and its (possibly null) partial progress: never a silent null.
    if (!('progress' in root)) throw new Error(`Invalid server ${A} payload: progress.`);
    return { correct, message, progress, penaltyXp: num(root.penaltyXp, A, 'penaltyXp'), fragment: null, completed: false, attempt };
  }
  if (!('fragment' in root)) throw new Error(`Invalid server ${A} payload: fragment.`);
  const fragment = nullable(root.fragment, (v) => normalizeFragment(v));
  const completed = bool(root.completed, A, 'completed');
  if (completed && attempt.status !== 'completed') throw new Error(`Invalid server ${A} payload: attempt.status.`);
  return {
    correct,
    message,
    progress,
    penaltyXp: null,
    fragment,
    completed,
    result: completed ? normalizeMissionResult(root.result) : undefined,
    attempt,
  };
}

export type HintReply = { text: string; source: string; level: number; remaining: number; penaltyXp: number; attempt: Attempt };
/** Hint text remains server-owned; the client accepts only a complete server hint reply. */
export function normalizeHint(payload: unknown): HintReply {
  const root = rec(payload, 'hint');
  return {
    text: str(root.hint, 'hint', 'hint'),
    source: str(root.source, 'hint', 'source'),
    level: nonNeg(root.level, 'hint', 'level'),
    remaining: nonNeg(root.remaining, 'hint', 'remaining'),
    penaltyXp: num(root.penaltyXp, 'hint', 'penaltyXp'),
    attempt: normalizeAttempt(root.attempt),
  };
}
