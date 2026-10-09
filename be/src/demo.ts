// Demo data for presentations: Alex Martin (student), Dr. Claire Moreau (teacher) and a class of 38.
//
// Every number shown in the design is produced here by playing the real game with a controlled
// clock, so the demo is exactly what the rules would give. Nothing is written to the score tables
// by hand. The only artificial value is `xp_carry`: the brief's persona has 8,240 XP and level 6,
// which the nine missions alone cannot reach (they are worth 1,620 XP), so the difference is
// recorded as XP carried over from earlier content and shown as such.
import { hashPassword } from './auth.ts';
import { MISSIONS, MISSION_BY_ID, exitCode, missionsOf } from './content.ts';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { DEMO_TEACHER_NAME, Game, reviewerLabel } from './game.ts';
import { forbidden } from './http.ts';
import type { Step } from './types.ts';

export const DEMO_STUDENT_EMAIL = 'alex.martin@demo.escape-lab.app';
export const DEMO_TEACHER_EMAIL = 'claire.moreau@demo.escape-lab.app';
export const DEMO_PASSWORD = 'demo-password-1';
/** Every seeded account lives on this domain, so it cannot be registered; with DEMO_MODE off the accounts seedDemo created (users.is_demo_account) cannot sign in. */
export const DEMO_EMAIL_DOMAIN = '@demo.escape-lab.app';
export const isDemoEmail = (email: string) => email.trim().toLowerCase().endsWith(DEMO_EMAIL_DOMAIN);
export const DEMO_CLASS_NAME = 'L3 Biomedical Sciences';
const DAY = 86_400_000;
const HOUR = 3_600_000;

// ------------------------------------------------------------------ responses
function good(step: Step): unknown {
  const k = step.key;
  switch (k.kind) {
    case 'choice': return { choice: k.answer };
    case 'decision': return { decision: k.answer };
    case 'point': return { x: k.x, y: k.y };
    case 'order': return { order: k.order };
    case 'match': return { pairs: k.pairs };
  }
}
function bad(step: Step): unknown {
  const k = step.key;
  switch (k.kind) {
    case 'choice': return { choice: step.data.options!.find((o) => o.id !== k.answer)!.id };
    case 'decision': return { decision: (step.data.options ?? [{ id: 'accept' }, { id: 'reject' }, { id: 'repeat' }]).map((o) => o.id).find((i) => i !== k.answer) };
    case 'point': return { x: (k.x + 50) % 100, y: (k.y + 50) % 100 };
    case 'order': { const o = [...k.order]; [o[0], o[1]] = [o[1]!, o[0]!]; return { order: o }; }
    case 'match': { const l = Object.keys(k.pairs); const r = l.map((x) => k.pairs[x]!); return { pairs: Object.fromEntries(l.map((x, i) => [x, r[(i + 1) % r.length]!])) }; }
  }
}

// -------------------------------------------------------------------- random
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------- the plan
export interface Cell { mission: string; wrong: number; wrongStep: number; hints: number; hintStep: number; elapsed: number; at: number }
interface PlanStudent { name: string; email: string; target: number; completions: number; lastActiveDaysAgo: number; carryXp?: number; cells: Cell[] }

/** The standard missions in play order. */
const ORDER = ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'mic-03', 'bio-01', 'bio-02', 'bio-03'];
const STEPS = Object.fromEntries(ORDER.map((id) => [id, MISSION_BY_ID.get(id)!.steps.length])) as Record<string, number>;
const accOf = (id: string, wrong: number) => STEPS[id]! / (STEPS[id]! + wrong);

/** Students who completed mission k (cumulative), first-attempt-clean counts, average seconds and total hints per mission. */
const COMPLETED = [38, 36, 33, 32, 29, 26, 21, 19, 17];
/** Class accuracy per mission: the design's "success" column. Acid-Base Emergency is the hardest at 59%. */
const COL_TARGET = [92, 88, 68, 74, 64, 74, 71, 80, 59];
const AVG_SEC = [160, 190, 390, 310, 200, 250, 410, 170, 500];
const AVG_HINTS = [0.1, 0.2, 0.9, 0.6, 0.8, 0.5, 0.8, 0.4, 1.2];

