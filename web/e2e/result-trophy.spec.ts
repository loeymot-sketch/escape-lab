import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ARTWORK, ATTEMPT_KEY, apiCall, clickArtwork, completeLabViaApi, expireAttemptInDb, openAttemptAt, outage, patched, resetDemo, sessionToken, slow, startMissionViaUi, submit, watchProblems } from './support/helpers';
import { MISSION_BY_ID, correctResponse } from './support/content';

const rooms = [
  { slug: 'hematology', mission: 'hem-01', en: 'Hematology', fr: 'Hématologie' },
  { slug: 'microbiology', mission: 'mic-01', en: 'Microbiology', fr: 'Microbiologie' },
  { slug: 'biochemistry', mission: 'bio-01', en: 'Clinical Biochemistry', fr: 'Biochimie clinique' },
  { slug: 'master', mission: 'master-01', en: 'Master Lab', fr: 'Laboratoire Master' },
];

// Preparation uses the real public API in the isolated E2E database. No result is fabricated.
async function completedAttempt(page: Page, token: string, missionId: string) {
  if (missionId === 'master-01') for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
  const start = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  expect([200, 201]).toContain(start.status);
  const id = start.body.attempt.attemptId as string;
  for (const step of MISSION_BY_ID.get(missionId)!.steps) {
    const answer = await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
    expect(answer.status).toBe(200);
  }
  const result = await apiCall(token, `/attempts/${id}/result`);
  expect(result.status).toBe(200);
  await page.evaluate(([key, value]) => sessionStorage.setItem(key!, value!), [ATTEMPT_KEY, id]);
  return result.body;
}

