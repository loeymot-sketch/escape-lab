import { expect, test, type Page, type Route } from '@playwright/test';
import { ARTWORK, ATTEMPT_KEY, TOKEN_KEY, apiCall, caseStatus, clickArtwork, expireAttemptInDb, homeHeading, resetDemo, sessionToken, settle, slow, startMissionViaUi, submit, DECISION } from './support/helpers';

const complete = (page: Page) => expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
const attemptId = (page: Page) => page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY);
const timer = (page: Page) => page.getByRole('timer');

/** Fetches the real response and lets the test patch it, so mocked payloads stay structurally complete. */
async function patchJson(route: Route, patch: (body: any) => unknown) {
  const response = await route.fetch();
  await route.fulfill({ response, json: patch(await response.json()) });
}

test.describe('time limit and expiry (the server decides)', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('the timer shows the server snapshot and counts down locally', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(timer(page)).toHaveAttribute('aria-label', /^Time left 0[34]:\d\d$/);
    const first = await timer(page).textContent();
    await expect(timer(page)).not.toHaveText(first!);
  });

  test('at zero the app asks the server, and the server answer (expired) closes the mission', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    // The server says "2 seconds left" until the page has been seen counting down, then says "expired".
    // Event-based: if the page asks again before the flag flips on a slow machine it just gets another 2 s and asks again.
    let expire = false;
    let reads = 0;
    await page.route(/\/api\/attempts\/[^/]+$/, async (route) => {
      reads += 1;
      await patchJson(route, (body) => (expire ? { ...body, status: 'expired', expired: true, remainingSec: 0 } : { ...body, remainingSec: 2 }));
    });
    await page.reload();
    await expect(timer(page)).toHaveAttribute('aria-label', /^Time left 00:0[012]$/);
    expire = true;
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await expect(submit(page)).toBeDisabled();
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  test('returning to the tab reads the attempt from the server exactly once, although focus and visibilitychange both fire', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    let reads = 0;
    await page.route(/\/api\/attempts\/[^/]+$/, async (route) => { reads += 1; await route.continue(); });
    const firstRead = page.waitForResponse((r) => /\/api\/attempts\/[^/]+$/.test(r.url()) && r.request().method() === 'GET');
    await page.evaluate(() => {
      // A real tab switch delivers both events back to back.
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await firstRead;
    await settle(page);
    expect(reads).toBe(1);
    // Past the de-duplication window, a later return reads again (the guard is not a permanent mute).
    await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await settle(page); return reads; }, { timeout: 8_000 }).toBe(2);
  });

  test('a refresh that was overtaken by an answer is dropped: it must not rewind the mission', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    const firstPrompt = (await page.locator('.case-panel h1').textContent())!;
    let reads = 0;
    let letGo: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { letGo = resolve; });
    let captured: () => void = () => undefined;
    const snapshotTaken = new Promise<void>((resolve) => { captured = resolve; });
    let delivered: () => void = () => undefined;
    const staleDelivered = new Promise<void>((resolve) => { delivered = resolve; });
    await page.route(/\/api\/attempts\/[^/]+$/, async (route) => {
      reads += 1;
      if (reads > 1) { await route.continue(); return; }
      const stale = await route.fetch(); // the server state as of step 1
      captured();
      await gate;
      await route.fulfill({ response: stale });
      delivered();
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await snapshotTaken;
    // Meanwhile the learner answers; the answer reply moves the mission to step 2.
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    const secondPrompt = (await page.locator('.case-panel h1').textContent())!;
    expect(secondPrompt).not.toBe(firstPrompt);
    // Now the old snapshot arrives. It describes step 1 and must be ignored.
    letGo();
    await staleDelivered;
    await settle(page);
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.locator('.case-panel h1')).toHaveText(secondPrompt);
    expect(reads).toBe(1);
  });

  test('the countdown stays within 2 s of the server remainingSec, also after the snapshot is replaced', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const id = (await attemptId(page))!;
    const token = await sessionToken(page);
    const shown = async () => {
      const label = (await timer(page).getAttribute('aria-label'))!;
      const m = /^Time left (\d\d):(\d\d)$/.exec(label);
      expect(m, label).not.toBeNull();
      return Number(m![1]) * 60 + Number(m![2]);
    };
    // The display is read before and after the server read, so a machine that stalls between the two cannot
    // turn real elapsed time into a false disagreement: the server value must lie within 2 s of that window.
    const agrees = async (when: string) => {
      const before = await shown();
      const server = (await apiCall(token, `/attempts/${id}`)).body.remainingSec as number;
      const after = await shown();
      expect(server, `${when}: shown ${before}s..${after}s vs server ${server}s`).toBeLessThanOrEqual(before + 2);
      expect(server, `${when}: shown ${before}s..${after}s vs server ${server}s`).toBeGreaterThanOrEqual(after - 2);
    };
    await agrees('at start');
    const first = await shown();
    await expect.poll(shown, { timeout: 8_000 }).toBeLessThanOrEqual(first - 3);
    await agrees('after counting down locally');
    // A hint replaces the server snapshot: the display re-anchors to it, never above the server value.
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await agrees('after the snapshot was replaced');
  });

  test('a 409 time_expired on answer shows the expired panel, disables Submit and offers a restart', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.route('**/api/attempts/*/answer', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'time_expired', message: 'This attempt has exceeded its time limit.' } }) }));
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Time is up.');
    await expect(alert).not.toContainText('Not quite');
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Restart mission' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to mission control' })).toBeVisible();
    await expect(wrongCount(page)).toHaveText('0');
  });

  test('a REAL expired attempt: refresh shows the expired panel, restart returns a fresh attempt that can be completed', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const old = (await attemptId(page))!;
    expireAttemptInDb(old);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await expect(timer(page)).toHaveAttribute('aria-label', 'Time is up');
    await expect(submit(page)).toBeDisabled();
    await expect(page.locator('.scientific')).toBeDisabled();
    // The server itself refuses the answer too.
    const token = await sessionToken(page);
    const refused = await apiCall(token, `/attempts/${old}/answer`, { method: 'POST', body: { stepId: 'hem-01-s1', response: { x: 73.6, y: 46.8 } } });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('time_expired');

    const restarted = page.waitForResponse((r) => r.url().endsWith('/missions/hem-01/start') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Restart mission' }).click();
    const reply = await (await restarted).json();
    expect(reply.resumed).toBe(false);
    expect(reply.attempt.attemptId).not.toBe(old);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(timer(page)).toHaveAttribute('aria-label', /^Time left 0[34]:\d\d$/);
    expect(await attemptId(page)).toBe(reply.attempt.attemptId);
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await complete(page);
  });

  test('Return to mission control leaves an expired mission', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    expireAttemptInDb((await attemptId(page))!);
    await page.reload();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await expect(homeHeading(page)).toBeVisible();
    expect(await attemptId(page)).toBeNull();
  });
});

