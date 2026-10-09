/** Complete, valid server payloads shared by the normalizer tests. Tests mutate copies to prove each field is required. */
export const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const base = {
  attemptId: 'attempt-42',
  status: 'in_progress',
  expired: false,
  remainingSec: 200,
  mission: { id: 'hem-03', title: 'Anemia Detective', labSlug: 'hematology', engine: 'stepper', difficulty: 'Intermediate', steps: 3 },
  startedAt: 1_700_000_000_000,
  elapsedSec: 40,
  timeLimitSec: 240,
  stepsSolved: 1,
  wrongTotal: 2,
  hintsUsed: 1,
  penaltyXp: -35,
};
const common = { ordinal: 2, of: 3, prompt: 'Which diagnosis fits best?', values: [], hintsAvailable: 2, wrongOnStep: 0, hintsOnStep: 0, hintsGiven: [] };
const options = [{ id: 'A', label: 'First' }, { id: 'B', label: 'Second' }];

export const steps = {
  point: { ...common, id: 'p1', kind: 'point', image: { asset: 'smear-schistocyte-01', caption: 'A caption' } },
  choice: { ...common, id: 'c1', kind: 'choice', options },
  decision: { ...common, id: 'd1', kind: 'decision', options: [{ id: 'accept', label: 'Accept' }, { id: 'reject', label: 'Reject' }], sample: { id: 'S1', label: 'Tube' } },
  order: { ...common, id: 'o1', kind: 'order', items: [{ id: 'x', label: 'One' }, { id: 'y', label: 'Two' }] },
  match: { ...common, id: 'm1', kind: 'match', left: [{ id: 'l1', label: 'Left one' }], right: [{ id: 'r1', label: 'Right one' }] },
};

export const revealed = [
  { name: 'Hb', value: '8.9', unit: 'g/dL', ref: '12.0-15.5', flag: 'L' },
  { name: 'pH', value: '7.28', unit: '', ref: '7.35-7.45', flag: 'L' },
  { name: 'Na', value: '140', unit: 'mmol/L' },
];

export const attemptView = (step: unknown = steps.choice) => ({ ...base, step, revealed });
export const completedView = () => ({ ...base, status: 'completed', remainingSec: null, stepsSolved: 3, step: null, revealed: [] });
export const expiredView = () => ({ ...base, status: 'expired', expired: true, remainingSec: 0, step: steps.choice, revealed });

export const resultPayload = () => ({
  attemptId: 'attempt-42',
  mission: { id: 'hem-03', title: 'Anemia Detective', labSlug: 'hematology' },
  score: 168, maxScore: 180, xpAwarded: 168, totalXp: 168, newBest: true,
  ledger: [{ id: 'base', label: 'Base mission', reason: 'Mission completed', points: 100, kind: 'earned' }, { id: 'wrong', label: 'Wrong attempt', reason: '1 x -10 XP', points: -10, kind: 'penalty' }],
  stats: { accuracyPct: 75, elapsedSec: 90, elapsed: '01:30', hintsUsed: 0, wrongAnswers: 1, firstTrySteps: 2, steps: 3 },
  newBadges: [{ id: 'no-hint', name: 'No Hint', description: 'Complete a mission without using a hint.', lab: null }],
});

export const wrongAnswer = () => ({
  correct: false,
  feedback: { verdict: 'Incorrect', message: 'Not quite. Look for fragments, not whole cells.' },
  progress: { correct: 1, total: 2 },
  penaltyXp: -10,
  attempt: attemptView(),
});
export const rightAnswer = () => ({
  correct: true,
  feedback: { verdict: 'Correct', message: 'Correct. Schistocytes are fragments.' },
  fragment: { labSlug: 'hematology', position: 1, digit: 7 },
  completed: false,
  attempt: attemptView(steps.order),
});
export const finalAnswer = () => ({
  correct: true,
  feedback: { verdict: 'Correct', message: 'Correct. Done.' },
  fragment: null,
  completed: true,
  result: resultPayload(),
  attempt: completedView(),
});
export const hintReply = () => ({ hint: 'Compare the reference interval first.', source: 'standard', level: 1, remaining: 1, penaltyXp: -15, attempt: attemptView() });

export const mePayload = () => ({ id: 7, name: 'Test Learner', email: 'a@b.test', role: 'student', language: 'en', createdAt: 1, xp: 8240, level: 6, into: 10, size: 100, nextLevelAt: 9000 });
export const dashboardPayload = () => ({
  user: { name: 'Test Learner', level: 6, xp: 8240, levelProgress: { into: 10, size: 100 } },
  overall: { completedMissions: 5, totalMissions: 9, pct: 56 },
  streakDays: 3, labsCompleted: 1,
  continue: { kind: 'mission', missionId: 'mic-03', labSlug: 'microbiology', title: 'Petri Dish Mystery', resume: false },
  labs: [], badges: { earned: 2, total: 7 }, recentAchievements: [],
  recommended: { missionId: 'bio-01', labSlug: 'biochemistry', title: 'Organ Rescue Mission', reason: 'Next mission in an open lab.' },
});
export const labsPayload = () => ({
  labs: [
    { slug: 'hematology', name: 'Hematology Lab', discipline: 'hematology', ordinal: 1, blurb: 'Blood cells.', state: 'completed', missions: { completed: 3, total: 3 }, fragments: { found: 3, total: 3 }, exited: true },
    { slug: 'master', name: 'Master Lab', discipline: 'master', ordinal: 4, blurb: 'Integrate.', state: 'locked', lockedReason: 'Clear 3 labs (1 of 3 cleared)', missions: { completed: 0, total: 1 }, fragments: { found: 0, total: 4 }, exited: false },
    { slug: 'immunology', name: 'Immunology Lab', discipline: 'immunology', ordinal: 5, blurb: 'Coming soon.', state: 'coming_soon', missions: { completed: 0, total: 0 }, fragments: { found: 0, total: 0 }, exited: false },
  ],
});
export const lobbyPayload = () => ({
  lab: { slug: 'hematology', name: 'Hematology Lab', discipline: 'hematology', blurb: 'Blood cells.' },
  state: 'completed',
  missions: [
    { id: 'hem-01', ordinal: 1, title: 'Blood Smear Code', engine: 'image_identify', difficulty: 'Foundation', estMinutes: 4, state: 'completed', bestScore: 168, maxScore: 180, inProgress: false },
    { id: 'hem-02', ordinal: 2, title: 'Fix the Sample', engine: 'decision', difficulty: 'Foundation', estMinutes: 6, state: 'locked', unlocksWith: 'Complete mission 01 to unlock', bestScore: null, maxScore: 180, inProgress: false },
  ],
  vault: { labSlug: 'hematology', codeLength: 3, slots: [7, null, 2], complete: false, exited: false },
});