async function geometry(page: Page) {
  const hero = page.locator('.result-hero');
  const image = hero.locator('img');
  await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1401);
  await expect(image).toHaveAttribute('alt', '');
  await expect(image).toHaveAttribute('aria-hidden', 'true');
  await expect(image).toHaveCSS('object-fit', 'contain');
  const measured = await hero.evaluate((el) => {
    const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
    const scene = box('img'), copy = box('.result-hero-copy'), lang = box('.result-lang'), eyebrow = box('.eyebrow');
    const title = box('h1'), mission = box('.result-hero-copy>p'), frame = el.getBoundingClientRect();
    return {
      ratio: scene.width / scene.height, naturalHeight: (el.querySelector('img') as HTMLImageElement).naturalHeight,
      titleClearance: eyebrow.top - lang.bottom, imageClearance: scene.top - copy.bottom,
      titleGap: title.top - eyebrow.bottom, missionGap: mission.top - title.bottom,
      imageInside: scene.left >= frame.left - .5 && scene.right <= frame.right + .5 && scene.bottom <= frame.bottom + .5,
      textInside: [eyebrow, title, mission, lang].every((r) => r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= scene.top),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(measured.naturalHeight).toBe(934);
  expect(Math.abs(measured.ratio - 1.5)).toBeLessThan(.001);
  expect(measured.titleClearance).toBeGreaterThanOrEqual(10);
  expect(measured.imageClearance).toBeGreaterThanOrEqual(-.5);
  expect(measured.titleGap).toBeGreaterThanOrEqual(10);
  expect(measured.missionGap).toBeGreaterThanOrEqual(8);
  expect(measured.imageInside).toBe(true);
  expect(measured.textInside).toBe(true);
  expect(measured.overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  const spacing = await hero.locator('h1').evaluate((el) => { const css = getComputedStyle(el); return Number.parseFloat(css.letterSpacing) / Number.parseFloat(css.fontSize); });
  expect(spacing).toBeCloseTo(-.02, 3);
  await debriefGeometry(page);
  for (const button of await page.locator('.result-screen').getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
}

async function debriefGeometry(page: Page) {
  const failures = await page.locator('.result-screen').evaluate((el) => {
    const frame = el.getBoundingClientRect();
    const boxes = [...el.querySelectorAll('.result-score-card,.result-stats .stat,.result-explanation,.ledger li,.result-actions button')];
    return boxes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < frame.left || rect.right > frame.right + .5 || node.scrollWidth > node.clientWidth + 1 ? [`${node.className}: clipped or outside result`] : [];
    });
  });
  expect(failures).toEqual([]);
  const wrappedStats = await page.locator('.result-stats .stat strong,.result-stats .stat>div>span').evaluateAll((elements) => elements.flatMap((el) => {
    const range = document.createRange(); range.selectNodeContents(el);
    const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    return new Set(lines.map((rect) => Math.round(rect.top))).size > 1 ? [el.textContent] : [];
  }));
  expect(wrappedStats).toEqual([]);
  const oneScoreLine = await page.locator('.result-score-top>b').evaluate((el) => {
    const range = document.createRange(); range.selectNodeContents(el);
    const boxes = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    // Different font sizes share a baseline but not their top coordinate. All runs must overlap vertically.
    return boxes.length > 0 && Math.max(...boxes.map((rect) => rect.top)) < Math.min(...boxes.map((rect) => rect.bottom));
  });
  expect(oneScoreLine).toBe(true);
  const actions = page.locator('.result-actions');
  await expect(actions.getByRole('button')).toHaveCount(3);
  const grid = (await actions.boundingBox())!, last = (await actions.getByRole('button').last().boundingBox())!;
  expect(Math.abs(last.width - grid.width)).toBeLessThanOrEqual(.5);
  expect(last.x).toBeCloseTo(grid.x, 0);
}

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]]) {
  for (const room of rooms) test(`trophy ${room.slug} ${width}: real debrief, complete image and translated text`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    const problems = watchProblems(page);
    const token = await resetDemo(page);
    const result = await completedAttempt(page, token, room.mission);
    await page.reload();
    const hero = page.locator('.result-hero');
    await expect(hero.locator('h1')).toHaveText('Investigation complete.');
    await expect(hero.locator('h1')).toBeFocused();
    await expect(hero.locator('.eyebrow')).toHaveText(`CASE COMPLETE ${room.en}`);
    await expect(page.locator('.result-score-top>b')).toHaveText(`${result.score} / ${result.maxScore} XP`);
    await expect(page.locator('.result-stats .stat').nth(0).locator('strong')).toHaveText(`${result.stats.accuracyPct}%`);
    await expect(page.locator('.result-stats .stat').nth(1).locator('strong')).toHaveText(result.stats.elapsed);
    await expect(hero.locator('img')).toHaveAttribute('src', /12\.webp/);
    expect(statSync(fileURLToPath(new URL('../src/assets/mission-result-trophy.webp', import.meta.url))).size).toBeLessThanOrEqual(300_000);
    await geometry(page);
    await page.mouse.move(0, 0);
    await expect(hero).toHaveScreenshot(`trophy-${room.slug}-en-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
    await hero.getByRole('button', { name: 'Français' }).click();
    await expect(hero.locator('h1')).toHaveText('Enquête terminée.');
    await expect(hero.locator('.eyebrow')).toHaveText(`DOSSIER TERMINÉ ${room.fr}`);
    await geometry(page);
    await page.mouse.move(0, 0);
    await expect(hero).toHaveScreenshot(`trophy-${room.slug}-fr-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
    if (width === 390) expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('result loading never celebrates before the result has actually arrived', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const token = await resetDemo(page);
  await completedAttempt(page, token, 'hem-01');
  const held = await slow(page, '**/api/attempts/*/result');
  try {
    await page.reload();
    await expect(page.getByText('Loading your result…', { exact: true })).toBeVisible();
    await expect(page.locator('.result-hero')).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await expect(page.locator('.result-screen')).toHaveScreenshot('result-loading-320.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  } finally { held.release(); }
  await expect(page.locator('.result-hero h1')).toBeVisible();
  await geometry(page);
});

test('failed result fetch has no trophy; Retry restores the real debrief', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const token = await resetDemo(page);
  await completedAttempt(page, token, 'hem-01');
  const failed = await outage(page, '**/api/attempts/*/result', { status: 500, contentType: 'application/json', body: '' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The result could not be loaded' })).toBeVisible();
  await expect(page.locator('.result-hero')).toHaveCount(0);
  for (const lang of ['en', 'fr']) {
    if (lang === 'fr') await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.locator('.result-lang button[aria-pressed="true"]')).toHaveText(lang.toUpperCase());
    if (lang === 'fr') await expect(page.locator('.state-panel h1')).not.toHaveText('The result could not be loaded');
    await expect(page.locator('.state-panel p')).toHaveText(lang === 'en' ? 'The server had a problem. Please retry.' : 'Le serveur a rencontré un problème. Veuillez réessayer.');
    const gap = await page.locator('.result-screen').evaluate((el) => el.querySelector('.state-panel h1')!.getBoundingClientRect().top - el.querySelector('.result-lang')!.getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(10);
    for (const button of await page.locator('.result-screen button').all()) {
      const rect = (await button.boundingBox())!;
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.mouse.move(0, 0);
    await expect(page.locator('.result-screen')).toHaveScreenshot(`result-error-${lang}-320.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  }
  failed.lift();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.locator('.result-hero h1')).toHaveText('Enquête terminée.');
  await geometry(page);
});

for (const width of [320, 1280]) test(`penalized result ${width}: full debrief, real server figures and all actions fit`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  const problems = watchProblems(page);
  const token = await resetDemo(page);
  await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
  const id = await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY);
  await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Not quite.');
  await page.getByRole('button', { name: 'Ask Lab Assistant', exact: true }).click();
  await expect(page.locator('.hint-result')).toBeVisible();
  await clickArtwork(page, ARTWORK.smear);
  await submit(page).click();
  await expect(page.locator('.result-hero h1')).toBeVisible();
  const server = await apiCall(token, `/attempts/${id}/result`);
  expect(server.status).toBe(200);
  // Vault context is part of GET /result, not of the immediate answer receipt.
  await page.reload();
  await expect(page.locator('.result-hero h1')).toBeVisible();
  expect(server.body.stats.wrongAnswers).toBe(1);
  expect(server.body.stats.hintsUsed).toBe(1);
  expect(server.body.score).toBeLessThan(server.body.maxScore);
  expect(server.body.stats.elapsedSec).toBeLessThanOrEqual(60); // The whole test is bounded to 30s; this run earns the full time bonus.
  expect(server.body.ledger.some((row: { points: number }) => row.points < 0)).toBe(true);
  await expect(page.locator('.result-score-top>b')).toHaveText(`${server.body.score} / ${server.body.maxScore} XP`);
  await expect(page.locator('.result-stats .stat').nth(0).locator('strong')).toHaveText(`${server.body.stats.accuracyPct}%`);
  await expect(page.locator('.result-stats .stat').nth(0).locator('small')).toHaveText('1 wrong · 1 hint');
  await expect(page.locator('.result-stats .stat').nth(1).locator('strong')).toHaveText(server.body.stats.elapsed);
  await expect(page.getByRole('progressbar', { name: 'Score', exact: true })).toHaveAttribute('aria-valuenow', String(server.body.score));
  const ledger = page.locator('.ledger li');
  await expect(ledger).toHaveCount(server.body.ledger.length);
  for (const [index, row] of server.body.ledger.entries()) {
    await expect(ledger.nth(index).locator('span').first()).toContainText(row.label);
    await expect(ledger.nth(index).locator('small')).toHaveText(row.reason);
    await expect(ledger.nth(index).locator('b')).toHaveText(`${row.points > 0 ? '+' : ''}${row.points}`);
  }
  expect(server.body.newBest).toBe(false);
  expect(server.body.xpAwarded).toBe(0);
  await expect(page.locator('.result-xp-note')).toHaveText('This replay did not beat your best score, so your total XP is unchanged.');
  const slots = server.body.fragments.map((digit: number | null) => digit === null ? '·' : String(digit)).join(' ');
  await expect(page.locator('.result-lede').filter({ hasText: 'Vault progress for this laboratory:' })).toHaveText(`Vault progress for this laboratory: ${slots}`);
  await geometry(page);
  // A declared visual fixture stabilizes ONLY the official elapsed text and its ledger sentence.
  // Score, penalties, accuracy, XP, fragments and badges remain the real GET result above.
  await page.route('**/api/attempts/*/result', (route) => patched(route, (body) => ({ ...body,
    stats: { ...body.stats, elapsed: '00:42', elapsedSec: 42 },
    ledger: body.ledger.map((row: { reason: string }) => ({ ...row, reason: row.reason.replace(body.stats.elapsed, '00:42') })),
  })));
  await page.reload();
  await expect(page.locator('.result-stats .stat').nth(1).locator('strong')).toHaveText('00:42');
  await geometry(page);
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.mouse.move(0, 0);
  await expect(page.locator('.result-screen')).toHaveScreenshot(`penalized-result-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  if (width === 320) {
    await page.getByRole('button', { name: 'Français' }).click();
    await expect(page.getByRole('region', { name: 'Score de la mission', exact: true })).toBeVisible();
    await expect(page.locator('.result-stats .stat').nth(1).locator('small')).toHaveText('Minuteur officiel');
    await expect(page.getByRole('list', { name: 'Détail du score', exact: true })).toHaveCount(1);
    await expect(page.locator('.result-stats .stat').nth(0).locator('small')).toHaveText('1 mauvaise réponse · 1 indice');
    await expect(page.locator('.result-xp-note')).toHaveText('Cette partie rejouée n’a pas battu votre meilleur score : votre total d’XP reste inchangé.');
    await expect(page.locator('.result-lede').filter({ hasText: 'Progression du coffre pour ce laboratoire' })).toHaveText(`Progression du coffre pour ce laboratoire : ${slots}`);
    const codeGroup = server.body.fragments.map((digit: number | null) => digit === null ? '·' : String(digit)).join('\u00a0');
    const codeLines = await page.locator('.result-lede').filter({ hasText: 'Progression du coffre pour ce laboratoire' }).evaluate((el, code) => {
      const node = [...el.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent!.includes(code))!;
      const start = node.textContent!.indexOf(code);
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + code.length);
      return range.getClientRects().length;
    }, codeGroup);
    expect(codeLines).toBe(1);
    await geometry(page);
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.mouse.move(0, 0);
    await expect(page.locator('.result-screen')).toHaveScreenshot('penalized-result-fr-320.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  }
  expect(await sessionToken(page)).toBe(token);
  expect(problems).toEqual([]);
});

test('an expired unfinished attempt does not show a completion trophy', async ({ page }) => {
  await resetDemo(page);
  const id = await openAttemptAt(page, 'bio-01');
  expireAttemptInDb(id);
  await page.reload();
  await expect(page.getByRole('timer', { name: 'Time is up', exact: true })).toBeVisible();
  await expect(page.locator('.result-hero')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toHaveCount(0);
});
