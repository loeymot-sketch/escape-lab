import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { listenHost } from '../src/app.ts';
import type { HintProvider } from '../src/assistant.ts';
import { hashPassword, signToken, verifyToken } from '../src/auth.ts';
import { MISSION_BY_ID, exitCode } from '../src/content.ts';
import { migrate, openDb } from '../src/db.ts';
import { DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { harness, solve } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Round 10 backend fixes (R10-A-01 .. R10-A-09, R10-C-05).
const BE = fileURLToPath(new URL('..', import.meta.url));
const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const teacher = (h: Harness, name: string, email: string) => h.signup(name, email, { teacherInviteCode: INVITE });
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });
const rename = (h: Harness, token: string, name: string) => h.call('PUT', '/api/profile', { token, body: { name } });

// ------------------------------------------------------------------ R10-A-01
// R12-A-02: spellings with bidi overrides / isolates (U+202E, U+2066-U+2069) used to be listed here as 409 cases; they are now a 400 validation_error (see r12-fixes.test.ts).
const LOOKALIKES = [
  'Prof Alpha', 'prof alpha', 'PROF ALPHA', '  Prof   Alpha ', 'Prof Alpha', 'Prof　Alpha', 'Pröf Alpha',
  'Prof ​Alpha', 'Al​pha'.replace('Al', 'Prof Al'), 'Prof Al­pha', 'Prof Alpha﻿',
  'ＰＲＯＦ Alpha', 'Prof Alpha.', 'Prof. Alpha', 'Prof-Alpha', 'ProfAlpha', 'Prоf Alpha', 'Prof Аlpha', 'Prof Alphá',
];

test('R10-A-01: registering with a teacher invite code obeys the same name rule as a rename (exact, invisible, compatibility and homoglyph forms)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const a = await teacher(h, 'Prof Alpha', 'alpha@uni.edu');
    const b = await teacher(h, 'Teacher Beta', 'beta@uni.edu');
    let n = 0;
    for (const name of LOOKALIKES) {
      const email = `twin${++n}@uni.edu`;
      const r = await register(h, name, email, { teacherInviteCode: INVITE });
      assert.equal(r.status, 409, `register ${JSON.stringify(name)}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.error.code, 'name_taken');
      assert.equal(h.app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get(email)!.n, 0, 'a refused registration creates no account');
      const p = await rename(h, b.token, name);
      assert.equal(p.status, 409, `rename to ${JSON.stringify(name)}: ${JSON.stringify(p.body)}`);
      assert.equal(p.body.error.code, 'name_taken');
    }
    assert.equal((await h.call('GET', '/api/profile', { token: b.token })).body.user.name, 'Teacher Beta');
    // Legitimate neighbours are fine, and students are not subject to the teacher rule.
    assert.equal((await register(h, 'Prof Alphonse', 'alphonse@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, 'Оксана Петренко', 'oksana@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, 'Олександр Петренко', 'oleksandr@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, '李明', 'li@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, 'Prof Alpha', 'student-same@uni.edu')).status, 201);
    // Keeping your own name in another spelling is allowed.
    assert.equal((await rename(h, a.token, 'PROF ALPHA')).status, 200);
  } finally { await h.close(); }
});

test('R10-A-01: the seeded demo teacher name is reserved even after a visitor renamed that account', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    assert.equal((await register(h, 'Dr. Claire Moreau', 'claire-fake@uni.edu', { teacherInviteCode: INVITE })).status, 409);
    const guest = (await h.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
    assert.equal((await rename(h, guest, 'Somebody Else')).status, 200);
    const squat = await register(h, 'Dr Claire Moreau', 'claire-fake2@uni.edu', { teacherInviteCode: INVITE });
    assert.equal(squat.status, 409, 'the reset would otherwise hand two accounts the same name');
    assert.equal((await h.call('POST', '/api/demo/reset', { token: guest })).status, 200);
    assert.equal((await h.call('GET', '/api/profile', { token: guest })).body.user.name, 'Dr. Claire Moreau');
  } finally { await h.close(); }
});

test('R10-A-01: a display name cannot imitate the "(teacher #n)" reviewer suffix', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Prof Real', 'real@uni.edu');
    const s = await h.signup('Student One', 's1@uni.edu');
    const spoofs = ['Dr. Claire Moreau (teacher #1)', 'Claire (Teacher #12)', 'Claire ( teacher # 7 )', 'Claire (teacher #7)', 'Claire （teacher ＃5）', 'Claire (t​eacher #5)', 'Claire (tеacher #5)'];
    let n = 0;
    for (const name of spoofs) {
      for (const extra of [{ teacherInviteCode: INVITE }, {}]) {
        const r = await register(h, name, `spoof${++n}@uni.edu`, extra);
        assert.equal(r.status, 400, `register ${JSON.stringify(name)}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, 'validation_error');
      }
      assert.equal((await rename(h, t.token, name)).status, 400, `rename ${JSON.stringify(name)}`);
      assert.equal((await rename(h, s.token, name)).status, 400, `student rename ${JSON.stringify(name)}`);
    }
    for (const ok of ['Dr. Smith (Biology)', 'Prof Room #5', 'Teacher (teacher)', 'Dr. Smith (#1)']) {
      assert.equal((await rename(h, t.token, ok)).status, 200, ok);
    }
    // The label written for the audit trail is therefore unambiguous.
    const put = await h.call('PUT', '/api/content/missions/mic-02/status', { token: t.token, body: { status: 'reviewed' } });
    assert.equal(put.body.reviewedBy, `Dr. Smith (#1) (teacher #${t.id})`);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R10-A-02