const wrongCount = (page: Page) => caseStatus(page, 'Wrong answers');

test.describe('hints', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('the budget is shown, the penalty is server-owned, and the hint is cleared on the next step', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await expect(page.getByText('Each hint costs 15 XP.')).toBeVisible();
    await expect(page.getByText('Hints used on this step: 0 of 1.')).toBeVisible();
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await expect(page.getByText('Hints used on this step: 1 of 1.')).toBeVisible();
    await expect(caseStatus(page, 'Hints used')).toHaveText('1');
    await expect(caseStatus(page, 'XP penalty')).toHaveText('-15');
    // No hint left on this step: the button is disabled with an explicit reason.
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();

    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.locator('.hint-result')).toHaveCount(0);
    await expect(page.getByText('Hints used on this step: 0 of 1.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeEnabled();
    // The mission-wide figure stays.
    await expect(caseStatus(page, 'XP penalty')).toHaveText('-15');
  });

  test('after a refresh the used-hint count and the paid hint text come from the server, and the button stays disabled at zero left', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Hints used on this step: 1 of 1.')).toBeVisible();
    // R9-B-06: the server now stores the delivered text, so the old "not stored" notice is replaced by the hint itself.
    await expect(page.locator('.hint-result')).toHaveCount(1);
    await expect(page.locator('.hint-result')).toContainText('Inspect the tube before reading the number.');
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();
  });

  test('the hint price is read from /rules, not hard-coded', async ({ page }) => {
    await page.route('**/api/rules', (route) => patchJson(route, (rules) => ({ ...rules, hintPenalty: -25 })));
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await expect(page.getByText('Each hint costs 25 XP.')).toBeVisible();
  });

  test('a server no_more_hints refusal is announced and disables the button', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.route('**/api/attempts/*/hint', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'no_more_hints', message: 'No more hints are available for this step.' } }) }));
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.getByRole('alert')).toContainText('No more hints are available for this step.');
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();
    await expect(page.getByRole('alert')).not.toContainText('Not quite');
  });
});

