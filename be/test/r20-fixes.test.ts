// Round 20 backend fixes (R20-A-01, A-04, A-06, A-08). Written before the fixes: each test failed on the round-19 code.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_PASSWORD, DEMO_STUDENT_EMAIL, DEMO_TEACHER_EMAIL, seedDemo } from '../src/demo.ts';
import { harness } from './helpers.ts';

const PASSWORD = 'correct horse battery';
const NFC = 'café-r20@uni.edu';
const NFD = 'café-r20@uni.edu';

// ------------------------------------------------------------------ R20-A-01
test('R20-A-01: the NFC and NFD spellings of an e-mail are one account', async () => {
  const h = await harness();
  try {
    assert.notEqual(NFC, NFD);
    const first = await h.call('POST', '/api/auth/register', { body: { name: 'Ana', email: NFC, password: PASSWORD } });
    assert.equal(first.status, 201);
    const second = await h.call('POST', '/api/auth/register', { body: { name: 'Ana bis', email: NFD, password: PASSWORD } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'email_taken');
    // Case is still folded, on top of the normalisation.
    const third = await h.call('POST', '/api/auth/register', { body: { name: 'Ana ter', email: NFD.toUpperCase(), password: PASSWORD } });
    assert.equal(third.status, 409);
    for (const email of [NFC, NFD]) {
      const r = await h.call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
      assert.equal(r.status, 200, email);
      assert.equal(r.body.user.id, first.body.user.id);
    }
    assert.equal((h.app.db.prepare('SELECT COUNT(*) n FROM users WHERE email LIKE ?').get('%r20@uni.edu') as { n: number }).n, 1);
    // The account key stored for a new account is the NFC form.
    assert.equal((h.app.db.prepare('SELECT email FROM users WHERE id = ?').get(first.body.user.id) as { email: string }).email, NFC);
  } finally { await h.close(); }
});

test('R20-A-01: an account stored before the fix (NFD, or any raw spelling) can still sign in with either form, and cannot be duplicated', async () => {
  const h = await harness();
  try {
    const legacy = await h.signup('Legacy', 'legacy-r20@uni.edu');
    h.app.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(NFD, legacy.id);
    for (const email of [NFC, NFD]) {
      const r = await h.call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
      assert.equal(r.status, 200, email);
      assert.equal(r.body.user.id, legacy.id);
    }
    const dup = await h.call('POST', '/api/auth/register', { body: { name: 'Dup', email: NFC, password: PASSWORD } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'email_taken');
    // A wrong password is still the same 401.
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: NFC, password: 'wrong wrong wrong' } })).status, 401);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R20-A-06
test('R20-A-06: routes without a body schema refuse any body that is not an empty object', async () => {
  const h = await harness({ demo: true });
  try {
    await seedDemo(h.app.db, h.clock.t);
    const alex = (await h.call('POST', '/api/auth/demo', { body: { role: 'student' } })).body.token as string;
    for (const [path, token] of [['/api/missions/hem-01/start', alex], ['/api/demo/reset', alex]] as const) {
      for (const body of [[1, 2, 3], { startedAt: 1, elapsedSec: 0 }, { xp: 99999 }, null, 'x', 5]) {
        const r = await h.call('POST', path, { token, body });
        assert.equal(r.status, 400, `${path} ${JSON.stringify(body)}`);
        assert.equal(r.body.error.code, 'validation_error');
        assert.ok(Array.isArray(r.body.error.details));
      }
    }
    // The state did not change: still no attempt, and the same calls without a body or with {} work.
    assert.equal((h.app.db.prepare('SELECT COUNT(*) n FROM attempts WHERE status = ?').get('in_progress') as { n: number }).n, 0);
    assert.equal((await h.call('POST', '/api/missions/hem-01/start', { token: alex })).status, 201);
    assert.equal((await h.call('POST', '/api/missions/hem-01/start', { token: alex, body: {} })).status, 201);
    assert.equal((await h.call('POST', '/api/demo/reset', { token: alex })).status, 200);
    assert.equal((await h.call('POST', '/api/demo/reset', { token: alex, body: {} })).status, 200);
  } finally { await h.close(); }
});

