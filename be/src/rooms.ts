// Teacher rooms: the document a teacher writes, its validation, the answer-free view a learner receives, grading and scoring.
// Like the built-in catalogue, keys (correct options, accepted answers, zones, orders, pairs) never leave the server before an attempt is over.
import { createHash } from 'node:crypto';
import { bad } from './http.ts';
import { hasBidiControl } from './names.ts';
import type { Mission, Step } from './types.ts';

// ------------------------------------------------------------------ the document
export type QuestionType = 'choice' | 'truefalse' | 'text' | 'number' | 'hotspot' | 'order' | 'match';
export const QUESTION_TYPES: QuestionType[] = ['choice', 'truefalse', 'text', 'number', 'hotspot', 'order', 'match'];

/** An image is an upload (`media`, a server id) or a picture of the built-in library (`asset`); its size always comes from the server. */
export interface RoomImage { media?: string; asset?: string; width: number; height: number; alt: string }

export interface ChoiceOption { id: string; label: string; correct: boolean; trap?: boolean; feedback?: string }
export interface Zone {
  id: string;
  label: string;
  shape: 'circle' | 'rect';
  /** Circle: centre. Rectangle: top-left corner. Natural pixels of the image. */
  x: number; y: number;
  r?: number; w?: number; h?: number;
  /** A tempting wrong area (an artefact, a look-alike): a click there is reported as a trap with its own feedback. */
  trap?: boolean;
  feedback?: string;
}
export interface TextTrap { answer: string; feedback: string }
export interface NumberTrap { value: number; feedback: string }

interface QuestionBase {
  id: string;
  type: QuestionType;
  prompt: string;
  context?: string;
  image?: RoomImage;
  points: number;
  hints: string[];
  explanation: string;
  /** Shown after any wrong answer that has no more specific feedback. Must not give the answer. */
  feedbackWrong?: string;
}
export type Question = QuestionBase & (
  | { type: 'choice'; options: ChoiceOption[]; multiple: boolean }
  | { type: 'truefalse'; answer: boolean; trap?: boolean }
  | { type: 'text'; accepted: string[]; typoTolerance: boolean; traps: TextTrap[] }
  | { type: 'number'; value: number; tolerance: number; unit?: string; traps: NumberTrap[] }
  | { type: 'hotspot'; zones: Zone[]; tolerance: number; require: 'any' | 'all'; decoys: string[] }
  | { type: 'order'; items: { id: string; label: string }[] }
  | { type: 'match'; pairs: { id: string; left: string; right: string }[] }
);

export type RoomMode = 'escape' | 'exam';
export const ROOM_DISCIPLINES = ['hematology', 'microbiology', 'biochemistry', 'immunology', 'parasitology', 'bloodbank', 'molecular', 'cytology', 'histology', 'quality', 'general'] as const;
export type RoomDiscipline = typeof ROOM_DISCIPLINES[number];

export interface RoomDoc {
  title: string;
  summary: string;
  discipline: RoomDiscipline;
  cover?: RoomImage;
  mode: RoomMode;
  /** 0 = no limit. */
  timeLimitSec: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Percentage of the maximum score needed to pass. */
  passPct: number;
  /** Exam mode: say right / wrong after each answer (escape mode always does). */
  showFeedback: boolean;
  /** After the attempt: show the expected answers in the review. */
  revealAnswers: boolean;
  /** Escape mode: letters and digits handed out one by one as questions are solved; '' = no final vault. */
  vaultCode: string;
  /** 0 = unlimited. */
  maxAttempts: number;
  intro: string;
  outro: string;
  questions: Question[];
}

// ------------------------------------------------------------------ rules
export const ROOM_RULES = {
  /** Share of a question's points lost per wrong try (escape mode). */
  wrongPenalty: 0.25,
  /** Share lost per hint read. */
  hintPenalty: 0.1,
  /** Extra share lost when the wrong answer was a trap. */
  trapPenalty: 0.15,
  maxQuestions: 40,
  maxVaultTries: 10,
  /** Default click tolerance around a zone, in natural pixels of the image. */
  defaultTolerance: 5,
} as const;

/** Pictures of the built-in library a teacher may reuse (natural sizes of the artwork in web/src/assets). */
export const IMAGE_LIBRARY: Record<string, { width: number; height: number; label: string }> = {
  'smear-schistocyte-01': { width: 1672, height: 941, label: 'Stylised blood smear' },
  'culture-observation-01': { width: 720, height: 720, label: 'Culture plate 1' },
  'culture-observation-02': { width: 720, height: 720, label: 'Culture plate 2' },
  'culture-observation-03': { width: 720, height: 720, label: 'Culture plate 3' },
  'culture-observation-04': { width: 720, height: 720, label: 'Culture plate 4' },
  'mission-hematology-smear': { width: 1400, height: 934, label: 'Hematology bench, smear' },
  'mission-hematology-sample': { width: 1400, height: 934, label: 'Hematology bench, samples' },
  'mission-microbiology-petri': { width: 1400, height: 934, label: 'Microbiology bench, Petri dishes' },
  'mission-microbiology-stain': { width: 1400, height: 934, label: 'Microbiology bench, staining' },
  'mission-microbiology-culture': { width: 1400, height: 934, label: 'Microbiology bench, cultures' },
  'mission-biochemistry-panel': { width: 1400, height: 934, label: 'Biochemistry bench, analyser' },
  'mission-biochemistry-kidney': { width: 1400, height: 934, label: 'Biochemistry bench, renal case' },
  'lab-hematology': { width: 1400, height: 934, label: 'Hematology laboratory' },
  'lab-microbiology': { width: 1400, height: 934, label: 'Microbiology laboratory' },
  'lab-biochemistry': { width: 1400, height: 934, label: 'Biochemistry laboratory' },
  'lab-master': { width: 1400, height: 934, label: 'Master laboratory' },
  'progression-vault': { width: 1400, height: 934, label: 'Code vault' },
};

