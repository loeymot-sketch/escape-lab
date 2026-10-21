// Teacher rooms on the client: the shapes the API sends (be/src/rooms.ts, be/src/studio.ts), blank questions for the editor,
// picture sources, pixel geometry for hotspots and the CSV export. The server stays the authority for every answer and score.
import labBiochemistry from '../assets/lab-biochemistry.webp';
import labHematology from '../assets/lab-hematology.webp';
import labMaster from '../assets/lab-master.webp';
import labMicrobiology from '../assets/lab-microbiology.webp';
import bloodSmear from '../assets/blood-smear-hero.webp';
import culture1 from '../assets/culture-observation-01.webp';
import culture2 from '../assets/culture-observation-02.webp';
import culture3 from '../assets/culture-observation-03.webp';
import culture4 from '../assets/culture-observation-04.webp';
import bioKidney from '../assets/mission-biochemistry-kidney.webp';
import bioPanel from '../assets/mission-biochemistry-panel.webp';
import hemSample from '../assets/mission-hematology-sample.webp';
import hemSmear from '../assets/mission-hematology-smear.webp';
import micCulture from '../assets/mission-microbiology-culture.webp';
import micPetri from '../assets/mission-microbiology-petri.webp';
import micStain from '../assets/mission-microbiology-stain.webp';
import vault from '../assets/progression-vault.webp';
import { mediaUrl } from './api';

export type QuestionType = 'choice' | 'truefalse' | 'text' | 'number' | 'hotspot' | 'order' | 'match';
export const QUESTION_TYPES: QuestionType[] = ['choice', 'truefalse', 'text', 'number', 'hotspot', 'order', 'match'];
/** English labels; shown with t(). */
export const TYPE_LABELS: Record<QuestionType, string> = {
  choice: 'Multiple choice', truefalse: 'True or false', text: 'Short answer', number: 'Numeric answer', hotspot: 'Click on the picture', order: 'Put in order', match: 'Match pairs',
};
export const TYPE_HELP: Record<QuestionType, string> = {
  choice: 'One or several correct options, with trap options that get their own feedback.',
  truefalse: 'A statement to judge. Mark it as a trap when the wrong answer is a common misconception.',
  text: 'A typed answer. Accents, case and punctuation are ignored; one typo can be forgiven.',
  number: 'A value with a tolerance and a unit. Trap values catch typical errors (wrong unit, wrong step).',
  hotspot: 'Students click a zone of a picture. You draw the zones and choose the tolerance in pixels.',
  order: 'Steps to put back in order. Students see them shuffled.',
  match: 'Pairs to connect. Students see the right column shuffled.',
};

export const DISCIPLINES = ['hematology', 'microbiology', 'biochemistry', 'immunology', 'parasitology', 'bloodbank', 'molecular', 'cytology', 'histology', 'quality', 'general'] as const;
export type Discipline = typeof DISCIPLINES[number];
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  hematology: 'Hematology', microbiology: 'Microbiology', biochemistry: 'Clinical biochemistry', immunology: 'Immunology', parasitology: 'Parasitology',
  bloodbank: 'Blood bank', molecular: 'Molecular biology', cytology: 'Cytology', histology: 'Histology', quality: 'Quality management', general: 'General',
};
export const disciplineTone = (d: string) => (d === 'hematology' || d === 'bloodbank' ? 'red' : d === 'microbiology' || d === 'parasitology' || d === 'molecular' ? 'teal' : d === 'biochemistry' || d === 'quality' ? 'gold' : 'violet');

export interface RoomImage { media?: string; asset?: string; width: number; height: number; alt: string }
export interface ChoiceOption { id: string; label: string; correct: boolean; trap?: boolean; feedback?: string }
export interface Zone { id: string; label: string; shape: 'circle' | 'rect'; x: number; y: number; r?: number; w?: number; h?: number; trap?: boolean; feedback?: string }

