// Round 13 backend fixes. Written before the fixes: each test failed on the round-12 code (see the fix report).
import assert from 'node:assert/strict';
import { randomBytes, scrypt } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AnthropicHintProvider, forbiddenPhrases, leaksAnswer } from '../src/assistant.ts';
import { hashPassword, verifyPassword } from '../src/auth.ts';
import { MISSION_BY_ID } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { DEMO_PASSWORD, seedDemo } from '../src/demo.ts';
import { Game } from '../src/game.ts';
import { classNameKey, hasBidiControl, imitatesReviewerSuffix, nameKey, sameName } from '../src/names.ts';
import { correct, harness, solve } from './helpers.ts';

const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const register = (h: Awaited<ReturnType<typeof harness>>, name: string, email: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });

// ------------------------------------------------------------------ R13-A-01
test('R13-A-01: for every cased Unicode character the upper-case and lower-case forms have the same key (no script is case-sensitive)', () => {
  const bad: string[] = [];
  let cased = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    const up = c.toUpperCase(); const lo = c.toLowerCase();
    if (up === lo) continue;
    // R14-A-01: U+0345 is the one combining MARK with a case mapping (its upper case is the letter Ι). A mark is never part of a key (it is dropped like every stray
    // accent), so the mark and the letter are deliberately NOT one name.
    if (cp === 0x345) continue;
    // R15-A-02: the letters with an iota subscript (ᾀ ᾳ ῃ ῳ ...) expand to TWO letters in upper case (ᾳ -> ΑΙ). Their subscript is dropped from the key like a stray
    // U+0345, so ᾳ is the same name as α, not as ΑΙ: for these letters only the lower-case form and the letter itself are compared (r15-fixes.test.ts scans the subscript itself).
    const iota = c.normalize('NFD').includes('\u0345');
    cased++;
    for (const [a, b] of (iota ? [[lo, c]] : [[up, lo], [up, c], [lo, c]]) as [string, string][]) {
      if (nameKey(`ab${a}cd`) !== nameKey(`ab${b}cd`)) { bad.push(`U+${cp.toString(16)} ${JSON.stringify([a, b])}`); break; }
    }
  }
  assert.ok(cased > 1300, `scanned ${cased} cased characters`);
  assert.deepEqual(bad, []);
});

test('R13-A-01: Greek names that differ only in case are one name, and the capital and lower-case of each Latin-looking Greek letter share a Latin target', () => {
  assert.ok(sameName('Ελένη Παπαδοπούλου', 'ελένη παπαδοπούλου'));
  assert.ok(sameName('Ελένη Παπαδοπούλου', 'ΕΛΕΝΗ ΠΑΠΑΔΟΠΟΥΛΟΥ'));
  assert.ok(sameName('Βασίλης Αντωνίου', 'βασίλης αντωνίου'));
  assert.ok(sameName('Νίκος', 'νίκος'), 'R13: capital N and nu are one letter in two cases, so they fold to one key');
  assert.ok(sameName('Νίκος', 'ΝΙΚΟΣ'));
  for (const [grk, lat] of [['Β', 'b'], ['Ε', 'e'], ['Ζ', 'z'], ['Η', 'h'], ['Μ', 'm'], ['Ν', 'n'], ['Τ', 't'], ['Υ', 'y']] as const) {
    assert.equal(nameKey(grk), nameKey(lat), grk);
    assert.equal(nameKey(grk.toLowerCase()), nameKey(lat), grk.toLowerCase());
  }
  // Real Greek names stay apart.
  assert.ok(!sameName('Αλέξανδρος', 'Αθανάσιος'));
  assert.ok(!sameName('Ελένη', 'Ελένα'));
});

