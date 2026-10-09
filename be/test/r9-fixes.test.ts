import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listenHost } from '../src/app.ts';
import { MISSION_BY_ID, exitCode } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { DEMO_CLASS_NAME, DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { correct, harness, solve, wrong } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Round 9 backend fixes (R9-A-01 .. R9-A-07, R9-B-13).
const OPEN_LIMITS = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const teacher = (h: Harness, name: string, email: string) => h.signup(name, email, { teacherInviteCode: INVITE });

async function escapeAll(h: Harness, token: string, withMaster: boolean) {
  for (const slug of ['hematology', 'microbiology', 'biochemistry']) {
    for (const m of [...MISSION_BY_ID.values()].filter((x) => x.labSlug === slug).sort((a, b) => a.ordinal - b.ordinal)) await solve(h, token, m.id);
    assert.equal((await h.call('POST', `/api/labs/${slug}/unlock`, { token, body: { code: exitCode(slug) } })).status, 200);
  }
  if (withMaster) {
    await solve(h, token, 'master-01');
    assert.equal((await h.call('POST', '/api/labs/master/unlock', { token, body: { code: exitCode('master') } })).status, 200);
  }
}

// ------------------------------------------------------------------ R9-A-04
test('R9-A-04: "labs completed" is the number of standard labs escaped (denominator 3) in every view, Master Lab or not', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    const t = await teacher(h, 'Prof Labs', 'prof-labs@uni.edu');
    const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Labs class' } })).body;
    const u = await h.signup('Full Escaper');
    assert.equal((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: cls.joinCode } })).status, 200);
    await escapeAll(h, u.token, true);

    const dash = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
    const profile = (await h.call('GET', '/api/profile', { token: u.token })).body;
    const board = (await h.call('GET', '/api/leaderboard?scope=all&cohort=all', { token: u.token })).body;
    const roster = (await h.call('GET', `/api/classes/${cls.id}/students`, { token: t.token })).body;
    const detail = (await h.call('GET', `/api/classes/${cls.id}/students/${u.id}`, { token: t.token })).body;
    const analytics = (await h.call('GET', `/api/classes/${cls.id}/analytics`, { token: t.token })).body;

    assert.equal(profile.stats.labsTotal, 3);
    assert.equal(profile.stats.labsCompleted, 3);
    assert.equal(dash.labsCompleted, 3, 'the Master Lab is not a fourth "lab completed"');
    assert.equal(board.me.labs, 3);
    assert.equal(roster.students[0].labsEscaped, 3);
    assert.equal(detail.student.labsEscaped, 3);
    assert.equal(analytics.cohort.labsEscaped, 3);
    assert.equal(analytics.roster[0].labsEscaped, 3);
    assert.ok(analytics.cohort.labsEscaped <= analytics.cohort.students * profile.stats.labsTotal);
    // The Master Lab itself stays visible through its own badge and lab state.
    assert.ok((await h.call('GET', '/api/badges', { token: u.token })).body.badges.find((b: any) => b.id === 'clinical-detective').earned);

    const rules = (await h.call('GET', '/api/rules')).body;
    assert.match(rules.labsCompleted, /three standard labs/i);
    assert.match(rules.labsCompleted, /Master Lab/);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R9-A-05
