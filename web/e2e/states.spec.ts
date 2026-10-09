import { expect, test, type Locator, type Page } from '@playwright/test';
import { HOME_HEADING, homeHeading, json, openFaculty, openHome, outage, patched, resetDemo, serverError, slow } from './support/helpers';

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const alert = (page: Page) => page.getByRole('alert');

// Headings are rendered by PageIntro whatever the load state, so a heading proves nothing about recovery. Every
// "it recovered" / "it is not blank" assertion below is made on page-specific DATA (cards, rows) and on the absence of alerts.

test.describe('every student page: failure, slowness, emptiness', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  const pages: { name: string; heading: string | RegExp; data: (page: Page) => Locator; open: (page: Page) => Promise<void>; glob: string | RegExp; loading: RegExp }[] = [
    { name: 'dashboard', heading: HOME_HEADING, data: (page) => page.locator('.lab-strip .lab-card'), open: async (page) => { await page.reload(); }, glob: '**/api/dashboard', loading: /Loading investigation map/ },
    { name: 'lab map', heading: 'Laboratory map', data: (page) => page.locator('.map-grid .lab-card'), open: (page) => nav(page, 'Lab map'), glob: '**/api/labs', loading: /Loading the laboratory map/ },
    { name: 'progress', heading: 'Progress vault', data: (page) => page.locator('.vault-card'), open: (page) => nav(page, 'Progress'), glob: '**/api/vault', loading: /Opening the vault/ },
    { name: 'lab results', heading: 'Lab results', data: (page) => page.locator('.result-lab .mission-row'), open: (page) => nav(page, 'Lab results'), glob: '**/api/labs', loading: /Collecting your lab results/ },
  ];

  for (const p of pages) {
    test(`${p.name}: a 500 shows an alert with Retry, then recovers`, async ({ page }) => {
      const down = await outage(page, p.glob);
      await p.open(page);
      await expect(alert(page)).toContainText('Temporary outage');
      await expect(alert(page).getByRole('button', { name: 'Retry' })).toBeVisible();
      // While it is down no data is shown, only the alert.
      await expect(p.data(page)).toHaveCount(0);
      down.lift();
      await alert(page).getByRole('button', { name: 'Retry' }).click();
      await expect(p.data(page).first()).toBeVisible();
      await expect(alert(page)).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: p.loading })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
    });

    test(`${p.name}: a slow server shows a status, not a blank page`, async ({ page }) => {
      const gate = await slow(page, p.glob);
      await p.open(page);
      await expect(page.getByRole('status').filter({ hasText: p.loading })).toBeVisible();
      // Still loading: no error, and no data (or placeholder) has appeared yet.
      await expect(alert(page)).toHaveCount(0);
      await expect(p.data(page)).toHaveCount(0);
      gate.release();
      await expect(p.data(page).first()).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: p.loading })).toHaveCount(0);
      await expect(alert(page)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
    });

    test(`${p.name}: a malformed payload is an explicit error, not a default`, async ({ page }) => {
      await page.route(p.glob, (route) => route.fulfill(json(200, {})));
      await p.open(page);
      await expect(alert(page)).toContainText('unexpected response');
    });
  }

  test('lab results: one lab failing is reported for that lab with Retry', async ({ page }) => {
    const down = await outage(page, '**/api/labs/hematology/results');
    await nav(page, 'Lab results');
    await expect(alert(page)).toContainText('Hematology Lab: results could not be loaded');
    down.lift();
    await alert(page).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Escape confirmed' })).toBeVisible();
    await expect(page.locator('.result-lab .mission-row').first()).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
  });

  for (const [status, code] of [[404, 'not_found'], [409, 'not_completed']] as const) {
    test(`lab results: a ${status} for a lab the server lists as completed is an alert with Retry, never a benign empty note`, async ({ page }) => {
      const down = await outage(page, '**/api/labs/hematology/results', json(status, { error: { code, message: `Server says ${status} for this lab.` } }));
      await nav(page, 'Lab results');
      await expect(alert(page)).toContainText('Hematology Lab: results could not be loaded');
      await expect(alert(page)).toContainText(`Server says ${status} for this lab.`);
      await expect(page.getByRole('heading', { name: 'No lab-level results' })).toHaveCount(0);
      down.lift();
      await alert(page).getByRole('button', { name: 'Retry' }).click();
      await expect(page.getByRole('heading', { name: 'Escape confirmed' })).toBeVisible();
      await expect(alert(page)).toHaveCount(0);
    });
  }

  test('lab lobby: a 500 shows an alert with Retry; a lab in development shows an empty state', async ({ page }) => {
    await nav(page, 'Lab map');
    const down = await outage(page, '**/api/labs/hematology');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await expect(alert(page)).toContainText('Temporary outage');
    await expect(page.locator('.picker-row')).toHaveCount(0);
    down.lift();
    await alert(page).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await expect(page.locator('.picker-row').first()).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    await page.getByRole('button', { name: '← All laboratories' }).click();
    await page.route('**/api/labs/hematology', (route) => patched(route, (b) => ({ ...b, state: 'coming_soon', missions: [], vault: null })));
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await expect(page.getByRole('heading', { name: 'This laboratory is in development' })).toBeVisible();
  });

  test('profile: failure, slowness and recovery of the settings', async ({ page }) => {
    const down = await outage(page, '**/api/profile');
    await page.reload();
    await nav(page, 'Learning settings');
    await expect(alert(page)).toContainText('Temporary outage');
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    down.lift();
    await alert(page).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    // No toggle is ever shown before the server has said what it holds.
    const gate = await slow(page, '**/api/profile');
    await page.reload();
    await nav(page, 'Learning settings');
    await expect(page.getByRole('status').filter({ hasText: 'Loading your settings' })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(alert(page)).toHaveCount(0);
    gate.release();
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Loading your settings' })).toHaveCount(0);
  });

  test('empty payloads render real empty states', async ({ page }) => {
    await page.route('**/api/labs', (route) => patched(route, () => ({ labs: [] })));
    await nav(page, 'Lab map');
    await expect(page.getByRole('heading', { name: 'No laboratories yet' })).toBeVisible();
    await nav(page, 'Investigations');
    await expect(page.getByRole('heading', { name: 'No laboratory is open yet' })).toBeVisible();
    await nav(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'No escaped lab yet' })).toBeVisible();

    await page.route('**/api/vault', (route) => route.fulfill(json(200, { vaults: [] })));
    await page.route('**/api/badges', (route) => route.fulfill(json(200, { badges: [] })));
    await page.route('**/api/leaderboard**', (route) => patched(route, (b) => ({ ...b, rows: [], me: null, total: 0 })));
    await nav(page, 'Progress');
    await expect(page.getByRole('heading', { name: 'No vault yet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No badges defined' })).toBeVisible();
    // R13-C-02: the demo class exists (cohortAvailable) but nobody has XP in this payload: that is not "not set up".
    await expect(page.getByRole('heading', { name: 'Nobody is ranked yet' })).toBeVisible();
  });

  test('a resume failure keeps the attempt and offers Retry or continuing without it', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    const down = await outage(page, /\/api\/attempts\/[^/]+$/);
    await page.reload();
    await expect(alert(page)).toContainText('Temporary outage');
    expect(await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'))).toBeTruthy();
    down.lift();
    await alert(page).getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await expect(page.locator('.scientific')).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
  });

  test('a 404 for the remembered attempt drops it and shows the dashboard', async ({ page }) => {
    await page.evaluate(() => sessionStorage.setItem('escape-demo-attempt', 'no-such-attempt'));
    await page.reload();
    await expect(homeHeading(page)).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'))).toBeNull();
  });

  test('the rules failing does not block a mission (the hint price is simply not quoted)', async ({ page }) => {
    await outage(page, '**/api/rules');
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
    await expect(page.getByText('Each hint carries an XP penalty set by the server.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeEnabled();
  });
});