interface Base { id: string; type: QuestionType; prompt: string; context?: string; image?: RoomImage; points: number; hints: string[]; explanation: string; feedbackWrong?: string }
export type Question = Base & (
  | { type: 'choice'; options: ChoiceOption[]; multiple: boolean }
  | { type: 'truefalse'; answer: boolean; trap?: boolean }
  | { type: 'text'; accepted: string[]; typoTolerance: boolean; traps: { answer: string; feedback: string }[] }
  | { type: 'number'; value: number; tolerance: number; unit?: string; traps: { value: number; feedback: string }[] }
  | { type: 'hotspot'; zones: Zone[]; tolerance: number; require: 'any' | 'all'; decoys: string[] }
  | { type: 'order'; items: { id: string; label: string }[] }
  | { type: 'match'; pairs: { id: string; left: string; right: string }[] }
);

export interface RoomDoc {
  title: string; summary: string; discipline: Discipline; cover?: RoomImage; mode: 'escape' | 'exam'; timeLimitSec: number; shuffleQuestions: boolean; shuffleOptions: boolean;
  passPct: number; showFeedback: boolean; revealAnswers: boolean; vaultCode: string; maxAttempts: number; intro: string; outro: string; questions: Question[];
}
export type RoomStatus = 'draft' | 'published' | 'archived';
export interface QualityNote { level: 'error' | 'warning' | 'tip'; questionId?: string; code: string; message: string }
export interface RoomStats { attempts: number; students: number; finished: number; avgPct: number | null }
export interface Room { id: string; status: RoomStatus; version: number; showcase: boolean; updatedAt: number; publishedAt: number | null; classIds: number[]; doc: RoomDoc; quality: { score: number; notes: QualityNote[] }; stats: RoomStats; maxScore: number }
export interface RoomSummary {
  id: string; title: string; summary: string; discipline: Discipline; mode: 'escape' | 'exam'; status: RoomStatus; version: number; showcase: boolean; questions: number; types: QuestionType[];
  cover: RoomImage | null; timeLimitSec: number; updatedAt: number; publishedAt: number | null; classIds: number[]; stats: RoomStats; quality: number;
}
export interface MediaItem { id: string; mime: string; width: number; height: number; size: number; name: string; createdAt: number }
export interface LibraryImage { id: string; width: number; height: number; label: string }

