// Round 14 backend fixes (R14-A-01 .. R14-A-11, R14-C-01). Written before the fixes: each test failed on the round-13 code (see the fix report).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { AnthropicHintProvider, leaksAnswer } from '../src/assistant.ts';
import { MISSION_BY_ID } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { DEMO_PASSWORD, seedDemo } from '../src/demo.ts';
import { Game } from '../src/game.ts';
import { classNameKey, nameKey, sameName } from '../src/names.ts';
import { openApi } from '../src/openapi.ts';
import { buildRoutes } from '../src/routes.ts';
import { RateLimiter } from '../src/http.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

const BE = fileURLToPath(new URL('..', import.meta.url));
const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}, password = 'correct horse battery') =>
  h.call('POST', '/api/auth/register', { body: { name, email, password, ...extra } });
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const step = (id: string) => [...MISSION_BY_ID.values()].flatMap((m) => m.steps).find((s) => s.id === id)!;

// ------------------------------------------------------------------ R14-A-01
test('R14-A-01: a lone U+0345 (combining ypogegrammeni) is dropped like any stray mark and never becomes the letter i', () => {
  assert.equal(nameKey('Dr. Claire Moreau\u0345'), nameKey('Dr. Claire Moreau'));
  assert.equal(nameKey('Zed Quark\u0345'), nameKey('Zed Quark'));
  assert.equal(nameKey('Zed \u0345Quark'), nameKey('Zed Quark'), 'after a space');
  assert.equal(nameKey('Zed 1\u0345'), nameKey('Zed 1'), 'after a digit');
  assert.equal(nameKey('\u0345Zed'), nameKey('Zed'), 'at the start');
  // The spacing form (U+037A) is NFKC-equal to a space followed by U+0345.
  assert.equal(nameKey('Zed Quark\u037A'), nameKey('Zed Quark'));
  assert.equal(classNameKey('Bio\u0345'), classNameKey('Bio'));
  assert.equal(classNameKey('Bio\u037A'), classNameKey('Bio'));
});

test('R14-A-01 (changed in R15-A-02): the polytonic iota-subscript letters are the plain letter with an accent, no longer equivalent to the diphthong alpha + iota', () => {
  // Round 14 kept ᾀ == ἈΙ and α + U+0345 == αι; that made a name plus one U+0345 a different key after α / η / ω (R15-A-02), so the subscript is now dropped everywhere.
  assert.ok(!sameName('ᾀ', 'ἈΙ'));
  assert.ok(!sameName('ᾳ', 'ΑΙ'));
  assert.ok(sameName('ᾀ', 'ἀ'));
  assert.ok(sameName('ᾳ', 'α'));
  assert.ok(sameName('α\u0345', 'α'), 'alpha + U+0345 is alpha');
  assert.ok(sameName('ἀ\u0345', 'Ἀ'), 'alpha with psili + U+0345');
  assert.ok(sameName('Ἀθηνᾶ', 'Ἀθηνᾶ'));
  assert.equal(classNameKey('ᾀ'), classNameKey('ἀ'));
  assert.equal(classNameKey('α\u0345'), classNameKey('α'));
});

test('R14-A-01: for EVERY combining mark (Mn, Mc, Me) appended to a Latin name the key is unchanged', () => {
  const base = 'Maria Lopez';
  const k = nameKey(base);
  const differing: string[] = [];
  let marks = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (!/\p{M}/u.test(c)) continue; // Mn, Mc, Me
    marks++;
    // Appended after the last letter, and placed after the first letter.
    if (nameKey(base + c) !== k || nameKey(`M${c}aria Lopez`) !== k) differing.push(`U+${cp.toString(16).toUpperCase()}`);
  }
  assert.ok(marks > 2000, `scanned ${marks} marks`);
  // No exception is deliberately significant for a Latin letter: every mark is an accent or a stray mark.
  assert.deepEqual(differing, []);
});