test.describe('submission safety and input rules', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('a double click sends exactly one answer request', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    let posts = 0;
    await page.route('**/api/attempts/*/answer', async (route) => {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).dblclick();
    await complete(page);
    expect(posts).toBe(1);
  });

  test('matching offers Submit only when every item has a distinct association', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const selects = page.locator('select');
    await expect(submit(page)).toBeDisabled();
    await selects.nth(0).selectOption('ecoli');
    await selects.nth(1).selectOption('spyo');
    await selects.nth(2).selectOption('proteus');
    await expect(page.getByText('3 of 4 matched.')).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await selects.nth(3).selectOption('ecoli');
    await expect(page.getByText(/Each association can be used only once/)).toBeVisible();
    await expect(selects.nth(3)).toHaveAttribute('aria-invalid', 'true');
    await expect(submit(page)).toBeDisabled();
    await selects.nth(3).selectOption('pseudo');
    await expect(submit(page)).toBeEnabled();
  });

  test('an answer failure is shown as an alert that is not mistaken for a wrong answer, and the input is kept', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    let fail = true;
    await page.route('**/api/attempts/*/answer', (route) => (fail
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.' } }) })
      : route.continue()));
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Something went wrong.');
    await expect(page.getByRole('alert')).not.toContainText('Not quite');
    await expect(wrongCount(page)).toHaveText('0');
    fail = false;
    await submit(page).click();
    await complete(page);
  });

  test('a malformed answer payload becomes a visible error instead of a plausible default', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.route('**/api/attempts/*/answer', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ correct: false }) }));
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('unexpected response');
    await expect(page.getByRole('alert')).not.toContainText('Recheck the values');
  });

  test('a step payload without a kind is rejected cleanly instead of crashing the renderer', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.route(/\/api\/attempts\/[^/]+$/, (route) => patchJson(route, (body) => ({ ...body, step: { ...body.step, kind: undefined } })));
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('unexpected response');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue without it' })).toBeVisible();
  });
});

test.describe('session recovery', () => {
  test('an unknown bearer is replaced by a fresh guest session with a notice', async ({ page }) => {
    await page.goto('/');
    await expect(homeHeading(page)).toBeVisible();
    await page.evaluate((k) => sessionStorage.setItem(k, 'stale-token'), TOKEN_KEY);
    await page.reload();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'guest session expired' })).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), TOKEN_KEY)).not.toBe('stale-token');
  });

  test('a 401 in the middle of a page re-enters as a fresh guest', async ({ page }) => {
    await resetDemo(page);
    await sessionToken(page);
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.route('**/api/vault', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unauthorized', message: 'Authentication required.' } }) }));
    const reentered = page.waitForRequest((r) => r.url().endsWith('/auth/demo') && r.method() === 'POST');
    await page.getByRole('button', { name: 'Progress' }).click();
    await reentered;
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'guest session expired' })).toBeVisible();
    expect(await sessionToken(page)).toBeTruthy();
  });
});

test.describe('dashboard call to action follows the server', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('no continue target: "Explore laboratory map" really opens the map', async ({ page }) => {
    await page.route('**/api/dashboard', (route) => patchJson(route, (d) => ({ ...d, continue: null })));
    await page.reload();
    await page.getByRole('button', { name: 'Explore laboratory map' }).click();
    await expect(page.getByRole('heading', { name: 'Laboratory map' })).toBeVisible();
  });

  test('an unlock target opens the Code Vault', async ({ page }) => {
    await page.route('**/api/dashboard', (route) => patchJson(route, (d) => ({ ...d, continue: { kind: 'unlock', missionId: null, labSlug: 'hematology', title: 'Unlock the Hematology Lab', resume: false } })));
    await page.reload();
    await page.getByRole('button', { name: 'Open the Code Vault' }).click();
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
  });

  test('a fresh next mission says "Start", and after leaving a mission it says "Resume" and resumes the same attempt', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Start the next investigation' })).toBeVisible();
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const id = await attemptId(page);
    await page.getByRole('button', { name: '← Exit mission' }).click();
    await page.getByRole('button', { name: 'Investigations', exact: true }).click();
    await expect(homeHeading(page)).toBeVisible();
    await page.getByRole('button', { name: 'Resume active investigation' }).click();
    await expect(page.getByText(/CASE FILE · Microbiology/)).toBeVisible();
    expect(await attemptId(page)).toBe(id);
  });
});

