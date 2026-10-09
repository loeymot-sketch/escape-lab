import { t } from '../i18n';
import { outOf } from './labels';
import { arr, bool, nonNeg, nullable, num, oneOf, optional, pct, rec, str, PayloadError, type Rec } from './guard';

/** Identity is reduced to what the interface needs: no display name or e-mail is ever kept. */
export type Me = { id: number; role: 'student' | 'teacher'; xp: number; level: number };

export function normalizeMe(payload: unknown): Me {
  const root = rec(payload, 'me');
  return {
    id: nonNeg(root.id, 'me', 'id'),
    role: oneOf(root.role, ['student', 'teacher'] as const, 'me', 'role'),
    xp: nonNeg(root.xp, 'me', 'xp'),
    level: nonNeg(root.level, 'me', 'level'),
  };
}

export type DemoLogin = { token: string; user: Me };
export function normalizeDemoLogin(payload: unknown): DemoLogin {
  const root = rec(payload, 'demo login');
  if (root.demo !== true) throw new Error('Invalid server demo login payload: demo.');
  return { token: str(root.token, 'demo login', 'token'), user: normalizeMe(root.user) };
}

/** POST /demo/reset for the student guest: the server answers { reset: true, profile }. Anything else is a broken reply, never a completed reset. */
export function normalizeDemoReset(payload: unknown): { reset: true } {
  const root = rec(payload, 'demo reset');
  if (root.reset !== true) throw new PayloadError('Invalid server demo reset payload: reset.');
  rec(root.profile, 'demo reset', 'profile');
  return { reset: true };
}

export type LabState = 'completed' | 'current' | 'available' | 'locked' | 'coming_soon';
const LAB_STATES = ['completed', 'current', 'available', 'locked', 'coming_soon'] as const;

export type Lab = {
  slug: string;
  name: string;
  discipline: string;
  ordinal: number;
  blurb: string;
  state: LabState;
  lockedReason?: string;
  missions: { completed: number; total: number };
  fragments: { found: number; total: number };
  exited: boolean;
};

/** `{ completed, total }` with completed never above total. */
function countOf(value: Rec, label: string, field: string): { completed: number; total: number } {
  const completed = nonNeg(value.completed, label, `${field}.completed`);
  const total = nonNeg(value.total, label, `${field}.total`);
  if (completed > total) throw new PayloadError(`Invalid server ${label} payload: ${field}.completed.`);
  return { completed, total };
}

export function normalizeLabs(payload: unknown): Lab[] {
  const root = rec(payload, 'labs');
  return arr(root.labs, 'labs', 'labs').map((item, i) => {
    const row = rec(item, 'labs', `labs[${i}]`);
    const missions = rec(row.missions, 'labs', `labs[${i}].missions`);
    const fragments = rec(row.fragments, 'labs', `labs[${i}].fragments`);
    const state = oneOf(row.state, LAB_STATES, 'labs', 'state');
    return {
      slug: str(row.slug, 'labs', 'slug'),
      name: str(row.name, 'labs', 'name'),
      discipline: str(row.discipline, 'labs', 'discipline'),
      ordinal: nonNeg(row.ordinal, 'labs', 'ordinal'),
      blurb: str(row.blurb, 'labs', 'blurb'),
      state,
      // A locked laboratory must say why: the page never invents an explanation of its own.
      lockedReason: state === 'locked' ? str(row.lockedReason, 'labs', 'lockedReason') : optional(row.lockedReason, (v) => str(v, 'labs', 'lockedReason')),
      missions: countOf(missions, 'labs', 'missions'),
      fragments: { found: nonNeg(fragments.found, 'labs', 'fragments.found'), total: nonNeg(fragments.total, 'labs', 'fragments.total') },
      exited: bool(row.exited, 'labs', 'exited'),
    };
  });
}

export type ContinueTarget = { kind: 'mission' | 'unlock'; missionId: string | null; labSlug: string; title: string; resume: boolean };
export type Dashboard = {
  user: { level: number; xp: number };
  overall: { completedMissions: number; totalMissions: number; pct: number };
  streakDays: number;
  labsCompleted: number;
  continue: ContinueTarget | null;
  recommended: { missionId: string; labSlug: string; title: string; reason: string } | null;
  badges: { earned: number; total: number };
};

