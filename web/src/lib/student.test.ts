import { describe, expect, it } from 'vitest';
import { clone, dashboardPayload, labsPayload, lobbyPayload, mePayload } from './fixtures';
import { allInvestigationsDone, dashboardFigures, hasProgress, normalizeDashboard, normalizeDemoLogin, normalizeDemoReset, normalizeLabLobby, normalizeLabs, normalizeMe, normalizeRules, normalizeUnlock } from './student';

const without = <T extends object>(payload: T, path: string): T => {
  const copy = clone(payload) as Record<string, unknown>;
  const keys = path.split('.');
  let node: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  delete node[keys.at(-1)!];
  return copy as T;
};

describe('GET /me', () => {
  it('keeps identity data minimal: no display name or e-mail reaches the UI model', () => {
    const me = normalizeMe(mePayload());
    expect(me).toEqual({ id: 7, role: 'student', xp: 8240, level: 6 });
    expect(JSON.stringify(me)).not.toContain('Test Learner');
  });
  it.each(['id', 'role', 'xp', 'level'])('throws without %s', (field) => {
    expect(() => normalizeMe(without(mePayload(), field))).toThrow(field);
  });
  it('rejects an unknown role and non-objects', () => {
    expect(() => normalizeMe({ ...mePayload(), role: 'admin' })).toThrow('role');
    expect(() => normalizeMe(null)).toThrow();
    expect(() => normalizeMe([])).toThrow();
  });
});

describe('POST /auth/demo', () => {
  const login = () => ({ token: 'tok', user: mePayload(), demo: true });
  it('returns the token and the minimal user', () => {
    expect(normalizeDemoLogin(login())).toEqual({ token: 'tok', user: { id: 7, role: 'student', xp: 8240, level: 6 } });
  });
  it('requires the demo marker, a token and a user', () => {
    expect(() => normalizeDemoLogin({ ...login(), demo: false })).toThrow('demo');
    expect(() => normalizeDemoLogin(without(login(), 'demo'))).toThrow('demo');
    expect(() => normalizeDemoLogin(without(login(), 'token'))).toThrow('token');
    expect(() => normalizeDemoLogin(without(login(), 'user'))).toThrow();
    expect(() => normalizeDemoLogin({ ...login(), token: '' })).toThrow('token');
  });
});

describe('GET /dashboard', () => {
  it('reads progress, continue target and recommendation', () => {
    const d = normalizeDashboard(dashboardPayload());
    expect(d.overall).toEqual({ completedMissions: 5, totalMissions: 9, pct: 56 });
    expect(d.continue).toMatchObject({ kind: 'mission', missionId: 'mic-03', resume: false });
    expect(d.recommended?.missionId).toBe('bio-01');
    expect(JSON.stringify(d)).not.toContain('Test Learner');
  });
  it('accepts an explicit null continue/recommended (a new learner) but not a missing key', () => {
    const fresh = { ...dashboardPayload(), continue: null, recommended: null };
    expect(normalizeDashboard(fresh)).toMatchObject({ continue: null, recommended: null });
    expect(() => normalizeDashboard(without(dashboardPayload(), 'continue'))).toThrow('continue');
  });
  it('models the unlock target', () => {
    const unlock = { ...dashboardPayload(), continue: { kind: 'unlock', missionId: null, labSlug: 'hematology', title: 'Unlock the Hematology Lab', resume: false } };
    expect(normalizeDashboard(unlock).continue).toMatchObject({ kind: 'unlock', missionId: null });
    const broken = { ...dashboardPayload(), continue: { kind: 'mission', missionId: null, labSlug: 'x', title: 'x', resume: false } };
    expect(() => normalizeDashboard(broken)).toThrow('missionId');
  });
  it.each(['user.level', 'user.xp', 'overall.completedMissions', 'overall.totalMissions', 'overall.pct', 'streakDays', 'labsCompleted', 'badges.earned', 'badges.total', 'continue.resume', 'continue.title', 'recommended.reason'])('throws without %s', (path) => {
    expect(() => normalizeDashboard(without(dashboardPayload(), path))).toThrow();
  });
});

