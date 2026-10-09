import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

// An optional directory argument lets the probe test scan a fixture tree instead of src/.
const sourceRoot = process.argv[2] ? pathToFileURL(`${resolve(process.argv[2])}/`) : new URL('../src/', import.meta.url);
/** The only module that may talk to the network or touch browser storage. */
const apiClient = 'lib/api.ts';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? files(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const everywhere = [
  [/\blocalStorage\b/, 'localStorage is not allowed in the guest client.'],
  [/\bindexedDB\b/, 'indexedDB is not allowed in the guest client.'],
];
const onlyInApi = [
  [/\bfetch\b/, 'fetch (direct, window.fetch, globalThis.fetch or aliased)'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bdocument\s*\.\s*cookie\b|\bcookieStore\b/, 'cookie access'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bimport\s*\(\s*['"`]https?:/, 'remote dynamic import'],
  [/\bnew\s+(?:Image|Request|Function|Worker|SharedWorker|BroadcastChannel)\b|\beval\s*\(|\bimportScripts\b|\bserviceWorker\b/, 'Image/Request/Function/Worker constructors, eval or service workers (hidden egress or code loading)'],
  [/\b(?:window|globalThis|self|top|parent|frames)\s*(?:\?\.)?\s*\[/, 'computed property access on a global object (it can reach fetch or storage by a built-up name)'],
  [/\b(?:from|require\s*\(|import\s*\()\s*['"`](?:axios|ky|got|superagent|node-fetch|cross-fetch|isomorphic-fetch|undici|ofetch|whatwg-fetch)\b/, 'a third-party HTTP client'],
];

const violations = [];
for (const file of await files(sourceRoot.pathname)) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file)) continue;
  const path = relative(sourceRoot.pathname, file);
  const text = stripComments(await readFile(file, 'utf8'));
  if (/\.test\.[cm]?[jt]sx?$/.test(path)) continue;
  // Test files are skipped, so a shipped module must never import one (it would carry its network or storage access into the bundle).
  if (/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`][^'"`]*\.test(?:\.[cm]?[jt]sx?)?['"`]/.test(text)) violations.push(`${path}: a shipped module must not import a *.test file.`);
  for (const [pattern, message] of everywhere) if (pattern.test(text)) violations.push(`${path}: ${message}`);
  if (path !== apiClient) {
    for (const [pattern, what] of onlyInApi) if (pattern.test(text)) violations.push(`${path}: ${what} is only allowed in ${apiClient}.`);
  }
}

if (violations.length) {
  console.error(`Client boundary check failed:\n${violations.map(item => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Client boundary check passed: network, cookies and browser storage are centralized in lib/api.ts.');
