// The result screen's celebration layer (E2/E3): a score count-up that settles on the server figure, a first-try stat, an XP-gain
// pill only when XP was really added, and an immediate figure under the server-owned reduce-motion preference.
import { expect, test } from '@playwright/test';
import { ATTEMPT_KEY, apiCall, resetDemo } from './support/helpers';
import { MISSION_BY_ID, correctResponse } from './support/content';

/** Plays bio-01 through the public API (the demo learner has not completed it, so the replay beats no best and is a new best). */
async function completed(token: string, missionId: string) {
  const start = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  expect([200, 201]).toContain(start.status);
  const id = start.body.attempt.attemptId as string;
  let last: { status: number; body: { result?: unknown } } = { status: 0, body: {} };
  for (const step of MISSION_BY_ID.get(missionId)!.steps) {
    last = await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
    expect(last.status).toBe(200);
  }
  return { id, result: (await apiCall(token, `/attempts/${id}/result`)).body as { score: number; maxScore: number; xpAwarded: number; newBest: boolean; stats: { firstTrySteps: number; steps: number } } };
}

test('the score counts up to the server figure, the first-try stat and the XP pill follow the result', async ({ page }) => {
  const token = await resetDemo(page);
  const { id, result } = await completed(token, 'bio-01');
  expect(result.newBest).toBe(true);
  expect(result.xpAwarded).toBeGreaterThan(0);
  await page.evaluate(([key, value]) => sessionStorage.setItem(key!, value!), [ATTEMPT_KEY, id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  const score = page.locator('.result-score-top b');
  // Settles on the server score (never above it) within the animation time.
  await expect(score).toHaveText(new RegExp(`^${result.score}\\s*/ ${result.maxScore} XP$`), { timeout: 3_000 });
  await expect(page.locator('.result-stats .stat').filter({ hasText: 'First-try steps' }).locator('strong')).toHaveText(`${result.stats.firstTrySteps} of ${result.stats.steps}`);
  await expect(page.locator('.result-xp-note')).toHaveClass(/gained/);
  await expect(page.locator('.result-xp-note')).toContainText(`+${result.xpAwarded.toLocaleString('en')} XP`);
  // The filled bar is the server ratio.
  const ratio = await page.locator('.result-score-bar').evaluate((el) => el.querySelector('i')!.getBoundingClientRect().width / el.getBoundingClientRect().width);
  expect(Math.abs(ratio - result.score / result.maxScore)).toBeLessThan(0.02);
});

test('a replay that adds no XP gets no gain pill', async ({ page }) => {
  const token = await resetDemo(page);
  // Blood Smear Code is already completed by the demo learner with a high score: a slow replay cannot beat it... but speed can.
  // Fix the Sample (hem-02) has a stored best of 180/180 in the demo data: nothing can beat it.
  const { id, result } = await completed(token, 'hem-02');
  expect(result.newBest).toBe(false);
  await page.evaluate(([key, value]) => sessionStorage.setItem(key!, value!), [ATTEMPT_KEY, id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  await expect(page.locator('.result-xp-note')).not.toHaveClass(/gained/);
  await expect(page.locator('.result-xp-note')).toContainText('did not beat your best score');
});

test('under the server-owned reduce-motion preference the score shows at once', async ({ page }) => {
  const token = await resetDemo(page);
  expect((await apiCall(token, '/profile', { method: 'PUT', body: { reduceMotion: true } })).status).toBe(200);
  const { id, result } = await completed(token, 'bio-01');
  await page.evaluate(([key, value]) => sessionStorage.setItem(key!, value!), [ATTEMPT_KEY, id]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  // Read immediately: no intermediate value is ever shown.
  const first = await page.locator('.result-score-top b').textContent();
  expect(first?.replace(/\s+/g, ' ')).toBe(`${result.score} / ${result.maxScore} XP`);
  await apiCall(token, '/profile', { method: 'PUT', body: { reduceMotion: false } });
});