test('R10-A-02: the demo teacher reset reverts only the demo teacher\'s own reviews, never another teacher\'s approvals', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const demoId = (h.app.db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_TEACHER_EMAIL) as { id: number }).id;
    const guest = (await h.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
    const real = await teacher(h, 'Real Teacher R', 'real-r@uni.edu');
    const put = (token: string, id: string, status: string) => h.call('PUT', `/api/content/missions/${id}/status`, { token, body: { status } });
    // Another teacher's work: hem-01 approved, mic-01 reviewed.
    for (const s of ['reviewed', 'approved']) assert.equal((await put(real.token, 'hem-01', s)).status, 200);
    assert.equal((await put(real.token, 'mic-01', 'reviewed')).status, 200);
    // The guest's own work: hem-02 reviewed, bio-01 approved; and mic-02 started by the guest, finished by the real teacher.
    assert.equal((await put(guest, 'hem-02', 'reviewed')).status, 200);
    for (const s of ['reviewed', 'approved']) assert.equal((await put(guest, 'bio-01', s)).status, 200);
    assert.equal((await put(guest, 'mic-02', 'reviewed')).status, 200);
    assert.equal((await put(real.token, 'mic-02', 'approved')).status, 200);
    // A review recorded before round 9 carries only the display name; the audit trail still names the demo teacher.
    h.app.db.prepare("INSERT INTO content_status (mission_id, status, reviewed_by, updated_at) VALUES ('bio-02','reviewed','Dr. Claire Moreau',1)").run();
    h.app.db.prepare("INSERT INTO content_audit (mission_id, from_status, to_status, actor_id, actor_name, at) VALUES ('bio-02','draft','reviewed',?, 'Dr. Claire Moreau', 1)").run(demoId);
    const auditBefore = h.app.db.prepare('SELECT COUNT(*) AS n FROM content_audit').get()!.n as number;

    const res = await h.call('POST', '/api/demo/reset', { token: guest });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const byId = new Map(((await h.call('GET', '/api/content/missions', { token: real.token })).body.missions as any[]).map((m) => [m.missionId, m]));
    assert.equal(byId.get('hem-01').status, 'approved');
    assert.equal(byId.get('hem-01').reviewedBy, `Real Teacher R (teacher #${real.id})`);
    assert.equal(byId.get('mic-01').status, 'reviewed');
    assert.equal(byId.get('mic-02').status, 'approved', 'approved by someone else after the guest reviewed it: not the guest\'s state');
    for (const id of ['hem-02', 'bio-01', 'bio-02']) { assert.equal(byId.get(id).status, 'draft', id); assert.equal(byId.get(id).reviewedBy, null, id); }
    // Append-only trail: three [demo reset] rows (hem-02, bio-01, bio-02) and nothing for the other teacher's missions.
    const resetRows = h.app.db.prepare("SELECT mission_id FROM content_audit WHERE actor_name LIKE '%[demo reset]' ORDER BY mission_id").all().map((r: any) => r.mission_id);
    assert.deepEqual(resetRows, ['bio-01', 'bio-02', 'hem-02']);
    assert.equal(h.app.db.prepare('SELECT COUNT(*) AS n FROM content_audit').get()!.n, auditBefore + 3);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R10-A-03
test('R10-A-03: db:backup writes the copy 0600 and a directory it creates 0700, whatever the umask', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-bk-'));
  try {
    const src = join(dir, 'src.db');
    openDb(src).close();
    const out = join(dir, 'nested', 'backups', 'out.db');
    const r = spawnSync('sh', ['-c', 'umask 022; exec "$0" --disable-warning=ExperimentalWarning scripts/db-backup.ts "$1"', process.execPath, out], { cwd: BE, env: { ...process.env, DB_PATH: src }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, 'nested', 'backups')).mode & 0o777, 0o700);
    assert.equal(statSync(join(dir, 'nested')).mode & 0o777, 0o700);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R10-A-04
test('R10-A-04: an assistant that answers with an empty or blank string falls back to the faculty hint, stored as a standard hint', async () => {
  const step = MISSION_BY_ID.get('hem-01')!.steps[0]!;
  for (const blank of ['', '   ', '\n\t ']) {
    const assistant: HintProvider = { hint: async () => blank };
    const h = await harness({ assistant, limits: OPEN });
    try {
      const u = await h.signup('Hinter');
      const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
      const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: step.id } });
      assert.equal(r.status, 200);
      assert.equal(r.body.hint, step.hints[0], JSON.stringify(blank));
      assert.equal(r.body.source, 'standard');
      const view = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
      assert.deepEqual(view.step.hintsGiven, [{ level: 1, text: step.hints[0], source: 'standard' }]);
      assert.equal(h.app.db.prepare('SELECT text FROM hint_log').get()!.text, step.hints[0]);
    } finally { await h.close(); }
  }
  const h = await harness({ assistant: { hint: async () => 'Look at the cell size.' }, limits: OPEN });
  try {
    const u = await h.signup('Hinter2');
    const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: step.id } });
    assert.equal(r.body.hint, 'Look at the cell size.');
    assert.equal(r.body.source, 'assistant');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R10-A-06
