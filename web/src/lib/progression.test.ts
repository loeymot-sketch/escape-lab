import { describe, expect, it } from 'vitest';
import { badgesPayload, boardPayload, clone, labResultPayload, vaultPayload } from './fixtures';
import { describeBoard, normalizeBadges, normalizeLabResult, normalizeLeaderboard, normalizeVault } from './progression';

describe('lab results', () => {
  it('reads server figures, keeping null for missions that were never completed', () => {
    const r = normalizeLabResult(labResultPayload());
    expect(r).toMatchObject({ xp: 480, stats: { accuracyPct: 87, elapsed: '10:00', hintsUsed: 1, wrongAnswers: 2, missions: 3 }, badge: { name: 'Hematology Detective' } });
    expect(r.missions[1]).toMatchObject({ score: null, accuracyPct: null, elapsed: null });
    expect(r.ledger[0]).toMatchObject({ label: 'Base mission', points: 300, kind: 'earned' });
  });
  it('accepts a null accuracy but never a missing one', () => {
    const none = labResultPayload();
    none.stats.accuracyPct = null as unknown as number;
    expect(normalizeLabResult(none).stats.accuracyPct).toBeNull();
    const missing = clone(labResultPayload()) as { stats: Record<string, unknown> };
    delete missing.stats.accuracyPct;
    expect(() => normalizeLabResult(missing)).toThrow('accuracyPct');
  });
  it.each(['xp', 'stats', 'missions', 'ledger', 'badge', 'lab', 'competencies', 'strongest', 'improvement'])('throws without %s', (field) => {
    const bad = clone(labResultPayload()) as Record<string, unknown>;
    delete bad[field];
    expect(() => normalizeLabResult(bad)).toThrow();
  });
  it('throws on a malformed ledger kind', () => {
    const bad = labResultPayload();
    bad.ledger[0]!.kind = 'bonus';
    expect(() => normalizeLabResult(bad)).toThrow('ledger.kind');
  });
});

describe('vault and badges', () => {
  it('reads fragment slots with null for undiscovered digits', () => {
    expect(normalizeVault(vaultPayload())[0]).toMatchObject({ labSlug: 'hematology', slots: [7, 4, null], complete: false, exited: false });
  });
  it('does not coerce missing flags to false', () => {
    const noComplete = clone(vaultPayload());
    delete (noComplete.vaults[0] as Record<string, unknown>).complete;
    expect(() => normalizeVault(noComplete)).toThrow('complete');
    const noExit = clone(vaultPayload());
    delete (noExit.vaults[0] as Record<string, unknown>).exited;
    expect(() => normalizeVault(noExit)).toThrow('exited');
    const stringy = vaultPayload();
    (stringy.vaults[0] as Record<string, unknown>).complete = 'true';
    expect(() => normalizeVault(stringy)).toThrow('complete');
    expect(() => normalizeVault({})).toThrow('vaults');
  });
  it('reads badges and refuses a missing earned flag', () => {
    expect(normalizeBadges(badgesPayload()).map((b) => b.earned)).toEqual([true, false]);
    const bad = clone(badgesPayload());
    delete (bad.badges[0] as Record<string, unknown>).earned;
    expect(() => normalizeBadges(bad)).toThrow('earned');
  });
});

describe('leaderboard', () => {
  it('reads rows, the learner own row and the total', () => {
    const board = normalizeLeaderboard(boardPayload());
    expect(board.rows[0]).toMatchObject({ rank: 1, name: 'Inès M.', you: false });
    expect(board.me).toMatchObject({ rank: 30, you: true });
    expect(board.total).toBe(38);
  });
  it('accepts a null me but requires the key, the total and the you flag', () => {
    expect(normalizeLeaderboard({ ...boardPayload(), me: null }).me).toBeNull();
    for (const field of ['me', 'total', 'rows', 'cohortAvailable']) {
      const bad = clone(boardPayload()) as Record<string, unknown>;
      delete bad[field];
      expect(() => normalizeLeaderboard(bad)).toThrow();
    }
    const noYou = clone(boardPayload());
    delete (noYou.rows[0] as Record<string, unknown>).you;
    expect(() => normalizeLeaderboard(noYou)).toThrow('you');
  });
});