export interface PublicQuestion {
  id: string; type: QuestionType; prompt: string; context?: string; image?: RoomImage; points: number; hintsAvailable: number;
  options?: { id: string; label: string }[]; multiple?: boolean; unit?: string; require?: 'any' | 'all'; clicks?: number; zoneChoices?: { id: string; label: string }[];
  items?: { id: string; label: string }[]; left?: { id: string; label: string }[]; right?: { id: string; label: string }[];
  /** Student attempts only. */
  ordinal?: number; wrong?: number; hintsGiven?: string[];
}
export interface AttemptView {
  attemptId: string; roomId: string; title: string; discipline: Discipline; mode: 'escape' | 'exam'; cover: RoomImage | null; intro: string;
  status: 'in_progress' | 'vault' | 'completed' | 'timeout'; index: number; total: number; startedAt: number; completedAt: number | null;
  timeLimitSec: number; remainingSec: number | null; serverNow: number; /** null during an exam without feedback. */ score: number | null; maxScore: number; passPct: number; showFeedback: boolean;
  question: (PublicQuestion & { ordinal: number; wrong: number; hintsGiven: string[] }) | null;
  progress: { ordinal: number; done: boolean; solved: boolean | null }[];
  vault: { length: number; fragments: { ordinal: number; chars: string | null; size: number }[]; triesLeft: number } | null;
  outro: string;
  /** XP the finished attempt added (improvement over the room's previous best); null while it runs. */
  xpAwarded?: number | null;
}
export interface AnswerResult {
  recorded: true; correct: boolean | null; trap: boolean | null; feedback: string | null; explanation: string | null; earned: number | null; fragment: string | null; attempt: AttemptView;
}
export interface ReviewQuestion {
  ordinal: number; id: string; type: QuestionType; prompt: string; image: RoomImage | null; points: number; earned: number; answered: boolean; solved: boolean; tries: number;
  wrong: number; traps: number; hints: number; responses: { correct: boolean; trap: boolean; display?: string; r: Record<string, unknown>; h: { x: number; y: number; zone: string | null; trap: boolean }[] | null }[];
  explanation: string; expected: Record<string, unknown> | null; labels: Record<string, string>;
}
export interface Review {
  attemptId: string; roomId: string; title: string; mode: 'escape' | 'exam'; status: string; startedAt: number; completedAt: number | null; durationSec: number | null;
  score: number; maxScore: number; pct: number; passPct: number; passed: boolean; outro: string;
  totals: { correct: number; questions: number; wrong: number; hints: number; traps: number }; questions: ReviewQuestion[];
  student?: { id: number; name: string };
}
export interface StudentRoom {
  id: string; title: string; summary: string; discipline: Discipline; mode: 'escape' | 'exam'; cover: RoomImage | null; teacher: string; questions: number; timeLimitSec: number;
  maxScore: number; passPct: number; hasVault: boolean; activeAttemptId: string | null; attemptsLeft: number | null;
  best: { attemptId: string; score: number; maxScore: number; pct: number | null; passed: boolean; status: string } | null;
}
export interface Click { x: number; y: number; zone: string | null; trap: boolean; correct: boolean }
export interface ResultQuestion {
  id: string; type: QuestionType; prompt: string; points: number; image: RoomImage | null; reached: number; firstTryPct: number | null; solvedPct: number | null; trapPct: number | null;
  avgTries: number | null; hintsUsed: number;
  options?: { id: string; label: string; correct: boolean; trap: boolean; picks: number }[];
  answer?: boolean; trueCount?: number; falseCount?: number;
  answers?: { answer: string; count: number; correct: boolean; trap: boolean }[];
  zones?: (Zone & { trap: boolean })[]; tolerance?: number; clicks?: Click[]; textChoices?: { zone: string; count: number }[];
}
export interface AttemptRowView {
  attemptId: string; student: { id: number; name: string }; status: string; version: number; startedAt: number; completedAt: number | null; durationSec: number | null;
  score: number; maxScore: number; pct: number | null; passed: boolean | null; correct: number; wrong: number; hints: number; traps: number;
}
export interface Results {
  room: { id: string; title: string; status: RoomStatus; version: number; mode: 'escape' | 'exam'; passPct: number; maxScore: number; questions: number };
  classes: { id: number; name: string }[];
  classId: number | null;
  summary: { attempts: number; students: number; finished: number; inProgress: number; avgPct: number | null; medianPct: number | null; passRate: number | null; medianDurationSec: number | null; trapRate: number | null; distribution: number[] };
  attempts: AttemptRowView[]; questions: ResultQuestion[];
}

// ------------------------------------------------------------------ guards
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A payload that is not even the right container is an invalid response, never rendered half-way. */
export function expectRecord<T>(raw: unknown, key?: string): T {
  if (!isRec(raw) || (key !== undefined && !(key in raw))) throw new TypeError('The server returned an unexpected response.');
  return raw as T;
}

// ------------------------------------------------------------------ pictures
export const LIBRARY_SRC: Record<string, string> = {
  'smear-schistocyte-01': bloodSmear, 'culture-observation-01': culture1, 'culture-observation-02': culture2, 'culture-observation-03': culture3, 'culture-observation-04': culture4,
  'mission-hematology-smear': hemSmear, 'mission-hematology-sample': hemSample, 'mission-microbiology-petri': micPetri, 'mission-microbiology-stain': micStain,
  'mission-microbiology-culture': micCulture, 'mission-biochemistry-panel': bioPanel, 'mission-biochemistry-kidney': bioKidney,
  'lab-hematology': labHematology, 'lab-microbiology': labMicrobiology, 'lab-biochemistry': labBiochemistry, 'lab-master': labMaster, 'progression-vault': vault,
};
export function imageSrc(img: { media?: string; asset?: string } | null | undefined): string | null {
  if (!img) return null;
  if (img.media) return mediaUrl(img.media);
  if (img.asset) return LIBRARY_SRC[img.asset] ?? null;
  return null;
}

