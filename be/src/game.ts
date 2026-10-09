// Game rules: availability, attempts, server-authoritative scoring, vault, badges, dashboard.
import { randomInt, randomUUID } from 'node:crypto';
import type { HintProvider } from './assistant.ts';
import { StandardOnlyProvider, exceedsHintLimit, hasSubstance, leaksAnswer } from './assistant.ts';
import { LABS, LAB_BY_SLUG, MISSIONS, MISSION_BY_ID, STANDARD_LAB_SLUGS, STEP_COMPETENCIES, exitCode, fragmentSlots, missionsOf } from './content.ts';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { checkResponse, publicStep, revealedValues } from './engines.ts';
import { ApiError, bad, conflict, forbidden, hasVisibleCharacter, notFound, visibleLength } from './http.ts';
import { classNameKey, hasBidiControl, imitatesReviewerSuffix, isBlankName, nameKey, sameName } from './names.ts';
import { HINT_PENALTY, WRONG_PENALTY, computeScore, levelProgress, maxScore, mmss } from './scoring.ts';
import type { LedgerRow } from './scoring.ts';
import type { Lab, Mission, Step } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any[];

export const BADGES = [
  { id: 'hematology-detective', name: 'Hematology Detective', description: 'Escape the Hematology Lab.', lab: 'hematology' },
  { id: 'microbiology-investigator', name: 'Microbiology Investigator', description: 'Escape the Microbiology Lab.', lab: 'microbiology' },
  { id: 'biochemistry-analyst', name: 'Biochemistry Analyst', description: 'Escape the Clinical Biochemistry Lab.', lab: 'biochemistry' },
  { id: 'first-escape', name: 'First Escape', description: 'Open your first lab exit.', lab: null },
  { id: 'perfect-mission', name: 'Perfect Mission', description: 'Complete a mission with no wrong answer.', lab: null },
  { id: 'no-hint', name: 'No Hint', description: 'Complete a mission without using a hint.', lab: null },
  { id: 'clinical-detective', name: 'Clinical Detective', description: 'Escape the Master Lab.', lab: 'master' },
] as const;
type Badge = typeof BADGES[number];
const BADGE_BY_ID = new Map<string, Badge>(BADGES.map((b) => [b.id as string, b]));
const LAB_BADGE: Record<string, string> = { hematology: 'hematology-detective', microbiology: 'microbiology-investigator', biochemistry: 'biochemistry-analyst', master: 'clinical-detective' };


const IMPROVE: Record<string, string> = {
  'Hematology interpretation': 'revisit red cell indices and what each one says about the cause.',
  'Microbiology investigation': 'revisit Gram stain and colony morphology.',
  'Clinical biochemistry': 'revisit reference ranges, interference and acid-base steps.',
  'Pre-analytical quality': 'revisit specimen rejection criteria and common interferences.',
  'Clinical reasoning': 'practice linking findings across disciplines.',
};

const CODE_MAX_WRONG = 5;
/** Most classes one teacher can own. */
export const MAX_CLASSES_PER_TEACHER = 50;
/** Identity recorded for a content review: the display name is editable and not unique, the account id is neither. */
export const reviewerLabel = (name: string, id: number) => `${name} (teacher #${id})`;
/** Display name the seeded demo teacher is restored to by POST /demo/reset; no other teacher may hold it. */
export const DEMO_TEACHER_NAME = 'Dr. Claire Moreau';
/** "1 mission", "2 missions". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Teacher view thresholds (published in /api/rules). */
export const INACTIVE_DAYS = 7;
export const ATTENTION_ACCURACY = 60;
export const NEEDS_ATTENTION_BELOW = 70;
const STANDARD_MISSION_COUNT = MISSIONS.filter((m) => m.labSlug !== 'master').length;
const CODE_WINDOW_MS = 10 * 60 * 1000;
const DAY = 86_400_000;
/** Splits text into user-perceived characters (a family emoji, a flag and a letter with its combining marks are one each). */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });
/** Hangul filler letters: \p{L}, drawn as nothing. */
const INITIAL_FILLERS = /[\u3164\u115F\u1160\uFFA0]/u;

export interface HintGiven { level: number; text: string; source: 'standard' | 'assistant' }
export interface Opts { now?: () => number; assistant?: HintProvider }

export class Game {
  private readonly hintInFlight = new Set<string>();
  db: DB;
  now: () => number;
  assistant: HintProvider;
  constructor(db: DB, opts: Opts = {}) {
    this.db = db;
    this.now = opts.now ?? Date.now;
    this.assistant = opts.assistant ?? new StandardOnlyProvider();
  }

  // Statements are prepared once per SQL text (the leaderboard and analytics run the same few queries per student).
  private readOnly = false;
  /**
   * Runs `fn` (a synchronous read) as a safe request (HEAD, R15-A-04): the lazy writes of read paths (closing timed-out attempts, catching up badges) are skipped,
   * and SQLite itself refuses any other write (`PRAGMA query_only`), so a HEAD can never change a row. The answer reflects the stored state: an overdue attempt
   * is still reported as in progress until a GET (or any write path) closes it.
   */
  readOnlyRequest<T>(fn: () => T): T {
    // R16-A-04: the flag and the pragma are restored whatever happens (an exec that throws, a handler that throws), and a nested call leaves the outer one in charge.
    const outer = this.readOnly;
    try {
      if (!outer) this.db.exec('PRAGMA query_only = ON');
      this.readOnly = true;
      return fn();
    } finally {
      this.readOnly = outer;
      if (!outer) this.queryOnlyOff();
    }
  }
  /** Leaves query_only mode. A failing exec is retried; if the connection still refuses it, it is unusable anyway and the next request will say so (never mask the request's own result or error). */
  private queryOnlyOff() {
    for (let i = 0; i < 3; i++) {
      try { this.db.exec('PRAGMA query_only = OFF'); return; } catch { /* retry */ }
    }
  }

  private readonly statements = new Map<string, ReturnType<DB['prepare']>>();
  private stmt(sql: string) {
    let s = this.statements.get(sql);
    if (!s) { s = this.db.prepare(sql); this.statements.set(sql, s); }
    return s;
  }
  private one<T>(sql: string, ...p: P): T | undefined { return this.stmt(sql).get(...p) as T | undefined; }
  private all<T>(sql: string, ...p: P): T[] { return this.stmt(sql).all(...p) as T[]; }
  private run(sql: string, ...p: P) { return this.stmt(sql).run(...p); }

  // ------------------------------------------------------------ user state
  private completedIds(uid: number): Set<string> {
    return new Set(this.all<{ mission_id: string }>('SELECT mission_id FROM mission_best WHERE user_id = ?', uid).map((r) => r.mission_id));
  }

  /** "Labs completed": the standard labs (hematology, microbiology, biochemistry) whose exit code was entered, out of STANDARD_LAB_SLUGS.length.
   *  The Master Lab is the capstone with its own badge and is not counted, so every view (dashboard, profile, leaderboard, roster, analytics) agrees. */
  private labsCompleted(exits: Set<string>): number {
    return STANDARD_LAB_SLUGS.filter((s) => exits.has(s)).length;
  }

  private exits(uid: number): Set<string> {
    return new Set(this.all<{ lab_slug: string }>('SELECT lab_slug FROM lab_exits WHERE user_id = ?', uid).map((r) => r.lab_slug));
  }
  /** Earned XP: the sum of the best score per mission. */
  earnedXp(uid: number): number {
    return this.one<{ s: number | null }>('SELECT SUM(best_score) AS s FROM mission_best WHERE user_id = ?', uid)?.s ?? 0;
  }
  /** Total XP = earned XP + XP carried over from earlier content (imports and the demo account only; 0 for everyone else). */
  totalXp(uid: number): number {
    return this.earnedXp(uid) + (this.one<{ c: number }>('SELECT xp_carry AS c FROM users WHERE id = ?', uid)?.c ?? 0);
  }

  // ------------------------------------------------------------------ labs
  private labState(uid: number, lab: Lab, exits: Set<string>): { state: 'completed' | 'available' | 'locked' | 'coming_soon'; lockedReason?: string } {
    if (!lab.playable) return { state: 'coming_soon' };
    if (exits.has(lab.slug)) return { state: 'completed' };
    if (lab.slug === 'master') {
      const n = STANDARD_LAB_SLUGS.filter((s) => exits.has(s)).length;
      if (n < STANDARD_LAB_SLUGS.length) return { state: 'locked', lockedReason: `Clear ${STANDARD_LAB_SLUGS.length} labs (${n} of ${STANDARD_LAB_SLUGS.length} cleared)` };
    }
    return { state: 'available' };
  }

  private missionStates(uid: number, slug: string, done: Set<string>, active: Set<string>) {
    const ms = missionsOf(slug);
    let currentAssigned = false;
    return ms.map((m) => {
      const completed = done.has(m.id);
      const prevDone = m.ordinal === 1 || done.has(ms[m.ordinal - 2]!.id);
      let state: 'completed' | 'current' | 'available' | 'locked';
      if (completed) state = 'completed';
      else if (!prevDone) state = 'locked';
      else if (!currentAssigned) { state = 'current'; currentAssigned = true; }
      else state = 'available';
      return { mission: m, state, unlocksWith: state === 'locked' ? `Complete mission ${String(m.ordinal - 1).padStart(2, '0')} to unlock` : undefined };
    });
  }

  listLabs(uid: number) {
    const exits = this.exits(uid);
    const done = this.completedIds(uid);
    const cont = this.continueTarget(uid, done, exits);
    return LABS.map((lab) => {
      const st = this.labState(uid, lab, exits);
      const ms = missionsOf(lab.slug);
      const completedCount = ms.filter((m) => done.has(m.id)).length;
      const frags = this.fragmentDigits(uid, lab.slug).filter((d) => d !== null).length;
      return {
        slug: lab.slug, name: lab.name, discipline: lab.discipline, ordinal: lab.ordinal, blurb: lab.blurb,
        state: st.state === 'available' && cont?.labSlug === lab.slug ? 'current' as const : st.state,
        lockedReason: st.lockedReason,
        missions: { completed: completedCount, total: ms.length },
        fragments: { found: frags, total: lab.codeLength },
        exited: exits.has(lab.slug),
      };
    });
  }

