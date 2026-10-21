// WebKit smoke walk (projects `webkit-smoke` = Desktop Safari descriptor, `webkit-iphone13` = iPhone 13 descriptor on the WebKit engine).
// The same engine as Safari, run by Playwright: it proves the game loop renders and plays on WebKit; it is not a physical-device test.
import { expect, test } from '@playwright/test';
import { ARTWORK, apiCall, arrangeOrder, clickArtwork, navigateSection, openAttemptAt, resetDemo, sessionToken, submit, watchProblems } from './support/helpers';
import { MISSION_BY_ID } from './support/content';

const isTouch = (project: string) => /iphone/i.test(project);

test.describe('WebKit smoke', () => {
  test('the gate opens on the dashboard with the level strip and no page error', async ({ page }) => {
    const problems = watchProblems(page);
    await resetDemo(page);
    await expect(page.getByRole('heading', { name: 'Choose a laboratory' })).toBeVisible();
    await expect(page.locator('.lab-strip .lab-card')).toHaveCount(4);
    await expect(page.getByRole('progressbar', { name: 'Level progress' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('Blood Smear Code plays through to the result screen', async ({ page }, testInfo) => {
    const problems = watchProblems(page);
    await resetDemo(page);
    const touch = isTouch(testInfo.project.name);
    await navigateSection(page, 'Lab map', touch);
    const enter = page.getByRole('button', { name: /^(Enter|Review) Hematology/ });
    if (touch) await enter.tap(); else await enter.click();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    const replay = page.getByRole('button', { name: /^(Start|Resume|Replay) Blood Smear Code$/ });
    if (touch) await replay.tap(); else await replay.click();
    await expect(page.locator('.case-panel h1')).toHaveText(/schistocyte/);
    await clickArtwork(page, ARTWORK.smear);
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.locator('.result-score-top b')).toHaveText(/\d+\s*\/ 180 XP/, { timeout: 5_000 });
    expect(problems).toEqual([]);
  });

  test('the order engine reorders with the move buttons and reaches the result', async ({ page }) => {
    const problems = watchProblems(page);
    await resetDemo(page);
    await openAttemptAt(page, 'mic-02');
    const items = MISSION_BY_ID.get('mic-02')!.steps[0]!.data.items!;
    const key = (MISSION_BY_ID.get('mic-02')!.steps[0]!.key as { order: string[] }).order;
    await arrangeOrder(page, key.map((id) => items.find((item) => item.id === id)!.label));
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('vault, badges and the French interface render', async ({ page }, testInfo) => {
    const problems = watchProblems(page);
    await resetDemo(page);
    const touch = isTouch(testInfo.project.name);
    await navigateSection(page, 'Vault', touch);
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
    await expect.poll(() => page.locator('.vault-hero img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('.vault-card')).toHaveCount(4);
    await navigateSection(page, 'Badges', touch);
    await expect(page.locator('.badge-row')).toHaveCount(7);
    const fr = page.getByRole('button', { name: /^(FR|Français)$/ }).first();
    if (touch) await fr.tap(); else await fr.click();
    await expect(page.getByRole('heading', { name: 'Jalons' })).toBeVisible();
    await navigateSection(page, 'Salles', touch);
    await expect(page.getByRole('heading', { name: 'Choisissez un laboratoire' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the faculty guest opens its three screens', async ({ page }, testInfo) => {
    const problems = watchProblems(page);
    await resetDemo(page);
    const touch = isTouch(testInfo.project.name);
    await navigateSection(page, 'Faculty guest', touch);
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await navigateSection(page, 'Student detail', touch);
    await expect(page.getByRole('heading', { name: 'Student detail' })).toBeVisible();
    await navigateSection(page, 'Content review', touch);
    await expect(page.locator('.content-row')).toHaveCount(10);
    // The faculty guest consumed a demo login; give the shared student guest back to the next test.
    const token = await sessionToken(page);
    expect((await apiCall(token, '/me')).status).toBe(200);
    expect(problems).toEqual([]);
  });
});