/** Named roster from the design: [name, target accuracy %, missions completed, last active days ago, total XP]. */
const NAMED: [string, number, number, number, number][] = [
  ['Inès Moreau', 94, 9, 0, 11980], ['Hugo Lambert', 92, 9, 0, 10410], ['Sana Benali', 89, 7, 1, 9120],
  ['Théo Girard', 85, 7, 2, 7960], ['Lina Roussel', 78, 4, 3, 7310], ['Karim Haddad', 61, 3, 12, 6540], ['Marie Dubois', 55, 2, 15, 5890],
];
const OTHERS = ['Amine Rahmani', 'Sofia Bennett', 'Yanis Kader', 'Camille Laurent', 'Nora El Idrissi', 'Lucas Fontaine', 'Maya Aziz', 'Adam Chevalier', 'Léa Marchand', 'Omar Belkacem',
  'Chloé Petit', 'Rayan Mansouri', 'Emma Rousseau', 'Ilyes Cherif', 'Jade Garnier', 'Samir Toumi', 'Manon Lefèvre', 'Nassim Aouad', 'Zoé Bertrand', 'Mehdi Salhi',
  'Alice Fournier', 'Anis Ferhat', 'Louise Perrin', 'Walid Meziane', 'Eva Colin', 'Bilal Hamidi', 'Clara Vidal', 'Sami Ouali', 'Julie Renard', 'Tarek Zerrouki'];