// ------------------------------------------------------------------ validation
const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Control characters other than line breaks and tabs, lone surrogates. */
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]|\p{Cs}/u;
const VISIBLE = /[\p{L}\p{N}\p{S}\p{P}]/u;

type Lookup = (id: string) => { width: number; height: number } | null;

class Problems {
  list: string[] = [];
  add(path: string, message: string) { if (this.list.length < 50) this.list.push(`${path} ${message}`); }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The id a learner sees for a right-hand match label or a hotspot text choice. Using the stored id would give the answer away
 * (the left "p1" pairs with the right "p1"; "decoy-2" is a decoy), so each attempt gets its own opaque tokens.
 */
export const publicToken = (seed: string, kind: string, id: string) => `t${createHash('sha256').update(`${seed}|${kind}|${id}`).digest('base64url').slice(0, 10)}`;

function text(p: Problems, path: string, v: unknown, { min = 0, max }: { min?: number; max: number }, multiline = false): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') { p.add(path, 'must be a string'); return ''; }
  const s = v.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if ([...s].length > max) p.add(path, `must be at most ${max} characters`);
  else if (min > 0 && !VISIBLE.test(s)) p.add(path, min > 1 ? `must have at least ${min} characters` : 'is required');
  else if ([...s].length < min) p.add(path, `must have at least ${min} characters`);
  else if (BAD_CHARS.test(s) || (!multiline && /[\n\t]/.test(s))) p.add(path, 'contains characters that are not allowed');
  else if (hasBidiControl(s)) p.add(path, 'must not contain bidirectional control characters');
  return s;
}
function bool(p: Problems, path: string, v: unknown, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v !== 'boolean') { p.add(path, 'must be true or false'); return fallback; }
  return v;
}
function int(p: Problems, path: string, v: unknown, min: number, max: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) { p.add(path, `must be a whole number from ${min} to ${max}`); return fallback; }
  return v;
}
function num(p: Problems, path: string, v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) { p.add(path, `must be a number from ${min} to ${max}`); return 0; }
  return v;
}
function id(p: Problems, path: string, v: unknown, seen: Set<string>): string {
  if (typeof v !== 'string' || !ID.test(v)) { p.add(path, 'must be 1 to 40 letters, digits, "-" or "_"'); return ''; }
  if (seen.has(v)) p.add(path, `"${v}" is used twice`);
  seen.add(v);
  return v;
}
function list(p: Problems, path: string, v: unknown, min: number, max: number): unknown[] {
  if (v === undefined) v = [];
  if (!Array.isArray(v)) { p.add(path, 'must be a list'); return []; }
  if (v.length < min) p.add(path, `needs at least ${min} entries`);
  if (v.length > max) { p.add(path, `has more than ${max} entries`); return v.slice(0, max); }
  return v;
}

function image(p: Problems, path: string, v: unknown, media: Lookup): RoomImage | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObj(v)) { p.add(path, 'must be an object'); return undefined; }
  const alt = text(p, `${path}.alt`, v.alt, { min: 1, max: 300 });
  if (typeof v.media === 'string' && v.asset === undefined) {
    const found = ID.test(v.media) || /^[a-f0-9]{32}$/.test(v.media) ? media(v.media) : null;
    if (!found) { p.add(`${path}.media`, 'is not an uploaded image of yours'); return undefined; }
    return { media: v.media, width: found.width, height: found.height, alt };
  }
  if (typeof v.asset === 'string' && v.media === undefined) {
    const found = Object.hasOwn(IMAGE_LIBRARY, v.asset) ? IMAGE_LIBRARY[v.asset]! : null;
    if (!found) { p.add(`${path}.asset`, 'is not a picture of the library'); return undefined; }
    return { asset: v.asset, width: found.width, height: found.height, alt };
  }
  p.add(path, 'needs either media (an upload) or asset (a library picture)');
  return undefined;
}

