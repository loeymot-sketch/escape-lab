// Round 15 backend fixes (R15-A-01 .. R15-A-07). Written before the fixes: each test failed on the round-14 code (see the fix report).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/game.ts';
import { leaksAnswer } from '../src/assistant.ts';
import { MISSION_BY_ID } from '../src/content.ts';
import { DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { LOOKALIKES, classNameKey, nameKey, sameName, skeleton } from '../src/names.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

const BE = fileURLToPath(new URL('..', import.meta.url));
const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}, password = 'correct horse battery') =>
  h.call('POST', '/api/auth/register', { body: { name, email, password, ...extra } });
const step = (id: string) => [...MISSION_BY_ID.values()].flatMap((m) => m.steps).find((s) => s.id === id)!;

// ------------------------------------------------------------------ R15-A-01
test('R15-A-01: the Greek lunate sigma (U+03F2 / U+03F9) reads as the Latin c in every key', () => {
  assert.ok(sameName('Dr. \u03F9laire Moreau', 'Dr. Claire Moreau'));
  assert.ok(sameName('Dr. \u03F2laire Moreau', 'Dr. Claire Moreau'));
  assert.ok(sameName('Dr. \u03F9laire Moreau', 'dr. claire moreau'));
  assert.equal(classNameKey('\u03F9ell Biology'), classNameKey('Cell Biology'));
  assert.equal(classNameKey('\u03F2ell Biology'), classNameKey('cell biology'));
  assert.equal(skeleton('\u03F9laire'), skeleton('Claire'));
  // Not a blanket rule: a real sigma stays a sigma.
  assert.ok(!sameName('Σοφία', 'Zοφία'));
  assert.ok(!sameName('Σοφία', 'Ioφία'));
});

test('R15-A-01: EVERY entry of the look-alike table fires (key of the entry, in both cases, equals the key of its Latin target; also skeleton and class key)', () => {
  const dead: string[] = [];
  for (const [k, v] of Object.entries(LOOKALIKES)) {
    for (const form of [k, k.toUpperCase(), `x${k}y`, `X${k.toUpperCase()}Y`]) {
      const target = form.replace(k.toUpperCase(), v).replace(k, v);
      if (nameKey(form) !== nameKey(target)) dead.push(`nameKey ${JSON.stringify(form)}`);
      if (skeleton(form) !== skeleton(target)) dead.push(`skeleton ${JSON.stringify(form)}`);
      if (classNameKey(form) !== classNameKey(target)) dead.push(`classNameKey ${JSON.stringify(form)}`);
    }
  }
  assert.deepEqual(dead, []);
  // The table is the one the key uses: Greek lunate sigma is in it.
  assert.equal(LOOKALIKES['\u03F2'], 'c');
});

