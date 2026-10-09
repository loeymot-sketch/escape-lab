import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The suite owns its API database: a fresh file is created and seeded on every run, so the tests never
// depend on be/data/escape-lab.db being seeded and never pollute it. The path is exported through the
// environment so workers (and support helpers) see the same file.
const dbPath = process.env.E2E_DB_PATH ?? join(tmpdir(), 'escape-lab-e2e', 'e2e.db');
process.env.E2E_DB_PATH = dbPath;

const apiCommand = [
  'mkdir -p "$(dirname "$E2E_DB_PATH")"',
  'rm -f "$E2E_DB_PATH" "$E2E_DB_PATH-wal" "$E2E_DB_PATH-shm"',
  'NODE_ENV=test DB_PATH="$E2E_DB_PATH" node --disable-warning=ExperimentalWarning scripts/seed-demo.ts',
  'AUTH_SECRET=e2e-secret DEMO_MODE=1 RATE_REGISTER_PER_HOUR=40 NODE_ENV=test DB_PATH="$E2E_DB_PATH" node --disable-warning=ExperimentalWarning src/server.ts',
].join(' && ');

// The production-bundle project exercises `vite build` output served by `vite preview` (not the dev server): minified
// code, hashed assets, no StrictMode double effects. It is built into its own folders so `dist/` (the budget check) is untouched.
const PROD_PORT = 4173;
const UNCONFIGURED_PORT = 4174;
const API_URL = 'http://localhost:3000/api';

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
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /production\.spec\.ts/] },
    // WebKit is not installed in this environment, so the iPhone 13 descriptor (viewport, DPR, touch, UA) runs on Chromium.
    { name: 'mobile-iphone13', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' }, testMatch: /mobile\.spec\.ts/ },
    // Smoke subset against the production bundle (landing, a mission, the result, a bundle built without an API address).
    { name: 'production-bundle', use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PROD_PORT}` }, testMatch: /production\.spec\.ts/ },
  ],
  webServer: [
    {
      command: apiCommand,
      cwd: '../be',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_DB_PATH: dbPath },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      cwd: '.',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: false,
      timeout: 30_000,
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