test('R10-A-06: HOST is trimmed, a blank value means the default, and "localhost" is the IPv4 loopback (not an IPv6-only bind)', () => {
  assert.equal(listenHost({ demo: true }, { HOST: '   ' }), '127.0.0.1');
  assert.equal(listenHost({}, { HOST: '   ' }), undefined);
  assert.equal(listenHost({}, { HOST: ' 0.0.0.0 ' }), '0.0.0.0');
  assert.equal(listenHost({ demo: true }, { HOST: '  127.0.0.1 ' }), '127.0.0.1');
  assert.equal(listenHost({}, { HOST: 'localhost' }), '127.0.0.1');
  assert.equal(listenHost({}, { HOST: 'LOCALHOST' }), '127.0.0.1');
  assert.equal(listenHost({}, { HOST: '[::1]' }), '::1');
  assert.equal(listenHost({}, { HOST: '::' }), '::');
  assert.throws(() => listenHost({}, { HOST: 'bad host!' }), /HOST/);
  assert.throws(() => listenHost({}, { HOST: 'http://x' }), /HOST/);
});

const runServer = (env: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), 'el-srv-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], {
    cwd: BE, env: { PATH: process.env.PATH ?? '', DB_PATH: join(dir, 'e.db'), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = ''; let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise<number | null>((res) => child.on('exit', (c) => res(c)));
  const cleanup = () => { child.kill('SIGKILL'); rmSync(dir, { recursive: true, force: true }); };
  const waitFor = async (re: RegExp, ms = 8000) => { const t0 = Date.now(); while (!re.test(out) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25)); return out; };
  return { child, exited, cleanup, waitFor, out: () => out, err: () => err };
};

test('R10-A-06: a port already in use ends with one clear message and a non-zero exit, not an unhandled "error" event', async () => {
  const blocker = createServer();
  await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
  const port = (blocker.address() as { port: number }).port;
  const s = runServer({ PORT: String(port), HOST: '127.0.0.1' });
  try {
    const code = await Promise.race([s.exited, new Promise<string>((r) => setTimeout(() => r('timeout'), 10_000))]);
    assert.equal(code, 1, s.err());
    assert.match(s.err(), /Cannot listen on 127\.0\.0\.1:\d+/);
    assert.match(s.err(), /EADDRINUSE|already in use/i);
    assert.doesNotMatch(s.err(), /Unhandled|node:events|at Server/);
  } finally { s.cleanup(); blocker.close(); }
});

