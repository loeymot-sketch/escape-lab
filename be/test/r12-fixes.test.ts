import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { MISSION_BY_ID } from '../src/content.ts';
import { openDb } from '../src/db.ts';
import { seedDemo } from '../src/demo.ts';
import { DEMO_TEACHER_NAME, Game } from '../src/game.ts';
import { nameKey, sameName } from '../src/names.ts';
import { openApi } from '../src/openapi.ts';
import { buildRoutes } from '../src/routes.ts';
import { harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

// Round 12 backend fixes (R12-A-01 .. R12-A-09, R12-C-08, R12-C-10).
const BE = fileURLToPath(new URL('..', import.meta.url));
const OPEN = { registerPerHour: 10_000, loginFailuresPerIp: 10_000, answerPerMinute: 100_000, hintPerMinute: 100_000, startPerMinute: 100_000, writePerMinute: 100_000 };
const INVITE = 'T-INVITE';
const register = (h: Harness, name: string, email: string, extra: Record<string, unknown> = {}) =>
  h.call('POST', '/api/auth/register', { body: { name, email, password: 'correct horse battery', ...extra } });
const rename = (h: Harness, token: string, name: string) => h.call('PUT', '/api/profile', { token, body: { name } });
const teacher = (h: Harness, name: string, email: string) => h.signup(name, email, { teacherInviteCode: INVITE });

// ------------------------------------------------------------------ R12-A-01
// Spellings of a name, each generated from a letter-by-letter table that is INDEPENDENT of src/names.ts: every variant is meant to read as
// the base name to a person. The oracle is "which base did this variant come from".
const LOOK: Record<string, string[]> = {
  a: ['a', 'A', 'á', 'Å', 'а', 'А', 'α', 'Α'], e: ['e', 'E', 'é', 'ë', 'е', 'Е', 'Ε'],
  o: ['o', 'O', 'ö', 'о', 'О', 'ο', 'Ο', '0'], p: ['p', 'P', 'р', 'Р', 'ρ', 'Ρ'],
  c: ['c', 'C', 'ç', 'с', 'С'], x: ['x', 'X', 'х', 'Х'], y: ['y', 'Y', 'у', 'У', 'Υ', 'υ'],
  m: ['m', 'M', 'м', 'М', 'Μ'], k: ['k', 'K', 'к', 'К', 'Κ'], h: ['h', 'H', 'н', 'Н', 'Η'],
  t: ['t', 'T', 'т', 'Т', 'Τ'], b: ['b', 'B', 'в', 'В', 'Β'], n: ['n', 'N', 'ñ', 'Ν', 'ν'],
  i: ['i', 'I', 'í', 'і', 'І', 'ι', 'Ι'], l: ['l', 'L', 'I', '1', 'ӏ', 'Ӏ'], s: ['s', 'S', 'ѕ', 'Ѕ'],
  u: ['u', 'U', 'ü'], r: ['r', 'R'], d: ['d', 'D', 'ԁ'], v: ['v', 'V'], g: ['g', 'G'], z: ['z', 'Z', 'Ζ'],
  ' ': [' ', '  ', ' ', '　', ' ​'], '.': ['.', '', ' ', '‌.'],
};
const BASES = ['Marie Dubois', 'Dr. Claire Moreau', 'Nikolai Petrov', 'Anna Lopez', 'Hana Yu'];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const variantOf = (base: string, rnd: () => number) =>
  [...base].map((ch) => { const opts = LOOK[ch.toLowerCase()]; return opts ? opts[Math.floor(rnd() * opts.length)]! : ch; }).join('');

test('R12-A-01: sameName is an equivalence relation over a corpus of homoglyph, case, accent and spacing variants', () => {
  const rnd = mulberry32(12);
  const corpus: string[] = [];
  for (const b of BASES) for (let i = 0; i < 14; i++) corpus.push(variantOf(b, rnd));
  corpus.push(...BASES, 'Maria Dubois', 'Marie Dubos', 'Marié Dubois', 'мarie Dubois', 'Мarie Dubois', 'marie dubois', 'Marie Duboi', 'Dr. Claire Moreno', 'Hana Yuu');
  for (const a of corpus) assert.ok(sameName(a, a), `reflexive ${JSON.stringify(a)}`);
  for (const a of corpus) for (const b of corpus) assert.equal(sameName(a, b), sameName(b, a), `symmetric ${JSON.stringify([a, b])}`);
  for (const a of corpus) for (const b of corpus) {
    if (!sameName(a, b)) continue;
    for (const c of corpus) if (sameName(b, c)) assert.ok(sameName(a, c), `transitive ${JSON.stringify([a, b, c])}`);
  }
  // sameName is key equality: one key per name.
  for (const a of corpus) for (const b of corpus) assert.equal(sameName(a, b), nameKey(a) === nameKey(b));
  // Every variant reads as its base: same base <=> same name (bases here differ in more than look-alike letters).
  const baseOf = corpus.map((v) => BASES.find((b) => sameName(b, v)));
  for (let i = 0; i < BASES.length * 14; i++) assert.equal(baseOf[i], BASES[Math.floor(i / 14)], JSON.stringify(corpus[i]));
});

test('R12-A-01: the reported chain m / M / m is one name (lower-case and capital Cyrillic em both fold to Latin m)', () => {
  assert.ok(sameName('мarie Dubois', 'Мarie Dubois'));
  assert.ok(sameName('marie Dubois', 'мarie Dubois'));
  assert.ok(sameName('Marie Dubois', 'Мarie Dubois'));
  // Greek: capital N is drawn like Latin N, lower-case nu like v. Round 13 (R13-A-01): case is folded first and the one table maps nu to n (as N), so
  // capital and lower-case agree; the old nu ~ v lookalike is gone (documented residual in names.ts).
  assert.ok(sameName('Nina', 'Νina'));
  assert.ok(sameName('Nina', 'νina'), 'R13: lower-case nu folds like its capital');
  assert.ok(!sameName('νina', 'vina'), 'R13: nu no longer reads as v');
});

test('R12-A-01: names that are really different stay distinct (round 11 table) and the reserved name folds in every spelling', () => {
  const distinct: [string, string][] = [
    ['Андрей', 'Андреи'], ['محمد', 'أحمد'], ['דוד', 'דור'], ['Li', 'Lu'], ['Jo', 'Joe'], ["O'Brien", "O'Brian"], ['Jean-Luc', 'Jean-Paul'],
    ['Марина', 'Мария'], ['Marie', 'Maria'], ['Kate', 'Kati'], ['Nina', 'Nino'], ['Оксана Петренко', 'Олександр Петренко'], ['李明', '王明'],
    ['Sergei', 'Sergey'], ['Dr. Claire Moreau', 'Dr. Claire Morel'],
  ];
  for (const [a, b] of distinct) assert.ok(!sameName(a, b), `${a} !~ ${b}`);
  for (const v of ['DR CLAIRE MOREAU', 'dr.claire moreau', 'Dr. Claire Мoreau', 'Dr. Claire мoreau', 'Dr. Сlaire Μoreau', 'Dr. Clаire Morеau', 'Dr. Claire Móreau', 'Dr. Claire​ Moreau', 'Dг. Claire Moreau'.replace('г', 'r')]) {
    assert.ok(sameName(v, DEMO_TEACHER_NAME), JSON.stringify(v));
  }
});

test('R12-A-01: register m, rename to M: the second teacher cannot take a name that reads like the first (409 name_taken), and the same for the reserved demo name', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    await teacher(h, 'Marie Dubois', 'a@uni.edu');
    const b = await teacher(h, 'мarie Dubois', 'b@uni.edu').catch((e) => e);
    // With one canonical key the registration itself is already refused.
    assert.ok(b instanceof Error && /name_taken/.test(b.message), 'the lower-case Cyrillic spelling is a twin of Marie Dubois at registration');
    const c = await teacher(h, 'Teacher C', 'c@uni.edu');
    for (const name of ['мarie Dubois', 'Мarie Dubois', 'Dr. Claire мoreau', 'Dr. Claire Мoreau']) {
      const r = await rename(h, c.token, name);
      assert.equal(r.status, 409, `rename to ${JSON.stringify(name)}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.error.code, 'name_taken');
      const reg = await register(h, name, `r${Math.random()}@uni.edu`, { teacherInviteCode: INVITE });
      assert.equal(reg.status, 409, name);
    }
    assert.match((await rename(h, c.token, 'мarie Dubois')).body.error.message, /choose another name/i, 'the 409 tells the teacher what to do');
    assert.equal((await h.call('GET', '/api/profile', { token: c.token })).body.user.name, 'Teacher C');
  } finally { await h.close(); }
});

test('R12-A-01 (property): random chains of registrations and renames never leave two teachers (or a teacher and the demo teacher) with the same name', async () => {
  for (const seed of [1, 2, 3]) {
    const rnd = mulberry32(seed);
    const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
    try {
      await seedDemo(h.app.db, h.clock.t);
      // holders[i] = { token, base } for every teacher we created; the demo teacher holds BASES[1] ('Dr. Claire Moreau').
      const holders: Array<{ token: string; base: string | null }> = [];
      const baseHeldByOthers = (self: number, base: string) => base === BASES[1] || holders.some((t, i) => i !== self && t.base === base);
      let n = 0;
      for (let step = 0; step < 90; step++) {
        const base = BASES[Math.floor(rnd() * BASES.length)]!;
        const name = variantOf(base, rnd);
        if (holders.length < 6 && rnd() < 0.35) {
          const r = await register(h, name, `p${seed}-${++n}@uni.edu`, { teacherInviteCode: INVITE });
          const taken = baseHeldByOthers(-1, base);
          assert.equal(r.status, taken ? 409 : 201, `seed ${seed} step ${step} register ${JSON.stringify(name)}`);
          if (r.status === 201) holders.push({ token: r.body.token, base });
        } else if (holders.length) {
          const i = Math.floor(rnd() * holders.length);
          const r = await rename(h, holders[i]!.token, name);
          const taken = baseHeldByOthers(i, base);
          assert.equal(r.status, taken ? 409 : 200, `seed ${seed} step ${step} rename #${i} ${JSON.stringify(name)}`);
          if (r.status === 200) holders[i]!.base = base;
        }
        const names = (h.app.db.prepare("SELECT name FROM users WHERE role = 'teacher'").all() as Array<{ name: string }>).map((x) => nameKey(x.name));
        assert.equal(new Set(names).size, names.length, `seed ${seed} step ${step}: two teachers share a key`);
      }
    } finally { await h.close(); }
  }
});