test('R9-A-05: the database and its WAL/SHM sidecars are owner-only (0600)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-perm-'));
  const path = join(dir, 'fresh.db');
  try {
    const db = openDb(path);
    db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('a@b.co','A','x','student',1)").run();
    for (const f of [path, `${path}-wal`, `${path}-shm`]) {
      if (!existsSync(f)) continue;
      assert.equal(statSync(f).mode & 0o077, 0, `${f} must not be readable by group/others`);
    }
    assert.ok(existsSync(`${path}-wal`), 'WAL mode is on, so the sidecar exists while the database is open');
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R9-A-05: an existing world-readable database is tightened when it is opened', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-perm-'));
  const path = join(dir, 'old.db');
  try {
    openDb(path).close();
    chmodSync(path, 0o644);
    assert.notEqual(statSync(path).mode & 0o077, 0);
    const db = openDb(path);
    db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('a@b.co','A','x','student',1)").run();
    for (const f of [path, `${path}-wal`, `${path}-shm`]) if (existsSync(f)) assert.equal(statSync(f).mode & 0o077, 0, f);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R9-A-06
test('R9-A-06: demo mode listens on loopback unless HOST says otherwise', () => {
  assert.equal(listenHost({ demo: true }, {}), '127.0.0.1');
  assert.equal(listenHost({ demo: true }, { HOST: '0.0.0.0' }), '0.0.0.0');
  assert.equal(listenHost({ demo: false }, {}), undefined, 'without demo mode the previous behaviour (all interfaces) is kept');
  assert.equal(listenHost({ demo: false }, { HOST: '127.0.0.1' }), '127.0.0.1');
  assert.equal(listenHost({ demo: true }, { HOST: '' }), '127.0.0.1', 'a blank HOST (compose ${HOST} unset) does not mean "everywhere"');
});

// ------------------------------------------------------------------ R9-A-07
test('R9-A-07: with DEMO_MODE off the seeded demo accounts cannot sign in (same 401 as a wrong password), and no demo e-mail can be registered', async () => {
  const off = await harness({ teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    await seedDemo(off.app.db, off.clock.t);
    await off.signup('Real User', 'real@uni.edu');
    const wrongPw = await off.call('POST', '/api/auth/login', { body: { email: 'real@uni.edu', password: 'definitely wrong pw' } });
    assert.equal(wrongPw.status, 401);
    for (const email of [DEMO_TEACHER_EMAIL, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL.toUpperCase()]) {
      const r = await off.call('POST', '/api/auth/login', { body: { email, password: DEMO_PASSWORD } });
      assert.equal(r.status, 401, email);
      assert.deepEqual(r.body, wrongPw.body, 'no account enumeration difference');
    }
    assert.equal((await off.call('POST', '/api/auth/login', { body: { email: 'real@uni.edu', password: 'correct horse battery' } })).status, 200);
    const reg = await off.call('POST', '/api/auth/register', { body: { name: 'Squatter', email: 'squatter@demo.escape-lab.app', password: 'correct horse battery' } });
    assert.equal(reg.status, 400);
    assert.equal(reg.body.error.code, 'reserved_email');
  } finally { await off.close(); }
  const on = await harness({ demo: true, limits: OPEN_LIMITS });
  try {
    await seedDemo(on.app.db, on.clock.t);
    assert.equal((await on.call('POST', '/api/auth/login', { body: { email: DEMO_TEACHER_EMAIL, password: DEMO_PASSWORD } })).status, 200);
  } finally { await on.close(); }
});

test('R9-A-07: a demo token minted while demo mode was on stops working once the same database is served with it off', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-demo-'));
  const dbPath = join(dir, 'demo.db');
  try {
    let on = await harness({ demo: true, dbPath, limits: OPEN_LIMITS });
    await seedDemo(on.app.db, on.clock.t);
    const token = (await on.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
    assert.equal((await on.call('GET', '/api/classes', { token })).status, 200);
    await on.close();
    on = await harness({ demo: false, dbPath, limits: OPEN_LIMITS });
    assert.equal((await on.call('GET', '/api/classes', { token })).status, 401);
    await on.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R9-A-01
test('R9-A-01: the reviewer identity carries the account id, so a colleague\'s display name cannot be impersonated', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    const a = await teacher(h, 'Dr. Claire Moreau', 'claire@uni.edu');
    const b = await teacher(h, 'Teacher Two', 'two@uni.edu');
    const put = (token: string, status: string) => h.call('PUT', '/api/content/missions/mic-01/status', { token, body: { status } });
    const reviewedByA = (await put(a.token, 'reviewed')).body.reviewedBy;
    assert.match(reviewedByA, /Dr\. Claire Moreau/);
    assert.ok(reviewedByA.includes(`#${a.id}`), reviewedByA);
    // The impersonation from the finding: rename to the colleague's name (refused), or share the name through registration (distinguishable).
    const clash = await h.call('PUT', '/api/profile', { token: b.token, body: { name: '  dr. CLAIRE moreau ' } });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.error.code, 'name_taken');
    // Since round 10 registering with a colleague's name is refused too (R10-A-01); the id stays in the label for every other reviewer.
    const refused = await h.call('POST', '/api/auth/register', { body: { name: 'Dr. Claire Moreau', email: 'twin@uni.edu', password: 'correct horse battery', teacherInviteCode: INVITE } });
    assert.equal(refused.status, 409);
    const twin = await teacher(h, 'Dr. Claire Moreau Jr', 'twin@uni.edu');
    const approvedByTwin = (await put(twin.token, 'approved')).body.reviewedBy;
    assert.notEqual(approvedByTwin, reviewedByA, 'a different account yields a different, id-bearing reviewer');
    assert.ok(approvedByTwin.includes(`#${twin.id}`));
    assert.equal((await h.call('GET', '/api/content/missions', { token: b.token })).body.missions.find((m: any) => m.missionId === 'mic-01').reviewedBy, approvedByTwin);
    const audit = h.app.db.prepare('SELECT actor_id, actor_name FROM content_audit WHERE mission_id = ? ORDER BY id').all('mic-01') as Array<{ actor_id: number; actor_name: string }>;
    assert.deepEqual(audit.map((r) => r.actor_name), [reviewedByA, approvedByTwin]);
    // Own name stays editable (case change, same name), and a student may share a teacher's name.
    assert.equal((await h.call('PUT', '/api/profile', { token: a.token, body: { name: 'DR. CLAIRE MOREAU' } })).status, 200);
    const s = await h.signup('Student Same');
    assert.equal((await h.call('PUT', '/api/profile', { token: s.token, body: { name: 'Teacher Two' } })).status, 200);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R9-A-02
test('R9-A-02: POST /demo/reset also restores the shared demo teacher (name, classes, content review) and is idempotent', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const guest = (await h.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
    const before = (await h.call('GET', '/api/classes', { token: guest })).body.classes;
    assert.equal(before.length, 2);

    assert.equal((await h.call('PUT', '/api/profile', { token: guest, body: { name: 'DEFACED by visitor', program: 'Hacked' } })).status, 200);
    for (let i = 0; i < 5; i++) await h.call('POST', '/api/classes', { token: guest, body: { name: `Spam class ${i}` } });
    assert.equal((await h.call('PUT', '/api/content/missions/hem-01/status', { token: guest, body: { status: 'reviewed' } })).status, 200);
    assert.equal((await h.call('PUT', '/api/content/missions/hem-01/status', { token: guest, body: { status: 'approved' } })).status, 200);
    assert.equal((await h.call('GET', '/api/classes', { token: guest })).body.classes.length, 7);

    for (let round = 0; round < 2; round++) {
      const res = await h.call('POST', '/api/demo/reset', { token: guest });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.reset, true);
      const me = (await h.call('GET', '/api/profile', { token: guest })).body;
      assert.equal(me.user.name, 'Dr. Claire Moreau');
      assert.equal(me.user.program, 'Biomedical Sciences');
      const after = (await h.call('GET', '/api/classes', { token: guest })).body.classes;
      assert.deepEqual(after.map((c: any) => [c.id, c.name, c.joinCode]), before.map((c: any) => [c.id, c.name, c.joinCode]));
      assert.ok(after.some((c: any) => c.name === DEMO_CLASS_NAME));
      const content = (await h.call('GET', '/api/content/missions', { token: guest })).body.missions;
      assert.ok(content.every((m: any) => m.status === 'draft' && m.reviewedBy === null));
    }
    // The audit trail is append-only: the reset adds rows (approved -> draft) instead of erasing the visitor's.
    const trail = h.app.db.prepare('SELECT from_status, to_status FROM content_audit WHERE mission_id = ? ORDER BY id').all('hem-01').map((r) => ({ ...r }));
    assert.deepEqual(trail, [{ from_status: 'draft', to_status: 'reviewed' }, { from_status: 'reviewed', to_status: 'approved' }, { from_status: 'approved', to_status: 'draft' }]);

    // Other teachers (and demo mode off) still cannot reset.
    const other = await teacher(h, 'Other Prof', 'other@uni.edu');
    assert.equal((await h.call('POST', '/api/demo/reset', { token: other.token })).status, 403);
    // The student guest keeps working as before.
    const alex = (await h.call('POST', '/api/auth/demo', { body: { role: 'student' } })).body.token;
    assert.equal((await h.call('POST', '/api/demo/reset', { token: alex })).status, 200);
    const plain = await h.signup('Plain Student');
    const denied = await h.call('POST', '/api/demo/reset', { token: plain.token });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'not_demo');
  } finally { await h.close(); }
  const off = await harness({ teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    const t = await teacher(off, 'Prof Off', 'off@uni.edu');
    assert.equal((await off.call('POST', '/api/demo/reset', { token: t.token })).status, 404);
  } finally { await off.close(); }
});

// ------------------------------------------------------------------ R9-A-03
test('R9-A-03: a teacher owns at most 50 classes (409 class_limit_reached)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN_LIMITS });
  try {
    const t = await teacher(h, 'Prof Many', 'many@uni.edu');
    const other = await teacher(h, 'Prof Few', 'few@uni.edu');
    for (let i = 0; i < 50; i++) assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: `Class ${i}` } })).status, 201, `class ${i}`);
    const over = await h.call('POST', '/api/classes', { token: t.token, body: { name: 'One too many' } });
    assert.equal(over.status, 409);
    assert.equal(over.body.error.code, 'class_limit_reached');
    assert.equal(over.body.error.details.limit, 50);
    assert.equal((await h.call('GET', '/api/classes', { token: t.token })).body.classes.length, 50);
    assert.equal((await h.call('POST', '/api/classes', { token: other.token, body: { name: 'Fine' } })).status, 201, 'the cap is per teacher');
  } finally { await h.close(); }
});