test.describe('faculty pages: failure, slowness, emptiness', () => {
  test.beforeEach(async ({ page }) => { await openHome(page); await openFaculty(page); });

  const pages = [
    { name: 'analytics', open: async (_: Page) => undefined, glob: '**/api/classes', heading: 'Class intelligence', data: (page: Page) => page.locator('button.mission-row'), loading: /Loading cohort signal/ },
    { name: 'student detail', open: (page: Page) => nav(page, 'Student detail'), glob: '**/api/classes', heading: 'Student detail', data: (page: Page) => page.locator('.profile-card'), loading: /Loading classes/ },
    { name: 'content review', open: (page: Page) => nav(page, 'Content review'), glob: '**/api/content/missions', heading: 'Content review', data: (page: Page) => page.locator('.content-row'), loading: /Loading mission content/ },
  ];

  for (const p of pages) {
    test(`${p.name}: 500 -> alert and Retry; slow -> status`, async ({ page }) => {
      if (p.name !== 'analytics') await p.open(page);
      const down = await outage(page, p.glob);
      if (p.name === 'analytics') { await nav(page, 'Student detail'); await nav(page, 'Faculty'); } else { await nav(page, 'Faculty'); await p.open(page); }
      await expect(alert(page)).toContainText('Temporary outage');
      await expect(p.data(page)).toHaveCount(0);
      down.lift();
      await alert(page).getByRole('button', { name: 'Retry' }).click();
      await expect(p.data(page).first()).toBeVisible();
      await expect(alert(page)).toHaveCount(0);
      await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();

      const gate = await slow(page, p.glob);
      await nav(page, p.name === 'analytics' ? 'Student detail' : 'Faculty');
      await nav(page, p.name === 'analytics' ? 'Faculty' : p.name === 'student detail' ? 'Student detail' : 'Content review');
      await expect(page.getByRole('status').filter({ hasText: p.loading })).toBeVisible();
      await expect(alert(page)).toHaveCount(0);
      await expect(p.data(page)).toHaveCount(0);
      gate.release();
      await expect(p.data(page).first()).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: p.loading })).toHaveCount(0);
      await expect(alert(page)).toHaveCount(0);
    });
  }

  test('no class at all: analytics, student detail show empty states, never an endless spinner', async ({ page }) => {
    await page.route('**/api/classes', (route) => route.fulfill(json(200, { classes: [] })));
    await nav(page, 'Student detail');
    await expect(page.getByRole('heading', { name: 'No class available' })).toBeVisible();
    await nav(page, 'Faculty');
    await expect(page.getByRole('heading', { name: 'No class yet' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a class with no students and no data shows empty states', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (b) => ({ ...b, total: 0, students: [] })));
    await page.route(/\/api\/classes\/\d+\/analytics$/, (route) => patched(route, (b) => ({ ...b, missions: [] })));
    await nav(page, 'Student detail');
    await expect(page.getByRole('heading', { name: 'No students in this class yet' })).toBeVisible();
    await nav(page, 'Faculty');
    await expect(page.getByRole('heading', { name: 'No mission data yet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No students in this class yet' })).toBeVisible();
  });

  test('a student without completed attempts shows an empty history', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, (b) => ({ ...b, history: [], historyTotal: 0 })));
    await nav(page, 'Student detail');
    await expect(page.getByRole('heading', { name: 'No completed attempts yet' })).toBeVisible();
  });

  test('content review with nothing to review', async ({ page }) => {
    await page.route('**/api/content/missions', (route) => route.fulfill(json(200, { missions: [] })));
    await nav(page, 'Content review');
    await expect(page.getByRole('heading', { name: 'No missions to review' })).toBeVisible();
  });

  test('a server error text is shown verbatim and 5xx is not blamed on the user', async ({ page }) => {
    await page.route('**/api/content/missions', (route) => route.fulfill(serverError('Database is busy')));
    await nav(page, 'Content review');
    await expect(alert(page)).toContainText('Database is busy');
    await expect(alert(page).getByRole('heading', { name: 'Faculty view unavailable' })).toBeVisible();
  });
});