function question(p: Problems, path: string, v: unknown, seen: Set<string>, media: Lookup): Question | null {
  if (!isObj(v)) { p.add(path, 'must be an object'); return null; }
  const type = v.type as QuestionType;
  if (!QUESTION_TYPES.includes(type)) { p.add(`${path}.type`, `must be one of: ${QUESTION_TYPES.join(', ')}`); return null; }
  const base: QuestionBase = {
    id: id(p, `${path}.id`, v.id, seen),
    type,
    prompt: text(p, `${path}.prompt`, v.prompt, { min: 1, max: 600 }, true),
    context: text(p, `${path}.context`, v.context, { max: 1200 }, true) || undefined,
    image: image(p, `${path}.image`, v.image, media),
    points: int(p, `${path}.points`, v.points, 1, 100, 10),
    hints: list(p, `${path}.hints`, v.hints, 0, 3).map((h, i) => text(p, `${path}.hints[${i}]`, h, { min: 1, max: 300 }, true)),
    explanation: text(p, `${path}.explanation`, v.explanation, { max: 1200 }, true),
    feedbackWrong: text(p, `${path}.feedbackWrong`, v.feedbackWrong, { max: 400 }, true) || undefined,
  };
  switch (type) {
    case 'choice': {
      const ids = new Set<string>();
      const options = list(p, `${path}.options`, v.options, 2, 8).map((o, i): ChoiceOption => {
        const at = `${path}.options[${i}]`;
        if (!isObj(o)) { p.add(at, 'must be an object'); return { id: '', label: '', correct: false }; }
        const correct = bool(p, `${at}.correct`, o.correct, false);
        const trap = bool(p, `${at}.trap`, o.trap, false);
        if (correct && trap) p.add(at, 'cannot be both correct and a trap');
        return {
          id: id(p, `${at}.id`, o.id, ids), label: text(p, `${at}.label`, o.label, { min: 1, max: 300 }), correct,
          ...(trap ? { trap } : {}), ...(o.feedback ? { feedback: text(p, `${at}.feedback`, o.feedback, { max: 400 }, true) } : {}),
        };
      });
      const multiple = bool(p, `${path}.multiple`, v.multiple, false);
      const right = options.filter((o) => o.correct).length;
      if (right === 0) p.add(`${path}.options`, 'need at least one correct option');
      if (!multiple && right > 1) p.add(`${path}.options`, 'have more than one correct option: allow multiple answers or keep one');
      if (right === options.length) p.add(`${path}.options`, 'are all correct: add at least one wrong option');
      return { ...base, type, options, multiple };
    }
    case 'truefalse':
      if (typeof v.answer !== 'boolean') p.add(`${path}.answer`, 'must be true or false');
      return { ...base, type, answer: v.answer === true, ...(bool(p, `${path}.trap`, v.trap, false) ? { trap: true } : {}) };
    case 'text': {
      const accepted = list(p, `${path}.accepted`, v.accepted, 1, 10).map((a, i) => text(p, `${path}.accepted[${i}]`, a, { min: 1, max: 120 }));
      const traps = list(p, `${path}.traps`, v.traps, 0, 6).map((t, i): TextTrap => {
        const at = `${path}.traps[${i}]`;
        if (!isObj(t)) { p.add(at, 'must be an object'); return { answer: '', feedback: '' }; }
        const answer = text(p, `${at}.answer`, t.answer, { min: 1, max: 120 });
        if (accepted.some((a) => foldText(a) === foldText(answer))) p.add(at, 'is also an accepted answer');
        return { answer, feedback: text(p, `${at}.feedback`, t.feedback, { max: 400 }, true) };
      });
      return { ...base, type, accepted, typoTolerance: bool(p, `${path}.typoTolerance`, v.typoTolerance, true), traps };
    }
    case 'number': {
      const value = num(p, `${path}.value`, v.value, -1e12, 1e12);
      const tolerance = v.tolerance === undefined ? 0 : num(p, `${path}.tolerance`, v.tolerance, 0, 1e12);
      const traps = list(p, `${path}.traps`, v.traps, 0, 6).map((t, i): NumberTrap => {
        const at = `${path}.traps[${i}]`;
        if (!isObj(t)) { p.add(at, 'must be an object'); return { value: 0, feedback: '' }; }
        const trapValue = num(p, `${at}.value`, t.value, -1e12, 1e12);
        if (Math.abs(trapValue - value) <= tolerance) p.add(at, 'falls inside the accepted range');
        return { value: trapValue, feedback: text(p, `${at}.feedback`, t.feedback, { max: 400 }, true) };
      });
      return { ...base, type, value, tolerance, unit: text(p, `${path}.unit`, v.unit, { max: 30 }) || undefined, traps };
    }
    case 'hotspot': {
      if (!base.image) p.add(`${path}.image`, 'is required: a click zone needs a picture');
      const w = base.image?.width ?? 1;
      const h = base.image?.height ?? 1;
      const ids = new Set<string>();
      const zones = list(p, `${path}.zones`, v.zones, 1, 12).map((z, i): Zone => {
        const at = `${path}.zones[${i}]`;
        if (!isObj(z)) { p.add(at, 'must be an object'); return { id: '', label: '', shape: 'circle', x: 0, y: 0, r: 1 }; }
        const shape = z.shape === 'rect' ? 'rect' : 'circle';
        if (z.shape !== 'rect' && z.shape !== 'circle') p.add(`${at}.shape`, 'must be circle or rect');
        const zone: Zone = {
          id: id(p, `${at}.id`, z.id, ids), label: text(p, `${at}.label`, z.label, { min: 1, max: 80 }), shape,
          x: num(p, `${at}.x`, z.x, 0, w), y: num(p, `${at}.y`, z.y, 0, h),
          ...(bool(p, `${at}.trap`, z.trap, false) ? { trap: true } : {}),
          ...(z.feedback ? { feedback: text(p, `${at}.feedback`, z.feedback, { max: 400 }, true) } : {}),
        };
        if (shape === 'circle') zone.r = num(p, `${at}.r`, z.r, 2, Math.max(w, h));
        else { zone.w = num(p, `${at}.w`, z.w, 2, w); zone.h = num(p, `${at}.h`, z.h, 2, h); }
        return zone;
      });
      if (!zones.some((z) => !z.trap)) p.add(`${path}.zones`, 'need at least one correct zone (a zone that is not a trap)');
      const decoyIds = new Set<string>();
      const decoys = list(p, `${path}.decoys`, v.decoys, 0, 6).map((d, i) => text(p, `${path}.decoys[${i}]`, d, { min: 1, max: 80 }));
      for (const d of decoys) { const k = foldText(d); if (decoyIds.has(k) || zones.some((z) => foldText(z.label) === k)) p.add(`${path}.decoys`, `"${d}" repeats a zone or another decoy`); decoyIds.add(k); }
      const labels = new Set<string>();
      for (const z of zones) { const k = foldText(z.label); if (labels.has(k)) p.add(`${path}.zones`, `two zones share the label "${z.label}"`); labels.add(k); }
      return { ...base, type, zones, tolerance: int(p, `${path}.tolerance`, v.tolerance, 0, 100, ROOM_RULES.defaultTolerance), require: v.require === 'all' ? 'all' : 'any', decoys };
    }
    case 'order': {
      const ids = new Set<string>();
      const items = list(p, `${path}.items`, v.items, 2, 10).map((it, i) => {
        const at = `${path}.items[${i}]`;
        if (!isObj(it)) { p.add(at, 'must be an object'); return { id: '', label: '' }; }
        return { id: id(p, `${at}.id`, it.id, ids), label: text(p, `${at}.label`, it.label, { min: 1, max: 200 }) };
      });
      return { ...base, type, items };
    }
    case 'match': {
      const ids = new Set<string>();
      const pairs = list(p, `${path}.pairs`, v.pairs, 2, 8).map((it, i) => {
        const at = `${path}.pairs[${i}]`;
        if (!isObj(it)) { p.add(at, 'must be an object'); return { id: '', left: '', right: '' }; }
        return { id: id(p, `${at}.id`, it.id, ids), left: text(p, `${at}.left`, it.left, { min: 1, max: 160 }), right: text(p, `${at}.right`, it.right, { min: 1, max: 160 }) };
      });
      const rights = new Set(pairs.map((x) => foldText(x.right)));
      if (rights.size !== pairs.length) p.add(`${path}.pairs`, 'repeat a right-hand label: each one must be different');
      return { ...base, type, pairs };
    }
  }
}

