import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apiCall, completeLabViaApi, navigateSection, openFaculty, resetDemo, settle, slow, startMissionViaUi } from './support/helpers';

const menu = (page: Page) => page.getByRole('button', { name: /^(Guest options|Options invité)$/ });
const heading = (page: Page) => page.locator('main h1');
const footer = (page: Page) => page.locator('.game-primary-nav');
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}
async function panelsContainTheirCards(page: Page) {
  for (const [selector, parent] of [['.vault-card, .badge-row', '.vault-panel'], ['.vault-card .code-slots>span', '.vault-card']] as const) {
    const spills = await page.locator(selector).evaluateAll((items, parent) => items.flatMap((item) => {
      const panel = item.closest(parent);
      if (!panel) throw new Error('A progress card has no containing panel');
      const outer = panel.getBoundingClientRect(), inner = item.getBoundingClientRect(), style = getComputedStyle(panel);
      const left = outer.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
      const right = outer.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
      return inner.left < left - .5 || inner.right > right + .5
        ? [{ label: item.querySelector('b')?.textContent, actualLeft: inner.left, actualRight: inner.right, left, right }]
        : [];
    }), parent);
    expect(spills, 'cards remain inside their own panel content box, not merely the document').toEqual([]);
  }
}
async function stable(page: Page) {
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
  await expect(page.locator('main [role="status"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

for (const width of [320, 390, 600, 601, 768, 1280]) test(`game navigation and separate screens at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await resetDemo(page);
  await stable(page);
  const phone = width <= 600;
  if (phone) {
    await expect(footer(page)).toBeVisible();
    await expect(footer(page).getByRole('button')).toHaveCount(3);
    expect(await footer(page).getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(['Rooms', 'Vault', 'Badges']);
    const boxes = await footer(page).getByRole('button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    for (const box of boxes) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.x + box.width).toBeLessThanOrEqual(width); }
    expect(new Set(boxes.map((b) => b.y)).size).toBe(1);
    for (let i = 1; i < boxes.length; i++) expect(overlap(boxes[i - 1]!, boxes[i]!)).toBe(false);
    await expect(page.locator('.student-app>aside nav')).toBeHidden();
    const firstRoom = (await page.locator('.lab-strip .lab-card').first().boundingBox())!;
    expect(firstRoom.y, 'a real laboratory is present in the first view').toBeLessThan(360);
    const lang = (await page.locator('header .lang-switch').boundingBox())!;
    const menuBox = (await menu(page).boundingBox())!;
    expect(overlap(lang, menuBox)).toBe(false);
    expect(Math.abs(menuBox.x - firstRoom.x), 'menu aligns with the laboratory cards').toBeLessThanOrEqual(1);
    expect(Math.abs(lang.x + lang.width - firstRoom.x - firstRoom.width), 'language switch aligns with the laboratory cards').toBeLessThanOrEqual(1);
    await menu(page).click();
    const popover = page.locator('#guest-menu');
    await expect(popover).toBeVisible();
    await expect(popover).toHaveCSS('background-color', 'rgb(4, 24, 39)');
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(12);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
    expect(box.y + box.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
    await expect(popover.getByRole('navigation')).toHaveAccessibleName('More sections');
    for (const label of ['Lab map', 'Leaderboard', 'Lab results', 'Learning settings', 'About & demo guide']) {
      const control = popover.getByRole('button', { name: label, exact: true });
      await expect(control).toBeVisible();
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    if ([320, 390].includes(width)) await expect(page).toHaveScreenshot(`menu-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeFocused();
    await expect(popover).toHaveCount(0);
  } else {
    await expect(footer(page)).toBeHidden();
    await expect(page.locator('.student-app>aside nav button')).toHaveCount(8);
  }
  if ([320, 390, 1280].includes(width)) await expect(page).toHaveScreenshot(`rooms-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) requests.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  for (const [label, title, data, allowed] of [
    ['Vault', 'Progress vault', '.vault-card', ['/api/vault', '/api/labs']],
    ['Badges', 'Milestones', '.badge-row', ['/api/badges']],
    ['Leaderboard', 'Leaderboard', '.leaderboard-row', ['/api/leaderboard']],
  ] as const) {
    requests.length = 0;
    await navigateSection(page, label);
    await expect(heading(page)).toHaveText(title);
    await expect(heading(page)).toBeFocused();
    await expect(page).toHaveTitle(`${title} · Escape Lab`);
    await expect(page.locator(data).first()).toBeVisible();
    await stable(page);
    const ownRequests = requests.filter((r) => /\/api\/(vault|labs|badges|leaderboard)$/.test(r));
    expect(ownRequests.length).toBeGreaterThan(0);
    expect(ownRequests.filter((r) => !allowed.some((path) => r === `GET ${path}`))).toEqual([]);
    expect(requests.filter((r) => !r.startsWith('GET '))).toEqual([]);
    await expect(page.locator('.vault-card')).toHaveCount(label === 'Vault' ? 4 : 0);
    await expect(page.locator('.badge-row')).toHaveCount(label === 'Badges' ? 7 : 0);
    if (label !== 'Leaderboard') await expect(page.locator('.leaderboard-row')).toHaveCount(0);
    await noOverflow(page);
    await panelsContainTheirCards(page);
    if ([320, 390, 1280].includes(width)) {
      const screenshotOptions = { animations: 'disabled' as const, scale: 'css' as const, maxDiffPixelRatio: 0.002 };
      // Earned timestamps are server data, not layout. Mask only that volatile text;
      // the badge row, status, icons and all geometry remain under visual assertion.
      if (label === 'Badges') Object.assign(screenshotOptions, { mask: [page.locator('.badge-row time')] });
      await expect(page).toHaveScreenshot(`${label.toLowerCase()}-${width}.png`, screenshotOptions);
    }
    if (phone) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const end = (await page.locator('main').boundingBox())!;
      const bottom = (await footer(page).boundingBox())!;
      // Reserved space, not a screenshot mask: the last real card/text is above the actual fixed bar.
      const visibleBottom = await page.locator(data).last().evaluate((el) => el.getBoundingClientRect().bottom);
      expect(visibleBottom).toBeLessThan(bottom.y);
      expect(end.y + end.height).toBeGreaterThan(bottom.y + bottom.height);
      await expect(footer(page)).toBeInViewport({ ratio: 1 });
    }
  }
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test('the four laboratory cards form balanced rows at laptop and desktop widths', async ({ page }) => {
  for (const [width, expectedColumns] of [[1280, 2], [1440, 4]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await resetDemo(page);
    await stable(page);
    const cards = await page.locator('.lab-strip .lab-card').evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      return { x: Math.round(box.x), y: Math.round(box.y) };
    }));
    expect(cards).toHaveLength(4);
    const rows = [...new Set(cards.map(({ y }) => y))];
    expect(rows).toHaveLength(4 / expectedColumns);
    for (const y of rows) expect(cards.filter((card) => card.y === y)).toHaveLength(expectedColumns);
  }
});

test('French labels, active states and no new English text on the four game screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await resetDemo(page);
  await page.getByRole('button', { name: 'Français', exact: true }).click();
  for (const [label, title, key] of [['Salles', 'Choisissez un laboratoire', 'rooms'], ['Coffre', 'Coffre de progression', 'vault'], ['Badges', 'Jalons', 'badges'], ['Classement', 'Classement', 'leaderboard']] as const) {
    await navigateSection(page, label);
    await expect(heading(page)).toHaveText(title);
    await stable(page);
    expect(await page.locator('main').innerText()).not.toMatch(/Your achievements|recorded XP|discovered fragments|Loading your|All-time|earned|NOT STARTED/);
    await panelsContainTheirCards(page);
    await expect(page).toHaveScreenshot(`${key}-fr-320.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
    if (label !== 'Classement') await expect(footer(page).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
});

test('badge outage remains local; vault works and the real badge Retry recovers', async ({ page }) => {
  await resetDemo(page);
  let fail = true;
  await page.route('**/api/badges', (route) => fail ? route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: 'Badge service unavailable' } } }) : route.continue());
  await navigateSection(page, 'Vault');
  await expect(page.locator('.vault-card')).toHaveCount(4);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await navigateSection(page, 'Badges');
  await expect(page.getByRole('alert')).toContainText('Badge service unavailable');
  await expect(page.locator('.badge-row')).toHaveCount(0);
  await navigateSection(page, 'Vault');
  await expect(page.locator('.vault-card')).toHaveCount(4);
  await navigateSection(page, 'Badges');
  await expect(page.getByRole('alert')).toContainText('Badge service unavailable');
  fail = false;
  await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.badge-row')).toHaveCount(7);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('600/601 resize discards only the open menu/confirmation, not server progress', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await resetDemo(page);
  await navigateSection(page, 'Badges');
  const count = await page.getByTestId('badge-count').innerText();
  await menu(page).click();
  await page.getByRole('button', { name: 'Reset guest session', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 601, height: 700 });
  await expect(page.locator('#guest-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm reset', exact: true })).toHaveCount(0);
  await expect(footer(page)).toBeHidden();
  await expect(heading(page)).toBeFocused();
  await expect(page.getByTestId('badge-count')).toHaveText(count);
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(footer(page)).toBeVisible();
  await menu(page).click();
  await expect(page.getByRole('button', { name: 'Confirm reset', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('badge-count')).toHaveText(count);
});

