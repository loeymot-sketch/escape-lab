// Domain types shared by the content catalogue, engines and services.
// `key`, `explanation`, `recheck` and `hints` are SERVER-ONLY: they never leave the process
// except through the deliberate paths in views.ts (explanation after a correct answer,
// hints after an explicit hint request).

export type Discipline =
  | 'hematology' | 'microbiology' | 'biochemistry' | 'master'
  | 'immunology' | 'parasitology' | 'bloodbank' | 'molecular' | 'cytology' | 'histology' | 'quality';

/** The six interaction systems of the design system. */
export type Engine = 'image_identify' | 'choice' | 'drag_order' | 'matching' | 'decision' | 'stepper';

/** What a single step asks the student to do. */
export type StepKind = 'point' | 'choice' | 'order' | 'match' | 'decision';

export type Flag = '' | 'L' | 'H' | 'LL' | 'HH';

export interface LabValue {
  name: string;
  value: string;
  unit: string;
  ref?: string;
  flag?: Flag;
}

export interface Option { id: string; label: string }
export interface Item { id: string; label: string }

export type StepKey =
  | { kind: 'point'; x: number; y: number; r: number }
  | { kind: 'choice'; answer: string }
  | { kind: 'order'; order: string[] }
  | { kind: 'match'; pairs: Record<string, string> }
  | { kind: 'decision'; answer: string };

export interface StepData {
  /** Asset id the front end resolves to an image (smear, plate, panel). */
  image?: { asset: string; caption: string };
  /** Laboratory values revealed by this step (cumulative view is built server side). */
  values?: LabValue[];
  options?: Option[];
  items?: Item[];
  left?: Item[];
  right?: Item[];
  sample?: { id: string; label: string };
}

export interface Step {
  id: string;
  kind: StepKind;
  competency: string;
  prompt: string;
  /** Short case text shown above the prompt. */
  context?: string;
  data: StepData;
  key: StepKey;
  explanation: string;
  /** Pedagogical pointer shown after a wrong answer. Never gives the answer. */
  recheck: string;
  /** Faculty-written standard hints, progressive. Each costs the hint penalty. */
  hints: string[];
  /** Master Lab only: digit revealed when this step is first solved. */
  fragment?: number;
}

export type Difficulty = 'Foundation' | 'Intermediate' | 'Advanced';

export interface ScoringProfile {
  base: number;
  /** 'all': one bonus if every step was solved first time. 'perStep': bonus per step. */
  firstTryMode: 'all' | 'perStep';
  firstTry: number;
  timeMax: number;
  noHint: number;
}

export interface Mission {
  id: string;
  labSlug: string;
  ordinal: number;
  title: string;
  engine: Engine;
  difficulty: Difficulty;
  estMinutes: number;
  timeLimitSec: number;
  /** Digit given when the mission is first completed (standard labs). */
  fragment?: number;
  scoring: ScoringProfile;
  steps: Step[];
}

export interface Lab {
  slug: string;
  name: string;
  discipline: Discipline;
  ordinal: number;
  playable: boolean;
  blurb: string;
  /** Number of digits in the exit code. */
  codeLength: number;
}
