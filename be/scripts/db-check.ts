// Read-only health check:  DB_PATH=./data/escape-lab.db npm run db:check
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_VERSION, integrityProblems } from '../src/db.ts';

const path = process.env.DB_PATH || './data/escape-lab.db';
if (!existsSync(path)) { console.error(`No database at ${path}`); process.exit(2); }
const db = new DatabaseSync(path, { readOnly: true });
const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const problems = integrityProblems(db);
if (version !== SCHEMA_VERSION) problems.push(`schema version ${version}, this build expects ${SCHEMA_VERSION} (start the API once to migrate)`);
const counts = Object.fromEntries(['users', 'attempts', 'answer_log', 'mission_best', 'fragments', 'lab_exits', 'content_audit'].map((t) => {
  try { return [t, (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n]; } catch { return [t, 'missing']; }
}));
console.log(JSON.stringify({ path, schemaVersion: version, counts, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