const D = 'dashboard';
export function normalizeDashboard(payload: unknown): Dashboard {
  const root = rec(payload, D);
  const user = rec(root.user, D, 'user');
  const overall = rec(root.overall, D, 'overall');
  const badges = rec(root.badges, D, 'badges');
  const cont = nullable(root.continue, (v) => {
    const c = rec(v, D, 'continue');
    const kind = oneOf(c.kind, ['mission', 'unlock'] as const, D, 'continue.kind');
    const missionId = nullable(c.missionId, (m) => str(m, D, 'continue.missionId'));
    if (kind === 'mission' && missionId === null) throw new Error(`Invalid server ${D} payload: continue.missionId.`);
    return { kind, missionId, labSlug: str(c.labSlug, D, 'continue.labSlug'), title: str(c.title, D, 'continue.title'), resume: bool(c.resume, D, 'continue.resume') };
  });
  const recommended = nullable(root.recommended, (v) => {
    const r = rec(v, D, 'recommended');
    return { missionId: str(r.missionId, D, 'recommended.missionId'), labSlug: str(r.labSlug, D, 'recommended.labSlug'), title: str(r.title, D, 'recommended.title'), reason: str(r.reason, D, 'recommended.reason') };
  });
  return {
    user: { level: nonNeg(user.level, D, 'user.level'), xp: nonNeg(user.xp, D, 'user.xp') },
    overall: ((): Dashboard['overall'] => {
      const completedMissions = nonNeg(overall.completedMissions, D, 'overall.completedMissions');
      const totalMissions = nonNeg(overall.totalMissions, D, 'overall.totalMissions');
      if (completedMissions > totalMissions) throw new PayloadError(`Invalid server ${D} payload: overall.completedMissions.`);
      return { completedMissions, totalMissions, pct: pct(overall.pct, D, 'overall.pct') };
    })(),
    streakDays: nonNeg(root.streakDays, D, 'streakDays'),
    labsCompleted: nonNeg(root.labsCompleted, D, 'labsCompleted'),
    continue: cont,
    recommended,
    badges: { earned: nonNeg(badges.earned, D, 'badges.earned'), total: nonNeg(badges.total, D, 'badges.total') },
  };
}

export type MissionState = 'completed' | 'current' | 'available' | 'locked';
export type LobbyMission = {
  id: string;
  ordinal: number;
  title: string;
  engine: string;
  difficulty: string;
  estMinutes: number;
  state: MissionState;
  unlocksWith?: string;
  bestScore: number | null;
  maxScore: number;
  inProgress: boolean;
};
export type LabLobby = {
  lab: { slug: string; name: string; discipline: string; blurb: string };
  state: LabState;
  lockedReason?: string;
  missions: LobbyMission[];
  vault: { labSlug: string; codeLength: number; slots: (number | null)[]; complete: boolean; exited: boolean } | null;
};

const B = 'lab lobby';
export function normalizeLabLobby(payload: unknown): LabLobby {
  const root = rec(payload, B);
  const lab = rec(root.lab, B, 'lab');
  const vault = nullable(root.vault, (v) => normalizeVaultItem(v));
  const state = oneOf(root.state, LAB_STATES, B, 'state');
  return {
    lab: { slug: str(lab.slug, B, 'lab.slug'), name: str(lab.name, B, 'lab.name'), discipline: str(lab.discipline, B, 'lab.discipline'), blurb: str(lab.blurb, B, 'lab.blurb') },
    state,
    lockedReason: state === 'locked' ? str(root.lockedReason, B, 'lockedReason') : optional(root.lockedReason, (v) => str(v, B, 'lockedReason')),
    missions: arr(root.missions, B, 'missions').map((item, i) => {
      const m = rec(item, B, `missions[${i}]`);
      const missionState = oneOf(m.state, ['completed', 'current', 'available', 'locked'] as const, B, 'mission.state');
      return {
        id: str(m.id, B, 'mission.id'),
        ordinal: nonNeg(m.ordinal, B, 'mission.ordinal'),
        title: str(m.title, B, 'mission.title'),
        engine: str(m.engine, B, 'mission.engine'),
        difficulty: str(m.difficulty, B, 'mission.difficulty'),
        estMinutes: nonNeg(m.estMinutes, B, 'mission.estMinutes'),
        state: missionState,
        unlocksWith: missionState === 'locked' ? str(m.unlocksWith, B, 'mission.unlocksWith') : optional(m.unlocksWith, (v) => str(v, B, 'mission.unlocksWith')),
        bestScore: nullable(m.bestScore, (v) => nonNeg(v, B, 'mission.bestScore')),
        maxScore: nonNeg(m.maxScore, B, 'mission.maxScore'),
        inProgress: bool(m.inProgress, B, 'mission.inProgress'),
      };
    }),
    vault,
  };
}

