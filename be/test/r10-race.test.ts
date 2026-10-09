import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { openDb } from '../src/db.ts';

// R10-A-01 (c): two connections on one database file (two threads, truly parallel) must never both win the same teacher name.
const ROUNDS = 300;

async function race(mode: 'rename' | 'register') {
  const dir = mkdtempSync(join(tmpdir(), 'el-race-'));
  const path = join(dir, 'race.db');
  try {
    const db = openDb(path);
    const ins = db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?,?,?,'teacher',1)");
    const a = Number(ins.run('a@uni.edu', 'Teacher A', 'x').lastInsertRowid);
    const b = Number(ins.run('b@uni.edu', 'Teacher B', 'x').lastInsertRowid);
    db.close();
    const barrier = new SharedArrayBuffer(4);
    const run = (uid: number, who: string) => new Promise<string[]>((res, rej) => {
      const w = new Worker(new URL('./race-worker.ts', import.meta.url), { workerData: { path, uid, who, rounds: ROUNDS, mode, barrier } });
      w.once('message', res); w.once('error', rej);
    });
    const [ra, rb] = await Promise.all([run(a, 'a'), run(b, 'b')]);
    const both = ra.map((x, i) => (x === 'ok' && rb[i] === 'ok' ? i : -1)).filter((i) => i >= 0);
    const neither = ra.map((x, i) => (x !== 'ok' && rb[i] !== 'ok' ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(both, [], `rounds where both threads got the same name: ${both.slice(0, 10)}`);
    assert.deepEqual(neither, [], `rounds where nobody got it: ${neither.slice(0, 10)} ${[...new Set([...ra, ...rb])]}`);
    for (const r of [...ra, ...rb]) assert.ok(r === 'ok' || r === 'name_taken', r);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('R10-A-01: two connections renaming to the same fresh name: exactly one wins every round', () => race('rename'));
test('R10-A-01: two connections registering the same fresh teacher name: exactly one wins every round', () => race('register'));