test.describe('lab lobby, map and leaderboard', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('lab cards show server counts and the reason a lab is locked', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.getByText('3 of 3 missions · 3 of 3 code fragments')).toBeVisible();
    await expect(page.getByText('Clear 3 labs (1 of 3 cleared)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Enter Master Lab/ })).toHaveCount(0);
    await expect(page.getByText('Coming soon').first()).toBeVisible();
  });

  test('the lobby lets the learner pick any available mission, not always the first', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Anemia Detective');
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await page.getByRole('button', { name: '← Exit mission' }).click();
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Enter Clinical Biochemistry Lab' }).click();
    await expect(page.getByText('Complete mission 01 to unlock')).toHaveCount(1);
    await expect(page.getByText('Complete mission 02 to unlock')).toHaveCount(1);
    await expect(page.getByText('fragments', { exact: false }).first()).toBeVisible();
  });

  test('a learner outside the top of the table still sees their own row, labelled "You"', async ({ page }) => {
    await page.route('**/api/leaderboard**', (route) => patchJson(route, (b) => ({
      ...b,
      rows: b.rows.slice(0, 3).map((r: any) => ({ ...r, you: false })),
      me: { rank: 30, name: 'Alex M.', xp: 8240, labs: 1, accuracyPct: 87, you: true },
      total: 38,
    })));
    await page.getByRole('button', { name: 'Progress' }).click();
    const rows = page.locator('.leaderboard-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.last()).toContainText('#30');
    await expect(rows.last()).toContainText('You');
    await expect(page.getByText('Showing 4 of 38 ranked students.')).toBeVisible();
    await expect(page.getByText('Alex')).toHaveCount(0);
  });

  test('student screens never show a persona name', async ({ page }) => {
    for (const nav of ['Investigations', 'Lab map', 'Progress', 'Lab results', 'Learning settings', 'About & demo guide']) {
      await page.getByRole('button', { name: nav, exact: true }).click();
      await expect(page.locator('main h1')).toBeVisible();
      expect(await page.locator('body').innerText()).not.toMatch(/Alex|Martin|Bonjour/);
    }
  });
});

test.describe('one request at a time (the server answers 409 hint_in_progress to overlapping requests)', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  /** Counts the answer/hint requests the page really sends, and the statuses it gets back. */
  function watchMutations(page: Page) {
    const seen = { answers: 0, hints: 0, statuses: [] as number[] };
    page.on('request', (r) => {
      if (r.method() !== 'POST') return;
      if (/\/answer$/.test(r.url())) seen.answers += 1;
      if (/\/hint$/.test(r.url())) seen.hints += 1;
    });
    page.on('response', (r) => { if (r.request().method() === 'POST' && /\/(answer|hint)$/.test(r.url())) seen.statuses.push(r.status()); });
    return seen;
  }

  test('while a hint is being fetched, Submit and every answer option are disabled and no answer can overlap it', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await expect(submit(page)).toBeEnabled();
    const seen = watchMutations(page);
    const gate = await slow(page, '**/api/attempts/*/hint');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.getByRole('button', { name: 'Requesting hint…' })).toBeDisabled();
    await expect(submit(page)).toBeDisabled();
    await expect(page.locator('.answer-options button:enabled')).toHaveCount(0);
    // Even a forced click (or Enter) cannot reach the server: the control is disabled, not merely styled.
    await submit(page).click({ force: true });
    gate.release();
    await expect(page.locator('.hint-result')).toBeVisible();
    await expect(submit(page)).toBeEnabled();
    await expect(page.locator('.answer-options button:enabled')).not.toHaveCount(0);
    expect(seen.answers).toBe(0);
    expect(seen.hints).toBe(1);
    expect(seen.statuses).toEqual([200]);
  });

  test('while an answer is being checked, the hint button is disabled and no hint can overlap it', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    const seen = watchMutations(page);
    const gate = await slow(page, '**/api/attempts/*/answer');
    await submit(page).click();
    await expect(page.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeDisabled();
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click({ force: true });
    gate.release();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeEnabled();
    expect(seen.hints).toBe(0);
    expect(seen.answers).toBe(1);
    expect(seen.statuses).toEqual([200]);
  });

  test('Restart is single-flight: it is disabled and says so while the new attempt is created', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    expireAttemptInDb((await attemptId(page))!);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    let starts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/missions/hem-01/start')) starts += 1; });
    const gate = await slow(page, '**/api/missions/hem-01/start');
    await page.getByRole('button', { name: 'Restart mission' }).click();
    await expect(page.getByRole('button', { name: 'Restarting…' })).toBeDisabled();
    await page.getByRole('button', { name: 'Restarting…' }).click({ force: true });
    gate.release();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(timer(page)).toHaveAttribute('aria-label', /^Time left 0[34]:\d\d$/);
    expect(starts).toBe(1);
  });
});