test('R14-A-01: no mark changes the key of a name whose last letter is Greek, Cyrillic or whose preceding character is a space or a digit', () => {
  for (const base of ['Zed Quark', 'Κώστας Παπάς', 'Иван Петров', 'Zed 1', 'Dr. 🧬']) {
    const k = nameKey(base);
    const differing: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const c = String.fromCodePoint(cp);
      // Marks of Arabic / Hebrew / Indic scripts etc. keep their meaning after a letter of THEIR script, but nothing may change the key after a space.
      if (/\p{M}/u.test(c) && nameKey(`${base} ${c}`) !== k) differing.push(`U+${cp.toString(16).toUpperCase()}`);
    }
    assert.deepEqual(differing, [], base);
  }
});

test('R14-A-01: a colleague name plus U+0345 is name_taken, the reserved demo name stays reserved, and a class name plus U+0345 is class_name_taken', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN, demo: true });
  try {
    await seedDemo(h.app.db, 1_700_000_000_000);
    const r = await register(h, 'Dr. Claire Moreau\u0345', 'u345@uni.edu', { teacherInviteCode: INVITE });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, 'name_taken');
    assert.equal((await register(h, 'Zed Quark', 'zq@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, 'Zed Quark\u0345', 'zq2@uni.edu', { teacherInviteCode: INVITE })).status, 409);
    const t = await register(h, 'Prof Classes', 'cls@uni.edu', { teacherInviteCode: INVITE });
    assert.equal((await h.call('POST', '/api/classes', { token: t.body.token, body: { name: 'Bio' } })).status, 201);
    const c = await h.call('POST', '/api/classes', { token: t.body.token, body: { name: 'Bio\u0345' } });
    assert.equal(c.status, 409);
    assert.equal(c.body.error.code, 'class_name_taken');
  } finally { await h.close(); }
});

test('R14-A-01: the answer guard no longer lets a label through with an inserted U+0345', () => {
  const s = step('hem-03-s2'); // Iron deficiency anemia
  assert.equal(leaksAnswer('It is Iron deficiency anem\u0345ia.', s), true);
  assert.equal(leaksAnswer('It is Iron deficiency anemia\u0345.', s), true);
});

