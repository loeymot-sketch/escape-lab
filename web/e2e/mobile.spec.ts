import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, DECISION, apiCall, freshStudent, openAs, caseStatus, clickArtwork, completeLabViaApi, completeMissionViaApi, homeHeading, moveContent, openAttemptAt, openFaculty, openHome, prepareContentStatus, resetDemo, sessionToken, startMissionViaUi, statusPill, submit } from './support/helpers';
import { auditPage } from './support/audit';

// Runs only in the "mobile-iphone13" project: the iPhone 13 descriptor (390x844, DPR 3, touch, mobile UA).
const noOverflow = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(metrics.scroll, `${label} overflows horizontally`).toBeLessThanOrEqual(metrics.client);
};
const menuButton = (page: Page) => page.getByRole('button', { name: 'Guest options' });
const tapNav = async (page: Page, name: string) => { await page.getByRole('button', { name, exact: true }).tap(); };

test.describe('iPhone 13 profile', () => {
  test('the device really is a touch phone', async ({ page, isMobile, hasTouch }) => {
    expect(isMobile).toBe(true);
    expect(hasTouch).toBe(true);
    await openHome(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(390);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await page.evaluate(() => document.querySelector('meta[name="viewport"]')?.getAttribute('content'))).toBe('width=device-width,initial-scale=1');
  });

  test('every student page fits the screen and passes axe', async ({ page }) => {
    await resetDemo(page);
    await noOverflow(page, 'dashboard');
    for (const [name, heading] of [['Lab map', 'Laboratory map'], ['Progress', 'Progress vault'], ['Lab results', 'Lab results'], ['Learning settings', 'Learning settings']] as const) {
      await tapNav(page, name);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
      await noOverflow(page, name);
    }
    await tapNav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).tap();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await noOverflow(page, 'lab lobby');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('the guest actions are reachable from the Guest options sheet (they used to be hidden)', async ({ page }) => {
    await resetDemo(page);
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeHidden();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await menuButton(page).tap();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeVisible();
    await noOverflow(page, 'menu open');
    // Touch targets are comfortably large.
    for (const name of ['Faculty guest', 'Reset guest session']) expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.getByRole('button', { name: 'Reset guest session' }).tap();
    await page.getByRole('button', { name: 'Confirm reset' }).tap();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset guest session' })).toBeHidden();
    await menuButton(page).tap();
    await page.getByRole('button', { name: 'Faculty guest' }).tap();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await menuButton(page).tap();
    await expect(page.getByRole('button', { name: 'Student guest' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Return to student demo' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to student demo' }).tap();
    await expect(homeHeading(page)).toBeVisible();
  });

  test('Escape closes the Guest options sheet and gives focus back to its button', async ({ page }) => {
    await resetDemo(page);
    await expect(menuButton(page)).toHaveAccessibleName('Guest options');
    await menuButton(page).tap();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'true');
    const reset = page.getByRole('button', { name: 'Reset guest session' });
    await expect(reset).toBeVisible();
    // Focus moves into the sheet (as a keyboard user would), then Escape.
    await reset.focus();
    await expect(reset).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(reset).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
    // Escape with the sheet closed does nothing.
    await page.keyboard.press('Escape');
    await expect(menuButton(page)).toBeFocused();
    await expect(menuButton(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('faculty pages fit, and the content review actions are visible and tappable', async ({ page }) => {
    await prepareContentStatus('hem-01', 'draft');
    await openHome(page);
    await menuButton(page).tap();
    await page.getByRole('button', { name: 'Faculty guest' }).tap();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await noOverflow(page, 'analytics');
    await expect(page.getByText('ROSTER')).toBeVisible();
    await tapNav(page, 'Student detail');
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    await noOverflow(page, 'student detail');
    await tapNav(page, 'Content review');
    const row = page.locator('.content-row').filter({ hasText: 'Blood Smear Code' });
    await expect(row).toBeVisible();
    await noOverflow(page, 'content review');
    const button = row.getByRole('button', { name: 'Mark reviewed' });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await expect(statusPill(row)).toHaveText('Draft');
    await moveContent(page, row, 'Mark reviewed', 'reviewed', 'tap');
    await moveContent(page, row, 'Approve', 'approved', 'tap');
    await moveContent(page, row, 'Return to draft', 'draft', 'tap');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('a mission can be played by touch: tap the visible finding, submit, finish', async ({ page }) => {
    await resetDemo(page);
    await tapNav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).tap();
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).tap();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await noOverflow(page, 'mission');
    await expect(page.locator('.case-meta + .scenario-note')).toHaveText('Educational scenario — not clinical guidance');
    const box = (await page.locator('.scientific-image').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    await page.locator('.scientific').tap({ position: { x: 20, y: 20 } });
    await submit(page).tap();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(caseStatus(page, 'Wrong answers')).toHaveText('1');
    await page.locator('.scientific').tap({ position: { x: (box.width * ARTWORK.smear.x) / ARTWORK.smear.width, y: (box.height * ARTWORK.smear.y) / ARTWORK.smear.height } });
    await submit(page).tap();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await noOverflow(page, 'result');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('the other engines fit and are tappable', async ({ page }) => {
    await resetDemo(page);
    for (const [lab, title] of [['Hematology Lab', 'Fix the Sample'], ['Microbiology Lab', 'Gram Stain Challenge'], ['Microbiology Lab', 'Petri Dish Mystery'], ['Hematology Lab', 'Anemia Detective']] as const) {
      await tapNav(page, 'Lab map');
      await page.getByRole('button', { name: new RegExp(`^(Enter|Review) ${lab}$`) }).tap();
      await page.getByRole('button', { name: new RegExp(`^(Start|Resume|Replay) ${title}$`) }).tap();
      await expect(page.locator('.case-panel h1')).toBeVisible();
      await noOverflow(page, title);
      await page.getByRole('button', { name: '← Exit mission' }).tap();
    }
  });

  test('loading, error and result states fit the screen', async ({ page }) => {
    await openHome(page);
    await page.route('**/api/vault', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'Temporary outage' } }) }));
    await tapNav(page, 'Progress');
    await expect(page.getByRole('alert')).toContainText('Temporary outage');
    await noOverflow(page, 'error panel');
  });
});

test.describe('phone polish', () => {
  test('the section navigation wraps: every section is visible inside the screen, in keyboard order', async ({ page }) => {
    await resetDemo(page);
    const names = ['Investigations', 'Lab map', 'Progress', 'Lab results', 'Learning settings', 'About & demo guide'];
    const width = await page.evaluate(() => window.innerWidth);
    const tops = new Set<number>();
    for (const name of names) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box, name).not.toBeNull();
      expect(box.x, `${name} starts inside the screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} ends inside the screen`).toBeLessThanOrEqual(width);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
      tops.add(Math.round(box.y));
    }
    expect(tops.size, 'the items wrap onto more than one row instead of scrolling sideways').toBeGreaterThan(1);
    expect(await page.locator('nav').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: names[0]!, exact: true }).focus();
    for (const name of names.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    }
    await tapNav(page, 'Learning settings');
    await expect(page.getByRole('heading', { name: 'Learning settings', exact: true })).toBeVisible();
    await tapNav(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'Lab results', exact: true })).toBeVisible();
  });

  test('Guest options is a popover over the page: nothing moves, it has a Close, Escape and an outside tap close it', async ({ page }) => {
    await resetDemo(page);
    const heading = page.getByRole('heading', { level: 1 });
    const headingY = (await heading.boundingBox())!.y;
    const button = menuButton(page);
    await button.tap();
    const popover = page.getByRole('group', { name: 'Guest options' });
    await expect(popover).toBeVisible();
    expect((await heading.boundingBox())!.y, 'the page content is not pushed down').toBe(headingY);
    const pop = (await popover.boundingBox())!;
    const anchor = (await button.boundingBox())!;
    const width = await page.evaluate(() => window.innerWidth);
    expect(pop.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
    expect(Math.abs(pop.x - anchor.x)).toBeLessThan(2);
    expect(pop.x + pop.width).toBeLessThanOrEqual(width);
    expect(await popover.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    await expect(popover.getByRole('button', { name: 'Close' })).toBeVisible();
    await popover.getByRole('button', { name: 'Close' }).tap();
    await expect(popover).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    // Outside tap
    await button.tap();
    await expect(popover).toBeVisible();
    await page.locator('.stats').tap();
    await expect(popover).toBeHidden();
    // Escape
    await button.tap();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('the hint sits right under the question, before Submit; the case status stays below', async ({ page }) => {
    await resetDemo(page);
    for (const [mission, step] of [['hem-01', 0], ['hem-02', 0]] as const) {
      await openAttemptAt(page, mission, step);
      const hint = (await page.getByRole('button', { name: /Ask Lab Assistant/ }).boundingBox())!;
      const send = (await submit(page).boundingBox())!;
      const status = (await page.locator('.case-status-card').boundingBox())!;
      const options = (await page.locator('.scientific, .answer-options').first().boundingBox())!;
      expect(hint.y, `${mission}: hint after the question`).toBeGreaterThan(options.y);
      expect(hint.y, `${mission}: hint before Submit`).toBeLessThan(send.y);
      expect(status.y, `${mission}: status after Submit`).toBeGreaterThan(send.y);
    }
    // Tab order stays sane: the options, then the hint, then Submit.
    await page.locator('.answer-options button').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeFocused();
  });

  test('R9-B-06: paid hints stay under the question after a reload and fit the screen', async ({ page }) => {
    await resetDemo(page);
    await openAttemptAt(page, 'hem-01', 0);
    const ask = page.getByRole('button', { name: /Ask Lab Assistant/ });
    await ask.tap();
    await expect(page.locator('.hint-result')).toHaveCount(1);
    await ask.tap();
    await expect(page.locator('.hint-result')).toHaveCount(2);
    await page.reload();
    const shown = page.locator('.assistant-inline .hint-result');
    await expect(shown).toHaveCount(2);
    await expect(shown.nth(0)).toContainText('Ignore the round cells with central pallor.');
    await expect(shown.nth(1)).toContainText('The cell you want is smaller than its neighbours and has pointed corners.');
    await expect(page.getByText(/Earlier hint text is not stored/)).toHaveCount(0);
    await noOverflow(page, 'hints after reload');
  });

  test('decision options show chips and fit a phone, including the longest label', async ({ page }) => {
    await resetDemo(page);
    const width = await page.evaluate(() => window.innerWidth);
    await openAttemptAt(page, 'hem-02', 0);
    await expect(page.locator('.answer-options .chip')).toHaveText(['A', 'B', 'C']);
    const buttons = page.locator('.answer-options button');
    for (let i = 0; i < 3; i += 1) {
      const box = (await buttons.nth(i).boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await buttons.nth(i).evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    }
    await expect(buttons.nth(1)).toContainText('Reject and request a new sample');
    const token = await sessionToken(page);
    for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
    try {
      await openAttemptAt(page, 'master-01', 3);
      const longest = page.locator('.answer-options button').filter({ hasText: 'Alert the clinician' });
      expect(await longest.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      expect((await longest.boundingBox())!.x + (await longest.boundingBox())!.width).toBeLessThanOrEqual(width);
    } finally {
      await apiCall(token, '/demo/reset', { method: 'POST' });
    }
  });

  test('the image label sits below the picture and the marker is a 24px ring that leaves the value readable', async ({ page }) => {
    await resetDemo(page);
    const token = await sessionToken(page);
    await completeMissionViaApi(token, 'bio-01');
    await openAttemptAt(page, 'bio-02', 0);
    const image = (await page.locator('.scientific').boundingBox())!;
    expect((await page.locator('.image-watermark').boundingBox())!.y).toBeGreaterThanOrEqual(image.y + image.height - 1);
    await clickArtwork(page, ARTWORK.panel);
    const marker = (await page.locator('.marker').boundingBox())!;
    expect(marker.width).toBeLessThanOrEqual(24);
    expect(marker.width).toBeGreaterThanOrEqual(22);
    const art = (await page.locator('.scientific-image').boundingBox())!;
    expect(Math.abs(marker.x + marker.width / 2 - (art.x + (art.width * ARTWORK.panel.x) / ARTWORK.panel.width))).toBeLessThan(2);
    expect(await page.locator('.marker').evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test('the result screen has breathing room at the top and shows new badges as chips', async ({ page }) => {
    await resetDemo(page);
    await tapNav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).tap();
    await page.getByRole('button', { name: 'Replay Blood Smear Code' }).tap();
    await expect(page.locator('.case-panel h1')).toBeVisible();
    const box = (await page.locator('.scientific-image').boundingBox())!;
    await page.locator('.scientific').tap({ position: { x: (box.width * ARTWORK.smear.x) / ARTWORK.smear.width, y: (box.height * ARTWORK.smear.y) / ARTWORK.smear.height } });
    await page.route('**/api/attempts/*/answer', (route) => route.fetch().then(async (response) => {
      const body = await response.json();
      body.result = { ...body.result, newBadges: [{ id: 'no-hint', name: 'No Hint', description: 'x', lab: null }, { id: 'perfect', name: 'Perfect Mission', description: 'x', lab: null }] };
      await route.fulfill({ response, json: body });
    }));
    await submit(page).tap();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    expect((await page.getByText('CASE COMPLETE').boundingBox())!.y).toBeGreaterThanOrEqual(24);
    const chips = page.getByRole('list', { name: 'New badges' }).getByRole('listitem');
    await expect(chips).toHaveText(['No Hint', 'Perfect Mission']);
    await expect(page.getByText('New badges earned')).toBeVisible();
    await expect(page.locator('.notice.success-note')).toHaveCount(0);
  });
});

test.describe('phone audit: tap targets and type size', () => {
  const expectClean = async (page: Page, label: string) => {
    const audit = await auditPage(page);
    expect(audit.smallControls, `${label}: controls under 40px`).toEqual([]);
    expect(audit.smallText, `${label}: text under 11px`).toEqual([]);
  };

  test('student pages', async ({ page }) => {
    await resetDemo(page);
    await expectClean(page, 'dashboard');
    for (const [name, heading] of [['Lab map', 'Laboratory map'], ['Progress', 'Progress vault'], ['Lab results', 'Lab results'], ['Learning settings', 'Learning settings']] as const) {
      await tapNav(page, name);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectClean(page, name);
    }
    await tapNav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).tap();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await expectClean(page, 'lab lobby');
    await menuButton(page).tap();
    await expectClean(page, 'guest popover');
  });

  test('every engine and the result screen', async ({ page }) => {
    await resetDemo(page);
    for (const [mission, step, label] of [['hem-01', 0, 'point'], ['hem-02', 0, 'decision'], ['mic-01', 0, 'choice'], ['mic-02', 0, 'order'], ['mic-03', 0, 'match']] as const) {
      await openAttemptAt(page, mission, step);
      await expectClean(page, label);
    }
    await openAttemptAt(page, 'hem-01', 0);
    await clickArtwork(page, ARTWORK.smear);
    await expect(page.locator('.marker')).toBeVisible();
    await expectClean(page, 'point with marker');
    await submit(page).tap();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expectClean(page, 'result');
  });

  test('the vault with an Unlock form and the badge list', async ({ page }) => {
    const token = await freshStudent();
    await completeLabViaApi(token, 'hematology', false);
    await openAs(page, token);
    await tapNav(page, 'Progress');
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectClean(page, 'vault with unlock form');
    expect((await page.getByRole('button', { name: 'Unlock' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test('faculty pages', async ({ page }) => {
    await openHome(page);
    await menuButton(page).tap();
    await page.getByRole('button', { name: 'Faculty guest' }).tap();
    await expect(page.locator('li.mission-signal').first()).toBeVisible();
    await expectClean(page, 'analytics');
    await tapNav(page, 'Student detail');
    await expect(page.locator('.profile-card h2')).toBeVisible();
    await expectClean(page, 'student detail');
    await tapNav(page, 'Content review');
    await expect(page.locator('.content-row').first()).toBeVisible();
    await expectClean(page, 'content review');
  });

  test('R10-C-10: the "Show all N" buttons on Class intelligence reach the 44px touch size', async ({ page }) => {
    await openHome(page);
    await menuButton(page).tap();
    await page.getByRole('button', { name: 'Faculty guest' }).tap();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    const more = page.getByRole('button', { name: /^Show all \d+$/ });
    await expect(more.first()).toBeVisible();
    for (const button of await more.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noOverflow(page, 'analytics');
  });

  test('R11-B-01: the settings-banner Retry and the hint-area rules Retry reach 44x44 on touch', async ({ page }) => {
    await resetDemo(page);
    await page.route('**/api/profile', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Settings service unavailable' } }) }));
    await page.reload();
    await expect(homeHeading(page)).toBeVisible();
    const banner = page.getByRole('alert').filter({ hasText: /learning settings could not be loaded/i });
    const retry = banner.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const box = (await retry.boundingBox())!;
      expect(box.width, `banner Retry width at ${width}px`).toBeGreaterThanOrEqual(44);
      expect(box.height, `banner Retry height at ${width}px`).toBeGreaterThanOrEqual(44);
    }
    await page.unroute('**/api/profile');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/rules', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'Rules service unavailable' } }) }));
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const rules = page.getByRole('alert').filter({ hasText: /scoring rules could not be loaded/i }).getByRole('button', { name: 'Retry' });
    await expect(rules).toBeVisible();
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const box = (await rules.boundingBox())!;
      expect(box.width, `rules Retry width at ${width}px`).toBeGreaterThanOrEqual(44);
      expect(box.height, `rules Retry height at ${width}px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('About & demo guide on the phone', () => {
  const aboutHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'About Escape Lab' });

  test('the student phone menu reaches it; it fits the screen, passes axe and every control is a 44px target', async ({ page }) => {
    await resetDemo(page);
    const width = await page.evaluate(() => window.innerWidth);
    const box = (await page.getByRole('button', { name: 'About & demo guide', exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await tapNav(page, 'About & demo guide');
    await expect(aboutHeading(page)).toBeVisible();
    await expect(aboutHeading(page)).toBeFocused();
    await expect(page.getByRole('button', { name: 'About & demo guide', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('About & demo guide · Escape Lab');
    await noOverflow(page, 'about');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    const audit = await auditPage(page, { minControl: 44 });
    expect(audit.smallControls).toEqual([]);
    expect(audit.smallText).toEqual([]);
    // An Open button taps through to the real screen.
    await page.getByRole('button', { name: 'Open the lab map' }).tap();
    await expect(page.getByRole('heading', { name: 'Laboratory map', exact: true })).toBeVisible();
  });

  test('the Faculty guest phone menu reaches it too (four sections, the last on its own row)', async ({ page }) => {
    await resetDemo(page);
    await menuButton(page).tap();
    await page.getByRole('button', { name: 'Faculty guest' }).tap();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    const width = await page.evaluate(() => window.innerWidth);
    for (const name of ['Faculty', 'Student detail', 'Content review', 'About & demo guide']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.x, name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, name).toBeLessThanOrEqual(width);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    await tapNav(page, 'About & demo guide');
    await expect(aboutHeading(page)).toBeVisible();
    await noOverflow(page, 'about as faculty');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.getByRole('button', { name: 'Open Faculty analytics' }).tap();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
  });
});