test('R13-A-01: a teacher cannot take a colleague\'s Greek name by changing its case (register and rename: 409 name_taken)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const a = await h.signup('Ελένη Παπαδοπούλου 779', 'ga@uni.edu', { teacherInviteCode: INVITE });
    assert.ok(a.token);
    for (const [i, n] of ['ελένη παπαδοπούλου 779', 'ΕΛΕΝΗ ΠΑΠΑΔΟΠΟΥΛΟΥ 779'].entries()) {
      const r = await register(h, n, `gb${i}@uni.edu`, { teacherInviteCode: INVITE });
      assert.equal(r.status, 409, n); assert.equal(r.body.error.code, 'name_taken');
    }
    const b = await h.signup('Βασίλης Αντωνίου', 'gc@uni.edu', { teacherInviteCode: INVITE });
    const c = await h.signup('Teacher C', 'gd@uni.edu', { teacherInviteCode: INVITE });
    const r = await h.call('PUT', '/api/profile', { token: c.token, body: { name: 'βασίλης αντωνίου' } });
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'name_taken');
    assert.ok(b.token);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R13-A-02 / A-03
const hem03 = MISSION_BY_ID.get('hem-03')!;
const step = hem03.steps[1]!; // answer: "Iron deficiency anemia"
const LABEL = 'Iron deficiency anemia';

test('R13-A-02: the answer guard sees the correct label through zero-width, soft hyphen, NBSP, double spaces, newlines, bidi reversal and look-alikes', () => {
  assert.deepEqual(forbiddenPhrases(step), [LABEL]);
  const leaks: Record<string, string> = {
    exact: `It is ${LABEL}.`,
    zwsp: 'It is Iron\u200B deficiency\u200B anemia.',
    zwj: 'It is Iron\u200D deficiency anemia.',
    wordJoiner: 'It is Iron\u2060 deficiency anemia.',
    bom: 'It is Iron\uFEFF deficiency anemia.',
    softHyphen: 'It is Iron defi\u00ADciency anemia.',
    doubleSpace: 'It is Iron  deficiency  anemia.',
    newline: 'It is Iron\ndeficiency\nanemia.',
    tabs: 'It is Iron\t\tdeficiency\tanemia.',
    nbsp: 'It is Iron\u00A0deficiency anemia.',
    narrowNbsp: 'It is Iron\u202Fdeficiency\u2009anemia.',
    lineSep: 'It is Iron\u2028deficiency\u2029anemia.',
    noSpaces: 'It is Irondeficiencyanemia.',
    hyphenated: 'It is Iron-deficiency anemia.',
    punctuated: 'It is "Iron, deficiency; anemia".',
    accent: 'It is Íron deficiency anémia.',
    fullwidth: 'It is Ｉron deficiency anemia.',
    cyrillic: 'It is Iron deficiency anemi\u0430.',
    greek: 'It is Iron deficiency anemi\u03B1.',
    upper: 'IT IS IRON DEFICIENCY ANEMIA.',
    control: 'It is Iron\u0001 defi\u0002ciency ane\u007Fmia.',
    mixed: 'It is I\u200Bro\u00ADn\u00A0\u00A0defi\ncien\tcy a\u2060nemia.',
  };
  for (const [name, text] of Object.entries(leaks)) assert.equal(Game.cleanAssistantHint(text, step), null, name);
  // Bidirectional controls are refused outright, so a reversed label inside an override cannot reach the learner either.
  for (const text of ['\u202Eaimena ycneicifed norI\u202C', 'Reversed: \u202Eaimena ycneicifed norI', 'Nothing to see \u2066here\u2069', 'abc\u061Cdef', 'a\u202Ab\u202Bc\u202Dd']) {
    assert.equal(hasBidiControl(text), true, JSON.stringify(text));
    assert.equal(Game.cleanAssistantHint(text, step), null, JSON.stringify(text));
    assert.equal(leaksAnswer(text, step), true, JSON.stringify(text));
  }
  // "The answer is ..." in disguise.
  for (const text of ['The ans\u200Bwer is C', 'The  correct\nanswer\u00A0is C', 'the \u0430nswer is C', 'THE CHOICE IS C', 'The option\tis C']) {
    assert.equal(Game.cleanAssistantHint(text, step), null, JSON.stringify(text));
  }
});