// ------------------------------------------------------------------ R14-A-07
test('R14-A-07: the final sigma does not make the key depend on spacing or hidden characters', async () => {
  assert.equal(nameKey('Νίκος Ζhg'), nameKey('ΝίκοςΖhg'));
  assert.equal(nameKey('ΣΣ'), nameKey('Σ\u3164Σ'));
  assert.equal(nameKey('ΣΣ'), nameKey('Σ Σ'));
  assert.equal(nameKey('ΟΔΥΣΣΕΑΣ'), nameKey('οδυσσεας'));
  assert.equal(nameKey('σ'), nameKey('ς'));
  assert.equal(classNameKey('ΣΣ'), classNameKey('Σ\u3164Σ'));
  assert.equal(classNameKey('Νίκος\u200BΖ'), classNameKey('ΝίκοςΖ'));
  assert.equal(classNameKey('ς'), classNameKey('σ'));
  // Property: removing or adding spaces / hidden characters never changes equality (deterministic pseudo-random strings).
  let seed = 14;
  const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alphabet = ['Σ', 'σ', 'ς', 'a', 'B', 'Ν', 'ί', 'κ', 'ο', 'ς', 'Li', 'Wei', '1', 'ß', 'Ι', 'ι'];
  const hidden = [' ', '  ', '\u200B', '\u3164', '\u115F', '\uFFA0', '\u00AD', '\u2800 ', '\t', '\u200D'];
  for (let n = 0; n < 4000; n++) {
    const letters = Array.from({ length: 2 + rnd(7) }, () => alphabet[rnd(alphabet.length)]!);
    const plain = letters.join('');
    const spaced = letters.map((x) => x + (rnd(2) ? hidden[rnd(hidden.length)]! : '')).join('');
    assert.equal(nameKey(spaced), nameKey(plain), JSON.stringify([plain, spaced]));
    const invisible = letters.map((x) => x + (rnd(2) ? hidden[rnd(hidden.length)]!.trim() : '')).join('');
    if (!invisible.includes('\t')) assert.equal(classNameKey(invisible.replace(/[\u2800]/g, '')), classNameKey(plain.replace(/[\u2800]/g, '')), JSON.stringify([plain, invisible]));
  }
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    assert.equal((await register(h, 'Νίκος Ζhg', 'n1@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, 'ΝίκοςΖhg', 'n2@uni.edu', { teacherInviteCode: INVITE })).status, 409);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R14-A-02
function walDb(path: string) {
  const db = openDb(path);
  db.exec('CREATE TABLE probe_tmp (x); INSERT INTO probe_tmp VALUES (1)'); // a WAL frame, so the -wal and -shm files exist while this connection is open
  return db;
}
test('R14-A-02: openDb refuses a database file that is not writable (0444 and 0400, WAL) and tells why; nothing is widened', { skip: isRoot }, () => {
  for (const mode of [0o444, 0o400]) {
    const dir = mkdtempSync(join(tmpdir(), 'el-ro14-'));
    const path = join(dir, 'ro.db');
    const warn = mock.method(console, 'warn', () => {});
    let live: ReturnType<typeof openDb> | undefined;
    try {
      live = walDb(path);
      for (const f of [path, `${path}-wal`, `${path}-shm`]) { assert.ok(existsSync(f), f); chmodSync(f, mode); }
      assert.throws(() => openDb(path), /not writable/i, mode.toString(8));
      assert.equal(statSync(path).mode & 0o777, mode, 'mode unchanged');
      assert.equal(warn.mock.calls.filter((c) => /chmod 400/.test(String(c.arguments[0]))).length, 0, 'no advice to chmod 400');
    } finally {
      warn.mock.restore();
      live?.close();
      for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o600);
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('R14-A-02: the server ends start-up with ONE clean fatal line and exit 1 for a read-only database (never "listening")', { skip: isRoot }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-ro14s-'));
  const path = join(dir, 'ro.db');
  let live: ReturnType<typeof openDb> | undefined;
  try {
    live = walDb(path);
    for (const f of [path, `${path}-wal`, `${path}-shm`]) { assert.ok(existsSync(f), f); chmodSync(f, 0o444); }
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], {
      cwd: BE, encoding: 'utf8', timeout: 20_000,
      env: { ...process.env, DB_PATH: path, PORT: '0', AUTH_SECRET: 'x'.repeat(40), HOST: '127.0.0.1', DEMO_MODE: '', NODE_ENV: 'test' },
    });
    assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /listening/);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, /^Escape Lab API cannot start: cannot use the database at .*not writable/);
  } finally {
    live?.close();
    for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o600);
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------ R14-A-03
const NO_LEAK_CHOICE = 'hem-03-s2'; // correct option C (third), label "Iron deficiency anemia"
test('R14-A-03: hints that name the correct option by letter, number or ordinal are dropped (choice step, correct option C)', () => {
  const s = step(NO_LEAK_CHOICE);
  assert.equal(s.key.kind === 'choice' && s.key.answer, 'C');
  const leaks = [
    'Option C', 'option c', 'OPTION C.', 'C is correct.', 'c is correct', 'Choose C.', 'Choose c', 'Pick option C.', 'Go with C', 'go with c.', 'I would select (C).',
    'Answer: C', 'answer c', 'It is C', 'it is c.', 'The right one is C', 'Option C is the best fit', 'C is the best fit', 'C fits best given the MCV.', 'C is clearly the right one.',
    '(C)', 'Look at (C) again.', '[C]', 'Option (C)', 'Option "C"', "Option 'C'", 'Option: C', 'Option - C', 'Option\u00A0C', 'Option\nC', 'Op\u200Btion C', 'Option \u0421', // Cyrillic Es
    'Ｏｐｔｉｏｎ Ｃ', 'Option Ｃ', 'Choose Ｃ.', 'Option C\u0301', 'Letter C', 'the letter C', 'Select C and move on.', 'Pick C', 'Opt for C.', 'I recommend choice C.',
    'Prefer C.', 'Take C.', 'My pick: C', 'Your best choice is C.', 'The correct choice is C', 'The correct option is C.', 'A good choice here is C.',
    'The third option', 'the third option fits', 'Option 3', 'option 3.', 'Option #3', 'Option number 3', 'Option no. 3', 'Option three', 'option THREE', 'choice 3', 'Answer 3', 'Answer #3',
    'The 3rd choice', 'the 3rd option', 'Go with the third.', 'Pick the third one.', 'Choose the third answer.', 'The third one is right.', '(3)', 'Option (3)',
    'Option ３', 'Choose option ３.',
    // French (the UI has a French mode)
    'Choisissez C.', 'Option C', 'La réponse C', 'La bonne réponse est C', 'la troisième option', 'le choix 3', 'Proposition C', 'Je choisirais la lettre C.',
  ];
  for (const t of leaks) assert.equal(leaksAnswer(t, s), true, `should reject ${JSON.stringify(t)}`);
  for (const t of leaks) assert.equal(Game.cleanAssistantHint(t, s), null, `cleanAssistantHint ${JSON.stringify(t)}`);
});

test('R14-A-03: hints that talk about other options, the word option alone, or ordinary words pass (choice step, correct option C)', () => {
  const s = step(NO_LEAK_CHOICE);
  const fine = [
    'Option B ignores ferritin entirely.', 'option a is about the smear only', 'Think about options A and D first.', 'Compare the other options against the ferritin and TIBC values.',
    'Consider each option carefully.', 'Read every option before choosing.', 'Each option describes a different mechanism.', 'Which option explains the low ferritin?', 'Choose carefully.', 'Pick the finding that reflects iron stores.',
    'Vitamin C is not involved here.', 'Hepatitis C is irrelevant.', 'C-reactive protein rises with inflammation.', 'Choose C-reactive protein as the marker of inflammation.', 'Protein C and protein S are unrelated.',
    'Option D mentions bone marrow, which is not needed yet.', 'Options 1 and 2 are not supported by the data.', 'Option 4 can be excluded.', 'The fourth option does not match the TIBC.', 'The first option ignores the MCV.',
    'Look at the third column of the table.', 'Check the second step of the work-up.', 'Take a closer look at ferritin.', 'A low ferritin with a high CRP suggests that stores are depleted.', 'It is a chronic process.',
    'Go with the data, not with the first impression.', 'The answer lies in the TIBC and ferritin values.', 'Compare ferritin and TIBC.', 'Pick one marker of iron stores and explain it.', 'It is important to read the units.',
    'Ferritin of 3 ng/mL is very low.', 'The patient is 3 years old.', 'Think about three causes of microcytosis.', 'Answer with the lab values in mind.', 'What does the choice of an acute-phase reactant tell you?',
    'Option A is wrong because the MCV is normal, and (B) is excluded by the smear.', 'Choose between a low and a high ferritin: which one fits inflammation?',
    'Éliminez les autres options.', 'Regardez la ferritine et la CRP.', 'Le troisième tube est lipémique.',
  ];
  for (const t of fine) assert.equal(leaksAnswer(t, s), false, `should pass ${JSON.stringify(t)}`);
});

test('R14-A-03: the first option (letter A) is guarded without turning the article "a" into a leak', () => {
  const s = step('hem-03-s1'); // correct A "Microcytic"
  assert.equal(s.key.kind === 'choice' && s.key.answer, 'A');
  for (const t of ['Option A', 'option a.', 'A is correct.', 'Choose A', 'Go with A', 'Answer: A', 'It is A', '(A)', 'The first option', 'Option 1', 'Choose the first one.', 'The 1st choice', 'Option one', 'Pick option a.']) {
    assert.equal(leaksAnswer(t, s), true, JSON.stringify(t));
  }
  for (const t of ['A low MCV points at small cells.', 'Take a look at the MCV.', 'Choose a marker first.', 'Pick a value from the table and compare it with the range.', 'Think of a cause of small red cells.',
    'Option B is about large cells.', 'Pick one marker.', 'Each option has a different MCV range.', 'It is a matter of cell size.', 'Go with a quick look at the indices.', 'Compare option b and option c.']) {
    assert.equal(leaksAnswer(t, s), false, JSON.stringify(t));
  }
});

test('R14-A-03: decision steps are guarded by the position the learner sees (default decisions and own options)', () => {
  const s1 = step('hem-02-s1'); // default decisions, correct "reject" = second option
  assert.equal(s1.key.kind === 'decision' && s1.key.answer, 'reject');
  for (const t of ['Option B', 'B is correct', 'Choose B.', 'Go with B', 'The second option', 'Option 2', 'Answer: B', '(B)', 'Pick the second one.', 'Option two']) assert.equal(leaksAnswer(t, s1), true, JSON.stringify(t));
  for (const t of ['Option A is tempting but look at the clot.', 'Option C would hide the problem.', 'Think about what the clot does to the platelet count.', 'The first option leaves the clot unaddressed.', 'The third option ignores the clot.', 'Look at the other options.']) {
    assert.equal(leaksAnswer(t, s1), false, JSON.stringify(t));
  }
  const m4 = step('master-s4'); // own options, correct "alert" = third
  assert.equal(m4.key.kind === 'decision' && m4.key.answer, 'alert');
  for (const t of ['Option C', 'C is correct', 'The third option', 'Go with C', 'The last option', 'Option 3']) assert.equal(leaksAnswer(t, m4), true, JSON.stringify(t));
  for (const t of ['Option A discharges the patient too early.', 'Option B ignores the bacteremia.', 'Think about one cause for both findings.']) assert.equal(leaksAnswer(t, m4), false, JSON.stringify(t));
});

test('R14-A-03: no faculty-written hint, re-check text, case or prompt of any choice / decision step trips the guard', () => {
  let checked = 0;
  for (const m of MISSION_BY_ID.values()) {
    for (const s of m.steps) {
      if (s.key.kind !== 'choice' && s.key.kind !== 'decision') continue;
      for (const t of [...s.hints, s.recheck, s.context, s.prompt].filter((x): x is string => !!x)) { checked++; assert.equal(leaksAnswer(t, s), false, `${s.id}: ${t}`); }
    }
  }
  assert.ok(checked > 40, `checked ${checked} texts`);
});

test('R14-A-03: the provider is shown the options exactly as the learner sees them (letters by position, default decisions included)', async () => {
  const bodies: any[] = [];
  const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Look at the clot.' }] }), { status: 200 }); }) as unknown as typeof fetch;
  const p = new AnthropicHintProvider('k', 'm', 1000, f);
  await p.hint({ step: step('hem-03-s2'), level: 1, wrongSoFar: 0 });
  await p.hint({ step: step('hem-02-s1'), level: 1, wrongSoFar: 0 });
  await p.hint({ step: step('master-s4'), level: 1, wrongSoFar: 0 });
  const content = bodies.map((b) => String(b.messages[0].content));
  assert.match(content[0]!, /^C\. Iron deficiency anemia$/m);
  assert.match(content[1]!, /^B\. Reject and request a new sample$/m);
  assert.match(content[2]!, /^C\. Alert the clinician/m);
});

// ------------------------------------------------------------------ R14-A-05
test('R14-A-05: a hint with no visible letter, digit or emoji (invisible-only, marks-only, punctuation-only) falls back to the faculty hint', async () => {
  const s = step('hem-03-s1');
  for (const t of ['\u200B', '\u2060\u200C', '\u3164', '\u2800', '\u0301\u0301', '\uFE0F', '.', '   \u200B   ', '\u115F\u1160\uFFA0', '...', '—', '!?', '\u200B.\u200B', '\u2800\u3164', '\u00AD']) {
    assert.equal(Game.cleanAssistantHint(t, s), null, JSON.stringify(t));
  }
  assert.equal(Game.cleanAssistantHint('Check the units first.', s), 'Check the units first.');
  assert.equal(Game.cleanAssistantHint('42', s), '42');
  assert.equal(Game.cleanAssistantHint('\u{1F9EC}', s), '\u{1F9EC}', 'an emoji is visible');
  assert.equal(Game.cleanAssistantHint('\u200B你好', s), '\u200B你好');
  let reply = '\u3164';
  const h = await harness({ limits: OPEN, assistant: { hint: async () => reply } });
  try {
    let n = 0;
    for (const text of ['\u3164', '.', '\u2800', '\u200B', '\u0301']) {
      reply = text;
      const u = await h.signup(`Learner ${++n}`);
      const started = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
      const first = MISSION_BY_ID.get('hem-01')!.steps[0]!;
      const r = await h.call('POST', `/api/attempts/${started.body.attempt.attemptId}/hint`, { token: u.token, body: { stepId: first.id } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.source, 'standard', JSON.stringify(text));
      assert.equal(r.body.hint, first.hints[0]);
      assert.equal(r.body.penaltyXp, -15);
    }
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R14-A-08
test('R14-A-08: the 10-character minimum is counted after NFC and a whitespace-only password is refused', async () => {
  const h = await harness({ limits: OPEN });
  try {
    let n = 0;
    const attempt = (pw: string) => register(h, `Pw User ${++n}`, `pw${n}@uni.edu`, {}, pw);
    for (const pw of [' '.repeat(10), ' '.repeat(40), '\t'.repeat(12), '\u00A0'.repeat(10), '\u3000'.repeat(12), ' \n \n \n \n \n \n', 'e\u0301'.repeat(5), 'abcdefghi', 'abcdefgh' + 'e\u0301'.slice(0, 1), 'a'.repeat(8) + 'e\u0301']) {
      const r = await attempt(pw);
      assert.equal(r.status, 400, JSON.stringify(pw));
      assert.equal(r.body.error.code, 'validation_error');
      assert.ok(Array.isArray(r.body.error.details) && r.body.error.details.length > 0, JSON.stringify(pw));
    }
    for (const pw of ['e\u0301'.repeat(10), 'é'.repeat(10), 'correct horse battery', 'a'.repeat(9) + ' ', ' abcdefghi', '0123456789']) {
      assert.equal((await attempt(pw)).status, 201, JSON.stringify(pw));
    }
    // The stored secret is NFC: the decomposed and the composed spelling both sign in.
    assert.equal((await register(h, 'Nfd User', 'nfd@uni.edu', {}, 'e\u0301'.repeat(10))).status, 201);
    for (const pw of ['e\u0301'.repeat(10), '\u00E9'.repeat(10)]) assert.equal((await h.call('POST', '/api/auth/login', { body: { email: 'nfd@uni.edu', password: pw } })).status, 200);
  } finally { await h.close(); }
});

test('R14-A-08: the demo password is long enough and still signs the demo accounts in', async () => {
  assert.ok([...DEMO_PASSWORD.normalize('NFC')].length >= 10 && DEMO_PASSWORD.trim().length > 0);
  const h = await harness({ demo: true, limits: OPEN });
  try {
    await seedDemo(h.app.db, 1_700_000_000_000);
    const r = await h.call('POST', '/api/auth/login', { body: { email: 'claire.moreau@demo.escape-lab.app', password: DEMO_PASSWORD } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R14-A-10
test('R14-A-10: HEAD answers like GET without a body on every GET route and 405 on the others', async () => {
  const h = await harness({ limits: OPEN });
  try {
    for (const path of ['/api/health', '/api/rules', '/api/openapi.json']) {
      const g = await fetch(h.base + path);
      const body = await g.text();
      const r = await fetch(h.base + path, { method: 'HEAD' });
      assert.equal(r.status, g.status, path);
      assert.equal(await r.text(), '', `${path}: no body`);
      assert.equal(r.headers.get('content-type'), g.headers.get('content-type'));
      assert.equal(r.headers.get('content-length'), String(Buffer.byteLength(body)), `${path}: content-length of the GET body`);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    }
    // Authenticated GET routes keep their guards under HEAD.
    const u = await h.signup('Head Student');
    assert.equal((await fetch(h.base + '/api/me', { method: 'HEAD' })).status, 401);
    const ok = await fetch(h.base + '/api/me', { method: 'HEAD', headers: { authorization: `Bearer ${u.token}` } });
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '');
    assert.equal((await fetch(h.base + '/api/dashboard', { method: 'HEAD', headers: { authorization: `Bearer ${u.token}` } })).status, 200);
    assert.equal((await fetch(h.base + '/api/nope', { method: 'HEAD' })).status, 404);
    // Not a GET route: still 405, and HEAD is not offered.
    const post = await fetch(h.base + '/api/auth/login', { method: 'HEAD' });
    assert.equal(post.status, 405);
    assert.doesNotMatch(post.headers.get('allow') ?? '', /HEAD/);
    // A GET route answers 405 to other methods and offers HEAD.
    const del = await fetch(h.base + '/api/health', { method: 'DELETE' });
    assert.equal(del.status, 405);
    assert.match(del.headers.get('allow') ?? '', /GET, HEAD/);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R14-C-01 / R14-A-09
test('R14-C-01: Hangul fillers, trademark signs and modifier letters are never the initial; single-word names stay in full', () => {
  const cases: [string, string][] = [
    ['Ann \u3164', 'Ann'], ['Ann \u115F', 'Ann'], ['Ann \u1160', 'Ann'], ['Ann \uFFA0', 'Ann'], ['Ann \u3164\u115F', 'Ann'],
    ['Ann \u3164B', 'Ann B.'], ['Ann \u115FB', 'Ann B.'], ['Ann \uFFA0\u1160b', 'Ann B.'],
    ['Ann ™', 'Ann'], ['Ann ©x', 'Ann X.'], ['Ann ®', 'Ann'], ['Ann ™B', 'Ann B.'], ['Ann ‼', 'Ann'], ['Ann ™\uFE0F', 'Ann ™\uFE0F.'],
    ['Zoë ŉ', 'Zoë N.'], ['Zoë \u02BCx', 'Zoë X.'], ['Zoë \u02B0', 'Zoë'],
    ['\u200B Ann Lee', 'Ann L.'], ['\u3164 Ann Lee', 'Ann L.'],
    ['王小明', '王小明'], ['JeanDupont', 'JeanDupont'], ['Ann\u200BLee', 'Ann\u200BLee'],
    ['Kim ❤\uFE0F', 'Kim ❤\uFE0F.'], ['Kim \u{1F9EC}x', 'Kim \u{1F9EC}.'], ['Kim \u{1F1EB}\u{1F1F7}', 'Kim \u{1F1EB}\u{1F1F7}.'], ['Inès Moreau', 'Inès M.'], ['Hans ßtraße', 'Hans S.'],
  ];
  for (const [full, want] of cases) assert.equal(Game.shortName(full).normalize('NFC'), want.normalize('NFC'), JSON.stringify(full));
});

// ------------------------------------------------------------------ R14-A-11
test('R14-A-11: OpenAPI states the real class-name rule and declares Retry-After on every 429', () => {
  const db = openDb(':memory:');
  const spec = openApi(buildRoutes({ db, game: new Game(db), limiter: new RateLimiter(), secret: 'x', teacherInviteCode: '', now: Date.now })) as any;
  db.close();
  const cls = spec.paths['/api/classes'].post;
  assert.match(cls.description, /look-alike/i);
  assert.match(cls.description, /compatibility|fullwidth/i);
  assert.match(cls.description, /accents?/i);
  assert.match(cls.description, /punctuation/i);
  assert.match(cls.description, /U\+0345|ypogegrammeni/i);
  let n429 = 0;
  for (const [path, item] of Object.entries<any>(spec.paths)) {
    for (const [method, op] of Object.entries<any>(item)) {
      const r = op.responses['429'];
      if (!r) continue;
      n429++;
      const resolved = r.$ref ? spec.components.responses[r.$ref.split('/').pop()] : r;
      assert.ok(resolved.headers?.['Retry-After'], `${method} ${path}: Retry-After header`);
      assert.equal(resolved.headers['Retry-After'].schema.type, 'integer');
      assert.match(resolved.headers['Retry-After'].description, /Access-Control-Expose-Headers/);
      assert.ok(resolved.content?.['application/json'], `${method} ${path}: error body`);
    }
  }
  assert.ok(n429 >= 10, `found ${n429} 429 responses`);
  assert.match(spec.paths['/api/auth/register'].post.requestBody.content['application/json'].schema.properties.password.description, /NFC|normali[sz]/i);
});
