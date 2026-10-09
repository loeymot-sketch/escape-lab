import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { harness, solve } from './helpers.ts';

test('progress survives a restart on a file database; CORS and security headers are set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'el-'));
  const dbPath = join(dir, 'e.db');
  try {
    let h = await harness({ dbPath, corsOrigin: 'https://app.escapelab.test' });
    const u = await h.signup('Persist', 'p@uni.edu');
    await solve(h, u.token, 'hem-01');
    const pre = await fetch(h.base + '/api/dashboard', { method: 'OPTIONS', headers: { origin: 'https://app.escapelab.test' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://app.escapelab.test');
    const bad = await fetch(h.base + '/api/health', { headers: { origin: 'https://evil.test' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.equal(bad.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(bad.headers.get('cache-control'), 'no-store');
    await h.close();

    h = await harness({ dbPath, secret: 'test-secret' });
    const login = await h.call('POST', '/api/auth/login', { body: { email: 'p@uni.edu', password: 'correct horse battery' } });
    assert.equal(login.status, 200);
    assert.equal((await h.call('GET', '/api/me', { token: login.body.token })).body.xp, 180);
    await h.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('oversized and non-JSON bodies are refused', async () => {
  const h = await harness();
  try {
    const big = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(100_000) }) });
    assert.equal(big.status, 413);
    const txt = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' });
    assert.equal(txt.status, 415);
    const broken = await fetch(h.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(broken.status, 400);
  } finally { await h.close(); }
});
