// The screen only PRESENTS what the server decided. Each test reads the server's own numbers through the API
// and compares them with what the page shows, then patches the server payload in flight to different numbers and
// requires the page to show the patched (server) values: a page that recomputed anything would fail the second half.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ARTWORK, apiCall, clickArtwork, freshStudent, openAs, patched, resetDemo, sessionToken, startMissionViaUi, submit, HOME_HEADING } from './support/helpers';

type Ledger = { id: string; label: string; reason: string; points: number; kind: string };
type ServerResult = {
  score: number; maxScore: number; xpAwarded: number; newBest: boolean; ledger: Ledger[];
  stats: { accuracyPct: number; elapsed: string; hintsUsed: number; wrongAnswers: number };
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const plural = (n: number) => `${n} hint${n === 1 ? '' : 's'}`;
const attemptIdOf = (page: Page) => page.evaluate(() => sessionStorage.getItem('escape-demo-attempt'));

/** Every figure of the result screen, compared with the server's payload. */
async function expectResultShows(page: Page, server: ServerResult) {
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  const stats = page.locator('.result-stats .stat');
  await expect(stats).toHaveCount(3);
  await expect(stats.nth(0).locator('strong')).toHaveText(`${server.score} of ${server.maxScore} XP`);
  await expect(stats.nth(1).locator('strong')).toHaveText(`${server.stats.accuracyPct}%`);
  await expect(stats.nth(1).locator('small')).toHaveText(`${server.stats.wrongAnswers} wrong · ${plural(server.stats.hintsUsed)}`);
  await expect(stats.nth(2).locator('strong')).toHaveText(server.stats.elapsed);
  if (server.newBest) await expect(page.locator('.result-lede').nth(1)).toHaveText(`New personal best: ${server.xpAwarded >= 0 ? '+' : ''}${server.xpAwarded} XP added to your total.`);
  else await expect(page.locator('.result-lede').nth(1)).toContainText('did not beat your best score');
  const rows = page.locator('.ledger li');
  await expect(rows).toHaveCount(server.ledger.length);
  for (const [i, row] of server.ledger.entries()) {
    const li: Locator = rows.nth(i);
    await expect(li.locator('span').first()).toContainText(row.label);
    await expect(li.locator('small')).toHaveText(row.reason);
    await expect(li.locator('b')).toHaveText(signed(row.points));
  }
}

/** Plays Blood Smear Code with one wrong answer, one hint and the right answer (a ledger with penalties). */
async function playWithMistakes(page: Page) {
  await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
  await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Not quite.');
  await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
  await expect(page.locator('.hint-result')).toBeVisible();
  await clickArtwork(page, ARTWORK.smear);
}

test.describe('the result screen shows exactly what the server stored', () => {
  test('score, maximum, XP, accuracy, time and every ledger row equal GET /attempts/:id/result', async ({ page }) => {
    await openAs(page, await freshStudent());
    await playWithMistakes(page);
    const id = (await attemptIdOf(page))!;
    await submit(page).click();
    const token = await sessionToken(page);
    const stored = await apiCall(token, `/attempts/${id}/result`);
    expect(stored.status).toBe(200);
    const server = stored.body as ServerResult;
    // The scenario really produced a rich result, so the comparison below is not trivially "0 = 0".
    expect(server.stats.wrongAnswers).toBe(1);
    expect(server.stats.hintsUsed).toBe(1);
    expect(server.ledger.length).toBeGreaterThanOrEqual(2);
    expect(server.ledger.some((row) => row.points < 0)).toBe(true);
    expect(server.newBest).toBe(true);
    expect(server.xpAwarded).toBeGreaterThan(0);
    await expectResultShows(page, server);

    // After a reload the screen is rebuilt from GET /result and shows the very same figures.
    await page.reload();
    await expectResultShows(page, server);
  });

  test('FAIL-CAPABLE: when the server payload says other numbers, the screen shows those (nothing is recomputed)', async ({ page }) => {
    await openAs(page, await freshStudent());
    await playWithMistakes(page);
    const invented = {
      score: 777, maxScore: 999, xpAwarded: 555, newBest: true,
      stats: { accuracyPct: 13, elapsed: '99:59', elapsedSec: 5999, hintsUsed: 6, wrongAnswers: 4, firstTrySteps: 0, steps: 1 },
      ledger: [
        { id: 'p1', label: 'Patched earning', reason: 'Invented by the test', points: 321, kind: 'earned' },
        { id: 'p2', label: 'Patched penalty', reason: 'Invented too', points: -45, kind: 'penalty' },
        { id: 'p3', label: 'Patched zero', reason: 'Nothing here', points: 0, kind: 'unearned' },
      ],
    };
    await page.route('**/api/attempts/*/answer', (route) => patched(route, (body) => ({ ...body, result: { ...body.result, ...invented } })));
    await submit(page).click();
    await expectResultShows(page, invented as unknown as ServerResult);
    // Nothing of the real figures leaks through next to the invented ones.
    await expect(page.locator('.result-stats')).not.toContainText('Server says');
    await expect(page.locator('.ledger li')).toHaveCount(3);
  });

  test('FAIL-CAPABLE: the reload path (GET /result) presents the patched server payload too', async ({ page }) => {
    await openAs(page, await freshStudent());
    await playWithMistakes(page);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    const invented = {
      score: 41, maxScore: 120, xpAwarded: -7, newBest: true,
      stats: { accuracyPct: 5, elapsed: '12:34', elapsedSec: 754, hintsUsed: 2, wrongAnswers: 9, firstTrySteps: 0, steps: 1 },
      ledger: [{ id: 'z1', label: 'Another invented row', reason: 'Only in this test', points: -3, kind: 'penalty' }],
    };
    await page.route('**/api/attempts/*/result', (route) => patched(route, (body) => ({ ...body, ...invented })));
    await page.reload();
    await expectResultShows(page, invented as unknown as ServerResult);
  });
});

test.describe('XP and level on the dashboard and in the lab results are the server record', () => {
  test('after a first completion the dashboard shows the server XP/level, and XP grew by exactly xpAwarded', async ({ page }) => {
    const token = await freshStudent();
    const before = await apiCall(token, '/dashboard');
    expect(before.status).toBe(200);
    await openAs(page, token);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    const answered = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/answer'));
    await submit(page).click();
    const reply = await (await answered).json();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await page.getByRole('button', { name: 'Investigations', exact: true }).click();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();

    const dash = (await apiCall(token, '/dashboard')).body as { user: { xp: number; level: number } };
    const me = (await apiCall(token, '/me')).body as { xp: number; level: number };
    expect({ xp: dash.user.xp, level: dash.user.level }).toEqual({ xp: me.xp, level: me.level });
    expect(dash.user.xp).toBe(before.body.user.xp + reply.result.xpAwarded);
    const shown = `Level ${dash.user.level} · ${new Intl.NumberFormat('en-US').format(dash.user.xp)} XP (server record)`;
    await expect(page.locator('.stats .stat').nth(2)).toContainText(shown);
  });

  test('FAIL-CAPABLE: the dashboard shows the XP/level the server sends, whatever they are', async ({ page }) => {
    await resetDemo(page);
    await page.route('**/api/dashboard', (route) => patched(route, (body) => ({ ...body, user: { ...body.user, level: 9, xp: 123456 } })));
    await page.reload();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
    await expect(page.locator('.stats .stat').nth(2)).toContainText('Level 9 · 123,456 XP (server record)');
  });

  test('lab results show the stored XP, mission scores and ledger of GET /labs/:slug/results', async ({ page }) => {
    await resetDemo(page);
    const token = await sessionToken(page);
    const stored = (await apiCall(token, '/labs/hematology/results')).body as {
      xp: number;
      missions: { title: string; score: number | null; maxScore: number }[];
      ledger: Ledger[];
    };
    expect(stored.missions.length).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Lab results', exact: true }).click();
    const lab = page.locator('.result-lab').first();
    await expect(lab.locator('.tag')).toHaveText(`${stored.xp} XP`);
    const rows = lab.locator('.mission-row');
    await expect(rows).toHaveCount(stored.missions.length);
    for (const [i, mission] of stored.missions.entries()) {
      await expect(rows.nth(i).locator('span')).toHaveText(mission.title);
      await expect(rows.nth(i).locator('b')).toHaveText(mission.score === null ? '—' : `${mission.score} of ${mission.maxScore} XP`);
    }
    const ledger = lab.locator('.ledger li');
    await expect(ledger).toHaveCount(stored.ledger.length);
    for (const [i, row] of stored.ledger.entries()) {
      await expect(ledger.nth(i).locator('b')).toHaveText(signed(row.points));
      await expect(ledger.nth(i)).toContainText(row.label);
    }
  });

  test('FAIL-CAPABLE: lab results present patched server figures, not recomputed ones', async ({ page }) => {
    await resetDemo(page);
    await page.route('**/api/labs/hematology/results', (route) => patched(route, (body) => ({
      ...body,
      xp: 31337,
      missions: body.missions.map((m: any, i: number) => ({ ...m, score: 1000 + i, maxScore: 2000 + i })),
    })));
    await page.getByRole('button', { name: 'Lab results', exact: true }).click();
    const lab = page.locator('.result-lab').first();
    await expect(lab.locator('.tag')).toHaveText('31337 XP');
    await expect(lab.locator('.mission-row b').first()).toHaveText('1000 of 2000 XP');
    await expect(lab.locator('.mission-row b').nth(1)).toHaveText('1001 of 2001 XP');
  });
});