/**
 * Checks and normalises a room document. Every problem is reported at once (with its path), so the editor can show them all.
 * `publish` adds what a playable room needs (at least one question).
 */
export function validateRoomDoc(raw: unknown, media: Lookup, opts: { publish?: boolean } = {}): RoomDoc {
  const p = new Problems();
  if (!isObj(raw)) throw bad('The room must be an object.', ['room must be an object']);
  const seen = new Set<string>();
  const questions = list(p, 'room.questions', raw.questions, opts.publish ? 1 : 0, ROOM_RULES.maxQuestions)
    .map((q, i) => question(p, `room.questions[${i}]`, q, seen, media))
    .filter((q): q is Question => q !== null);
  const mode: RoomMode = raw.mode === 'exam' ? 'exam' : 'escape';
  if (raw.mode !== undefined && raw.mode !== 'exam' && raw.mode !== 'escape') p.add('room.mode', 'must be escape or exam');
  const discipline = (ROOM_DISCIPLINES as readonly string[]).includes(raw.discipline as string) ? raw.discipline as RoomDiscipline : 'general';
  if (raw.discipline !== undefined && discipline !== raw.discipline) p.add('room.discipline', `must be one of: ${ROOM_DISCIPLINES.join(', ')}`);
  const vaultCode = typeof raw.vaultCode === 'string' ? raw.vaultCode.trim().toUpperCase() : '';
  if (raw.vaultCode !== undefined && (typeof raw.vaultCode !== 'string' || !/^[A-Z0-9]{0,12}$/.test(vaultCode))) p.add('room.vaultCode', 'must be up to 12 letters (A-Z) or digits');
  const timeLimitSec = int(p, 'room.timeLimitSec', raw.timeLimitSec, 0, 4 * 3600, 0);
  if (timeLimitSec > 0 && timeLimitSec < 60) p.add('room.timeLimitSec', 'must be 0 (no limit) or at least 60 seconds');
  const doc: RoomDoc = {
    title: text(p, 'room.title', raw.title, { min: 2, max: 100 }),
    summary: text(p, 'room.summary', raw.summary, { max: 400 }, true),
    discipline,
    cover: image(p, 'room.cover', raw.cover, media),
    mode,
    timeLimitSec,
    shuffleQuestions: bool(p, 'room.shuffleQuestions', raw.shuffleQuestions, false),
    shuffleOptions: bool(p, 'room.shuffleOptions', raw.shuffleOptions, true),
    passPct: int(p, 'room.passPct', raw.passPct, 0, 100, 60),
    showFeedback: bool(p, 'room.showFeedback', raw.showFeedback, true),
    revealAnswers: bool(p, 'room.revealAnswers', raw.revealAnswers, true),
    vaultCode: mode === 'escape' ? vaultCode : '',
    maxAttempts: int(p, 'room.maxAttempts', raw.maxAttempts, 0, 20, 0),
    intro: text(p, 'room.intro', raw.intro, { max: 1200 }, true),
    outro: text(p, 'room.outro', raw.outro, { max: 600 }, true),
    questions,
  };
  const allowed = new Set(['title', 'summary', 'discipline', 'cover', 'mode', 'timeLimitSec', 'shuffleQuestions', 'shuffleOptions', 'passPct', 'showFeedback', 'revealAnswers', 'vaultCode', 'maxAttempts', 'intro', 'outro', 'questions']);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) p.add(`room.${k}`, 'is not a room setting');
  if (p.list.length) throw bad(`The room has ${p.list.length === 1 ? 'a problem' : `${p.list.length} problems`} to fix.`, p.list);
  return doc;
}

// ------------------------------------------------------------------ answers
/** NFKD, accents and case dropped, punctuation turned into spaces, spaces collapsed: "Éosinophile." and "eosinophile" are the same answer. */
export function foldText(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Edit distance, stopped as soon as it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]!);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export function textMatches(answer: string, expected: string, typoTolerance: boolean): boolean {
  const a = foldText(answer);
  const e = foldText(expected);
  if (!a) return false;
  if (a === e) return true;
  // One typo is forgiven on words long enough for a typo not to change the meaning; numbers and short answers must be exact.
  return typoTolerance && e.length >= 5 && !/\d/.test(e) && editDistance(a, e, 1) <= 1;
}

/** Distance from a point to a zone's edge (0 inside). */
export function zoneDistance(z: Zone, x: number, y: number): number {
  if (z.shape === 'circle') return Math.max(0, Math.hypot(x - z.x, y - z.y) - (z.r ?? 0));
  const dx = Math.max(z.x - x, 0, x - (z.x + (z.w ?? 0)));
  const dy = Math.max(z.y - y, 0, y - (z.y + (z.h ?? 0)));
  return Math.hypot(dx, dy);
}
export const inZone = (z: Zone, x: number, y: number, tolerance: number) => zoneDistance(z, x, y) <= tolerance + 1e-9;

export interface Verdict {
  correct: boolean;
  /** Share of the question that is right (partial credit in exam mode), 0..1. */
  fraction: number;
  trap: boolean;
  /** Feedback written by the teacher for this particular wrong answer, when there is one. */
  feedback?: string;
  /** Hotspot: which zone each click landed in (for the results heatmap), null = outside every zone. */
  hits?: Array<{ x: number; y: number; zone: string | null; trap: boolean }>;
}

const point = (v: unknown, w: number, h: number): { x: number; y: number } => {
  if (!isObj(v) || typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.y < 0 || v.x > w || v.y > h) {
    throw bad(`each click must be {x, y} inside the picture (0 to ${w} by 0 to ${h} pixels)`);
  }
  return { x: v.x, y: v.y };
};