test('R13-A-02: legitimate hints still pass (words of a label are not the label; direction marks and other scripts are fine)', () => {
  const ok = [
    'Ferritin reflects stores. Which conditions lower it?',
    'Think about iron and about how deficiency of stores shows up; then consider anemia in general.',
    'Compare the TIBC with the ferritin before you choose.',
    'Anemia of any kind needs the MCV first.',
    'Look at the RDW: a deficiency of iron stores widens it.',
    'تحقق من مخزون الحديد. فكّر في الفيريتين',
    'Ali\u200E Reza\u200F, check the é è values.',
    'Line one\nLine two\twith a tab',
  ];
  for (const text of ok) assert.equal(Game.cleanAssistantHint(text, step), text, JSON.stringify(text));
  assert.equal(leaksAnswer('Compare the MCV with the reference range first.', MISSION_BY_ID.get('hem-03')!.steps[0]!), false);
  // A decision step that uses the default decisions is guarded through the same skeleton.
  const dec = MISSION_BY_ID.get('hem-02')!.steps[0]!;
  const label = forbiddenPhrases(dec)[0]!;
  assert.ok(label.length > 3);
  assert.equal(Game.cleanAssistantHint(`Probably ${[...label].join('\u200B')}.`, dec), null);
  assert.equal(Game.cleanAssistantHint(`Probably ${label.replace(/ /g, '\u00A0\u00A0')}.`, dec), null);
});

test('R13-A-02: through the hint endpoint every bypass falls back to the standard hint, and a legitimate AI hint is delivered', async () => {
  let reply: string | null = null;
  const h = await harness({ limits: OPEN, assistant: { hint: async () => reply } });
  let n = 0;
  // A learner at hem-03 step 2: the earlier missions are solved, step 1 is answered.
  const learner = async () => {
    const u = await h.signup(`Hint Seeker ${++n}`, `hs${n}@uni.edu`);
    await solve(h, u.token, 'hem-01'); await solve(h, u.token, 'hem-02');
    const a = (await h.call('POST', `/api/missions/${hem03.id}/start`, { token: u.token })).body.attempt;
    const first = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: hem03.steps[0]!.id, response: correct(hem03.steps[0]!) } });
    assert.equal(first.status, 200);
    return { token: u.token, id: a.attemptId as string };
  };
  try {
    const probes = ['It is Iron\u200B deficiency\u200B anemia.', 'It is Iron\u00A0deficiency anemia.', 'It is Iron\ndeficiency\nanemia.', '\u202Eaimena ycneicifed norI', 'It is Iron  deficiency  anemia.'];
    for (const p of probes) {
      const u = await learner();
      reply = p;
      const r = await h.call('POST', `/api/attempts/${u.id}/hint`, { token: u.token, body: { stepId: step.id } });
      assert.equal(r.status, 200, JSON.stringify(p));
      assert.equal(r.body.source, 'standard', JSON.stringify(p));
      assert.equal(r.body.hint, step.hints[0]);
      assert.equal(r.body.penaltyXp, -15);
    }
    const u = await learner();
    reply = 'Ferritin reflects stores. Which conditions lower it?';
    const ok = await h.call('POST', `/api/attempts/${u.id}/hint`, { token: u.token, body: { stepId: step.id } });
    assert.equal(ok.body.source, 'assistant');
    assert.equal(ok.body.hint, reply);
    assert.equal(ok.body.penaltyXp, -15);
  } finally { await h.close(); }
});