describe('GET /labs', () => {
  it('reads every state with progress counts and the locked reason', () => {
    const labs = normalizeLabs(labsPayload());
    expect(labs.map((l) => l.state)).toEqual(['completed', 'locked', 'coming_soon']);
    expect(labs[1]).toMatchObject({ lockedReason: 'Clear 3 labs (1 of 3 cleared)', missions: { completed: 0, total: 1 }, fragments: { found: 0, total: 4 } });
    expect(labs[0]!.lockedReason).toBeUndefined();
  });
  it('rejects an unknown state or missing counters', () => {
    const bad = labsPayload();
    bad.labs[0]!.state = 'unlocked';
    expect(() => normalizeLabs(bad)).toThrow('state');
    expect(() => normalizeLabs(without(labsPayload(), 'labs'))).toThrow('labs');
    const noMissions = labsPayload() as { labs: Record<string, unknown>[] };
    delete noMissions.labs[0]!.missions;
    expect(() => normalizeLabs(noMissions)).toThrow('missions');
    const noExit = labsPayload() as { labs: Record<string, unknown>[] };
    delete noExit.labs[0]!.exited;
    expect(() => normalizeLabs(noExit)).toThrow('exited');
  });
});

describe('GET /labs/:slug', () => {
  it('reads the mission picker, best scores and the vault', () => {
    const lobby = normalizeLabLobby(lobbyPayload());
    expect(lobby.missions[0]).toMatchObject({ id: 'hem-01', state: 'completed', bestScore: 168, maxScore: 180, inProgress: false });
    expect(lobby.missions[1]).toMatchObject({ state: 'locked', unlocksWith: 'Complete mission 01 to unlock', bestScore: null });
    expect(lobby.vault?.slots).toEqual([7, null, 2]);
  });
  it('accepts a lab in development (no missions, no vault) but needs both keys', () => {
    const soon = { lab: { slug: 'immunology', name: 'Immunology Lab', discipline: 'immunology', blurb: 'Coming soon.' }, state: 'coming_soon', missions: [], vault: null };
    expect(normalizeLabLobby(soon)).toMatchObject({ state: 'coming_soon', missions: [], vault: null });
    expect(() => normalizeLabLobby(without(soon, 'vault'))).toThrow();
    expect(() => normalizeLabLobby(without(soon, 'missions'))).toThrow('missions');
  });
  it('throws on an incomplete mission row', () => {
    for (const field of ['id', 'title', 'state', 'bestScore', 'maxScore', 'inProgress', 'ordinal', 'engine', 'difficulty', 'estMinutes']) {
      const bad = clone(lobbyPayload());
      delete (bad.missions[0] as Record<string, unknown>)[field];
      expect(() => normalizeLabLobby(bad)).toThrow();
    }
  });
});

describe('GET /rules and unlock', () => {
  it('reads the published penalties instead of hard-coding them', () => {
    expect(normalizeRules({ hintPenalty: -15, wrongAnswerPenalty: -10, xp: 'x' })).toEqual({ hintPenalty: -15, wrongAnswerPenalty: -10 });
    expect(() => normalizeRules({ wrongAnswerPenalty: -10 })).toThrow('hintPenalty');
  });
  it('reads a successful unlock', () => {
    const reply = normalizeUnlock({ unlocked: true, alreadyUnlocked: false, lab: { name: 'Hematology Lab' }, newBadges: [{ id: 'first-escape', name: 'First Escape' }] });
    expect(reply).toEqual({ alreadyUnlocked: false, labName: 'Hematology Lab', newBadges: [{ id: 'first-escape', name: 'First Escape' }] });
    expect(() => normalizeUnlock({ unlocked: false, alreadyUnlocked: false, lab: { name: 'x' }, newBadges: [] })).toThrow('unlocked');
    expect(() => normalizeUnlock({ unlocked: true, lab: { name: 'x' }, newBadges: [] })).toThrow('alreadyUnlocked');
  });
});

