// Worker for r17-fixes.test.ts: one SQLite connection and one Game per thread (= one process on the same file), all threads play the SAME students at once.
import { parentPort, workerData } from 'node:worker_threads';
import { MISSION_BY_ID } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { Game } from '../src/game.ts';
import { correct } from './helpers.ts';

const { path, uids, ms } = workerData as { path: string; uids: number[]; ms: number };
const db = openDb(path);
// A provider that answers after a random delay, so a hint regularly finishes after the attempt was completed by another thread.
const assistant = { hint: async () => { await new Promise((r) => setTimeout(r, Math.random() * 15)); return Math.random() < 0.5 ? 'Look at the stain colour and shape.' : null; } };
const game = new Game(db, { assistant });
const stat: Record<string, number> = {};
const bump = (k: string) => { stat[k] = (stat[k] ?? 0) + 1; };
const end = Date.now() + ms;
const mids = ['hem-01', 'hem-02', 'hem-03'];
const pending: Promise<unknown>[] = [];
const play = async (uid: number) => {
  while (Date.now() < end) {
    const m = MISSION_BY_ID.get(mids[Math.floor(Math.random() * mids.length)]!)!;
    let id: string;
    try { id = game.startMission(uid, m.id).attempt.attemptId; } catch (e) { bump(`start:${(e as { code?: string }).code}`); await new Promise((r) => setTimeout(r, 1)); continue; }
    for (const s of m.steps) {
      // Fire a hint WITHOUT waiting for the provider, then answer: another thread may complete the attempt while the provider is still thinking.
      if (Math.random() < 0.6) pending.push(game.hint(uid, id, s.id).then(() => bump('hint ok'), (e) => bump(`hint:${(e as { code?: string }).code ?? (e as Error).message}`)));
      await new Promise((r) => setTimeout(r, Math.random() * 6));
      try { game.answer(uid, id, s.id, correct(s)); bump('answer ok'); } catch (e) { bump(`answer:${(e as { code?: string }).code ?? (e as Error).message}`); break; }
    }
  }
};
await Promise.all(uids.map(play));
await Promise.allSettled(pending);
db.close();
parentPort!.postMessage(stat);
