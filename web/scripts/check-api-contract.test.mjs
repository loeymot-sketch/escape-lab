// @vitest-environment node
// Probe tests for the API contract scanner: a route/method that bypasses the literal form must fail, not pass as GET.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('./check-api-contract.mjs', import.meta.url));
const roots = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'escape-contract-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

const wrap = (body) => `import { api } from './lib/api';\n${body}`;

describe('check-api-contract probes', () => {
  it('accepts a documented route and method', () => {
    expect(scan({ 'a.ts': wrap("export const a = () => api('/health');") }).code).toBe(0);
  });

  it('rejects an undocumented route', () => {
    expect(scan({ 'a.ts': wrap("export const a = () => api('/nope');") }).code).toBe(1);
  });

  it('rejects a method that is not a string literal instead of treating it as GET (F-07)', () => {
    for (const call of [
      "api('/vault', { method: verb })",
      "api('/vault', { method })",
      "api('/vault', { method: `DELETE` })",
      "api('/vault', { ...options })",
    ]) expect(scan({ 'a.ts': wrap(`export const a = (verb, method, options) => ${call};`) }).code, call).toBe(1);
  });

  it('sees calls with nested generics and refuses aliases (F-08)', () => {
    const nested = scan({ 'a.ts': wrap("export const a = () => api<Array<Record<string, number>>>('/not-a-route');") });
    expect(nested.code).toBe(1);
    expect(nested.out).toContain('/not-a-route');
    for (const code of ["const a = api; a('/nope');", "const list = [api];", "export const x = (f = api) => f('/nope');"]) {
      const result = scan({ 'a.ts': wrap(code) });
      expect(result.code, code).toBe(1);
      expect(result.out).toContain('direct calls');
    }
  });
});