describe('leaderboard payload consistency (R14-B-05)', () => {
  const row = (rank: number, xp: number, extra: Record<string, unknown> = {}) => ({ rank, name: `S${rank}`, xp, labs: 1, accuracyPct: 50, you: false, ...extra });
  const mine = (rank: number, xp: number, extra: Record<string, unknown> = {}) => ({ rank, name: 'Me', xp, labs: 0, accuracyPct: null, you: true, ...extra });
  const make = (patch: Record<string, unknown>) => ({ scope: 'all', cohort: 'class', cohortAvailable: true, total: 3, rows: [row(1, 30), row(2, 20), row(3, 10)], me: mine(4, 0), ...patch });
  it('accepts what the real server sends: ties, a viewer inside the list, an unranked viewer at total + 1, a class nobody has joined', () => {
    expect(() => normalizeLeaderboard(make({}))).not.toThrow();
    expect(() => normalizeLeaderboard(make({ rows: [row(1, 30), row(1, 30), row(3, 10)] }))).not.toThrow();
    expect(() => normalizeLeaderboard(make({ rows: [row(1, 30), row(2, 20, { you: true }), row(3, 10)], me: mine(2, 20) }))).not.toThrow();
    expect(() => normalizeLeaderboard(make({ rows: [], total: 0, cohortAvailable: false, me: mine(1, 400) }))).not.toThrow();
    expect(() => normalizeLeaderboard(make({ rows: [], total: 0, me: mine(1, 0) }))).not.toThrow();
    expect(() => normalizeLeaderboard(make({ total: 50, me: mine(40, 3) }))).not.toThrow();
  });
  const bad: Array<[string, Record<string, unknown>]> = [
    ['total 0 with rows', { total: 0 }],
    ['rows empty but students are ranked', { rows: [], total: 5 }],
    ['more rows than students', { total: 2 }],
    ['rank 0', { rows: [row(0, 30), row(2, 20), row(3, 10)] }],
    ['negative rank', { rows: [row(-1, 30), row(2, 20), row(3, 10)] }],
    ['fractional xp', { rows: [row(1, 30.5), row(2, 20), row(3, 10)] }],
    ['negative xp', { rows: [row(1, 30), row(2, 20), row(3, -10)] }],
    ['unsafe xp', { rows: [row(1, 1e21), row(2, 20), row(3, 10)] }],
    ['fractional total', { total: 3.5 }],
    ['unsafe total', { total: 1e21 }],
    ['fractional labs', { rows: [row(1, 30, { labs: 1.5 }), row(2, 20), row(3, 10)] }],
    ['viewer rank beyond total + 1', { me: mine(5, 0) }],
    ['viewer rank 0', { me: mine(0, 5) }],
    ['viewer fractional xp', { me: mine(4, 0.5) }],
    ['first rank is not 1', { rows: [row(2, 30), row(3, 20), row(3, 10)] }],
    ['ranks out of order', { rows: [row(1, 30), row(3, 20), row(2, 10)] }],
    ['a rank beyond its position', { rows: [row(1, 30), row(3, 20), row(3, 10)] }],
    ['a tie with different XP', { rows: [row(1, 30), row(1, 20), row(3, 10)] }],
    ['a lower rank with the same XP', { rows: [row(1, 30), row(2, 30), row(3, 10)] }],
    ['XP rising down the list', { rows: [row(1, 10), row(2, 20), row(3, 30)] }],
  ];
  it.each(bad)('rejects %s', (_label, patch) => {
    expect(() => normalizeLeaderboard(make(patch))).toThrow('Invalid server leaderboard payload');
  });
});

describe('lab results: competencies and the Master Lab', () => {
  it('reads competency percentages, the strongest area and the improvement advice', () => {
    const r = normalizeLabResult(labResultPayload());
    expect(r.competencies.items[0]).toEqual({ name: 'Hematology interpretation', pct: 92, steps: 4 });
    expect(r.competencies.strongest).toBe('Hematology interpretation');
    expect(r.competencies.improvement).toMatchObject({ name: 'Pre-analytical quality' });
  });
  it('accepts null strongest/improvement (a lab with one competency) but not a malformed competency', () => {
    const r = normalizeLabResult({ ...labResultPayload(), strongest: null, improvement: null, competencies: [] });
    expect(r.competencies).toEqual({ items: [], strongest: null, improvement: null });
    const bad = labResultPayload();
    delete (bad.competencies[0] as Record<string, unknown>).pct;
    expect(() => normalizeLabResult(bad)).toThrow('competency.pct');
  });
  it('reads the Master Lab payload (one mission, the Clinical Detective badge) like any other lab', () => {
    const master = {
      ...labResultPayload(),
      lab: { slug: 'master', name: 'Master Lab', discipline: 'master', blurb: 'x' },
      xp: 520,
      stats: { accuracyPct: 100, elapsedSec: 300, elapsed: '05:00', hintsUsed: 0, wrongAnswers: 0, missions: 1 },
      missions: [{ id: 'master-01', ordinal: 1, title: 'The Whole Patient', score: 520, maxScore: 520, accuracyPct: 100, elapsed: '05:00', hintsUsed: 0 }],
      badge: { id: 'clinical-detective', name: 'Clinical Detective', description: 'Escape the Master Lab.', lab: 'master' },
    };
    const r = normalizeLabResult(master);
    expect(r.lab.slug).toBe('master');
    expect(r.missions).toHaveLength(1);
    expect(r.badge).toEqual({ id: 'clinical-detective', name: 'Clinical Detective' });
  });
});

