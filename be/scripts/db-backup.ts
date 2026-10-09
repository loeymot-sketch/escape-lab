// Consistent online backup (safe while the API runs):  DB_PATH=./data/escape-lab.db npm run db:backup [-- ./backups/out.db]
import { chmodSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { integrityProblems } from '../src/db.ts';

const src = process.env.DB_PATH || './data/escape-lab.db';
// An explicitly empty path is a mistake (an unset shell variable), not "use the default": say how to call the script.
if (process.argv[2] !== undefined && process.argv[2].trim() === '') { console.error('Usage: npm run db:backup [-- <output-file>]  (the output path must not be empty; DB_PATH selects the database)'); process.exit(1); }
const out = process.argv[2] ?? `./backups/escape-lab-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
// A bad destination is a user error, not a crash: one line on stderr, exit code 1 (2 is kept for "nothing to back up" / "would overwrite").
const fail = (what: string, e: unknown): never => {
  console.error(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
if (!existsSync(src)) { console.error(`No database at ${src}`); process.exit(2); }
// existsSync follows symlinks: a dangling link at `out` passes this guard and fails below with a clean message when its target cannot be created.
if (existsSync(out)) { console.error(`Refusing to overwrite ${out}`); process.exit(2); }
// The copy holds e-mail addresses and password hashes, like the database: owner-only (0600 file, 0700 directories it creates), whatever the umask.
process.umask(0o077);
try { mkdirSync(dirname(out), { recursive: true, mode: 0o700 }); } catch (e) { fail(`Cannot back up to ${out}`, e); }
try {
  const db = new DatabaseSync(src, { readOnly: true });
  // Parallel runs (or a busy API) briefly lock each other out: wait instead of failing with "database is locked".
  db.exec('PRAGMA busy_timeout = 10000');
  try { db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`); } finally { db.close(); }
  chmodSync(out, 0o600);
} catch (e) {
  // Two runs to the same target: the one that loses finds the file the winner created (VACUUM INTO: "output file already exists", or "database is locked"
  // while the winner is still writing). That is the same refusal as an existing file, and the winner's copy is left alone.
  if (existsSync(out) && /already exists|locked|busy/i.test(e instanceof Error ? e.message : String(e))) { console.error(`Refusing to overwrite ${out}`); process.exit(2); }
  fail(`Cannot back up to ${out}`, e);
}
const copy = new DatabaseSync(out, { readOnly: true });
const problems = integrityProblems(copy);
copy.close();
if (problems.length) { rmSync(out); console.error(`Backup failed verification: ${problems.join('; ')}`); process.exit(1); }
console.log(`Backup verified: ${out}`);
