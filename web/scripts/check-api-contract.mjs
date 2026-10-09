import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Every non-test TypeScript module under src/ is scanned, not just the entry file. */
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(fullPath) : [fullPath];
  }));
  return nested.flat().filter(file => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file));
}

// An optional directory argument lets the probe test scan a fixture tree instead of src/.
const scanned = await sourceFiles(process.argv[2] ? `${resolve(process.argv[2])}/` : new URL('../src/', import.meta.url).pathname);
const sources = await Promise.all(scanned.map(async file => ({ file, text: await readFile(file, 'utf8') })));
const openapi = JSON.parse(await readFile(new URL('../../be/openapi.json', import.meta.url), 'utf8'));

function findApiCalls(text) {
  const calls = [];
  // Generic arguments may nest (api<Array<X>>(...)): anything without parentheses between the angle brackets is accepted.
  const start = /\bapi(?:<[^()]*>)?\s*\(/g;
  for (let match; (match = start.exec(text));) {
    if (/function\s*$/.test(text.slice(Math.max(0, match.index - 12), match.index))) continue;
    let depth = 1;
    let quote = null;
    let escaped = false;
    let index = start.lastIndex;
    for (; index < text.length && depth; index += 1) {
      const char = text[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === quote) quote = null;
      } else if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
    }
    if (depth) throw new Error(`Unable to parse api() call at offset ${match.index}.`);
    const expression = text.slice(start.lastIndex, index - 1);
    const path = expression.match(/^\s*(['"`])([^'"`]+)\1/)?.[2];
    if (!path) throw new Error(`api() call at offset ${match.index} must use a static string or template path.`);
    const literalMethod = expression.match(/\bmethod\s*:\s*(['"])([A-Za-z]+)\1/)?.[2]?.toLowerCase();
    // A method that is not a quoted literal (variable, constant, template, spread options) would silently be checked as GET.
    if (!literalMethod && (/\bmethod\b/.test(expression) || /\.\.\./.test(expression))) throw new Error(`api() call at offset ${match.index} must give its HTTP method as a string literal.`);
    const method = literalMethod || 'get';
    calls.push({ path: path.split('?')[0], method });
    start.lastIndex = index;
  }
  return calls;
}

/** Every reference to the client must be a direct call: an alias (`const a = api`) or a callback would hide its route from this scan. */
function countClientReferences(text) {
  const code = text
    .replace(/import[\s\S]*?from\s*['"][^'"]+['"]/g, '')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""')
    .replace(/\bfunction\s+api\b/g, '');
  return [...code.matchAll(/(?<![.\w$])api\b(?!\s*:)/g)].length;
}
for (const { file, text } of sources) {
  if (/lib\/api\.ts$/.test(file)) continue;
  const references = countClientReferences(text);
  const direct = findApiCalls(text).length;
  if (references !== direct) throw new Error(`${file}: ${references} references to api but ${direct} direct calls; aliasing or passing api around hides routes from the contract check.`);
}

const documentedRoutes = Object.entries(openapi.paths).flatMap(([path, operations]) =>
  Object.keys(operations)
    .filter(method => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
    .map(method => ({ path: path.replace(/^\/api/, '').replace(/\{[^}]+\}/g, ':param'), method })),
);
const calls = sources.flatMap(({ file, text }) => {
  try {
    return findApiCalls(text).map(call => ({ ...call, file }));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}).map(call => ({
  ...call,
  path: call.path.replace(/\$\{[^}]+\}/g, ':param'),
}));
if (!calls.length) throw new Error('No api() calls found under src/: the contract scan is not looking at the right files.');
const matchesRoute = (call, route) => {
  const candidate = call.path.split('/').filter(Boolean);
  const documented = route.path.split('/').filter(Boolean);
  return call.method === route.method
    && candidate.length === documented.length
    && candidate.every((segment, index) => segment === documented[index] || documented[index] === ':param');
};
const missing = calls.filter(call => !documentedRoutes.some(route => matchesRoute(call, route)));
if (missing.length) {
  console.error(`Frontend route/method pairs missing from OpenAPI: ${[...new Set(missing.map(({ method, path, file }) => `${method.toUpperCase()} ${path} (${file})`))].join(', ')}`);
  process.exit(1);
}

const literalCount = new Set(calls.filter(call => !call.path.includes(':param')).map(({ method, path }) => `${method} ${path}`)).size;
const dynamicCount = new Set(calls.filter(call => call.path.includes(':param')).map(({ method, path }) => `${method} ${path}`)).size;
console.log(`API contract route/method check passed: ${literalCount} literal and ${dynamicCount} dynamic frontend operations.`);
