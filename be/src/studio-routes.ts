// Routes of the Teacher Studio (authoring, pictures, results) and of the rooms students play. Part of the route table, so of the OpenAPI document too.
import { RawBody, bad, notFound } from './http.ts';
import type { Ctx, Route, Schema } from './http.ts';
import { IMAGE_LIBRARY, QUESTION_TYPES, ROOM_DISCIPLINES, ROOM_RULES } from './rooms.ts';
import type { Studio, RoomStatus } from './studio.ts';
import { MAX_IMAGE_BYTES } from './media.ts';

export interface StudioDeps {
  studio: Studio;
  /** Registers one hit of `key` (shared limiter of the API); a zero max disables it. */
  hit: (key: string, max: number, windowMs: number) => void;
  /** Per-account write budget shared with the other account-changing routes. */
  write: (c: Ctx) => void;
  perUserScale: number;
  limits?: { answerPerMinute?: number; hintPerMinute?: number; startPerMinute?: number };
}

const ROOM_DOC_DESCRIPTION = 'A room document: { title, summary, discipline, cover?, mode: escape|exam, timeLimitSec, shuffleQuestions, shuffleOptions, passPct, showFeedback, revealAnswers, vaultCode, maxAttempts, intro, outro, questions[] }. '
  + `Question types: ${QUESTION_TYPES.join(', ')}. Every question has id, type, prompt, points (1-100), hints (0-3), explanation, optional context, image and feedbackWrong. `
  + 'choice: options [{id, label, correct, trap?, feedback?}], multiple. truefalse: answer, trap?. text: accepted[], typoTolerance, traps [{answer, feedback}]. number: value, tolerance, unit?, traps [{value, feedback}]. '
  + 'hotspot: image (required), zones [{id, label, shape: circle {x,y,r} | rect {x,y,w,h}, trap?, feedback?}] in natural pixels of the image, tolerance (pixels, default 5), require: any|all, decoys (extra labels for the text alternative). '
  + 'order: items in the correct order. match: pairs [{id, left, right}]. An image is {media: uploadId, alt} or {asset: libraryId, alt}; its size is set by the server. '
  + `Every problem is reported at once in error.details (400 validation_error). At most ${ROOM_RULES.maxQuestions} questions.`;

const idParam = (v: string, what: string) => { if (!/^[A-Za-z0-9_-]{1,64}$/.test(v)) throw bad(`${what} is not a valid id`); return v; };

