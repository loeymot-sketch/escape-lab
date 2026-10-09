import { expect, test, type Page } from '@playwright/test';
import { openFaculty, openHome, resetDemo } from './support/helpers';

const noOverflow = async (page: Page, label: string) => {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll, `${label} overflows horizontally at ${m.client}px`).toBeLessThanOrEqual(m.client);
};
const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

for (const width of [768, 375, 1440]) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test('every student page has no horizontal overflow and keeps its controls reachable', async ({ page }) => {
      await resetDemo(page);
      await noOverflow(page, 'dashboard');
      for (const [name, heading] of [['Lab map', 'Laboratory map'], ['Progress', 'Progress vault'], ['Lab results', 'Lab results'], ['Learning settings', 'Learning settings']] as const) {
        await nav(page, name);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        await expect(page.getByRole('status')).toHaveCount(0);
        await noOverflow(page, name);
      }
      await nav(page, 'Lab map');
      await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
      await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
      await noOverflow(page, 'lab lobby');
      await page.getByRole('button', { name: 'Replay Blood Smear Code' }).click();
      await expect(page.locator('.case-panel h1')).toBeVisible();
      await noOverflow(page, 'mission');
      await expect(page.getByRole('button', { name: 'Ask Lab Assistant' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Submit answer' })).toBeVisible();
      await expect(page.getByRole('button', { name: '← Exit mission' })).toBeVisible();
    });

    test('faculty pages have no horizontal overflow and their actions are reachable', async ({ page }) => {
      await openHome(page);
      if (width <= 600) await page.getByRole('button', { name: 'Guest options' }).click();
      await openFaculty(page);
      await noOverflow(page, 'analytics');
      await nav(page, 'Student detail');
      await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
      await noOverflow(page, 'student detail');
      await nav(page, 'Content review');
      const row = page.locator('.content-row').filter({ hasText: 'Blood Smear Code' });
      await expect(row.getByRole('button', { name: 'Mark reviewed' })).toBeVisible();
      await noOverflow(page, 'content review');
      if (width <= 600) await page.getByRole('button', { name: 'Guest options' }).click();
      await expect(page.getByRole('button', { name: 'Student guest' })).toHaveCount(0); // R9-C-10: one entry point back to the student demo
      await expect(page.getByRole('button', { name: 'Return to student demo' })).toBeVisible();
    });
  });
}

test.describe('768px', () => {
  test.use({ viewport: { width: 768, height: 1024 } });
  test('the guest actions stay in the side rail (no menu is needed)', async ({ page }) => {
    await resetDemo(page);
    await expect(page.getByRole('button', { name: 'Guest options' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeVisible();
  });
});
