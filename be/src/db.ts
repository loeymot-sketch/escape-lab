// SQLite persistence (node:sqlite). Schema is versioned through PRAGMA user_version.
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student','teacher')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE class_members (
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (class_id, user_id)
  );
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress','completed')),
    current_step INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    wrong_total INTEGER NOT NULL DEFAULT 0,
    hints_total INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    result_json TEXT
  );
  CREATE INDEX idx_attempts_user ON attempts(user_id, mission_id, status);
  CREATE UNIQUE INDEX uq_attempt_active ON attempts(user_id, mission_id) WHERE status = 'in_progress';
  CREATE TABLE step_results (
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    competency TEXT NOT NULL,
    wrong INTEGER NOT NULL DEFAULT 0,
    hints INTEGER NOT NULL DEFAULT 0,
    solved_at INTEGER,
    PRIMARY KEY (attempt_id, step_id)
  );
  CREATE TABLE answer_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    correct INTEGER NOT NULL,
    response_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE hint_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    source TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE mission_best (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    best_score INTEGER NOT NULL,
    best_attempt_id TEXT NOT NULL,
    completions INTEGER NOT NULL,
    first_completed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, mission_id)
  );
  CREATE TABLE fragments (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_slug TEXT NOT NULL,
    position INTEGER NOT NULL,
    digit INTEGER NOT NULL,
    found_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, lab_slug, position)
  );
  CREATE TABLE lab_exits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_slug TEXT NOT NULL,
    exited_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, lab_slug)
  );
  CREATE TABLE code_tries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lab_slug TEXT NOT NULL,
    ok INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE badges_earned (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, badge_id)
  );
  `,
  `
  ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','fr'));
  ALTER TABLE users ADD COLUMN sound INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN reduce_motion INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN notifications INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN program TEXT;
  ALTER TABLE users ADD COLUMN study_level TEXT;
  ALTER TABLE users ADD COLUMN xp_carry INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE xp_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX idx_xp_events_user ON xp_events(user_id, at);
  INSERT INTO xp_events (user_id, mission_id, delta, at) SELECT user_id, mission_id, best_score, first_completed_at FROM mission_best;
  CREATE TABLE content_status (
    mission_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','approved')),
    reviewed_by TEXT,
    updated_at INTEGER NOT NULL
  );
  UPDATE badges_earned SET badge_id = CASE badge_id
    WHEN 'escape-hematology' THEN 'hematology-detective'
    WHEN 'escape-microbiology' THEN 'microbiology-investigator'
    WHEN 'escape-biochemistry' THEN 'biochemistry-analyst'
    ELSE badge_id END;
  DELETE FROM badges_earned WHERE badge_id IN ('first-fragment', 'sharp-eye');
  `,
  // An attempt left past its time limit is closed as 'expired' so the mission can be restarted.
  `
  CREATE TABLE attempts_new (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress','completed','expired')),
    current_step INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    wrong_total INTEGER NOT NULL DEFAULT 0,
    hints_total INTEGER NOT NULL DEFAULT 0,
    score INTEGER,
    result_json TEXT
  );
  INSERT INTO attempts_new (id, user_id, mission_id, status, current_step, started_at, completed_at, wrong_total, hints_total, score, result_json)
    SELECT id, user_id, mission_id, status, current_step, started_at, completed_at, wrong_total, hints_total, score, result_json FROM attempts;
  DROP TABLE attempts;
  ALTER TABLE attempts_new RENAME TO attempts;
  CREATE INDEX idx_attempts_user ON attempts(user_id, mission_id, status);
  CREATE UNIQUE INDEX uq_attempt_active ON attempts(user_id, mission_id) WHERE status = 'in_progress';
  `,
  // Integrity layer: hot-path indexes, invariants enforced by the database itself (so no code path can bypass them),
  // and an append-only audit trail for content review.
  `
  CREATE INDEX IF NOT EXISTS idx_attempts_active ON attempts(user_id, status, started_at);
  CREATE INDEX IF NOT EXISTS idx_attempts_mission ON attempts(mission_id, status);
  CREATE INDEX IF NOT EXISTS idx_step_results_step ON step_results(step_id);
  CREATE INDEX IF NOT EXISTS idx_answer_log_attempt ON answer_log(attempt_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_hint_log_attempt ON hint_log(attempt_id, step_id);
  CREATE INDEX IF NOT EXISTS idx_code_tries_user ON code_tries(user_id, lab_slug, created_at);
  CREATE INDEX IF NOT EXISTS idx_class_members_user ON class_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_fragments_user ON fragments(user_id, lab_slug);
  CREATE INDEX IF NOT EXISTS idx_badges_user ON badges_earned(user_id);
  CREATE INDEX IF NOT EXISTS idx_mission_best_attempt ON mission_best(best_attempt_id);

  CREATE TRIGGER attempts_valid_insert BEFORE INSERT ON attempts
  WHEN NEW.wrong_total < 0 OR NEW.hints_total < 0 OR NEW.current_step < 0 OR NEW.started_at < 0
    OR (NEW.score IS NOT NULL AND NEW.score < 0) OR (NEW.status = 'completed' AND NEW.completed_at IS NULL)
  BEGIN SELECT RAISE(ABORT, 'attempts: invalid row'); END;
  CREATE TRIGGER attempts_valid_update BEFORE UPDATE ON attempts
  WHEN NEW.wrong_total < 0 OR NEW.hints_total < 0 OR NEW.current_step < 0 OR NEW.started_at < 0
    OR (NEW.score IS NOT NULL AND NEW.score < 0) OR (NEW.status = 'completed' AND NEW.completed_at IS NULL)
    OR (OLD.status <> 'in_progress' AND NEW.status <> OLD.status)
    OR (OLD.status = 'completed' AND (NEW.mission_id <> OLD.mission_id OR NEW.user_id <> OLD.user_id OR NEW.started_at <> OLD.started_at))
  BEGIN SELECT RAISE(ABORT, 'attempts: invalid transition'); END;

  CREATE TRIGGER step_results_valid BEFORE UPDATE ON step_results
  WHEN NEW.wrong < 0 OR NEW.hints < 0
  BEGIN SELECT RAISE(ABORT, 'step_results: negative counter'); END;
  CREATE TRIGGER fragments_valid BEFORE INSERT ON fragments
  WHEN NEW.digit NOT BETWEEN 0 AND 9 OR NEW.position < 1
  BEGIN SELECT RAISE(ABORT, 'fragments: invalid digit or position'); END;
  CREATE TRIGGER code_tries_valid BEFORE INSERT ON code_tries
  WHEN NEW.ok NOT IN (0, 1)
  BEGIN SELECT RAISE(ABORT, 'code_tries: ok must be 0 or 1'); END;
  CREATE TRIGGER users_name_valid_insert BEFORE INSERT ON users
  WHEN length(trim(NEW.name)) = 0
  BEGIN SELECT RAISE(ABORT, 'users: blank name'); END;
  CREATE TRIGGER users_name_valid_update BEFORE UPDATE OF name ON users
  WHEN length(trim(NEW.name)) = 0
  BEGIN SELECT RAISE(ABORT, 'users: blank name'); END;
  CREATE TRIGGER users_role_immutable BEFORE UPDATE OF role ON users
  WHEN NEW.role <> OLD.role
  BEGIN SELECT RAISE(ABORT, 'users: role cannot change'); END;

  CREATE TABLE content_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    from_status TEXT NOT NULL CHECK (from_status IN ('draft','reviewed','approved')),
    to_status TEXT NOT NULL CHECK (to_status IN ('draft','reviewed','approved')),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    actor_name TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX idx_content_audit_mission ON content_audit(mission_id, id);
  CREATE TRIGGER content_audit_append_only_update BEFORE UPDATE ON content_audit BEGIN SELECT RAISE(ABORT, 'content_audit is append-only'); END;
  CREATE TRIGGER content_audit_append_only_delete BEFORE DELETE ON content_audit BEGIN SELECT RAISE(ABORT, 'content_audit is append-only'); END;
  `,
  // content_audit keeps the actor's id and name as a plain record: an FK would make it impossible to erase a teacher account.
  `
  CREATE TABLE content_audit_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id TEXT NOT NULL,
    from_status TEXT NOT NULL CHECK (from_status IN ('draft','reviewed','approved')),
    to_status TEXT NOT NULL CHECK (to_status IN ('draft','reviewed','approved')),
    actor_id INTEGER NOT NULL,
    actor_name TEXT NOT NULL,
    at INTEGER NOT NULL
  );
  INSERT INTO content_audit_new (id, mission_id, from_status, to_status, actor_id, actor_name, at)
    SELECT id, mission_id, from_status, to_status, actor_id, actor_name, at FROM content_audit;
  DROP TABLE content_audit;
  ALTER TABLE content_audit_new RENAME TO content_audit;
  CREATE INDEX idx_content_audit_mission ON content_audit(mission_id, id);
  CREATE TRIGGER content_audit_append_only_update BEFORE UPDATE ON content_audit BEGIN SELECT RAISE(ABORT, 'content_audit is append-only'); END;
  CREATE TRIGGER content_audit_append_only_delete BEFORE DELETE ON content_audit BEGIN SELECT RAISE(ABORT, 'content_audit is append-only'); END;
  `,
  // The text a learner paid for is kept with the hint log row, so it can be shown again after a refresh (AI-written hints cannot be regenerated).
  // Rows written before this migration keep a NULL text; the game backfills standard ones from the faculty-written hint when it reads them.
  `
  ALTER TABLE hint_log ADD COLUMN text TEXT;
  `,
  // is_demo_account marks the accounts created by seedDemo (they share the published demo password); with DEMO_MODE off only those are refused,
  // so a real person who registered on the demo domain before it was reserved keeps access. Backfill: the seeded accounts are the ones on the demo
  // domain whose password hash equals the demo teacher's (seedDemo hashes the published password once for all of them); nothing is flagged
  // when the demo teacher does not exist. Teacher names are compared in application code (canonical key), inside the write transaction.
  `
  ALTER TABLE users ADD COLUMN is_demo_account INTEGER NOT NULL DEFAULT 0;
  UPDATE users SET is_demo_account = 1
    WHERE lower(email) LIKE '%@demo.escape-lab.app'
      AND password_hash = (SELECT password_hash FROM users WHERE lower(email) = 'claire.moreau@demo.escape-lab.app');
  `,
];

export type DB = DatabaseSync;

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Applies pending migrations up to `target` (default: all). Table rebuilds must not cascade through foreign keys, which cannot be toggled inside a transaction, so enforcement is off while migrating and verified before each commit. */
export function migrate(db: DB, target = MIGRATIONS.length) {
  const version = () => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version() > MIGRATIONS.length) throw new Error(`Database schema v${version()} is newer than this build (v${MIGRATIONS.length}).`);
  if (version() >= target) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (let v = 0; v < target; v++) {
      // The version is re-read INSIDE a write transaction: a second process that started at the same moment waits here,
      // then sees the migration already applied instead of running it again over the finished schema.
      db.exec('BEGIN IMMEDIATE');
      try {
        if (version() > v) { db.exec('ROLLBACK'); continue; }
        db.exec(MIGRATIONS[v]!);
        db.exec(`PRAGMA user_version = ${v + 1}`);
        if ((db.prepare('PRAGMA foreign_key_check').all() as unknown[]).length) throw new Error(`Migration ${v + 1} left dangling foreign keys.`);
        db.exec('COMMIT');
      } catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
    }
  } finally { db.exec('PRAGMA foreign_keys = ON'); }
}

/** Structural health report; empty means healthy. */
export function integrityProblems(db: DB): string[] {
  const out: string[] = [];
  for (const r of db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>) if (r.integrity_check !== 'ok') out.push(`integrity: ${r.integrity_check}`);
  for (const r of db.prepare('PRAGMA foreign_key_check').all() as Array<{ table: string; rowid: number; parent: string }>) out.push(`foreign key: ${r.table}#${r.rowid} -> ${r.parent}`);
  return out;
}