/** Completions left for the 30 generated students once the named ones (and Alex, 5) are accounted for. */
const OTHER_COMPLETIONS = [1, 1, 2, 2, 4, 4, 5, 5, 6, 6, 6, 6, 6, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');

/** Alex Martin, exactly as in the design. Scores: 168, 180, 87 and 125, 172; accuracy 87%; 02:43 per mission; one hint. */
export function alexPlan(base: number): Cell[] {
  const dayStart = Math.floor(base / DAY) * DAY;
  const today = dayStart + Math.max(60_000, Math.floor((base - dayStart) / 2));
  const at = (daysAgo: number, hours: number) => dayStart - daysAgo * DAY + hours * HOUR;
  return [
    { mission: 'hem-01', wrong: 0, wrongStep: 0, hints: 0, hintStep: 0, elapsed: 132, at: at(5, 10) },
    { mission: 'hem-02', wrong: 0, wrongStep: 0, hints: 0, hintStep: 0, elapsed: 80, at: at(4, 10) },
    { mission: 'hem-03', wrong: 1, wrongStep: 2, hints: 1, hintStep: 2, elapsed: 336, at: at(3, 11) },
    { mission: 'hem-01', wrong: 0, wrongStep: 0, hints: 0, hintStep: 0, elapsed: 200, at: at(2, 9) }, // a slower replay: keeps the streak, never lowers the best score
    { mission: 'mic-01', wrong: 2, wrongStep: 0, hints: 0, hintStep: 0, elapsed: 158, at: at(1, 14) },
    { mission: 'mic-02', wrong: 0, wrongStep: 0, hints: 0, hintStep: 0, elapsed: 108, at: today },
  ];
}
export const ALEX_TARGET_XP = 8240;

/**
 * The 37 other students. Pure and deterministic: it returns the plan and the metrics it will
 * produce, so tests (and the seed loop below) can check them before anything is played.
 */
export function classPlan(base: number, seed: number): { students: PlanStudent[]; metrics: ReturnType<typeof planMetrics> } {
  const rand = rng(seed);
  const dayStart = Math.floor(base / DAY) * DAY;
  type Row = { name: string; target: number; c: number; days: number; carry?: number; named: boolean; alex: boolean };
  const rows: Row[] = NAMED.map(([name, target, c, days, xp]) => ({ name, target, c, days, carry: xp, named: true, alex: false }));
  rows.push({ name: 'Alex Martin', target: 87, c: 5, days: 0, carry: ALEX_TARGET_XP, named: true, alex: true });
  // Generated students: targets drawn per completion level, inactive ones fixed below.
  const inactiveDays = [8, 9, 10, 11, 14];
  const inactivePick = [0, 2, 4, 15, 16]; // indices in OTHER_COMPLETIONS: three unfinished (c=1,2,4) and two finishers (c=9)
  const days = (i: number) => { const k = inactivePick.indexOf(i); return k >= 0 ? inactiveDays[k]! : Math.floor(rand() * 7); };
  OTHERS.forEach((name, i) => {
    const c = OTHER_COMPLETIONS[i]!;
    const target = Math.round(68 + rand() * 28 + (c >= 8 ? 3 : 0));
    rows.push({ name, target: Math.min(97, target), c, days: days(i), named: false, alex: false });
  });

  // Wrong answers per cell, searched so that (1) every named student's accuracy, (2) every mission's class
  // accuracy (the design's "success" column) and (3) the class mean (81%) all round to the design's figures.
  const alexIdx = rows.findIndex((r) => r.alex);
  const alexFirst = new Map(alexPlan(base).filter((c, i, a) => a.findIndex((x) => x.mission === c.mission) === i).map((c) => [c.mission, c]));
  const W: number[][] = rows.map((r, i) => ORDER.slice(0, r.c).map((id, k) => (i === alexIdx ? alexFirst.get(id)!.wrong : rand() < 0.45 ? 1 + Math.floor(rand() * 3) : 0)));
  const cellAcc = (k: number, w: number) => STEPS[ORDER[k]!]! / (STEPS[ORDER[k]!]! + w);
  const rowSum = rows.map((_, i) => W[i]!.reduce((a, w, k) => a + cellAcc(k, w), 0));
  const colSum = ORDER.map((_, k) => W.reduce((a, ws, i) => a + (k < ws.length ? cellAcc(k, ws[k]!) : 0), 0));
  const colN = ORDER.map((_, k) => rows.filter((r) => r.c > k).length);
  const loss = () => {
    let L = 0; let coh = 0;
    rows.forEach((r, i) => {
      const m = (100 * rowSum[i]!) / r.c; coh += m;
      if (r.named) L += 400 * (m - r.target) ** 2;
      else if (!(r.days >= 7 && r.c < 9) && m < 66) L += 60 * (66 - m) ** 2;
    });
    ORDER.forEach((_, k) => { L += 40 * ((100 * colSum[k]!) / colN[k]! - COL_TARGET[k]!) ** 2; });
    L += 3000 * Math.max(0, 80.8 - coh / rows.length) ** 2 + 3000 * Math.max(0, coh / rows.length - 81.2) ** 2;
    return L;
  };
  let cur = loss();
  const free: [number, number][] = [];
  rows.forEach((r, i) => { if (i !== alexIdx) for (let k = 0; k < r.c; k++) free.push([i, k]); });
  const ITER = 300_000;
  for (let it = 0; it < ITER; it++) {
    const temp = 40 * (1 - it / ITER) ** 3 + 0.02;
    const [i, k] = free[Math.floor(rand() * free.length)]!;
    const old = W[i]![k]!; const nw = Math.max(0, Math.min(4, old + (rand() < 0.5 ? -1 : 1)));
    if (nw === old) continue;
    const d = cellAcc(k, nw) - cellAcc(k, old);
    rowSum[i]! += d; colSum[k]! += d; W[i]![k] = nw;
    const next = loss();
    if (next <= cur || rand() < Math.exp((cur - next) / temp)) cur = next;
    else { rowSum[i]! -= d; colSum[k]! -= d; W[i]![k] = old; }
  }

  const students: PlanStudent[] = [];
  rows.forEach((r, i) => {
    const email = r.alex ? DEMO_STUDENT_EMAIL : `${slug(r.name)}@demo.escape-lab.app`;
    if (r.alex) { students.push({ name: r.name, email, target: r.target, completions: r.c, lastActiveDaysAgo: 0, carryXp: r.carry, cells: alexPlan(base) }); return; }
    const lastAt = dayStart - r.days * DAY + (r.days === 0 ? Math.floor((base - dayStart) / 2) : (8 + Math.floor(rand() * 10)) * HOUR);
    const cells: Cell[] = ORDER.slice(0, r.c).map((id, k) => {
      const wrong = W[i]![k]!;
      const jitter = 0.7 + rand() * 0.6;
      const elapsed = Math.max(40, Math.min(MISSION_BY_ID.get(id)!.timeLimitSec - 20, Math.round(AVG_SEC[k]! * jitter * (wrong ? 1.15 : 1))));
      const steps = STEPS[id]!;
      return { mission: id, wrong, wrongStep: Math.min(steps - 1, Math.floor(rand() * steps)), hints: 0, hintStep: 0, elapsed, at: 0 };
    });
    // Timestamps: the last mission finishes at lastAt, earlier ones every 3 to 20 hours before it.
    let t = lastAt;
    for (let k = cells.length - 1; k >= 0; k--) { cells[k]!.at = t; t -= (3 + Math.floor(rand() * 17)) * HOUR; }
    students.push({ name: r.name, email, target: r.target, completions: r.c, lastActiveDaysAgo: r.days, carryXp: r.carry, cells });
  });

  // Hints: totals per mission from the design, spread over random attempts (never Alex's, never more than 2 per attempt).
  ORDER.forEach((id, k) => {
    const pool = students.filter((s) => s.email !== DEMO_STUDENT_EMAIL).flatMap((s) => s.cells.filter((c) => c.mission === id));
    const alexHints = alexPlan(base).filter((c) => c.mission === id).reduce((a, c) => a + c.hints, 0);
    let left = Math.max(0, Math.round(AVG_HINTS[k]! * COMPLETED[k]!) - alexHints);
    let guard = 0;
    while (left > 0 && guard++ < 10_000) { const c = pool[Math.floor(rand() * pool.length)]!; if (c.hints < 2 && c.hints < MISSION_BY_ID.get(c.mission)!.steps[c.hintStep]!.hints.length) { c.hints++; c.hintStep = c.wrongStep; left--; } }
  });
  return { students, metrics: planMetrics(students) };
}

export function planMetrics(students: PlanStudent[]) {
  const first = (s: PlanStudent) => { const m = new Map<string, Cell>(); for (const c of s.cells) if (!m.has(c.mission)) m.set(c.mission, c); return [...m.values()]; };
  const accs = students.map((s) => { const cells = first(s); return Math.round(100 * cells.reduce((a, c) => a + accOf(c.mission, c.wrong), 0) / cells.length); });
  const progress = students.map((s) => Math.round((100 * s.completions) / 9));
  const missionPct = ORDER.map((id) => { const cs = students.flatMap((s) => first(s).filter((c) => c.mission === id)); return { n: cs.length, pct: Math.round(100 * cs.reduce((a, c) => a + accOf(id, c.wrong), 0) / cs.length) }; });
  return {
    avgAccuracyPct: Math.round(accs.reduce((a, b) => a + b, 0) / accs.length),
    avgCompletionPct: Math.round(progress.reduce((a, b) => a + b, 0) / progress.length),
    missionPct, accs,
  };
}

const KNOWN_SEED = 461;
/** Picks the first seed whose class averages round to the design's 81% accuracy and 73% completion. */
export function pickPlan(base: number) {
  // The search is deterministic and independent of `base`; 461 is its first hit (about a minute to rediscover).
  const seeds = [KNOWN_SEED, ...Array.from({ length: 1200 }, (_, i) => i + 1)];
  for (const seed of seeds) {
    const p = classPlan(base, seed);
    const named = p.students.slice(0, 8).every((st, i) => p.metrics.accs[i] === st.target);
    const cols = p.metrics.missionPct.every((m, k) => Math.abs(m.pct - COL_TARGET[k]!) <= (k === 8 ? 0 : 1));
    const lowActive = p.students.some((st, i) => !st.carryXp && !(st.lastActiveDaysAgo >= 7 && st.completions < 9) && p.metrics.accs[i]! < 60);
    if (p.metrics.avgAccuracyPct === 81 && p.metrics.avgCompletionPct === 73 && named && cols && !lowActive) return { seed, ...p };
  }
  throw new Error('demo plan: no seed satisfied the class averages');
}

// ------------------------------------------------------------------- playing
async function play(g: Game, clock: { t: number }, uid: number, c: Cell) {
  const m = MISSION_BY_ID.get(c.mission)!;
  clock.t = c.at - c.elapsed * 1000;
  const a = g.startMission(uid, c.mission).attempt.attemptId;
  for (const [i, step] of m.steps.entries()) {
    clock.t += 1000;
    if (i === c.wrongStep) for (let n = 0; n < c.wrong; n++) { g.answer(uid, a, step.id, bad(step)); clock.t += 1000; }
    if (i === c.hintStep) for (let n = 0; n < c.hints; n++) { await g.hint(uid, a, step.id); clock.t += 1000; }
    if (i === m.steps.length - 1) clock.t = c.at;
    g.answer(uid, a, step.id, good(step));
  }
  // Leaving a lab: enter its code as soon as the third mission of that lab is done.
  if (m.ordinal === 3) { clock.t = c.at + 5 * 60_000; g.unlockLab(uid, m.labSlug, exitCode(m.labSlug)); }
}

const insertUser = (db: DB, name: string, email: string, role: 'student' | 'teacher', hash: string, created: number, extra: { program?: string; level?: string; demo?: boolean } = {}) =>
  Number(db.prepare('INSERT INTO users (email, name, password_hash, role, created_at, program, study_level, is_demo, is_demo_account) VALUES (?,?,?,?,?,?,?,?,1)')
    .run(email, name, hash, role, created, extra.program ?? null, extra.level ?? null, extra.demo ? 1 : 0).lastInsertRowid);

/** Wipes everything Alex has done and replays the prepared story. */
async function playAlex(db: DB, uid: number, base: number) {
  const clock = { t: base };
  const g = new Game(db, { now: () => clock.t });
  for (const t of ['attempts', 'fragments', 'lab_exits', 'code_tries', 'badges_earned', 'mission_best', 'xp_events']) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
  // Identity and class membership are part of the prepared state too: a guest who renamed Alex or joined another class gets them back.
  db.prepare('UPDATE users SET name = ?, program = ?, study_level = ? WHERE id = ?').run('Alex Martin', 'Biomedical Sciences', 'L3', uid);
  db.prepare('DELETE FROM class_members WHERE user_id = ? AND class_id NOT IN (SELECT id FROM classes WHERE name = ? AND teacher_id = (SELECT id FROM users WHERE email = ?))').run(uid, DEMO_CLASS_NAME, DEMO_TEACHER_EMAIL);
  for (const c of alexPlan(base)) await play(g, clock, uid, c);
  const earned = g.earnedXp(uid);
  db.prepare('UPDATE users SET xp_carry = ?, language = ?, sound = 0, reduce_motion = 0, notifications = 0 WHERE id = ?').run(ALEX_TARGET_XP - earned, 'en', uid);
  return { earned };
}

export interface DemoSeed { teacherId: number; classId: number; l2ClassId: number; alexId: number; seed: number; metrics: ReturnType<typeof planMetrics> }

/** Creates the demo teacher, two classes and 38 students. Idempotent: returns null if already seeded. */
export async function seedDemo(db: DB, base: number): Promise<DemoSeed | null> {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_TEACHER_EMAIL)) return null;
  const hash = await hashPassword(DEMO_PASSWORD);
  const plan = pickPlan(base);
  const created = base - 30 * DAY;
  const teacherId = insertUser(db, DEMO_TEACHER_NAME, DEMO_TEACHER_EMAIL, 'teacher', hash, created, { program: 'Biomedical Sciences' });
  const clock = { t: base };
  const g = new Game(db, { now: () => clock.t });
  clock.t = created;
  const l3 = g.createClass(teacherId, DEMO_CLASS_NAME);
  const l2 = g.createClass(teacherId, 'L2 Biomedical Sciences');
  let alexId = 0;
  for (const s of plan.students) {
    const isAlex = s.email === DEMO_STUDENT_EMAIL;
    const uid = insertUser(db, s.name, s.email, 'student', hash, created, { program: 'Biomedical Sciences', level: 'L3', demo: isAlex });
    if (isAlex) { alexId = uid; db.prepare('INSERT INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)').run(l3.id, uid, created); await playAlex(db, uid, base); continue; }
    db.prepare('INSERT INTO class_members (class_id, user_id, joined_at) VALUES (?,?,?)').run(l3.id, uid, created);
    for (const c of s.cells) await play(g, clock, uid, c);
    const earned = g.earnedXp(uid);
    const carry = s.carryXp !== undefined ? s.carryXp - earned : 0;
    // Named students carry the XP in the design's roster; the 30 others get a modest carry-over that keeps them below the named ones.
    const rand = rng(uid * 7919);
    const extra = s.carryXp !== undefined ? carry : Math.round((300 + rand() * 3900) / 10) * 10;
    db.prepare('UPDATE users SET xp_carry = ? WHERE id = ?').run(Math.max(0, extra), uid);
  }
  clock.t = base;
  return { teacherId, classId: l3.id, l2ClassId: l2.id, alexId, seed: plan.seed, metrics: plan.metrics };
}