export function studioRoutes(d: StudioDeps): Route[] {
  const { studio, hit, write, perUserScale } = d;
  const uid = (c: Ctx) => c.user!.id;
  const roomBody: Schema = { type: 'object', description: ROOM_DOC_DESCRIPTION };
  return [
    // ------------------------------------------------------------------ pictures
    {
      method: 'GET', path: '/api/media/:id', auth: 'none', tag: 'Studio', raw: 'image/png, image/jpeg, image/webp, image/gif',
      summary: 'An uploaded picture. Public by id (128 random bits), immutable, served with a sandboxing Content-Security-Policy.',
      handler: (c) => {
        const m = studio.mediaBytes(c.params.id!);
        if (!m) throw notFound('Picture not found.');
        return new RawBody(m.mime, m.bytes, { 'Cache-Control': 'public, max-age=31536000, immutable' });
      },
    },
    {
      method: 'POST', path: '/api/studio/media', auth: 'teacher', tag: 'Studio', status: 201, maxBody: Math.ceil(MAX_IMAGE_BYTES * 1.4) + 4096,
      summary: `Upload a picture (PNG, JPEG, WebP or GIF, at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB) as base64 or a data: URL. The type and size are read from the bytes; SVG is refused.`,
      body: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'string', minLength: 8, maxLength: Math.ceil(MAX_IMAGE_BYTES * 1.4) }, name: { type: 'string', maxLength: 120 } } },
      description: '409 media_quota when the teacher\'s library is full.',
      handler: (c) => { hit(`upload:${uid(c)}`, 40 * perUserScale, 600_000); const b = c.body as { data: string; name?: string }; return studio.uploadMedia(uid(c), b.data, (b.name ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '')); },
    },
    { method: 'GET', path: '/api/studio/media', auth: 'teacher', tag: 'Studio', summary: 'Your uploaded pictures and the quota.', handler: (c) => studio.listMedia(uid(c)) },
    { method: 'DELETE', path: '/api/studio/media/:id', auth: 'teacher', tag: 'Studio', summary: 'Delete one of your pictures. 409 media_in_use while a room or a past attempt uses it.', handler: (c) => { write(c); return studio.deleteMedia(uid(c), idParam(c.params.id!, 'id')); } },
    {
      method: 'GET', path: '/api/studio/library', auth: 'teacher', tag: 'Studio', summary: 'Built-in pictures a room may use without uploading, with their natural sizes, and the authoring limits.',
      handler: () => ({ images: Object.entries(IMAGE_LIBRARY).map(([id, v]) => ({ id, ...v })), disciplines: ROOM_DISCIPLINES, questionTypes: QUESTION_TYPES, rules: ROOM_RULES }),
    },

    // ------------------------------------------------------------------ rooms (teacher)
    { method: 'GET', path: '/api/studio/rooms', auth: 'teacher', tag: 'Studio', summary: 'Your rooms with status, quality score and attempt statistics.', handler: (c) => studio.listRooms(uid(c)) },
    {
      method: 'POST', path: '/api/studio/rooms', auth: 'teacher', tag: 'Studio', status: 201, maxBody: 512 * 1024,
      summary: 'Create a room (draft): from a document, empty, or as an editable copy of a built-in mission (fromMission). Assigned to every class of yours unless classIds says otherwise.',
      body: { type: 'object', additionalProperties: false, properties: { doc: roomBody, fromMission: { type: 'string', maxLength: 40 }, classIds: { type: 'array', maxItems: 50, items: { type: 'integer', minimum: 1 } } } },
      handler: (c) => { write(c); return studio.createRoom(uid(c), c.body as { doc?: unknown; fromMission?: string; classIds?: number[] }); },
    },
    { method: 'GET', path: '/api/studio/rooms/:id', auth: 'teacher', tag: 'Studio', summary: 'One of your rooms: full document (with answers), classes, quality check and statistics.', handler: (c) => studio.getRoom(uid(c), idParam(c.params.id!, 'id')) },
    {
      method: 'PUT', path: '/api/studio/rooms/:id', auth: 'teacher', tag: 'Studio', maxBody: 512 * 1024,
      summary: 'Replace the room document. `version` must be the version you loaded (409 version_conflict otherwise). Attempts already started keep the version they started with.',
      body: { type: 'object', required: ['doc', 'version'], additionalProperties: false, properties: { doc: roomBody, version: { type: 'integer', minimum: 1 } } },
      handler: (c) => { write(c); const b = c.body as { doc: unknown; version: number }; return studio.saveRoom(uid(c), idParam(c.params.id!, 'id'), b.doc, b.version); },
    },
    {
      method: 'PUT', path: '/api/studio/rooms/:id/status', auth: 'teacher', tag: 'Studio', summary: 'Publish, unpublish (draft) or archive. Publishing needs at least one question, no quality error and one class (422 room_not_ready).',
      body: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { type: 'string', enum: ['draft', 'published', 'archived'] } } },
      handler: (c) => { write(c); return studio.setStatus(uid(c), idParam(c.params.id!, 'id'), (c.body as { status: RoomStatus }).status); },
    },
    {
      method: 'PUT', path: '/api/studio/rooms/:id/classes', auth: 'teacher', tag: 'Studio', summary: 'Choose the classes that can play the room (your own classes only).',
      body: { type: 'object', required: ['classIds'], additionalProperties: false, properties: { classIds: { type: 'array', maxItems: 50, items: { type: 'integer', minimum: 1 } } } },
      handler: (c) => { write(c); return studio.setClasses(uid(c), idParam(c.params.id!, 'id'), (c.body as { classIds: number[] }).classIds); },
    },
    { method: 'POST', path: '/api/studio/rooms/:id/duplicate', auth: 'teacher', tag: 'Studio', status: 201, summary: 'Copy a room into a new draft.', body: { type: 'object', additionalProperties: false }, handler: (c) => { write(c); return studio.duplicateRoom(uid(c), idParam(c.params.id!, 'id')); } },
    { method: 'DELETE', path: '/api/studio/rooms/:id', auth: 'teacher', tag: 'Studio', summary: 'Delete a room with all its attempts and results.', handler: (c) => { write(c); return studio.deleteRoom(uid(c), idParam(c.params.id!, 'id')); } },
    { method: 'GET', path: '/api/studio/rooms/:id/preview', auth: 'teacher', tag: 'Studio', summary: 'The saved room as a student would receive it (no answers), for "play as a student". Nothing is recorded.', handler: (c) => studio.preview(uid(c), idParam(c.params.id!, 'id')) },
    {
      method: 'POST', path: '/api/studio/rooms/:id/check', auth: 'teacher', tag: 'Studio', summary: 'Grade one preview answer exactly as for a student (verdict, trap, feedback, expected answer). Nothing is recorded.',
      body: { type: 'object', required: ['questionId', 'response'], additionalProperties: false, properties: { questionId: { type: 'string', maxLength: 40 }, response: { type: 'object' } } },
      handler: (c) => { hit(`check:${uid(c)}`, 240 * perUserScale, 60_000); const b = c.body as { questionId: string; response: unknown }; return studio.previewCheck(uid(c), idParam(c.params.id!, 'id'), b.questionId, b.response); },
    },
    {
      method: 'GET', path: '/api/studio/rooms/:id/results', auth: 'teacher', tag: 'Studio', summary: 'Results of a room: summary, every attempt, per-question success, trap rates, option picks, text answers and hotspot clicks (heatmap).',
      query: [{ name: 'classId', schema: { type: 'string', pattern: '^[0-9]{1,9}$' }, description: 'Only the students of this class (one of yours).' }],
      handler: (c) => { const k = c.query.get('classId'); return studio.results(uid(c), idParam(c.params.id!, 'id'), k === null ? undefined : Number(k)); },
    },
    { method: 'GET', path: '/api/studio/attempts/:id', auth: 'teacher', tag: 'Studio', summary: 'One student attempt on one of your rooms, answer by answer, with the expected answers.', handler: (c) => studio.attemptDetail(uid(c), idParam(c.params.id!, 'id')) },

    // ------------------------------------------------------------------ rooms (student)
    { method: 'GET', path: '/api/rooms', auth: 'student', tag: 'Rooms', summary: 'Rooms your teachers published for your classes, with your best result and any attempt in progress.', handler: (c) => studio.roomsFor(uid(c)) },
    {
      method: 'POST', path: '/api/rooms/:id/start', auth: 'student', tag: 'Rooms', status: 201, body: { type: 'object', additionalProperties: false },
      summary: 'Start a room, or resume the attempt in progress. 409 attempts_exhausted when the teacher limited attempts.',
      handler: (c) => { hit(`start:${uid(c)}`, (d.limits?.startPerMinute ?? 60) * perUserScale, 60_000); return studio.start(uid(c), idParam(c.params.id!, 'id')); },
    },
    { method: 'GET', path: '/api/room-attempts/:id', auth: 'student', tag: 'Rooms', summary: 'State of your attempt: current question (no answers), timer, progress, vault fragments.', handler: (c) => studio.getAttempt(uid(c), idParam(c.params.id!, 'id')) },
    {
      method: 'POST', path: '/api/room-attempts/:id/answer', auth: 'student', tag: 'Rooms',
      summary: 'Answer the current question. Escape mode: right / wrong with feedback (trap feedback when you fell for a trap), retry until right. Exam mode: one answer per question.',
      description: 'response by type: choice {choice} or {choices:[...]}; truefalse {value}; text {text}; number {value}; hotspot {x, y} (natural pixels) or {points:[{x,y}...]} or, as the text alternative, {zone} / {zones:[...]}; order {order:[...]}; match {pairs:{leftId: rightId}}. Ids are the ones of the question as you received it.',
      body: { type: 'object', required: ['questionId', 'response'], additionalProperties: false, properties: { questionId: { type: 'string', maxLength: 40 }, response: { type: 'object' } } },
      handler: (c) => { hit(`answer:${uid(c)}`, (d.limits?.answerPerMinute ?? 120) * perUserScale, 60_000); const b = c.body as { questionId: string; response: unknown }; return studio.answer(uid(c), idParam(c.params.id!, 'id'), b.questionId, b.response); },
    },
    {
      method: 'POST', path: '/api/room-attempts/:id/hint', auth: 'student', tag: 'Rooms', summary: `Read the next hint of the current question (costs ${Math.round(ROOM_RULES.hintPenalty * 100)}% of its points).`,
      body: { type: 'object', required: ['questionId'], additionalProperties: false, properties: { questionId: { type: 'string', maxLength: 40 } } },
      handler: (c) => { hit(`hint:${uid(c)}`, (d.limits?.hintPerMinute ?? 30) * perUserScale, 60_000); return studio.hint(uid(c), idParam(c.params.id!, 'id'), (c.body as { questionId: string }).questionId); },
    },
    {
      method: 'POST', path: '/api/room-attempts/:id/escape', auth: 'student', tag: 'Rooms', summary: 'Enter the vault code assembled from the fragments. 422 wrong_code.',
      body: { type: 'object', required: ['code'], additionalProperties: false, properties: { code: { type: 'string', minLength: 1, maxLength: 24 } } },
      handler: (c) => { hit(`escape:${uid(c)}`, 30 * perUserScale, 60_000); return studio.escape(uid(c), idParam(c.params.id!, 'id'), (c.body as { code: string }).code); },
    },
    { method: 'GET', path: '/api/room-attempts/:id/review', auth: 'student', tag: 'Rooms', summary: 'Review of a finished attempt: score, every answer, explanations and (if the teacher allows) the expected answers.', handler: (c) => studio.review(uid(c), idParam(c.params.id!, 'id')) },
  ];
}