export type VaultItem = { labSlug: string; codeLength: number; slots: (number | null)[]; complete: boolean; exited: boolean };
export function normalizeVaultItem(value: unknown): VaultItem {
  const vault = rec(value, 'vault', 'vault item');
  const codeLength = nonNeg(vault.codeLength, 'vault', 'codeLength');
  const slots = arr(vault.slots, 'vault', 'slots').map((slot) => nullable(slot, (v) => nonNeg(v, 'vault', 'slot')));
  if (slots.length !== codeLength) throw new Error('Invalid server vault payload: slots.');
  return {
    labSlug: str(vault.labSlug, 'vault', 'labSlug'),
    codeLength,
    slots,
    complete: bool(vault.complete, 'vault', 'complete'),
    exited: bool(vault.exited, 'vault', 'exited'),
  };
}

export type Rules = { hintPenalty: number; wrongAnswerPenalty: number };
export function normalizeRules(payload: unknown): Rules {
  const root = rec(payload, 'rules');
  return { hintPenalty: num(root.hintPenalty, 'rules', 'hintPenalty'), wrongAnswerPenalty: num(root.wrongAnswerPenalty, 'rules', 'wrongAnswerPenalty') };
}

export type UnlockReply = { alreadyUnlocked: boolean; labName: string; newBadges: { id: string; name: string }[] };
export function normalizeUnlock(payload: unknown): UnlockReply {
  const root = rec(payload, 'unlock');
  if (root.unlocked !== true) throw new Error('Invalid server unlock payload: unlocked.');
  const lab = rec(root.lab, 'unlock', 'lab');
  return {
    alreadyUnlocked: bool(root.alreadyUnlocked, 'unlock', 'alreadyUnlocked'),
    labName: str(lab.name, 'unlock', 'lab.name'),
    newBadges: arr(root.newBadges, 'unlock', 'newBadges').map((item, i) => {
      const b = rec(item, 'unlock', `newBadges[${i}]`);
      return { id: str(b.id, 'unlock', 'badge.id'), name: str(b.name, 'unlock', 'badge.name') };
    }),
  };
}

/** Copy only: has the learner already made progress? Read from what the server reported (completed missions, a mission to resume, a vault to open). */
export function hasProgress(d: Dashboard): boolean {
  return d.overall.completedMissions > 0 || (d.continue !== null && (d.continue.resume || d.continue.kind === 'unlock'));
}

/** Slug of the bonus laboratory that the server keeps out of its mission and lab counts. */
const MASTER_SLUG = 'master';

/**
 * Wording for the two dashboard counters (call while rendering: the texts are in the display language). The numbers are exactly what the server sent (it counts the standard missions and the
 * standard laboratories only); this only says so, so the figures cannot be read as covering the Master Lab as well. The denominator of
 * the laboratory counter is the number of playable standard laboratories in the payload, left out when it does not fit the server figure.
 */
export function dashboardFigures(d: Dashboard, labs: readonly Lab[]): { missions: { value: string; detail: string }; labs: { value: string; detail: string } } {
  const hasMaster = labs.some((l) => l.slug === MASTER_SLUG && l.state !== 'coming_soon');
  const standard = labs.filter((l) => l.slug !== MASTER_SLUG && l.state !== 'coming_soon').length;
  const known = standard > 0 && d.labsCompleted <= standard;
  const percent = d.overall.pct;
  const earned = d.badges.earned;
  const total = d.badges.total;
  return {
    missions: {
      value: outOf(d.overall.completedMissions, d.overall.totalMissions),
      detail: hasMaster ? t('{pct}% of the standard missions · The Master Lab is tracked separately', { pct: percent }) : t('{pct}% of the standard missions', { pct: percent }),
    },
    labs: {
      value: known ? outOf(d.labsCompleted, standard) : String(d.labsCompleted),
      detail: known ? t('standard labs · {earned} of {total} badges earned', { earned, total }) : t('Standard labs · {earned} of {total} badges earned', { earned, total }),
    },
  };
}

/** "All investigations complete" is only true with nothing left to continue AND no open Master Lab (the server counts it apart from the missions). */
export function allInvestigationsDone(d: Dashboard, labs: readonly Lab[]): boolean {
  const masterOpen = labs.some((l) => l.slug === MASTER_SLUG && l.state !== 'completed' && l.state !== 'coming_soon');
  return d.continue === null && d.overall.totalMissions > 0 && d.overall.completedMissions >= d.overall.totalMissions && !masterOpen;
}