/** Largest number of clicks that can each be paired with a different correct zone (tiny sizes: exhaustive search). */
function bestMatching(points: Array<{ x: number; y: number }>, zones: Zone[], tolerance: number): number {
  const fits = points.map((pt) => zones.map((z, j) => (inZone(z, pt.x, pt.y, tolerance) ? j : -1)).filter((j) => j >= 0));
  const used = new Set<number>();
  const go = (i: number): number => {
    if (i === points.length) return 0;
    let best = go(i + 1);
    for (const j of fits[i]!) {
      if (used.has(j)) continue;
      used.add(j);
      best = Math.max(best, 1 + go(i + 1));
      used.delete(j);
    }
    return best;
  };
  return go(0);
}

/** Grades one response. Throws 400 on a malformed response (that is never counted as a wrong try). */
export function grade(q: Question, response: unknown): Verdict {
  if (!isObj(response)) throw bad('response must be an object');
  const wrongFeedback = q.feedbackWrong;
  switch (q.type) {
    case 'choice': {
      const ids = q.options.map((o) => o.id);
      let picked: string[];
      if (q.multiple) {
        const c = response.choices;
        if (!Array.isArray(c) || c.length === 0 || new Set(c).size !== c.length || !c.every((x) => typeof x === 'string' && ids.includes(x))) throw bad('response.choices must list one or more option ids, each once');
        picked = c as string[];
      } else {
        const c = response.choice;
        if (typeof c !== 'string' || !ids.includes(c)) throw bad(`response.choice must be one of: ${ids.join(', ')}`);
        picked = [c];
      }
      const chosen = q.options.filter((o) => picked.includes(o.id));
      const rightTotal = q.options.filter((o) => o.correct).length;
      const rightPicked = chosen.filter((o) => o.correct).length;
      const wrongPicked = chosen.length - rightPicked;
      const correct = wrongPicked === 0 && rightPicked === rightTotal;
      const trapOption = chosen.find((o) => o.trap);
      const feedback = correct ? undefined : (trapOption?.feedback ?? chosen.find((o) => !o.correct && o.feedback)?.feedback ?? wrongFeedback);
      return { correct, fraction: correct ? 1 : q.multiple ? Math.max(0, (rightPicked - wrongPicked) / rightTotal) : 0, trap: !!trapOption, feedback };
    }
    case 'truefalse': {
      if (typeof response.value !== 'boolean') throw bad('response.value must be true or false');
      const correct = response.value === q.answer;
      return { correct, fraction: correct ? 1 : 0, trap: !correct && !!q.trap, feedback: correct ? undefined : wrongFeedback };
    }
    case 'text': {
      const a = response.text;
      if (typeof a !== 'string' || [...a].length > 200 || !foldText(a)) throw bad('response.text must be a non-empty answer of at most 200 characters');
      const trap = q.traps.find((t) => foldText(t.answer) === foldText(a));
      const correct = !trap && q.accepted.some((e) => textMatches(a, e, q.typoTolerance));
      return { correct, fraction: correct ? 1 : 0, trap: !!trap, feedback: correct ? undefined : (trap?.feedback || wrongFeedback) };
    }
    case 'number': {
      const v = response.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('response.value must be a number');
      const correct = Math.abs(v - q.value) <= q.tolerance + 1e-9 * Math.max(1, Math.abs(q.value));
      const trap = correct ? undefined : q.traps.find((t) => Math.abs(v - t.value) <= Math.max(q.tolerance, 1e-9 * Math.max(1, Math.abs(t.value))));
      return { correct, fraction: correct ? 1 : 0, trap: !!trap, feedback: correct ? undefined : (trap?.feedback || wrongFeedback) };
    }
    case 'hotspot': {
      const w = q.image?.width ?? 0;
      const h = q.image?.height ?? 0;
      const right = q.zones.filter((z) => !z.trap);
      const traps = q.zones.filter((z) => z.trap);
      // Text alternative: the learner names zones instead of clicking them (labels of real zones mixed with decoys).
      if (response.zone !== undefined || response.zones !== undefined) {
        const valid = new Set([...q.zones.map((z) => z.id), ...q.decoys.map((_, i) => `decoy-${i + 1}`)]);
        const given = q.require === 'all' ? response.zones : [response.zone];
        if (!Array.isArray(given) || given.length === 0 || new Set(given).size !== given.length || !given.every((x) => typeof x === 'string' && valid.has(x))) {
          throw bad(q.require === 'all' ? 'response.zones must list zone ids, each once' : 'response.zone must be one of the listed zones');
        }
        const named = given as string[];
        const hitRight = right.filter((z) => named.includes(z.id)).length;
        const wrongNamed = named.length - hitRight;
        const trapZone = traps.find((z) => named.includes(z.id));
        const correct = q.require === 'all' ? hitRight === right.length && wrongNamed === 0 : hitRight === 1 && wrongNamed === 0;
        const fraction = correct ? 1 : q.require === 'all' ? Math.max(0, (hitRight - wrongNamed) / right.length) : 0;
        return { correct, fraction, trap: !!trapZone, feedback: correct ? undefined : (trapZone?.feedback || wrongFeedback) };
      }
      const clicks = q.require === 'all'
        ? (() => {
          const pts = response.points;
          if (!Array.isArray(pts) || pts.length !== right.length) throw bad(`response.points must hold exactly ${right.length} clicks`);
          return pts.map((pt) => point(pt, w, h));
        })()
        : [point(response, w, h)];
      const hits = clicks.map((c) => {
        const zone = right.find((z) => inZone(z, c.x, c.y, q.tolerance)) ?? traps.find((z) => inZone(z, c.x, c.y, q.tolerance));
        return { x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, zone: zone?.id ?? null, trap: !!zone?.trap };
      });
      const matched = bestMatching(clicks, right, q.tolerance);
      const correct = matched === right.length && clicks.length === right.length;
      const trapHit = hits.find((x) => x.trap);
      const trapZone = trapHit ? traps.find((z) => z.id === trapHit.zone) : undefined;
      return { correct, fraction: correct ? 1 : q.require === 'all' ? matched / right.length : 0, trap: !correct && !!trapHit, feedback: correct ? undefined : (trapZone?.feedback || wrongFeedback), hits };
    }
    case 'order': {
      const o = response.order;
      const ids = q.items.map((i) => i.id);
      if (!Array.isArray(o) || o.length !== ids.length || new Set(o).size !== ids.length || !o.every((x) => typeof x === 'string' && ids.includes(x))) throw bad('response.order must list every item id exactly once');
      const right = ids.filter((x, i) => o[i] === x).length;
      return { correct: right === ids.length, fraction: right / ids.length, trap: false, feedback: right === ids.length ? undefined : wrongFeedback };
    }
    case 'match': {
      const m = response.pairs;
      const ids = q.pairs.map((x) => x.id);
      if (!isObj(m) || Object.keys(m).length !== ids.length || !ids.every((l) => typeof m[l] === 'string' && ids.includes(m[l] as string)) || new Set(Object.values(m)).size !== ids.length) {
        throw bad('response.pairs must map every left id to a different right id');
      }
      const right = ids.filter((l) => m[l] === l).length;
      return { correct: right === ids.length, fraction: right / ids.length, trap: false, feedback: right === ids.length ? undefined : wrongFeedback };
    }
  }
}