/**
 * The database holds e-mail addresses and password hashes: owner-only for the file and its WAL/SHM sidecars (SQLite creates those with the main file's mode).
 * Only ever NARROWS a mode: a file the operator made read-only (no owner write bit) is left exactly as it is, with one warning when others can still read it.
 */
function restrictFiles(path: string) {
  for (const f of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (!existsSync(f)) continue;
      const mode = statSync(f).mode & 0o777;
      if ((mode & 0o200) === 0) {
        // Only reachable when the process can write anyway (root, or a file system that ignores the mode): a database the process cannot write is refused by openDb.
        if (f === path && (mode & 0o077)) console.warn(`Escape Lab: ${f} has no owner write permission (mode ${mode.toString(8).padStart(4, '0')}) and is readable by others; leaving it as it is. It holds e-mail addresses and password hashes: consider chmod 600.`);
        continue;
      }
      if (mode !== (mode & 0o600)) chmodSync(f, mode & 0o600);
    } catch { /* not ours to change (read-only mount, other owner): keep going */ }
  }
}

/**
 * SQLite opens a file the process may not write as a READ-ONLY connection without a word, and a WAL-mode database with a current schema then starts fine:
 * reads work and every write answers 500 (R14-A-02). The API cannot do anything useful in that state, so one real write is attempted at start-up and rolled
 * back (user_version is set to the value it already has inside BEGIN IMMEDIATE ... ROLLBACK: nothing is committed, but SQLite must be able to write). BEGIN IMMEDIATE
 * alone is not enough: on a read-only WAL database it succeeds and only the first write fails. The database is refused with one clear sentence when the
 * write fails because of read-only access. A lock held by another process is not "not writable": busy_timeout retries it, and any other error is rethrown as it is.
 */
