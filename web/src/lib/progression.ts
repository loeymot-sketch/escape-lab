import { PayloadError, arr, bool, count, nonNeg, nullable, num, oneOf, pct, rec, str } from './guard';
import { plural } from './labels';
import { t } from '../i18n';
import { normalizeCompetencies, type Competencies } from './competency';
import { normalizeVaultItem, type VaultItem } from './student';

const R = 'lab result';

export type LabResultMission = { id: string; ordinal: number; title: string; score: number | null; maxScore: number; accuracyPct: number | null; elapsed: string | null; hintsUsed: number };
export type LabLedgerRow = { id: string; label: string; reason: string; points: number; kind: 'earned' | 'penalty' | 'unearned' };
export type LabResult = {
  lab: { slug: string; name: string };
  xp: number;
  stats: { accuracyPct: number | null; elapsed: string; hintsUsed: number; wrongAnswers: number; missions: number };
  missions: LabResultMission[];
  ledger: LabLedgerRow[];
  competencies: Competencies;
  badge: { id: string; name: string } | null;
};

export function normalizeLabResult(payload: unknown): LabResult {
  const root = rec(payload, R);
  const lab = rec(root.lab, R, 'lab');
  const stats = rec(root.stats, R, 'stats');
  return {
    lab: { slug: str(lab.slug, R, 'lab.slug'), name: str(lab.name, R, 'lab.name') },
    xp: nonNeg(root.xp, R, 'xp'),
    stats: {
      accuracyPct: nullable(stats.accuracyPct, (v) => pct(v, R, 'stats.accuracyPct')),
      elapsed: str(stats.elapsed, R, 'stats.elapsed'),
      hintsUsed: nonNeg(stats.hintsUsed, R, 'stats.hintsUsed'),
      wrongAnswers: nonNeg(stats.wrongAnswers, R, 'stats.wrongAnswers'),
      missions: nonNeg(stats.missions, R, 'stats.missions'),
    },
    missions: arr(root.missions, R, 'missions').map((item, i) => {
      const m = rec(item, R, `missions[${i}]`);
      return {
        id: str(m.id, R, 'mission.id'),
        ordinal: nonNeg(m.ordinal, R, 'mission.ordinal'),
        title: str(m.title, R, 'mission.title'),
        score: nullable(m.score, (v) => nonNeg(v, R, 'mission.score')),
        maxScore: nonNeg(m.maxScore, R, 'mission.maxScore'),
        accuracyPct: nullable(m.accuracyPct, (v) => pct(v, R, 'mission.accuracyPct')),
        elapsed: nullable(m.elapsed, (v) => str(v, R, 'mission.elapsed')),
        hintsUsed: nonNeg(m.hintsUsed, R, 'mission.hintsUsed'),
      };
    }),
    ledger: arr(root.ledger, R, 'ledger').map((item, i) => {
      const row = rec(item, R, `ledger[${i}]`);
      return {
        id: str(row.id, R, 'ledger.id'),
        label: str(row.label, R, 'ledger.label'),
        reason: str(row.reason, R, 'ledger.reason'),
        points: num(row.points, R, 'ledger.points'),
        kind: oneOf(row.kind, ['earned', 'penalty', 'unearned'] as const, R, 'ledger.kind'),
      };
    }),
    competencies: normalizeCompetencies(root, R),
    badge: nullable(root.badge, (v) => {
      const b = rec(v, R, 'badge');
      return { id: str(b.id, R, 'badge.id'), name: str(b.name, R, 'badge.name') };
    }),
  };
}

export type { VaultItem };
export function normalizeVault(payload: unknown): VaultItem[] {
  const root = rec(payload, 'vault');
  return arr(root.vaults, 'vault', 'vaults').map((item) => normalizeVaultItem(item));
}

export type BadgeItem = { id: string; name: string; description: string; earned: boolean; earnedAt: number | null };
export function normalizeBadges(payload: unknown): BadgeItem[] {
  const root = rec(payload, 'badges');
  return arr(root.badges, 'badges', 'badges').map((item) => {
    const badge = rec(item, 'badges', 'badge');
    return {
      id: str(badge.id, 'badges', 'badge.id'),
      name: str(badge.name, 'badges', 'badge.name'),
      description: str(badge.description, 'badges', 'badge.description'),
      earned: bool(badge.earned, 'badges', 'badge.earned'),
      earnedAt: nullable(badge.earnedAt, (v) => nonNeg(v, 'badges', 'badge.earnedAt')),
    };
  });
}

