// The dashboard level strip shows the server's levelProgress figure and nothing the interface computed (E1).
import { expect, test } from '@playwright/test';
import { apiCall, resetDemo } from './support/helpers';

test('the level strip mirrors GET /dashboard user.levelProgress and names the next level', async ({ page }) => {
  const token = await resetDemo(page);
  const dashboard = (await apiCall(token, '/dashboard')).body as { user: { level: number; xp: number; levelProgress: { into: number; size: number } } };
  const bar = page.getByRole('progressbar', { name: 'Level progress' });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuemin', '0');
  await expect(bar).toHaveAttribute('aria-valuemax', String(dashboard.user.levelProgress.size));
  await expect(bar).toHaveAttribute('aria-valuenow', String(dashboard.user.levelProgress.into));
  const strip = page.locator('.level-strip');
  await expect(strip.locator('.level-badge b')).toHaveText(String(dashboard.user.level));
  await expect(strip.locator('.level-head b')).toHaveText(`${dashboard.user.xp.toLocaleString('en')} XP`);
  await expect(strip.locator('.level-head span')).toHaveText(`${(dashboard.user.levelProgress.size - dashboard.user.levelProgress.into).toLocaleString('en')} XP to level ${dashboard.user.level + 1}`);
  // The filled part of the bar is the server ratio, within a pixel.
  const ratio = await strip.locator('.level-bar').evaluate((el) => el.querySelector('i')!.getBoundingClientRect().width / el.getBoundingClientRect().width);
  expect(Math.abs(ratio - dashboard.user.levelProgress.into / dashboard.user.levelProgress.size)).toBeLessThan(0.02);
  // French: the same figures, the French wording.
  await page.getByRole('button', { name: 'Français', exact: true }).click();
  await expect(strip.locator('.level-head span')).toHaveText(`${(dashboard.user.levelProgress.size - dashboard.user.levelProgress.into).toLocaleString('fr-FR')} XP avant le niveau ${dashboard.user.level + 1}`);
  await expect(page.getByRole('progressbar', { name: 'Progression de niveau' })).toBeVisible();
  // Still the shared guest: the strip issued no write.
  expect((await apiCall(token, '/dashboard')).body).toEqual(dashboard);
});
