import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resetDemo, startMissionViaUi, submit } from './support/helpers';

const noOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(size.content).toBeLessThanOrEqual(size.viewport);
};

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [568, 320], [667, 375], [768, 1024], [844, 390], [1280, 900]] as const) {
  test.describe(`observation images at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: width <= 430 ? 3 : 1, hasTouch: width <= 844 });
    test.beforeEach(async ({ page }) => { await resetDemo(page); });

    if (height >= 500) test('laboratories are visible first; compact statistics and the demo note follow them', async ({ page }) => {
      await noOverflow(page);
      const firstScene = (await page.locator('.lab-strip .lab-card-scene').first().boundingBox())!;
      const firstName = (await page.locator('.lab-strip h2').first().boundingBox())!;
      expect(firstScene.y).toBeLessThan(height - 90);
      expect(firstName.y).toBeLessThan(height);
      const lastLab = (await page.locator('.lab-strip .lab-card').last().boundingBox())!;
      const stats = (await page.locator('.dashboard-stats').boundingBox())!;
      const guide = (await page.locator('.how-it-works').boundingBox())!;
      const demo = (await page.locator('.demo-note').boundingBox())!;
      expect(stats.y).toBeGreaterThanOrEqual(lastLab.y + lastLab.height);
      expect(stats.height).toBeLessThan(150);
      expect(demo.y).toBeGreaterThanOrEqual(guide.y + guide.height);
    });

    test('all four photos retain their pixels and can be inspected without changing an association', async ({ page }, testInfo) => {
      await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
      const images = page.locator('.culture-thumb img');
      await expect(images).toHaveCount(4);
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
        const metrics = await image.evaluate((el) => {
          const img = el as HTMLImageElement;
          const box = img.getBoundingClientRect();
          return { width: box.width, height: box.height, natural: [img.naturalWidth, img.naturalHeight], fit: getComputedStyle(img).objectFit, source: img.currentSrc, alt: img.alt };
        });
        expect(metrics.natural).toEqual([720, 720]);
        expect(Math.abs(metrics.width - metrics.height)).toBeLessThan(0.5);
        expect(metrics.width).toBeGreaterThanOrEqual(90);
        expect(metrics.fit).toBe('contain');
        expect(`${metrics.source} ${metrics.alt}`).not.toMatch(/escherichia|staphylococcus|streptococcus|proteus|pseudomonas/i);
      }
      await noOverflow(page);
      const collisions = await page.locator('.match-row').evaluateAll((rows) => rows.flatMap((row) => {
        const observation = row.querySelector('.match-evidence')!.getBoundingClientRect();
        const select = row.querySelector('select')!.getBoundingClientRect();
        const overlaps = observation.left < select.right - 1 && select.left < observation.right - 1 && observation.top < select.bottom - 1 && select.top < observation.bottom - 1;
        return overlaps ? ['observation overlaps association control'] : [];
      }));
      expect(collisions).toEqual([]);
      await page.locator('select').first().selectOption('ecoli');

      const matchingShot = testInfo.outputPath(`matching-${width}.png`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: matchingShot, fullPage: true, animations: 'disabled' });
      await testInfo.attach('Matching layout', { path: matchingShot, contentType: 'image/png' });

      for (const language of ['en', 'fr'] as const) {
        if (language === 'fr') {
          await page.getByRole('button', { name: 'Français' }).click();
          await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
        }
        const opener = page.getByRole('button', { name: language === 'fr' ? /^Examiner l’image/ : /^Inspect image:/ }).first();
        const originalOverflow = await page.evaluate(() => document.body.style.overflow);
        if (language === 'en') {
          if (width <= 844) await opener.tap(); else await opener.click();
        } else {
          await opener.focus();
          await page.keyboard.press('Enter');
        }
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
        await expect(dialog.getByRole('heading')).toContainText(language === 'fr' ? 'Colonies roses' : 'Pink colonies');
        const photo = dialog.locator('.culture-viewer-photo');
        await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
        const frame = (await dialog.boundingBox())!;
        const image = (await photo.boundingBox())!;
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(width + 1);
        expect(frame.y + frame.height).toBeLessThanOrEqual(height + 1);
        expect(Math.abs(image.width - image.height)).toBeLessThan(0.5);
        expect(image.width).toBeGreaterThan(200);
        expect(image.x).toBeGreaterThanOrEqual(frame.x);
        expect(image.x + image.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(image.y).toBeGreaterThanOrEqual(frame.y);
        expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height);
        expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Shift+Tab');
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await page.locator('select').first().evaluate((el) => (el as HTMLSelectElement).focus());
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await noOverflow(page);
        if (language === 'fr') {
          const shot = testInfo.outputPath(`inspection-${width}.png`);
          await page.screenshot({ path: shot, animations: 'disabled' });
          await testInfo.attach('Image inspection in French', { path: shot, contentType: 'image/png' });
          expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(opener).toBeFocused();
        await expect(page.locator('select').first()).toHaveValue('ecoli');
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
      }
    });
  });
}

test.describe('observation recovery and association guidance', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('a failed photo keeps its description and association; Retry restores the image', async ({ page }) => {
    let unavailable = true;
    await page.route('**/culture-observation-01.webp*', (route) => unavailable ? route.fulfill({ status: 503, body: '' }) : route.continue());
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const row = page.locator('.match-row').first();
    await expect(row.getByRole('button', { name: /^Retry image for/ })).toBeVisible();
    await expect(row.locator('label')).toContainText('Pink colonies');
    await row.locator('select').selectOption('ecoli');
    unavailable = false;
    await row.getByRole('button', { name: /^Retry image for/ }).click();
    await expect.poll(() => row.locator('.culture-thumb img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(row.locator('select')).toHaveValue('ecoli');
    await row.getByRole('button', { name: /^Inspect image:/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(row.locator('select')).toHaveValue('ecoli');
    const opener = row.getByRole('button', { name: /^Inspect image:/ });
    await opener.click();
    await page.mouse.click(0, 0);
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a photo that fails while its viewer is open can be retried without losing focus or associations', async ({ page }) => {
    let unavailable = true;
    let release: () => void = () => undefined;
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/culture-observation-02.webp*', async (route) => {
      await responseGate;
      return unavailable ? route.fulfill({ status: 503, body: '' }) : route.continue();
    });
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    await page.locator('select').nth(1).selectOption('spyo');
    await page.locator('.culture-thumb').nth(1).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByRole('alert')).toContainText('Your associations are kept.');
    unavailable = false;
    await dialog.getByRole('button', { name: 'Retry image', exact: true }).click();
    await expect.poll(() => dialog.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Close image viewer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('select').nth(1)).toHaveValue('spyo');
    await expect(page.locator('.culture-thumb').nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('each duplicated association has a local explanation which disappears after correction', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const selects = page.locator('select');
    await selects.nth(0).selectOption('ecoli');
    await selects.nth(1).selectOption('ecoli');
    for (const index of [0, 1]) {
      await expect(selects.nth(index)).toHaveAttribute('aria-invalid', 'true');
      await expect(selects.nth(index)).toHaveAccessibleDescription('Already used for another observation.');
    }
    await expect(submit(page)).toBeDisabled();
    await selects.nth(1).selectOption('spyo');
    await expect(page.locator('.match-duplicate')).toHaveCount(0);
    await expect(selects.nth(0)).toHaveAttribute('aria-invalid', 'false');
    await expect(selects.nth(1)).toHaveAttribute('aria-invalid', 'false');
  });
});