test('R13-A-03: the Anthropic provider and Game count the 400-character limit in code points', async () => {
  const fake = (text: string): typeof fetch => (async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 })) as unknown as typeof fetch;
  const st = MISSION_BY_ID.get('hem-01')!.steps[0]!;
  const call = (text: string) => new AnthropicHintProvider('k', 'm', 1000, fake(text)).hint({ step: st, level: 1, wrongSoFar: 0 });
  for (const cp of ['\u{1F9EC}', '\u{20000}']) {
    const t300 = cp.repeat(300);
    assert.equal(await call(t300), t300, `300 x U+${cp.codePointAt(0)!.toString(16)} is 300 characters`);
    assert.equal(Game.cleanAssistantHint(t300, st), t300);
    assert.equal(await call(cp.repeat(400)), cp.repeat(400));
    assert.equal(await call(cp.repeat(401)), null);
    assert.equal(Game.cleanAssistantHint(cp.repeat(401), st), null);
  }
  assert.equal(await call('x'.repeat(401)), null);
  assert.equal(await call('x'.repeat(400)), 'x'.repeat(400));
});

// ------------------------------------------------------------------ R13-A-04
test('R13-A-04: "teacher" followed by # / ♯ / № and anything digit-like is reserved, with or without brackets', () => {
  const bad = [
    'Eve (teacher #1O)', 'Eve2 (teacher #l0)', 'Eve3 (teacher ♯10)', 'Eve6 (teacher #10', 'Eve7 (teacher #IO)', 'Eve8 teacher #12', 'Eve teacher#7', 'Eve TEACHER # 3',
    'Eve (teacher №5)', 'Eve teacher №5', 'Mallory teacher #٥', 'Teacher #5', 'Eve (teacher ＃1)', 'Eve [teacher ♯ l ]', 'Eve (tеacher #l)', 'Eve (t\u200Beacher #1|',
    'Eve (teacher #Il)', 'Eve (teacher #00',
  ];
  for (const v of bad) assert.equal(imitatesReviewerSuffix(v), true, JSON.stringify(v));
  const fine = [
    'Teacher Smith', 'Teacher', 'Teacher Olivia', 'Dr. Smith (Biology)', 'Room #5', '(teacher)', 'Dr. Smith (#1)', 'The teacher (5)', '(teachers #5)', 'Teacher #Oliver', 'Teacher #Ian', 'Teacher #Lina', 'teacher No Name',
  ];
  for (const v of fine) assert.equal(imitatesReviewerSuffix(v), false, JSON.stringify(v));
});