test('R12-A-01: databases that already contain twins keep working: renaming among your own spellings and moving away both succeed, rewriting nothing', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const ins = h.app.db.prepare("INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?,?,?,'teacher',1)");
    ins.run('tw-a@uni.edu', 'Marie Dubois', 'x');
    const b = await teacher(h, 'Teacher B', 'tw-b@uni.edu');
    h.app.db.prepare("UPDATE users SET name = ? WHERE id = ?").run('мarie Dubois', b.id);
    // Legacy twin B: staying in its own name class is always allowed (whatever the spelling) ...
    assert.equal((await rename(h, b.token, 'Мarie Dubois')).status, 200);
    assert.equal((await rename(h, b.token, 'MARIE DUBOIS')).status, 200);
    // ... and so is moving to a free name; coming back then is the twin rule.
    assert.equal((await rename(h, b.token, 'Marie Dupont')).status, 200);
    assert.equal((await rename(h, b.token, 'мarie Dubois')).status, 409);
    // Login still works, the stored name of the untouched twin is unchanged.
    const login = await h.call('POST', '/api/auth/login', { body: { email: 'tw-b@uni.edu', password: 'correct horse battery' } });
    assert.equal(login.status, 200);
    assert.equal((h.app.db.prepare("SELECT name FROM users WHERE email = 'tw-a@uni.edu'").get() as { name: string }).name, 'Marie Dubois');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-A-02
const BIDI = ['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩'];

test('R12-A-02: bidi override, embedding and isolate controls are a 400 in every display name (register for both roles, rename, class names), RTL names still pass', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Teacher Real', 'real-t@uni.edu');
    const s = await h.signup('Student Real', 'real-s@uni.edu');
    const reversed = [...'Dr. Claire Moreau'].reverse().join('');
    let n = 0;
    for (const c of BIDI) {
      for (const name of [`${c}${reversed}‬`, `Bob${c}`, `${c}Bob`, `Bo${c}b`]) {
        for (const extra of [{}, { teacherInviteCode: INVITE }]) {
          const r = await register(h, name, `bidi${++n}@uni.edu`, extra);
          assert.equal(r.status, 400, `register ${JSON.stringify(name)}`);
          assert.equal(r.body.error.code, 'validation_error');
          assert.ok(Array.isArray(r.body.error.details) && r.body.error.details.length > 0);
        }
        for (const tok of [t.token, s.token]) assert.equal((await rename(h, tok, name)).status, 400, `rename ${JSON.stringify(name)}`);
      }
      assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: `Class${c}` } })).status, 400, 'class names too');
    }
    assert.throws(() => Game.checkDisplayName('Bo‮b'), (e: any) => e.status === 400);
    // Legitimate right-to-left names, with the invisible marks that belong in them, are fine.
    for (const [i, name] of ['محمد علي', 'דוד כהן', 'דוד‏ כהן', 'Ali‎ Reza', 'محمد‏', 'ÉLISE ‏עברית'].entries()) {
      assert.equal((await register(h, name, `rtl${i}@uni.edu`)).status, 201, name);
    }
    // A name that is only direction marks / joiners has nothing visible.
    for (const name of ['‎', '‏‎', '‍', '‍‏']) assert.equal((await register(h, name, `m${++n}@uni.edu`)).status, 400, JSON.stringify(name));
    assert.equal((await h.call('GET', '/api/profile', { token: t.token })).body.user.name, 'Teacher Real');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-A-03
