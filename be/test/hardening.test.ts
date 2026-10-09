import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { after, before, test } from 'node:test';
import { configFromEnv } from '../src/app.ts';
import { MISSION_BY_ID } from '../src/content.ts';
import { correct, harness } from './helpers.ts';
import type { Harness } from './helpers.ts';

let h: Harness;
before(async () => { h = await harness(); });
after(async () => { await h.close(); });

const mission = (id: string) => MISSION_BY_ID.get(id)!;

/** Raw HTTP so malformed request targets reach the server unchanged. */
function raw(target: string): Promise<number> {
  const port = Number(new URL(h.base).port);
  return new Promise((resolve, reject) => {
    const sock = createConnection(port, '127.0.0.1', () => sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    let buf = '';
    sock.on('data', (d) => { buf += d; });
    sock.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d+)/.exec(buf)?.[1])));
    sock.on('error', reject);
  });
}

test('an expired attempt is closed and the mission can be restarted with a fresh attempt', async () => {
  const u = await h.signup('Late Student');
  const m = mission('hem-01');
  const first = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  assert.equal(first.expired, false);
  assert.ok(first.remainingSec > 0 && first.remainingSec <= m.timeLimitSec);
  h.clock.t += (m.timeLimitSec + 5) * 1000;
  try {
    const stale = (await h.call('GET', `/api/attempts/${first.attemptId}`, { token: u.token })).body;
    assert.equal(stale.expired, true);
    assert.equal(stale.remainingSec, 0);

    const restart = await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
    assert.equal(restart.status, 201);
    assert.equal(restart.body.resumed, false);
    assert.notEqual(restart.body.attempt.attemptId, first.attemptId);
    assert.equal(restart.body.attempt.expired, false);

    const old = await h.call('POST', `/api/attempts/${first.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(old.status, 409);
    assert.equal(old.body.error.code, 'time_expired');
    const oldHint = await h.call('POST', `/api/attempts/${first.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } });
    assert.equal(oldHint.body.error.code, 'time_expired');

    const fresh = await h.call('POST', `/api/attempts/${restart.body.attempt.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(fresh.status, 200);
  } finally { h.clock.t -= (m.timeLimitSec + 5) * 1000; }
});

test('the dashboard no longer offers to resume an attempt that expired', async () => {
  const u = await h.signup('Idle Student');
  const m = mission('hem-01');
  await h.call('POST', '/api/missions/hem-01/start', { token: u.token });
  h.clock.t += (m.timeLimitSec + 5) * 1000;
  try {
    const dash = (await h.call('GET', '/api/dashboard', { token: u.token })).body;
    assert.equal(dash.continue.resume, false);
  } finally { h.clock.t -= (m.timeLimitSec + 5) * 1000; }
});

test('malformed percent-escapes and request targets are 400s, not 500s', async () => {
  assert.equal(await raw('/api/labs/%ZZ'), 400);
  assert.equal(await raw('/api/classes/%/students'), 400);
  assert.equal(await raw('//['), 400);
});

test('PUT /api/profile tolerates an empty body and rejects blank names', async () => {
  const u = await h.signup('Profile Person');
  const empty = await h.call('PUT', '/api/profile', { token: u.token });
  assert.equal(empty.status, 200);
  const res = await fetch(`${h.base}/api/profile`, { method: 'PUT', headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' }, body: 'null' });
  assert.equal(res.status, 200);
  const blank = await h.call('PUT', '/api/profile', { token: u.token, body: { name: '   ' } });
  assert.equal(blank.status, 400);
  const reg = await h.call('POST', '/api/auth/register', { body: { name: '    ', email: 'blank@uni.edu', password: 'correct horse battery' } });
  assert.equal(reg.status, 400);
});

test('concurrent registration with one email yields one account and 409s', async () => {
  const body = { name: 'Racer', email: 'race@uni.edu', password: 'correct horse battery' };
  const results = await Promise.all([1, 2, 3, 4].map(() => h.call('POST', '/api/auth/register', { body })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409]);
});

test('schema strictness covers names inherited from Object.prototype', async () => {
  for (const key of ['constructor', 'toString', '__proto__']) {
    const res = await fetch(`${h.base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"name":"P","email":"${key.replace(/_/g, '')}@uni.edu","password":"correct horse battery","${key}":1}` });
    assert.equal(res.status, 400, key);
  }
});

test('the Bearer scheme is case-insensitive', async () => {
  const u = await h.signup('Case Person');
  const res = await fetch(`${h.base}/api/me`, { headers: { authorization: `bearer ${u.token}` } });
  assert.equal(res.status, 200);
});

test('production refuses DEMO_MODE unless explicitly allowed', () => {
  const base = { NODE_ENV: 'production', AUTH_SECRET: 's'.repeat(32), CORS_ORIGIN: 'https://x.example' };
  assert.throws(() => configFromEnv({ ...base, DEMO_MODE: '1' }), /DEMO_MODE/);
  assert.equal(configFromEnv({ ...base, DEMO_MODE: '1', ALLOW_DEMO_IN_PRODUCTION: '1' }).demo, true);
  assert.equal(configFromEnv({ ...base }).demo, false);
});

test('leaderboard always returns the caller in `me`, whatever the scope or cohort', async () => {
  const u = await h.signup('Leaderboard Newcomer');
  for (const scope of ['all', 'week']) {
    for (const cohort of ['class', 'all']) {
      const lb = (await h.call('GET', `/api/leaderboard?scope=${scope}&cohort=${cohort}`, { token: u.token })).body;
      assert.ok(lb.me, `${scope}/${cohort}`);
      assert.equal(lb.me.you, true);
      assert.equal(lb.me.xp, 0);
      assert.ok(Number.isInteger(lb.me.rank) && lb.me.rank >= 1);
    }
  }
});

test('failed logins from a stranger cannot lock the account owner out', async () => {
  const p = await harness({ trustProxy: true });
  try {
  await p.signup('Locked Owner', 'owner@uni.edu');
  const strike = (ip: string) => fetch(`${p.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'owner@uni.edu', password: 'definitely wrong pw' }) });
  for (let i = 0; i < 8; i++) assert.equal((await strike('9.9.9.9')).status, 401);
  assert.equal((await strike('9.9.9.9')).status, 429, 'the same source is throttled');
  const owner = await fetch(`${p.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.7' }, body: JSON.stringify({ email: 'owner@uni.edu', password: 'correct horse battery' }) });
  assert.equal(owner.status, 200);
  } finally { await p.close(); }
});

test('without TRUST_PROXY the forwarded header is ignored', async () => {
  const strike = (ip: string) => fetch(`${h.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'nobody@uni.edu', password: 'definitely wrong pw' }) });
  for (let i = 0; i < 8; i++) await strike(`1.1.1.${i}`);
  assert.equal((await strike('2.2.2.2')).status, 429);
});