/** Points earned on one question. Escape mode: retries cost a share; exam mode: one answer, partial credit. Hints cost in both. */
export function earnedPoints(q: Question, mode: RoomMode, s: { wrong: number; hints: number; traps: number; fraction: number }): number {
  const keep = mode === 'escape'
    ? 1 - ROOM_RULES.wrongPenalty * s.wrong - ROOM_RULES.trapPenalty * s.traps - ROOM_RULES.hintPenalty * s.hints
    : s.fraction - ROOM_RULES.hintPenalty * s.hints;
  return Math.max(0, Math.round(q.points * Math.max(0, Math.min(1, keep))));
}

export const maxPoints = (doc: RoomDoc) => doc.questions.reduce((s, q) => s + q.points, 0);

// ------------------------------------------------------------------ public views
/** A deterministic shuffle (seeded per attempt), never the original order when there is a choice. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1_000_000) / 1_000_000; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}

export interface PublicQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  context?: string;
  image?: RoomImage;
  points: number;
  hintsAvailable: number;
  options?: { id: string; label: string }[];
  multiple?: boolean;
  unit?: string;
  require?: 'any' | 'all';
  /** Hotspot: number of clicks expected. */
  clicks?: number;
  /** Hotspot text alternative: labels of the zones mixed with decoys. */
  zoneChoices?: { id: string; label: string }[];
  items?: { id: string; label: string }[];
  left?: { id: string; label: string }[];
  right?: { id: string; label: string }[];
}

export function publicQuestion(q: Question, seed: string, shuffleOptions: boolean): PublicQuestion {
  const base: PublicQuestion = { id: q.id, type: q.type, prompt: q.prompt, context: q.context, image: q.image, points: q.points, hintsAvailable: q.hints.length };
  const mix = <T,>(xs: T[], salt: string) => (shuffleOptions ? seededShuffle(xs, `${seed}:${q.id}:${salt}`) : xs);
  switch (q.type) {
    case 'choice': return { ...base, options: mix(q.options.map((o) => ({ id: publicToken(seed, 'option', o.id), label: o.label })), 'o'), multiple: q.multiple };
    case 'truefalse': case 'text': return base;
    case 'number': return { ...base, unit: q.unit };
    case 'hotspot': {
      const right = q.zones.filter((z) => !z.trap).length;
      const choices = [...q.zones.map((z) => ({ id: publicToken(seed, 'zone', z.id), label: z.label })), ...q.decoys.map((d, i) => ({ id: publicToken(seed, 'zone', `decoy-${i + 1}`), label: d }))];
      // The text alternative is always shuffled: the teacher lists the correct zones first.
      return { ...base, require: q.require, clicks: q.require === 'all' ? right : 1, zoneChoices: seededShuffle(choices, `${seed}:${q.id}:z`) };
    }
    // Order items are always shuffled (the stored order is the answer); the right column of a match too.
    case 'order': return { ...base, items: seededShuffle(q.items.map((x) => ({ id: publicToken(seed, 'item', x.id), label: x.label })), `${seed}:${q.id}:i`) };
    case 'match': return { ...base, left: mix(q.pairs.map((x) => ({ id: publicToken(seed, 'left', x.id), label: x.left })), 'l'), right: seededShuffle(q.pairs.map((x) => ({ id: publicToken(seed, 'right', x.id), label: x.right })), `${seed}:${q.id}:r`) };
  }
}

/**
 * Translates a response written with the public tokens of `publicQuestion` back to the stored ids (what `grade` and the results views use).
 * An unknown token is left as it is, so `grade` refuses it with its usual 400.
 */
export function fromPublic(q: Question, response: unknown, seed: string): unknown {
  if (!isObj(response)) return response;
  const table = (kind: string, ids: string[]) => new Map(ids.map((x) => [publicToken(seed, kind, x), x]));
  const back = (m: Map<string, string>, v: unknown) => (typeof v === 'string' ? m.get(v) ?? v : v);
  switch (q.type) {
    case 'choice': {
      const m = table('option', q.options.map((o) => o.id));
      return { ...response, ...(response.choice !== undefined ? { choice: back(m, response.choice) } : {}), ...(Array.isArray(response.choices) ? { choices: response.choices.map((x) => back(m, x)) } : {}) };
    }
    case 'order': {
      const m = table('item', q.items.map((x) => x.id));
      return Array.isArray(response.order) ? { ...response, order: response.order.map((x) => back(m, x)) } : response;
    }
    case 'match': {
      const left = table('left', q.pairs.map((x) => x.id));
      const right = table('right', q.pairs.map((x) => x.id));
      if (!isObj(response.pairs)) return response;
      return { ...response, pairs: Object.fromEntries(Object.entries(response.pairs).map(([l, r]) => [left.get(l) ?? l, back(right, r)])) };
    }
    case 'hotspot': {
      const m = table('zone', [...q.zones.map((z) => z.id), ...q.decoys.map((_, i) => `decoy-${i + 1}`)]);
      return { ...response, ...(response.zone !== undefined ? { zone: back(m, response.zone) } : {}), ...(Array.isArray(response.zones) ? { zones: response.zones.map((x) => back(m, x)) } : {}) };
    }
    default: return response;
  }
}