test('R12-A-03: Latin look-alikes of the reserved name fold in the key (capital I / digit 1 for l, digit 0 for o); other names are unaffected', () => {
  for (const v of ['Dr. CIaire Moreau', 'Dr. C1aire Moreau', 'Dr. Claire M0reau', 'Dr. CIaire M0reau', 'Dr. Cla1re Moreau', 'DR. C|AIRE MOREAU', 'Dr. Claire Morеau']) {
    assert.ok(sameName(v, DEMO_TEACHER_NAME), JSON.stringify(v));
  }
  // Only the look-alike substitutions collide.
  const distinct: [string, string][] = [
    ['Olga', 'Olya'], ['Olga', 'Elga'], ['Ilya', 'Ilia'], ['Ilya', 'Ivan'], ['Lilia', 'Lidia'], ['Li', 'Lu'], ['Ali', 'Alo'], ['Lola', 'Lula'], ['Elena', 'Eleni'], ['Rob', 'Roy'],
    ['Dr. Claire Moreau', 'Dr. Claire Morel'], ['Dr. Claire Moreau', 'Dr. Clara Moreau'], ['Bob', 'Boy'], ['Room 10', 'Room 20'],
  ];
  for (const [a, b] of distinct) assert.ok(!sameName(a, b), `${a} !~ ${b}`);
  // The look-alike pairs themselves.
  for (const [a, b] of [['Olga', '0lga'], ['Lilia', 'Iilia'], ['Ilya', 'Llya'], ['Bob', 'B0b']] as [string, string][]) assert.ok(sameName(a, b), `${a} ~ ${b}`);
});