export const labResultPayload = () => ({
  lab: { slug: 'hematology', name: 'Hematology Lab', discipline: 'hematology', blurb: 'x' },
  escaped: true, codeDigits: [7, 4, 2], xp: 480,
  stats: { accuracyPct: 87, elapsedSec: 600, elapsed: '10:00', hintsUsed: 1, wrongAnswers: 2, missions: 3 },
  missions: [{ id: 'hem-01', ordinal: 1, title: 'Blood Smear Code', score: 168, maxScore: 180, accuracyPct: 100, elapsed: '01:00', hintsUsed: 0 }, { id: 'hem-02', ordinal: 2, title: 'Fix the Sample', score: null, maxScore: 180, accuracyPct: null, elapsed: null, hintsUsed: 0 }],
  ledger: [{ id: 'base', label: 'Base mission', reason: '3 missions completed', points: 300, kind: 'earned' }],
  competencies: [{ name: 'Hematology interpretation', pct: 92, steps: 4 }, { name: 'Pre-analytical quality', pct: 74, steps: 3 }], strongest: 'Hematology interpretation', improvement: { name: 'Pre-analytical quality', advice: 'Pre-analytical quality: revisit specimen rejection criteria and common interferences.' },
  badge: { id: 'hematology-detective', name: 'Hematology Detective', description: 'x', lab: 'hematology' },
});
export const vaultPayload = () => ({ vaults: [{ labSlug: 'hematology', codeLength: 3, slots: [7, 4, null], complete: false, exited: false }] });
export const badgesPayload = () => ({ badges: [{ id: 'first-escape', name: 'First Escape', description: 'Open your first lab exit.', lab: null, earned: true, earnedAt: 5 }, { id: 'no-hint', name: 'No Hint', description: 'x', lab: null, earned: false, earnedAt: null }] });
export const boardPayload = () => ({
  scope: 'all', cohort: 'class', cohortAvailable: true, total: 38,
  rows: [{ rank: 1, name: 'Inès M.', xp: 11980, labs: 3, accuracyPct: 94, you: false }],
  me: { rank: 30, name: 'Test L.', xp: 8240, labs: 1, accuracyPct: 87, you: true },
});

export const classesPayload = () => ({ classes: [{ id: 1, name: 'L3 Biomedical Sciences', joinCode: 'ABC123', students: 38 }] });
export const analyticsPayload = () => ({
  class: { id: 1, name: 'L3 Biomedical Sciences' },
  cohort: { students: 38, activeStudents: 30, needsAttention: 4, avgAccuracyPct: 80, avgCompletionPct: 62, avgXp: 5000, avgMissionsCompleted: 5, labsEscaped: 20 },
  missions: [{ missionId: 'bio-03', title: 'Acid-Base Emergency', labSlug: 'biochemistry', studentsStarted: 20, studentsCompleted: 17, successPct: 59, needsAttention: true }, { missionId: 'hem-01', title: 'Blood Smear Code', labSlug: 'hematology', studentsStarted: 38, studentsCompleted: 38, successPct: null, needsAttention: false }],
  roster: [],
});
export const rosterPayload = () => ({ class: { id: 1, name: 'L3' }, total: 38, students: [{ id: 5, name: 'Inès Moreau', xp: 11980, level: 7, accuracyPct: 94, progressPct: 100, needsAttention: false, attentionReason: null }] });
export const studentDetailPayload = () => ({
  class: { id: 1, name: 'L3' },
  student: { id: 5, name: 'Inès Moreau', xp: 11980, level: 7, missionsCompleted: 4, accuracyPct: 94, progressPct: 100, hintsUsed: 2, needsAttention: false, attentionReason: null },
  labs: [{ slug: 'hematology', name: 'Hematology Lab', completed: 3, total: 3, accuracyPct: 97, escaped: true }, { slug: 'microbiology', name: 'Microbiology Lab', completed: 1, total: 3, accuracyPct: null, escaped: false }],
  competencies: [{ name: 'Hematology interpretation', pct: 95, steps: 4 }, { name: 'Clinical biochemistry', pct: 61, steps: 2 }], strongest: 'Hematology interpretation', improvement: { name: 'Clinical biochemistry', advice: 'Clinical biochemistry: revisit reference ranges, interference and acid-base steps.' },
  history: [{ missionId: 'hem-01', title: 'Blood Smear Code', labSlug: 'hematology', score: 168, accuracyPct: 100, answersSubmitted: 1, wrongAnswers: 0, hintsUsed: 0, elapsed: '01:00', completedAt: 5 }],
});