test('600/601 resize restores hidden navigation focus but never steals visible content focus', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await resetDemo(page);
  await navigateSection(page, 'Badges');
  await stable(page);
  await footer(page).getByRole('button', { name: 'Badges', exact: true }).focus();
  await page.setViewportSize({ width: 601, height: 700 });
  await expect(heading(page)).toBeFocused();
  await page.locator('aside nav').getByRole('button', { name: 'Badges', exact: true }).focus();
  await page.setViewportSize({ width: 600, height: 700 });
  await expect(heading(page)).toBeFocused();
  await navigateSection(page, 'Learning settings');
  const control = page.getByRole('checkbox', { name: 'Reduce motion', exact: true });
  await control.focus();
  for (const width of [601, 600]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(control).toBeFocused();
  }
});

test('short phone menu scrolls above the real footer and preserves safe reset cancellation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await resetDemo(page);
  await menu(page).click();
  const popover = page.locator('#guest-menu');
  const box = (await popover.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  expect(await popover.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.getByRole('button', { name: 'Reset guest session', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Confirm reset', exact: true })).toHaveCount(0);
  await expect(menu(page)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeFocused();
  await menu(page).click();
  // A rotation within the mobile breakpoint must also recalculate the open menu.
  await page.setViewportSize({ width: 568, height: 375 });
  await expect(popover).toBeVisible();
  const close = popover.getByRole('button', { name: 'Close', exact: true });
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport({ ratio: 1 });
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  await close.click();
  await expect(menu(page)).toBeFocused();
  await expect(popover).toHaveCount(0);
  await noOverflow(page);
});

test('faculty keeps its own four sections; full-screen questions never inherit the bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemo(page);
  await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
  await expect(footer(page)).toHaveCount(0);
  await expect(page.locator('#case-prompt')).toBeVisible();
  await page.getByRole('button', { name: /Exit mission/ }).click();
  await expect(footer(page)).toBeVisible();
  await menu(page).click();
  const calls: string[] = [];
  page.on('request', (r) => calls.push(new URL(r.url()).pathname));
  await openFaculty(page);
  await expect(page.locator('.app>aside nav button')).toHaveCount(4);
  await expect(footer(page)).toHaveCount(0);
  for (const label of ['Rooms', 'Vault', 'Badges', 'Leaderboard']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  expect(calls.filter((p) => /^\/api\/(vault|badges|leaderboard)$/.test(p))).toEqual([]);
});

test('French menu geometry and contrast remain sound after scrolling back to the top', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await resetDemo(page);
  await page.getByRole('button', { name: 'Français', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 40));
  await menu(page).click();
  const popover = page.locator('#guest-menu');
  const before = (await popover.boundingBox())!;
  expect(before.y + before.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(async () => { const box = (await popover.boundingBox())!; return box.y + box.height; }).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  for (const label of ['Carte des laboratoires', 'Classement', 'Résultats des laboratoires', "Paramètres d'apprentissage", 'À propos et guide de démonstration']) {
    const control = popover.getByRole('button', { name: label, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeFocused();
  await noOverflow(page);
});

test('same-page game tab brings its real heading into view, without issuing mutations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemo(page);
  const methods: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) methods.push(r.method()); });
  for (const [label, title] of [['Rooms', 'Choose a laboratory'], ['Vault', 'Progress vault'], ['Badges', 'Milestones']] as const) {
    await navigateSection(page, label);
    await stable(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await navigateSection(page, label);
    await expect(heading(page)).toHaveText(title);
    await expect(heading(page)).toBeFocused();
    await expect(heading(page)).toBeInViewport({ ratio: 1 });
  }
  expect(methods.filter((m) => m !== 'GET')).toEqual([]);
});

test('the last keyboard control of Rooms, an exit form and the lobby clears the actual footer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const token = await resetDemo(page);
  await completeLabViaApi(token, 'biochemistry', false);
  await page.reload();
  for (const screen of ['Rooms', 'Vault', 'lobby']) {
    if (screen === 'lobby') {
      await navigateSection(page, 'Rooms');
      await page.getByRole('button', { name: 'Review Hematology Lab', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    } else await navigateSection(page, screen);
    if (screen === 'Vault') await page.getByLabel(/Exit code for Clinical Biochemistry Lab/).fill('999');
    await heading(page).focus();
    const last = page.locator('main button:not([disabled])').last();
    let reached = false;
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      if (await last.evaluate((el) => el === document.activeElement)) { reached = true; break; }
    }
    expect(reached, `${screen}: the final real control is keyboard reachable`).toBe(true);
    await expect(last).toBeInViewport({ ratio: 1 });
    const box = (await last.boundingBox())!;
    expect(box.y + box.height, `${screen}: focused control is not covered`).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  }
  expect((await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'biochemistry').exited).toBe(false);
});

test('all eight section entries are GET-only; Rooms is a current section, not a second current page inside Labs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemo(page);
  const methods: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) methods.push(r.method()); });
  for (const label of ['Vault', 'Badges', 'Leaderboard', 'Lab results', 'Learning settings', 'About & demo guide', 'Lab map', 'Rooms']) {
    await navigateSection(page, label);
    await stable(page);
  }
  expect(methods.filter((m) => m !== 'GET')).toEqual([]);
  await navigateSection(page, 'Lab map');
  await expect(footer(page).getByRole('button', { name: 'Rooms', exact: true })).toHaveAttribute('aria-current', 'true');
  await menu(page).click();
  await expect(page.locator('nav [aria-current="page"]:visible')).toHaveCount(1);
  await expect(page.locator('#guest-menu').getByRole('button', { name: 'Lab map', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('delivered late badges keep the newer vault; completed reset wins over intervening navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemo(page);
  const load = await slow(page, '**/api/badges');
  await navigateSection(page, 'Badges');
  await expect(page.getByRole('status').filter({ hasText: 'Loading your badges' })).toBeVisible();
  await navigateSection(page, 'Vault');
  await expect(page.locator('.vault-card')).toHaveCount(4);
  const delivered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/badges');
  load.release();
  const reply = await delivered;
  expect(reply.status()).toBe(200);
  await reply.finished();
  await page.unrouteAll({ behavior: 'wait' });
  await settle(page);
  await expect(heading(page)).toHaveText('Progress vault');
  await expect(page.locator('.badge-row')).toHaveCount(0);
  const reset = await slow(page, '**/api/demo/reset');
  await menu(page).click();
  await page.getByRole('button', { name: 'Reset guest session', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reset', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Resetting guest session' })).toBeVisible();
  await navigateSection(page, 'Badges');
  const resetDelivered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/demo/reset');
  reset.release();
  const resetReply = await resetDelivered;
  expect(resetReply.status()).toBe(200);
  await resetReply.finished();
  await page.unrouteAll({ behavior: 'wait' });
  await settle(page);
  await expect(heading(page)).toHaveText('Choose a laboratory');
  await expect(page.locator('.badge-row')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Resetting guest session' })).toHaveCount(0);
  await expect(heading(page)).toBeFocused();
});

test('vault, lab-name or leaderboard outages cannot break the badges screen', async ({ page }) => {
  await resetDemo(page);
  for (const path of ['vault', 'labs', 'leaderboard**']) await page.route(`**/api/${path}`, (route) => route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: 'Local section failure' } } }));
  await navigateSection(page, 'Badges');
  await expect(page.locator('.badge-row')).toHaveCount(7);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await navigateSection(page, 'Vault');
  await expect(page.getByRole('alert')).toContainText('Local section failure');
  await navigateSection(page, 'Badges');
  await expect(page.locator('.badge-row')).toHaveCount(7);
  await navigateSection(page, 'Leaderboard');
  await expect(page.getByRole('alert')).toContainText('Local section failure');
  await navigateSection(page, 'Badges');
  await expect(page.locator('.badge-row')).toHaveCount(7);
});