test('R12-A-03: the reserved teacher name cannot be taken with capital-I / zero look-alikes', async () => {
  const h = await harness({ demo: true, teacherInviteCode: INVITE, limits: OPEN });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const t = await teacher(h, 'Teacher X', 'x@uni.edu');
    let n = 0;
    for (const name of ['Dr. CIaire Moreau', 'Dr. Claire M0reau', 'Dr. C1aire Moreau']) {
      assert.equal((await register(h, name, `l${++n}@uni.edu`, { teacherInviteCode: INVITE })).status, 409, name);
      assert.equal((await rename(h, t.token, name)).status, 409, name);
      assert.equal((await register(h, name, `s${++n}@uni.edu`)).status, 201, 'students are not subject to the teacher rule');
    }
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-A-04
test('R12-A-04: tone-mark, emoji and space differences do not make a teacher name different (by design); the 409 says what to do', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    await teacher(h, 'Lê Thị Hà', 'vn@uni.edu');
    const r = await register(h, 'Lê Thị Hạ', 'vn2@uni.edu', { teacherInviteCode: INVITE });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'name_taken');
    assert.match(r.body.error.message, /choose another name/i);
    assert.match(r.body.error.message, /case|accents|spaces/i, 'the message names what is ignored');
    for (const [a, b] of [['Dr. 🧬', 'Dr. 🧪'], ['Li Wei', 'Liwei']]) assert.ok(sameName(a!, b!), `${a} ~ ${b}`);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-A-05
const hem = MISSION_BY_ID.get('hem-01')!;

test('R12-A-05: cleanAssistantHint strips NUL, other control characters and lone surrogates, and counts characters (not UTF-16 units)', () => {
  const step = hem.steps[0]!;
  assert.equal(Game.cleanAssistantHint('\u0000Compare the MCV with the range.', step), 'Compare the MCV with the range.');
  assert.equal(Game.cleanAssistantHint('ab\u0000cd', step), 'abcd');
  assert.equal(Game.cleanAssistantHint('ab\ud800cd', step), 'abcd');
  assert.equal(Game.cleanAssistantHint('ab\udc00cd', step), 'abcd');
  assert.equal(Game.cleanAssistantHint('a\u0001b\u007fc\u001fd', step), 'abcd');
  assert.equal(Game.cleanAssistantHint('line one\nline\ttwo', step), 'line one\nline\ttwo', 'newline and tab stay');
  assert.equal(Game.cleanAssistantHint('\u0000\u0001\ud800', step), null, 'nothing left is no hint');
  assert.equal(Game.cleanAssistantHint('\u{1F9EC}'.repeat(200), step)!.length, 400, '200 emoji are 200 characters, within the 400 limit');
  assert.equal(Game.cleanAssistantHint('\u{1F9EC}'.repeat(400), step)!.length, 800);
  assert.equal(Game.cleanAssistantHint('\u{1F9EC}'.repeat(401), step), null);
  assert.equal(Game.cleanAssistantHint('x'.repeat(400), step)!.length, 400);
  assert.equal(Game.cleanAssistantHint('x'.repeat(401), step), null);
  assert.ok(Game.cleanAssistantHint('ab🧬cd', step)!.includes('\u{1F9EC}'), 'a well-formed pair survives');
});

test('R12-A-05: a provider hint that starts with NUL is delivered clean, stored identically, and still shown after a reload', async () => {
  const h = await harness({ limits: OPEN, assistant: { hint: async () => '\u0000Compare the cell size with the reference range.' } });
  try {
    const u = await h.signup('NUL Reader');
    const a = (await h.call('POST', `/api/missions/${hem.id}/start`, { token: u.token })).body.attempt;
    const r = await h.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: hem.steps[0]!.id } });
    assert.equal(r.status, 200);
    assert.equal(r.body.hint, 'Compare the cell size with the reference range.');
    const again = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    assert.deepEqual(again.step.hintsGiven, [{ level: 1, text: r.body.hint, source: 'assistant' }], 'the paid hint is still there after a reload');
    assert.equal(again.hintsUsed, 1);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-A-06
test('R12-A-06: OpenAPI: PUT /api/profile body is optional; POST /api/missions/{id}/start does not advertise a 409 it never returns', async () => {
  const h = await harness({ limits: OPEN });
  try {
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    assert.notEqual(spec.paths['/api/profile'].put.requestBody.required, true);
    assert.equal(spec.paths['/api/auth/register'].post.requestBody.required, true, 'bodies with required fields stay required');
    assert.equal(spec.paths['/api/missions/{id}/start'].post.responses['409'], undefined);
    assert.ok(spec.paths['/api/missions/{id}/start'].post.responses['429']);
    // The documentation is true: an empty body is accepted, and a student can start the first mission over and over.
    const u = await h.signup('Oas Reader');
    assert.equal((await h.call('PUT', '/api/profile', { token: u.token })).status, 200);
    assert.equal((await h.call('POST', `/api/missions/${hem.id}/start`, { token: u.token })).status, 201);
    assert.equal((await h.call('POST', `/api/missions/${hem.id}/start`, { token: u.token })).status, 201);
  } finally { await h.close(); }
  assert.equal(typeof openApi, 'function');
  assert.equal(typeof buildRoutes, 'function');
});

// ------------------------------------------------------------------ R12-A-07
const runServer = (env: Record<string, string>) => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], {
    cwd: BE, env: { PATH: process.env.PATH ?? '', PORT: '0', HOST: '127.0.0.1', ...env }, encoding: 'utf8', timeout: 15_000,
  });
  return r;
};