test('class join-code guessing is rate limited per student', async () => {
  const u = await h.signup('Code Guesser');
  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) statuses.push((await h.call('POST', '/api/classes/join', { token: u.token, body: { joinCode: 'ZZZZ' + String(i).padStart(2, '0') } })).status);
  assert.equal(statuses[0], 404);
  assert.equal(statuses.at(-1), 429);
});

test('oversized answer payloads are truncated in the answer log', async () => {
  const u = await h.signup('Verbose Student');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  const r = await h.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: { stepId: m.steps[0]!.id, response: { ...(correct(m.steps[0]!) as object), junk: 'x'.repeat(50_000) } } });
  assert.equal(r.status, 200);
  const row = h.app.db.prepare('SELECT LENGTH(response_json) AS n FROM answer_log WHERE attempt_id = ?').get(a.attemptId) as { n: number };
  assert.ok(row.n <= 2000);
});

// ------------------------------------------------------------- round 2

test('several processes opening one outdated database at the same instant all end on the current schema', async () => {
  const { spawn } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { migrate, SCHEMA_VERSION, integrityProblems, openDb } = await import('../src/db.ts');
  const dir = mkdtempSync(join(tmpdir(), 'escape-race-'));
  try {
    for (let trial = 0; trial < 3; trial++) {
      const path = join(dir, `race${trial}.db`);
      const seed = new DatabaseSync(path);
      seed.exec('PRAGMA journal_mode = WAL');
      migrate(seed, 2);
      seed.close();
      const dbUrl = new URL('../src/db.ts', import.meta.url).href;
      const codes = await Promise.all([1, 2, 3, 4].map(() => new Promise<number>((resolve) => {
        const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `const { openDb } = await import(${JSON.stringify(dbUrl)}); openDb(${JSON.stringify(path)}).close();`], { stdio: 'ignore' });
        p.on('exit', (c) => resolve(c ?? 1));
      })));
      assert.deepEqual(codes, [0, 0, 0, 0], `trial ${trial}`);
      const db = openDb(path);
      assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, SCHEMA_VERSION);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'attempts'").get() as { n: number }).n, 2);
      assert.deepEqual(integrityProblems(db), []);
      db.close();
    }
  } finally { (await import('node:fs')).rmSync(dir, { recursive: true, force: true }); }
});

