import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { completeMissionViaApi, freshStudent, openAs, resetDemo, startMissionViaUi, submit } from './support/helpers';

// R36 B36-001: Lab Value Hacker shows its stimulus (a table of laboratory values) as pixels only. A keyboard and
// screen-reader student needs the same facts as text and a way to choose a result without a pointer.
test.describe('Lab Value Hacker has a text version of its panel, solvable with the keyboard alone', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('the table, the selectable rows, a wrong row, then the right row, all from the keyboard', async ({ page }) => {
    const token = await freshStudent();
    await completeMissionViaApi(token, 'bio-01');
    await openAs(page, token);
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Lab Value Hacker');

    // The text version is announced from the image control and opens with the keyboard.
    await expect(page.locator('#point-help')).toContainText('text version');
    const summary = page.getByText('Text version of this image', { exact: true });
    await summary.focus();
    await page.keyboard.press('Enter');

    const table = page.getByRole('table', { name: /Chemistry panel/ });
    await expect(table).toBeVisible();
    // Every value a sighted student reads is in the accessibility tree: indices, results, units, ranges, flag.
    await expect(page.getByText('Hemolysis index 3+', { exact: true })).toBeVisible();
    const potassium = table.getByRole('row', { name: /Potassium/ });
    await expect(potassium).toContainText('6.4');
    await expect(potassium).toContainText('mmol/L');
    await expect(potassium).toContainText('3.5 - 5.1');
    await expect(potassium).toContainText('H');
    // The flag is spoken as a word (as in the other missions' value blocks), not as a bare letter.
    await expect(potassium).toContainText('High');
    await expect(table.getByRole('row')).toHaveCount(9); // header + 8 analytes

    // Axe is clean with the section open.
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))).toEqual([]);

    // A wrong row, chosen and submitted without a pointer, costs the usual penalty and is refused by the server.
    const sodium = page.getByRole('button', { name: 'Select Sodium result' });
    await sodium.focus();
    await page.keyboard.press('Enter');
    await expect(sodium).toHaveAttribute('aria-pressed', 'true');
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Not quite.');

    // The right row is accepted by the SAME server check as a click on the image.
    const k = page.getByRole('button', { name: 'Select Potassium result' });
    await k.focus();
    await page.keyboard.press('Enter');
    await expect(k).toHaveAttribute('aria-pressed', 'true');
    await expect(sodium).toHaveAttribute('aria-pressed', 'false');
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('the controls stay at least 44 px tall and the page does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const token = await freshStudent();
    await completeMissionViaApi(token, 'bio-01');
    await openAs(page, token);
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Lab Value Hacker');
    await page.getByText('Text version of this image', { exact: true }).click();
    const buttons = page.getByRole('button', { name: /^Select .* result$/ });
    await expect(buttons).toHaveCount(8);
    for (const b of await buttons.all()) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the caption stays outside the scrolling region and a phone is told to swipe sideways (B37-004)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const token = await freshStudent();
    await completeMissionViaApi(token, 'bio-01');
    await openAs(page, token);
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Lab Value Hacker');
    await page.getByText('Text version of this image', { exact: true }).click();
    // The "not a real report" wording must be readable without scrolling sideways.
    await expect(page.locator('.point-text-scroll')).not.toContainText('not a real report');
    await expect(page.locator('.point-text-caption')).toContainText('not a real report');
    await expect(page.locator('.point-text-caption')).toBeInViewport();
    await expect(page.getByText('Swipe sideways to see every column.')).toBeVisible();
    await expect(page.getByRole('table', { name: /Chemistry panel/ })).toBeVisible();
  });

  test('in forced-colors mode the selected row is still visibly different from the others (B37-002)', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const token = await freshStudent();
    await completeMissionViaApi(token, 'bio-01');
    await openAs(page, token);
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Lab Value Hacker');
    await page.getByText('Text version of this image', { exact: true }).click();
    await page.getByRole('button', { name: 'Select Potassium result' }).click();
    const width = (name: string) => page.getByRole('button', { name }).evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth));
    expect(await width('Select Potassium result')).toBeGreaterThanOrEqual(3);
    expect(await width('Select Sodium result')).toBeLessThanOrEqual(1.5);
  });
});
