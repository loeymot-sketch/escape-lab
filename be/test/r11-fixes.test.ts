import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { listenHost } from '../src/app.ts';
import type { HintProvider } from '../src/assistant.ts';
import { MISSIONS } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { DEMO_TEACHER_NAME, Game } from '../src/game.ts';
import { imitatesReviewerSuffix, sameName } from '../src/names.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Round 11 backend fixes (R11-A-01 .. R11-A-09, R11-C-06).
const BE = fileURLToPath(new URL('..', import.meta.url));
const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });
const rename = (h: Harness, token: string, name: string) => h.call('PUT', '/api/profile', { token, body: { name } });
// Two names "collide" when the teacher-uniqueness check would treat them as the same name. 
const same = sameName;

// ------------------------------------------------------------------ R11-A-01
const CYR = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', X: 'Х', Y: 'У' };
const GRK = { A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', Y: 'Υ', X: 'Χ' };

test('R11-A-01: capital Cyrillic and Greek look-alikes fold to the Latin skeleton', () => {
  const pairs: [string, string][] = [
    ['Marie Dubois', `${CYR.M}arie Dubois`], ['Marie Dubois', `${GRK.M}arie Dubois`],
    ['Kate Thomas', `${CYR.K}ate ${CYR.T}homas`], ['Kate Thomas', `${GRK.K}ate ${GRK.T}homas`],
    ['Henri Bernard', `${CYR.H}enri ${CYR.B}ernard`], ['Henri', `${GRK.H}enri`],
    ['Nina', `${GRK.N}ina`], ['Zoe Quinn', `${GRK.Z}oe Quinn`], ['Bea', `${GRK.B}ea`], ['Bea', `${CYR.B}ea`],
    ['Yves Corneau', `${CYR.Y}ves ${CYR.C}orneau`], ['Yves Corneau', `${GRK.Y}ves Corneau`], ['Xavier', `${CYR.X}avier`], ['Xavier', `${GRK.X}avier`],
    ['Peter Oates', `${CYR.P}eter ${CYR.O}ates`], ['Peter Oates', `${GRK.P}eter ${GRK.O}ates`], ['Alice Eve', `${CYR.A}lic${CYR.E} ${GRK.E}ve`], ['Alice', `${GRK.A}lice`], ['Ian', `${GRK.I}an`],
    ['Dr. Claire Moreau', `Dr. Claire ${CYR.M}oreau`], ['Dr. Claire Moreau', `Dr. Claire ${GRK.M}oreau`], ['Dr. Claire Moreau', `DR. CLAIRE ${CYR.M}${CYR.O}REAU`],
    ['Dr. Claire Moreau', `Dr. ${CYR.C}laire ${GRK.M}${CYR.O}reau`],
  ];
  for (const [a, b] of pairs) assert.ok(same(a, b), `${JSON.stringify(a)} ~ ${JSON.stringify(b)}`);
  // Case of the same Cyrillic / Greek text still folds, in both directions.
  assert.ok(same('Мария', 'мария'));
  assert.ok(same('Σοφία', 'σοφία'));
  assert.ok(same('Νίκος', 'ΝΙΚΟΣ'));
  // R13-A-01: case is folded before the look-alike table is applied, so Greek capital Ν and lower-case ν have the same key (round 12 kept them apart on purpose).
  assert.ok(same('Νίκος', 'νίκος'));
});

test('R11-A-01: a combining mark that follows no letter (start, space, digit, punctuation) is ignored', () => {
  for (const v of ['Zoe ́Quinn', 'Zoe Quinn ́', 'Zoe Quinn1́', '́Zoe Quinn', 'Zoe. ́Quinn', 'Zoe Quinń̂']) assert.ok(same(v, 'Zoe Quinn') || same(v, 'Zoe Quinn1'), JSON.stringify(v));
  assert.ok(same('Zoe Quinn1́', 'Zoe Quinn1'));
});

test('R11-A-01: capital homoglyphs of a colleague or of the reserved demo teacher are refused at register and rename (409 name_taken)', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const marie = await h.signup('Marie Dubois', 'marie@uni.edu', { teacherInviteCode: INVITE });
    const other = await h.signup('Teacher Other', 'other@uni.edu', { teacherInviteCode: INVITE });
    let n = 0;
    for (const name of [`${CYR.M}arie Dubois`, `${GRK.M}arie Dubois`, `Marie Dubois${'́'}`, `Marie ́Dubois`, `Dr. Claire ${CYR.M}oreau`, `Dr. Claire ${GRK.M}oreau`, `Dr. ${CYR.C}laire ${CYR.M}oreau`]) {
      const email = `h${++n}@uni.edu`;
      const r = await register(h, name, email, { teacherInviteCode: INVITE });
      assert.equal(r.status, 409, `register ${JSON.stringify(name)}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.error.code, 'name_taken');
      const p = await rename(h, other.token, name);
      assert.equal(p.status, 409, `rename ${JSON.stringify(name)}`);
    }
    // Real Cyrillic / Greek names, a student with the same look-alike name, and keeping your own name stay possible.
    assert.equal((await register(h, 'Мария Иванова', 'maria@uni.edu', { teacherInviteCode: INVITE })).status, 201);
    assert.equal((await register(h, `${CYR.M}arie Dubois`, 'student-marie@uni.edu')).status, 201, 'students are not subject to the teacher rule');
    assert.equal((await rename(h, marie.token, 'MARIE DUBOIS')).status, 200);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R11-A-02
const BLANKS = ['', '', '⁥', '￰', '͸', '\u{f0000}', '  ', '⁥​'];

test('R11-A-02: a name made only of private-use, unassigned or default-ignorable characters is a 400 validation_error (register, every role, and rename)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await h.signup('Teacher Real', 'real-teacher@uni.edu', { teacherInviteCode: INVITE });
    const s = await h.signup('Student Real', 'real-student@uni.edu');
    let n = 0;
    for (const name of BLANKS) {
      for (const extra of [{}, { teacherInviteCode: INVITE }]) {
        const email = `blank${++n}@uni.edu`;
        const r = await register(h, name, email, extra);
        assert.equal(r.status, 400, `register ${JSON.stringify(name)} ${JSON.stringify(extra)}: ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error.code, 'validation_error', JSON.stringify(name));
        assert.equal(h.app.db.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').get(email)!.n, 0);
      }
      for (const tok of [t.token, s.token]) {
        const p = await rename(h, tok, name);
        assert.equal(p.status, 400, `rename ${JSON.stringify(name)}: ${JSON.stringify(p.body)}`);
        assert.equal(p.body.error.code, 'validation_error');
      }
    }
    assert.equal((await h.call('GET', '/api/profile', { token: t.token })).body.user.name, 'Teacher Real');
    assert.equal((await h.call('GET', '/api/profile', { token: s.token })).body.user.name, 'Student Real');
    // A name with one visible character next to those is fine.
    assert.equal((await register(h, 'X', 'x@uni.edu')).status, 201);
  } finally { await h.close(); }
});

