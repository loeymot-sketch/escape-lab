import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, clickArtwork, completeLabViaApi, completeMissionViaApi, expireAttemptInDb, freshStudent, openAs, openAttemptAt, openFaculty, outage, resetDemo, startMissionViaUi, submit } from './support/helpers';
import { exitCode } from './support/content';

// The whole site is available in French and English. English is the default for English browsers, French for French browsers; the switch in the header
// changes the language of every screen in place (nothing is lost: the attempt, the timer and the selected answer stay).
const FR = (page: Page) => page.getByRole('button', { name: 'Français' });
const EN = (page: Page) => page.getByRole('button', { name: 'English' });
const lang = (page: Page) => page.evaluate(() => document.documentElement.lang);

/** Words that only English uses: a visible text or accessible name containing one of them is an English leak in French mode. */
const ENGLISH_ONLY = /\b(the|and|of|your|you|this|that|with|for|is|are|not|be|it|by|from|has|have|will|can|was|were|which|what|when|how|then|than|to)\b/i;
/** Texts that are DATA (names typed by people or taken from the demonstration data) or product names, never translated. */
const KEEP = /Alex Martin|Escape Lab|LabEscape|Claire Moreau|L3 Biomedical Sciences|L2 Biomedical Sciences|Biomedical Sciences/;

async function englishLeaks(page: Page): Promise<string[]> {
  return page.evaluate(({ source, keep }) => {
    const english = new RegExp(source, 'i');
    const keepRe = new RegExp(keep);
    const seen = new Set<string>();
    const visible = (el: Element | null): boolean => {
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return !!el && (el as HTMLElement).getClientRects().length > 0;
    };
    const consider = (text: string | null | undefined, where: string) => {
      const clean = (text ?? '').replace(/\s+/g, ' ').trim();
      if (clean.length < 4 || keepRe.test(clean) || !english.test(clean)) return;
      seen.add(`${where}: ${clean.slice(0, 140)}`);
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName) || !visible(parent)) continue;
      consider(node.textContent, parent.tagName.toLowerCase());
    }
    for (const el of Array.from(document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]'))) {
      if (!visible(el)) continue;
      for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) consider(el.getAttribute(attribute), `${el.tagName.toLowerCase()}[${attribute}]`);
    }
    if (document.title) consider(document.title, 'title');
    return [...seen];
  }, { source: ENGLISH_ONLY.source, keep: KEEP.source });
}

async function noSidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Controls smaller than 44 x 44 CSS px (WCAG 2.5.8 target size, the project's own rule), ignoring the skip link and inline text buttons. */
async function smallControls(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, summary')).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (r.height < 43.5 || r.width < 43.5) && !el.closest('.skip-link') && !el.classList.contains('text-button') && !el.classList.contains('inline');
  }).map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
}

