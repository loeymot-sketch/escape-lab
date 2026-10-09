import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SCHEMA_VERSION, integrityProblems, migrate, openDb } from '../src/db.ts';
import { seedDemo } from '../src/demo.ts';
import { correct, harness } from './helpers.ts';
import { MISSION_BY_ID } from '../src/content.ts';

const fresh = () => openDb(':memory:');
const user = (db: DatabaseSync, email = 'a@b.co', role = 'student') =>
  Number(db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?, 'Ann', 'x', ?, 1)").run(email, role).lastInsertRowid);
const throws = (fn: () => unknown, re: RegExp) => assert.throws(fn, re);

test('a fresh database sits at the current schema version and is healthy', () => {
  const db = fresh();
  assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
  assert.deepEqual(integrityProblems(db), []);
});

test('a database from a newer build is refused instead of being silently downgraded', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  throws(() => migrate(db), /newer than this build/);
});

test('every historical schema version upgrades in place without losing a row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'escape-mig-'));
  try {
    for (let from = 1; from < SCHEMA_VERSION; from++) {
      const path = join(dir, `v${from}.db`);
      const db = new DatabaseSync(path);
      db.exec('PRAGMA foreign_keys = ON');
      migrate(db, from);
      // Populate every table that exists at this version.
      db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('s@b.co','S','x','student',1)").run();
      db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at) VALUES ('att',1,'hem-01','in_progress',0,1)").run();
      db.prepare("INSERT INTO step_results (attempt_id, step_id, competency) VALUES ('att','s1','c')").run();
      db.prepare("INSERT INTO answer_log (attempt_id, step_id, correct, response_json, created_at) VALUES ('att','s1',0,'{}',1)").run();
      db.prepare("INSERT INTO hint_log (attempt_id, step_id, level, source, created_at) VALUES ('att','s1',1,'standard',1)").run();
      db.prepare("INSERT INTO fragments (user_id, lab_slug, position, digit, found_at) VALUES (1,'hematology',1,7,1)").run();
      const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
      const before = ['users', 'attempts', 'step_results', 'answer_log', 'hint_log', 'fragments'].map(count);
      db.close();

      const up = openDb(path);
      assert.deepEqual(['users', 'attempts', 'step_results', 'answer_log', 'hint_log', 'fragments'].map((t) => (up.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n), before, `v${from}`);
      assert.deepEqual(integrityProblems(up), [], `v${from}`);
      assert.equal((up.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
      up.prepare("UPDATE attempts SET status = 'expired' WHERE id = 'att'").run();
      up.close();
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the database itself rejects impossible attempt rows and illegal transitions', () => {
  const db = fresh();
  const uid = user(db);
  const ins = (id: string, extra = '') => db.prepare(`INSERT INTO attempts (id, user_id, mission_id, status, started_at ${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?, 'hem-01', 'in_progress', 5 ${extra ? ', ' + extra.split('=')[1] : ''})`).run(id, uid);
  throws(() => ins('neg', 'wrong_total=-1'), /invalid row/);
  throws(() => ins('negscore', 'score=-5'), /invalid row/);
  throws(() => db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, started_at) VALUES ('c', ?, 'hem-01', 'completed', 5)").run(uid), /invalid row/);
  ins('ok');
  throws(() => db.prepare("UPDATE attempts SET hints_total = -1 WHERE id = 'ok'").run(), /invalid transition/);
  db.prepare("UPDATE attempts SET status = 'completed', completed_at = 9, score = 100 WHERE id = 'ok'").run();
  throws(() => db.prepare("UPDATE attempts SET status = 'in_progress' WHERE id = 'ok'").run(), /invalid transition/);
  throws(() => db.prepare("UPDATE attempts SET mission_id = 'hem-02' WHERE id = 'ok'").run(), /invalid transition/);
  ins('stale');
  db.prepare("UPDATE attempts SET status = 'expired' WHERE id = 'stale'").run();
  throws(() => db.prepare("UPDATE attempts SET status = 'in_progress' WHERE id = 'stale'").run(), /invalid transition/);
});

test('the database rejects blank names, role changes, bad digits and a second active attempt', () => {
  const db = fresh();
  const uid = user(db);
  throws(() => db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('x@b.co','   ','x','student',1)").run(), /blank name/);
  throws(() => db.prepare("UPDATE users SET name = '  ' WHERE id = ?").run(uid), /blank name/);
  throws(() => db.prepare("UPDATE users SET role = 'teacher' WHERE id = ?").run(uid), /role cannot change/);
  throws(() => db.prepare("INSERT INTO fragments (user_id, lab_slug, position, digit, found_at) VALUES (?, 'hematology', 1, 10, 1)").run(uid), /invalid digit/);
  throws(() => db.prepare("INSERT INTO fragments (user_id, lab_slug, position, digit, found_at) VALUES (?, 'hematology', 0, 3, 1)").run(uid), /invalid digit/);
  throws(() => db.prepare("INSERT INTO code_tries (user_id, lab_slug, ok, created_at) VALUES (?, 'hematology', 2, 1)").run(uid), /ok must be 0 or 1/);
  db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, started_at) VALUES ('a1', ?, 'hem-01', 'in_progress', 1)").run(uid);
  throws(() => db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, started_at) VALUES ('a2', ?, 'hem-01', 'in_progress', 2)").run(uid), /UNIQUE/);
  throws(() => db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, started_at) VALUES ('a3', 999, 'hem-01', 'in_progress', 2)").run(), /FOREIGN KEY/);
});

test('deleting a user cascades to everything they own and leaves no orphan', () => {
  const db = fresh();
  const uid = user(db);
  db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, started_at) VALUES ('a1', ?, 'hem-01', 'in_progress', 1)").run(uid);
  db.prepare("INSERT INTO step_results (attempt_id, step_id, competency) VALUES ('a1','s','c')").run();
  db.prepare("INSERT INTO answer_log (attempt_id, step_id, correct, response_json, created_at) VALUES ('a1','s',1,'{}',1)").run();
  db.prepare("INSERT INTO badges_earned (user_id, badge_id, earned_at) VALUES (?, 'x', 1)").run(uid);
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  for (const t of ['attempts', 'step_results', 'answer_log', 'badges_earned']) assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n, 0, t);
  assert.deepEqual(integrityProblems(db), []);
});

test('hot queries use indexes rather than table scans', () => {
  const db = fresh();
  const plan = (sql: string) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{ detail: string }>).map((r) => r.detail).join(' | ');
  assert.match(plan("SELECT * FROM attempts WHERE user_id = 1 AND status = 'in_progress'"), /USING (COVERING )?INDEX/);
  assert.match(plan('SELECT * FROM answer_log WHERE attempt_id = ?'), /USING (COVERING )?INDEX/);
  assert.match(plan('SELECT * FROM hint_log WHERE attempt_id = ?'), /USING (COVERING )?INDEX/);
  assert.match(plan('SELECT * FROM code_tries WHERE user_id = 1 AND lab_slug = ?'), /USING (COVERING )?INDEX/);
  assert.match(plan('SELECT * FROM class_members WHERE user_id = 1'), /USING (COVERING )?INDEX/);
  assert.match(plan('SELECT * FROM xp_events WHERE user_id = 1 AND at > 5'), /USING (COVERING )?INDEX/);
});

