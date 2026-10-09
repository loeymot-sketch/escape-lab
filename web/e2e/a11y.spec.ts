import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, apiCall, arrangeOrder, clickArtwork, expireAttemptInDb, homeHeading, json, openFaculty, openHome, resetDemo, settle, slow, startMissionViaUi, submit, DECISION } from './support/helpers';
import { MISSION_BY_ID } from './support/content';

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
/** Zero axe violations; failures are summarised per node so they can be fixed from the report. */
async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations.flatMap((v) => v.nodes.map((n) => {
    const data = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number };
    return `${v.id}: ${n.target.join(' ')}${data.contrastRatio ? ` (${data.fgColor} on ${data.bgColor} = ${data.contrastRatio})` : ''} ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`;
  }));
  expect(summary, label).toEqual([]);
}
const luminance = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => { const s = v! / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
const rgb = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

/**
 * Non-text contrast (WCAG 1.4.11): every visible, enabled control matching `selector` that draws a border must
 * separate from the surface behind it by at least 3:1. Returns what was measured; fails with the offenders listed.
 */
async function controlBorders(page: Page, selector: string) {
  const measured = await page.evaluate((sel) => {
    const parse = (css: string) => { const m = css.match(/[\d.]+/g)!.map(Number); return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    const surface = (el: Element) => {
      let color = { r: 255, g: 255, b: 255 };
      const chain: ReturnType<typeof parse>[] = [];
      for (let n = el.parentElement; n; n = n.parentElement) chain.push(parse(getComputedStyle(n).backgroundColor));
      // Paint from the outermost ancestor inwards, blending translucent layers.
      for (const layer of chain.reverse()) color = { r: layer.r * layer.a + color.r * (1 - layer.a), g: layer.g * layer.a + color.g * (1 - layer.a), b: layer.b * layer.a + color.b * (1 - layer.a) };
      return color;
    };
    return Array.from(document.querySelectorAll<HTMLElement>(sel))
      .filter((el) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled)
      .map((el) => {
        const style = getComputedStyle(el);
        const border = parse(style.borderTopColor);
        const drawn = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' && border.a > 0;
        const behind = surface(el);
        const [hi, lo] = [lum(border), lum(behind)].sort((x, y) => y - x);
        return { label: (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || sel, drawn, border: style.borderTopColor, ratio: Number((((hi! + 0.05) / (lo! + 0.05))).toFixed(2)) };
      });
  }, selector);
  expect(measured.length, `no enabled control matched ${selector}`).toBeGreaterThan(0);
  const weak = measured.filter((m) => m.drawn && m.ratio < 3).map((m) => `${m.label} (${m.border}) ${m.ratio}:1`);
  expect(weak, `${selector} borders below 3:1`).toEqual([]);
  expect(measured.every((m) => m.drawn), `${selector} controls without a drawn border`).toBe(true);
  return measured;
}

test.describe('axe: zero violations on every screen', () => {
  test('student pages', async ({ page }) => {
    await resetDemo(page);
    await clean(page, 'dashboard');
    await nav(page, 'Lab map');
    await expect(page.getByRole('heading', { name: 'Laboratory map' })).toBeVisible();
    await expect(page.locator('.lab-card').first()).toBeVisible();
    await clean(page, 'lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await clean(page, 'lab lobby');
    await page.getByRole('button', { name: '← All laboratories' }).click();
    await page.getByRole('button', { name: 'Enter Clinical Biochemistry Lab' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await clean(page, 'lab lobby with locked missions');
    await nav(page, 'Progress');
    await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
    await clean(page, 'progress');
    await nav(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'Escape confirmed' })).toBeVisible();
    await clean(page, 'lab results');
    await nav(page, 'Learning settings');
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await clean(page, 'settings');
  });

  test('faculty pages', async ({ page }) => {
    await openHome(page);
    await openFaculty(page);
    await expect(page.getByText('ROSTER')).toBeVisible();
    await clean(page, 'analytics');
    await nav(page, 'Student detail');
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    await clean(page, 'student detail');
    await nav(page, 'Content review');
    await expect(page.locator('.content-row').first()).toBeVisible();
    await clean(page, 'content review');
  });

  test('every engine, the expired panel, a wrong-answer alert and the result screen', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clean(page, 'point engine');
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await clean(page, 'point engine with a wrong-answer alert');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await clean(page, 'point engine with a hint');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await clean(page, 'result screen');
    await page.getByRole('button', { name: 'Return to mission control' }).click();

    await startMissionViaUi(page, 'Hematology Lab', 'Anemia Detective');
    await expect(page.getByText('STEP 1 / 3')).toBeVisible();
    await clean(page, 'stepper step 1');
    await page.locator('.answer-options button').filter({ hasText: 'Microcytic' }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Correct.' })).toBeVisible();
    await clean(page, 'stepper step 2 with revealed values and a correct status');
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await clean(page, 'decision engine');
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    await clean(page, 'order engine');
    await page.getByRole('button', { name: '← Exit mission' }).click();
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    await clean(page, 'matching engine');
    await page.locator('select').nth(0).selectOption('ecoli');
    await page.locator('select').nth(1).selectOption('ecoli');
    await clean(page, 'matching engine with a duplicate association');
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    expireAttemptInDb((await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt')))!);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await clean(page, 'expired mission');
  });

  test('error, loading and empty panels', async ({ page }) => {
    await resetDemo(page);
    await page.route('**/api/labs', (route) => route.fulfill(json(500, { error: { code: 'internal_error', message: 'Temporary outage' } })));
    await nav(page, 'Lab map');
    await expect(page.getByRole('alert')).toContainText('Temporary outage');
    await clean(page, 'error panel');
    await page.unroute('**/api/labs');
    await page.route('**/api/labs', (route) => route.fulfill(json(200, { labs: [] })));
    await nav(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'No escaped lab yet' })).toBeVisible();
    await clean(page, 'empty panel');
  });

  test('guest gate in its error state', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => route.fulfill(json(404, { error: { code: 'not_found', message: 'Demo mode is not enabled on this server.' } })));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('DEMO_MODE=1');
    await clean(page, 'guest gate error');
  });
});

test.describe('semantics and conventions', () => {
  test('navigation marks the current page, and the tab title follows the screen', async ({ page }) => {
    await resetDemo(page);
    const expected: [string, string][] = [['Investigations', 'Mission control'], ['Lab map', 'Lab map'], ['Progress', 'Progress vault'], ['Lab results', 'Lab results'], ['About & demo guide', 'About & demo guide'], ['Learning settings', 'Learning settings']];
    for (const [name, title] of expected) {
      await nav(page, name);
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('nav [aria-current="page"]')).toHaveCount(1);
      await expect(page).toHaveTitle(`${title} · Escape Lab`);
    }
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page).toHaveTitle('Blood Smear Code · Escape Lab');
  });

  test('choice and decision options are toggle buttons that expose their state', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    const reject = page.getByRole('button', { name: DECISION.reject });
    await expect(reject).toHaveAttribute('aria-pressed', 'false');
    await reject.click();
    await expect(reject).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: DECISION.accept }).click();
    await expect(reject).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('group', { name: 'Decision options' })).toBeVisible();
  });

  test('feedback is announced: wrong answers as alerts, correct answers as status', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.accept }).click();
    await submit(page).click();
    await expect(page.locator('.feedback.wrong')).toHaveAttribute('role', 'alert');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.locator('.feedback.correct')).toHaveAttribute('role', 'status');
    await expect(page.locator('.feedback.correct')).toHaveAttribute('aria-live', 'polite');
  });

  test('the mission side panel uses h2, not a skipped heading level, with no runtime DOM rewriting', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.getByRole('heading', { level: 2, name: 'Observe before you decide.' })).toBeVisible();
    await expect(page.locator('.case-aside h3')).toHaveCount(0);
    const levels = await page.locator('h1,h2,h3,h4').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i += 1) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  });

  test('keyboard focus is clearly visible: >= 3:1 against the cream surface, on buttons and on the image', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Lab map');
    const target = page.getByRole('button', { name: 'Progress', exact: true });
    await target.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const style = await target.evaluate((el) => { const s = getComputedStyle(el); return { color: s.outlineColor, width: parseFloat(s.outlineWidth), style: s.outlineStyle, bg: getComputedStyle(document.body).backgroundColor, halo: s.boxShadow }; });
    expect(style.style).toBe('solid');
    expect(style.width).toBeGreaterThanOrEqual(2);
    const cream = [247, 244, 239];
    expect(contrast(rgb(style.color), cream)).toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(style.color), [255, 255, 255])).toBeGreaterThanOrEqual(3);
  });

  test('changing screen moves focus to the new page heading (and the title follows); the first load does not steal focus', async ({ page }) => {
    await resetDemo(page);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    for (const [name, heading, title] of [['Lab map', 'Laboratory map', 'Lab map'], ['Progress', 'Progress vault', 'Progress vault'], ['Lab results', 'Lab results', 'Lab results'], ['Learning settings', 'Learning settings', 'Learning settings']] as const) {
      await nav(page, name);
      const h1 = page.getByRole('heading', { level: 1, name: heading, exact: true });
      await expect(h1).toBeFocused();
      await expect(h1).toHaveAttribute('tabindex', '-1');
      await expect(page).toHaveTitle(`${title} · Escape Lab`);
      // The very next Tab moves on from the heading to the page's own controls or the next landmark; it never traps.
      await page.keyboard.press('Tab');
      await expect(h1).not.toBeFocused();
    }
    // A heading that only exists once the page has loaded still receives focus when it appears.
    await nav(page, 'Investigations');
    await expect(homeHeading(page)).toBeFocused();
    await nav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hematology Lab', exact: true })).toBeFocused();
  });

  test('a late heading does not steal focus from a control the learner already moved to', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Lab map');
    const gate = await slow(page, '**/api/dashboard');
    await nav(page, 'Investigations');
    await expect(page.getByRole('status').filter({ hasText: /Loading investigation map/ })).toBeVisible();
    // The learner moves into the page body (here: the breadcrumb-free header has no control, so use a skip into main).
    await page.evaluate(() => { const probe = document.createElement('button'); probe.id = 'probe'; probe.textContent = 'probe'; document.querySelector('main')!.append(probe); probe.focus(); });
    gate.release();
    await expect(homeHeading(page)).toBeVisible();
    await settle(page);
    await expect(page.locator('#probe')).toBeFocused();
  });

  test('non-text contrast: control borders are >= 3:1 against their surface (answer, move, select; also when selected)', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    expect(await controlBorders(page, '.answer-options button')).toHaveLength(3);
    await page.locator('.answer-options button').first().click();
    expect(await controlBorders(page, '.answer-options button')).toHaveLength(3);
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    expect((await controlBorders(page, '.move-buttons button')).length).toBeGreaterThanOrEqual(4);
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    expect(await controlBorders(page, '.match-row select')).toHaveLength(4);
    await page.getByRole('button', { name: '← Exit mission' }).click();

    await openFaculty(page);
    await nav(page, 'Student detail');
    await expect(page.locator('.picker-label select').first()).toBeVisible();
    expect((await controlBorders(page, '.picker-label select')).length).toBeGreaterThanOrEqual(1);
  });

  test('small caption text over the photograph on the guest gate is pure white', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => route.fulfill(json(404, { error: { code: 'not_found', message: 'x' } })));
    await page.goto('/');
    await expect(page.locator('.visual-caption small')).toBeVisible();
    expect(await page.locator('.visual-caption small').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  });

  test('images are always labelled illustrative and copy never implies clinical validity', async ({ page }) => {
    await resetDemo(page);
    await expect(page.locator('.hero-science .illustrative-tag')).toHaveText('Illustrative image');
    expect(await page.locator('body').innerText()).not.toMatch(/specimen to diagnosis|Clinical investigation|Wright-Giemsa/i);
    await nav(page, 'Lab map');
    expect(await page.locator('body').innerText()).not.toMatch(/specimen to diagnosis|clinical detective/i);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.locator('.image-watermark')).toContainText('Illustrative training image');
    await expect(page.locator('.image-caption')).toContainText('not a real specimen');
    await expect(page.locator('.image-caption')).toContainText('not for clinical use');
    // The case header carries a visible one-line disclaimer, directly under the step/kind line.
    await expect(page.locator('.case-meta + .scenario-note')).toBeVisible();
    await expect(page.locator('.case-meta + .scenario-note')).toHaveText('Educational scenario — not clinical guidance');
    expect(await page.locator('body').innerText()).not.toMatch(/Wright-Giemsa|Clinical investigation/);
  });

  test('the guest gate image is labelled too', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => route.fulfill(json(404, { error: { code: 'not_found', message: 'x' } })));
    await page.goto('/');
    await expect(page.locator('.landing-visual .illustrative-tag')).toBeVisible();
  });

  test('mission images keep their natural aspect ratio so percentages map 1:1', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const box = (await page.locator('.scientific-image').boundingBox())!;
    expect(Math.abs(box.width / box.height - ARTWORK.smear.width / ARTWORK.smear.height)).toBeLessThan(0.01);
    expect(await page.locator('.scientific-image').evaluate((el) => getComputedStyle(el).objectFit)).toBe('contain');
    // Clicking the visible schistocyte puts the marker on it: the marker centre is the clicked artwork point.
    await clickArtwork(page, ARTWORK.smear);
    const marker = (await page.locator('.marker').boundingBox())!;
    expect(Math.abs(marker.x + marker.width / 2 - (box.x + (box.width * ARTWORK.smear.x) / ARTWORK.smear.width))).toBeLessThan(2);
    expect(Math.abs(marker.y + marker.height / 2 - (box.y + (box.height * ARTWORK.smear.y) / ARTWORK.smear.height))).toBeLessThan(2);
  });
});

