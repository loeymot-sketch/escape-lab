import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, clickArtwork, moveContent, prepareContentStatus, startMissionViaUi, statusPill, DECISION, HOME_HEADING } from './support/helpers';

test.describe('Escape Lab critical paths', () => {
  async function resetDemoStudent(page: import('@playwright/test').Page) {
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('escape-demo-token'))).toBeTruthy();
    await page.evaluate(async () => {
      const token = sessionStorage.getItem('escape-demo-token');
      sessionStorage.removeItem('escape-demo-attempt');
      const response = await fetch('http://localhost:3000/api/demo/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`demo reset failed: ${response.status} ${await response.text()}`);
    });
    await page.reload();
    await page.getByRole('heading', { name: HOME_HEADING }).waitFor();
  }

  async function openMission(page: import('@playwright/test').Page, missionId: string) {
    await page.evaluate(async (id) => {
      const token = sessionStorage.getItem('escape-demo-token');
      const response = await fetch(`http://localhost:3000/api/missions/${id}/start`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`mission start failed: ${response.status}`);
      const payload = await response.json();
      sessionStorage.setItem('escape-demo-attempt', payload.attempt.attemptId);
    }, missionId);
    await page.reload();
  }

  test('student reaches dashboard, progress vault and guest preferences', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Content review' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Milestones', exact: true })).toBeVisible();
    await expect(page.getByTestId('badge-count')).toHaveText(/^\d+ of \d+ earned$/);
    await expect(page.getByText('Leaderboard')).toBeVisible();
    await page.getByRole('button', { name: 'Learning settings' }).click();
    await expect(page.getByText('Learning environment')).toBeVisible();
    await expect(page.getByText(/No personal account or learner profile is created/)).toBeVisible();
    await expect(page.getByText('Alex Martin')).toHaveCount(0);
    await page.getByRole('button', { name: 'Lab results' }).click();
    await expect(page.getByRole('heading', { name: 'Lab results' })).toBeVisible();
    await expect(page.locator('.crumb')).toHaveText('Lab results');
    await page.getByRole('button', { name: 'Reset guest session' }).click();
    await page.getByRole('button', { name: 'Confirm reset' }).click();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
  });

  test('profile preference failure is announced and rolled back', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.getByRole('button', { name: 'Learning settings' }).click();
    const sound = page.getByRole('checkbox', { name: 'Reduce motion' });
    const initial = await sound.isChecked();
    await page.route('**/api/profile', async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary profile failure' } }) });
    });
    await sound.click();
    await expect(page.getByRole('alert')).toContainText('Temporary profile failure');
    await expect(sound).toBeChecked({ checked: initial });
  });

  test('faculty reaches cohort analytics and roster', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Investigations' })).toHaveCount(0);
    await expect(page.getByText('MISSION SIGNAL')).toBeVisible();
    await expect(page.getByText('ROSTER')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await page.getByRole('button', { name: 'Return to student demo' }).click();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Content review' })).toHaveCount(0);
  });

  test('mission state survives a browser refresh', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await expect(page.getByText('STEP 1 / 1')).toBeVisible();
    await page.reload();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await expect(page.getByText('STEP 1 / 1')).toBeVisible();
  });

  test('student can request a server hint and keep the attempt active', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeVisible();
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await expect(page.getByText(/STEP 1 \/ 1/)).toBeVisible();
  });

  test('hint request is single-flight while the server is slow', async ({ page }) => {
    let requests = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/hint', async route => {
      requests += 1;
      await gate; // held until the test has observed the pending state, so no clock is involved
      await route.continue();
    });
    await page.goto('/');
    await resetDemoStudent(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    const pendingHint = page.getByRole('button', { name: 'Requesting hint…' });
    await expect(pendingHint).toBeDisabled();
    await pendingHint.click({ force: true });
    release();
    await expect(page.locator('.hint-result')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeEnabled();
    expect(requests).toBe(1);
  });

  test('point engine supports wrong answer, retry and server result', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const image = page.getByRole('button', { name: 'Select a point on the scientific image' });
    await image.click({ position: { x: 20, y: 20 } });
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Not quite.')).toBeVisible();
    await clickArtwork(page, ARTWORK.smear);
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.getByText('Server-calculated')).toBeVisible();
  });

  test('browser requests cannot forge score, timer or lab unlock state', async ({ page }) => {
    await page.goto('/');
    const proof = await page.evaluate(async () => {
      const registered = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Browser Tamper Probe', email: `tamper-${Date.now()}@example.test`, password: 'browser tamper password' }),
      });
      const token = (await registered.json()).token as string;
      const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      const request = async (path: string, body?: unknown) => {
        const response = await fetch(`http://localhost:3000/api${path}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
      };
      const started = await request('/missions/hem-01/start');
      const attempt = started.body.attempt;
      const forgedAnswer = await request(`/attempts/${attempt.attemptId}/answer`, {
        stepId: attempt.step.id,
        response: { x: 62, y: 41 },
        score: 999999,
        elapsedSec: 0,
        timeLimitSec: 999999,
        penalties: -999999,
      });
      const current = await fetch(`http://localhost:3000/api/attempts/${attempt.attemptId}`, { headers }).then(async response => ({ status: response.status, body: await response.json() }));
      const forgedUnlock = await request('/labs/hematology/unlock', { code: '742', unlocked: true, score: 999999 });
      const earlyUnlock = await request('/labs/hematology/unlock', { code: '742' });
      return { forgedAnswer, current, forgedUnlock, earlyUnlock };
    });
    expect(proof.forgedAnswer.status).toBe(400);
    expect(proof.current.status).toBe(200);
    expect(proof.current.body.wrongTotal).toBe(0);
    expect(proof.current.body.elapsedSec).toBeLessThan(60);
    expect(proof.forgedUnlock.status).toBe(400);
    expect(proof.earlyUnlock.status).toBe(409);
    expect(proof.earlyUnlock.body.error.code).toBe('vault_incomplete');
  });

  test('decision and stepper engines expose selectable answer controls', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await openMission(page, 'hem-02');
    await expect(page.getByText('What do you do?')).toBeVisible();
    await page.getByRole('button', { name: DECISION.reject }).click();
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Sample 2')).toBeVisible();
    await page.getByRole('button', { name: DECISION.repeat }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByText('Sample 3')).toBeVisible();
    await page.getByRole('button', { name: DECISION.accept }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await openMission(page, 'hem-03');
    await expect(page.getByText('Classify the anemia by red cell size.')).toBeVisible();
    await page.getByRole('button', { name: /Microcytic/ }).click();
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('button', { name: /Iron deficiency anemia/ }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('button', { name: /Evaluate for a source/ }).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('order and matching engines expose keyboard-friendly controls', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await openMission(page, 'mic-02');
    await expect(page.getByText(/Put the Gram stain steps/)).toBeVisible();
    await page.getByRole('button', { name: 'Move down' }).first().click();
    await page.locator('.drag-row').filter({ hasText: 'Crystal violet' }).getByRole('button', { name: 'Move up' }).click();
    await page.locator('.drag-row').filter({ hasText: 'Crystal violet' }).getByRole('button', { name: 'Move up' }).click();
    await page.locator('.drag-row').filter({ hasText: 'Decolorize' }).getByRole('button', { name: 'Move up' }).click();
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await openMission(page, 'mic-03');
    await expect(page.locator('select').first()).toBeVisible();
    await page.locator('select').nth(0).selectOption('ecoli');
    await page.locator('select').nth(1).selectOption('spyo');
    await page.locator('select').nth(2).selectOption('proteus');
    await page.locator('select').nth(3).selectOption('pseudo');
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('faculty can inspect a student and review content', async ({ page }) => {
    // The review state is the server's and shared: start from a known one, then walk the whole workflow.
    await prepareContentStatus('hem-01', 'draft');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.getByRole('button', { name: 'Student detail' }).click();
    await expect(page.getByRole('heading', { name: 'Student detail' })).toBeVisible();
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    await page.getByRole('button', { name: 'Content review' }).click();
    await expect(page.getByRole('heading', { name: 'Content review' })).toBeVisible();
    await expect(page.getByText('SCIENTIFIC GOVERNANCE')).toBeVisible();
    await expect(page.getByTestId('approval-note')).toContainText('“Approved” is a faculty workflow flag in this demonstration. It is not a biomedical or scientific validation');
    // The notes under the page intro are stacked, never layered on top of each other (the demonstration note pulls itself up with a negative margin).
    const stack = [page.getByRole('heading', { name: 'Content review' }), page.locator('.faculty-demo-note'), page.getByTestId('approval-note')];
    const boxes = await Promise.all(stack.map((item) => item.boundingBox()));
    for (let n = 1; n < boxes.length; n += 1) expect(boxes[n]!.y, `block ${n} starts below block ${n - 1}`).toBeGreaterThanOrEqual(boxes[n - 1]!.y + boxes[n - 1]!.height - 0.5);
    const firstRow = page.locator('.content-row').filter({ hasText: 'Blood Smear Code' });
    await expect(firstRow).toHaveCount(1);
    await expect(statusPill(firstRow)).toHaveText('Draft');
    await expect(firstRow.getByRole('button', { name: 'Mark reviewed' })).toBeVisible();
    await moveContent(page, firstRow, 'Mark reviewed', 'reviewed');
    await moveContent(page, firstRow, 'Approve', 'approved');
    await moveContent(page, firstRow, 'Return to draft', 'draft');
  });

  test('critical student pages remain usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('critical student flow has no page or console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('point engine is operable without a mouse', async ({ page }) => {
    await page.goto('/');
    await resetDemoStudent(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const image = page.getByRole('button', { name: 'Select a point on the scientific image' });
    await image.focus();
    await image.press('ArrowRight');
    await image.press('ArrowDown');
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
  });

  test('tablet viewport and reduced motion remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('student dashboard has no automated accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    const missionResults = await new AxeBuilder({ page }).analyze();
    expect(missionResults.violations).toEqual([]);
  });

  test('student dashboard remains usable under controlled slow network', async ({ page }) => {
    await page.route('**/api/dashboard', async route => {
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.route('**/api/labs', async route => {
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Lab map' })).toBeVisible();
  });

  test('student can retry a transient dashboard failure without losing the session', async ({ page }) => {
    // The dev server mounts every page effect twice (StrictMode), so the outage lasts until the test lifts it.
    let outage = true;
    await page.route('**/api/dashboard', async route => {
      if (!outage) return route.continue();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary dashboard outage' } }) });
    });
    await page.goto('/');
    await expect(page.getByText('Temporary dashboard outage')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Temporary dashboard outage');
    outage = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lab map' })).toBeVisible();
  });

  test('keyboard focus shows the real ring (3px dark teal with a white halo)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    // Reach the first navigation button the way a keyboard user does, so :focus-visible really applies.
    const enter = page.getByRole('button', { name: 'Investigations' });
    await expect(enter).not.toBeFocused();
    // The first tab stop is the skip link; it jumps past the sidebar to the page content.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
    // Back at the top of a fresh page, the next stop after the skip link is the first navigation button.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(enter).toBeFocused();
    const ring = await enter.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, offset: parseFloat(style.outlineOffset) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(3);
    expect(ring.color).toBe('rgb(10, 79, 82)');
    expect(ring.offset).toBeGreaterThanOrEqual(2);
    // The white halo eases in with the control's transition, so it is awaited rather than read at an arbitrary instant.
    await expect.poll(() => enter.evaluate((element) => getComputedStyle(element).boxShadow)).toContain('rgb(255, 255, 255)');
    // A control that is not focused has no ring at all.
    const resting = await page.getByRole('button', { name: 'Lab map' }).evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(resting).toBe('none');
  });
});
