// Teacher Studio service: rooms, uploaded pictures, attempts on rooms and the results views. Server-authoritative like the Game:
// the learner receives answer-free questions, every answer is graded and scored here, and the teacher's results are computed here.
import { randomBytes, randomUUID } from 'node:crypto';
import { MISSION_BY_ID } from './content.ts';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { ApiError, conflict, forbidden, notFound } from './http.ts';
import { decodeImage } from './media.ts';
import {
  ROOM_RULES, earnedPoints, expectedAnswer, foldText, fragmentSlices, fromPublic, grade, maxPoints, publicQuestion, qualityCheck, roomFromMission, seededShuffle, validateRoomDoc,
} from './rooms.ts';
import type { PublicQuestion, Question, RoomDoc, Verdict } from './rooms.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any[];
export type RoomStatus = 'draft' | 'published' | 'archived';
type AttemptStatus = 'in_progress' | 'vault' | 'completed' | 'timeout';

interface RoomRow { id: string; teacher_id: number; title: string; status: RoomStatus; version: number; doc_json: string; showcase: number; created_at: number; updated_at: number; published_at: number | null }
interface AttemptRow {
  id: string; room_id: string; user_id: number; room_version: number; doc_json: string; salt: string; order_json: string; status: AttemptStatus; current: number;
  started_at: number; completed_at: number | null; score: number; max_score: number; correct: number; wrong_total: number; hints_total: number; traps_total: number; vault_tries: number;
}
interface AnswerRow { attempt_id: string; question_id: string; correct: number; trap: number; fraction: number; response_json: string; created_at: number }

/** Upload quota of one teacher account (the demo teacher is shared by every visitor). */
export const MEDIA_QUOTA = { files: 120, bytes: 120 * 1024 * 1024 };
export const MAX_ROOMS_PER_TEACHER = 100;

const pct = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

export class Studio {
  db: DB;
  now: () => number;
  constructor(db: DB, now: () => number = Date.now) { this.db = db; this.now = now; }

  private readonly statements = new Map<string, ReturnType<DB['prepare']>>();
  private stmt(sql: string) {
    let s = this.statements.get(sql);
    if (!s) { s = this.db.prepare(sql); this.statements.set(sql, s); }
    return s;
  }
  private one<T>(sql: string, ...p: P): T | undefined { return this.stmt(sql).get(...p) as T | undefined; }
  private all<T>(sql: string, ...p: P): T[] { return this.stmt(sql).all(...p) as T[]; }
  private run(sql: string, ...p: P) { return this.stmt(sql).run(...p); }