export type LeaderboardRow = { rank: number; name: string; xp: number; labs: number; you: boolean };
export type Leaderboard = { rows: LeaderboardRow[]; me: LeaderboardRow | null; total: number; cohortAvailable: boolean };

const readRow = (item: unknown): LeaderboardRow => {
  const row = rec(item, 'leaderboard', 'row');
  const rank = count(row.rank, 'leaderboard', 'row.rank');
  // A rank starts at 1: "#0" can only be a broken payload.
  if (rank < 1) throw new PayloadError('Invalid server leaderboard payload: row.rank.');
  return {
    rank,
    name: str(row.name, 'leaderboard', 'row.name'),
    xp: count(row.xp, 'leaderboard', 'row.xp'),
    labs: count(row.labs, 'leaderboard', 'row.labs'),
    you: bool(row.you, 'leaderboard', 'row.you'),
  };
};

const inconsistent = (field: string): never => { throw new PayloadError(`Invalid server leaderboard payload: ${field}.`); };

export function normalizeLeaderboard(payload: unknown): Leaderboard {
  const root = rec(payload, 'leaderboard');
  const rows = arr(root.rows, 'leaderboard', 'rows').map(readRow);
  const me = nullable(root.me, readRow);
  const total = count(root.total, 'leaderboard', 'total');
  // Figures that contradict each other are a broken payload, not data. The server lists the best students first and ranks ties alike
  // (a rank is the position of the first student with that XP), so the listed rows can never outnumber the ranked students, are never
  // missing while students are ranked, and cannot rise in XP or step back in rank. A viewer who has no XP is placed one below the ranked students.
  if (rows.length > total) inconsistent('total');
  if (total > 0 && rows.length === 0) inconsistent('rows');
  rows.forEach((row, i) => {
    const previous = rows[i - 1];
    if (row.rank > i + 1) inconsistent('row.rank');
    if (!previous) {
      if (row.rank !== 1) inconsistent('row.rank');
    } else if (row.xp > previous.xp || (row.xp === previous.xp ? row.rank !== previous.rank : row.rank <= previous.rank)) {
      inconsistent('row.rank');
    }
  });
  if (me && me.rank > total + 1) inconsistent('me.rank');
  return { rows, me, total, cohortAvailable: bool(root.cohortAvailable, 'leaderboard', 'cohortAvailable') };
}

/**
 * What the leaderboard panel may say, from server figures only (nothing is ranked or counted here). Without a cohort there is nothing
 * to rank against ("unavailable"); a cohort where nobody has XP yet has no rows ("nobody"). The gap row appears only when the row of
 * the learner really is separated from the listed rows. A viewer without XP is not ranked (the server gives such a viewer rank total + 1):
 * their row says so instead of showing a rank, and it is never added to the "N of M ranked students" count.
 */
export type BoardView =
  | { kind: 'unavailable' }
  | { kind: 'nobody' }
  | { kind: 'ranked'; showMe: boolean; gap: boolean; unranked: boolean; count: string | null };

/** Call while rendering: `count` is already in the display language. */
export function describeBoard(board: Leaderboard): BoardView {
  if (!board.cohortAvailable) return { kind: 'unavailable' };
  if (board.total === 0) return { kind: 'nobody' };
  const listed = board.rows.some((r) => r.you);
  const showMe = board.me !== null && !listed;
  const unranked = showMe && board.me !== null && (board.me.xp === 0 || board.me.rank > board.total);
  const shown = board.rows.length + (showMe && !unranked ? 1 : 0);
  const gap = showMe && !unranked && board.me !== null && board.me.rank > board.rows.length + 1;
  return { kind: 'ranked', showMe, gap, unranked, count: shown <= board.total ? t('Showing {shown} of {total}.', { shown, total: plural(board.total, 'ranked student') }) : null };
}