test.describe('rate limits (429) are shown as an alert with a retry hint, and nothing is lost', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });
  const limited = (retryAfterSeconds: number) => ({ status: 429, headers: { 'retry-after': String(retryAfterSeconds) }, contentType: 'application/json', body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many attempts. Try again shortly.', details: { retryAfterSeconds } } }) });

  test('a rate-limited answer keeps the attempt, the selection and the counters, and works again afterwards', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const id = await attemptId(page);
    await page.route('**/api/attempts/*/answer', (route) => route.fulfill(limited(7)));
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Too many attempts');
    await expect(alert).toContainText('Try again in 7 seconds');
    await expect(alert).not.toContainText('Not quite');
    await expect(wrongCount(page)).toHaveText('0');
    await expect(page.getByText(/STEP 1 \/ 1/)).toBeVisible();
    expect(await attemptId(page)).toBe(id);
    await expect(submit(page)).toBeEnabled();
    await page.unroute('**/api/attempts/*/answer');
    await submit(page).click();
    await complete(page);
  });

  test('a rate-limited hint is announced and the hint stays available', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.route('**/api/attempts/*/hint', (route) => route.fulfill(limited(3)));
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.getByRole('alert')).toContainText('Try again in 3 seconds');
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeEnabled();
    await expect(page.getByText(/Hints used on this step: 0 of \d+\./)).toBeVisible();
    await page.unroute('**/api/attempts/*/hint');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
  });

  test('a rate-limited start is announced in the page alert, the lobby stays usable, and the next try starts the mission', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await page.route('**/api/missions/hem-01/start', (route) => route.fulfill(limited(5)));
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
    await expect(page.getByRole('alert')).toContainText('Try again in 5 seconds');
    await expect(page.getByRole('button', { name: 'Replay Blood Smear Code' })).toBeEnabled();
    expect(await attemptId(page)).toBeNull();
    await page.unroute('**/api/missions/hem-01/start');
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
  });
});

test.describe('buttons that start something say so and cannot be pressed twice', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('lobby: the clicked mission says "Starting…", every other action is disabled, one request is sent', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    let starts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/missions\/[^/]+\/start$/.test(r.url())) starts += 1; });
    const gate = await slow(page, '**/api/missions/hem-01/start');
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
    const busy = page.getByRole('button', { name: 'Starting Blood Smear Code' });
    await expect(busy).toBeDisabled();
    await expect(busy).toHaveText('Starting…');
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Starting mission' })).toBeVisible();
    await expect(page.locator('.picker-row button:enabled')).toHaveCount(0);
    await busy.click({ force: true });
    gate.release();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    expect(starts).toBe(1);
  });

  test('dashboard: the main button says "Starting…" and the lab cards are disabled until the mission opens', async ({ page }) => {
    const gate = await slow(page, /\/api\/missions\/[^/]+\/start$/);
    await page.getByRole('button', { name: 'Start the next investigation' }).click();
    const cta = page.locator('.hero .primary');
    await expect(cta).toHaveText('Starting…');
    await expect(cta).toBeDisabled();
    await expect(page.locator('.lab-card-foot button:enabled')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Starting mission' })).toBeVisible();
    gate.release();
    await expect(page.locator('.case-panel h1')).toBeVisible();
  });

  test('Reset guest session: "Resetting…", the other guest actions are disabled, and the dashboard returns', async ({ page }) => {
    const gate = await slow(page, '**/api/demo/reset');
    await page.getByRole('button', { name: 'Reset guest session' }).click();
    await page.getByRole('button', { name: 'Confirm reset' }).click();
    await expect(page.getByRole('button', { name: 'Resetting…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Resetting guest session' })).toBeVisible();
    gate.release();
    await expect(page.getByRole('status').filter({ hasText: 'Resetting guest session' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeEnabled();
    await expect(homeHeading(page)).toBeVisible();
  });

  test('Faculty guest: "Switching…", the other guest actions are disabled, and a failure is reported instead of swallowed', async ({ page }) => {
    const gate = await slow(page, '**/api/auth/demo');
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('button', { name: 'Switching…' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: 'Switching guest session' })).toBeVisible();
    gate.release();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
  });

  test('a failed guest switch is announced and the current session stays usable', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Demo sign-in is paused.' } }) }));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('alert')).toContainText('Demo sign-in is paused.');
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeEnabled();
    await expect(homeHeading(page)).toBeVisible();
  });
});