/** Natural-pixel position of a pointer on an image drawn at any size (the image keeps its aspect ratio). */
export function toNatural(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }, natural: { width: number; height: number }) {
  const x = ((clientX - box.left) / box.width) * natural.width;
  const y = ((clientY - box.top) / box.height) * natural.height;
  return { x: Math.round(Math.min(natural.width, Math.max(0, x)) * 10) / 10, y: Math.round(Math.min(natural.height, Math.max(0, y)) * 10) / 10 };
}
/** Distance (natural pixels) from a point to a zone's edge, 0 inside: the same rule as the server. */
export function zoneDistance(z: Zone, x: number, y: number): number {
  if (z.shape === 'circle') return Math.max(0, Math.hypot(x - z.x, y - z.y) - (z.r ?? 0));
  const dx = Math.max(z.x - x, 0, x - (z.x + (z.w ?? 0)));
  const dy = Math.max(z.y - y, 0, y - (z.y + (z.h ?? 0)));
  return Math.hypot(dx, dy);
}

// ------------------------------------------------------------------ editor helpers
export const newId = (prefix = 'q') => `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export function blankQuestion(type: QuestionType): Question {
  const base = { id: newId('q'), prompt: '', points: 10, hints: [], explanation: '' };
  switch (type) {
    case 'choice': return { ...base, type, multiple: false, options: [{ id: newId('o'), label: '', correct: true }, { id: newId('o'), label: '', correct: false }, { id: newId('o'), label: '', correct: false, trap: true, feedback: '' }] };
    case 'truefalse': return { ...base, type, answer: true };
    case 'text': return { ...base, type, accepted: [''], typoTolerance: true, traps: [] };
    case 'number': return { ...base, type, value: 0, tolerance: 0, unit: '', traps: [] };
    case 'hotspot': return { ...base, type, zones: [], tolerance: 5, require: 'any', decoys: [] };
    case 'order': return { ...base, type, items: [{ id: newId('i'), label: '' }, { id: newId('i'), label: '' }, { id: newId('i'), label: '' }] };
    case 'match': return { ...base, type, pairs: [{ id: newId('p'), left: '', right: '' }, { id: newId('p'), left: '', right: '' }, { id: newId('p'), left: '', right: '' }] };
  }
}

export const blankRoom = (): RoomDoc => ({
  title: '', summary: '', discipline: 'general', mode: 'escape', timeLimitSec: 0, shuffleQuestions: false, shuffleOptions: true, passPct: 60, showFeedback: true,
  revealAnswers: true, vaultCode: '', maxAttempts: 0, intro: '', outro: '', questions: [],
});

/** "room.questions[2].options[1].label must ..." becomes { question: 2, text: "options[1].label must ..." } so the editor can point at the question. */
export function splitProblem(detail: string): { question: number | null; text: string } {
  const m = /^room\.questions\[(\d+)\]\.?(.*)$/.exec(detail);
  if (m) return { question: Number(m[1]), text: m[2]! };
  return { question: null, text: detail.replace(/^room\./, '') };
}

/** Moves item `from` to `to` (a copy). */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x!);
  return out;
}

// ------------------------------------------------------------------ sharing
/** A room exported as a file another teacher can import (pictures uploaded by someone else cannot travel: they are dropped on import). */
export const ROOM_FILE_KIND = 'escape-lab-room';
export function roomFile(doc: RoomDoc): string {
  return JSON.stringify({ kind: ROOM_FILE_KIND, version: 1, doc }, null, 2);
}
/** Reads an exported room; pictures that are not in `ownMedia` are removed (with the zones that depended on them). */
export function readRoomFile(text: string, ownMedia: Set<string>): { doc: RoomDoc; dropped: number } {
  const parsed = JSON.parse(text) as { kind?: unknown; doc?: unknown };
  if (!isRec(parsed) || parsed.kind !== ROOM_FILE_KIND || !isRec(parsed.doc)) throw new TypeError('This file is not an Escape Lab room.');
  const doc = parsed.doc as unknown as RoomDoc;
  let dropped = 0;
  const keep = (img: RoomImage | undefined) => (img && img.media && !ownMedia.has(img.media) ? (dropped += 1, undefined) : img);
  const questions = (Array.isArray(doc.questions) ? doc.questions : []).map((q) => {
    const image = keep(q.image);
    return q.type === 'hotspot' && !image ? { ...q, image, zones: [] } : { ...q, image };
  }) as Question[];
  return { doc: { ...doc, cover: keep(doc.cover), questions }, dropped };
}

// ------------------------------------------------------------------ export
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // A leading = + - @ would make a spreadsheet run the cell as a formula.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(rows: unknown[][]): string {
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