test('R15-A-01: a lunate-sigma twin of a colleague / the reserved demo teacher is name_taken, over HTTP', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN, demo: true });
  try {
    await seedDemo(h.app.db, 1_700_000_000_000);
    for (const [i, n] of ['Dr. \u03F9laire Moreau', 'Dr. \u03F2laire Moreau'].entries()) {
      const r = await register(h, n, `lun${i}@uni.edu`, { teacherInviteCode: INVITE });
      assert.equal(r.status, 409, JSON.stringify(r.body));
      assert.equal(r.body.error.code, 'name_taken');
    }
    assert.equal((await register(h, 'Cora Lee', 'zq@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, '\u03F2ora Lee', 'zq1@uni.edu', { teacherInviteCode: INVITE })).status, 409);
    assert.equal((await register(h, 'Ed \u03F9uark', 'zq2@uni.edu', { teacherInviteCode: INVITE })).status, 201, 'a different name is still allowed');
    const t = await register(h, 'Prof Classes', 'cls@uni.edu', { teacherInviteCode: INVITE });
    assert.equal((await h.call('POST', '/api/classes', { token: t.body.token, body: { name: 'Cell Biology' } })).status, 201);
    const c = await h.call('POST', '/api/classes', { token: t.body.token, body: { name: '\u03F9ell Biology' } });
    assert.equal(c.status, 409);
    assert.equal(c.body.error.code, 'class_name_taken');
  } finally { await h.close(); }
});

test('R15-A-01: the answer guard sees a lunate-sigma letter as C', () => {
  const s = step('hem-03-s2'); // correct option C
  assert.equal(leaksAnswer('Option \u03F9', s), true);
  assert.equal(leaksAnswer('option \u03F2', s), true);
  // the label guard shares the skeleton: a lunate sigma standing for the c of "deficiency" still spells the correct label
  assert.equal(leaksAnswer('Maybe Iron defi\u03F2iency anemia fits.', s), true);
});

// ------------------------------------------------------------------ R15-A-02
test('R15-A-02: a U+0345 (or an iota-subscript letter) never makes a different Greek name', () => {
  const pairs: [string, string][] = [
    ['Μαρία Παπαδοπούλου', 'Μαρίᾳ Παπαδοπούλου'],
    ['Μαρία Παπαδοπούλου', 'Μαρία\u0345 Παπαδοπούλου'],
    ['Μαρία Παπαδοπούλου', 'Μαρίᾳ Παπαδοπούλου'.normalize('NFD')],
    ['Ελένη Κωνσταντίνου', 'Ελένῃ Κωνσταντίνου'],
    ['Ελένη Κωνσταντίνου', 'Ελένη\u0345 Κωνσταντίνου'],
    ['Ὠραία', 'Ὠραία\u0345'],
    ['Ἀθηνᾶ', 'Ἀθηνᾷ'],
    ['ᾀ', 'ἀ'],
    ['ᾀ', 'Ἀ'],
    ['ᾳ', 'α'],
    ['ᾼ', 'Α'],
    ['ῳ', 'ω'],
    ['α\u0345', 'α'],
  ];
  for (const [a, b] of pairs) {
    assert.ok(sameName(a, b), `${JSON.stringify(a)} ~ ${JSON.stringify(b)}`);
    assert.equal(classNameKey(a), classNameKey(b), `class ${JSON.stringify(a)}`);
  }
  // Case and final sigma still fold; real Greek names stay apart.
  assert.ok(sameName('ΜΑΡΊΑ', 'μαρίᾳ'));
  assert.ok(sameName('Νίκος', 'ΝΙΚΟΣ'));
  assert.ok(!sameName('Ελένη', 'Ελένα'));
});

test('R15-A-02: a U+0345 after ANY Greek letter, and every letter that contains an iota subscript, is a mere accent', () => {
  const differing: string[] = [];
  let letters = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    if (/\p{Script=Greek}/u.test(c) && /\p{L}/u.test(c)) {
      letters++;
      if (nameKey(`Zed ${c}\u0345 Quark`) !== nameKey(`Zed ${c} Quark`)) differing.push(`U+${cp.toString(16)} + 0345`);
    }
    // a letter whose canonical decomposition carries the iota subscript equals the same letter without it
    const d = c.normalize('NFD');
    if (d.includes('\u0345')) {
      if (nameKey(`Zed ${c} Quark`) !== nameKey(`Zed ${d.replace(/\u0345/gu, '')} Quark`)) differing.push(`U+${cp.toString(16)}`);
    }
  }
  assert.ok(letters > 300, `scanned ${letters} Greek letters`);
  assert.deepEqual(differing, []);
});