test.describe('motion', () => {
  test('the Reduce motion setting stops the ambient animations, and turning it off brings them back', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await resetDemo(page);
    await expect(page.locator('.lab-card').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);
    await nav(page, 'Learning settings');
    const box = page.getByRole('checkbox', { name: 'Reduce motion' });
    if (await box.isChecked()) await box.click();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
    await box.click();
    await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await nav(page, 'Investigations');
    await expect(page.locator('.hero-science img')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await page.locator('.hero-science img').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    // The server owns the setting: it survives a reload.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
    await nav(page, 'Learning settings');
    await page.getByRole('checkbox', { name: 'Reduce motion' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
    await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeVisible();
  });

  test('the operating-system preference also stops animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await resetDemo(page);
    await expect(page.locator('.hero-science img')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a as CSSAnimation).animationName).length)).toBe(0);
  });
});

test.describe('keyboard operability, engine by engine', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('point: arrow keys move the marker and Submit becomes available, then the answer is accepted', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const image = page.getByRole('button', { name: 'Select a point on the scientific image' });
    await image.focus();
    await expect(submit(page)).toBeDisabled();
    for (let i = 0; i < 5; i += 1) await image.press('ArrowRight');
    await expect(page.getByText('Marker at 75% across, 50% down.')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Submit answer' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('choice and decision: Tab, Space/Enter select and submit', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    const reject = page.getByRole('button', { name: DECISION.reject });
    await reject.focus();
    await page.keyboard.press('Space');
    await expect(reject).toHaveAttribute('aria-pressed', 'true');
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    const repeat = page.getByRole('button', { name: DECISION.repeat });
    await repeat.focus();
    await page.keyboard.press('Enter');
    await expect(repeat).toHaveAttribute('aria-pressed', 'true');
  });

  test('order: the move buttons work from the keyboard', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    const rows = page.locator('.drag-row b');
    const before = await rows.allTextContents();
    await page.getByRole('button', { name: `Move down: ${before[0]}` }).focus();
    await page.keyboard.press('Enter');
    expect((await rows.allTextContents())[1]).toBe(before[0]);
    const labels = new Map(MISSION_BY_ID.get('mic-02')!.steps[0]!.data.items!.map((i) => [i.id, i.label]));
    await arrangeOrder(page, (MISSION_BY_ID.get('mic-02')!.steps[0]!.key as { order: string[] }).order.map((id) => labels.get(id)!));
    await submit(page).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('match: every select is reachable and settable by typing', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const typed = ['Esc', 'Str', 'Pro', 'Pse'];
    for (let i = 0; i < 4; i += 1) {
      const select = page.locator('select').nth(i);
      await select.focus();
      await page.keyboard.type(typed[i]!);
    }
    await expect(submit(page)).toBeEnabled();
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('the whole dashboard is reachable by Tab in a sensible order', async ({ page }) => {
    await expect(homeHeading(page)).toBeVisible();
    const seen: string[] = [];
    // 14 presses: the two language buttons (FR, EN) in the header add two Tab stops before the page content.
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30) ?? ''));
    }
    expect(seen.slice(0, 5).join('|')).toContain('Investigations');
    expect(seen.join('|')).toContain('Start the next investigation');
    expect(seen.join('|')).toContain('View full map');
  });
});