test('French open menu keeps a right gutter and readable full labels at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await resetDemo(page);
  await page.getByRole('button', { name: 'Français', exact: true }).click();
  await stable(page);
  await menu(page).click();
  const box = (await page.locator('#guest-menu').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(308);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  await expect(page).toHaveScreenshot('menu-fr-320.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
});

test('last real tab stops of secondary pages and an error Retry clear the mobile footer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await resetDemo(page);
  for (const label of ['Lab map', 'Lab results', 'Learning settings', 'About & demo guide', 'badge-error']) {
    if (label === 'badge-error') {
      await page.route('**/api/badges', (route) => route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: 'Badge failure' } } }));
      await navigateSection(page, 'Badges');
      await expect(page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
    } else {
      await navigateSection(page, label);
      await stable(page);
    }
    const controls = page.locator('main').locator('button, input, select, textarea, a[href], summary, [tabindex]');
    const indices = await controls.evaluateAll((els) => els.flatMap((el, index) => {
      const html = el as HTMLElement;
      const rect = html.getBoundingClientRect();
      return html.tabIndex >= 0 && !html.matches(':disabled') && rect.width > 0 && rect.height > 0 && getComputedStyle(html).visibility !== 'hidden' ? [index] : [];
    }));
    if (label === 'Lab results') {
      // A successful results page is read-only: do not invent a button to test its keyboard reachability.
      expect(indices).toEqual([]);
      const lastRow = page.locator('.result-lab .mission-row').last();
      await expect(lastRow).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const rowBox = (await lastRow.boundingBox())!;
      expect(rowBox.y + rowBox.height).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
      // Also detect implicit keyboard-focusable scrollers, whose tabIndex can report -1.
      await heading(page).focus();
      await page.keyboard.press('Tab');
      await expect(footer(page).getByRole('button').first()).toBeFocused();
      continue;
    }
    expect(indices.length, `${label}: real interactive content is present`).toBeGreaterThan(0);
    const last = controls.nth(indices.at(-1)!);
    await heading(page).focus();
    let reached = false;
    for (let i = 0; i < indices.length + 4; i++) {
      await page.keyboard.press('Tab');
      if (await last.evaluate((el) => el === document.activeElement)) { reached = true; break; }
    }
    expect(reached, `${label}: last tab stop reachable`).toBe(true);
    await expect(last).toBeInViewport({ ratio: 1 });
    const box = (await last.boundingBox())!;
    expect(box.y + box.height, `${label}: focus above the actual footer`).toBeLessThanOrEqual((await footer(page).boundingBox())!.y);
  }
});

