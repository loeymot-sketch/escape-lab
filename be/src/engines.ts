// Answer validation for the six engines, plus the public (answer-free) views of steps.
import { bad } from './http.ts';
import type { LabValue, Mission, Option, Step } from './types.ts';

export interface Verdict {
  correct: boolean;
  /** Deliberate partial feedback for order/match ("2 of 4 in place"): it does not state the key, but repeated tries can narrow it down. Documented product decision, see docs/KNOWN_LIMITATIONS.md. */
  progress?: { correct: number; total: number };
}

export const DEFAULT_DECISIONS: Option[] = [
  { id: 'accept', label: 'Accept and report' },
  { id: 'reject', label: 'Reject and request a new sample' },
  { id: 'repeat', label: 'Correct the interference and re-measure' },
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function checkResponse(step: Step, response: unknown): Verdict {
  if (!isObj(response)) throw bad('response must be an object');
  const key = step.key;
  switch (key.kind) {
    case 'choice': {
      const c = response.choice;
      const ids = (step.data.options ?? []).map((o) => o.id);
      if (typeof c !== 'string' || !ids.includes(c)) throw bad(`response.choice must be one of: ${ids.join(', ')}`);
      return { correct: c === key.answer };
    }
    case 'decision': {
      const d = response.decision;
      const ids = (step.data.options ?? DEFAULT_DECISIONS).map((o) => o.id);
      if (typeof d !== 'string' || !ids.includes(d)) throw bad(`response.decision must be one of: ${ids.join(', ')}`);
      return { correct: d === key.answer };
    }
    case 'point': {
      const { x, y } = response;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
        throw bad('response.x and response.y must be numbers between 0 and 100');
      }
      return { correct: Math.hypot(x - key.x, y - key.y) <= key.r };
    }
    case 'order': {
      const o = response.order;
      const ids = (step.data.items ?? []).map((i) => i.id);
      if (!Array.isArray(o) || o.length !== ids.length || new Set(o).size !== ids.length || !o.every((v) => typeof v === 'string' && ids.includes(v))) {
        throw bad('response.order must list every item id exactly once');
      }
      const right = key.order.filter((id, i) => o[i] === id).length;
      return { correct: right === key.order.length, progress: { correct: right, total: key.order.length } };
    }
    case 'match': {
      const p = response.pairs;
      const lefts = (step.data.left ?? []).map((i) => i.id);
      const rights = (step.data.right ?? []).map((i) => i.id);
      if (!isObj(p) || Object.keys(p).length !== lefts.length || !lefts.every((l) => typeof p[l] === 'string' && rights.includes(p[l] as string))) {
        throw bad('response.pairs must map every left id to a right id');
      }
      if (new Set(Object.values(p)).size !== rights.length) throw bad('each right id may be used once');
      const right = lefts.filter((l) => p[l] === key.pairs[l]).length;
      return { correct: right === lefts.length, progress: { correct: right, total: lefts.length } };
    }
  }
}

// ------------------------------------------------------------- public views
export interface PublicStep {
  id: string;
  ordinal: number;
  of: number;
  kind: Step['kind'];
  prompt: string;
  context?: string;
  image?: { asset: string; caption: string };
  options?: Option[];
  items?: { id: string; label: string }[];
  left?: { id: string; label: string }[];
  right?: { id: string; label: string }[];
  sample?: { id: string; label: string };
  /** Values introduced by this step. */
  values: LabValue[];
  hintsAvailable: number;
}

export function publicStep(step: Step, index: number, total: number): PublicStep {
  const d = step.data;
  return {
    id: step.id, ordinal: index + 1, of: total, kind: step.kind, prompt: step.prompt, context: step.context,
    image: d.image, items: d.items, left: d.left, right: d.right, sample: d.sample,
    options: step.kind === 'decision' ? (d.options ?? DEFAULT_DECISIONS) : d.options,
    values: d.values ?? [],
    hintsAvailable: step.hints.length,
  };
}

/** Values of every step up to and including `index`, so a stepper reveals information progressively. */
export function revealedValues(mission: Mission, index: number): LabValue[] {
  // Only steppers accumulate one case; other engines present independent items.
  if (mission.engine !== 'stepper') return mission.steps[index]?.data.values ?? [];
  return mission.steps.slice(0, index + 1).flatMap((s) => s.data.values ?? []);
}