test('production config: strong secret, explicit origin, no demo, case-insensitive NODE_ENV, proxy hops', () => {
  const ok = { NODE_ENV: 'production', AUTH_SECRET: 'k'.repeat(32), CORS_ORIGIN: 'https://app.example' };
  assert.doesNotThrow(() => configFromEnv(ok));
  assert.throws(() => configFromEnv({ ...ok, AUTH_SECRET: 'short' }), /AUTH_SECRET/);
  assert.throws(() => configFromEnv({ ...ok, CORS_ORIGIN: '*' }), /CORS_ORIGIN/);
  assert.throws(() => configFromEnv({ ...ok, NODE_ENV: 'Production', DEMO_MODE: '1' }), /DEMO_MODE/);
  assert.equal(configFromEnv({ ...ok, TRUST_PROXY: 'true' }).trustProxy, 1);
  assert.equal(configFromEnv({ ...ok, TRUST_PROXY: '2' }).trustProxy, 2);
  assert.equal(configFromEnv({ ...ok }).trustProxy, false);
  assert.equal(configFromEnv({ ...ok, RATE_ANSWER_PER_MINUTE: '5' }).limits?.answerPerMinute, 5);
});

test('proxy hops pick the right client address and ignore spoofed left-hand entries', async () => {
  const p = await harness({ trustProxy: 2, limits: { loginFailuresPerIp: 3, registerPerHour: 10_000 } });
  try {
    const fail = (xff: string) => fetch(`${p.base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: JSON.stringify({ email: `n${Math.random()}@uni.edu`, password: 'definitely wrong pw' }) });
    // two proxies: [spoofed..., client, proxy1]; the client is second from the right
    for (let i = 0; i < 3; i++) assert.equal((await fail(`spoof${i}, 7.7.7.7, 10.0.0.1`)).status, 401);
    assert.equal((await fail('another-spoof, 7.7.7.7, 10.0.0.1')).status, 429);
    assert.equal((await fail('x, 8.8.8.8, 10.0.0.1')).status, 401);
  } finally { await p.close(); }
});

test('successful sign-ins never consume the failure budget; failures do', async () => {
  const p = await harness({ limits: { loginFailuresPerIp: 4, registerPerHour: 10_000 } });
  try {
    await p.signup('Many Logins', 'many@uni.edu');
    for (let i = 0; i < 15; i++) assert.equal((await p.call('POST', '/api/auth/login', { body: { email: 'many@uni.edu', password: 'correct horse battery' } })).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await p.call('POST', '/api/auth/login', { body: { email: 'ghost@uni.edu', password: 'definitely wrong pw' } })).status, 401);
    assert.equal((await p.call('POST', '/api/auth/login', { body: { email: 'ghost@uni.edu', password: 'definitely wrong pw' } })).status, 429);
  } finally { await p.close(); }
});

test('answer, hint and start are rate limited per student with a retry hint', async () => {
  const p = await harness({ limits: { answerPerMinute: 3, hintPerMinute: 2, startPerMinute: 2, registerPerHour: 10_000 } });
  try {
    const u = await p.signup('Spammer');
    const m = mission('hem-01');
    const a = (await p.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    const wrongBody = { stepId: m.steps[0]!.id, response: { x: 1, y: 1 } };
    const st: number[] = [];
    for (let i = 0; i < 5; i++) st.push((await p.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: wrongBody })).status);
    assert.deepEqual(st, [200, 200, 200, 429, 429]);
    const limited = await p.call('POST', `/api/attempts/${a.attemptId}/answer`, { token: u.token, body: wrongBody });
    assert.ok(limited.body.error.details.retryAfterSeconds >= 1);
    assert.ok(limited.headers.get('retry-after'));
    assert.equal((await p.call('POST', '/api/missions/hem-01/start', { token: u.token })).status, 201);
    assert.equal((await p.call('POST', '/api/missions/hem-01/start', { token: u.token })).status, 429);
  } finally { await p.close(); }
});

test('timers never leak negative or oversized values, and results of expired attempts say why', async () => {
  const u = await h.signup('Clock Student');
  const m = mission('hem-01');
  const a = (await h.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
  h.clock.t -= 3_600_000;
  try {
    const back = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    assert.equal(back.elapsedSec, 0);
    assert.ok(back.remainingSec <= m.timeLimitSec && back.remainingSec >= 0);
  } finally { h.clock.t += 3_600_000; }
  h.clock.t += 3 * 86_400_000;
  try {
    const late = (await h.call('GET', `/api/attempts/${a.attemptId}`, { token: u.token })).body;
    assert.equal(late.status, 'expired', 'reading an attempt closes it');
    assert.equal(late.elapsedSec, m.timeLimitSec);
    assert.equal(late.remainingSec, 0);
    const res = await h.call('GET', `/api/attempts/${a.attemptId}/result`, { token: u.token });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'time_expired');
  } finally { h.clock.t -= 3 * 86_400_000; }
});

test('a hint that finishes after the attempt expired reports time_expired and refunds the penalty', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const p = await harness({ assistant: { hint: async () => { await gate; return null; } } });
  try {
    const u = await p.signup('Slow Hint');
    const m = mission('hem-01');
    const a = (await p.call('POST', '/api/missions/hem-01/start', { token: u.token })).body.attempt;
    const pending = p.call('POST', `/api/attempts/${a.attemptId}/hint`, { token: u.token, body: { stepId: m.steps[0]!.id } });
    await new Promise((r) => setTimeout(r, 30));
    p.clock.t += (m.timeLimitSec + 10) * 1000;
    await p.call('GET', '/api/dashboard', { token: u.token }); // closes the attempt as expired
    release();
    const res = await pending;
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'time_expired');
    const row = p.app.db.prepare('SELECT status, hints_total FROM attempts WHERE id = ?').get(a.attemptId) as { status: string; hints_total: number };
    assert.deepEqual({ ...row }, { status: 'expired', hints_total: 0 });
  } finally { release(); await p.close(); }
});

test('no-op content transitions are not audited', async () => {
  const p = await harness({ teacherInviteCode: 'T-INVITE' });
  try {
    const t = await p.signup('Prof', 'prof@uni.edu', { teacherInviteCode: 'T-INVITE' });
    const put = (status: string) => p.call('PUT', '/api/content/missions/hem-02/status', { token: t.token, body: { status } });
    assert.equal((await put('draft')).status, 200);
    assert.equal((await put('reviewed')).status, 200);
    assert.equal((await put('reviewed')).status, 200);
    assert.equal((p.app.db.prepare("SELECT COUNT(*) AS n FROM content_audit WHERE mission_id = 'hem-02'").get() as { n: number }).n, 1);
  } finally { await p.close(); }
});

test('analytics counts a student whose first attempt expired by their first COMPLETED attempt', async () => {
  const p = await harness({ teacherInviteCode: 'T-INVITE' });
  try {
    const t = await p.signup('Prof', 'prof@uni.edu', { teacherInviteCode: 'T-INVITE' });
    const cls = (await p.call('POST', '/api/classes', { token: t.token, body: { name: 'Class C' } })).body;
    const m = mission('hem-01');
    const s = await p.signup('Ann', 'ann@uni.edu');
    await p.call('POST', '/api/classes/join', { token: s.token, body: { joinCode: cls.joinCode } });
    await p.call('POST', '/api/missions/hem-01/start', { token: s.token });
    p.clock.t += (m.timeLimitSec + 5) * 1000;
    const again = (await p.call('POST', '/api/missions/hem-01/start', { token: s.token })).body.attempt;
    const done = await p.call('POST', `/api/attempts/${again.attemptId}/answer`, { token: s.token, body: { stepId: m.steps[0]!.id, response: correct(m.steps[0]!) } });
    assert.equal(done.body.completed, true);
    const anRes = await p.call('GET', `/api/classes/${cls.id}/analytics`, { token: t.token });
    assert.equal(anRes.status, 200, JSON.stringify(anRes.body));
    const an = anRes.body;
    const row = an.missions.find((x: { missionId: string }) => x.missionId === 'hem-01');
    assert.equal(row.cleanFirstTryPct, 100);
  } finally { await p.close(); }
});

test('no public document carries a real exit code (OpenAPI, rules, health)', async () => {
  const { LABS, exitCode } = await import('../src/content.ts');
  const codes = LABS.filter((l) => l.playable).map((l) => exitCode(l.slug));
  assert.ok(codes.length >= 4 && codes.every((c) => /^\d{3,4}$/.test(c)));
  for (const path of ['/api/openapi.json', '/api/rules', '/api/health']) {
    const res = await fetch(h.base + path);
    const text = await res.text();
    if (path !== '/api/rules') assert.equal(res.status, 200, path);
    for (const c of codes) assert.ok(!text.includes(`"${c}"`), `${path} exposes the exit code ${c}`);
  }
});

test('the Master Lab has lab results once escaped, and a 409 before', async () => {
  const { solve } = await import('./helpers.ts');
  const u = await h.signup('Master Finisher');
  for (const id of ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'mic-03', 'bio-01', 'bio-02', 'bio-03']) await solve(h, u.token, id);
  for (const [slug, code] of [['hematology', '742'], ['microbiology', '385'], ['biochemistry', '916']] as const) await h.call('POST', `/api/labs/${slug}/unlock`, { token: u.token, body: { code } });
  await solve(h, u.token, 'master-01');
  assert.equal((await h.call('GET', '/api/labs/master/results', { token: u.token })).body.error.code, 'lab_not_escaped');
  assert.equal((await h.call('POST', '/api/labs/master/unlock', { token: u.token, body: { code: '3916' } })).status, 200);
  const res = await h.call('GET', '/api/labs/master/results', { token: u.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.lab.slug, 'master');
  assert.equal(res.body.escaped, true);
  assert.equal(res.body.badge.id, 'clinical-detective');
  assert.equal(res.body.stats.missions, 1);
  assert.equal(res.body.missions.length, 1);
});