for (const label of ['Vault', 'Badges', 'Leaderboard']) test(`Faculty switch from ${label} never loads student sections for the faculty session`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await resetDemo(page);
  await navigateSection(page, label);
  await stable(page);
  await menu(page).click();
  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await openFaculty(page);
  await stable(page);
  await settle(page);
  expect(requests.filter((p) => /^\/api\/(vault|badges|leaderboard)$/.test(p))).toEqual([]);
  await expect(page.locator('.app>aside nav button')).toHaveCount(4);
  await expect(footer(page)).toHaveCount(0);
  await noOverflow(page);
  if (label === 'Badges') {
    await menu(page).click();
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    const box = (await page.locator('#guest-menu').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(308);
    expect(box.y + box.height).toBeLessThanOrEqual(832);
    for (const button of await page.locator('#guest-menu button').all()) {
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeInViewport({ ratio: 1 });
      const buttonBox = (await button.boundingBox())!;
      const menuBox = (await page.locator('#guest-menu').boundingBox())!;
      expect(buttonBox.y).toBeGreaterThanOrEqual(menuBox.y);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(menuBox.y + menuBox.height);
    }
    await expect(page).toHaveScreenshot('faculty-menu-320.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
  }
});

for (const [label, path, status] of [['Vault', 'vault', 'Opening the vault'], ['Vault', 'labs', 'Opening the vault'], ['Leaderboard', 'leaderboard', 'Loading the leaderboard']] as const) test(`delivered late ${path} data cannot replace a newer badges screen`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemo(page);
  const gate = await slow(page, `**/api/${path}${path === 'leaderboard' ? '**' : ''}`);
  await navigateSection(page, label);
  await expect(page.getByRole('status').filter({ hasText: status })).toBeVisible();
  await navigateSection(page, 'Badges');
  await expect(page.locator('.badge-row')).toHaveCount(7);
  const delivered = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/${path}`);
  gate.release();
  const reply = await delivered;
  expect(reply.status()).toBe(200);
  await reply.finished();
  await page.unrouteAll({ behavior: 'wait' });
  await settle(page);
  await expect(heading(page)).toHaveText('Milestones');
  await expect(page.locator('.badge-row')).toHaveCount(7);
  await expect(page.locator('.vault-card, .leaderboard-row')).toHaveCount(0);
});