test('R9-A-03: teacher write routes are rate limited per account (429)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: { ...OPEN_LIMITS, writePerMinute: 4 } });
  try {
    const t = await teacher(h, 'Prof Fast', 'fast@uni.edu');
    const other = await teacher(h, 'Prof Calm', 'calm@uni.edu');
    const codes: number[] = [];
    codes.push((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'C1' } })).status);
    codes.push((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'C2' } })).status);
    codes.push((await h.call('PUT', '/api/profile', { token: t.token, body: { program: 'X' } })).status);
    codes.push((await h.call('PUT', '/api/content/missions/hem-01/status', { token: t.token, body: { status: 'reviewed' } })).status);
    assert.deepEqual(codes, [201, 201, 200, 200]);
    for (const r of [
      await h.call('POST', '/api/classes', { token: t.token, body: { name: 'C3' } }),
      await h.call('PUT', '/api/profile', { token: t.token, body: { program: 'Y' } }),
      await h.call('PUT', '/api/content/missions/hem-01/status', { token: t.token, body: { status: 'approved' } }),
    ]) { assert.equal(r.status, 429); assert.ok(r.headers.get('retry-after')); }
    assert.equal((await h.call('GET', '/api/classes', { token: t.token })).status, 200, 'reads are not limited');
    assert.equal((await h.call('POST', '/api/classes', { token: other.token, body: { name: 'Mine' } })).status, 201, 'another teacher is unaffected');
    h.clock.t += 61_000;
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'C3' } })).status, 201, 'the window slides');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R9-B-13
test('R9-B-13: the attempt view penalty equals the ledger penalty when the cap applies', async () => {
  const h = await harness({ limits: OPEN_LIMITS });
  try {
    const u = await h.signup('Capped Again');
    const m = MISSION_BY_ID.get('hem-01')!;
    const step = m.steps[0]!;
    const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    for (let i = 0; i < 25; i++) await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step.id, response: wrong(step) } });
    for (let i = 0; i < 2; i++) assert.equal((await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: step.id } })).status, 200);
    const hud = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    assert.equal(hud.wrongTotal, 25);
    assert.equal(hud.hintsUsed, 2);
    const done = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step.id, response: correct(step) } });
    const ledger = done.body.result.ledger as Array<{ points: number; kind: string }>;
    const ledgerPenalty = ledger.filter((r) => r.kind === 'penalty').reduce((s, r) => s + r.points, 0);
    assert.equal(done.body.result.score, 0);
    assert.equal(ledgerPenalty, -130, 'base 100 + time bonus 30 are all there is to lose');
    assert.equal(hud.penaltyXp, ledgerPenalty, 'the HUD shows the same penalty the ledger will');
    const finished = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    assert.equal(finished.penaltyXp, ledgerPenalty, 'and so does the completed attempt');
  } finally { await h.close(); }
});

test('R9-B-13: uncapped penalties are unchanged, and the time bonus lost while thinking shrinks the cap consistently', async () => {
  const h = await harness({ limits: OPEN_LIMITS });
  try {
    const u = await h.signup('Slow Thinker');
    const m = MISSION_BY_ID.get('hem-01')!;
    const step = m.steps[0]!;
    const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step.id, response: wrong(step) } });
    assert.equal((await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body.penaltyXp, -10);
    h.clock.t += (m.timeLimitSec - 1) * 1000;
    for (let i = 0; i < 25; i++) await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step.id, response: wrong(step) } });
    const hud = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    const done = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: step.id, response: correct(step) } });
    const ledgerPenalty = done.body.result.ledger.filter((r: any) => r.kind === 'penalty').reduce((s: number, r: any) => s + r.points, 0);
    assert.equal(hud.penaltyXp, ledgerPenalty);
  } finally { await h.close(); }
});