describe('leaderboard presentation', () => {
  const board = (patch: Record<string, unknown>) => normalizeLeaderboard({ ...boardPayload(), ...patch });
  it('says nothing numeric when the learner has no cohort', () => {
    const view = describeBoard(board({ rows: [], total: 0, cohortAvailable: false, me: { rank: 1, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true } }));
    expect(view).toEqual({ kind: 'unavailable' });
  });
  it('R13-C-02: a cohort that exists but where nobody has XP yet is NOT reported as "not set up"', () => {
    expect(describeBoard(board({ rows: [], total: 0, me: null }))).toEqual({ kind: 'nobody' });
    expect(describeBoard(board({ rows: [], total: 0, me: { rank: 1, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true } }))).toEqual({ kind: 'nobody' });
  });
  it('shows the learner row after a real gap, with a true count', () => {
    const view = describeBoard(board({}));
    expect(view).toEqual({ kind: 'ranked', showMe: true, gap: true, unranked: false, count: 'Showing 2 of 38 ranked students.' });
  });
  it('shows no gap row when the learner is the next rank, and none when already listed', () => {
    const next = describeBoard(board({ me: { rank: 2, name: 'Me', xp: 1, labs: 0, accuracyPct: null, you: true }, total: 2 }));
    expect(next).toMatchObject({ showMe: true, gap: false, count: 'Showing 2 of 2 ranked students.' });
    const listed = describeBoard(board({ rows: [{ rank: 1, name: 'Me', xp: 5, labs: 0, accuracyPct: null, you: true }], me: { rank: 1, name: 'Me', xp: 5, labs: 0, accuracyPct: null, you: true }, total: 1 }));
    expect(listed).toMatchObject({ showMe: false, gap: false, count: 'Showing 1 of 1 ranked student.' });
  });
  it('drops the count rather than print arithmetic that is false', () => {
    // R13-C-01: a viewer ranked beyond the total is unranked, so they no longer push the numerator past it
    // (R14-B-05: more rows than the total is no longer a count to hide: the payload is refused, see the normalizer tests below)
    expect(describeBoard(board({ total: 1, me: { rank: 2, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true } }))).toMatchObject({ kind: 'ranked', unranked: true, count: 'Showing 1 of 1 ranked student.' });
  });
  const me = (rank: number, xp: number) => ({ rank, name: 'Me', xp, labs: 0, accuracyPct: null, you: true });
  const rows = (n: number, youAt = -1) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: `S${i + 1}`, xp: 100 - i, labs: 1, accuracyPct: 50, you: i === youAt }));
  it('R13-C-01: an unranked viewer (0 XP, rank = total + 1) is flagged, gets no gap row and is not counted as ranked', () => {
    const view = describeBoard(board({ rows: rows(20), total: 23, me: me(24, 0) }));
    expect(view).toEqual({ kind: 'ranked', showMe: true, gap: false, unranked: true, count: 'Showing 20 of 23 ranked students.' });
  });
  it('R13-C-01: an unranked viewer in a small class (rank 3 of 2 ranked) is still unranked and the line stays true', () => {
    expect(describeBoard(board({ rows: rows(2), total: 2, me: me(3, 0) }))).toEqual({ kind: 'ranked', showMe: true, gap: false, unranked: true, count: 'Showing 2 of 2 ranked students.' });
  });
  it('R13-C-01: a viewer with 0 XP is unranked even if the rank looks plausible; one with XP and a rank beyond the total is too', () => {
    expect(describeBoard(board({ rows: rows(3), total: 10, me: me(4, 0) }))).toMatchObject({ unranked: true, gap: false });
    expect(describeBoard(board({ rows: rows(3), total: 3, me: me(4, 5) }))).toMatchObject({ unranked: true });
  });
  it('R13-C-01: ranked viewers keep a correct line: top (listed), middle (gap), last, ties and the page-limit edge', () => {
    // listed at the top
    expect(describeBoard(board({ rows: rows(20, 0), total: 23, me: me(1, 99) }))).toEqual({ kind: 'ranked', showMe: false, gap: false, unranked: false, count: 'Showing 20 of 23 ranked students.' });
    // ranked after a real gap
    expect(describeBoard(board({ rows: rows(20), total: 23, me: me(22, 4) }))).toEqual({ kind: 'ranked', showMe: true, gap: true, unranked: false, count: 'Showing 21 of 23 ranked students.' });
    // last ranked student, directly after the page limit
    expect(describeBoard(board({ rows: rows(20), total: 21, me: me(21, 4) }))).toEqual({ kind: 'ranked', showMe: true, gap: false, unranked: false, count: 'Showing 21 of 21 ranked students.' });
    // tied with the last listed row: rank 20, not listed, no gap
    expect(describeBoard(board({ rows: rows(20), total: 25, me: me(20, 4) }))).toMatchObject({ showMe: true, gap: false, unranked: false, count: 'Showing 21 of 25 ranked students.' });
  });
});