/** The expected answer, written for the review after the attempt (only when the teacher allows it). */
export function expectedAnswer(q: Question): Record<string, unknown> {
  switch (q.type) {
    case 'choice': return { options: q.options.map((o) => ({ id: o.id, label: o.label, correct: o.correct, trap: !!o.trap })) };
    case 'truefalse': return { value: q.answer };
    case 'text': return { accepted: q.accepted };
    case 'number': return { value: q.value, tolerance: q.tolerance, unit: q.unit };
    case 'hotspot': return { zones: q.zones.map((z) => ({ id: z.id, label: z.label, shape: z.shape, x: z.x, y: z.y, r: z.r, w: z.w, h: z.h, trap: !!z.trap })), tolerance: q.tolerance };
    case 'order': return { order: q.items };
    case 'match': return { pairs: q.pairs };
  }
}

/** Splits the vault code over the questions, in play order: question i reveals its slice once solved. */
export function fragmentSlices(code: string, count: number): string[] {
  if (!code || count === 0) return Array.from({ length: count }, () => '');
  const out: string[] = Array.from({ length: count }, () => '');
  const chars = [...code];
  chars.forEach((c, i) => { out[Math.floor((i * count) / chars.length)] += c; });
  return out;
}

// ------------------------------------------------------------------ quality check
export interface QualityNote { level: 'error' | 'warning' | 'tip'; questionId?: string; code: string; message: string }

/**
 * A deterministic review of the room, run on every save: what would confuse a learner, what a reviewer would flag, what makes the
 * results harder to read. It never blocks a draft; errors block publishing.
 */
export function qualityCheck(doc: RoomDoc): { score: number; notes: QualityNote[] } {
  const notes: QualityNote[] = [];
  const add = (level: QualityNote['level'], code: string, message: string, questionId?: string) => notes.push({ level, code, message, ...(questionId ? { questionId } : {}) });
  if (doc.questions.length === 0) add('error', 'no_questions', 'Add at least one question before publishing.');
  if (doc.questions.length > 0 && doc.questions.length < 3) add('tip', 'few_questions', 'A room with at least 3 questions gives more reliable results.');
  if (!doc.cover) add('tip', 'no_cover', 'A cover picture makes the room easier to recognise on the student map.');
  if (!doc.summary) add('tip', 'no_summary', 'Write a one-line summary: students see it before they start.');
  if (doc.mode === 'escape' && !doc.vaultCode) add('tip', 'no_vault', 'Add a vault code: each solved question reveals part of it, and the room ends when it is entered.');
  if (doc.mode === 'escape' && doc.vaultCode && doc.vaultCode.length > doc.questions.length * 3 && doc.questions.length > 0) add('warning', 'long_vault', 'The vault code is long for the number of questions: several characters are revealed at once.');
  const types = new Set(doc.questions.map((q) => q.type));
  if (doc.questions.length >= 5 && types.size === 1) add('tip', 'one_type', 'All questions use the same format: mixing formats keeps attention and tests reasoning differently.');
  if (doc.questions.length >= 3 && !doc.questions.some((q) => hasTrap(q))) add('tip', 'no_traps', 'No trap yet: a tempting wrong answer with its own feedback shows exactly which misconception a student holds.');

  const correctPositions: number[] = [];
  for (const q of doc.questions) {
    if (!q.explanation) add('warning', 'no_explanation', 'No explanation: students who answer cannot learn why it is right.', q.id);
    if (q.hints.length === 0 && doc.mode === 'escape') add('tip', 'no_hint', 'No hint: a student stuck on this question can only guess.', q.id);
    if (q.image && q.image.alt.length < 10) add('warning', 'short_alt', 'The picture description is very short for a learner who cannot see it.', q.id);
    switch (q.type) {
      case 'choice': {
        if (q.options.length < 3) add('tip', 'two_options', 'Only two options: a guess is right half of the time.', q.id);
        for (const o of q.options) if (o.trap && !o.feedback) add('warning', 'trap_without_feedback', `Trap "${o.label}" has no feedback: the student will not learn why it is tempting.`, q.id);
        if (!q.multiple) correctPositions.push(q.options.findIndex((o) => o.correct));
        const labels = q.options.map((o) => foldText(o.label));
        if (new Set(labels).size !== labels.length) add('error', 'duplicate_option', 'Two options have the same text.', q.id);
        const longest = q.options.reduce((a, o) => (o.label.length > a.label.length ? o : a), q.options[0]!);
        if (longest.correct && q.options.length >= 3 && longest.label.length > 1.6 * Math.max(...q.options.filter((o) => o !== longest).map((o) => o.label.length))) {
          add('tip', 'longest_is_right', 'The correct option is much longer than the others: students often guess the longest one.', q.id);
        }
        break;
      }
      case 'text':
        if (q.accepted.length === 1 && q.accepted[0]!.split(' ').length > 3) add('tip', 'one_spelling', 'A long expected answer with a single spelling: add the other ways a correct student could write it.', q.id);
        for (const t of q.traps) if (!t.feedback) add('warning', 'trap_without_feedback', `Trap answer "${t.answer}" has no feedback.`, q.id);
        break;
      case 'number':
        if (q.tolerance === 0 && !Number.isInteger(q.value)) add('tip', 'zero_tolerance', 'A decimal answer with no tolerance: rounding differences will be marked wrong.', q.id);
        if (!q.unit) add('tip', 'no_unit', 'No unit shown: say which unit the answer uses.', q.id);
        for (const t of q.traps) if (!t.feedback) add('warning', 'trap_without_feedback', `Trap value ${t.value} has no feedback.`, q.id);
        break;
      case 'hotspot': {
        const img = q.image;
        if (!img) break;
        const side = Math.min(img.width, img.height);
        for (const z of q.zones) {
          const size = z.shape === 'circle' ? 2 * (z.r ?? 0) : Math.min(z.w ?? 0, z.h ?? 0);
          if (!z.trap && size + 2 * q.tolerance < side * 0.02) add('warning', 'tiny_zone', `Zone "${z.label}" is very small: on a phone it is hard to hit even when the student knows the answer.`, q.id);
          if (z.trap && !z.feedback) add('warning', 'trap_without_feedback', `Trap zone "${z.label}" has no feedback.`, q.id);
        }
        for (const a of q.zones) for (const b of q.zones) {
          if (a.id < b.id && !!a.trap !== !!b.trap && overlap(a, b, q.tolerance)) add('error', 'zones_overlap', `Correct zone and trap zone overlap ("${a.label}", "${b.label}"): one click could count as both.`, q.id);
        }
        if (q.decoys.length === 0 && q.zones.length < 3) add('tip', 'few_choices', 'The text alternative offers few labels: add decoy labels so a non-visual learner is not guessing between two.', q.id);
        break;
      }
      case 'truefalse':
        if (!q.feedbackWrong) add('tip', 'tf_feedback', 'True/false questions teach more when the wrong answer gets a short explanation.', q.id);
        break;
      default:
        break;
    }
  }
  if (correctPositions.length >= 4 && new Set(correctPositions).size === 1 && !doc.shuffleOptions) add('warning', 'same_position', 'The correct option is always in the same position and options are not shuffled.');

  const weight = { error: 20, warning: 6, tip: 2 } as const;
  const score = Math.max(0, 100 - notes.reduce((s, n) => s + weight[n.level], 0));
  return { score, notes };
}

