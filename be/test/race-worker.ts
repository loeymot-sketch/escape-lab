// Worker for r10-race.test.ts: one SQLite connection and one Game per thread, released together on a spin barrier each round.
import { parentPort, workerData } from 'node:worker_threads';
import { hashPassword } from '../src/auth.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';

const { path, uid, who, rounds, mode, barrier } = workerData as { path: string; uid: number; who: string; rounds: number; mode: 'rename' | 'register'; barrier: SharedArrayBuffer };
const b = new Int32Array(barrier);
const db = openDb(path);
const game = new Game(db);
const hash = await hashPassword('correct horse battery');
const results: string[] = [];
for (let r = 0; r < rounds; r++) {
  Atomics.add(b, 0, 1);
  while (Atomics.load(b, 0) < 2 * (r + 1)) { /* spin: both threads start the round together */ }
  try {
    if (mode === 'rename') game.updateProfile(uid, { name: `Race Name ${r}` });
    else (game as unknown as { createAccount: (e: string, n: string, h: string, role: string, at: number) => number }).createAccount(`${who}-${r}@uni.edu`, `Reg Name ${r}`, hash, 'teacher', Date.now());
    results.push('ok');
  } catch (e) { results.push((e as { code?: string }).code ?? String((e as Error).message)); }
}
db.close();
parentPort!.postMessage(results);