test('the seeded demo database passes every integrity check and the content audit is append-only', async () => {
  const db = fresh();
  assert.ok(await seedDemo(db, 1_700_000_000_000));
  assert.deepEqual(integrityProblems(db), []);
  assert.ok((db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n >= 39);
  const teacher = (db.prepare("SELECT id FROM users WHERE role = 'teacher' LIMIT 1").get() as { id: number }).id;
  db.prepare("INSERT INTO content_audit (mission_id, from_status, to_status, actor_id, actor_name, at) VALUES ('hem-01','draft','reviewed',?, 'T', 1)").run(teacher);
  throws(() => db.prepare('UPDATE content_audit SET actor_name = ?').run('x'), /append-only/);
  throws(() => db.prepare('DELETE FROM content_audit').run(), /append-only/);
});

test('every content review transition is recorded with who, from and to', async () => {
  const h = await harness({ teacherInviteCode: 'T-INVITE' });
  try {
    const a = await h.signup('Prof A', 'a@uni.edu', { teacherInviteCode: 'T-INVITE' });
    const b = await h.signup('Prof B', 'b@uni.edu', { teacherInviteCode: 'T-INVITE' });
    const put = (token: string, status: string) => h.call('PUT', '/api/content/missions/hem-01/status', { token, body: { status } });
    assert.equal((await put(a.token, 'reviewed')).status, 200);
    assert.equal((await put(b.token, 'approved')).status, 200);
    assert.equal((await put(b.token, 'draft')).status, 200);
    const rows = h.app.db.prepare('SELECT from_status, to_status, actor_name FROM content_audit WHERE mission_id = ? ORDER BY id').all('hem-01');
    assert.deepEqual(rows.map((r) => ({ ...r })), [
      { from_status: 'draft', to_status: 'reviewed', actor_name: `Prof A (teacher #${a.id})` },
      { from_status: 'reviewed', to_status: 'approved', actor_name: `Prof B (teacher #${b.id})` },
      { from_status: 'approved', to_status: 'draft', actor_name: `Prof B (teacher #${b.id})` },
    ]);
    assert.equal((await put(a.token, 'approved')).status, 409, 'a draft cannot jump to approved');
    assert.equal((h.app.db.prepare('SELECT COUNT(*) AS n FROM content_audit').get() as { n: number }).n, 3, 'rejected transitions are not logged');
  } finally { await h.close(); }
});

test('a played mission leaves a consistent ledger: answers, hints, xp and best score agree', async () => {
  const h = await harness();
  try {
    const u = await h.signup('Ledger');
    const m = MISSION_BY_ID.get('hem-01')!;
    const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    const done = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(done.body.completed, true);
    const db = h.app.db;
    const att = db.prepare('SELECT status, score, completed_at FROM attempts WHERE id = ?').get(a.attemptId) as { status: string; score: number; completed_at: number };
    assert.equal(att.status, 'completed');
    const best = db.prepare('SELECT best_score, best_attempt_id FROM mission_best WHERE user_id = ? AND mission_id = ?').get(u.id, 'hem-01') as { best_score: number; best_attempt_id: string };
    assert.equal(best.best_score, att.score);
    assert.equal(best.best_attempt_id, a.attemptId);
    const xp = db.prepare('SELECT SUM(delta) AS s FROM xp_events WHERE user_id = ?').get(u.id) as { s: number };
    assert.equal(xp.s, att.score);
    assert.deepEqual(integrityProblems(db), []);
  } finally { await h.close(); }
});

test('a teacher who changed content status can still be erased; the audit rows stay', async () => {
  const h = await harness({ teacherInviteCode: 'T-INVITE' });
  try {
    const t = await h.signup('Erase Me', 'erase@uni.edu', { teacherInviteCode: 'T-INVITE' });
    assert.equal((await h.call('PUT', '/api/content/missions/hem-01/status', { token: t.token, body: { status: 'reviewed' } })).status, 200);
    h.app.db.prepare('DELETE FROM users WHERE id = ?').run(t.id);
    assert.equal((h.app.db.prepare('SELECT COUNT(*) AS n FROM content_audit').get() as { n: number }).n, 1);
    assert.deepEqual(integrityProblems(h.app.db), []);
  } finally { await h.close(); }
});