test('R11-A-02: Game.checkDisplayName itself rejects a name whose comparison key is empty', () => {
  for (const name of BLANKS) assert.throws(() => Game.checkDisplayName(name), (e: any) => e.status === 400 && e.code === 'validation_error', JSON.stringify(name));
  assert.doesNotThrow(() => Game.checkDisplayName('!!!'));
  assert.doesNotThrow(() => Game.checkDisplayName('Bob'));
});

// ------------------------------------------------------------------ R11-C-06
test('R11-C-06: "(teacher #n)" is recognised with non-ASCII digits, the numero sign and ornate brackets', () => {
  const bad = [
    'Mallory (teacher #٥)', 'Mallory (teacher #۵)', 'Mallory (teacher #५)', 'Mallory (teacher №5)', 'Mallory (teacher № 5)', 'Mallory ❨teacher #5❩', 'Mallory ⟮teacher #5⟯',
    'Mallory ⦅teacher #5⦆', 'Mallory [teacher #5]', 'Mallory 〔teacher #5〕', 'Mallory （teacher ＃5）', 'Mallory (teacher #５)', 'Mallory (teacher #\u{1d7d7})',
    'Mallory (teacher #5)', 'Mallory (TЕACHER #5)', `Mallory (${CYR.T}eacher #5)`,
  ];
  for (const v of bad) assert.equal(imitatesReviewerSuffix(v), true, JSON.stringify(v));
  // R13-A-04: 'Teacher #5', 'Teacher №5' and 'Mallory teacher #٥' moved to the refused list in r13-fixes.test.ts: the check no longer needs brackets.
  for (const v of ['Dr. Smith (Biology)', 'Room #5', '(teacher)', 'Dr. Smith (#1)', 'The teacher (5)', '(teachers #5)']) assert.equal(imitatesReviewerSuffix(v), false, JSON.stringify(v));
});