  labLobby(uid: number, slug: string) {
    const lab = LAB_BY_SLUG.get(slug);
    if (!lab) throw notFound('Unknown lab.');
    const exits = this.exits(uid);
    const st = this.labState(uid, lab, exits);
    if (!lab.playable) return { lab: this.labSummary(lab), state: st.state, missions: [], vault: null };
    const done = this.completedIds(uid);
    const active = this.activeMissionIds(uid);
    const bests = new Map(this.all<{ mission_id: string; best_score: number }>('SELECT mission_id, best_score FROM mission_best WHERE user_id = ?', uid).map((r) => [r.mission_id, r.best_score]));
    const missions = this.missionStates(uid, slug, done, active).map(({ mission: m, state, unlocksWith }) => ({
      id: m.id, ordinal: m.ordinal, title: m.title, engine: m.engine, difficulty: m.difficulty, estMinutes: m.estMinutes,
      state: st.state === 'locked' ? 'locked' as const : state,
      unlocksWith: st.state === 'locked' ? st.lockedReason : unlocksWith,
      bestScore: bests.get(m.id) ?? null,
      maxScore: maxScore(m.scoring, m.steps.length),
      inProgress: active.has(m.id),
    }));
    return { lab: this.labSummary(lab), state: st.state, lockedReason: st.lockedReason, missions, vault: this.vaultFor(uid, lab, exits) };
  }

  private labSummary(lab: Lab) { return { slug: lab.slug, name: lab.name, discipline: lab.discipline, blurb: lab.blurb }; }

  // ----------------------------------------------------------------- vault
  private fragmentDigits(uid: number, slug: string): (number | null)[] {
    const len = LAB_BY_SLUG.get(slug)?.codeLength ?? 0;
    const out: (number | null)[] = Array.from({ length: len }, () => null);
    for (const r of this.all<{ position: number; digit: number }>('SELECT position, digit FROM fragments WHERE user_id = ? AND lab_slug = ?', uid, slug)) out[r.position - 1] = r.digit;
    return out;
  }

  private vaultFor(uid: number, lab: Lab, exits: Set<string>) {
    const slots = this.fragmentDigits(uid, lab.slug);
    return { labSlug: lab.slug, codeLength: lab.codeLength, slots, complete: slots.every((d) => d !== null), exited: exits.has(lab.slug) };
  }

  vault(uid: number) {
    const exits = this.exits(uid);
    return LABS.filter((l) => l.playable).map((l) => this.vaultFor(uid, l, exits));
  }

  unlockLab(uid: number, slug: string, code: string) {
    const lab = LAB_BY_SLUG.get(slug);
    if (!lab || !lab.playable) throw notFound('Unknown lab.');
    const exits = this.exits(uid);
    const st = this.labState(uid, lab, exits);
    if (st.state === 'locked') throw forbidden(st.lockedReason ?? 'Lab is locked.', 'lab_locked');
    if (exits.has(slug)) return { unlocked: true, alreadyUnlocked: true, lab: this.labSummary(lab), newBadges: [] as Badge[] };

    const slots = this.fragmentDigits(uid, slug);
    const found = slots.filter((d) => d !== null).length;
    if (found < lab.codeLength) throw conflict('vault_incomplete', 'Find every code fragment before entering the code.', { found, needed: lab.codeLength });
    const ok = code === exitCode(slug);
    // The wrong-code count and the exit state are read under the write lock, so a concurrent request cannot slip past the limit or unlock twice.
    const outcome = tx(this.db, () => {
      if (this.exits(uid).has(slug)) return { kind: 'already' as const };
      const since = this.now() - CODE_WINDOW_MS;
      const wrongs = this.all<{ created_at: number }>('SELECT created_at FROM code_tries WHERE user_id = ? AND lab_slug = ? AND ok = 0 AND created_at > ? ORDER BY created_at', uid, slug, since);
      if (wrongs.length >= CODE_MAX_WRONG) return { kind: 'limited' as const, retry: Math.max(1, Math.ceil((wrongs[0]!.created_at + CODE_WINDOW_MS - this.now()) / 1000)) };
      this.run('INSERT INTO code_tries (user_id, lab_slug, ok, created_at) VALUES (?,?,?,?)', uid, slug, ok ? 1 : 0, this.now());
      if (!ok) return { kind: 'wrong' as const, attemptsLeft: Math.max(0, CODE_MAX_WRONG - wrongs.length - 1) };
      this.run('INSERT OR IGNORE INTO lab_exits (user_id, lab_slug, exited_at) VALUES (?,?,?)', uid, slug, this.now());
      return { kind: 'ok' as const, badges: this.grantBadges(uid) };
    });
    if (outcome.kind === 'already') return { unlocked: true, alreadyUnlocked: true, lab: this.labSummary(lab), newBadges: [] as Badge[] };
    if (outcome.kind === 'limited') throw new ApiError(429, 'rate_limited', 'Too many incorrect codes. Wait before trying again.', { retryAfterSeconds: outcome.retry }, { 'Retry-After': String(outcome.retry) });
    if (outcome.kind === 'wrong') throw new ApiError(422, 'incorrect_code', 'Incorrect code. Check your vault and try again.', { attemptsLeft: outcome.attemptsLeft });
    return { unlocked: true, alreadyUnlocked: false, lab: this.labSummary(lab), newBadges: outcome.badges };
  }

  // ---------------------------------------------------------------- badges
  private grantBadges(uid: number): Badge[] {
    const have = new Set(this.all<{ badge_id: string }>('SELECT badge_id FROM badges_earned WHERE user_id = ?', uid).map((r) => r.badge_id));
    const exits = this.exits(uid);
    const done = (cond: string) => !!this.one(`SELECT 1 FROM attempts WHERE user_id = ? AND status = 'completed' AND ${cond} LIMIT 1`, uid);
    const want: string[] = [];
    for (const [slug, id] of Object.entries(LAB_BADGE)) if (exits.has(slug)) want.push(id);
    if (exits.size > 0) want.push('first-escape');
    if (done('wrong_total = 0')) want.push('perfect-mission');
    if (done('hints_total = 0')) want.push('no-hint');
    const granted: Badge[] = [];
    for (const id of want) {
      if (have.has(id)) continue;
      this.run('INSERT INTO badges_earned (user_id, badge_id, earned_at) VALUES (?,?,?)', uid, id, this.now());
      granted.push(BADGE_BY_ID.get(id)! as Badge);
    }
    return granted;
  }

  badges(uid: number) {
    if (!this.readOnly) tx(this.db, () => this.grantBadges(uid)); // idempotent: catches up badges added after the account was created
    const earned = new Map(this.all<{ badge_id: string; earned_at: number }>('SELECT badge_id, earned_at FROM badges_earned WHERE user_id = ?', uid).map((r) => [r.badge_id, r.earned_at]));
    return BADGES.map((b) => ({ ...b, earned: earned.has(b.id), earnedAt: earned.get(b.id) ?? null }));
  }

  // -------------------------------------------------------------- attempts
  /** Closes this student's in-progress attempts that ran past their time limit, so the mission can be restarted. */
  private expireStale(uid: number) {
    if (this.readOnly) return; // a HEAD request never materialises the expiry (R15-A-04): the next GET does
    const t = this.now();
    for (const a of this.all<{ id: string; mission_id: string; started_at: number }>("SELECT id, mission_id, started_at FROM attempts WHERE user_id = ? AND status = 'in_progress'", uid)) {
      const limit = MISSION_BY_ID.get(a.mission_id)?.timeLimitSec;
      if (limit !== undefined && t - a.started_at > limit * 1000) this.run("UPDATE attempts SET status = 'expired' WHERE id = ? AND status = 'in_progress'", a.id);
    }
  }

  private activeMissionIds(uid: number): Set<string> {
    this.expireStale(uid);
    return new Set(this.all<{ mission_id: string }>("SELECT mission_id FROM attempts WHERE user_id = ? AND status = 'in_progress'", uid).map((r) => r.mission_id));
  }

  startMission(uid: number, missionId: string) {
    const m = MISSION_BY_ID.get(missionId);
    if (!m) throw notFound('Unknown mission.');
    const lab = LAB_BY_SLUG.get(m.labSlug)!;
    const exits = this.exits(uid);
    const ls = this.labState(uid, lab, exits);
    if (ls.state === 'locked') throw forbidden(ls.lockedReason ?? 'Lab is locked.', 'lab_locked');
    const done = this.completedIds(uid);
    if (m.ordinal > 1 && !done.has(missionsOf(m.labSlug)[m.ordinal - 2]!.id)) {
      throw forbidden(`Complete mission ${String(m.ordinal - 1).padStart(2, '0')} to unlock.`, 'mission_locked');
    }
    this.expireStale(uid);
    const existing = this.one<AttemptRow>("SELECT * FROM attempts WHERE user_id = ? AND mission_id = ? AND status = 'in_progress'", uid, missionId);
    if (existing) return { resumed: true, attempt: this.attemptView(existing) };
    const id = randomUUID();
    // Re-check under the write lock: another request (or process) may have started this mission since the read above.
    const raced = tx(this.db, () => {
      const again = this.one<AttemptRow>("SELECT * FROM attempts WHERE user_id = ? AND mission_id = ? AND status = 'in_progress'", uid, missionId);
      if (again) return again;
      this.run('INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at) VALUES (?,?,?,?,?,?)', id, uid, missionId, 'in_progress', 0, this.now());
      for (const s of m.steps) this.run('INSERT INTO step_results (attempt_id, step_id, competency) VALUES (?,?,?)', id, s.id, s.competency);
      return undefined;
    });
    if (raced) return { resumed: true, attempt: this.attemptView(raced) };
    return { resumed: false, attempt: this.attemptView(this.attemptRow(id, uid)) };
  }

  private attemptRow(id: string, uid: number): AttemptRow {
    const r = this.one<AttemptRow>('SELECT * FROM attempts WHERE id = ?', id);
    if (!r || r.user_id !== uid) throw notFound('Unknown attempt.');
    return r;
  }

