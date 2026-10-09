// Worker for r16-fixes.test.ts (R16-A-05): one SQLite connection and one Game per thread, resets released together on a spin barrier each round.
import { parentPort, workerData } from 'node:worker_threads';
import { resetDemoStudent } from '../src/demo.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';

const { path, uid, rounds, barrier } = workerData as { path: string; uid: number; rounds: number; barrier: SharedArrayBuffer };
const b = new Int32Array(barrier);
const db = openDb(path);
const game = new Game(db);
const results: string[] = [];
for (let r = 0; r < rounds; r++) {
  Atomics.add(b, 0, 1);
  while (Atomics.load(b, 0) < 2 * (r + 1)) { /* spin: both threads start the round together */ }
  try { await resetDemoStudent(db, game, uid); results.push('ok'); } catch (e) { results.push((e as { code?: string }).code ?? String((e as Error).message)); }
}
db.close();
parentPort!.postMessage(results);