test('R11-C-06: register and rename refuse those spellings with a 400 that names the field', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const u = await h.signup('Real Teacher', 'rt@uni.edu', { teacherInviteCode: INVITE });
    let n = 0;
    for (const name of ['Mallory (teacher #٥)', 'Mallory (teacher №5)', 'Mallory ❨teacher #5❩']) {
      const r = await register(h, name, `m${++n}@uni.edu`);
      assert.equal(r.status, 400, JSON.stringify(name));
      assert.equal(r.body.error.code, 'validation_error');
      assert.ok(Array.isArray(r.body.error.details) && /body\.name/.test(r.body.error.details[0]), 'same {code,message,details} shape as every other validation_error');
      assert.equal((await rename(h, u.token, name)).status, 400);
    }
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R11-A-07
test('R11-A-07: genuinely different names stay distinct; presentational marks fold', () => {
  const collide: [string, string][] = [
    ['محمد', 'مُحَمَّد'], // محمد / مُحَمَّد
    ['محمد', 'مـحـمـد'], // tatweel
    ['דוד', 'דָּוִד'], // דוד / דָּוִד
    ['Алёна', 'Алена'], // ё is written е
    ['José Muñoz', 'Jose Munoz'], ['Zoë', 'ZOE'], ['Αλέξανδρος', 'Αλεξανδροσ'],
    ['Anne-Marie', 'Annemarie'], ['Straße', 'STRASSE'], ['İrem', 'Irem'],
  ];
  for (const [a, b] of collide) assert.ok(same(a, b), `${JSON.stringify(a)} ~ ${JSON.stringify(b)}`);
  const distinct: [string, string][] = [
    ['Андрей', 'Андреи'], // Андрей / Андреи
    ['й', 'и'], ['Сергей', 'Сергеи'], ['у', 'ў'], ['і', 'ї'],
    ['محمد', 'أحمد'], ['דוד', 'דור'],
    ['कि', 'क'], ['กิ', 'ก'],
    ['Оксана Петренко', 'Олександр Петренко'],
    ['Αλέξανδρος', 'Αθανάσιος'], ['李明', '王明'],
    ['Li', 'Lu'], ['Jo', 'Joe'], ['Marie', 'Maria'], ['Kate', 'Kati'], ["O'Brien", "O'Brian"], ['Jean-Luc', 'Jean-Paul'], ['Nina', 'Nino'], ['Prof Alpha', 'Prof Alphonse'],
    ['Мария', 'Марина'], ['Ιωάννης', 'Ιωήλ'], ['สมชาย', 'สมศรี'],
  ];
  for (const [a, b] of distinct) assert.ok(!same(a, b), `${JSON.stringify(a)} !~ ${JSON.stringify(b)}`);
});

test('R11-A-07: two real, different names are both accepted for teachers (hyphen, apostrophe, non-Latin, short)', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    let n = 0;
    for (const name of ['Андрей', 'Андреи', 'محمد', 'أحمد', "O'Brien", 'Jean-Luc', 'Jean-Paul', 'Li', 'Lu', '李明', '王明']) {
      assert.equal((await register(h, name, `t${++n}@uni.edu`, { teacherInviteCode: INVITE })).status, 201, name);
    }
    // ... while the harakat spelling of an existing Arabic name is the same name.
    const r = await register(h, 'مُحَمَّد', 'dup@uni.edu', { teacherInviteCode: INVITE });
    assert.equal(r.status, 409);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R11-A-04
test('R11-A-04: an all-numeric dotted HOST that is not an IPv4 address gets the clear "not a valid IP address or host name" error', () => {
  for (const host of ['999.1.1.1', '10.0.0.1.5', '256.256.256.256', '1.2.3', '1.2.3.4.5.6', '300.1.1.1', '01.2.3.456', '1..2']) {
    assert.throws(() => listenHost({}, { HOST: host }), /not a valid IP address or host name/, host);
  }
  for (const host of ['127.0.0.1', '0.0.0.0', '10.0.0.1', 'localhost', 'example.org', 'my-host.local', '2001:db8::1', 'a1.b2.c3', '1host', '1.2.3.x']) {
    assert.doesNotThrow(() => listenHost({}, { HOST: host }), host);
  }
});

// ------------------------------------------------------------------ R11-A-05
test('R11-A-05: a demo reset restores the demo teacher name even when a legacy twin already holds that key (documented limitation, not a duplicate guard)', async () => {
  const h = await harness({ demo: true, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    // A database written before round 10 can contain a real teacher whose name reads the same as the demo teacher's.
    h.app.db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES ('twin@uni.edu', 'DR CLAIRE MOREAU', 'x', 'teacher', 1)").run();
    const guest = (await h.call('POST', '/api/auth/demo', { body: { role: 'teacher' } })).body.token;
    assert.equal((await rename(h, guest, 'Somebody Else')).status, 200);
    assert.equal((await rename(h, guest, DEMO_TEACHER_NAME)).status, 409, 'a normal rename back is refused while the twin exists');
    assert.equal((await h.call('POST', '/api/demo/reset', { token: guest })).status, 200);
    assert.equal((await h.call('GET', '/api/profile', { token: guest })).body.user.name, DEMO_TEACHER_NAME, 'the reset restores the seeded name regardless (see docs/KNOWN_LIMITATIONS.md)');
    assert.equal(h.app.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'teacher' AND name IN ('Dr. Claire Moreau', 'DR CLAIRE MOREAU')").get()!.n, 2);
    assert.equal(h.app.db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_TEACHER_EMAIL) !== undefined, true);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R11-A-06
function backup(dir: string, src: string, out: string) {
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/db-backup.ts', out], { cwd: BE, env: { ...process.env, DB_PATH: src }, encoding: 'utf8' });
}
const oneLineError = (r: ReturnType<typeof backup>, label: string) => {
  assert.equal(r.status, 1, `${label}: exit code (stderr: ${r.stderr})`);
  const lines = r.stderr.trim().split('\n');
  assert.equal(lines.length, 1, `${label}: one line, got: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /\n\s+at |node:internal|\.ts:\d+/, `${label}: no stack trace`);
  assert.match(lines[0]!, /^(Cannot back up|Backup failed)/, label);
};

test('R11-A-06: db:backup prints a one-line error and exits 1 when the output parent is a file, the path is a dangling symlink, or the directory is unwritable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-bk11-'));
  try {
    const src = join(dir, 'src.db');
    openDb(src).close();
    writeFileSync(join(dir, 'notdir'), 'x');
    oneLineError(backup(dir, src, join(dir, 'notdir', 'x.db')), 'parent is a file');
    symlinkSync('/nonexistent-el-dir/x.db', join(dir, 'dangling.db'));
    oneLineError(backup(dir, src, join(dir, 'dangling.db')), 'dangling symlink');
    if (process.getuid?.() !== 0) {
      mkdirSync(join(dir, 'ro'));
      chmodSync(join(dir, 'ro'), 0o500);
      oneLineError(backup(dir, src, join(dir, 'ro', 'x.db')), 'unwritable directory');
      oneLineError(backup(dir, src, join(dir, 'ro', 'sub', 'x.db')), 'unwritable parent of a new directory');
      chmodSync(join(dir, 'ro'), 0o700);
    }
    // Unchanged behaviour: a good path still works, an existing file is still refused with exit code 2.
    const good = backup(dir, src, join(dir, 'ok', 'b.db'));
    assert.equal(good.status, 0, good.stderr);
    assert.equal(backup(dir, src, join(dir, 'ok', 'b.db')).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R11-A-03
test('R11-A-03: a client that disconnects mid-body is not logged as an internal error and the server keeps serving', async () => {
  const h = await harness({ limits: OPEN });
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const port = (h.app.server.address() as AddressInfo).port;
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        const c = connect(port, '127.0.0.1', () => {
          c.write('POST /api/auth/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"email"');
          setTimeout(() => c.destroy(), 50);
        });
        c.on('error', () => {});
        c.on('close', () => resolve());
      });
    }
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(logged, [], 'no error logged for an aborted upload');
    assert.equal((await h.call('GET', '/api/openapi.json')).status, 200, 'still serving');
  } finally { console.error = original; await h.close(); }
});

// ------------------------------------------------------------------ R11-A-08
async function hintWith(assistant: HintProvider, missionId: string, stepIndex = 0) {
  const h = await harness({ assistant, limits: OPEN });
  try {
    const u = await h.signup('Hinter');
    const a = (await h.call('POST', `/api/missions/${missionId}/start`, { token: u.token })).body.attempt;
    const m = MISSIONS.find((x) => x.id === missionId)!;
    const step = m.steps[stepIndex]!;
    const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: step.id } });
    const view = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    const row = h.app.db.prepare('SELECT text, source FROM hint_log').get() as { text: string; source: string };
    return { r, view, row, step };
  } finally { await h.close(); }
}

test('R11-A-08: Game trims, caps (400 characters) and answer-guards the hint of ANY provider', async () => {
  // trimmed
  const t = await hintWith({ hint: async () => '  Smaller than neighbours.  ' }, 'hem-01', 0);
  assert.equal(t.r.status, 200);
  assert.equal(t.r.body.hint, 'Smaller than neighbours.');
  assert.equal(t.r.body.source, 'assistant');
  assert.equal(t.row.text, 'Smaller than neighbours.');
  assert.equal(t.view.step.hintsGiven[0].text, 'Smaller than neighbours.');
  // exactly 400 characters is allowed, 401 is not
  const ok = await hintWith({ hint: async () => 'a'.repeat(400) }, 'hem-01', 0);
  assert.equal(ok.r.body.source, 'assistant');
  assert.equal(ok.row.text.length, 400);
  for (const long of ['x'.repeat(5000), 'y'.repeat(401), ` ${'z'.repeat(401)} `]) {
    const big = await hintWith({ hint: async () => long }, 'hem-01', 0);
    assert.equal(big.r.status, 200);
    assert.equal(big.r.body.source, 'standard', `${long.length} chars`);
    assert.equal(big.r.body.hint, big.step.hints[0]);
    assert.equal(big.row.text, big.step.hints[0]);
    assert.equal(big.row.source, 'standard');
    assert.equal(big.view.step.hintsGiven[0].text, big.step.hints[0]);
    assert.equal(big.view.hintsUsed, 1);
    assert.equal(big.r.body.penaltyXp, -15);
  }
});

test('R11-A-08: a hint that contains the answer label is replaced by the faculty hint, whatever the provider', async () => {
  // First mission of the first lab whose opening step is a multiple-choice question.
  const m = MISSIONS.find((x) => x.id === 'mic-01')!;
  const s = m.steps[0]!;
  assert.equal(s.key.kind, 'choice');
  const label = s.data.options!.find((o) => o.id === (s.key as { answer: string }).answer)!.label;
  const leak = await hintWith({ hint: async () => `Think about ${label.toUpperCase()} first.` }, m.id, 0);
  assert.equal(leak.r.status, 200);
  assert.equal(leak.r.body.source, 'standard');
  assert.equal(leak.r.body.hint, s.hints[0]);
  assert.equal(leak.row.text, s.hints[0]);
  const said = await hintWith({ hint: async () => 'The correct answer is the second one.' }, m.id, 0);
  assert.equal(said.r.body.source, 'standard');
});

// ------------------------------------------------------------------ R11-A-09
test('R11-A-09: OpenAPI documents name_taken, the reserved "(teacher #n)" pattern and the empty-name rule on register and PUT /profile', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    for (const [path, method] of [['/api/auth/register', 'post'], ['/api/profile', 'put']] as const) {
      const op = spec.paths[path][method];
      assert.ok(op.responses['409'], `${method} ${path} lists 409`);
      const text = JSON.stringify([op.summary, op.description, op.requestBody.content['application/json'].schema.properties.name]);
      assert.match(text, /name_taken/, `${path}: name_taken`);
      assert.match(text, /\(teacher #/, `${path}: reserved pattern`);
      assert.match(text, /visible/, `${path}: empty-name rule`);
      assert.match(text, /validation_error/, `${path}: 400 code`);
    }
  } finally { await h.close(); }
});