test('R13-A-04: U+061C (Arabic letter mark) is a refused bidi control; registration answers 400 for the new spellings', async () => {
  assert.equal(hasBidiControl('Ab\u061Cc'), true);
  assert.equal(hasBidiControl('Ali\u200E \u200F'), false, 'LRM and RLM stay allowed');
  const h = await harness({ limits: OPEN });
  try {
    let n = 0;
    for (const name of ['Ab\u061Cc', 'Eve (teacher #1O)', 'Eve (teacher #l0)', 'Eve (teacher ♯10)', 'Eve (teacher #10']) {
      const r = await register(h, name, `s${++n}@uni.edu`);
      assert.equal(r.status, 400, JSON.stringify(name));
      assert.equal(r.body.error.code, 'validation_error');
    }
    assert.equal((await register(h, 'Teacher Smith', 'ok@uni.edu')).status, 201);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R13-A-07
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
test('R13-A-07: start-up never widens a read-only database to 0600 (it is left alone; since R14-A-02 it is refused because the API cannot write to it)', { skip: isRoot }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-ro-'));
  const path = join(dir, 'ro.db');
  const warn = mock.method(console, 'warn', () => {});
  try {
    openDb(path).close();
    chmodSync(path, 0o444);
    // R13 started a 0444 database and logged a warning; every write route then answered 500 (R14-A-02), so start-up now refuses it.
    assert.throws(() => openDb(path), /not writable/i);
    assert.equal(statSync(path).mode & 0o777, 0o444, 'mode unchanged');
    // A normal file is narrowed to 0600 as before.
    const other = join(dir, 'rw.db');
    openDb(other).close();
    chmodSync(other, 0o644);
    openDb(other).close();
    assert.equal(statSync(other).mode & 0o777, 0o600);
  } finally { warn.mock.restore(); chmodSync(path, 0o644); rmSync(dir, { recursive: true, force: true }); }
});

test('R13-A-07: a database with a NEWER schema is refused before anything is touched (no chmod, no WAL, no sidecar files)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-new-'));
  const path = join(dir, 'newer.db');
  try {
    const raw = new DatabaseSync(path);
    raw.exec('PRAGMA user_version = 99; CREATE TABLE t (x)');
    raw.close();
    chmodSync(path, 0o644);
    assert.throws(() => openDb(path), /newer than this build/);
    assert.equal(statSync(path).mode & 0o777, 0o644, 'mode untouched');
    assert.equal(existsSync(`${path}-wal`), false);
    assert.equal(existsSync(`${path}-shm`), false);
    const check = new DatabaseSync(path);
    assert.equal((check.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'delete', 'journal mode untouched');
    check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R13-A-08
const legacyHash = async (pw: string) => {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((res, rej) => scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
};
test('R13-A-08: passwords are stored as NFC; verification tries the raw string, then its NFC form (old hashes keep working)', async () => {
  const nfc = 'pässwörd-é-123'; const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  const fresh = await hashPassword(nfd);
  assert.equal(await verifyPassword(nfc, fresh), true, 'registered as NFD, typed as NFC');
  assert.equal(await verifyPassword(nfd, fresh), true, 'registered as NFD, typed as NFD');
  assert.equal(await verifyPassword(`${nfc}x`, fresh), false);
  assert.equal(await verifyPassword('', fresh), false);
  // Hashes written by the old code (raw UTF-8) still verify with the raw string and with its NFC form.
  const oldNfc = await legacyHash(nfc);
  assert.equal(await verifyPassword(nfc, oldNfc), true);
  assert.equal(await verifyPassword(nfd, oldNfc), true, 'an NFD login of an NFC-registered password');
  const oldNfd = await legacyHash(nfd);
  assert.equal(await verifyPassword(nfd, oldNfd), true, 'an NFD hash still matches the raw NFD string');
  assert.equal(await verifyPassword('wrong', oldNfd), false);
  assert.equal(await verifyPassword(DEMO_PASSWORD, await hashPassword(DEMO_PASSWORD)), true);
  assert.equal(await verifyPassword(DEMO_PASSWORD, await legacyHash(DEMO_PASSWORD)), true);
});

test('R13-A-08: register with one Unicode form and sign in with the other (200); wrong passwords and the demo password behave', async () => {
  const h = await harness({ demo: true, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const nfc = 'pässwörd-é-123'; const nfd = nfc.normalize('NFD');
    const reg = await h.call('POST', '/api/auth/register', { body: { name: 'Accent Pw', email: 'accent@uni.edu', password: nfc } });
    assert.equal(reg.status, 201);
    for (const pw of [nfc, nfd]) assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'accent@uni.edu', password: pw } })).status, 200);
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'accent@uni.edu', password: `${nfc}!` } })).status, 401);
    const reg2 = await h.call('POST', '/api/auth/register', { body: { name: 'Accent Two', email: 'accent2@uni.edu', password: nfd } });
    assert.equal(reg2.status, 201);
    for (const pw of [nfc, nfd]) assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'accent2@uni.edu', password: pw } })).status, 200);
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'claire.moreau@demo.escape-lab.app', password: DEMO_PASSWORD } })).status, 200);
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'claire.moreau@demo.escape-lab.app', password: 'not the demo pw' } })).status, 401);
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'nobody@uni.edu', password: nfd } })).status, 401);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R13-A-10
test('R13-A-10: class_name_taken carries `details` like the other validation errors', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await h.signup('Prof Details', 'pd@uni.edu', { teacherInviteCode: INVITE });
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Group A' } })).status, 201);
    const r = await h.call('POST', '/api/classes', { token: t.token, body: { name: 'group a' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'class_name_taken');
    assert.ok(Array.isArray(r.body.error.details) && r.body.error.details.length === 1, JSON.stringify(r.body.error));
    assert.match(r.body.error.details[0], /^body\.name /);
  } finally { await h.close(); }
});