test('R20-A-06: OpenAPI declares the empty-object body on both routes', async () => {
  const h = await harness({ demo: true });
  try {
    const spec = (await h.call('GET', '/api/openapi.json')).body;
    for (const [p, m] of [['/api/missions/{id}/start', 'post'], ['/api/demo/reset', 'post']] as const) {
      const rb = spec.paths[p][m].requestBody;
      assert.equal(rb.required, false);
      assert.equal(rb.content['application/json'].schema.additionalProperties, false);
    }
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R20-A-08
test('R20-A-08: profile.user.demo is true for both demo accounts and false for real ones', async () => {
  const h = await harness({ demo: true, teacherInviteCode: 'FACULTY-INVITE' });
  try {
    await seedDemo(h.app.db, h.clock.t);
    for (const role of ['student', 'teacher'] as const) {
      const login = await h.call('POST', '/api/auth/demo', { body: { role } });
      const p = await h.call('GET', '/api/profile', { token: login.body.token });
      assert.equal(p.body.user.demo, true, role);
      assert.equal(p.body.user.role, role);
    }
    for (const [name, extra] of [['Real student', {}], ['Real Teacher', { teacherInviteCode: 'FACULTY-INVITE' }]] as const) {
      const u = await h.signup(name, undefined, extra);
      assert.equal((await h.call('GET', '/api/profile', { token: u.token })).body.user.demo, false, name);
    }
    assert.equal(DEMO_STUDENT_EMAIL.length > 0 && DEMO_TEACHER_EMAIL.length > 0 && DEMO_PASSWORD.length > 0, true);
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R20-A-04
test('R20-A-04: OPTIONS is 404 on an unknown path and carries Allow on a known one', async () => {
  const h = await harness({ corsOrigin: 'https://app.example' });
  try {
    const origin = { origin: 'https://app.example' };
    const unknown = await fetch(`${h.base}/api/nope`, { method: 'OPTIONS', headers: origin });
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json() as { error: { code: string } }).error.code, 'not_found');
    const root = await fetch(`${h.base}/`, { method: 'OPTIONS', headers: origin });
    assert.equal(root.status, 404);

    const login = await fetch(`${h.base}/api/auth/login`, { method: 'OPTIONS', headers: { ...origin, 'access-control-request-method': 'POST' } });
    assert.equal(login.status, 204);
    assert.equal(login.headers.get('allow'), 'POST, OPTIONS');
    assert.equal(login.headers.get('access-control-allow-origin'), 'https://app.example');
    const dash = await fetch(`${h.base}/api/dashboard`, { method: 'OPTIONS', headers: origin });
    assert.equal(dash.status, 204);
    assert.equal(dash.headers.get('allow'), 'GET, HEAD, OPTIONS');
    const spec = await fetch(`${h.base}/api/openapi.json`, { method: 'OPTIONS', headers: origin });
    assert.equal(spec.status, 204);
    assert.equal(spec.headers.get('allow'), 'GET, HEAD, OPTIONS');
    // The spec route now answers a wrong method like every other GET-only path.
    const post = await fetch(`${h.base}/api/openapi.json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD, OPTIONS');
  } finally { await h.close(); }
});

// ------------------------------------------------------------------ R21-A-01
test('R21-A-01: two legacy rows that share one normalised e-mail can each still sign in with their own password', async () => {
  const h = await harness();
  try {
    const other = 'another password 2';
    const a = await h.call('POST', '/api/auth/register', { body: { name: 'Legacy A', email: 'a-r21@uni.edu', password: PASSWORD } });
    const b = await h.call('POST', '/api/auth/register', { body: { name: 'Legacy B', email: 'b-r21@uni.edu', password: other } });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    // Stored before the rule: the same address under two Unicode spellings (no unique constraint is violated).
    h.app.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(NFC, a.body.user.id);
    h.app.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(NFD, b.body.user.id);
    const asA = await h.call('POST', '/api/auth/login', { body: { email: NFC, password: PASSWORD } });
    assert.equal(asA.status, 200);
    assert.equal(asA.body.user.id, a.body.user.id);
    for (const email of [NFC, NFD]) {
      const asB = await h.call('POST', '/api/auth/login', { body: { email, password: other } });
      assert.equal(asB.status, 200, email);
      assert.equal(asB.body.user.id, b.body.user.id, email);
    }
    assert.equal((await h.call('POST', '/api/auth/login', { body: { email: NFD, password: 'wrong wrong wrong' } })).status, 401);
    // Still no new duplicate.
    assert.equal((await h.call('POST', '/api/auth/register', { body: { name: 'Dup', email: NFD, password: PASSWORD } })).status, 409);
  } finally { await h.close(); }
});