const hasTrap = (q: Question) =>
  (q.type === 'choice' && q.options.some((o) => o.trap)) || (q.type === 'truefalse' && !!q.trap) || ((q.type === 'text' || q.type === 'number') && q.traps.length > 0)
  || (q.type === 'hotspot' && q.zones.some((z) => z.trap));

function overlap(a: Zone, b: Zone, tolerance: number): boolean {
  // Sample the smaller zone's area and look for a point that falls in both once tolerance is added.
  const box = (z: Zone) => (z.shape === 'circle' ? { x0: z.x - z.r!, y0: z.y - z.r!, x1: z.x + z.r!, y1: z.y + z.r! } : { x0: z.x, y0: z.y, x1: z.x + z.w!, y1: z.y + z.h! });
  const A = box(a);
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const x = A.x0 + ((A.x1 - A.x0) * i) / 12;
    const y = A.y0 + ((A.y1 - A.y0) * j) / 12;
    if (inZone(a, x, y, 0) && inZone(b, x, y, tolerance)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ built-in missions as templates
/** Turns a built-in mission into an editable room (the teacher edits a copy; the original catalogue never changes). */
export function roomFromMission(m: Mission): RoomDoc {
  const questions = m.steps.map((s, i) => questionFromStep(s, i)).filter((q): q is Question => q !== null);
  return {
    title: `${m.title} (copy)`, summary: `Imported from the built-in mission "${m.title}". Edit freely: the original mission is not changed.`,
    discipline: (ROOM_DISCIPLINES as readonly string[]).includes(m.labSlug) ? m.labSlug as RoomDiscipline : 'general',
    mode: 'escape', timeLimitSec: m.timeLimitSec, shuffleQuestions: false, shuffleOptions: true, passPct: 60, showFeedback: true, revealAnswers: true,
    vaultCode: '', maxAttempts: 0, intro: '', outro: '', questions,
  };
}

const DECISION_LABELS: Record<string, string> = { accept: 'Accept and report', reject: 'Reject and request a new sample', repeat: 'Correct the interference and re-measure' };

function questionFromStep(s: Step, i: number): Question | null {
  const base = {
    id: `q${i + 1}`, prompt: s.prompt, context: s.context, points: 10, hints: s.hints.slice(0, 3), explanation: s.explanation, feedbackWrong: s.recheck,
  };
  const k = s.key;
  if (k.kind === 'choice' || k.kind === 'decision') {
    const opts = s.data.options ?? (k.kind === 'decision' ? Object.entries(DECISION_LABELS).map(([id, label]) => ({ id, label })) : []);
    return {
      ...base, type: 'choice', multiple: false,
      options: opts.map((o) => ({ id: o.id, label: o.label, correct: o.id === k.answer, ...(s.recheckByOption?.[o.id] ? { trap: true, feedback: s.recheckByOption[o.id] } : {}) })),
    };
  }
  if (k.kind === 'order') return { ...base, type: 'order', items: k.order.map((id) => ({ id, label: s.data.items!.find((x) => x.id === id)!.label })) };
  if (k.kind === 'match') {
    return { ...base, type: 'match', pairs: (s.data.left ?? []).map((l) => ({ id: l.id, left: l.label, right: s.data.right!.find((r) => r.id === k.pairs[l.id])!.label })) };
  }
  if (k.kind === 'point' && s.data.image && Object.hasOwn(IMAGE_LIBRARY, s.data.image.asset) && !k.targets) {
    const lib = IMAGE_LIBRARY[s.data.image.asset]!;
    // Built-in keys are percentages of the artwork; rooms use natural pixels.
    return {
      ...base, type: 'hotspot', image: { asset: s.data.image.asset, width: lib.width, height: lib.height, alt: s.data.image.caption },
      zones: [{ id: 'z1', label: 'Target', shape: 'circle', x: Math.round((k.x / 100) * lib.width), y: Math.round((k.y / 100) * lib.height), r: Math.round((k.r / 100) * lib.width) }],
      tolerance: ROOM_RULES.defaultTolerance, require: 'any', decoys: [],
    };
  }
  return null;
}