test('R10-A-06: an unusable HOST or PORT is a clean fatal message', async () => {
  for (const env of [{ HOST: 'bad host!', PORT: '0' }, { HOST: '127.0.0.1', PORT: 'abc' }, { HOST: '127.0.0.1', PORT: '70000' }]) {
    const s = runServer(env);
    try {
      const code = await Promise.race([s.exited, new Promise<string>((r) => setTimeout(() => r('timeout'), 10_000))]);
      assert.equal(code, 1, JSON.stringify(env) + s.err());
      assert.match(s.err(), /HOST|PORT/);
      assert.doesNotMatch(s.err(), /Unhandled|node:events/);
    } finally { s.cleanup(); }
  }
});

test('R10-A-06: the startup line brackets IPv6 hosts and prints the real port', async (t) => {
  const probe = createServer();
  const v6 = await new Promise<boolean>((r) => { probe.once('error', () => r(false)); probe.listen(0, '::1', () => r(true)); });
  probe.close();
  if (!v6) { t.skip('no IPv6 loopback on this machine'); return; }
  const s = runServer({ PORT: '0', HOST: '::1' });
  try {
    const out = await s.waitFor(/listening on/);
    assert.match(out, /http:\/\/\[::1\]:[1-9]\d*/, out + s.err());
  } finally { s.cleanup(); }
});

