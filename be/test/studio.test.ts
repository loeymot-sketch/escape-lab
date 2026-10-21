// Teacher Studio: authoring, pictures, grading (pixel tolerance, traps, partial credit), the escape and exam flows, and the results views.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync, crc32 } from 'node:zlib';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';
import { foldText, fromPublic, grade, inZone, publicQuestion, qualityCheck, seededShuffle, textMatches, validateRoomDoc } from '../src/rooms.ts';
import type { Question } from '../src/rooms.ts';
import { sniffImage } from '../src/media.ts';

/** A real (tiny) PNG of the given size. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const noMedia = () => null;
const IMG = { asset: 'smear-schistocyte-01', alt: 'Illustrative blood smear with many red cells' };

const sampleDoc = () => ({
  title: 'Immunology opening room', summary: 'Five questions to open the lab.', discipline: 'immunology', mode: 'escape', vaultCode: 'IGM42',
  questions: [
    {
      id: 'q-choice', type: 'choice', prompt: 'Which antibody appears first in a primary immune response?', points: 20, hints: ['Think of the pentamer.'],
      explanation: 'IgM is produced first.', feedbackWrong: 'Think about timing, not quantity.',
      options: [
        { id: 'o1', label: 'IgM', correct: true },
        { id: 'o2', label: 'IgG', correct: false, trap: true, feedback: 'IgG dominates later and in secondary responses: a classic trap.' },
        { id: 'o3', label: 'IgE', correct: false },
        { id: 'o4', label: 'IgA', correct: false },
      ],
    },
    {
      id: 'q-spot', type: 'hotspot', prompt: 'Click the schistocyte.', points: 20, hints: [], explanation: 'A fragmented red cell.', image: IMG, tolerance: 5,
      zones: [
        { id: 'z-schisto', label: 'Fragmented cell', shape: 'circle', x: 1230, y: 440, r: 60 },
        { id: 'z-normal', label: 'Round cell with pallor', shape: 'circle', x: 1330, y: 310, r: 60, trap: true, feedback: 'This cell is whole, with central pallor.' },
      ],
      decoys: ['Platelet clump'],
    },
    { id: 'q-text', type: 'text', prompt: 'Name the cell that presents antigen to CD4 T cells most efficiently.', points: 10, hints: [], explanation: 'Dendritic cells.', accepted: ['dendritic cell'], traps: [{ answer: 'neutrophil', feedback: 'Neutrophils phagocytose but do not prime T cells.' }] },
    { id: 'q-num', type: 'number', prompt: 'How many antigen-binding sites does a pentameric IgM have?', points: 10, hints: [], explanation: 'Five units, two sites each: 10.', value: 10, tolerance: 0, unit: 'sites', traps: [{ value: 5, feedback: 'Five is the number of units, each has two sites.' }] },
    { id: 'q-match', type: 'match', prompt: 'Match each marker to its cell.', points: 10, hints: [], explanation: 'Classic markers.', pairs: [{ id: 'p1', left: 'CD4', right: 'Helper T cell' }, { id: 'p2', left: 'CD8', right: 'Cytotoxic T cell' }, { id: 'p3', left: 'CD19', right: 'B cell' }] },
  ],
});

async function setup() {
  const h = await harness();
  const teacher = await h.signup('Dr Studio', 'studio@uni.edu', { teacherInviteCode: 'FACULTY-INVITE' });
  const student = await h.signup('Sam Student', 'sam@uni.edu');
  const outsider = await h.signup('Olga Outside', 'olga@uni.edu');
  const cls = await h.call('POST', '/api/classes', { token: teacher.token, body: { name: 'L3 Immunology' } });
  assert.equal(cls.status, 201, JSON.stringify(cls.body));
  const join = await h.call('POST', '/api/classes/join', { token: student.token, body: { joinCode: cls.body.joinCode } });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  return { h, teacher, student, outsider, classId: cls.body.id as number };
}

async function publishedRoom(h: Harness, token: string, doc: unknown = sampleDoc()) {
  const created = await h.call('POST', '/api/studio/rooms', { token, body: { doc } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const pub = await h.call('PUT', `/api/studio/rooms/${created.body.id}/status`, { token, body: { status: 'published' } });
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  return pub.body;
}

// ------------------------------------------------------------------ pure grading
test('hotspot: a click counts up to exactly the tolerance in pixels outside a circle', () => {
  const q = validateRoomDoc(sampleDoc(), noMedia).questions[1]!;
  assert.equal(q.type, 'hotspot');
  // Edge of the 60 px circle + 5 px tolerance: 65 px from the centre is in, 65.5 is out.
  assert.equal(grade(q, { x: 1230 + 65, y: 440 }).correct, true);
  assert.equal(grade(q, { x: 1230 + 65.5, y: 440 }).correct, false);
  assert.equal(grade(q, { x: 1230, y: 440 - 64 }).correct, true);
});

test('hotspot: rectangles keep the same pixel tolerance on every side, and corners are rounded by it', () => {
  const z = { id: 'r', label: 'r', shape: 'rect' as const, x: 100, y: 100, w: 50, h: 20 };
  assert.equal(inZone(z, 95, 110, 5), true);
  assert.equal(inZone(z, 94, 110, 5), false);
  assert.equal(inZone(z, 155, 125, 5), false, 'diagonal corner distance is 7.07 px > 5');
  assert.equal(inZone(z, 153, 123, 5), true);
});

test('hotspot: a click on a trap zone is a trap with the teacher\'s feedback, and the click is kept for the heatmap', () => {
  const q = validateRoomDoc(sampleDoc(), noMedia).questions[1]!;
  const v = grade(q, { x: 1330, y: 310 });
  assert.equal(v.correct, false);
  assert.equal(v.trap, true);
  assert.equal(v.feedback, 'This cell is whole, with central pallor.');
  assert.deepEqual(v.hits, [{ x: 1330, y: 310, zone: 'z-normal', trap: true }]);
  assert.throws(() => grade(q, { x: 5000, y: 10 }), /inside the picture/);
});

test('hotspot "all": every correct zone must get its own click; partial credit counts distinct zones', () => {
  const doc = sampleDoc();
  doc.questions[1] = { ...doc.questions[1]!, require: 'all', zones: [
    { id: 'a', label: 'A', shape: 'circle', x: 200, y: 200, r: 30 },
    { id: 'b', label: 'B', shape: 'circle', x: 600, y: 600, r: 30 },
    { id: 't', label: 'T', shape: 'circle', x: 900, y: 200, r: 30, trap: true, feedback: 'No.' },
  ] } as never;
  const q = validateRoomDoc(doc, noMedia).questions[1]!;
  assert.equal(grade(q, { points: [{ x: 200, y: 200 }, { x: 600, y: 600 }] }).correct, true);
  const twice = grade(q, { points: [{ x: 200, y: 200 }, { x: 205, y: 205 }] });
  assert.equal(twice.correct, false, 'two clicks in one zone do not cover the second zone');
  assert.equal(twice.fraction, 0.5);
  assert.throws(() => grade(q, { points: [{ x: 200, y: 200 }] }), /exactly 2 clicks/);
});

test('choice: trap feedback first, multiple answers get partial credit minus wrong picks', () => {
  const q = validateRoomDoc(sampleDoc(), noMedia).questions[0]!;
  const v = grade(q, { choice: 'o2' });
  assert.deepEqual([v.correct, v.trap, v.feedback], [false, true, 'IgG dominates later and in secondary responses: a classic trap.']);
  assert.equal(grade(q, { choice: 'o3' }).feedback, 'Think about timing, not quantity.');
  const multi = validateRoomDoc({ title: 'Multi', questions: [{ id: 'm', type: 'choice', multiple: true, prompt: 'Pick the granulocytes', points: 10, options: [
    { id: 'a', label: 'Neutrophil', correct: true }, { id: 'b', label: 'Eosinophil', correct: true }, { id: 'c', label: 'Lymphocyte', correct: false }, { id: 'd', label: 'Basophil', correct: true }] }] }, noMedia).questions[0]!;
  assert.equal(grade(multi, { choices: ['a', 'b', 'd'] }).correct, true);
  assert.equal(grade(multi, { choices: ['a', 'b'] }).fraction, 2 / 3);
  assert.equal(grade(multi, { choices: ['a', 'c'] }).fraction, 0);
});

test('text answers: accents, case and punctuation are folded, one typo forgiven on long words only, trap answers caught', () => {
  assert.equal(foldText('  Éosinophile. '), 'eosinophile');
  assert.equal(textMatches('Dendritic  CELL!', 'dendritic cell', true), true);
  assert.equal(textMatches('dendritc cell', 'dendritic cell', true), true);
  assert.equal(textMatches('dendritc cell', 'dendritic cell', false), false);
  assert.equal(textMatches('IgA', 'IgM', true), false, 'short answers are exact');
  assert.equal(textMatches('11', '10', true), false, 'numbers are exact');
  const q = validateRoomDoc(sampleDoc(), noMedia).questions[2]!;
  const v = grade(q, { text: 'Neutrophil' });
  assert.deepEqual([v.correct, v.trap], [false, true]);
});

test('numbers: tolerance is inclusive; a trap value gets its own feedback', () => {
  const q = validateRoomDoc(sampleDoc(), noMedia).questions[3]!;
  assert.equal(grade(q, { value: 10 }).correct, true);
  const v = grade(q, { value: 5 });
  assert.deepEqual([v.correct, v.trap, v.feedback], [false, true, 'Five is the number of units, each has two sites.']);
  const tol = validateRoomDoc({ title: 'Tol', questions: [{ id: 'n', type: 'number', prompt: 'K+', points: 5, value: 4.2, tolerance: 0.1 }] }, noMedia).questions[0]!;
  assert.equal(grade(tol, { value: 4.3 }).correct, true);
  assert.equal(grade(tol, { value: 4.31 }).correct, false);
});

test('validation lists every problem with its path, and refuses impossible keys', () => {
  const doc = sampleDoc() as Record<string, unknown> & { questions: Record<string, unknown>[] };
  doc.title = '';
  doc.questions[0]!.options = [{ id: 'a', label: 'A', correct: false }, { id: 'a', label: 'B', correct: false }];
  doc.questions[1]!.zones = [{ id: 'z', label: 'Off picture', shape: 'circle', x: 99999, y: 10, r: 10 }];
  doc.questions[3]!.traps = [{ value: 10, feedback: 'same as the answer' }];
  doc.extra = 1;
  try { validateRoomDoc(doc, noMedia); assert.fail('should throw'); } catch (e) {
    const details = (e as { details: string[] }).details.join('\n');
    assert.match(details, /room\.title/);
    assert.match(details, /room\.questions\[0\]\.options\[1\]\.id "a" is used twice/);
    assert.match(details, /need at least one correct option/);
    assert.match(details, /room\.questions\[1\]\.zones\[0\]\.x must be a number from 0 to 1672/);
    assert.match(details, /falls inside the accepted range/);
    assert.match(details, /room\.extra is not a room setting/);
  }
});

test('the public question never carries a key, and every id it shows is an opaque per-attempt token', () => {
  const doc = validateRoomDoc(sampleDoc(), noMedia);
  for (const q of doc.questions) {
    const pub = publicQuestion(q, 'salt-1', true);
    const json = JSON.stringify(pub);
    assert.doesNotMatch(json, /"correct"|"trap"|"feedback"|accepted|"zones"|"value":|explanation|"pairs"/, q.id);
    for (const id of ['o1', 'o2', 'z-schisto', 'z-normal', 'p1', 'p2', 'decoy-1']) assert.doesNotMatch(json, new RegExp(`"id":"${id}"`), `${q.id} shows ${id}`);
  }
  const match = doc.questions[4] as Question & { type: 'match' };
  const pub = publicQuestion(match, 'salt-1', true);
  const pairs = Object.fromEntries(pub.left!.map((l) => [l.id, pub.right!.find((r) => r.label === match.pairs.find((p) => p.left === l.label)!.right)!.id]));
  assert.equal(grade(match, fromPublic(match, { pairs }, 'salt-1')).correct, true);
  assert.notDeepEqual(publicQuestion(match, 'salt-2', true).right!.map((r) => r.id), pub.right!.map((r) => r.id), 'tokens differ between attempts');
});

test('quality check: flags overlapping trap and correct zones, traps without feedback, and missing explanations', () => {
  const doc = sampleDoc();
  (doc.questions[1] as { zones: unknown[] }).zones.push({ id: 'z-bad', label: 'Overlapping trap', shape: 'circle', x: 1240, y: 440, r: 20, trap: true });
  (doc.questions[2] as { explanation: string }).explanation = '';
  const { notes, score } = qualityCheck(validateRoomDoc(doc, noMedia));
  const codes = notes.map((n) => n.code);
  assert.ok(codes.includes('zones_overlap'));
  assert.ok(codes.includes('trap_without_feedback'));
  assert.ok(codes.includes('no_explanation'));
  assert.ok(score < 80);
});

test('images: type and size are read from the bytes; SVG and lies about the type are refused', () => {
  assert.deepEqual(sniffImage(png(31, 17)), { mime: 'image/png', width: 31, height: 17 });
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

// ------------------------------------------------------------------ API flows
test('a teacher uploads a picture, uses it in a hotspot question, and the picture is served publicly with safe headers', async () => {
  const { h, teacher, student } = await setup();
  try {
    const up = await h.call('POST', '/api/studio/media', { token: teacher.token, body: { data: `data:image/png;base64,${png(400, 300).toString('base64')}`, name: 'slide.png' } });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    assert.deepEqual([up.body.width, up.body.height, up.body.mime], [400, 300, 'image/png']);
    const svg = await h.call('POST', '/api/studio/media', { token: teacher.token, body: { data: Buffer.from('<svg onload="alert(1)"/>').toString('base64') } });
    assert.equal(svg.status, 400);
    const bystudent = await h.call('POST', '/api/studio/media', { token: student.token, body: { data: png(4, 4).toString('base64') } });
    assert.equal(bystudent.status, 403);

    const res = await fetch(`${h.base}/api/media/${up.body.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Buffer.from(await res.arrayBuffer()).length, up.body.size);

    const doc = { title: 'My slide', questions: [{ id: 'h', type: 'hotspot', prompt: 'Click the dot', points: 10, image: { media: up.body.id, alt: 'A uniform grey test picture' }, tolerance: 5, zones: [{ id: 'z', label: 'Dot', shape: 'circle', x: 200, y: 150, r: 10 }] }] };
    const room = await h.call('POST', '/api/studio/rooms', { token: teacher.token, body: { doc } });
    assert.equal(room.status, 201, JSON.stringify(room.body));
    assert.deepEqual([room.body.doc.questions[0].image.width, room.body.doc.questions[0].image.height], [400, 300], 'the size comes from the server');
    const del = await h.call('DELETE', `/api/studio/media/${up.body.id}`, { token: teacher.token });
    assert.equal(del.status, 409, 'a picture in use cannot be deleted');

    const other = await h.signup('Dr Other', 'other@uni.edu', { teacherInviteCode: 'FACULTY-INVITE' });
    const steal = await h.call('POST', '/api/studio/rooms', { token: other.token, body: { doc } });
    assert.equal(steal.status, 400, 'another teacher cannot reference my upload');
  } finally { await h.close(); }
});

test('escape mode end to end: trap, retry penalty, hint, fragments, vault, review; nothing secret before the end', async () => {
  const { h, teacher, student, outsider } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token);
    const list = await h.call('GET', '/api/rooms', { token: student.token });
    assert.equal(list.body.rooms.length, 1);
    assert.equal((await h.call('GET', '/api/rooms', { token: outsider.token })).body.rooms.length, 0, 'not in the class: not visible');
    assert.equal((await h.call('POST', `/api/rooms/${room.id}/start`, { token: outsider.token, body: {} })).status, 404);

    const start = await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} });
    assert.equal(start.status, 201, JSON.stringify(start.body));
    let a = start.body.attempt;
    assert.doesNotMatch(JSON.stringify(a), /IGM42|"correct":true|dendritic cell|1230/);
    assert.equal(a.vault.length, 5);

    // q1: the trap (IgG), then a hint, then IgM.
    const q1 = a.question;
    const igg = q1.options.find((o: { label: string }) => o.label === 'IgG').id;
    const igm = q1.options.find((o: { label: string }) => o.label === 'IgM').id;
    const trap = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: q1.id, response: { choice: igg } } });
    assert.deepEqual([trap.body.correct, trap.body.trap], [false, true]);
    assert.match(trap.body.feedback, /classic trap/);
    assert.equal(trap.body.explanation, null, 'no explanation before the right answer');
    const hint = await h.call('POST', `/api/room-attempts/${a.attemptId}/hint`, { token: student.token, body: { questionId: q1.id } });
    assert.equal(hint.body.text, 'Think of the pentamer.');
    assert.equal((await h.call('POST', `/api/room-attempts/${a.attemptId}/hint`, { token: student.token, body: { questionId: q1.id } })).status, 409);
    const right = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: q1.id, response: { choice: igm } } });
    assert.equal(right.body.correct, true);
    assert.equal(right.body.explanation, 'IgM is produced first.');
    // 20 points × (1 − 25 % wrong − 15 % trap − 10 % hint) = 10.
    assert.equal(right.body.earned, 10);
    assert.ok(right.body.fragment, 'a fragment of the vault code');
    a = right.body.attempt;

    // q2 hotspot: 4 px outside the edge (inside the 5 px tolerance).
    assert.equal(a.question.type, 'hotspot');
    const spot = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { x: 1230 + 64, y: 440 } } });
    assert.equal(spot.body.correct, true);
    a = spot.body.attempt;
    // q3 text with a typo, q4 number, q5 match through the public tokens.
    a = (await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { text: 'Dendritc cell' } } })).body.attempt;
    a = (await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { value: 10 } } })).body.attempt;
    const m = a.question;
    const want: Record<string, string> = { CD4: 'Helper T cell', CD8: 'Cytotoxic T cell', CD19: 'B cell' };
    const pairs = Object.fromEntries(m.left.map((l: { id: string; label: string }) => [l.id, m.right.find((r: { label: string }) => r.label === want[l.label]).id]));
    const last = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: m.id, response: { pairs } } });
    assert.equal(last.body.correct, true, JSON.stringify(last.body));
    a = last.body.attempt;
    assert.equal(a.status, 'vault');
    const code = a.vault.fragments.map((f: { chars: string }) => f.chars).join('');
    assert.equal(code, 'IGM42');
    assert.equal((await h.call('GET', `/api/room-attempts/${a.attemptId}/review`, { token: student.token })).status, 409, 'no review before the vault');
    const wrongCode = await h.call('POST', `/api/room-attempts/${a.attemptId}/escape`, { token: student.token, body: { code: 'IGG42' } });
    assert.equal(wrongCode.status, 422);
    assert.equal(wrongCode.body.error.details.triesLeft, 9);
    const again = await h.call('POST', `/api/room-attempts/${a.attemptId}/escape`, { token: student.token, body: { code: 'XXXXX' } });
    assert.equal(again.body.error.details.triesLeft, 8, 'wrong codes are counted (not rolled back)');
    const out = await h.call('POST', `/api/room-attempts/${a.attemptId}/escape`, { token: student.token, body: { code: 'igm 42' } });
    assert.equal(out.status, 200, JSON.stringify(out.body));
    assert.equal(out.body.attempt.status, 'completed');

    const review = await h.call('GET', `/api/room-attempts/${a.attemptId}/review`, { token: student.token });
    assert.equal(review.status, 200);
    assert.equal(review.body.score, 10 + 20 + 10 + 10 + 10);
    assert.equal(review.body.maxScore, 70);
    assert.equal(review.body.totals.traps, 1);
    assert.ok(review.body.questions[0].expected.options.find((o: { label: string; correct: boolean }) => o.label === 'IgM').correct);

    // Teacher results: the trap and the option picks, the click for the heatmap, the attempt row.
    const res = await h.call('GET', `/api/studio/rooms/${room.id}/results`, { token: teacher.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.summary.finished, 1);
    assert.equal(res.body.summary.avgPct, 86);
    const rq1 = res.body.questions.find((q: { id: string }) => q.id === 'q-choice');
    assert.equal(rq1.trapPct, 100);
    assert.equal(rq1.firstTryPct, 0);
    assert.equal(rq1.options.find((o: { id: string }) => o.id === 'o2').picks, 1);
    const rq2 = res.body.questions.find((q: { id: string }) => q.id === 'q-spot');
    assert.deepEqual(rq2.clicks, [{ x: 1294, y: 440, zone: 'z-schisto', trap: false, correct: true }]);
    assert.equal(res.body.attempts[0].student.name, 'Sam Student');
    const detail = await h.call('GET', `/api/studio/attempts/${a.attemptId}`, { token: teacher.token });
    assert.equal(detail.body.questions[2].responses[0].r.text, 'Dendritc cell');
    // Narrowed to a class: the student's class has the attempt, an empty class of the teacher has none.
    const empty = await h.call('POST', '/api/classes', { token: teacher.token, body: { name: 'Empty group' } });
    assert.equal((await h.call('GET', `/api/studio/rooms/${room.id}/results?classId=${empty.body.id}`, { token: teacher.token })).body.summary.attempts, 0);
    assert.equal((await h.call('GET', `/api/studio/rooms/${room.id}/results?classId=${res.body.classes[0].id}`, { token: teacher.token })).body.summary.attempts, 1);
    // Another teacher sees none of it.
    const other = await h.signup('Dr Other', 'other2@uni.edu', { teacherInviteCode: 'FACULTY-INVITE' });
    assert.equal((await h.call('GET', `/api/studio/rooms/${room.id}/results`, { token: other.token })).status, 404);
    assert.equal((await h.call('GET', `/api/studio/attempts/${a.attemptId}`, { token: other.token })).status, 404);
  } finally { await h.close(); }
});

test('exam mode: one answer per question, partial credit, no feedback when the teacher hides it, attempts limited', async () => {
  const { h, teacher, student } = await setup();
  try {
    const doc = { ...sampleDoc(), mode: 'exam', showFeedback: false, maxAttempts: 1 };
    const room = await publishedRoom(h, teacher.token, doc);
    let a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    assert.equal(a.vault, null, 'no vault in exam mode');
    assert.equal(a.score, null, 'no running score in an exam without feedback');
    const r1 = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { choice: a.question.options[0].id } } });
    assert.equal(r1.body.correct, null, 'feedback hidden');
    assert.equal(r1.body.earned, null, 'points hidden too: they would tell right from wrong');
    assert.equal(r1.body.attempt.score, null);
    a = r1.body.attempt;
    assert.equal(a.index, 1, 'moved on whatever the answer');
    for (let i = 1; i < 5; i++) {
      const q = a.question;
      const response = q.type === 'hotspot' ? { x: 10, y: 10 } : q.type === 'text' ? { text: 'macrophage' } : q.type === 'number' ? { value: 1 } : { pairs: Object.fromEntries(q.left.map((l: { id: string }, j: number) => [l.id, q.right[j].id])) };
      a = (await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: q.id, response } })).body.attempt;
    }
    assert.equal(a.status, 'completed');
    const again = await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'attempts_exhausted');
  } finally { await h.close(); }
});

test('editing a published room never changes an attempt in progress (snapshot), and stale versions are refused', async () => {
  const { h, teacher, student } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token);
    const a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    const edited = { ...room.doc, questions: room.doc.questions.map((q: { id: string; prompt: string }) => (q.id === 'q-choice' ? { ...q, prompt: 'CHANGED' } : q)) };
    const saved = await h.call('PUT', `/api/studio/rooms/${room.id}`, { token: teacher.token, body: { doc: edited, version: room.version } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.version, room.version + 1);
    const stale = await h.call('PUT', `/api/studio/rooms/${room.id}`, { token: teacher.token, body: { doc: edited, version: room.version } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'version_conflict');
    const now = await h.call('GET', `/api/room-attempts/${a.attemptId}`, { token: student.token });
    assert.notEqual(now.body.question.prompt, 'CHANGED');
    // A published room cannot be saved into an unplayable state.
    const empty = await h.call('PUT', `/api/studio/rooms/${room.id}`, { token: teacher.token, body: { doc: { ...edited, questions: [] }, version: saved.body.version } });
    assert.equal(empty.status, 400);
  } finally { await h.close(); }
});

test('time limit: an overdue attempt closes as timeout and keeps the score earned so far', async () => {
  const { h, teacher, student } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token, { ...sampleDoc(), timeLimitSec: 120 });
    const a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    const igm = a.question.options.find((o: { label: string }) => o.label === 'IgM').id;
    await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { choice: igm } } });
    h.clock.t += 121_000;
    const late = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: 'q-spot', response: { x: 1230, y: 440 } } });
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'time_up');
    const review = await h.call('GET', `/api/room-attempts/${a.attemptId}/review`, { token: student.token });
    assert.equal(review.body.status, 'timeout');
    assert.equal(review.body.score, 20);
  } finally { await h.close(); }
});

test('publishing needs a class and no quality error; preview grades like a student without recording', async () => {
  const { h, teacher, student } = await setup();
  try {
    const created = await h.call('POST', '/api/studio/rooms', { token: teacher.token, body: { doc: sampleDoc(), classIds: [] } });
    const noClass = await h.call('PUT', `/api/studio/rooms/${created.body.id}/status`, { token: teacher.token, body: { status: 'published' } });
    assert.equal(noClass.status, 422);
    const foreign = await h.call('PUT', `/api/studio/rooms/${created.body.id}/classes`, { token: teacher.token, body: { classIds: [99999] } });
    assert.equal(foreign.status, 403);
    const pv = await h.call('GET', `/api/studio/rooms/${created.body.id}/preview`, { token: teacher.token });
    const q = pv.body.questions[0];
    const ck = await h.call('POST', `/api/studio/rooms/${created.body.id}/check`, { token: teacher.token, body: { questionId: q.id, response: { choice: q.options.find((o: { label: string }) => o.label === 'IgG').id } } });
    assert.deepEqual([ck.body.correct, ck.body.trap], [false, true]);
    const results = await h.call('GET', `/api/studio/rooms/${created.body.id}/results`, { token: teacher.token });
    assert.equal(results.body.summary.attempts, 0, 'previews are never recorded');
    assert.equal((await h.call('GET', '/api/rooms', { token: student.token })).body.rooms.length, 0, 'drafts are invisible');
    // Built-in missions can be copied into an editable room.
    const copy = await h.call('POST', '/api/studio/rooms', { token: teacher.token, body: { fromMission: 'hem-01' } });
    assert.equal(copy.status, 201, JSON.stringify(copy.body));
    assert.equal(copy.body.doc.questions[0].type, 'hotspot');
    assert.equal(copy.body.doc.questions[0].zones[0].x, 1231);
    const dup = await h.call('POST', `/api/studio/rooms/${copy.body.id}/duplicate`, { token: teacher.token, body: {} });
    assert.equal(dup.status, 201);
    assert.equal((await h.call('DELETE', `/api/studio/rooms/${dup.body.id}`, { token: teacher.token })).status, 200);
    assert.equal((await h.call('GET', '/api/studio/rooms', { token: teacher.token })).body.rooms.length, 2);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ adversarial review (2026-10-21) regressions
test('review fix: stored ids are refused; only this attempt\'s tokens are accepted (no identity-map match, no copied ids)', async () => {
  const { h, teacher, student } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token);
    const a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    const byId = await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: a.question.id, response: { choice: 'o1' } } });
    assert.equal(byId.status, 400, 'a stored option id is not an answer');
    const q = validateRoomDoc(sampleDoc(), noMedia).questions[4]!;
    assert.throws(() => grade(q, fromPublic(q, { pairs: { p1: 'p1', p2: 'p2', p3: 'p3' } }, 'salt')), /pairs/);
    assert.equal((await h.call('GET', `/api/room-attempts/${a.attemptId}`, { token: student.token })).body.question.wrong, 0, 'a refused response is not a wrong try');
  } finally { await h.close(); }
});

test('review fix: with revealAnswers off the learner review carries no id, no label table, no expected answer, no explanation for unsolved questions', async () => {
  const { h, teacher, student } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token, { ...sampleDoc(), mode: 'exam', revealAnswers: false, showFeedback: false });
    let a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    while (a.status === 'in_progress') {
      const q = a.question;
      const response = q.type === 'choice' ? { choice: q.options[0].id } : q.type === 'hotspot' ? { x: 1, y: 1 } : q.type === 'text' ? { text: 'macrophage' } : q.type === 'number' ? { value: 3 } : { pairs: Object.fromEntries(q.left.map((l: { id: string }, j: number) => [l.id, q.right[j].id])) };
      a = (await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: q.id, response } })).body.attempt;
    }
    const review = (await h.call('GET', `/api/room-attempts/${a.attemptId}/review`, { token: student.token })).body;
    const json = JSON.stringify(review.questions);
    assert.doesNotMatch(json, /"p1"|"o1"|"z-schisto"|:right/);
    for (const q of review.questions) {
      assert.deepEqual(q.labels, {});
      assert.equal(q.expected, null);
      if (!q.solved) assert.equal(q.explanation, '');
      for (const r of q.responses) assert.equal(typeof r.display, 'string');
    }
    // The teacher still sees everything.
    const detail = (await h.call('GET', `/api/studio/attempts/${a.attemptId}`, { token: teacher.token })).body;
    assert.ok(detail.questions[0].expected);
  } finally { await h.close(); }
});

test('review fix: "any" accepts one click in any of several correct zones; matching stays fast with 12 overlapping zones', () => {
  const doc = sampleDoc();
  doc.questions[1] = { ...doc.questions[1]!, zones: [
    { id: 'a', label: 'A', shape: 'circle', x: 200, y: 200, r: 30 }, { id: 'b', label: 'B', shape: 'circle', x: 600, y: 600, r: 30 },
  ], decoys: ['C'] } as never;
  const q = validateRoomDoc(doc, noMedia).questions[1]!;
  assert.equal(grade(q, { x: 600, y: 600 }).correct, true);
  assert.equal(grade(q, { x: 200, y: 200 }).correct, true);
  const many = { ...sampleDoc(), questions: [{ id: 'm', type: 'hotspot', prompt: 'All', points: 10, image: IMG, require: 'all', tolerance: 5,
    zones: Array.from({ length: 12 }, (_, i) => ({ id: `z${i}`, label: `Zone ${i}`, shape: 'circle', x: 800, y: 400, r: 200 + i })) }] };
  const big = validateRoomDoc(many, noMedia).questions[0]!;
  const t0 = performance.now();
  const v = grade(big, { points: Array.from({ length: 12 }, () => ({ x: 800, y: 400 })) });
  assert.ok(performance.now() - t0 < 100, 'polynomial matching');
  assert.equal(v.correct, true, 'twelve clicks in twelve overlapping zones can be paired');
});

test('review fix: two-item lists are shuffled without bias; a one-label text alternative blocks publishing; methanol is not ethanol', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 64; i++) seen.add(seededShuffle(['a', 'b'], `seed-${i}`).join(''));
  assert.deepEqual([...seen].sort(), ['ab', 'ba']);
  const doc = sampleDoc();
  doc.questions[1] = { ...doc.questions[1]!, zones: [{ id: 'only', label: 'Target', shape: 'circle', x: 1232, y: 440, r: 60 }], decoys: [] } as never;
  assert.ok(qualityCheck(validateRoomDoc(doc, noMedia)).notes.some((n) => n.code === 'few_choices' && n.level === 'error'));
  assert.equal(textMatches('methanol', 'ethanol', true), false);
  assert.equal(textMatches('ilium', 'ileum', true), false);
  assert.equal(textMatches('dendritc cell', 'dendritic cell', true), true);
});

test('review fix: a late answer closes the attempt for good (no rollback), a new start begins a fresh attempt, and an unpublished room cannot be played on', async () => {
  const { h, teacher, student } = await setup();
  try {
    const room = await publishedRoom(h, teacher.token, { ...sampleDoc(), timeLimitSec: 60 });
    const a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
    h.clock.t += 61_000;
    assert.equal((await h.call('POST', `/api/room-attempts/${a.attemptId}/hint`, { token: student.token, body: { questionId: a.question.id } })).status, 409);
    const stored = h.app.db.prepare('SELECT status FROM room_attempts WHERE id = ?').get(a.attemptId) as { status: string };
    assert.equal(stored.status, 'timeout');
    const again = await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} });
    assert.equal(again.body.resumed, false);
    assert.notEqual(again.body.attempt.attemptId, a.attemptId);
    await h.call('PUT', `/api/studio/rooms/${room.id}/status`, { token: teacher.token, body: { status: 'draft' } });
    const closed = await h.call('POST', `/api/room-attempts/${again.body.attempt.attemptId}/answer`, { token: student.token, body: { questionId: again.body.attempt.question.id, response: { choice: again.body.attempt.question.options[0].id } } });
    assert.equal(closed.status, 409);
    assert.equal(closed.body.error.code, 'room_closed');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ teacher rooms earn XP (owner decision, 2026-10-21)
test('a finished room adds its best score to the student\'s XP, the leaderboard and the weekly XP; only an improvement counts again', async () => {
  const { h, teacher, student } = await setup();
  try {
    const doc = { ...sampleDoc(), mode: 'exam', showFeedback: true, vaultCode: '' };
    const room = await publishedRoom(h, teacher.token, doc);
    const xp0 = (await h.call('GET', '/api/me', { token: student.token })).body.xp;
    const play = async (good: boolean) => {
      let a = (await h.call('POST', `/api/rooms/${room.id}/start`, { token: student.token, body: {} })).body.attempt;
      while (a.status === 'in_progress') {
        const q = a.question;
        const igm = q.type === 'choice' ? q.options.find((o: { label: string }) => o.label === (good ? 'IgM' : 'IgE')).id : null;
        const response = q.type === 'choice' ? { choice: igm } : q.type === 'hotspot' ? { x: 1, y: 1 } : q.type === 'text' ? { text: 'macrophage' } : q.type === 'number' ? { value: 3 } : { pairs: Object.fromEntries(q.left.map((l: { id: string }, j: number) => [l.id, q.right[j].id])) };
        a = (await h.call('POST', `/api/room-attempts/${a.attemptId}/answer`, { token: student.token, body: { questionId: q.id, response } })).body.attempt;
      }
      return a;
    };
    const first = await play(true);
    assert.equal(first.status, 'completed');
    assert.ok(first.score > 0);
    assert.equal(first.xpAwarded, first.score);
    assert.equal((await h.call('GET', '/api/me', { token: student.token })).body.xp, xp0 + first.score);
    const board = (await h.call('GET', '/api/leaderboard?scope=week&cohort=class', { token: student.token })).body;
    assert.equal(board.me.xp, first.score, 'room XP counts in the weekly leaderboard');
    const worse = await play(false);
    assert.equal(worse.xpAwarded, 0, 'a lower score adds nothing');
    assert.equal((await h.call('GET', '/api/me', { token: student.token })).body.xp, xp0 + first.score);
    // Deleting the room does not take earned XP away.
    await h.call('DELETE', `/api/studio/rooms/${room.id}`, { token: teacher.token });
    assert.equal((await h.call('GET', '/api/me', { token: student.token })).body.xp, xp0 + first.score);
  } finally { await h.close(); }
});