test('R13-A-10: class names fold case, spacing, invisible characters and Cyrillic / Greek look-alikes, but digits, punctuation and I / l / 1 stay significant', async () => {
  // Collisions: the same label as far as a picker is concerned.
  for (const [a, b] of [['STRASSE 1', 'Straße 1'], ['Biology 101', 'Bi\u043Elogy 101'], ['Group A', 'Group\u00A0\u00A0A'], ['Group A', 'Gr\u200Boup A'], ['σίσυφος', 'ΣΊΣΥΦΟΣ'], ['σίσυφοσ', 'σίσυφος'], ['Ελένη', 'ελένη']] as [string, string][]) {
    assert.equal(classNameKey(a), classNameKey(b), JSON.stringify([a, b]));
  }
  // Different classes that the person-name key would merge (it ignores punctuation and treats 1 / I / l and 0 / O as one letter).
  for (const [a, b] of [
    ['L2 Biomedical Sciences', 'L3 Biomedical Sciences'], ['L1 Biology', 'LI Biology'], ['Section 1.2', 'Section 12'], ['Year 1', 'Year I'], ['Group 0', 'Group O'], ['Class 10', 'Class IO'],
    ['Group A', 'Group B'], ['Génétique', 'Genetique'], ['Bio-1', 'Bio1'],
  ] as [string, string][]) {
    assert.notEqual(classNameKey(a), classNameKey(b), JSON.stringify([a, b]));
  }
  assert.equal(nameKey('L1 Biology'), nameKey('LI Biology'), 'the person-name key would have merged them: that is why classes have their own weaker fold');
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await h.signup('Prof Classes', 'pc@uni.edu', { teacherInviteCode: INVITE });
    for (const name of ['L1 Biology', 'LI Biology', 'L2 Biomedical Sciences', 'L3 Biomedical Sciences', 'Section 1.2', 'Section 12']) {
      assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name } })).status, 201, name);
    }
    for (const name of ['l1 biology', 'L2 Biomedical  Sciences', 'L3 BIOMEDICAL SCIENCES']) {
      assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name } })).status, 409, name);
    }
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Biology 101' } })).status, 201);
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Bi\u043Elogy 101' } })).status, 409, 'Cyrillic o next to Latin o');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R13-B-03 / R13-C-04
test('R13-B-03: the leaderboard initial is the first grapheme of the first visible letter-like character of the last word', () => {
  const cases: [string, string][] = [
    ['Inès Moreau', 'Inès M.'],
    ['Madonna', 'Madonna'],
    ['Ana Maria Lopez', 'Ana L.'],
    ['Max \u{1F468}\u200D\u{1F469}\u200D\u{1F467}fam', 'Max \u{1F468}\u200D\u{1F469}\u200D\u{1F467}.'],
    ['Zoe \u{1F1EB}\u{1F1F7}France', 'Zoe \u{1F1EB}\u{1F1F7}.'],
    ['Ana \u200D\u200Dz', 'Ana Z.'],
    ['Sam \u200BK', 'Sam K.'],
    ['Sam \u200FK', 'Sam K.'],
    ['Eve \u202Ex', 'Eve X.'],
    ['Eve \u0301x', 'Eve X.'],
    ['Eve \u200B', 'Eve'],
    ['Eve \u202E', 'Eve'],
    ['Eve \u0301', 'Eve'],
    ['Eve \u200D', 'Eve'],
    ['Eve (Bell)', 'Eve B.'],
    ['Eve "quote"', 'Eve Q.'],
    ['Hans ßtraße', 'Hans S.'],
    ['Ali džemal', 'Ali D.'],
    ['Ali ǆemal', 'Ali D.'],
    ['Li 李', 'Li 李.'],
    ['Jo e\u0301mile', 'Jo É.'],
    ['Jo émile', 'Jo É.'],
    ['Kim 1st', 'Kim 1.'],
    ['Kim ❤\uFE0F', 'Kim ❤\uFE0F.'],
    ['Kim \u{1F9EC}\u{1F3FD}x', 'Kim \u{1F9EC}\u{1F3FD}.'],
  ];
  for (const [full, want] of cases) assert.equal(Game.shortName(full).normalize('NFC'), want.normalize('NFC'), JSON.stringify(full));
});