describe('dashboard heading copy', () => {
  it('invites a learner without progress to start, and a learner with progress to continue', () => {
    const fresh = normalizeDashboard({ ...dashboardPayload(), overall: { completedMissions: 0, totalMissions: 10, pct: 0 }, continue: { kind: 'mission', missionId: 'hem-01', labSlug: 'hematology', title: 'Blood Smear Code', resume: false } });
    expect(hasProgress(fresh)).toBe(false);
    expect(hasProgress(normalizeDashboard(dashboardPayload()))).toBe(true);
    const resuming = normalizeDashboard({ ...dashboardPayload(), overall: { completedMissions: 0, totalMissions: 10, pct: 0 }, continue: { kind: 'mission', missionId: 'hem-01', labSlug: 'hematology', title: 'x', resume: true } });
    expect(hasProgress(resuming)).toBe(true);
    const vault = normalizeDashboard({ ...dashboardPayload(), overall: { completedMissions: 0, totalMissions: 10, pct: 0 }, continue: { kind: 'unlock', missionId: null, labSlug: 'hematology', title: 'Unlock', resume: false } });
    expect(hasProgress(vault)).toBe(true);
    expect(hasProgress(normalizeDashboard({ ...dashboardPayload(), overall: { completedMissions: 0, totalMissions: 10, pct: 0 }, continue: null }))).toBe(false);
  });
});

describe('audit hardening: explanations come from the server, never from the page', () => {
  it('throws when a locked lab or lobby has no lockedReason', () => {
    const labs = clone(labsPayload()) as { labs: Record<string, unknown>[] };
    Object.assign(labs.labs[0]!, { state: 'locked' });
    delete labs.labs[0]!.lockedReason;
    expect(() => normalizeLabs(labs)).toThrow('lockedReason');
    const lobby = clone(lobbyPayload()) as Record<string, unknown>;
    Object.assign(lobby, { state: 'locked' });
    delete lobby.lockedReason;
    expect(() => normalizeLabLobby(lobby)).toThrow('lockedReason');
  });
  it('throws when a locked mission has no unlocksWith', () => {
    const lobby = clone(lobbyPayload()) as { missions: Record<string, unknown>[] };
    Object.assign(lobby.missions[0]!, { state: 'locked' });
    delete lobby.missions[0]!.unlocksWith;
    expect(() => normalizeLabLobby(lobby)).toThrow('unlocksWith');
  });
  it('rejects vault slots that do not match the code length', () => {
    const lobby = clone(lobbyPayload()) as { vault: { codeLength: number; slots: unknown[] } | null };
    if (lobby.vault) { lobby.vault.codeLength = lobby.vault.slots.length + 1; expect(() => normalizeLabLobby(lobby)).toThrow('slots'); }
  });
});

describe('audit hardening round 3: counts never exceed their totals', () => {
  it('rejects a dashboard with more completed missions than missions', () => {
    const bad = clone(dashboardPayload()) as { overall: { completedMissions: number; totalMissions: number } };
    bad.overall.completedMissions = bad.overall.totalMissions + 4;
    expect(() => normalizeDashboard(bad)).toThrow('completedMissions');
  });
  it('rejects a lab with more completed missions than missions', () => {
    const labs = clone(labsPayload()) as { labs: { missions: { completed: number; total: number } }[] };
    labs.labs[0]!.missions.completed = labs.labs[0]!.missions.total + 1;
    expect(() => normalizeLabs(labs)).toThrow('completed');
  });
});

