// Transparent scoring. Pure functions so the rules can be unit-tested and published verbatim.
import type { ScoringProfile } from './types.ts';

export const WRONG_PENALTY = 10;
export const HINT_PENALTY = 15;
/** Full time bonus up to this share of the time limit, then linear down to zero at the limit. */
export const TIME_PAR_SHARE = 0.25;

export interface LedgerRow {
  id: 'base' | 'first_attempt' | 'time_bonus' | 'no_hint' | 'hints' | 'wrong';
  label: string;
  reason: string;
  points: number;
  kind: 'earned' | 'penalty' | 'unearned';
}

export interface ScoreInput {
  profile: ScoringProfile;
  stepCount: number;
  /** Steps solved without any wrong answer. */
  firstTrySteps: number;
  wrong: number;
  hints: number;
  elapsedSec: number;
  timeLimitSec: number;
}

export interface ScoreResult { total: number; max: number; rows: LedgerRow[] }

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function timeBonus(elapsedSec: number, limitSec: number, max: number): number {
  if (limitSec <= 0) return 0;
  const par = limitSec * TIME_PAR_SHARE;
  const f = clamp((limitSec - elapsedSec) / (limitSec - par), 0, 1);
  return Math.round(max * f);
}

export function maxScore(p: ScoringProfile, stepCount: number): number {
  return p.base + (p.firstTryMode === 'all' ? p.firstTry : p.firstTry * stepCount) + p.timeMax + p.noHint;
}

export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function computeScore(i: ScoreInput): ScoreResult {
  const p = i.profile;
  const rows: LedgerRow[] = [];
  rows.push({ id: 'base', label: 'Base mission', reason: 'Mission completed', points: p.base, kind: 'earned' });

  const ftPoints = p.firstTryMode === 'all' ? (i.firstTrySteps === i.stepCount ? p.firstTry : 0) : p.firstTry * i.firstTrySteps;
  rows.push({
    id: 'first_attempt', label: 'First attempt',
    reason: p.firstTryMode === 'all'
      ? (ftPoints > 0 ? 'Every step solved first time' : 'At least one step needed a second try')
      : `${i.firstTrySteps} of ${i.stepCount} steps solved first time`,
    points: ftPoints, kind: ftPoints > 0 ? 'earned' : 'unearned',
  });

  const tb = timeBonus(i.elapsedSec, i.timeLimitSec, p.timeMax);
  rows.push({ id: 'time_bonus', label: 'Time bonus', reason: `Finished in ${mmss(i.elapsedSec)}`, points: tb, kind: tb > 0 ? 'earned' : 'unearned' });

  const nh = i.hints === 0 ? p.noHint : 0;
  rows.push({ id: 'no_hint', label: 'No hint used', reason: i.hints === 0 ? 'No Lab Assistant hint' : `${i.hints} hint${i.hints > 1 ? 's' : ''} used`, points: nh, kind: nh > 0 ? 'earned' : 'unearned' });

  if (i.hints > 0) rows.push({ id: 'hints', label: 'Hint used', reason: `${i.hints} x -${HINT_PENALTY} XP`, points: -HINT_PENALTY * i.hints, kind: 'penalty' });
  if (i.wrong > 0) rows.push({ id: 'wrong', label: 'Wrong attempt', reason: `${i.wrong} x -${WRONG_PENALTY} XP`, points: -WRONG_PENALTY * i.wrong, kind: 'penalty' });

  // A mission never scores below 0: penalties are applied only up to the points earned, and a capped row says so, so the ledger
  // always adds up to the awarded score (no hidden floor, no surprise bonus row).
  let budget = rows.filter((r) => r.kind !== 'penalty').reduce((a, r) => a + r.points, 0);
  for (const row of rows) {
    if (row.kind !== 'penalty') continue;
    const applied = Math.min(-row.points, budget);
    budget -= applied;
    if (applied < -row.points) { row.points = -applied; row.reason += ' (capped: a mission never scores below 0)'; }
  }
  const total = rows.reduce((a, r) => a + r.points, 0);
  return { total, max: maxScore(p, i.stepCount), rows };
}

/** Level n starts at 250 * n * (n - 1) XP: 0, 500, 1500, 3000, 5000, 7500, 10500 ... (the same curve as the design system's XPIndicator). */
export const levelStart = (n: number) => 250 * n * (n - 1);
export const levelOf = (xp: number) => {
  let n = 1;
  while (levelStart(n + 1) <= xp) n++;
  return n;
};
export const levelProgress = (xp: number) => {
  const level = levelOf(xp);
  const from = levelStart(level);
  const to = levelStart(level + 1);
  return { level, into: xp - from, size: to - from, nextLevelAt: to };
};