// ------------------------------------------------------------------ R13-C-08 support
test('R13-C-08: student detail carries historyTotal (all completed attempts, even beyond the 20 listed)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await h.signup('Prof History', 'ph@uni.edu', { teacherInviteCode: INVITE });
    const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'History class' } })).body;
    const u = await h.signup('History Kid', 'hk@uni.edu');
    assert.equal((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: cls.joinCode } })).status, 200);
    const detail = async () => (await h.call('GET', `/api/classes/${cls.id}/students/${u.id}`, { token: t.token })).body;
    let d = await detail();
    assert.equal(d.historyTotal, 0);
    assert.deepEqual(d.history, []);
    const ins = h.app.db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at, completed_at, wrong_total, hints_total, score) VALUES (?,?,?,'completed',0,?,?,0,0,100)");
    for (let i = 0; i < 3; i++) ins.run(`a${i}`, u.id, 'hem-01', 1000 + i, 2000 + i);
    d = await detail();
    assert.equal(d.historyTotal, 3); assert.equal(d.history.length, 3);
    for (let i = 3; i < 27; i++) ins.run(`a${i}`, u.id, 'hem-01', 1000 + i, 2000 + i);
    d = await detail();
    assert.equal(d.historyTotal, 27, 'the total counts every completed attempt');
    assert.equal(d.history.length, 20, 'the list is still the latest 20');
    assert.ok(Number.isInteger(d.historyTotal) && d.historyTotal >= d.history.length);
    // Another student's attempts and unfinished attempts are not counted.
    const v = await h.signup('Other Kid', 'ok@uni.edu');
    ins.run('other', v.id, 'hem-01', 1, 2);
    h.app.db.prepare("INSERT INTO attempts (id, user_id, mission_id, status, current_step, started_at) VALUES ('open', ?, 'hem-02', 'in_progress', 0, 5)").run(u.id);
    assert.equal((await detail()).historyTotal, 27);
  } finally { await h.close(); }
});

test('R13-C-08: CORS responses expose Retry-After to the browser (wildcard and single-origin configurations, errors included)', async () => {
  for (const corsOrigin of ['*', 'https://app.example']) {
    const h = await harness({ corsOrigin, limits: { ...OPEN, loginFailuresPerIp: 2 } });
    try {
      const get = await fetch(`${h.base}/api/health`, { headers: { origin: 'https://app.example' } }).catch(() => null);
      assert.ok(get);
      assert.match(get.headers.get('access-control-expose-headers') ?? '', /\bRetry-After\b/i, corsOrigin);
      const pre = await fetch(`${h.base}/api/auth/login`, { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' } });
      assert.match(pre.headers.get('access-control-expose-headers') ?? '', /\bRetry-After\b/i);
      let limited: Response | undefined;
      for (let i = 0; i < 5 && !limited; i++) {
        const r = await fetch(`${h.base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://app.example', 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@uni.edu', password: 'whatever pw' }) });
        if (r.status === 429) limited = r;
      }
      assert.ok(limited, '429 reached');
      assert.ok(Number(limited.headers.get('retry-after')) >= 1);
      assert.match(limited.headers.get('access-control-expose-headers') ?? '', /\bRetry-After\b/i);
    } finally { await h.close(); }
  }
  // A foreign origin on a single-origin configuration gets no CORS headers at all.
  const h = await harness({ corsOrigin: 'https://app.example', limits: OPEN });
  try {
    const r = await fetch(`${h.base}/api/health`, { headers: { origin: 'https://evil.example' } });
    assert.equal(r.headers.get('access-control-expose-headers'), null);
  } finally { await h.close(); }
});
