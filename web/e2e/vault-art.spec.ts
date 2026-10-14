import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apiCall, completeLabViaApi, navigateSection, patched, resetDemo } from './support/helpers';
import { exitCode } from './support/content';

async function vaultGeometry(page: Page) {
  const cards = page.locator('.vault-card');
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    const img = card.locator('.vault-door');
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
    await expect(img).toHaveAttribute('alt', '');
    await expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(await card.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const image = el.querySelector('img')!.getBoundingClientRect();
      const content = [...el.querySelectorAll('.vault-card-head,.code-slots,small')];
      return content.every((item) => {
        const r = item.getBoundingClientRect();
        return r.left >= image.right + 8 && r.right <= box.right - 10 && item.scrollWidth <= item.clientWidth + 1;
      }) && image.top >= box.top && image.bottom <= box.bottom && el.scrollWidth <= el.clientWidth;
    })).toBe(true);
    const slots = await card.locator('.code-slots>span').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect(); return { top: r.top, right: r.right, left: r.left, width: r.width };
    }));
    expect(new Set(slots.map((s) => s.top)).size).toBe(1);
    for (let i = 0; i < slots.length; i++) {
      expect(slots[i]!.width).toBeGreaterThanOrEqual(29);
      if (i) expect(slots[i]!.left - slots[i - 1]!.right).toBeGreaterThanOrEqual(5);
    }
  }
  const hero = page.locator('.vault-hero');
  expect(await hero.evaluate((el) => {
    const image = el.querySelector('img')!.getBoundingClientRect();
    const copy = el.querySelector('.vault-hero-copy')!.getBoundingClientRect();
    const asset = el.querySelector('img')!;
    return asset.naturalWidth === 1400 && asset.naturalHeight === 934 && getComputedStyle(asset).objectFit === 'contain' && Math.abs(image.width / image.height - 1400 / 934) < .001 && copy.top >= image.bottom - .5;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

for (const width of [320, 390, 768, 1280]) test(`illustrated vault ${width}: server fragments, doors and readable French/English`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const token = await resetDemo(page);
  const before = (await apiCall(token, '/vault')).body;
  const writes: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(r.url()); });
  await navigateSection(page, 'Vault');
  for (const lang of ['English', 'Français']) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    await expect(page.locator('main h1')).toHaveText(lang === 'English' ? 'Progress vault' : 'Coffre de progression');
    await vaultGeometry(page);
    const cards = page.locator('.vault-card');
    for (let i = 0; i < before.vaults.length; i++) {
      const digits = await cards.nth(i).locator('.code-slots>span>span:last-child').allTextContents();
      expect(digits).toEqual(before.vaults[i].slots.map((d: number | null) => d === null ? '·' : String(d)));
    }
    for (const [i, name] of ['hematology-door', 'microbiology-door', 'biochemistry-door', 'master'].entries()) {
      await expect(cards.nth(i).locator('img')).toHaveAttribute('src', new RegExp(`lab-${name}\\.webp`));
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(`vault-art-${lang === 'English' ? 'en' : 'fr'}-${width}.png`, { fullPage: true, animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  }
  expect(writes).toEqual([]);
  expect((await apiCall(token, '/vault')).body).toEqual(before);
});

test('Master door only opens after its exit is earned; full code and form at320', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const token = await resetDemo(page);
  await navigateSection(page, 'Vault');
  const master = page.locator('.vault-card').filter({ hasText: 'Master Lab' });
  await expect(master.locator('img')).toHaveAttribute('src', /lab-master\.webp/);
  await completeLabViaApi(token, 'microbiology');
  await completeLabViaApi(token, 'biochemistry');
  await page.reload();
  await navigateSection(page, 'Vault');
  await expect(master.locator('img')).toHaveAttribute('src', /lab-master\.webp/);
  await expect(master.locator('.code-slots>span')).toHaveCount(4);
  await expect(master.locator('.vault-card-head')).toContainText('NOT STARTED');
  await completeLabViaApi(token, 'master', false);
  await page.reload();
  await navigateSection(page, 'Vault');
  await expect(master.locator('.vault-card-head')).toContainText('READY');
  await vaultGeometry(page);
  await controlsFit(page);
  await master.scrollIntoViewIfNeeded();
  await expect(master).toHaveScreenshot('master-ready-320.png', { animations: 'disabled', scale: 'css' });
  await master.getByRole('textbox').fill('0000');
  await master.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(master.getByRole('alert')).toBeVisible();
  await controlsFit(page);
  await master.getByRole('textbox').fill(exitCode('master'));
  await master.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(master.locator('.vault-card-head')).toContainText('ESCAPED');
  await expect(master.locator('img')).toHaveAttribute('src', /lab-master-open\.webp/);
  await expect(master).toBeFocused();
  await vaultGeometry(page);
  await controlsFit(page);
  expect((await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'master').exited).toBe(true);
  await expect(master).toHaveScreenshot('master-escaped-320.png', { animations: 'disabled', scale: 'css' });
});

test('coming-soon Master stays closed; unknown discipline has no guessed picture', async ({ page }) => {
  await resetDemo(page);
  let unknown = false;
  await page.route('**/api/labs', (route) => patched(route, (body) => ({ ...body, labs: body.labs.map((lab: { slug: string }) => lab.slug === 'master' ? { ...lab, state: 'coming_soon', ...(unknown ? { discipline: 'unknown' } : {}) } : lab) })));
  await navigateSection(page, 'Vault');
  const master = page.locator('.vault-card').filter({ hasText: 'Master Lab' });
  await expect(master.locator('img')).toHaveAttribute('src', /lab-master\.webp/);
  unknown = true;
  await page.reload();
  await navigateSection(page, 'Vault');
  await expect(master.locator('img')).toHaveCount(0);
  await expect(master.locator('.code-slots>span')).toHaveCount(4);
  await expect(master.locator('.vault-card-head')).toContainText('NOT STARTED');
});

async function controlsFit(page: Page) {
  expect(await page.locator('.vault-card').evaluateAll((cards) => cards.every((card) => {
    const frame = card.getBoundingClientRect();
    return [...card.querySelectorAll('.unlock-row,input,button,.notice')].every((el) => {
      const r = el.getBoundingClientRect();
      return r.left >= frame.left + 10 && r.right <= frame.right - 10 && el.scrollWidth <= el.clientWidth + 1;
    });
  }))).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test('an unavailable decorative door does not prevent the real vault unlock', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  let failedImages = 0;
  await page.route('**/lab-biochemistry-door.webp*', (route) => {
    if (route.request().resourceType() !== 'image') return route.continue();
    failedImages++;
    return route.abort();
  });
  const token = await resetDemo(page);
  await completeLabViaApi(token, 'biochemistry', false);
  await navigateSection(page, 'Vault');
  const card = page.locator('.vault-card').filter({ hasText: 'Clinical Biochemistry Lab' });
  await expect(card.locator('.vault-card-head')).toContainText('READY');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => failedImages).toBeGreaterThan(0);
  await expect.poll(() => card.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth === 0)).toBe(true);
  await controlsFit(page);
  const input = card.getByRole('textbox');
  await input.fill(exitCode('biochemistry'));
  await card.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(card.locator('.vault-card-head')).toContainText('ESCAPED');
  await expect(card).toBeFocused();
  expect((await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'biochemistry').exited).toBe(true);
  await expect(input).toHaveCount(0);
  await controlsFit(page);
});
