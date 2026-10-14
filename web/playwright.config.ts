import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The suite owns its API database: a fresh file is created and seeded on every run, so the tests never
// depend on be/data/escape-lab.db being seeded and never pollute it. The path is exported through the
// environment so workers (and support helpers) see the same file.
const dbPath = process.env.E2E_DB_PATH ?? join(tmpdir(), 'escape-lab-e2e', 'e2e.db');
process.env.E2E_DB_PATH = dbPath;

// The suite's API and dev-server ports default to the documented 3000/5173, but another local session (the owner's own demo, a second
// agent) may already hold them: E2E_API_PORT / E2E_WEB_PORT move the whole suite, including the helpers and the bundle under test.
const API_PORT = Number(process.env.E2E_API_PORT) || 3000;
const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 5173;
process.env.E2E_API_PORT = String(API_PORT);
process.env.E2E_WEB_PORT = String(WEB_PORT);

const apiCommand = [
  'mkdir -p "$(dirname "$E2E_DB_PATH")"',
  'rm -f "$E2E_DB_PATH" "$E2E_DB_PATH-wal" "$E2E_DB_PATH-shm"',
  'NODE_ENV=test DB_PATH="$E2E_DB_PATH" node --disable-warning=ExperimentalWarning scripts/seed-demo.ts',
  `AUTH_SECRET=e2e-secret DEMO_MODE=1 RATE_REGISTER_PER_HOUR=40 NODE_ENV=test PORT=${API_PORT} DB_PATH="$E2E_DB_PATH" node --disable-warning=ExperimentalWarning src/server.ts`,
].join(' && ');

// The production-bundle project exercises `vite build` output served by `vite preview` (not the dev server): minified
// code, hashed assets, no StrictMode double effects. It is built into its own folders so `dist/` (the budget check) is untouched.
// Keep the production previews movable: another local project may already own the default ports.
const PROD_PORT = Number(process.env.E2E_PROD_PORT) || 4173;
const UNCONFIGURED_PORT = Number(process.env.E2E_UNCONFIGURED_PORT) || 4174;
const API_URL = `http://localhost:${API_PORT}/api`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // A shared CI/dev machine can be heavily loaded: every UI wait gets 10s instead of the 5s default (the whole-test budget is unchanged).
  expect: { timeout: 10_000 },
  // One worker: every test shares the single seeded demo guest, and resets it explicitly.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /production\.spec\.ts/, /webkit\.spec\.ts/] },
    // The full mobile suite runs the iPhone 13 descriptor (viewport, DPR, touch, UA) on Chromium; WebKit itself runs the smoke subset below.
    { name: 'mobile-iphone13', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
    // Smoke subset against the production bundle (landing, a mission, the result, a bundle built without an API address).
    { name: 'production-bundle', use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PROD_PORT}` }, testMatch: /production\.spec\.ts/ },
    // Real WebKit engine (Playwright's build, the same engine as Safari), desktop and iPhone descriptors: a smoke walk through the game loop.
    // This is an engine run, not a physical device; see docs/KNOWN_LIMITATIONS.md.
    { name: 'webkit-smoke', use: { ...devices['Desktop Safari'] }, testMatch: /webkit\.spec\.ts/ },
    { name: 'webkit-iphone13', use: { ...devices['iPhone 13'] }, testMatch: /webkit\.spec\.ts/ },
  ],
  webServer: [
    {
      command: apiCommand,
      cwd: '../be',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_DB_PATH: dbPath },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '.',
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_API_URL: API_URL },
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port ${PROD_PORT} --strictPort; rc=$?; mkdir -p "$(dirname "$E2E_DB_PATH")"; echo "prod exit $rc $(date +%T)" >> "$(dirname "$E2E_DB_PATH")/webserver-exit.log"`,
      cwd: '.',
      url: `http://127.0.0.1:${PROD_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
    {
      // Built WITHOUT an API address: it must refuse to start instead of calling localhost.
      command: `npx vite build --outDir dist-e2e-unconfigured --emptyOutDir && npx vite preview --outDir dist-e2e-unconfigured --host 127.0.0.1 --port ${UNCONFIGURED_PORT} --strictPort; rc=$?; mkdir -p "$(dirname "$E2E_DB_PATH")"; echo "unconf exit $rc $(date +%T)" >> "$(dirname "$E2E_DB_PATH")/webserver-exit.log"`,
      cwd: '.',
      url: `http://127.0.0.1:${UNCONFIGURED_PORT}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: '' },
    },
  ],
});