/** Switch to French, check the screen, switch back to English. Always: no English left, no sideways scroll. Optional: axe (default on) and 44 px targets. */
async function inFrench(page: Page, label: string, options: { axe?: boolean; targets?: boolean } = {}) {
  await FR(page).click();
  await expect.poll(() => lang(page), { message: label }).toBe('fr');
  await page.waitForTimeout(150);
  expect(await englishLeaks(page), `English text left on screen in French mode: ${label}`).toEqual([]);
  expect(await noSidewaysScroll(page), `sideways scroll in French: ${label}`).toBeLessThanOrEqual(0);
  if (options.targets) expect(await smallControls(page), `controls under 44 px in French: ${label}`).toEqual([]);
  if (options.axe !== false) {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`)), `axe in French: ${label}`).toEqual([]);
  }
  await EN(page).click();
  await expect.poll(() => lang(page)).toBe('en');
}

test.describe('language switch', () => {
  test('English browsers open in English; the switch changes every screen and is remembered for the tab', async ({ page }) => {
    await resetDemo(page);
    expect(await lang(page)).toBe('en');
    await expect(EN(page)).toHaveAttribute('aria-pressed', 'true');
    const englishTitle = await page.title();
    await FR(page).click();
    await expect(FR(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await lang(page)).toBe('fr');
    expect(await page.title()).not.toBe(englishTitle);
    await page.reload();
    expect(await lang(page)).toBe('fr');
    await EN(page).click();
    expect(await page.title()).toBe(englishTitle);
  });

  test('?lang= wins over the stored choice', async ({ page }) => {
    await resetDemo(page);
    await page.goto('/?lang=fr');
    expect(await lang(page)).toBe('fr');
    await page.goto('/?lang=en');
    expect(await lang(page)).toBe('en');
  });
});

test.describe('French browser', () => {
  test.use({ locale: 'fr-FR' });
  test('a French browser opens the site in French, with no English text left on the first screen', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => lang(page)).toBe('fr');
    await expect(FR(page)).toHaveAttribute('aria-pressed', 'true');
    // wait for the guest session to open (the landing screen gives way to the app)
    await expect(page.getByRole('navigation', { name: 'Rubriques' })).toBeVisible();
    expect(await englishLeaks(page)).toEqual([]);
  });
});

test.describe('French walk: every screen, switched in place', () => {
  test('student screens', async ({ page }) => {
    test.setTimeout(240_000);
    await resetDemo(page);
    await inFrench(page, 'dashboard');
    await page.getByRole('button', { name: 'Lab map' }).click();
    await inFrench(page, 'laboratory map');
    await page.getByRole('button', { name: /^(Enter|Review) Hematology/ }).click();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await inFrench(page, 'laboratory lobby (Hematology)');
    // a mission with the point engine
    await page.getByRole('button', { name: /^(Start|Resume|Replay) Blood Smear Code$/ }).click();
    await expect(page.locator('.case-panel h1')).toBeVisible();
    await inFrench(page, 'point engine');
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await inFrench(page, 'point engine after a wrong answer');
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.locator('.hint-result')).toBeVisible();
    await inFrench(page, 'point engine with a hint');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await inFrench(page, 'result screen');
    await page.getByRole('button', { name: /Return to mission control/ }).click();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'progress and Code Vault');
    await page.getByRole('button', { name: 'Lab results' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'lab results');
    await page.getByRole('button', { name: 'Learning settings' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'learning settings');
    await page.getByRole('button', { name: 'About & demo guide' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'About and demo guide (student)');
  });

  test('every engine, for a learner who may open everything', async ({ page }) => {
    test.setTimeout(240_000);
    const token = await freshStudent();
    // Everything but the Master Lab is unlocked by finishing the missions through the API; each engine is then opened as a replay.
    for (const id of ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'bio-01', 'bio-02']) await completeMissionViaApi(token, id);
    await openAs(page, token);
    const engines: [string, number, string][] = [['hem-02', 0, 'decision'], ['mic-02', 0, 'order'], ['mic-03', 0, 'match'], ['bio-02', 0, 'point with a text version'], ['bio-03', 0, 'choice stepper']];
    for (const [mission, step, label] of engines) {
      await openAttemptAt(page, mission, step);
      await expect(page.locator('.case-panel h1')).toBeVisible();
      if (mission === 'bio-02') await page.getByText('Text version of this image', { exact: true }).click();
      await inFrench(page, `${label} (${mission})`);
    }
  });

  test('faculty screens', async ({ page }) => {
    test.setTimeout(240_000);
    await resetDemo(page);
    await openFaculty(page);
    await inFrench(page, 'faculty: class intelligence');
    await page.getByRole('button', { name: 'Student detail' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'faculty: student detail');
    await page.getByRole('button', { name: 'Content review' }).click();
    await expect(page.locator('.content-row').first()).toBeVisible();
    await inFrench(page, 'faculty: content review');
    await page.getByRole('button', { name: 'About & demo guide' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await inFrench(page, 'About and demo guide (faculty)');
  });
});

test.describe('switching in the middle of a mission loses nothing', () => {
  test('the attempt, the penalty and the timer survive a language switch, and the mission can be finished in French', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    const attempt = await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'));
    const penalty = await page.locator('.status-row').filter({ hasText: 'XP penalty' }).locator('dd').innerText();
    await FR(page).click();
    await expect.poll(() => lang(page)).toBe('fr');
    expect(await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'))).toBe(attempt);
    // the penalty is still on screen (same figure), now in French
    await expect(page.locator('.status-row').filter({ hasText: penalty.trim() }).first()).toBeVisible();
    // finish the mission with French labels
    await clickArtwork(page, ARTWORK.smear);
    await page.getByRole('button', { name: /Valider la réponse/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/terminée|terminé|complète/i);
    expect(await englishLeaks(page)).toEqual([]);
  });
});

test.describe('French error and edge states', () => {
  test('a wrong exit code, the lockout, an expired attempt and a server outage are all in French', async ({ page }) => {
    test.setTimeout(240_000);
    const token = await freshStudent();
    await completeLabViaApi(token, 'hematology', false);
    await openAs(page, token);
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    const input = page.getByLabel(/Exit code for Hematology Lab/);
    await input.fill('000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect code.');
    await inFrench(page, 'vault: incorrect code, attempts left');
    // five wrong codes lock the vault (the server counts: the correct code is refused for a while)
    for (let i = 0; i < 5 && !(await page.getByRole('alert').innerText()).includes('Too many'); i += 1) {
      await input.fill(`00${i}` === exitCode('hematology') ? '999' : `00${i}`);
      await page.getByRole('button', { name: 'Unlock' }).click();
      await page.waitForTimeout(200);
    }
    await inFrench(page, 'vault: locked out after too many wrong codes');
  });

  test('an expired attempt and a server outage', async ({ page }) => {
    test.setTimeout(200_000);
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const attempt = await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'));
    expireAttemptInDb(attempt!);
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Time is up.');
    await inFrench(page, 'expired attempt');
    await page.getByRole('button', { name: /Exit mission/ }).click();
    const down = await outage(page, '**/api/labs');
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await inFrench(page, 'server outage on the laboratory map');
    down.lift();
  });
});

test.describe('French on a phone', () => {
  test.use({ viewport: { width: 320, height: 700 } });
  test('no sideways scroll, no control under 44 px and no English at 320 px, from the dashboard to the result', async ({ page }) => {
    test.setTimeout(240_000);
    await resetDemo(page);
    await inFrench(page, 'phone: dashboard', { targets: true });
    await page.getByRole('button', { name: /Guest options/ }).click();
    await inFrench(page, 'phone: guest options sheet', { targets: true, axe: false });
    // Pressing the language buttons outside the sheet closes it; close it ourselves only if it is still open.
    if (await page.getByRole('button', { name: 'Close' }).isVisible()) await page.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Lab map' }).click();
    await inFrench(page, 'phone: laboratory map', { targets: true });
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await inFrench(page, 'phone: point mission', { targets: true });
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await inFrench(page, 'phone: result', { targets: true });
    await page.getByRole('button', { name: /Return to mission control/ }).click();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await inFrench(page, 'phone: progress and Code Vault', { targets: true });
    await page.getByRole('button', { name: 'About & demo guide' }).click();
    await inFrench(page, 'phone: About and demo guide', { targets: true });
  });

  test('the Lab Value Hacker text version and a decision mission fit a 320 px phone in French', async ({ page }) => {
    test.setTimeout(240_000);
    const token = await freshStudent();
    for (const id of ['hem-01', 'hem-02', 'hem-03', 'mic-01', 'mic-02', 'bio-01']) await completeMissionViaApi(token, id);
    await openAs(page, token);
    for (const [mission, label] of [['hem-02', 'decision'], ['mic-02', 'order'], ['mic-03', 'match'], ['bio-02', 'text version']] as const) {
      await openAttemptAt(page, mission, 0);
      await expect(page.locator('.case-panel h1')).toBeVisible();
      if (mission === 'bio-02') await page.getByText('Text version of this image', { exact: true }).click();
      await inFrench(page, `phone: ${label} (${mission})`, { targets: true });
    }
  });
});