test('R15-A-02: both Greek twin pairs of the finding are name_taken over HTTP (precomposed and combining U+0345)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    assert.equal((await register(h, 'Μαρία Παπαδοπούλου', 'm1@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    for (const [i, twin] of ['Μαρίᾳ Παπαδοπούλου', 'Μαρία\u0345 Παπαδοπούλου', 'Μαρίᾳ Παπαδοπούλου'.normalize('NFD')].entries()) {
      const r = await register(h, twin, `m2${i}@uni.edu`, { teacherInviteCode: INVITE });
      assert.equal(r.status, 409, twin);
      assert.equal(r.body.error.code, 'name_taken');
    }
    assert.equal((await register(h, 'Ελένη Κωνσταντίνου', 'e1@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    const r = await register(h, 'Ελένῃ Κωνσταντίνου', 'e2@uni.edu', { teacherInviteCode: INVITE });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'name_taken');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R15-A-03
const C_STEP = 'hem-03-s2'; // correct option C "Iron deficiency anemia"
const D_STEP = 'hem-03-s3'; // correct option D (last)
test('R15-A-03: bare, decorated, spaced and numbered ways of naming option C are dropped', () => {
  const s = step(C_STEP);
  assert.equal(s.key.kind === 'choice' && s.key.answer, 'C');
  const leaks = [
    "C'est C", "c'est C", '**C**', 'C)', 'C.', 'C:', 'C', 'c', '"C"', '“C”', '«C»', '<C>', '__C__', '(C', 'C]',
    'Look at C', 'Look at C again.', 'look at c', 'Consider C', 'consider c.', 'I would say C', 'Focus on C', 'Hint: C', 'hint: c', 'Think C!', 'Tick C', 'Mark C', 'Circle C', 'Check C', 'Click C', 'Tap C', 'Press C', 'C, definitely',
    'O p t i o n C', 'O p t i o n   C', 'A n s w e r : C', 'OptionC', 'AnswerC', 'O\u200B p t i o n C',
    'Option III', 'option iii', 'Option \u2162', 'Option 3', 'Choose 3', 'Choose 3.', 'Go with 3', 'Pick 3', 'It is 3', 'It is 3.', 'No. 3', '#3', '3)', '3', 'Option \u03F9',
    'Regardez C', 'Choisissez 3.',
  ];
  for (const t of leaks) assert.equal(leaksAnswer(t, s), true, `should reject ${JSON.stringify(t)}`);
  for (const t of leaks.slice(0, 12)) assert.equal(Game.cleanAssistantHint(t, s), null, `cleanAssistantHint ${JSON.stringify(t)}`);
});

test('R15-A-03: the last option (D) is guarded by letter, roman numeral, number and "the last"', () => {
  const s = step(D_STEP);
  assert.equal(s.key.kind === 'choice' && s.key.answer, 'D');
  for (const t of ['D.', 'D)', 'I would say D', 'Focus on D', 'Look at D', 'Go with the last', 'Go with the last.', 'Choose the last', 'Choose the last one', 'Pick the last.', 'Option IV', 'option iv', 'Choose 4', 'Option 4', 'Go with the final.', 'Choisissez le dernier.']) {
    assert.equal(leaksAnswer(t, s), true, `should reject ${JSON.stringify(t)}`);
  }
});

test('R15-A-03: the closed list keeps zero false positives on ordinary text (vitamin C, C-reactive protein, 37 °C, step 3, "Option" alone, the article a)', () => {
  const c = step(C_STEP);
  for (const t of [
    'Vitamin C is not relevant here.', 'C-reactive protein is raised in inflammation.', 'At 37 °C the enzyme is active; the MCV is 72 fL.', 'Step 3 is about the cause; Hb 8.4 g/dL, ferritin 6 ng/mL.', 'Option',
    'Hepatitis C and hepatitis B are viral.', 'Group B streptococci.', 'Consider the ferritin and the MCV.', 'Look at the option list carefully.', 'Look at the smear.', 'Look at C-reactive protein.', 'Consider vitamin C intake.',
    'Think about type C hepatitis.', 'Check C3 and C4 complement.', 'Take 3 samples.', 'Pick 3 values and compare them.', 'Choose 3 markers.', 'Go with the data.', 'Read the 3 values: Hb 8.1, MCV 70, RDW 18.', 'C. difficile causes colitis.',
    'Press the sample gently.', 'Mark the slide.', 'Check the units.', 'Think about it.', 'Consider option A: it explains the MCV but not the ferritin.', 'Option B ignores ferritin.', 'Option IV is not needed.', 'Take the 3rd sample at 10:00.',
    'It is 3 mg/dL.', 'Mark 3 slides.', 'No 3 patients were enrolled.', 'B, T and NK cells are lymphocytes.', 'Hb 3.', 'Look at B cells.', 'Compare with vitamin B12.', 'Heparin C-tubes', 'Go with the last sample you took',
    'Choisissez un marqueur.', 'Regardez la ferritine.', 'Thème 3 : le fer.',
  ]) assert.equal(leaksAnswer(t, c), false, `should pass ${JSON.stringify(t)}`);
  const a = step('hem-03-s1'); // correct A
  for (const t of ['A low MCV points at small cells.', 'Take a look at the MCV.', 'Consider A low ferritin value.', 'Look at a smear of 3 fields.', 'Choose a marker first.', 'Think about a cause.', 'Consider a case of anemia.', 'Mark a slide.', 'Check a sample.', 'Option B is about large cells.', 'Look at A small cell.', 'a', 'It is a matter of cell size.']) {
    assert.equal(leaksAnswer(t, a), false, `should pass ${JSON.stringify(t)}`);
  }
  const b = step('bio-03-s1'); // correct B
  assert.equal(b.key.kind === 'choice' && b.key.answer, 'B');
  for (const t of ['Look at B cells.', 'B cells make antibodies.', 'Consider B lymphocytes.', 'B, T and NK cells are lymphocytes.', 'Hepatitis B vaccine.', 'Think about group B streptococci.', 'Check B12 and folate.', 'Mark 2 slides.', 'Choose 2 markers.']) {
    assert.equal(leaksAnswer(t, b), false, `should pass ${JSON.stringify(t)}`);
  }
  for (const t of ['B', 'B.', 'Look at B', 'Option II', 'option ii', 'Choose 2', 'Mark B', "C'est B", 'O p t i o n B']) assert.equal(leaksAnswer(t, b), true, `should reject ${JSON.stringify(t)}`);
  const d = step(D_STEP);
  for (const t of ['Vitamin D is relevant.', 'Look at D-dimer.', 'Look at D dimer.', 'Go with the last sample you took.', 'Choose the last sample.', 'Consider the final value.', 'Think about the last result.', 'Check the last line of the table.']) {
    assert.equal(leaksAnswer(t, d), false, `should pass ${JSON.stringify(t)}`);
  }
});

test('R15-A-03: no faculty-written hint, re-check text, case or prompt of any choice / decision step trips the extended guard', () => {
  let checked = 0;
  for (const m of MISSION_BY_ID.values()) {
    for (const s of m.steps) {
      if (s.key.kind !== 'choice' && s.key.kind !== 'decision') continue;
      for (const t of [...s.hints, s.recheck, s.context, s.prompt].filter((x): x is string => !!x)) { checked++; assert.equal(leaksAnswer(t, s), false, `${s.id}: ${t}`); }
    }
  }
  assert.ok(checked > 40, `checked ${checked} texts`);
});

// ------------------------------------------------------------------ R15-A-04
test('R15-A-04: HEAD never writes: an overdue attempt stays in_progress under HEAD and GET expires it', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const u = await h.signup('Head Student');
    const start = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
    assert.equal(start.status, 201);
    const id = start.body.attempt.attemptId as string;
    const status = () => (h.app.db.prepare('SELECT status FROM attempts WHERE id = ?').get(id) as { status: string }).status;
    h.clock.t += 3 * 3600_000; // far past the time limit
    const headers = { authorization: `Bearer ${u.token}` };
    const head = await fetch(`${h.base}/api/attempts/${id}`, { method: 'HEAD', headers });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(status(), 'in_progress', 'HEAD did not materialise the expiry');
    const changes = () => (h.app.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    for (const p of ['/api/me', '/api/dashboard', '/api/labs', '/api/labs/hematology', '/api/vault', '/api/badges', '/api/competencies', '/api/profile', '/api/leaderboard', `/api/attempts/${id}`, `/api/attempts/${id}/result`, '/api/labs/hematology/results']) {
      const r = await fetch(h.base + p, { method: 'HEAD', headers });
      assert.ok(r.status < 500, `${p}: ${r.status}`);
    }
    assert.equal(changes(), before, 'no HEAD request changed a row');
    assert.equal(status(), 'in_progress');
    const get = await h.call('GET', `/api/attempts/${id}`, { token: u.token });
    assert.equal(get.status, 200);
    assert.equal(status(), 'expired', 'GET keeps expiring the attempt');
    // The pragma used to make HEAD safe is switched off again: later writes work.
    const again = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
    assert.equal(again.status, 201);
  } finally { await h.close(); }
});

test('R15-A-04: HEAD on teacher routes of a seeded database writes nothing and answers like GET (status)', async () => {
  const h = await harness({ limits: OPEN, demo: true });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const tl = await h.call('POST', '/api/auth/login', { body: { email: DEMO_TEACHER_EMAIL, password: DEMO_PASSWORD } });
    const sl = await h.call('POST', '/api/auth/login', { body: { email: DEMO_STUDENT_EMAIL, password: DEMO_PASSWORD } });
    const classes = await h.call('GET', '/api/classes', { token: tl.body.token });
    const cid = classes.body.classes[0].id as number;
    const changes = () => (h.app.db.prepare('SELECT total_changes() AS n').get() as { n: number }).n;
    const before = changes();
    for (const [p, tok] of [['/api/classes', tl.body.token], [`/api/classes/${cid}/students`, tl.body.token], [`/api/classes/${cid}/analytics`, tl.body.token], ['/api/content/missions', tl.body.token],
      ['/api/dashboard', sl.body.token], ['/api/badges', sl.body.token], ['/api/profile', sl.body.token], ['/api/leaderboard', sl.body.token], ['/api/labs/hematology', sl.body.token]] as const) {
      const g = await h.call('GET', p, { token: tok });
      const r = await fetch(h.base + p, { method: 'HEAD', headers: { authorization: `Bearer ${tok}` } });
      assert.equal(r.status, g.status, p);
    }
    // GET may catch up badges; HEAD alone may not write.
    const mid = changes();
    for (const p of ['/api/badges', '/api/dashboard']) await fetch(h.base + p, { method: 'HEAD', headers: { authorization: `Bearer ${sl.body.token}` } });
    assert.equal(changes(), mid);
    assert.ok(mid >= before);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R15-A-06
test('R15-A-06: leaksAnswer is bounded: a 1 MB text is answered in well under a second (child process, killed after 20 s)', () => {
  const script = `
    import { leaksAnswer } from ${JSON.stringify(new URL('../src/assistant.ts', import.meta.url).href)};
    import { MISSION_BY_ID } from ${JSON.stringify(new URL('../src/content.ts', import.meta.url).href)};
    const s = MISSION_BY_ID.get('hem-03').steps.find((x) => x.id === 'hem-03-s2');
    const out = [];
    for (const unit of ['C ', 'option ', 'the ', 'is ', 'also ', '\\u0345\\u0345', '( ', 'a ']) {
      const text = unit.repeat(Math.ceil(1_000_000 / unit.length));
      const t0 = performance.now();
      const r = leaksAnswer(text, s);
      out.push([JSON.stringify(unit), r, Math.round(performance.now() - t0)]);
    }
    console.log(JSON.stringify(out));`;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', script], { cwd: BE, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 0, `child ended with ${r.status} / ${r.signal} after ${Date.now() - t0} ms: ${r.stderr}`);
  const rows = JSON.parse(r.stdout.trim().split('\n').pop()!) as [string, boolean, number][];
  for (const [unit, , ms] of rows) assert.ok(ms < 1000, `${unit}: ${ms} ms`);
  // A text longer than the analysed length cannot be verified: it is treated as a leak (the 400-character limit rejects it anyway).
  assert.ok(rows.every(([, leaked]) => leaked === true));
});

test('R15-A-06: texts within the limit are analysed exactly as before (400 characters of ordinary prose pass, 400 of "C " leak)', () => {
  const s = step(C_STEP);
  assert.equal(leaksAnswer('Compare the MCV with the reference range first. '.repeat(8).slice(0, 400), s), false);
  assert.equal(leaksAnswer('Compare the MCV first. '.repeat(15) + 'Option C', s), true);
});

// ------------------------------------------------------------------ R15-A-07
test('R15-A-07: a password with fewer than 6 visible characters is refused (invisible, format and filler characters do not count); counted after NFC everywhere', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const reg = (password: string, i: number) => h.call('POST', '/api/auth/register', { body: { name: `Pw User ${i}`, email: `pw${i}@uni.edu`, password } });
    const refused = [
      '\u200B'.repeat(10), 'ㅤ'.repeat(10), '⠀'.repeat(10), '\u200B'.repeat(200), '\u00AD'.repeat(12), '\u2060\u200C\u200D'.repeat(4), '\uFEFF'.repeat(10),
      'ᅟᅠﾠ'.repeat(4), ' \u200B'.repeat(10), 'abc\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B', '\u0344'.repeat(5), '\u0301'.repeat(12), '\uE000'.repeat(12), 'a'.repeat(5) + 'ㅤ'.repeat(5),
      ' '.repeat(12), '\u00A0'.repeat(12),
    ];
    let i = 0;
    for (const p of refused) {
      const r = await reg(p, i++);
      assert.equal(r.status, 400, JSON.stringify(p));
      assert.equal(r.body.error.code, 'validation_error');
    }
    // Still fine: ordinary and non-Latin passwords, and the visible count ignores the space between words.
    const fine = ['correct horse battery', '1234567890', 'abcdef\u200B\u200B\u200B\u200B', 'a b c d e f g h', '密码密码密码密码密码', 'e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301e\u0301', 'ह\u093Fन\u094Dद\u0940भ\u093Eष\u093E', '🔑'.repeat(10)];
    for (const p of fine) {
      const r = await reg(p, i++);
      assert.equal(r.status, 201, `${JSON.stringify(p)} ${JSON.stringify(r.body)}`);
    }
    // Length is the NFC length in the schema and in the handler: the same message for 9 NFC characters whether they were typed composed or decomposed.
    const nine = await reg('e\u0301'.repeat(4) + 'abcde', i++); // NFC: 9 characters
    assert.equal(nine.status, 400);
    // Five U+0344 are ten characters after NFC but not visible: refused by the visibility rule with the same family of message.
    const marks = await reg('\u0344'.repeat(5), i++);
    assert.equal(marks.status, 400);
    assert.match(JSON.stringify(marks.body), /visible/);
  } finally { await h.close(); }
});

test('R15-A-07: demo accounts and legacy short passwords still sign in; the register schema no longer disagrees with the handler', async () => {
  const h = await harness({ limits: OPEN, demo: true });
  try {
    await seedDemo(h.app.db, h.clock.t);
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: DEMO_STUDENT_EMAIL, password: DEMO_PASSWORD } })).status, 200);
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    const pw = spec.paths['/api/auth/register'].post.requestBody.content['application/json'].schema.properties.password;
    assert.equal(pw.minLength, undefined, 'the length floor is enforced by the handler, after NFC');
    assert.match(pw.description, /visible/);
  } finally { await h.close(); }
});