function assertWritable(db: DatabaseSync, path: string) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    db.exec(`PRAGMA user_version = ${version}`);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
    if (/readonly/i.test(e instanceof Error ? e.message : String(e))) throw new Error(`the database file is not writable (read-only permissions or file system): ${path}. Sign-up, missions and progress need write access`);
    throw e;
  }
  db.exec('ROLLBACK');
}

export function openDb(path: string): DB {
  const onDisk = path !== ':memory:';
  if (onDisk) mkdirSync(dirname(path), { recursive: true });
  // A restrictive umask while SQLite creates the files, so there is no window with the default 0644; the chmod then covers files that already existed.
  let umask: number | undefined;
  if (onDisk) { try { umask = process.umask(0o077); } catch { /* worker threads cannot change the umask */ } }
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path);
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      // A database written by a newer build is refused BEFORE anything is changed: no journal-mode switch, no WAL files, no chmod.
      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      if (version > MIGRATIONS.length) throw new Error(`Database schema v${version} is newer than this build (v${MIGRATIONS.length}).`);
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
      if (onDisk) assertWritable(db, path);
    } catch (e) { try { db.close(); } catch { /* already closed */ } throw e; }
  } finally { if (umask !== undefined) process.umask(umask); }
  if (onDisk) restrictFiles(path);
  migrate(db);
  if (path !== ':memory:') {
    const problems = (db.prepare('PRAGMA quick_check').all() as Array<{ quick_check: string }>).filter((r) => r.quick_check !== 'ok').map((r) => `quick_check: ${r.quick_check}`);
    if (problems.length) { db.close(); throw new Error(`Database failed its startup check: ${problems.join('; ')}`); }
  }
  return db;
}

/** Runs `fn` in a transaction (BEGIN IMMEDIATE so concurrent writers serialize). */
export function tx<T>(db: DB, fn: () => T): T {
  // Already inside a transaction (the demo reset replays the whole story inside one): a savepoint, so the inner work still commits or rolls back as a unit.
  if (db.isTransaction) {
    db.exec('SAVEPOINT el_tx');
    try { const r = fn(); db.exec('RELEASE el_tx'); return r; } catch (e) { db.exec('ROLLBACK TO el_tx'); db.exec('RELEASE el_tx'); throw e; }
  }
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