/** POST /api/demo/reset: only the demo student, only back to the prepared state. */
export async function resetDemoStudent(db: DB, game: Game, uid: number) {
  const u = db.prepare('SELECT is_demo FROM users WHERE id = ?').get(uid) as { is_demo: number } | undefined;
  if (!u || u.is_demo !== 1) throw forbidden('Only the demo account can be reset.', 'not_demo');
  // R16-A-05: the wipe and the replay are ONE write transaction (BEGIN IMMEDIATE), so two resets on one database file (two processes) queue behind each other
  // instead of one deleting rows the other is replaying: both answer 200 with the same final state. The replay only awaits already-resolved promises
  // (the standard hint provider), so nothing else on this event loop can run inside the transaction.
  db.exec('BEGIN IMMEDIATE');
  let out: Awaited<ReturnType<typeof playAlex>>;
  try { out = await playAlex(db, uid, game.now()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { reset: true, profile: game.profile(uid), earnedXp: out.earned };
}

/**
 * POST /api/demo/reset for the shared faculty guest: name and profile, classes created after the seed, and the content review state
 * the demo teacher produced. Reviews made by other teachers are left alone: a mission is the demo teacher's when its current reviewer
 * label carries this account id, or (reviews recorded before round 9 carry only the display name) when the latest audit row for it names this account.
 */
export function resetDemoTeacher(db: DB, game: Game, uid: number) {
  const u = db.prepare('SELECT email FROM users WHERE id = ?').get(uid) as { email: string } | undefined;
  if (!u || u.email !== DEMO_TEACHER_EMAIL) throw forbidden('Only the demo account can be reset.', 'not_demo');
  tx(db, () => {
    // New registrations and renames cannot take this name (Game.assertTeacherNameFree reserves it for the demo account), but the reset restores it
    // unconditionally: a database written before round 10 may already hold a real teacher whose name reads the same, and then both accounts carry it
    // (a known, documented edge: docs/KNOWN_LIMITATIONS.md). The review records stay unambiguous because they also carry "(teacher #id)".
    db.prepare('UPDATE users SET name = ?, program = ?, study_level = NULL, language = ?, sound = 0, reduce_motion = 0, notifications = 0 WHERE id = ?').run(DEMO_TEACHER_NAME, 'Biomedical Sciences', 'en', uid);
    // The two classes the seed created are the teacher's first two; anything a visitor added later goes (members cascade).
    db.prepare('DELETE FROM classes WHERE teacher_id = ? AND id NOT IN (SELECT id FROM classes WHERE teacher_id = ? ORDER BY id LIMIT 2)').run(uid, uid);
    // content_audit is append-only, so the reset is recorded as one more transition per mission instead of erasing the visitors' trail.
    const who = `${reviewerLabel(DEMO_TEACHER_NAME, uid)} [demo reset]`;
    const mine = `(SELECT 1 FROM content_status cs WHERE cs.mission_id = content_status.mission_id AND cs.status <> 'draft' AND (
        cs.reviewed_by LIKE '% (teacher #' || ? || ')'
        OR (SELECT a.actor_id FROM content_audit a WHERE a.mission_id = cs.mission_id ORDER BY a.id DESC LIMIT 1) = ?))`;
    const open = db.prepare(`SELECT mission_id, status FROM content_status WHERE EXISTS ${mine}`).all(uid, uid) as Array<{ mission_id: string; status: string }>;
    for (const r of open) db.prepare('INSERT INTO content_audit (mission_id, from_status, to_status, actor_id, actor_name, at) VALUES (?,?,?,?,?,?)').run(r.mission_id, r.status, 'draft', uid, who, game.now());
    db.prepare(`UPDATE content_status SET status = 'draft', reviewed_by = NULL, updated_at = ? WHERE EXISTS ${mine}`).run(game.now(), uid, uid);
  });
  return { reset: true, profile: game.profile(uid) };
}

export { MISSIONS, missionsOf };