  // ------------------------------------------------------------------ media
  uploadMedia(teacherId: number, data: string, name: string) {
    const { bytes, info } = decodeImage(data);
    const used = this.one<{ n: number; total: number | null }>('SELECT COUNT(*) AS n, SUM(size) AS total FROM media WHERE owner_id = ?', teacherId)!;
    if (used.n >= MEDIA_QUOTA.files || (used.total ?? 0) + bytes.length > MEDIA_QUOTA.bytes) {
      throw conflict('media_quota', 'Your picture library is full: delete pictures you no longer use, then try again.', { files: used.n, bytes: used.total ?? 0, quota: MEDIA_QUOTA });
    }
    const id = randomBytes(16).toString('hex');
    this.run('INSERT INTO media (id, owner_id, mime, width, height, size, name, bytes, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, teacherId, info.mime, info.width, info.height, bytes.length, name.slice(0, 120), bytes, this.now());
    return { id, mime: info.mime, width: info.width, height: info.height, size: bytes.length, name: name.slice(0, 120) };
  }

  listMedia(teacherId: number) {
    const rows = this.all<{ id: string; mime: string; width: number; height: number; size: number; name: string; created_at: number }>(
      'SELECT id, mime, width, height, size, name, created_at FROM media WHERE owner_id = ? ORDER BY created_at DESC, id', teacherId,
    );
    const used = rows.reduce((s, r) => s + r.size, 0);
    return { media: rows.map((r) => ({ id: r.id, mime: r.mime, width: r.width, height: r.height, size: r.size, name: r.name, createdAt: r.created_at })), quota: { ...MEDIA_QUOTA, usedFiles: rows.length, usedBytes: used } };
  }

  deleteMedia(teacherId: number, id: string) {
    const row = this.one<{ owner_id: number }>('SELECT owner_id FROM media WHERE id = ?', id);
    if (!row || row.owner_id !== teacherId) throw notFound('Picture not found.');
    // A picture a room still shows cannot disappear under it (attempts keep their snapshot, but the bytes are shared).
    const used = this.all<{ id: string; title: string }>('SELECT id, title FROM rooms WHERE teacher_id = ? AND instr(doc_json, ?) > 0', teacherId, `"media":"${id}"`);
    const inAttempts = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM room_attempts WHERE instr(doc_json, ?) > 0', `"media":"${id}"`)!.n;
    if (used.length || inAttempts) throw conflict('media_in_use', 'This picture is used by a room or by past attempts and cannot be deleted.', { rooms: used.map((r) => r.title), attempts: inAttempts });
    this.run('DELETE FROM media WHERE id = ?', id);
    return { deleted: true };
  }

  /** Public bytes of a picture (capability URL: the id is 128 random bits). */
  mediaBytes(id: string): { mime: string; bytes: Uint8Array } | null {
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    return this.one<{ mime: string; bytes: Uint8Array }>('SELECT mime, bytes FROM media WHERE id = ?', id) ?? null;
  }

  private mediaLookup(teacherId: number) {
    return (id: string) => this.one<{ width: number; height: number }>('SELECT width, height FROM media WHERE id = ? AND owner_id = ?', id, teacherId) ?? null;
  }

  // ------------------------------------------------------------------ rooms (teacher)
  private ownRoom(teacherId: number, id: string): RoomRow {
    const r = this.one<RoomRow>('SELECT * FROM rooms WHERE id = ?', id);
    if (!r || r.teacher_id !== teacherId) throw notFound('Room not found.');
    return r;
  }
  private classIds(roomId: string): number[] {
    return this.all<{ class_id: number }>('SELECT class_id FROM room_classes WHERE room_id = ? ORDER BY class_id', roomId).map((r) => r.class_id);
  }
  private roomStats(roomId: string) {
    const r = this.one<{ attempts: number; students: number; finished: number; avg: number | null }>(
      `SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS students, SUM(status IN ('completed','timeout')) AS finished,
        AVG(CASE WHEN status IN ('completed','timeout') AND max_score > 0 THEN 100.0 * score / max_score END) AS avg
       FROM room_attempts WHERE room_id = ?`, roomId)!;
    return { attempts: r.attempts, students: r.students, finished: r.finished ?? 0, avgPct: r.avg === null ? null : Math.round(r.avg) };
  }

  private roomView(r: RoomRow) {
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    return {
      id: r.id, status: r.status, version: r.version, showcase: r.showcase === 1, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
      classIds: this.classIds(r.id), doc, quality: qualityCheck(doc), stats: this.roomStats(r.id), maxScore: maxPoints(doc),
    };
  }

  listRooms(teacherId: number) {
    const rows = this.all<RoomRow>('SELECT * FROM rooms WHERE teacher_id = ? ORDER BY status = \'archived\', updated_at DESC, id', teacherId);
    return {
      rooms: rows.map((r) => {
        const doc = JSON.parse(r.doc_json) as RoomDoc;
        return {
          id: r.id, title: doc.title, summary: doc.summary, discipline: doc.discipline, mode: doc.mode, status: r.status, version: r.version, showcase: r.showcase === 1,
          questions: doc.questions.length, types: [...new Set(doc.questions.map((q) => q.type))], cover: doc.cover ?? null, timeLimitSec: doc.timeLimitSec,
          updatedAt: r.updated_at, publishedAt: r.published_at, classIds: this.classIds(r.id), stats: this.roomStats(r.id), quality: qualityCheck(doc).score,
        };
      }),
      limits: { rooms: MAX_ROOMS_PER_TEACHER, questions: ROOM_RULES.maxQuestions },
    };
  }

  getRoom(teacherId: number, id: string) { return this.roomView(this.ownRoom(teacherId, id)); }

  createRoom(teacherId: number, input: { doc?: unknown; fromMission?: string; classIds?: number[] }) {
    const n = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM rooms WHERE teacher_id = ?', teacherId)!.n;
    if (n >= MAX_ROOMS_PER_TEACHER) throw conflict('room_limit_reached', `A teacher can keep at most ${MAX_ROOMS_PER_TEACHER} rooms: delete or reuse one.`);
    let doc: RoomDoc;
    if (input.fromMission !== undefined) {
      const m = MISSION_BY_ID.get(input.fromMission);
      if (!m) throw notFound('No built-in mission has this id.');
      doc = validateRoomDoc(roomFromMission(m), this.mediaLookup(teacherId));
    } else {
      doc = validateRoomDoc(input.doc ?? { title: 'New room', questions: [] }, this.mediaLookup(teacherId));
    }
    const classes = this.ownClassIds(teacherId, input.classIds);
    const id = `room-${randomBytes(6).toString('hex')}`;
    const t = this.now();
    tx(this.db, () => {
      this.run('INSERT INTO rooms (id, teacher_id, title, status, version, doc_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', id, teacherId, doc.title, 'draft', 1, JSON.stringify(doc), t, t);
      for (const c of classes) this.run('INSERT INTO room_classes (room_id, class_id) VALUES (?,?)', id, c);
    });
    return this.getRoom(teacherId, id);
  }

  /** Every class of the teacher when `ids` is omitted; otherwise the listed ones, all of which must be the teacher's. */
  private ownClassIds(teacherId: number, ids: number[] | undefined): number[] {
    const own = this.all<{ id: number }>('SELECT id FROM classes WHERE teacher_id = ? ORDER BY id', teacherId).map((r) => r.id);
    if (ids === undefined) return own;
    const unique = [...new Set(ids)];
    const foreign = unique.filter((x) => !own.includes(x));
    if (foreign.length) throw forbidden('You can only assign a room to your own classes.', 'not_your_class', { classIds: foreign });
    return unique;
  }

  saveRoom(teacherId: number, id: string, rawDoc: unknown, version: number) {
    const r = this.ownRoom(teacherId, id);
    if (r.version !== version) throw conflict('version_conflict', 'This room was changed elsewhere since you opened it. Reload it to see the latest version.', { currentVersion: r.version });
    const doc = validateRoomDoc(rawDoc, this.mediaLookup(teacherId), { publish: r.status === 'published' });
    if (r.status === 'published') this.assertPublishable(doc);
    this.run('UPDATE rooms SET doc_json = ?, title = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?', JSON.stringify(doc), doc.title, this.now(), id, version);
    return this.getRoom(teacherId, id);
  }

  private assertPublishable(doc: RoomDoc) {
    const errors = qualityCheck(doc).notes.filter((n) => n.level === 'error');
    if (errors.length) throw new ApiError(422, 'room_not_ready', 'Fix the problems marked as errors before publishing.', errors.map((e) => e.message));
  }

  setStatus(teacherId: number, id: string, status: RoomStatus) {
    const r = this.ownRoom(teacherId, id);
    if (status === 'published') {
      const doc = validateRoomDoc(JSON.parse(r.doc_json), this.mediaLookup(teacherId), { publish: true });
      this.assertPublishable(doc);
      if (this.classIds(id).length === 0) throw new ApiError(422, 'room_not_ready', 'Choose at least one class before publishing: nobody could play this room.', ['no class assigned']);
    }
    this.run('UPDATE rooms SET status = ?, updated_at = ?, published_at = CASE WHEN ? = \'published\' THEN COALESCE(published_at, ?) ELSE published_at END WHERE id = ?', status, this.now(), status, this.now(), id);
    return this.getRoom(teacherId, id);
  }

  setClasses(teacherId: number, id: string, classIds: number[]) {
    const r = this.ownRoom(teacherId, id);
    const classes = this.ownClassIds(teacherId, classIds);
    if (r.status === 'published' && classes.length === 0) throw new ApiError(422, 'room_not_ready', 'A published room needs at least one class. Unpublish it first to remove every class.', ['no class assigned']);
    tx(this.db, () => {
      this.run('DELETE FROM room_classes WHERE room_id = ?', id);
      for (const c of classes) this.run('INSERT INTO room_classes (room_id, class_id) VALUES (?,?)', id, c);
      this.run('UPDATE rooms SET updated_at = ? WHERE id = ?', this.now(), id);
    });
    return this.getRoom(teacherId, id);
  }

  duplicateRoom(teacherId: number, id: string) {
    const r = this.ownRoom(teacherId, id);
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    const title = `${doc.title} (copy)`.slice(0, 100);
    return this.createRoom(teacherId, { doc: { ...doc, title }, classIds: this.classIds(id) });
  }

  deleteRoom(teacherId: number, id: string) {
    this.ownRoom(teacherId, id);
    this.run('DELETE FROM rooms WHERE id = ?', id);
    return { deleted: true };
  }

  /** Answer-free questions exactly as a learner would see them, for the teacher's "play as a student" preview (nothing is recorded). */
  preview(teacherId: number, id: string) {
    const r = this.ownRoom(teacherId, id);
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    const seed = `preview:${r.id}:${r.version}`;
    return { roomId: r.id, version: r.version, title: doc.title, mode: doc.mode, intro: doc.intro, vaultCode: doc.vaultCode, questions: doc.questions.map((q) => publicQuestion(q, seed, doc.shuffleOptions)) };
  }

  previewCheck(teacherId: number, id: string, questionId: string, response: unknown) {
    const r = this.ownRoom(teacherId, id);
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    const q = doc.questions.find((x) => x.id === questionId);
    if (!q) throw notFound('No question with this id in the saved room. Save your changes first.');
    const v = grade(q, fromPublic(q, response, `preview:${r.id}:${r.version}`));
    return { correct: v.correct, fraction: v.fraction, trap: v.trap, feedback: v.feedback ?? null, explanation: q.explanation, hits: v.hits ?? null, expected: expectedAnswer(q) };
  }

  // ------------------------------------------------------------------ rooms (student)
  private visibleRoom(uid: number, roomId: string): RoomRow {
    const r = this.one<RoomRow>(
      `SELECT r.* FROM rooms r WHERE r.id = ? AND r.status = 'published'
        AND EXISTS (SELECT 1 FROM room_classes rc JOIN class_members cm ON cm.class_id = rc.class_id WHERE rc.room_id = r.id AND cm.user_id = ?)`, roomId, uid);
    if (!r) throw notFound('Room not found.');
    return r;
  }

  roomsFor(uid: number) {
    const rows = this.all<RoomRow & { teacher_name: string }>(
      `SELECT r.*, u.name AS teacher_name FROM rooms r JOIN users u ON u.id = r.teacher_id WHERE r.status = 'published'
        AND EXISTS (SELECT 1 FROM room_classes rc JOIN class_members cm ON cm.class_id = rc.class_id WHERE rc.room_id = r.id AND cm.user_id = ?)
       ORDER BY r.published_at DESC, r.id`, uid);
    return {
      rooms: rows.map((r) => {
        const doc = JSON.parse(r.doc_json) as RoomDoc;
        const mine = this.all<AttemptRow>('SELECT * FROM room_attempts WHERE room_id = ? AND user_id = ? ORDER BY started_at DESC', r.id, uid);
        const active = mine.find((a) => a.status === 'in_progress' || a.status === 'vault');
        const finished = mine.filter((a) => a.status === 'completed' || a.status === 'timeout');
        const best = finished.reduce<AttemptRow | null>((b, a) => (!b || a.score > b.score ? a : b), null);
        const left = doc.maxAttempts > 0 ? Math.max(0, doc.maxAttempts - finished.length) : null;
        return {
          id: r.id, title: doc.title, summary: doc.summary, discipline: doc.discipline, mode: doc.mode, cover: doc.cover ?? null, teacher: r.teacher_name,
          questions: doc.questions.length, timeLimitSec: doc.timeLimitSec, maxScore: maxPoints(doc), passPct: doc.passPct, hasVault: !!doc.vaultCode,
          activeAttemptId: active?.id ?? null, attemptsLeft: left,
          best: best ? { attemptId: best.id, score: best.score, maxScore: best.max_score, pct: pct(best.score, best.max_score), passed: (pct(best.score, best.max_score) ?? 0) >= doc.passPct, status: best.status } : null,
        };
      }),
    };
  }

  start(uid: number, roomId: string) {
    const r = this.visibleRoom(uid, roomId);
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    return tx(this.db, () => {
      const active = this.one<AttemptRow>("SELECT * FROM room_attempts WHERE room_id = ? AND user_id = ? AND status IN ('in_progress','vault')", roomId, uid);
      if (active) return { resumed: true, attempt: this.view(this.refresh(active)) };
      if (doc.maxAttempts > 0) {
        const done = this.one<{ n: number }>("SELECT COUNT(*) AS n FROM room_attempts WHERE room_id = ? AND user_id = ? AND status IN ('completed','timeout')", roomId, uid)!.n;
        if (done >= doc.maxAttempts) throw conflict('attempts_exhausted', 'You have used every attempt your teacher allowed for this room.', { maxAttempts: doc.maxAttempts });
      }
      if (doc.questions.length === 0) throw conflict('room_empty', 'This room has no question yet.');
      const id = randomUUID();
      const salt = randomBytes(16).toString('hex');
      const order = doc.shuffleQuestions ? seededShuffle(doc.questions.map((q) => q.id), salt) : doc.questions.map((q) => q.id);
      this.run(`INSERT INTO room_attempts (id, room_id, user_id, room_version, doc_json, salt, order_json, status, current, started_at, max_score)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, id, roomId, uid, r.version, r.doc_json, salt, JSON.stringify(order), 'in_progress', 0, this.now(), maxPoints(doc));
      return { resumed: false, attempt: this.view(this.attemptRow(id)!) };
    });
  }

  private attemptRow(id: string) { return this.one<AttemptRow>('SELECT * FROM room_attempts WHERE id = ?', id); }
  private ownAttempt(uid: number, id: string): AttemptRow {
    const a = this.attemptRow(id);
    if (!a || a.user_id !== uid) throw notFound('Attempt not found.');
    return a;
  }

  private remaining(a: AttemptRow, doc: RoomDoc): number | null {
    if (!doc.timeLimitSec) return null;
    return Math.max(0, Math.ceil((a.started_at + doc.timeLimitSec * 1000 - this.now()) / 1000));
  }

  /** Closes an attempt whose time is up; the score earned so far is kept. */
  private refresh(a: AttemptRow): AttemptRow {
    if (a.status !== 'in_progress' && a.status !== 'vault') return a;
    const doc = JSON.parse(a.doc_json) as RoomDoc;
    if (this.remaining(a, doc) === 0) {
      this.run("UPDATE room_attempts SET status = 'timeout', completed_at = ? WHERE id = ? AND status IN ('in_progress','vault')", a.started_at + doc.timeLimitSec * 1000, a.id);
      return this.attemptRow(a.id)!;
    }
    return a;
  }

  private answersOf(attemptId: string) { return this.all<AnswerRow>('SELECT * FROM room_answers WHERE attempt_id = ? ORDER BY id', attemptId); }
  private hintsOf(attemptId: string) { return this.all<{ question_id: string; level: number }>('SELECT question_id, level FROM room_hints WHERE attempt_id = ? ORDER BY level', attemptId); }

  /** Per-question tally of an attempt: tries, traps, hints, solved, earned. */
  private tally(a: AttemptRow, doc: RoomDoc) {
    const order = JSON.parse(a.order_json) as string[];
    const answers = this.answersOf(a.id);
    const hints = this.hintsOf(a.id);
    return order.map((qid, index) => {
      const q = doc.questions.find((x) => x.id === qid)!;
      const mine = answers.filter((x) => x.question_id === qid);
      const solved = mine.some((x) => x.correct === 1);
      const wrong = mine.filter((x) => x.correct === 0).length;
      const traps = mine.filter((x) => x.trap === 1).length;
      const used = hints.filter((h) => h.question_id === qid).length;
      const last = mine.at(-1);
      const done = doc.mode === 'escape' ? solved : mine.length > 0;
      const earned = done ? earnedPoints(q, doc.mode, { wrong, hints: used, traps, fraction: last?.fraction ?? 0 }) : 0;
      return { q, index, answers: mine, solved, wrong, traps, hints: used, done, earned, fraction: last?.fraction ?? 0 };
    });
  }

  private view(a: AttemptRow) {
    const doc = JSON.parse(a.doc_json) as RoomDoc;
    const t = this.tally(a, doc);
    const slices = fragmentSlices(doc.vaultCode, t.length);
    const current = a.status === 'in_progress' ? t[a.current] : undefined;
    const hintsGiven = current ? this.hintsOf(a.id).filter((h) => h.question_id === current.q.id).map((h) => current.q.hints[h.level - 1]!) : [];
    const finished = a.status === 'completed' || a.status === 'timeout';
    return {
      attemptId: a.id, roomId: a.room_id, title: doc.title, discipline: doc.discipline, mode: doc.mode, cover: doc.cover ?? null, intro: doc.intro,
      status: a.status, index: Math.min(a.current, t.length), total: t.length, startedAt: a.started_at, completedAt: a.completed_at,
      timeLimitSec: doc.timeLimitSec, remainingSec: finished ? null : this.remaining(a, doc), serverNow: this.now(),
      score: t.reduce((s, x) => s + x.earned, 0), maxScore: a.max_score, passPct: doc.passPct, showFeedback: doc.mode === 'escape' || doc.showFeedback,
      question: current ? { ...publicQuestion(current.q, a.salt, doc.shuffleOptions), ordinal: current.index + 1, wrong: current.wrong, hintsGiven } : null,
      progress: t.map((x) => ({ ordinal: x.index + 1, done: x.done, solved: doc.mode === 'escape' || doc.showFeedback || finished ? x.solved : null })),
      vault: doc.vaultCode
        ? { length: [...doc.vaultCode].length, fragments: t.map((x, i) => ({ ordinal: i + 1, chars: x.solved && doc.mode === 'escape' ? slices[i]! : null, size: [...slices[i]!].length })), triesLeft: ROOM_RULES.maxVaultTries - a.vault_tries }
        : null,
      outro: finished ? doc.outro : '',
    };
  }

  getAttempt(uid: number, id: string) { return this.view(this.refresh(this.ownAttempt(uid, id))); }

  answer(uid: number, attemptId: string, questionId: string, rawResponse: unknown) {
    return tx(this.db, () => {
      const a = this.refresh(this.ownAttempt(uid, attemptId));
      if (a.status === 'timeout') throw conflict('time_up', 'Time is up: this attempt is closed. Your score so far is kept.');
      if (a.status !== 'in_progress') throw conflict('not_in_progress', 'This attempt is not waiting for an answer.');
      const doc = JSON.parse(a.doc_json) as RoomDoc;
      const order = JSON.parse(a.order_json) as string[];
      const qid = order[a.current];
      if (qid !== questionId) throw conflict('stale_question', 'This is not the current question: the attempt has moved on.', { currentQuestionId: qid });
      const q = doc.questions.find((x) => x.id === qid)!;
      const response = fromPublic(q, rawResponse, a.salt);
      const v: Verdict = grade(q, response);
      this.run('INSERT INTO room_answers (attempt_id, question_id, correct, trap, fraction, response_json, created_at) VALUES (?,?,?,?,?,?,?)',
        a.id, q.id, v.correct ? 1 : 0, v.trap ? 1 : 0, v.fraction, JSON.stringify({ r: response, h: v.hits ?? null }), this.now());
      const advance = doc.mode === 'exam' || v.correct;
      const next = advance ? a.current + 1 : a.current;
      const last = next >= order.length;
      const status: AttemptStatus = last ? (doc.mode === 'escape' && doc.vaultCode ? 'vault' : 'completed') : 'in_progress';
      const t = this.tally({ ...a }, doc);
      const score = t.reduce((s, x) => s + x.earned, 0);
      this.run(`UPDATE room_attempts SET current = ?, status = ?, completed_at = ?, score = ?, correct = correct + ?, wrong_total = wrong_total + ?, traps_total = traps_total + ? WHERE id = ?`,
        next, status, status === 'completed' ? this.now() : null, score, v.correct ? 1 : 0, v.correct ? 0 : 1, v.trap ? 1 : 0, a.id);
      const after = this.attemptRow(a.id)!;
      const reveal = doc.mode === 'escape' || doc.showFeedback;
      const index = t.findIndex((x) => x.q.id === q.id);
      return {
        recorded: true,
        correct: reveal ? v.correct : null,
        trap: reveal ? v.trap : null,
        feedback: reveal && !v.correct ? v.feedback ?? null : null,
        explanation: reveal && (v.correct || doc.mode === 'exam') ? q.explanation || null : null,
        earned: advance ? t[index]!.earned : null,
        fragment: doc.mode === 'escape' && v.correct && doc.vaultCode ? fragmentSlices(doc.vaultCode, order.length)[index] || null : null,
        attempt: this.view(after),
      };
    });
  }

  hint(uid: number, attemptId: string, questionId: string) {
    return tx(this.db, () => {
      const a = this.refresh(this.ownAttempt(uid, attemptId));
      if (a.status === 'timeout') throw conflict('time_up', 'Time is up: this attempt is closed.');
      if (a.status !== 'in_progress') throw conflict('not_in_progress', 'This attempt is not waiting for an answer.');
      const doc = JSON.parse(a.doc_json) as RoomDoc;
      const qid = (JSON.parse(a.order_json) as string[])[a.current];
      if (qid !== questionId) throw conflict('stale_question', 'This is not the current question.', { currentQuestionId: qid });
      const q = doc.questions.find((x) => x.id === qid)!;
      const used = this.one<{ n: number }>('SELECT COUNT(*) AS n FROM room_hints WHERE attempt_id = ? AND question_id = ?', a.id, qid)!.n;
      if (used >= q.hints.length) throw conflict('no_more_hints', 'There is no other hint for this question.');
      this.run('INSERT INTO room_hints (attempt_id, question_id, level, created_at) VALUES (?,?,?,?)', a.id, qid, used + 1, this.now());
      this.run('UPDATE room_attempts SET hints_total = hints_total + 1 WHERE id = ?', a.id);
      return { level: used + 1, text: q.hints[used]!, penaltyPct: Math.round(ROOM_RULES.hintPenalty * 100), attempt: this.view(this.attemptRow(a.id)!) };
    });
  }

  escape(uid: number, attemptId: string, code: string) {
    return tx(this.db, () => {
      const a = this.refresh(this.ownAttempt(uid, attemptId));
      if (a.status === 'timeout') throw conflict('time_up', 'Time is up: this attempt is closed.');
      if (a.status !== 'vault') throw conflict('vault_locked', 'The vault opens once every question is solved.');
      const doc = JSON.parse(a.doc_json) as RoomDoc;
      if (a.vault_tries >= ROOM_RULES.maxVaultTries) throw conflict('vault_blocked', 'Too many wrong codes: ask your teacher.');
      const ok = foldText(code).replace(/\s+/g, '').toUpperCase() === doc.vaultCode;
      if (!ok) {
        this.run('UPDATE room_attempts SET vault_tries = vault_tries + 1 WHERE id = ?', a.id);
        throw new ApiError(422, 'wrong_code', 'The vault stays shut: that is not the code.', { triesLeft: ROOM_RULES.maxVaultTries - a.vault_tries - 1 });
      }
      this.run("UPDATE room_attempts SET status = 'completed', completed_at = ? WHERE id = ?", this.now(), a.id);
      return { escaped: true, attempt: this.view(this.attemptRow(a.id)!) };
    });
  }

  /** The review after an attempt: every question with the learner's answer, the explanation and (when allowed) the expected answer. */
  review(uid: number, attemptId: string) {
    const a = this.refresh(this.ownAttempt(uid, attemptId));
    if (a.status !== 'completed' && a.status !== 'timeout') throw conflict('not_finished', 'The review opens once the attempt is finished.');
    return this.reviewOf(a);
  }

  private reviewOf(a: AttemptRow) {
    const doc = JSON.parse(a.doc_json) as RoomDoc;
    const t = this.tally(a, doc);
    const score = t.reduce((s, x) => s + x.earned, 0);
    const p = pct(score, a.max_score) ?? 0;
    return {
      attemptId: a.id, roomId: a.room_id, title: doc.title, mode: doc.mode, status: a.status, startedAt: a.started_at, completedAt: a.completed_at,
      durationSec: a.completed_at ? Math.round((a.completed_at - a.started_at) / 1000) : null,
      score, maxScore: a.max_score, pct: p, passPct: doc.passPct, passed: p >= doc.passPct, outro: doc.outro,
      totals: { correct: t.filter((x) => x.solved).length, questions: t.length, wrong: t.reduce((s, x) => s + x.wrong, 0), hints: t.reduce((s, x) => s + x.hints, 0), traps: t.reduce((s, x) => s + x.traps, 0) },
      questions: t.map((x) => ({
        ordinal: x.index + 1, id: x.q.id, type: x.q.type, prompt: x.q.prompt, image: x.q.image ?? null, points: x.q.points, earned: x.earned,
        answered: x.answers.length > 0, solved: x.solved, tries: x.answers.length, wrong: x.wrong, traps: x.traps, hints: x.hints,
        responses: x.answers.map((r) => ({ correct: r.correct === 1, trap: r.trap === 1, ...(JSON.parse(r.response_json) as { r: unknown; h: unknown }) })),
        explanation: x.q.explanation,
        expected: doc.revealAnswers ? expectedAnswer(x.q) : null,
        labels: labelsOf(x.q),
      })),
    };
  }

  // ------------------------------------------------------------------ results (teacher)
  results(teacherId: number, roomId: string) {
    const r = this.ownRoom(teacherId, roomId);
    const doc = JSON.parse(r.doc_json) as RoomDoc;
    const attempts = this.all<AttemptRow & { name: string }>(
      'SELECT a.*, u.name FROM room_attempts a JOIN users u ON u.id = a.user_id WHERE a.room_id = ? ORDER BY a.started_at DESC', roomId);
    const finished = attempts.filter((a) => a.status === 'completed' || a.status === 'timeout');
    const answers = this.all<AnswerRow>('SELECT ra.* FROM room_answers ra JOIN room_attempts a ON a.id = ra.attempt_id WHERE a.room_id = ? ORDER BY ra.id', roomId);
    const hints = this.all<{ question_id: string; n: number }>('SELECT h.question_id, COUNT(*) AS n FROM room_hints h JOIN room_attempts a ON a.id = h.attempt_id WHERE a.room_id = ? GROUP BY h.question_id', roomId);
    const byQuestion = new Map<string, AnswerRow[]>();
    for (const x of answers) { const l = byQuestion.get(x.question_id) ?? []; l.push(x); byQuestion.set(x.question_id, l); }

    const pcts = finished.map((a) => pct(a.score, a.max_score) ?? 0);
    const bestByStudent = new Map<number, number>();
    for (const a of finished) bestByStudent.set(a.user_id, Math.max(bestByStudent.get(a.user_id) ?? 0, pct(a.score, a.max_score) ?? 0));
    const durations = finished.filter((a) => a.completed_at).map((a) => Math.round((a.completed_at! - a.started_at) / 1000));

    const questions = doc.questions.map((q) => {
      const rows = byQuestion.get(q.id) ?? [];
      const perAttempt = new Map<string, AnswerRow[]>();
      for (const x of rows) { const l = perAttempt.get(x.attempt_id) ?? []; l.push(x); perAttempt.set(x.attempt_id, l); }
      const reached = perAttempt.size;
      const firstRight = [...perAttempt.values()].filter((l) => l[0]!.correct === 1).length;
      const everRight = [...perAttempt.values()].filter((l) => l.some((x) => x.correct === 1)).length;
      const trapAttempts = [...perAttempt.values()].filter((l) => l.some((x) => x.trap === 1)).length;
      const parsed = rows.map((x) => ({ row: x, ...(JSON.parse(x.response_json) as { r: Record<string, unknown>; h: Array<{ x: number; y: number; zone: string | null; trap: boolean }> | null }) }));
      const base = {
        id: q.id, type: q.type, prompt: q.prompt, points: q.points, image: q.image ?? null,
        reached, firstTryPct: pct(firstRight, reached), solvedPct: pct(everRight, reached), trapPct: pct(trapAttempts, reached),
        avgTries: reached ? Math.round((10 * rows.length) / reached) / 10 : null, hintsUsed: hints.find((h) => h.question_id === q.id)?.n ?? 0,
      };
      switch (q.type) {
        case 'choice': {
          const picks = new Map<string, number>();
          for (const p of parsed) for (const id of (q.multiple ? (p.r.choices as string[]) : [p.r.choice as string]) ?? []) picks.set(id, (picks.get(id) ?? 0) + 1);
          return { ...base, options: q.options.map((o) => ({ id: o.id, label: o.label, correct: o.correct, trap: !!o.trap, picks: picks.get(o.id) ?? 0 })) };
        }
        case 'truefalse': {
          const t = parsed.filter((p) => p.r.value === true).length;
          return { ...base, answer: q.answer, trueCount: t, falseCount: parsed.length - t };
        }
        case 'text': case 'number': {
          const counts = new Map<string, { answer: string; count: number; correct: boolean; trap: boolean }>();
          for (const p of parsed) {
            const shown = q.type === 'text' ? String(p.r.text ?? '') : String(p.r.value);
            const k = q.type === 'text' ? foldText(shown) : shown;
            const c = counts.get(k) ?? { answer: shown, count: 0, correct: p.row.correct === 1, trap: p.row.trap === 1 };
            c.count += 1;
            counts.set(k, c);
          }
          return { ...base, answers: [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 12), expected: expectedAnswer(q) };
        }
        case 'hotspot': {
          const clicks = parsed.flatMap((p) => (p.h ?? []).map((h) => ({ x: h.x, y: h.y, zone: h.zone, trap: h.trap, correct: p.row.correct === 1 }))).slice(-800);
          const named = new Map<string, number>();
          for (const p of parsed) for (const z of [p.r.zone, ...((p.r.zones as unknown[]) ?? [])]) if (typeof z === 'string') named.set(z, (named.get(z) ?? 0) + 1);
          return { ...base, zones: (expectedAnswer(q) as { zones: unknown[] }).zones, tolerance: q.tolerance, clicks, textChoices: [...named.entries()].map(([zone, count]) => ({ zone, count })) };
        }
        default:
          return base;
      }
    });

    return {
      room: { id: r.id, title: doc.title, status: r.status, version: r.version, mode: doc.mode, passPct: doc.passPct, maxScore: maxPoints(doc), questions: doc.questions.length },
      summary: {
        attempts: attempts.length, students: new Set(attempts.map((a) => a.user_id)).size, finished: finished.length,
        inProgress: attempts.filter((a) => a.status === 'in_progress' || a.status === 'vault').length,
        avgPct: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null, medianPct: median(pcts),
        passRate: bestByStudent.size ? pct([...bestByStudent.values()].filter((x) => x >= doc.passPct).length, bestByStudent.size) : null,
        medianDurationSec: median(durations),
        trapRate: answers.length ? pct(answers.filter((x) => x.trap === 1).length, answers.length) : null,
        distribution: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => pcts.filter((x) => Math.min(9, Math.floor(x / 10)) === b).length),
      },
      attempts: attempts.map((a) => {
        const p = pct(a.score, a.max_score);
        return {
          attemptId: a.id, student: { id: a.user_id, name: a.name }, status: a.status, version: a.room_version,
          startedAt: a.started_at, completedAt: a.completed_at, durationSec: a.completed_at ? Math.round((a.completed_at - a.started_at) / 1000) : null,
          score: a.score, maxScore: a.max_score, pct: p, passed: a.status === 'completed' || a.status === 'timeout' ? (p ?? 0) >= doc.passPct : null,
          correct: a.correct, wrong: a.wrong_total, hints: a.hints_total, traps: a.traps_total,
        };
      }),
      questions,
    };
  }

  attemptDetail(teacherId: number, attemptId: string) {
    const a = this.attemptRow(attemptId);
    if (!a) throw notFound('Attempt not found.');
    this.ownRoom(teacherId, a.room_id);
    const student = this.one<{ id: number; name: string }>('SELECT id, name FROM users WHERE id = ?', a.user_id)!;
    const review = this.reviewOf(this.refresh(a));
    // The teacher always sees the expected answers, whatever the room shows learners.
    const doc = JSON.parse(a.doc_json) as RoomDoc;
    return { student, ...review, questions: review.questions.map((q) => ({ ...q, expected: expectedAnswer(doc.questions.find((x) => x.id === q.id)!) })) };
  }
}

/** Labels needed to read a stored response in the review (internal ids to text). */
function labelsOf(q: Question): Record<string, string> {
  switch (q.type) {
    case 'choice': return Object.fromEntries(q.options.map((o) => [o.id, o.label]));
    case 'hotspot': return Object.fromEntries([...q.zones.map((z) => [z.id, z.label]), ...q.decoys.map((d, i) => [`decoy-${i + 1}`, d])]);
    case 'order': return Object.fromEntries(q.items.map((x) => [x.id, x.label]));
    case 'match': return Object.fromEntries(q.pairs.flatMap((x) => [[x.id, x.left], [`${x.id}:right`, x.right]]));
    default: return {};
  }
}

export type { PublicQuestion };