test('R12-A-07: a bad DB_PATH ends with one clean fatal line and exit code 1 (directory, garbage file, parent that is a file, newer schema)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-dbpath-'));
  try {
    mkdirSync(join(dir, 'adir'));
    writeFileSync(join(dir, 'garbage.db'), 'this is not a sqlite database, just text '.repeat(40));
    writeFileSync(join(dir, 'notdir'), 'x');
    const future = join(dir, 'future.db');
    openDb(future).close();
    const f = new DatabaseSync(future);
    f.exec('PRAGMA user_version = 99');
    f.close();
    const cases: Record<string, string> = {
      directory: join(dir, 'adir'), garbage: join(dir, 'garbage.db'), 'parent is a file': join(dir, 'notdir', 'x.db'), 'newer schema': future,
    };
    for (const [label, path] of Object.entries(cases)) {
      const r = runServer({ DB_PATH: path });
      assert.equal(r.status, 1, `${label}: exit code (stderr: ${r.stderr})`);
      const lines = r.stderr.trim().split('\n');
      assert.equal(lines.length, 1, `${label}: one line, got: ${r.stderr}`);
      assert.match(lines[0]!, /^Escape Lab API cannot start: /, label);
      assert.doesNotMatch(r.stderr, /\n\s+at |node:internal|\.ts:\d+/, `${label}: no stack trace`);
    }
    assert.match(runServer({ DB_PATH: future }).stderr, /newer than this build/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R12-A-08
const backupAsync = (src: string, out: string) => new Promise<{ code: number | null; err: string }>((res) => {
  const c = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/db-backup.ts', out], { cwd: BE, env: { ...process.env, DB_PATH: src }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  c.stderr.on('data', (d) => { err += d; });
  c.on('exit', (code) => res({ code, err }));
});

test('R12-A-08: parallel db:backup runs to one target: one winner, every loser is the exit-2 "Refusing to overwrite" refusal, never "database is locked"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-bk12-'));
  try {
    const src = join(dir, 'src.db');
    openDb(src).close();
    for (let round = 0; round < 4; round++) {
      const out = join(dir, `race${round}.db`);
      const results = await Promise.all(Array.from({ length: 6 }, () => backupAsync(src, out)));
      assert.equal(results.filter((r) => r.code === 0).length, 1, `round ${round}: exactly one winner ${JSON.stringify(results)}`);
      for (const r of results.filter((x) => x.code !== 0)) {
        assert.equal(r.code, 2, `round ${round}: ${r.err}`);
        assert.match(r.err, /^Refusing to overwrite /);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R12-A-08: db:backup with an empty path prints a clear usage line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-bk12e-'));
  try {
    const src = join(dir, 'src.db');
    openDb(src).close();
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/db-backup.ts', ''], { cwd: BE, env: { ...process.env, DB_PATH: src }, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
    assert.match(r.stderr, /^Usage: .*db:backup/);
    assert.doesNotMatch(r.stderr, /ENOENT|chmod/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ------------------------------------------------------------------ R12-A-09
test('R12-A-09: a class name needs 2 VISIBLE characters; every rejection carries `details`', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Prof Classes', 'cls@uni.edu');
    for (const name of ['A​', 'A　', 'A​​', '​A', 'Á', 'A‍', ' A ']) {
      const r = await h.call('POST', '/api/classes', { token: t.token, body: { name } });
      assert.equal(r.status, 400, JSON.stringify(name));
      assert.equal(r.body.error.code, 'validation_error');
      assert.ok(Array.isArray(r.body.error.details) && r.body.error.details.length > 0, `${JSON.stringify(name)}: details`);
    }
    for (const name of ['\u200b\u200bAB', 'L3', '李明', 'A\u200bC']) {
      assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name } })).status, 201, JSON.stringify(name));
    }
    assert.throws(() => h.app.game.createClass(t.id, 'A​'), (e: any) => e.status === 400 && Array.isArray(e.details) && e.details.length > 0);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-C-08
test('R12-C-08: the leaderboard "ranked" total is the same for every viewer, including a student with 0 XP', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Prof Board', 'board@uni.edu');
    const cls = (await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Board class' } })).body;
    const { solve } = await import('./helpers.ts');
    const players: Array<{ token: string; id: number }> = [];
    for (let i = 0; i < 3; i++) {
      const p = await h.signup(`Player ${i}`, `bp${i}@uni.edu`);
      assert.equal((await h.call('POST', '/api/classes/join', { token: p.token, body: { joinCode: cls.joinCode } })).status, 200);
      players.push(p);
    }
    await solve(h, players[0]!.token, 'hem-01');
    await solve(h, players[1]!.token, 'hem-01');
    const zero = await h.signup('Zed Zero', 'zero@uni.edu');
    const zero2 = await h.signup('Zed Zero Two', 'zero2@uni.edu');
    for (const z of [zero, zero2]) assert.equal((await h.call('POST', '/api/classes/join', { token: z.token, body: { joinCode: cls.joinCode } })).status, 200);
    for (const scope of ['all', 'week']) {
      for (const cohort of ['class', 'all']) {
        const totals = new Set<number>();
        for (const v of [...players, zero, zero2]) {
          const lb = (await h.call('GET', `/api/leaderboard?scope=${scope}&cohort=${cohort}`, { token: v.token })).body;
          totals.add(lb.total);
          assert.ok(lb.rows.every((r: { xp: number }) => r.xp > 0), `${scope}/${cohort}: only students with XP are ranked`);
          assert.equal(lb.me.you, true);
        }
        assert.deepEqual([...totals], [2], `${scope}/${cohort}: one denominator for every viewer`);
      }
    }
    const lb = (await h.call('GET', '/api/leaderboard?scope=all&cohort=class', { token: zero.token })).body;
    assert.equal(lb.me.xp, 0);
    assert.equal(lb.me.rank, 3, 'a 0-XP viewer sits below everybody ranked; their row is `me`, never counted in `total`');
    assert.equal(lb.rows.length, 2);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R12-C-10
test('R12-C-10: a teacher cannot create a second class with the same canonical name (409 class_name_taken); other teachers and other names are fine', async () => {
  const h = await harness({ teacherInviteCode: INVITE, limits: OPEN });
  try {
    const t = await teacher(h, 'Prof One', 'one@uni.edu');
    const other = await teacher(h, 'Prof Two', 'two@uni.edu');
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Group A' } })).status, 201);
    for (const name of ['Group A', 'group  a', 'GROUP A', ' Group A ', 'Group A', 'Group​ A', 'Ｇroup Ａ']) {
      const r = await h.call('POST', '/api/classes', { token: t.token, body: { name } });
      assert.equal(r.status, 409, JSON.stringify(name));
      assert.equal(r.body.error.code, 'class_name_taken');
      assert.match(r.body.error.message, /already have a class/i);
    }
    assert.equal((await h.call('POST', '/api/classes', { token: t.token, body: { name: 'Group B' } })).status, 201);
    assert.equal((await h.call('POST', '/api/classes', { token: other.token, body: { name: 'Group A' } })).status, 201, 'another teacher may reuse the name');
  } finally { await h.close(); }
});