  getAttempt(uid: number, id: string) { this.expireStale(uid); return this.attemptView(this.attemptRow(id, uid)); }

  /** The penalty the ledger would show if the attempt ended now: computeScore is the single source of truth for the cap
   *  (penalties are applied only up to the points still earned), so the status card and the result ledger can never disagree. */
  private penaltySoFar(a: AttemptRow, m: Mission, elapsedSec: number): number {
    const srs = this.all<{ wrong: number; hints: number }>('SELECT wrong, hints FROM step_results WHERE attempt_id = ?', a.id);
    const score = computeScore({
      profile: m.scoring, stepCount: m.steps.length, firstTrySteps: srs.filter((r) => r.wrong === 0).length,
      wrong: srs.reduce((s, r) => s + r.wrong, 0), hints: srs.reduce((s, r) => s + r.hints, 0), elapsedSec, timeLimitSec: m.timeLimitSec,
    });
    return score.rows.filter((r) => r.kind === 'penalty').reduce((s, r) => s + r.points, 0);
  }

  attemptView(a: AttemptRow) {
    const m = MISSION_BY_ID.get(a.mission_id)!;
    const end = a.completed_at ?? this.now();
    const limitMs = m.timeLimitSec * 1000;
    const expired = a.status === 'expired' || (a.status === 'in_progress' && end - a.started_at > limitMs);
    // Clamp so a stepped-back or long-idle clock never leaks a negative or oversized timer.
    const elapsedMs = Math.min(Math.max(0, end - a.started_at), a.status === 'completed' ? Infinity : limitMs);
    const view = {
      attemptId: a.id, status: a.status,
      expired,
      remainingSec: a.status === 'completed' ? null : expired ? 0 : Math.min(m.timeLimitSec, Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000))),
      mission: { id: m.id, title: m.title, labSlug: m.labSlug, engine: m.engine, difficulty: m.difficulty, steps: m.steps.length },
      startedAt: a.started_at,
      elapsedSec: Math.round(elapsedMs / 1000),
      timeLimitSec: m.timeLimitSec,
      stepsSolved: a.status === 'completed' ? m.steps.length : a.current_step,
      wrongTotal: a.wrong_total, hintsUsed: a.hints_total,
      penaltyXp: this.penaltySoFar(a, m, Math.round(elapsedMs / 1000)),
    };
    if (a.status === 'completed') return { ...view, step: null, revealed: [] as ReturnType<typeof revealedValues> };
    const step = m.steps[a.current_step]!;
    const sr = this.one<{ wrong: number; hints: number }>('SELECT wrong, hints FROM step_results WHERE attempt_id = ? AND step_id = ?', a.id, step.id);
    return {
      ...view,
      step: {
        ...publicStep(step, a.current_step, m.steps.length), wrongOnStep: sr?.wrong ?? 0, hintsOnStep: sr?.hints ?? 0,
        // Only what was already delivered on THIS step, and nothing once the attempt is no longer playable.
        hintsGiven: a.status === 'in_progress' && !expired ? this.hintsGiven(a.id, step) : [] as HintGiven[],
      },
      revealed: revealedValues(m, a.current_step),
    };
  }

  /** Hints already delivered (and paid for) on `step`, by level. Text comes from the log; rows written before it was stored fall back to the faculty hint when they were standard, and are left out when they were AI-written. */
  private hintsGiven(attemptId: string, step: Step): HintGiven[] {
    const rows = this.all<{ level: number; source: string; text: string | null }>('SELECT level, source, text FROM hint_log WHERE attempt_id = ? AND step_id = ? ORDER BY level, id', attemptId, step.id);
    const out: HintGiven[] = [];
    for (const r of rows) {
      if (out.some((o) => o.level === r.level)) continue;
      const source = r.source === 'assistant' ? 'assistant' as const : 'standard' as const;
      const text = r.text ?? (source === 'standard' ? step.hints[r.level - 1] : undefined);
      if (text) out.push({ level: r.level, text, source });
    }
    return out;
  }

  answer(uid: number, attemptId: string, stepId: string, response: unknown) {
    const a = this.attemptRow(attemptId, uid);
    if (a.status === 'expired') throw conflict('time_expired', 'This attempt has exceeded its time limit.');
    if (a.status !== 'in_progress') throw conflict('attempt_finished', 'This attempt is already complete.');
    if (this.hintInFlight.has(attemptId)) throw conflict('hint_in_progress', 'Wait for the current hint request to finish.');
    const m = MISSION_BY_ID.get(a.mission_id)!;
    if (this.now() - a.started_at > m.timeLimitSec * 1000) throw conflict('time_expired', 'This attempt has exceeded its time limit.');
    const step = m.steps[a.current_step]!;
    if (step.id !== stepId) throw conflict('wrong_step', 'This is not the current step.', { currentStepId: step.id });
    const verdict = checkResponse(step, response);

    const staleStep = a.current_step;
    return tx(this.db, () => {
      // The checks above ran before the write lock: re-read the attempt now that it is held, so a second process (or a request that
      // slipped in between) cannot apply the same step twice or skip one.
      const a = this.attemptRow(attemptId, uid);
      if (a.status === 'expired') throw conflict('time_expired', 'This attempt has exceeded its time limit.');
      if (a.status !== 'in_progress') throw conflict('attempt_finished', 'This attempt is already complete.');
      if (a.current_step !== staleStep) throw conflict('wrong_step', 'This is not the current step.', { currentStepId: m.steps[a.current_step]?.id ?? null });
      const t = this.now();
      if (t - a.started_at > m.timeLimitSec * 1000) throw conflict('time_expired', 'This attempt has exceeded its time limit.');
      // The log is for review, not accounting (counters live on the attempt): cap it so retries cannot grow it without bound.
      if ((this.one<{ n: number }>('SELECT COUNT(*) AS n FROM answer_log WHERE attempt_id = ?', a.id)?.n ?? 0) < 400) {
        this.run('INSERT INTO answer_log (attempt_id, step_id, correct, response_json, created_at) VALUES (?,?,?,?,?)', a.id, step.id, verdict.correct ? 1 : 0, safeJson(response), t);
      }
      if (!verdict.correct) {
        this.run('UPDATE step_results SET wrong = wrong + 1 WHERE attempt_id = ? AND step_id = ?', a.id, step.id);
        this.run('UPDATE attempts SET wrong_total = wrong_total + 1 WHERE id = ?', a.id);
        const fresh = this.attemptRow(a.id, uid);
        return {
          correct: false,
          feedback: { verdict: 'Incorrect' as const, message: `Not quite. ${step.recheck}` },
          progress: verdict.progress ?? null,
          penaltyXp: -WRONG_PENALTY,
          attempt: this.attemptView(fresh),
        };
      }

      this.run('UPDATE step_results SET solved_at = ? WHERE attempt_id = ? AND step_id = ?', t, a.id, step.id);
      let fragment: { labSlug: string; position: number; digit: number } | null = null;
      if (step.fragment !== undefined) {
        const position = m.steps.indexOf(step) + 1;
        const r = this.run('INSERT OR IGNORE INTO fragments (user_id, lab_slug, position, digit, found_at) VALUES (?,?,?,?,?)', uid, m.labSlug, position, step.fragment, t);
        if (Number(r.changes) > 0) fragment = { labSlug: m.labSlug, position, digit: step.fragment };
      }
      const feedback = { verdict: 'Correct' as const, message: `Correct. ${step.explanation}` };
      const last = a.current_step === m.steps.length - 1;
      if (!last) {
        this.run('UPDATE attempts SET current_step = current_step + 1 WHERE id = ?', a.id);
        return { correct: true, feedback, fragment, completed: false as const, attempt: this.attemptView(this.attemptRow(a.id, uid)) };
      }
      const result = this.complete(uid, a, m, t, fragment);
      return { correct: true, feedback, fragment: result.fragment, completed: true as const, result: result.payload, attempt: this.attemptView(this.attemptRow(a.id, uid)) };
    });
  }

  /** Called inside the answer transaction when the last step is solved. */
  private complete(uid: number, a: AttemptRow, m: Mission, t: number, stepFragment: { labSlug: string; position: number; digit: number } | null) {
    const srs = this.all<{ step_id: string; wrong: number; hints: number }>('SELECT step_id, wrong, hints FROM step_results WHERE attempt_id = ?', a.id);
    const wrong = srs.reduce((s, r) => s + r.wrong, 0);
    const hints = srs.reduce((s, r) => s + r.hints, 0);
    const firstTry = srs.filter((r) => r.wrong === 0).length;
    const elapsedSec = Math.max(0, Math.round((t - a.started_at) / 1000)); // a clock stepped backwards must not produce a negative duration
    const score = computeScore({ profile: m.scoring, stepCount: m.steps.length, firstTrySteps: firstTry, wrong, hints, elapsedSec, timeLimitSec: m.timeLimitSec });

    const prev = this.one<{ best_score: number }>('SELECT best_score FROM mission_best WHERE user_id = ? AND mission_id = ?', uid, m.id);
    const xpBefore = this.earnedXp(uid);
    if (!prev) {
      this.run('INSERT INTO mission_best (user_id, mission_id, best_score, best_attempt_id, completions, first_completed_at) VALUES (?,?,?,?,1,?)', uid, m.id, score.total, a.id, t);
      this.run('INSERT INTO xp_events (user_id, mission_id, delta, at) VALUES (?,?,?,?)', uid, m.id, score.total, t);
    } else {
      this.run('UPDATE mission_best SET completions = completions + 1 WHERE user_id = ? AND mission_id = ?', uid, m.id);
      if (score.total > prev.best_score) {
        this.run('UPDATE mission_best SET best_score = ?, best_attempt_id = ? WHERE user_id = ? AND mission_id = ?', score.total, a.id, uid, m.id);
        this.run('INSERT INTO xp_events (user_id, mission_id, delta, at) VALUES (?,?,?,?)', uid, m.id, score.total - prev.best_score, t);
      }
    }
    const totalXp = this.totalXp(uid);
    const earnedNow = this.earnedXp(uid);

    let fragment = stepFragment;
    if (!prev && m.fragment !== undefined) {
      const r = this.run('INSERT OR IGNORE INTO fragments (user_id, lab_slug, position, digit, found_at) VALUES (?,?,?,?,?)', uid, m.labSlug, m.ordinal, m.fragment, t);
      if (Number(r.changes) > 0) fragment = { labSlug: m.labSlug, position: m.ordinal, digit: m.fragment };
    }
    this.run("UPDATE attempts SET status = 'completed', completed_at = ?, score = ?, current_step = ? WHERE id = ?", t, score.total, m.steps.length, a.id);
    const newBadges = this.grantBadges(uid);

    const payload = {
      attemptId: a.id,
      mission: { id: m.id, title: m.title, labSlug: m.labSlug },
      score: score.total, maxScore: score.max,
      xpAwarded: earnedNow - xpBefore, totalXp, newBest: !prev || score.total > prev.best_score,
      ledger: score.rows as LedgerRow[],
      stats: {
        accuracyPct: Math.round((100 * m.steps.length) / (m.steps.length + wrong)),
        elapsedSec, elapsed: mmss(elapsedSec), hintsUsed: hints, wrongAnswers: wrong, firstTrySteps: firstTry, steps: m.steps.length,
      },
      newBadges,
    };
    this.run('UPDATE attempts SET result_json = ? WHERE id = ?', JSON.stringify(payload), a.id);
    return { payload, fragment };
  }

  async hint(uid: number, attemptId: string, stepId: string) {
    if (this.hintInFlight.has(attemptId)) throw conflict('hint_in_progress', 'A hint request is already being prepared.');
    this.hintInFlight.add(attemptId);
    try { return await this.hintLocked(uid, attemptId, stepId); } finally { this.hintInFlight.delete(attemptId); }
  }

  private async hintLocked(uid: number, attemptId: string, stepId: string) {
    const a = this.attemptRow(attemptId, uid);
    if (a.status === 'expired') throw conflict('time_expired', 'This attempt has exceeded its time limit.');
    if (a.status !== 'in_progress') throw conflict('attempt_finished', 'This attempt is already complete.');
    const m = MISSION_BY_ID.get(a.mission_id)!;
    if (this.now() - a.started_at > m.timeLimitSec * 1000) throw conflict('time_expired', 'This attempt has exceeded its time limit.');
    const step = m.steps[a.current_step]!;
    if (step.id !== stepId) throw conflict('wrong_step', 'This is not the current step.', { currentStepId: step.id });
    const reservation = tx(this.db, () => {
      const cur = this.attemptRow(attemptId, uid);
      if (cur.status !== 'in_progress' || cur.current_step !== a.current_step) throw conflict('wrong_step', 'The step changed while the hint was being prepared.');
      if (this.now() - cur.started_at > m.timeLimitSec * 1000) throw conflict('time_expired', 'This attempt has exceeded its time limit.');
      const sr = this.one<{ wrong: number; hints: number }>('SELECT wrong, hints FROM step_results WHERE attempt_id = ? AND step_id = ?', a.id, step.id)!;
      if (sr.hints >= step.hints.length) throw conflict('no_more_hints', 'No more hints are available for this step.');
      const level = sr.hints + 1;
      this.run('UPDATE step_results SET hints = hints + 1 WHERE attempt_id = ? AND step_id = ?', a.id, step.id);
      this.run('UPDATE attempts SET hints_total = hints_total + 1 WHERE id = ?', a.id);
      // R16-A-02: the charge and the hint the learner paid for are ONE commit. The faculty-written hint of this level is always available, so it is logged right here;
      // when the assistant answers (and passes the guard) the row is upgraded to its text. A stop between the two steps leaves the learner with the standard hint.
      this.run('INSERT INTO hint_log (attempt_id, step_id, level, source, created_at, text) VALUES (?,?,?,?,?,?)', a.id, step.id, level, 'standard', this.now(), step.hints[level - 1]!);
      return { level, wrong: sr.wrong };
    });
    const level = reservation.level;

    let text: string | null = null;
    try { text = await this.assistant.hint({ step, level, wrongSoFar: reservation.wrong }); } catch { text = null; }
    // Whatever the provider: the learner always gets a real hint. An empty, over-long (more than 400 characters) or answer-revealing
    // text is no hint, and the text is stored and returned trimmed; the faculty-written hint is the fallback.
    text = Game.cleanAssistantHint(text, step);
    const source = text ? 'assistant' as const : 'standard' as const;
    const finalText = text ?? step.hints[level - 1]!;

    const committed = tx(this.db, () => {
      const cur = this.attemptRow(attemptId, uid);
      // R17-A-01: an attempt completed by another process while the provider was answering already counts this hint (hints_total, step_results, the frozen result_json and the
      // ledger), so the charge and the hint_log row stay and the learner gets the hint they paid for. Refunding here left a frozen result that said "1 hint, -15 XP" next to
      // counters at 0 (and the No Hint badge). Only an attempt WITHOUT a frozen result (expired, or moved to another step) is refunded.
      if (cur.status !== 'completed') {
        if (cur.status !== 'in_progress' || cur.current_step !== a.current_step) {
          this.run('UPDATE step_results SET hints = hints - 1 WHERE attempt_id = ? AND step_id = ? AND hints > 0', a.id, step.id);
          this.run('UPDATE attempts SET hints_total = hints_total - 1 WHERE id = ? AND hints_total > 0', a.id);
          this.run('DELETE FROM hint_log WHERE attempt_id = ? AND step_id = ? AND level = ?', a.id, step.id, level);
          return { error: cur.status === 'expired' ? 'time_expired' as const : 'wrong_step' as const };
        }
        if (this.now() - cur.started_at > m.timeLimitSec * 1000) {
          this.run('UPDATE step_results SET hints = hints - 1 WHERE attempt_id = ? AND step_id = ? AND hints > 0', a.id, step.id);
          this.run('UPDATE attempts SET hints_total = hints_total - 1 WHERE id = ? AND hints_total > 0', a.id);
          this.run('DELETE FROM hint_log WHERE attempt_id = ? AND step_id = ? AND level = ?', a.id, step.id, level);
          return { error: 'time_expired' as const };
        }
      }
      if (source === 'assistant') this.run('UPDATE hint_log SET source = ?, text = ? WHERE attempt_id = ? AND step_id = ? AND level = ?', source, finalText, a.id, step.id, level);
      return { value: { hint: finalText, source, level, remaining: step.hints.length - level, penaltyXp: -HINT_PENALTY, attempt: this.attemptView(this.attemptRow(a.id, uid)) } };
    });
    if ('error' in committed) {
      if (committed.error === 'time_expired') throw conflict('time_expired', 'This attempt has exceeded its time limit.');
      throw conflict('wrong_step', 'The step changed while the hint was being prepared.');
    }
    return committed.value;
  }

  result(uid: number, attemptId: string) {
    // Close timed-out attempts first, so the same expired attempt always answers 409 time_expired.
    this.expireStale(uid);
    const a = this.attemptRow(attemptId, uid);
    if (a.status === 'expired') throw conflict('time_expired', 'This attempt expired before it was completed.');
    if (a.status !== 'completed' || !a.result_json) throw conflict('attempt_in_progress', 'The result is available once the mission is complete.');
    const payload = JSON.parse(a.result_json) as Record<string, unknown> & { mission: { labSlug: string } };
    const slug = payload.mission.labSlug;
    const exited = this.exits(uid).has(slug);
    const comp = this.competencies(uid);
    return {
      ...payload,
      lab: { slug, exited },
      fragments: this.fragmentDigits(uid, slug),
      // The Master Lab code is only shown once the lab has actually been escaped.
      masterCode: slug === 'master' && exited ? exitCode('master') : null,
      badge: slug === 'master' && exited ? BADGE_BY_ID.get('clinical-detective') : null,
      competencies: comp.items, strongest: comp.strongest, improvement: comp.improvement,
    };
  }

  // ---------------------------------------------------------- competencies
  competencies(uid: number) {
    // Latest solved result per step, scored 0..1.
    // One pass over the account's own rows: RANK() = 1 keeps every row tied on the latest solved_at, exactly like the MAX() it replaces.
    // (A correlated MAX() subquery here scanned every step_results row of the step per row: quadratic, and synchronous, so one account could stall the API; R36 A36-001.)
    const rows = this.all<{ step_id: string; competency: string; wrong: number; hints: number }>(
      `SELECT step_id, competency, wrong, hints FROM (
         SELECT sr.step_id, sr.competency, sr.wrong, sr.hints,
                RANK() OVER (PARTITION BY sr.step_id ORDER BY sr.solved_at DESC) AS rk
           FROM step_results sr JOIN attempts a ON a.id = sr.attempt_id
          WHERE a.user_id = ? AND sr.solved_at IS NOT NULL)
        WHERE rk = 1`, uid);
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const s = Math.max(0, 1 - 0.34 * r.wrong - 0.15 * r.hints);
      by.set(r.competency, [...(by.get(r.competency) ?? []), s]);
    }
    const items = STEP_COMPETENCIES.filter((c) => by.has(c)).map((c) => {
      const v = by.get(c)!;
      return { name: c, pct: Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length), steps: v.length };
    }).sort((a, b) => b.pct - a.pct);
    const strongest = items[0] ? items[0].name : null;
    const weakest = items.length > 1 ? items[items.length - 1]! : null;
    const improvement = weakest && weakest.pct < 100 ? { name: weakest.name, advice: `${weakest.name}: ${IMPROVE[weakest.name] ?? 'review the related missions.'}` } : null;
    return { items, strongest, improvement };
  }

  // ------------------------------------------------------------- dashboard
  private streak(uid: number): number {
    const days = new Set(this.all<{ created_at: number }>('SELECT created_at FROM answer_log al JOIN attempts a ON a.id = al.attempt_id WHERE a.user_id = ?', uid).map((r) => Math.floor(r.created_at / DAY)));
    let d = Math.floor(this.now() / DAY);
    if (!days.has(d)) d -= 1; // today may not have started yet
    let n = 0;
    while (days.has(d)) { n++; d--; }
    return n;
  }

  private continueTarget(uid: number, done: Set<string>, exits: Set<string>): { kind: 'mission' | 'unlock'; missionId: string | null; labSlug: string; title: string; resume: boolean } | null {
    this.expireStale(uid);
    const act = this.one<{ mission_id: string }>("SELECT mission_id FROM attempts WHERE user_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1", uid);
    if (act) { const m = MISSION_BY_ID.get(act.mission_id)!; return { kind: 'mission', missionId: m.id, labSlug: m.labSlug, title: m.title, resume: true }; }
    for (const lab of LABS.filter((l) => l.playable)) {
      if (this.labState(uid, lab, exits).state === 'locked') continue;
      const next = missionsOf(lab.slug).find((m) => !done.has(m.id));
      if (next) return { kind: 'mission', missionId: next.id, labSlug: lab.slug, title: next.title, resume: false };
      // Every mission is done but the exit is still sealed: the next move is the code lock.
      if (!exits.has(lab.slug)) return { kind: 'unlock', missionId: null, labSlug: lab.slug, title: `Unlock the ${lab.name}`, resume: false };
    }
    return null;
  }

  me(uid: number) {
    const u = this.one<{ id: number; name: string; email: string; role: string; created_at: number; language: string }>('SELECT id, name, email, role, created_at, language FROM users WHERE id = ?', uid);
    if (!u) throw notFound('Unknown user.');
    const xp = this.totalXp(uid);
    return { id: u.id, name: u.name, email: u.email, role: u.role, language: u.language, createdAt: u.created_at, xp, ...levelProgress(xp) };
  }

  dashboard(uid: number) {
    const me = this.me(uid);
    const done = this.completedIds(uid);
    const exits = this.exits(uid);
    const labs = this.listLabs(uid).filter((l) => l.missions.total > 0);
    const cont = this.continueTarget(uid, done, exits);
    // Same definition as the profile and every teacher view: the standard missions; the Master Lab is the capstone on top.
    const totalMissions = STANDARD_MISSION_COUNT;
    const standardDone = [...done].filter((id) => MISSION_BY_ID.get(id)?.labSlug !== 'master').length;

    let recommended: { missionId: string; labSlug: string; title: string; reason: string } | null = null;
    for (const lab of LABS.filter((l) => l.playable)) {
      if (this.labState(uid, lab, exits).state === 'locked') continue;
      const ms = this.missionStates(uid, lab.slug, done, new Set());
      const next = ms.find((x) => x.state === 'current' && x.mission.id !== cont?.missionId) ?? ms.find((x) => x.state === 'available' && x.mission.id !== cont?.missionId);
      if (next) { recommended = { missionId: next.mission.id, labSlug: lab.slug, title: next.mission.title, reason: 'Next mission in an open lab.' }; break; }
    }
    if (!recommended) {
      const low = this.one<{ mission_id: string }>('SELECT mission_id FROM mission_best WHERE user_id = ? ORDER BY best_score ASC LIMIT 1', uid);
      if (low) { const m = MISSION_BY_ID.get(low.mission_id)!; recommended = { missionId: m.id, labSlug: m.labSlug, title: m.title, reason: 'Replay your lowest score.' }; }
    }

    const badges = this.badges(uid);
    return {
      user: { name: me.name, level: me.level, xp: me.xp, levelProgress: { into: me.into, size: me.size } },
      overall: { completedMissions: standardDone, totalMissions, pct: Math.round((100 * standardDone) / totalMissions) },
      streakDays: this.streak(uid),
      labsCompleted: this.labsCompleted(exits),
      continue: cont,
      labs: labs.map((l) => ({ slug: l.slug, name: l.name, state: l.state, completed: l.missions.completed, total: l.missions.total, pct: Math.round((100 * l.missions.completed) / l.missions.total) })),
      badges: { earned: badges.filter((b) => b.earned).length, total: badges.length },
      recentAchievements: badges.filter((b) => b.earned).sort((a, b) => b.earnedAt! - a.earnedAt!).slice(0, 5),
      recommended,
    };
  }


  // ------------------------------------------------- results, profile, social
  private bestRows(uid: number): BestRow[] {
    return this.all<BestRow>(
      `SELECT mb.mission_id, mb.best_score, a.id AS attempt_id, a.wrong_total, a.hints_total, a.started_at, a.completed_at, a.result_json
         FROM mission_best mb JOIN attempts a ON a.id = mb.best_attempt_id WHERE mb.user_id = ?`, uid);
  }
  private static acc(r: BestRow): number { const n = MISSION_BY_ID.get(r.mission_id)!.steps.length; return n / (n + r.wrong_total); }
  private static sec(r: BestRow): number { return Math.round(((r.completed_at ?? r.started_at) - r.started_at) / 1000); }
  private static meanPct(rows: BestRow[]): number | null { return rows.length ? Math.round((100 * rows.reduce((a, r) => a + Game.acc(r), 0)) / rows.length) : null; }
  private standardRows(rows: BestRow[]): BestRow[] { return rows.filter((r) => MISSION_BY_ID.get(r.mission_id)!.labSlug !== 'master'); }

  /** Competency percentages from specific attempts (latest-per-step logic is for the global view; labs use the best attempts). */
  private competenciesOf(attemptIds: string[]) {
    if (!attemptIds.length) return { items: [] as { name: string; pct: number; steps: number }[], strongest: null as string | null, improvement: null as { name: string; advice: string } | null };
    const rows = this.all<{ competency: string; wrong: number; hints: number }>(
      `SELECT competency, wrong, hints FROM step_results WHERE solved_at IS NOT NULL AND attempt_id IN (${attemptIds.map(() => '?').join(',')})`, ...attemptIds);
    const by = new Map<string, number[]>();
    for (const r of rows) by.set(r.competency, [...(by.get(r.competency) ?? []), Math.max(0, 1 - 0.34 * r.wrong - 0.15 * r.hints)]);
    const items = STEP_COMPETENCIES.filter((c) => by.has(c)).map((c) => { const v = by.get(c)!; return { name: c, pct: Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length), steps: v.length }; }).sort((a, b) => b.pct - a.pct);
    const weakest = items.length > 1 ? items[items.length - 1]! : null;
    return { items, strongest: items[0]?.name ?? null, improvement: weakest && weakest.pct < 100 ? { name: weakest.name, advice: `${weakest.name}: ${IMPROVE[weakest.name] ?? 'review the related missions.'}` } : null };
  }

  /** Lab results: what the student earned in a lab they have escaped. */
  labResults(uid: number, slug: string) {
    const lab = LAB_BY_SLUG.get(slug);
    if (!lab || !lab.playable) throw notFound('No results for this lab.');
    if (!this.exits(uid).has(slug)) throw conflict('lab_not_escaped', 'Results are available once you have escaped the lab.');
    const ms = missionsOf(slug);
    const rows = this.bestRows(uid).filter((r) => MISSION_BY_ID.get(r.mission_id)!.labSlug === slug);
    const byId = new Map(rows.map((r) => [r.mission_id, r]));
    const sums: Record<string, number> = { base: 0, first_attempt: 0, time_bonus: 0, no_hint: 0, hints: 0, wrong: 0 };
    for (const r of rows) for (const l of (JSON.parse(r.result_json ?? '{"ledger":[]}') as { ledger: LedgerRow[] }).ledger) sums[l.id] = (sums[l.id] ?? 0) + l.points;
    const n = rows.length;
    // Missions whose best attempt actually earned first-try points (the Master Lab awards them per step, so "solved entirely
    // first time" would contradict the points shown next to it).
    const firstTry = rows.filter((r) => (JSON.parse(r.result_json ?? '{"ledger":[]}') as { ledger: LedgerRow[] }).ledger.some((l) => l.id === 'first_attempt' && l.points > 0)).length;
    const noHint = rows.filter((r) => r.hints_total === 0).length;
    const totalSec = rows.reduce((a, r) => a + Game.sec(r), 0);
    const hints = rows.reduce((a, r) => a + r.hints_total, 0);
    const wrong = rows.reduce((a, r) => a + r.wrong_total, 0);
    const ledger: LedgerRow[] = [
      { id: 'base', label: 'Base mission', reason: `${plural(n, 'mission')} completed`, points: sums.base!, kind: 'earned' },
      { id: 'first_attempt', label: 'First attempt', reason: `First-try points on ${firstTry} of ${n} ${n === 1 ? 'mission' : 'missions'} (best attempts)`, points: sums.first_attempt!, kind: sums.first_attempt! > 0 ? 'earned' : 'unearned' },
      { id: 'time_bonus', label: 'Time bonus', reason: `Total time ${mmss(totalSec)}`, points: sums.time_bonus!, kind: sums.time_bonus! > 0 ? 'earned' : 'unearned' },
      { id: 'no_hint', label: 'No hint used', reason: `${noHint} of ${n} ${n === 1 ? 'mission' : 'missions'} without a hint`, points: sums.no_hint!, kind: sums.no_hint! > 0 ? 'earned' : 'unearned' },
      ...(hints ? [{ id: 'hints' as const, label: 'Hint used', reason: `${hints} x -${HINT_PENALTY} XP${sums.hints! > -HINT_PENALTY * hints ? ' (capped: a mission never scores below 0)' : ''}`, points: sums.hints!, kind: 'penalty' as const }] : []),
      ...(wrong ? [{ id: 'wrong' as const, label: 'Wrong attempt', reason: `${wrong} x -${WRONG_PENALTY} XP${sums.wrong! > -WRONG_PENALTY * wrong ? ' (capped: a mission never scores below 0)' : ''}`, points: sums.wrong!, kind: 'penalty' as const }] : []),
    ];
    const comp = this.competenciesOf(rows.map((r) => r.attempt_id));
    return {
      lab: this.labSummary(lab),
      escaped: true,
      codeDigits: this.fragmentDigits(uid, slug),
      xp: rows.reduce((a, r) => a + r.best_score, 0),
      stats: { accuracyPct: Game.meanPct(rows), elapsedSec: totalSec, elapsed: mmss(totalSec), hintsUsed: hints, wrongAnswers: wrong, missions: n },
      missions: ms.map((m) => { const r = byId.get(m.id); return { id: m.id, ordinal: m.ordinal, title: m.title, score: r?.best_score ?? null, maxScore: maxScore(m.scoring, m.steps.length), accuracyPct: r ? Math.round(100 * Game.acc(r)) : null, elapsed: r ? mmss(Game.sec(r)) : null, hintsUsed: r?.hints_total ?? 0 }; }),
      ledger,
      competencies: comp.items, strongest: comp.strongest, improvement: comp.improvement,
      badge: BADGE_BY_ID.get(LAB_BADGE[slug]!) ?? null,
    };
  }

  profile(uid: number) {
    const u = this.one<{ id: number; name: string; email: string; role: string; created_at: number; language: string; sound: number; reduce_motion: number; notifications: number; program: string | null; study_level: string | null; xp_carry: number; is_demo: number; is_demo_account: number }>('SELECT * FROM users WHERE id = ?', uid);
    if (!u) throw notFound('Unknown user.');
    const xp = this.totalXp(uid);
    const rows = this.standardRows(this.bestRows(uid));
    const exits = this.exits(uid);
    const done = this.completedIds(uid);
    const active = this.activeMissionIds(uid);
    const avgSec = rows.length ? Math.round(rows.reduce((a, r) => a + Game.sec(r), 0) / rows.length) : null;
    const badges = this.badges(uid);
    const std = LABS.filter((l) => l.playable && l.slug !== 'master');
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role, program: u.program, studyLevel: u.study_level, createdAt: u.created_at, demo: u.is_demo === 1 || u.is_demo_account === 1 },
      xp: { total: xp, earned: this.earnedXp(uid), carriedOver: u.xp_carry, ...levelProgress(xp) },
      stats: {
        accuracyPct: Game.meanPct(rows), avgMissionSec: avgSec, avgMissionTime: avgSec === null ? null : mmss(avgSec),
        labsCompleted: this.labsCompleted(exits), labsTotal: STANDARD_LAB_SLUGS.length,
        badgesEarned: badges.filter((b) => b.earned).length, badgesTotal: badges.length,
      },
      settings: { language: u.language as 'en' | 'fr', sound: u.sound === 1, reduceMotion: u.reduce_motion === 1, notifications: u.notifications === 1 },
      labs: std.map((l) => {
        const ms = missionsOf(l.slug);
        const completed = ms.filter((m) => done.has(m.id)).length;
        const started = completed > 0 || ms.some((m) => active.has(m.id));
        return { slug: l.slug, name: l.name, state: exits.has(l.slug) ? 'escaped' as const : started ? 'in_progress' as const : 'not_started' as const, completed, total: ms.length };
      }),
      recentAchievements: badges.filter((b) => b.earned).sort((a, b) => b.earnedAt! - a.earnedAt!).slice(0, 4),
    };
  }

  /** The assistant's text ready to store, or null when it must not be used (blank, longer than 400 characters, or giving the answer away). */
  static cleanAssistantHint(raw: unknown, step: Step): string | null {
    if (typeof raw !== 'string') return null;
    // What the learner receives is exactly what is stored (SQLite text stops at a NUL and turns a lone surrogate into U+FFFD, which would make a
    // paid hint vanish or change on reload): control characters other than newline and tab, and lone surrogates, are removed first.
    // The length limit counts characters (code points), not UTF-16 units.
    const text = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, '').replace(/\p{Cs}/gu, '').trim();
    return !text || exceedsHintLimit(text) || !hasSubstance(text) || leaksAnswer(text, step) ? null : text;
  }

  /**
   * Rejects a display name that has nothing a person can see (only private-use, unassigned, invisible or stray combining characters)
   * or that reads like the "(teacher #n)" suffix of a review record (any role: the name is shown to others).
   * Both answers are a 400 validation_error with the same `details` array as every other validation failure.
   */
  static checkDisplayName(name: string) {
    if (isBlankName(name)) throw bad('The name must contain at least one visible character.', ['body.name must contain at least one visible character']);
    // Bidi overrides, embeddings and isolates reorder what is drawn: a reversed string between them reads as another name. They have no use in a person's name.
    if (hasBidiControl(name)) throw bad('The name cannot contain bidirectional override, embedding or isolate control characters.', ['body.name must not contain bidirectional control characters']);
    if (imitatesReviewerSuffix(name)) throw bad('The name cannot contain a "(teacher #number)" pattern: it is reserved for review records.', ['body.name must not contain a "(teacher #number)" pattern']);
  }

  /** Throws name_taken when another teacher account (or the reserved demo teacher name) already reads like `name`. Call inside the write transaction that stores the name. */
  private assertTeacherNameFree(name: string, uid: number | null) {
    const others = this.all<{ name: string }>("SELECT name FROM users WHERE role = 'teacher' AND id <> ?", uid ?? -1);
    const reserved = sameName(name, DEMO_TEACHER_NAME) && !!this.one("SELECT 1 FROM users WHERE role = 'teacher' AND is_demo_account = 1 AND id <> ?", uid ?? -1);
    if (reserved || others.some((r) => sameName(r.name, name))) throw conflict('name_taken', 'Another teacher account already uses this name, or one that reads the same (upper/lower case, accents, spaces, punctuation and look-alike letters are ignored). Choose another name.');
  }

  /**
   * Creates an account. A teacher name is checked and written in one write transaction (BEGIN IMMEDIATE), so two processes
   * on one database file can never both take the same name. Throws on a duplicate e-mail like a plain INSERT would.
   */
  createAccount(email: string, name: string, passwordHash: string, role: 'student' | 'teacher', at: number): number {
    const clean = name.toWellFormed().trim();
    Game.checkDisplayName(clean);
    return tx(this.db, () => {
      if (role === 'teacher') this.assertTeacherNameFree(clean, null);
      return Number(this.run('INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?,?,?,?,?)', email, clean, passwordHash, role, at).lastInsertRowid);
    });
  }

  updateProfile(uid: number, patch: { name?: string; language?: 'en' | 'fr'; sound?: boolean; reduceMotion?: boolean; notifications?: boolean; program?: string; studyLevel?: string }) {
    const cols: string[] = []; const vals: P = [];
    const set = (c: string, v: unknown) => { cols.push(`${c} = ?`); vals.push(v); };
    if (patch.name !== undefined) { Game.checkDisplayName(patch.name); set('name', patch.name.toWellFormed().trim()); }
    if (patch.language !== undefined) set('language', patch.language);
    if (patch.sound !== undefined) set('sound', patch.sound ? 1 : 0);
    if (patch.reduceMotion !== undefined) set('reduce_motion', patch.reduceMotion ? 1 : 0);
    if (patch.notifications !== undefined) set('notifications', patch.notifications ? 1 : 0);
    if (patch.program !== undefined) set('program', patch.program.trim());
    if (patch.studyLevel !== undefined) set('study_level', patch.studyLevel.trim());
    if (cols.length) {
      // Reviews are attributed to a teacher by name (plus account id): a teacher cannot take a colleague's name.
      // The check and the UPDATE share one write transaction, so a second process cannot slip the same name in between.
      tx(this.db, () => {
        if (patch.name !== undefined) {
          const me = this.one<{ role: string; name: string }>('SELECT role, name FROM users WHERE id = ?', uid);
          // One canonical key per name: the rename is refused iff ANOTHER teacher's key equals the new key. A teacher whose current name already has
          // that key (a spelling variant of their own name, e.g. a legacy twin of a colleague written before the check existed) is not creating a
          // new clash, so staying inside their own name class is always allowed.
          if (me?.role === 'teacher' && nameKey(patch.name) !== nameKey(me.name)) this.assertTeacherNameFree(patch.name, uid);
        }
        this.run(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, ...vals, uid);
      });
    }
    return this.profile(uid);
  }

  /**
   * "Inès Moreau" -> "Inès M." Other students see an abbreviated name.
   * The initial is the first grapheme cluster (one user-perceived character: a family emoji, a flag, a letter with its marks) of the first VISIBLE initial-capable
   * character of the last word: a letter, a number or an emoji. Invisible characters (zero-width, joiners, direction marks, the Hangul fillers U+3164 / U+115F /
   * U+1160 / U+FFA0), leading combining marks, punctuation, symbols such as the trademark sign and modifier letters are skipped. When the last word has none the
   * name is shown without an initial. A capital that would be two letters (ß -> SS, the digraph dž -> DŽ, ŉ -> ʼN) gives its first letter.
   * A name WITHOUT a space (one word: "JeanDupont", "王小明", "สมชายใจดี") has no last word and is shown in full: there is nothing to abbreviate with a
   * space-based rule (documented in docs/KNOWN_LIMITATIONS.md). Leading words with nothing visible are ignored.
   */
  static shortName(full: string): string {
    const parts = full.trim().split(/\s+/);
    while (parts.length > 1 && !hasVisibleCharacter(parts[0]!)) parts.shift();
    if (parts.length < 2) return parts[0]!;
    const initial = Game.initialOf(parts[parts.length - 1]!);
    return initial ? `${parts[0]} ${initial}.` : parts[0]!;
  }

  /** Characters that can be an initial: letters (not modifier letters), numbers and emoji; never an invisible filler. A text-style pictograph such as the trademark sign needs the emoji selector U+FE0F. */
  private static isInitialStart(word: string, at: number): boolean {
    const c = String.fromCodePoint(word.codePointAt(at)!);
    if (INITIAL_FILLERS.test(c) || /\p{Lm}/u.test(c)) return false;
    if (/[\p{L}\p{N}\p{Emoji_Presentation}\p{Regional_Indicator}]/u.test(c)) return true;
    return /\p{Extended_Pictographic}/u.test(c) && word[at + c.length] === '\uFE0F';
  }

  /** First grapheme of the first initial-capable character of `word`, upper-cased to a single grapheme; '' when there is none. */
  private static initialOf(word: string): string {
    const first = (s: string) => GRAPHEMES.segment(s)[Symbol.iterator]().next().value?.segment ?? '';
    const find = (w: string): number => { for (let i = 0; i < w.length; i += String.fromCodePoint(w.codePointAt(i)!).length) if (Game.isInitialStart(w, i)) return i; return -1; };
    const start = find(word);
    if (start < 0) return '';
    let up = first(word.slice(start)).toUpperCase();
    // ŉ upper-cases to "ʼN": the modifier letter is no initial, the N is.
    const inner = find(up);
    if (inner < 0) return '';
    up = first(up.slice(inner));
    // ß -> SS: two graphemes, keep the first. One character that stands for two letters (the digraph Ǆ is "DŽ") is shortened to its first letter.
    const folded = up.normalize('NFKC');
    return [...up].length === 1 && [...folded].length > 1 && /^\p{L}/u.test(folded) ? first(folded) : up;
  }

  leaderboard(uid: number, scope: 'week' | 'all', cohort: 'class' | 'all') {
    const ids = cohort === 'class'
      ? this.all<{ id: number }>(`SELECT DISTINCT u.id FROM class_members m1 JOIN class_members m2 ON m1.class_id = m2.class_id JOIN users u ON u.id = m2.user_id WHERE m1.user_id = ? AND u.role = 'student'`, uid).map((r) => r.id)
      : this.all<{ id: number }>("SELECT id FROM users WHERE role = 'student'").map((r) => r.id);
    const since = this.now() - 7 * DAY;
    const std = LABS.filter((l) => l.playable && l.slug !== 'master').map((l) => l.slug);
    const names = new Map(this.all<{ id: number; name: string }>('SELECT id, name FROM users').map((r) => [r.id, r.name]));
    const all = ids.map((id) => {
      const xp = scope === 'all' ? this.totalXp(id) : (this.one<{ s: number | null }>('SELECT SUM(delta) AS s FROM xp_events WHERE user_id = ? AND at > ?', id, since)?.s ?? 0);
      const exits = this.exits(id);
      return { id, name: Game.shortName(names.get(id) ?? '?'), xp, labs: this.labsCompleted(exits), accuracyPct: Game.meanPct(this.standardRows(this.bestRows(id))), you: id === uid };
    }).filter((r) => r.xp > 0);
    // `total` is the number of students in the cohort who have XP in the window: the same figure for every viewer. A viewer without XP is not
    // ranked (they are not in `rows` and not counted); their own row comes back as `me`, placed below everyone who is ranked.
    all.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    let rank = 0; let prev = -1;
    const ranked = all.map((r, i) => { if (r.xp !== prev) { rank = i + 1; prev = r.xp; } return { rank, ...r }; });
    const LIMIT = 20;
    const top = ranked.slice(0, LIMIT);
    // The caller's own row is always returned, even when they sit outside the cohort or have no XP in the window.
    let me = ranked.find((r) => r.you);
    if (!me) {
      const xp = scope === 'all' ? this.totalXp(uid) : (this.one<{ s: number | null }>('SELECT SUM(delta) AS s FROM xp_events WHERE user_id = ? AND at > ?', uid, since)?.s ?? 0);
      const exits = this.exits(uid);
      me = { rank: ranked.filter((r) => r.xp > xp).length + 1, id: uid, name: Game.shortName(names.get(uid) ?? '?'), xp, labs: this.labsCompleted(exits), accuracyPct: Game.meanPct(this.standardRows(this.bestRows(uid))), you: true };
    }
    return { scope, cohort, rows: top.map(({ id: _id, ...r }) => r), me: { ...me, id: undefined }, total: ranked.length, cohortAvailable: cohort === 'all' || ids.length > 0 };
  }

  // -------------------------------------------------------------- teachers
  createClass(teacherId: number, name: string) {
    name = name.toWellFormed().trim();
    if (visibleLength(name) < 2) throw bad('A class name needs at least 2 visible characters.', ['body.name must have at least 2 visible characters']);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // Count and insert under one write lock, so two parallel requests cannot both slip under the cap.
    return tx(this.db, () => {
      if ((this.one<{ n: number }>('SELECT COUNT(*) AS n FROM classes WHERE teacher_id = ?', teacherId)?.n ?? 0) >= MAX_CLASSES_PER_TEACHER) {
        throw conflict('class_limit_reached', `A teacher can own at most ${MAX_CLASSES_PER_TEACHER} classes.`, { limit: MAX_CLASSES_PER_TEACHER });
      }
      // Two classes of one teacher with the same name would show identical labels in every picker: refused (case, spacing and invisible characters ignored).
      const key = classNameKey(name);
      if (this.all<{ name: string }>('SELECT name FROM classes WHERE teacher_id = ?', teacherId).some((c) => classNameKey(c.name) === key)) {
        throw conflict('class_name_taken', 'You already have a class with this name. Choose another name.', ['body.name must differ from the names of your other classes (case, spacing and invisible characters are ignored)']);
      }
      for (let tries = 0; tries < 8; tries++) {
        const code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
        try {
          const r = this.run('INSERT INTO classes (teacher_id, name, join_code, created_at) VALUES (?,?,?,?)', teacherId, name, code, this.now());
          return { id: Number(r.lastInsertRowid), name, joinCode: code };
        } catch (e) { if (!String(e).includes('UNIQUE')) throw e; }
      }
      throw new ApiError(500, 'internal_error', 'Could not allocate a join code.');
    });
  }

  listClasses(teacherId: number) {
    return this.all<{ id: number; name: string; join_code: string; n: number }>(
      'SELECT c.id, c.name, c.join_code, (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS n FROM classes c WHERE c.teacher_id = ? ORDER BY c.id', teacherId,
    ).map((c) => ({ id: c.id, name: c.name, joinCode: c.join_code, students: c.n }));
  }

  joinClass(studentId: number, code: string) {
    const c = this.one<{ id: number; name: string }>('SELECT id, name FROM classes WHERE join_code = ?', code.toUpperCase());
    if (!c) throw notFound('No class matches this code.');
    this.run('INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)', c.id, studentId, this.now());
    return { classId: c.id, name: c.name };
  }

  private ownedClass(teacherId: number, classId: number) {
    const c = this.one<{ id: number; name: string; teacher_id: number }>('SELECT id, name, teacher_id FROM classes WHERE id = ?', classId);
    if (!c || c.teacher_id !== teacherId) throw notFound('Unknown class.');
    return c;
  }

  private lastActive(uid: number): number | null {
    return this.one<{ t: number | null }>('SELECT MAX(al.created_at) AS t FROM answer_log al JOIN attempts a ON a.id = al.attempt_id WHERE a.user_id = ?', uid)?.t ?? null;
  }

  /** One student as a teacher sees them. */
  private studentRow(s: { id: number; name: string; joined_at: number }) {
    const rows = this.standardRows(this.bestRows(s.id));
    const xp = this.totalXp(s.id);
    const last = this.lastActive(s.id);
    const progressPct = Math.round((100 * rows.length) / STANDARD_MISSION_COUNT);
    const accuracyPct = Game.meanPct(rows);
    const idleDays = Math.floor((this.now() - (last ?? s.joined_at)) / DAY);
    const inactive = idleDays >= INACTIVE_DAYS;
    const needsAttention = (inactive && progressPct < 100) || (accuracyPct !== null && accuracyPct < ATTENTION_ACCURACY);
    const avgSec = rows.length ? Math.round(rows.reduce((a, r) => a + Game.sec(r), 0) / rows.length) : null;
    return {
      id: s.id, name: s.name, xp, level: levelProgress(xp).level,
      missionsCompleted: rows.length, progressPct, accuracyPct,
      hintsUsed: rows.reduce((a, r) => a + r.hints_total, 0), avgMissionSec: avgSec, avgMissionTime: avgSec === null ? null : mmss(avgSec),
      labsEscaped: this.labsCompleted(this.exits(s.id)), lastActiveAt: last, idleDays: last === null ? null : Math.floor((this.now() - last) / DAY),
      active: !inactive, needsAttention,
      attentionReason: needsAttention ? (accuracyPct !== null && accuracyPct < ATTENTION_ACCURACY ? `Accuracy under ${ATTENTION_ACCURACY}%` : `No activity for ${idleDays} days`) : null,
    };
  }

  private members(classId: number) {
    return this.all<{ id: number; name: string; joined_at: number }>('SELECT u.id, u.name, m.joined_at FROM class_members m JOIN users u ON u.id = m.user_id WHERE m.class_id = ? ORDER BY u.name', classId);
  }

  students(teacherId: number, classId: number, filter: { q?: string; status?: 'all' | 'attention' | 'active' | 'inactive' } = {}) {
    const c = this.ownedClass(teacherId, classId);
    const fold = (v: string) => v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const q = fold((filter.q ?? '').trim());
    let rows = this.members(classId).map((m) => this.studentRow(m));
    if (q) rows = rows.filter((r) => fold(r.name).includes(q));
    if (filter.status === 'attention') rows = rows.filter((r) => r.needsAttention);
    if (filter.status === 'active') rows = rows.filter((r) => r.active);
    if (filter.status === 'inactive') rows = rows.filter((r) => !r.active);
    rows.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    return { class: { id: c.id, name: c.name }, total: rows.length, students: rows };
  }

  studentDetail(teacherId: number, classId: number, studentId: number) {
    const c = this.ownedClass(teacherId, classId);
    const m = this.members(classId).find((x) => x.id === studentId);
    if (!m) throw notFound('This student is not in the class.');
    const row = this.studentRow(m);
    const best = this.standardRows(this.bestRows(studentId));
    const done = new Map(best.map((r) => [r.mission_id, r]));
    const comp = this.competenciesOf(best.map((r) => r.attempt_id));
    const historyTotal = this.one<{ n: number }>("SELECT COUNT(*) AS n FROM attempts WHERE user_id = ? AND status = 'completed'", studentId)?.n ?? 0;
    const history = this.all<{ mission_id: string; completed_at: number; score: number; wrong_total: number; hints_total: number; started_at: number }>(
      "SELECT mission_id, completed_at, score, wrong_total, hints_total, started_at FROM attempts WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 20", studentId)
      .map((a) => { const mm = MISSION_BY_ID.get(a.mission_id)!; return { missionId: a.mission_id, title: mm.title, labSlug: mm.labSlug, score: a.score, accuracyPct: Math.round((100 * mm.steps.length) / (mm.steps.length + a.wrong_total)), answersSubmitted: mm.steps.length + a.wrong_total, wrongAnswers: a.wrong_total, hintsUsed: a.hints_total, elapsed: mmss(Math.round((a.completed_at - a.started_at) / 1000)), completedAt: a.completed_at }; });
    const labs = LABS.filter((l) => l.playable && l.slug !== 'master').map((l) => {
      const rs = missionsOf(l.slug).map((mm) => done.get(mm.id)).filter((x): x is BestRow => !!x);
      return { slug: l.slug, name: l.name, completed: rs.length, total: missionsOf(l.slug).length, accuracyPct: Game.meanPct(rs), escaped: this.exits(studentId).has(l.slug) };
    });
    return { class: { id: c.id, name: c.name }, student: row, labs, competencies: comp.items, strongest: comp.strongest, improvement: comp.improvement, history, historyTotal };
  }

  analytics(teacherId: number, classId: number) {
    const c = this.ownedClass(teacherId, classId);
    const students = this.members(classId);
    const ids = students.map((s) => s.id);
    const inList = ids.length ? ids.map(() => '?').join(',') : 'NULL';
    const content = new Map(this.all<{ mission_id: string; status: string }>('SELECT mission_id, status FROM content_status').map((r) => [r.mission_id, r.status]));

    // Clean first try: of the students whose FIRST completed attempt exists, the share with zero wrong answers.
    // One pass: RANK() = 1 keeps every completed attempt tied on the earliest started_at of its (student, mission), like the correlated MIN() it replaces
    // (that subquery rescanned the student's earlier attempts for every row: quadratic, and synchronous, so one account could stall the API; R37 A37-001).
    const first = this.all<{ user_id: number; mission_id: string; wrong_total: number; hints_total: number }>(
      `SELECT user_id, mission_id, wrong_total, hints_total FROM (
         SELECT a.user_id, a.mission_id, a.wrong_total, a.hints_total,
                RANK() OVER (PARTITION BY a.user_id, a.mission_id ORDER BY a.started_at) AS rk
           FROM attempts a WHERE a.user_id IN (${inList}) AND a.status = 'completed')
        WHERE rk = 1`, ...ids);
    const started = this.all<{ mission_id: string; n: number }>(`SELECT mission_id, COUNT(DISTINCT user_id) AS n FROM attempts WHERE user_id IN (${inList}) GROUP BY mission_id`, ...ids);
    const startedBy = new Map(started.map((r) => [r.mission_id, r.n]));
    const stepWrongs = this.all<{ step_id: string; w: number; n: number }>(
      `SELECT sr.step_id, SUM(sr.wrong) AS w, COUNT(*) AS n FROM step_results sr JOIN attempts a ON a.id = sr.attempt_id WHERE a.user_id IN (${inList}) AND sr.solved_at IS NOT NULL GROUP BY sr.step_id`, ...ids);
    const wrongBy = new Map(stepWrongs.map((r) => [r.step_id, r]));

    // Success per mission = class mean accuracy, from each student's best attempt (the same figure the roster uses).
    const best = ids.flatMap((id) => this.bestRows(id));
    const missions = MISSIONS.map((m) => {
      const f = first.filter((x) => x.mission_id === m.id);
      const clean = f.filter((x) => x.wrong_total === 0).length;
      const b = best.filter((x) => x.mission_id === m.id);
      const avgSec = b.length ? Math.round(b.reduce((a, r) => a + Game.sec(r), 0) / b.length) : null;
      const steps = m.steps.map((s) => { const r = wrongBy.get(s.id); return { stepId: s.id, prompt: s.prompt, avgWrong: r ? Math.round((100 * r.w) / r.n) / 100 : null, solved: r?.n ?? 0 }; });
      return {
        missionId: m.id, title: m.title, labSlug: m.labSlug,
        studentsStarted: startedBy.get(m.id) ?? 0, studentsCompleted: b.length,
        successPct: Game.meanPct(b),
        cleanFirstTryPct: f.length ? Math.round((100 * clean) / f.length) : null,
        avgSec, avgTime: avgSec === null ? null : mmss(avgSec),
        avgHints: b.length ? Math.round((10 * b.reduce((a, r) => a + r.hints_total, 0)) / b.length) / 10 : null,
        contentStatus: (content.get(m.id) ?? 'draft') as 'draft' | 'reviewed' | 'approved',
        steps, needsAttention: false,
      };
    });
    // Weakest mission among those with enough data (3 students, or everyone in a smaller class).
    const minSample = Math.min(3, Math.max(1, students.length));
    // The Master Lab is never counted in class analytics, so it can never be flagged as the hardest mission either.
    const eligible = missions.filter((m) => m.labSlug !== 'master' && m.successPct !== null && m.studentsCompleted >= minSample);
    let hardest: (typeof missions)[number] | null = null;
    if (eligible.length) {
      hardest = eligible.reduce((a, b) => (b.successPct! < a.successPct! ? b : a));
      if (hardest.successPct! < NEEDS_ATTENTION_BELOW) hardest.needsAttention = true;
    }

    const roster = students.map((s) => this.studentRow(s));
    const withAcc = roster.filter((r) => r.accuracyPct !== null);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const perLab = LABS.filter((l) => l.playable && l.slug !== 'master').map((l) => {
      const ms = missionsOf(l.slug);
      const rows = ids.flatMap((id) => this.bestRows(id).filter((r) => MISSION_BY_ID.get(r.mission_id)!.labSlug === l.slug));
      return { slug: l.slug, name: l.name, completionPct: students.length ? Math.round((100 * rows.length) / (ms.length * students.length)) : 0, accuracyPct: Game.meanPct(rows) };
    });
    return {
      class: { id: c.id, name: c.name },
      cohort: {
        students: students.length,
        activeStudents: roster.filter((r) => r.active).length,
        needsAttention: roster.filter((r) => r.needsAttention).length,
        avgAccuracyPct: withAcc.length ? Math.round(mean(withAcc.map((r) => r.accuracyPct!))) : null,
        avgCompletionPct: roster.length ? Math.round(mean(roster.map((r) => r.progressPct))) : 0,
        avgXp: roster.length ? Math.round(mean(roster.map((r) => r.xp))) : 0,
        avgMissionsCompleted: roster.length ? Math.round(10 * mean(roster.map((r) => r.missionsCompleted))) / 10 : 0,
        labsEscaped: roster.reduce((a, r) => a + r.labsEscaped, 0),
      },
      hardestMission: hardest ? { missionId: hardest.missionId, title: hardest.title, labSlug: hardest.labSlug, successPct: hardest.successPct } : null,
      labs: perLab,
      missions,
      roster: roster.map((r) => ({ id: r.id, name: r.name, xp: r.xp, level: r.level, missionsCompleted: r.missionsCompleted, labsEscaped: r.labsEscaped, lastActiveAt: r.lastActiveAt, accuracyPct: r.accuracyPct, progressPct: r.progressPct, needsAttention: r.needsAttention })),
    };
  }

  // ---------------------------------------------------------- content status
  /** Internal scientific-approval workflow: Draft -> Reviewed -> Approved. Never shown to students. */
  contentMissions() {
    const st = new Map(this.all<{ mission_id: string; status: string; reviewed_by: string | null; updated_at: number }>('SELECT * FROM content_status').map((r) => [r.mission_id, r]));
    return {
      missions: MISSIONS.map((m) => { const r = st.get(m.id); return { missionId: m.id, title: m.title, labSlug: m.labSlug, status: (r?.status ?? 'draft') as 'draft' | 'reviewed' | 'approved', reviewedBy: r?.reviewed_by ?? null, updatedAt: r?.updated_at ?? null }; }),
      note: 'Sample clinical content is illustrative until faculty approve it.',
    };
  }

  setContentStatus(teacherId: number, missionId: string, status: 'draft' | 'reviewed' | 'approved') {
    if (!MISSION_BY_ID.has(missionId)) throw notFound('Unknown mission.');
    const name = this.one<{ name: string }>('SELECT name FROM users WHERE id = ?', teacherId)?.name;
    // Name plus account id: the name alone is editable and not unique, so it cannot identify who approved scientific content.
    const who = name === undefined ? null : reviewerLabel(name, teacherId);
    // Read, check and write under one write lock: two concurrent reviewers cannot both move the same status or break the audit chain.
    tx(this.db, () => {
      const cur = this.one<{ status: string }>('SELECT status FROM content_status WHERE mission_id = ?', missionId)?.status ?? 'draft';
      if (status === 'approved' && cur !== 'reviewed' && cur !== 'approved') throw conflict('review_required', 'Content must be reviewed before it can be approved.', { current: cur });
      // The only cycle is draft -> reviewed -> approved -> draft (re-asking for the current status is a no-op).
      const NEXT: Record<string, string> = { draft: 'reviewed', reviewed: 'approved', approved: 'draft' };
      if (status !== cur && NEXT[cur] !== status) throw conflict('illegal_transition', `Content cannot move from ${cur} to ${status}; the next step is ${NEXT[cur]}.`, { current: cur, next: NEXT[cur] });
      if (status === cur) return; // nothing changed: nothing to audit
      this.run('INSERT INTO content_status (mission_id, status, reviewed_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(mission_id) DO UPDATE SET status = excluded.status, reviewed_by = excluded.reviewed_by, updated_at = excluded.updated_at', missionId, status, status === 'draft' ? null : who, this.now());
      this.run('INSERT INTO content_audit (mission_id, from_status, to_status, actor_id, actor_name, at) VALUES (?,?,?,?,?,?)', missionId, cur, status, teacherId, who ?? 'unknown', this.now());
    });
    return this.contentMissions().missions.find((m) => m.missionId === missionId)!;
  }
}

/** The answer log is for review only: a pathological (very deep) response must never fail the answer itself. */
function safeJson(v: unknown): string {
  try { return JSON.stringify(v).slice(0, 2000); } catch { return '"[unserializable response]"'; }
}

interface BestRow {
  mission_id: string; best_score: number; attempt_id: string; wrong_total: number; hints_total: number;
  started_at: number; completed_at: number | null; result_json: string | null;
}

interface AttemptRow {
  id: string; user_id: number; mission_id: string; status: 'in_progress' | 'completed' | 'expired';
  current_step: number; started_at: number; completed_at: number | null;
  wrong_total: number; hints_total: number; score: number | null; result_json: string | null;
}

export { fragmentSlots };