test.describe('guest gate', () => {
  test('a missing/unseeded demo mentions DEMO_MODE, a network failure does not, and Retry works', async ({ page }) => {
    let mode: 'missing' | 'network' | 'ok' = 'missing';
    await page.route('**/api/auth/demo', (route) => {
      if (mode === 'missing') return route.fulfill(json(404, { error: { code: 'not_found', message: 'Demo mode is not enabled on this server.' } }));
      if (mode === 'network') return route.abort('connectionrefused');
      return route.continue();
    });
    await page.goto('/');
    await expect(alert(page)).toContainText('Demo mode is not enabled on this server.');
    await expect(alert(page)).toContainText('DEMO_MODE=1');
    mode = 'network';
    await page.getByRole('button', { name: 'Reopen the laboratory' }).click();
    await expect(alert(page)).toContainText('Cannot reach the Escape Lab server');
    await expect(alert(page)).not.toContainText('DEMO_MODE');
    mode = 'ok';
    await page.getByRole('button', { name: 'Reopen the laboratory' }).click();
    await expect(homeHeading(page)).toBeVisible();
  });

  test('while the session opens the gate announces a status', async ({ page }) => {
    const gate = await slow(page, '**/api/auth/demo');
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'Preparing your investigation' })).toBeVisible();
    await expect(alert(page)).toHaveCount(0);
    await expect(homeHeading(page)).toHaveCount(0);
    gate.release();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Preparing your investigation' })).toHaveCount(0);
  });

  test('a /me payload that is not a user is an explicit error', async ({ page }) => {
    await page.route('**/api/me', (route) => route.fulfill(json(200, { id: 1 })));
    await page.goto('/');
    await expect(alert(page)).toContainText('unexpected response');
    await expect(alert(page).getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