describe('dashboard figures wording (R11-C-02, R11-B-06)', () => {
  const dash = (over: Record<string, unknown>) => normalizeDashboard({ ...dashboardPayload(), ...over });
  const standardLabs = (masterState: 'locked' | 'available' | 'completed') => normalizeLabs({
    labs: [
      { slug: 'hematology', name: 'Hematology Lab', discipline: 'hematology', ordinal: 1, blurb: 'x', state: 'completed', missions: { completed: 3, total: 3 }, fragments: { found: 3, total: 3 }, exited: true },
      { slug: 'microbiology', name: 'Microbiology Lab', discipline: 'microbiology', ordinal: 2, blurb: 'x', state: 'completed', missions: { completed: 3, total: 3 }, fragments: { found: 3, total: 3 }, exited: true },
      { slug: 'biochemistry', name: 'Biochemistry Lab', discipline: 'biochemistry', ordinal: 3, blurb: 'x', state: 'completed', missions: { completed: 3, total: 3 }, fragments: { found: 3, total: 3 }, exited: true },
      { slug: 'master', name: 'Master Lab', discipline: 'master', ordinal: 4, blurb: 'x', state: masterState, ...(masterState === 'locked' ? { lockedReason: 'Clear 3 labs' } : {}), missions: { completed: masterState === 'completed' ? 1 : 0, total: 1 }, fragments: { found: 0, total: 4 }, exited: masterState === 'completed' },
      { slug: 'immunology', name: 'Immunology Lab', discipline: 'immunology', ordinal: 5, blurb: 'x', state: 'coming_soon', missions: { completed: 0, total: 0 }, fragments: { found: 0, total: 0 }, exited: false },
    ],
  });
  it('says "standard" wherever the server counts only the standard missions and labs, and names the Master Lab as separate', () => {
    const figures = dashboardFigures(dash({ overall: { completedMissions: 9, totalMissions: 9, pct: 100 }, labsCompleted: 3 }), standardLabs('available'));
    expect(figures.missions.value).toBe('9 of 9');
    expect(figures.missions.detail).toBe('100% of the standard missions · The Master Lab is tracked separately');
    expect(figures.missions.detail).not.toContain('investigation map');
    expect(figures.labs.value).toBe('3 of 3');
    expect(figures.labs.detail).toBe('standard labs · 2 of 7 badges earned');
  });
  it('keeps the server figures as sent (nothing is recomputed)', () => {
    const figures = dashboardFigures(dash({ overall: { completedMissions: 4, totalMissions: 9, pct: 44 }, labsCompleted: 1 }), standardLabs('locked'));
    expect(figures.missions.value).toBe('4 of 9');
    expect(figures.missions.detail).toContain('44% of the standard missions');
    expect(figures.labs.value).toBe('1 of 3');
  });
  it('drops the denominator when the payload gives none that fits, and the Master note when there is no Master Lab', () => {
    const none = normalizeLabs({ labs: [] });
    const figures = dashboardFigures(dash({ labsCompleted: 2 }), none);
    expect(figures.labs.value).toBe('2');
    expect(figures.missions.detail).not.toContain('Master');
  });
  it('does not call everything complete while an open Master Lab is left', () => {
    const done = dash({ overall: { completedMissions: 9, totalMissions: 9, pct: 100 }, continue: null });
    expect(allInvestigationsDone(done, standardLabs('available'))).toBe(false);
    expect(allInvestigationsDone(done, standardLabs('locked'))).toBe(false);
    expect(allInvestigationsDone(done, standardLabs('completed'))).toBe(true);
    expect(allInvestigationsDone(dash({ overall: { completedMissions: 9, totalMissions: 9, pct: 100 } }), standardLabs('completed'))).toBe(false);
  });
});

describe('POST /demo/reset (R16-B-02)', () => {
  it('accepts the real reply: reset true and a profile object', () => {
    expect(normalizeDemoReset({ reset: true, profile: { settings: {} }, earnedXp: 120 })).toEqual({ reset: true });
  });
  it.each([
    ['null', null],
    ['an empty object', {}],
    ['a string', 'ok'],
    ['an array', []],
    ['reset false', { reset: false, profile: {} }],
    ['reset as a string', { reset: 'true', profile: {} }],
    ['no profile', { reset: true }],
    ['a profile that is not an object', { reset: true, profile: 'x' }],
  ])('rejects %s', (_label, payload) => {
    expect(() => normalizeDemoReset(payload)).toThrow(/Invalid server demo reset payload/);
  });
});