// ------------------------------------------------------------------ R10-A-07
test('R10-A-07: with DEMO_MODE off only the seeded demo accounts are refused; an older real account on that domain keeps working', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-legacy-'));
  const path = join(dir, 'legacy.db');
  try {
    // A database exactly as the previous release left it (schema v6): seeded accounts share the published password hash, a real registrant on the same domain has his own.
    const old = new DatabaseSync(path);
    old.exec('PRAGMA foreign_keys = ON');
    migrate(old, 6);
    const shared = await hashPassword(DEMO_PASSWORD);
    const own = await hashPassword('bobs own password 1');
    const ins = old.prepare('INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?,?,?,?,?)');
    ins.run(DEMO_TEACHER_EMAIL, 'Dr. Claire Moreau', shared, 'teacher', 1);
    ins.run(DEMO_STUDENT_EMAIL, 'Alex Martin', shared, 'student', 1);
    ins.run('ines.moreau@demo.escape-lab.app', 'Inès Moreau', shared, 'student', 1);
    ins.run('bob@demo.escape-lab.app', 'Bob Real', own, 'student', 2);
    ins.run('real@uni.edu', 'Real Person', own, 'student', 3);
    old.close();
    const id = (h: Harness, email: string) => (h.app.db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id;
    const tok = (uid: number, role: 'student' | 'teacher') => signToken({ sub: uid, role, exp: Math.floor(Date.now() / 1000) + 3600 }, 'test-secret');

    const off = await harness({ dbPath: path, limits: OPEN, now: () => Date.now() });
    try {
      assert.equal((await off.call('POST', '/api/auth/login', { body: { email: 'bob@demo.escape-lab.app', password: 'bobs own password 1' } })).status, 200, 'Bob is not a seeded account');
      assert.equal((await off.call('GET', '/api/me', { token: tok(id(off, 'bob@demo.escape-lab.app'), 'student') })).status, 200);
      for (const e of [DEMO_TEACHER_EMAIL, DEMO_STUDENT_EMAIL, 'ines.moreau@demo.escape-lab.app']) {
        assert.equal((await off.call('POST', '/api/auth/login', { body: { email: e, password: DEMO_PASSWORD } })).status, 401, e);
      }
      assert.equal((await off.call('GET', '/api/me', { token: tok(id(off, DEMO_STUDENT_EMAIL), 'student') })).status, 401);
      assert.equal((await off.call('GET', '/api/me', { token: tok(id(off, 'real@uni.edu'), 'student') })).status, 200);
      const reg = await register(off, 'Squatter', 'squatter@demo.escape-lab.app');
      assert.equal(reg.status, 400);
      assert.equal(reg.body.error.code, 'reserved_email');
    } finally { await off.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R10-A-07: seedDemo marks every account it creates', async () => {
  const h = await harness({ demo: true, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const total = h.app.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n as number;
    assert.equal(total, 39);
    assert.equal(h.app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_demo_account = 1').get()!.n, total);
    const real = await h.signup('Real', 'real@uni.edu');
    assert.equal(h.app.db.prepare('SELECT is_demo_account AS d FROM users WHERE id = ?').get(real.id)!.d, 0);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R10-A-08
test('R10-A-08: the dashboard\'s overall progress uses the same definition as the profile and teacher views (standard missions, Master Lab excluded)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Prof Overall', 'overall@uni.edu');
    const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Overall class' } })).body;
    const u = await h.signup('Progress Student', 'progress@uni.edu');
    assert.equal((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: cls.joinCode } })).status, 200);
    const check = async (completed: number) => {
      const dash = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
      const roster = (await h.call('GET', `/api/classes/${cls.id}/students`, { token: t.token })).body.students[0];
      assert.deepEqual(dash.overall, { completedMissions: completed, totalMissions: 9, pct: Math.round((100 * completed) / 9) });
      assert.equal(dash.overall.pct, roster.progressPct, 'one definition on every surface');
    };
    await check(0);
    await solve(h, u.token, 'hem-01'); await solve(h, u.token, 'hem-02');
    await check(2);
    for (const id of ['hem-03', 'mic-01', 'mic-02', 'mic-03', 'bio-01', 'bio-02', 'bio-03']) await solve(h, u.token, id);
    for (const slug of ['hematology', 'microbiology', 'biochemistry']) assert.equal((await h.call('POST', `/api/labs/${slug}/unlock`, { token: u.token, body: { code: exitCode(slug) } })).status, 200);
    await check(9);
    await solve(h, u.token, 'master-01');
    await check(9); // the capstone is extra: 100 %, never 10 of 9
    // R10-C-05: singular/plural in the lab results ledger (the Master Lab has one mission, the standard labs three).
    assert.equal((await h.call('POST', '/api/labs/master/unlock', { token: u.token, body: { code: exitCode('master') } })).status, 200);
    const master = (await h.call('GET', '/api/labs/master/results', { token: u.token })).body;
    const reasons = Object.fromEntries(master.ledger.map((l: any) => [l.id, l.reason]));
    assert.equal(reasons.base, '1 mission completed');
    assert.match(reasons.first_attempt, /on \d of 1 mission \(best attempts\)$/);
    assert.equal(reasons.no_hint, '1 of 1 mission without a hint');
    const hem = (await h.call('GET', '/api/labs/hematology/results', { token: u.token })).body;
    const hr = Object.fromEntries(hem.ledger.map((l: any) => [l.id, l.reason]));
    assert.equal(hr.base, '3 missions completed');
    assert.equal(hr.no_hint, '3 of 3 missions without a hint');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R10-A-09
const NOW = 1_700_000_000; // the harness clock, in seconds
test('R10-A-09: exactly one string is accepted per token (no extra segments, padding or whitespace)', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const u = await h.signup('Tokenholder');
    const [body, sig] = u.token.split('.') as [string, string];
    const bad = [`${u.token}.junk`, `${u.token}.`, `${u.token}..`, `${u.token}.${sig}`, `${u.token}=`, `${body}.${sig}=`, `${body}.${sig}==`, `${u.token}\n`, ` ${u.token}`, `${body}=.${sig}`, `.${u.token}`, `${body}.${sig}%00`];
    for (const t of bad) {
      assert.equal(verifyToken(t, 'test-secret', NOW), null, JSON.stringify(t));
      if (t === t.trim()) assert.equal((await h.call('GET', '/api/me', { token: t })).status, 401, JSON.stringify(t));
    }
    assert.equal((await h.call('GET', '/api/me', { token: u.token })).status, 200);
    assert.ok(verifyToken(u.token, 'test-secret', NOW));
    // Unpadded base64url with a flipped trailing bit encodes to a different string: refused as well.
    const last = sig.at(-1)!; const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const sibling = alphabet[(alphabet.indexOf(last) ^ 1)]!;
    assert.equal(verifyToken(`${body}.${sig.slice(0, -1)}${sibling}`, 'test-secret', NOW), null);
  } finally { await h.close(); }
});
