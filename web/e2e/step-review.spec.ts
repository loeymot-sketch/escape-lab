import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ATTEMPT_KEY, DECISION, apiCall, chooseCorrectOption, expireAttemptInDb, resetDemo, sessionToken, startMissionViaUi, submit } from './support/helpers';
import { MISSION_BY_ID, correctResponse } from './support/content';

const review = (page: Page) => page.locator('.step-review');
const continueButton = (page: Page) => page.getByRole('button', { name: /^(Continue|Continuer)$/ });

for (const width of [320, 390, 1280]) {
  test.describe(`step correction at ${width}px`, () => {
    test.use({ viewport: { width, height: width === 320 ? 568 : 900 }, hasTouch: width < 500 });
    test.beforeEach(async ({ page }) => { await resetDemo(page); });

    test('a saved answer keeps its own question, response and explanation until Continue, in French and English', async ({ page }, testInfo) => {
      await startMissionViaUi(page, 'Hematology Lab', 'Anemia Detective');
      let answers = 0;
      let hints = 0;
      page.on('request', (request) => {
        if (request.method() !== 'POST') return;
        if (request.url().endsWith('/answer')) answers += 1;
        if (request.url().endsWith('/hint')) hints += 1;
      });
      const prompt = await page.locator('#case-prompt').innerText();
      await page.locator('.answer-options button').filter({ hasText: 'Microcytic' }).click();
      await submit(page).click();
      await expect(review(page)).toContainText('Step 1 correct.');
      await expect(review(page).getByRole('heading')).toBeFocused();
      await expect(page.locator('#case-prompt')).toHaveText(prompt);
      await expect(page.locator('.review-answer')).toContainText('Microcytic');
      await expect(page.locator('.review-explanation')).toContainText('average size of red blood cells');
      await expect(page.locator('.answer-options')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toHaveCount(0);
      await expect(page.locator('.value').filter({ hasText: 'Ferritin' })).toHaveCount(0);
      await expect(page.getByRole('progressbar', { name: 'Mission progress' })).toHaveAttribute('aria-valuenow', '1');
      const token = await sessionToken(page);
      const attemptId = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
      const saved = await apiCall(token, `/attempts/${attemptId}`);
      expect(saved.body.step.ordinal).toBe(2);
      expect(saved.body.stepsSolved).toBe(1);
      expect(answers).toBe(1);
      const timer = await page.getByRole('timer').innerText();
      await expect(page.getByRole('timer')).not.toHaveText(timer);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(review(page)).toBeVisible();
      await page.getByRole('button', { name: 'Français' }).click();
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(review(page)).toContainText('Étape 1 correcte.');
      await expect(page.locator('.review-answer')).toContainText('Microcytaire');
      await expect(page.locator('.review-explanation')).toContainText('taille moyenne des globules rouges');
      expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
      const defects = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, targets: [...document.querySelectorAll('.review-explanation summary, .review-continue')].map((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })) }));
      expect(defects.overflow).toBeLessThanOrEqual(0);
      for (const target of defects.targets) { expect(target.height).toBeGreaterThanOrEqual(44); expect(target.width).toBeGreaterThanOrEqual(44); }
      await expect(review(page)).toHaveScreenshot(`correction-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
      const screenshot = testInfo.outputPath(`correction-${width}.png`);
      await page.screenshot({ path: screenshot, animations: 'disabled' });
      await testInfo.attach('Correction in French', { path: screenshot, contentType: 'image/png' });
      if (width < 500) await continueButton(page).tap(); else { await continueButton(page).focus(); await page.keyboard.press('Enter'); }
      await expect(review(page)).toHaveCount(0);
      await expect(page.locator('#case-prompt')).toBeFocused();
      await expect(page.locator('#case-prompt')).not.toHaveText(prompt);
      await expect(page.locator('.value').filter({ hasText: 'Ferritine' })).toHaveCount(1);
      await expect(submit(page)).toHaveCount(0); // the visible controls now use French
      await expect(page.getByRole('button', { name: 'Valider la réponse' })).toBeDisabled();
      expect(answers).toBe(1);
      expect(hints).toBe(0);
      await page.getByRole('button', { name: 'English' }).click();
      await chooseCorrectOption(page, 'hem-03', 1);
      await submit(page).click();
      await expect(review(page)).toContainText('Step 2 correct.');
      await continueButton(page).click();
      await chooseCorrectOption(page, 'hem-03', 2);
      await submit(page).click();
      await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
      await expect(review(page)).toHaveCount(0);
      await expect(page.locator('.result-explanation')).toContainText(MISSION_BY_ID.get('hem-03')!.steps[2]!.explanation);
      expect(answers).toBe(3);
    });
  });
}

test.describe('step correction lifecycle', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('a failed refresh preserves the correction and can recover without resubmitting', async ({ page }) => {
    await page.clock.install();
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    let answers = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/answer')) answers += 1; });
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    await page.route(`**/api/attempts/${id}`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'temporarily_unavailable', message: 'Temporary connection outage' } }) }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.sync-note')).toContainText('Could not refresh');
    await expect(review(page)).toBeVisible();
    await expect(page.locator('.review-answer')).toContainText('Reject and request a new sample');
    await page.unrouteAll({ behavior: 'wait' });
    await page.clock.runFor(1100); // Respect the real focus-refresh throttle.
    const recovered = page.waitForResponse((response) => response.url().endsWith(`/attempts/${id}`) && response.status() === 200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await recovered;
    await expect(page.locator('.sync-note')).toHaveCount(0);
    await expect(review(page)).toBeVisible();
    await continueButton(page).click();
    await expect(page.getByText('STEP 2 / 3', { exact: true })).toBeVisible();
    expect(answers).toBe(1);
  });

  test('a double Continue cannot skip a saved step or send another answer', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST') posts += 1; });
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    await continueButton(page).evaluate((el) => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await expect(review(page)).toHaveCount(0);
    await expect(page.getByText('STEP 2 / 3', { exact: true })).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await expect(page.locator('#case-prompt')).toBeFocused();
    expect(posts).toBe(1);
  });

  test('reloading during the correction resumes the server-saved next step and never resubmits', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/answer')) posts += 1; });
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    await expect(page.locator('.review-answer')).toContainText('Reject and request a new sample');
    await page.reload();
    await expect(page.getByText('STEP 2 / 3', { exact: true })).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
    expect(posts).toBe(1);
  });

  test('expiration during a correction shows Restart; it cannot submit or buy a hint for the solved step', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    expireAttemptInDb(id);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await expect(review(page)).toHaveCount(0);
    await expect(continueButton(page)).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Restart mission' }).click();
    await expect(page.getByText('STEP 1 / 3', { exact: true })).toBeVisible();
  });

  test('a more recent step saved elsewhere invalidates the old correction', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const token = await sessionToken(page);
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    const second = MISSION_BY_ID.get('hem-02')!.steps[1]!;
    expect((await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: second.id, response: correctResponse(second.key as never) } })).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('STEP 3 / 3', { exact: true })).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await expect(page.locator('#case-prompt')).toBeFocused();
  });

  test('a reset elsewhere closes the case and removes the obsolete correction', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    expect((await apiCall(await sessionToken(page), '/demo/reset', { method: 'POST' })).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert')).toContainText('This case is no longer available.');
    await expect(review(page)).toHaveCount(0);
    await expect(continueButton(page)).toHaveCount(0);
  });

  test('completion in another tab closes the old correction and shows the saved final explanation', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const token = await sessionToken(page);
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    const remaining = MISSION_BY_ID.get('hem-02')!.steps.slice(1);
    for (const step of remaining) expect((await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } })).status).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await expect(page.locator('.result-explanation')).toContainText(remaining.at(-1)!.explanation);
  });

  test('a paid hint on the next step preserves the old correction, then appears after Continue', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const token = await sessionToken(page);
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    const second = MISSION_BY_ID.get('hem-02')!.steps[1]!;
    expect((await apiCall(token, `/attempts/${id}/hint`, { method: 'POST', body: { stepId: second.id } })).status).toBe(200);
    const refreshed = page.waitForResponse((response) => response.url().endsWith(`/attempts/${id}`) && response.request().method() === 'GET');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(review(page)).toBeVisible();
    await expect(page.locator('.hint-result')).toHaveCount(0);
    await continueButton(page).click();
    await expect(page.locator('.hint-result')).toContainText(second.hints[0]!);
    await expect(page.getByText('Hints used on this step: 1 of 1.')).toBeVisible();
  });

  test('the countdown itself expires the saved next step while the correction is being read', async ({ page }) => {
    await page.clock.install();
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(review(page)).toBeVisible();
    const id = (await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!;
    expireAttemptInDb(id);
    await page.clock.fastForward(10 * 60 * 1000);
    await page.clock.runFor(600);
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await expect(continueButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Restart mission' })).toBeEnabled();
  });
});
