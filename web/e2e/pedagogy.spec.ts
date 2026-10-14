// The visible pedagogical loop (2026-10-15): every new figure on screen is compared with the API that produced it.
// Journal during a mission, debrief after it, exit opened with the earned fragments, lobby mastery and route, dashboard recommendation.
import { expect, test } from '@playwright/test';
import { ATTEMPT_KEY, DECISION, apiCall, completeLabViaApi, navigateSection, openAttemptAt, patched, resetDemo, startMissionViaUi, submit } from './support/helpers';
import { MISSION_BY_ID, correctResponse, exitCode } from './support/content';

type JournalRow = { ordinal: number; stepId: string; competency: string; state: string; wrong: number; hints: number };

test('the investigation journal mirrors GET /attempts/:id after a wrong answer, a hint and a solved step', async ({ page }) => {
  const token = await resetDemo(page);
  const id = await openAttemptAt(page, 'hem-02');
  const rows = page.locator('.journal-row');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('.journal-summary')).toHaveText('0 of 3 steps proven');
  // A deliberate mistake, then a hint, then the right call.
  await page.getByRole('button', { name: DECISION.accept }).click();
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Not quite.');
  await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
  await expect(page.locator('.hint-result')).toBeVisible();
  await page.getByRole('button', { name: DECISION.reject }).click();
  await submit(page).click();
  await expect(page.locator('.step-review')).toBeVisible();
  const server = (await apiCall(token, `/attempts/${id}`)).body as { journal: JournalRow[] };
  expect(server.journal.map((r) => r.state)).toEqual(['solved', 'current', 'upcoming']);
  expect(server.journal[0]).toMatchObject({ wrong: 1, hints: 1 });
  await expect(rows).toHaveCount(3);
  for (const [i, row] of server.journal.entries()) {
    await expect(rows.nth(i)).toHaveAttribute('data-state', row.state);
    await expect(rows.nth(i).locator('b')).toHaveText(row.competency);
  }
  await expect(rows.nth(0).locator('small')).toHaveText('Proven · 1 wrong · 1 hint');
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(rows.nth(2).locator('small')).toHaveText('Upcoming');
  await expect(page.locator('.journal-summary')).toHaveText('1 of 3 steps proven');
  // The journal never shows a prompt of an upcoming step.
  const upcoming = MISSION_BY_ID.get('hem-02')!.steps[2]!.prompt;
  await expect(page.locator('.journal-card')).not.toContainText(upcoming);
});

test('the debrief shows the previous best, the competencies, every step and the recommendation of GET /attempts/:id/result', async ({ page }) => {
  const token = await resetDemo(page);
  // Replay a mission the demo learner already completed: the server has a previous best to report.
  await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
  const id = await page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY);
  const steps = MISSION_BY_ID.get('hem-02')!.steps;
  for (const step of steps.slice(0, 2)) expect((await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } })).status).toBe(200);
  await page.reload();
  await page.getByRole('button', { name: DECISION.reject }).click(); // a deliberate mistake on the last step
  await submit(page).click();
  await expect(page.getByRole('alert')).toContainText('Not quite.');
  await page.getByRole('button', { name: DECISION.accept }).click();
  await submit(page).click();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  const result = (await apiCall(token, `/attempts/${id}/result`)).body as {
    score: number; previousBest: number; steps: { ordinal: number; prompt: string; wrong: number; explanation: string }[];
    competencies: { name: string; pct: number }[]; recommended: { missionId: string; title: string; reason: string } | null;
    continue: { kind: string; missionId: string | null; title: string } | null;
  };
  expect(result.previousBest).toBeGreaterThan(0);
  await expect(page.locator('.result-progress')).toContainText(`Previous best ${result.previousBest.toLocaleString('en')} XP`);
  await expect(page.locator('.result-progress')).toContainText(`Now ${result.score.toLocaleString('en')} XP`);
  const delta = result.score - result.previousBest;
  await expect(page.locator('.result-progress-delta')).toHaveText(delta > 0 ? `+${delta} XP better than your best` : delta < 0 ? `${delta} XP below your best` : 'Equal to your best');
  const bars = page.locator('.result-competencies .bar-row');
  await expect(bars).toHaveCount(result.competencies.length);
  for (const [i, c] of result.competencies.entries()) {
    await expect(bars.nth(i).locator('span').first()).toContainText(c.name);
    await expect(bars.nth(i).locator('b')).toHaveText(`${c.pct}%`);
  }
  const debrief = page.locator('.debrief-list > li');
  await expect(debrief).toHaveCount(result.steps.length);
  for (const [i, s] of result.steps.entries()) {
    await expect(debrief.nth(i).locator('.debrief-prompt')).toHaveText(s.prompt);
    await expect(debrief.nth(i).locator('.debrief-meta')).toContainText(s.wrong > 0 ? `${s.wrong} wrong` : 'First try');
    await debrief.nth(i).locator('summary').click();
    await expect(debrief.nth(i).locator('details > p').last()).toHaveText(s.explanation);
  }
  expect(result.steps[2]!.wrong).toBe(1);
  // The demo learner's next step after Fix the Sample is the lab's next unfinished mission (Microbiology's Petri Dish Mystery): it comes
  // first, exactly as Mission control says, and the recommendation is only a second line.
  expect(result.continue).toMatchObject({ kind: 'mission' });
  expect(result.continue!.missionId).not.toBe('hem-02');
  await expect(page.locator('.result-next h2')).toHaveText(result.continue!.title);
  // Hematology is complete for the demo learner: the next step lives in another laboratory, and the wording says so.
  await expect(page.locator('.result-next')).toContainText('Next mission on your route.');
  expect(result.recommended).not.toBeNull();
  if (result.recommended!.missionId !== result.continue!.missionId) await expect(page.locator('.result-next-secondary')).toContainText(result.recommended!.title);
  await expect(page.locator('.result-actions').getByRole('button')).toHaveCount(3);
});

test('the exit opens from the debrief with the earned fragments, without typing a code, and only when the vault is complete', async ({ page }) => {
  const token = await resetDemo(page);
  // Microbiology: two missions done by the demo learner; finishing the third completes the vault.
  await completeLabViaApi(token, 'microbiology', false);
  const before = (await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'microbiology');
  expect(before.complete).toBe(true);
  expect(before.exited).toBe(false);
  const start = await apiCall(token, '/missions/mic-01/start', { method: 'POST' });
  const id = start.body.attempt.attemptId as string;
  for (const step of MISSION_BY_ID.get('mic-01')!.steps) await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
  await page.evaluate(([k, v]) => sessionStorage.setItem(k!, v!), [ATTEMPT_KEY, id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  const exit = page.locator('.result-exit');
  await expect(exit).toBeVisible();
  await expect(exit).toContainText(exitCode('microbiology').split('').join(' '));
  await expect(page.locator('.result-exit input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open the laboratory exit' }).click();
  await expect(page.locator('.result-exit.escaped')).toContainText('Microbiology Lab unlocked.');
  const after = (await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'microbiology');
  expect(after.exited).toBe(true);
  // Reloading the same result: the lab is exited, so the exit block is gone and the vault line still shows the digits.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  await expect(page.locator('.result-exit')).toHaveCount(0);
});

test('a refusal from the unlock route is shown as sent and nothing is retried', async ({ page }) => {
  const token = await resetDemo(page);
  await completeLabViaApi(token, 'microbiology', false);
  const start = await apiCall(token, '/missions/mic-01/start', { method: 'POST' });
  const id = start.body.attempt.attemptId as string;
  for (const step of MISSION_BY_ID.get('mic-01')!.steps) await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
  await page.evaluate(([k, v]) => sessionStorage.setItem(k!, v!), [ATTEMPT_KEY, id]);
  let calls = 0;
  await page.route('**/api/labs/microbiology/unlock', (route) => { calls += 1; return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '600' }, body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many incorrect codes. Wait before trying again.', details: { retryAfterSeconds: 600 } } }) }); });
  await page.reload();
  await page.getByRole('button', { name: 'Open the laboratory exit' }).click();
  await expect(page.locator('.result-exit [role="alert"]')).toContainText('Too many incorrect codes');
  await expect(page.getByRole('button', { name: 'Open the laboratory exit' })).toBeEnabled();
  expect(calls).toBe(1);
  expect((await apiCall(token, '/vault')).body.vaults.find((v: { labSlug: string }) => v.labSlug === 'microbiology').exited).toBe(false);
});

test('the lobby route and chips carry the server mastery, the fragments and the exit state', async ({ page }) => {
  const token = await resetDemo(page);
  await navigateSection(page, 'Lab map');
  await page.getByRole('button', { name: /^(Enter|Review) Hematology/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
  const lobby = (await apiCall(token, '/labs/hematology')).body as { missions: { id: string; state: string; mastery: string | null }[]; vault: { slots: (number | null)[]; complete: boolean; exited: boolean } };
  const stops = page.locator('.route-stop');
  await expect(stops).toHaveCount(lobby.missions.length);
  for (const [i, m] of lobby.missions.entries()) {
    await expect(stops.nth(i)).toHaveAttribute('data-state', m.state);
    if (m.mastery) await expect(stops.nth(i)).toHaveAttribute('data-mastery', m.mastery);
    const row = page.locator('.picker-row').nth(i);
    if (m.state === 'completed') {
      await expect(row).toContainText('Completed');
      if (m.mastery === 'mastered') await expect(row.locator('.mastery-chip')).toHaveText('Mastered');
      if (m.mastery === 'review') await expect(row.locator('.mastery-chip')).toHaveText('To review');
      if (m.mastery === 'completed') await expect(row.locator('.mastery-chip')).toHaveCount(0);
    }
  }
  await expect(page.locator('.route-fragment.found')).toHaveCount(lobby.vault.slots.filter((d) => d !== null).length);
  await expect(page.locator('.route-exit')).toHaveAttribute('data-exit', lobby.vault.exited ? 'open' : lobby.vault.complete ? 'ready' : 'sealed');
  // Mastery is the server's reading, not a client threshold: a patched payload is shown as sent.
  await page.route('**/api/labs/hematology', (route) => patched(route, (body) => ({ ...body, missions: body.missions.map((m: { id: string }) => (m.id === 'hem-01' ? { ...m, mastery: 'review' } : m)) })));
  // No URL routing: a reload lands on the dashboard, so the lobby is reopened through the map.
  await page.reload();
  await navigateSection(page, 'Lab map');
  await page.getByRole('button', { name: /^(Enter|Review) Hematology/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
  await expect(page.locator('.picker-row').nth(0).locator('.mastery-chip')).toHaveText('To review');
  await page.unrouteAll({ behavior: 'wait' });
});

test('the dashboard recommendation is the server\'s, with its reason', async ({ page }) => {
  const token = await resetDemo(page);
  const dashboard = (await apiCall(token, '/dashboard')).body as { recommended: { missionId: string; title: string; reason: string } | null; continue: { missionId: string | null } | null };
  // The prepared demo learner always has a recommendation distinct from the continue target: the block must be there.
  expect(dashboard.recommended).not.toBeNull();
  expect(dashboard.recommended!.missionId).not.toBe(dashboard.continue?.missionId);
  await expect(page.locator('.dashboard-recommended h2')).toHaveText(dashboard.recommended!.title);
  await expect(page.locator('.dashboard-recommended')).toContainText(dashboard.recommended!.reason);
  await page.locator('.dashboard-recommended').getByRole('button').click();
  await expect(page.locator('.case-panel h1')).toBeVisible();
  await expect(page.locator('.player-title b')).toHaveText(dashboard.recommended!.title);
});

test('starting the next mission from the debrief reports a refusal on the debrief itself', async ({ page }) => {
  const token = await resetDemo(page);
  const start = await apiCall(token, '/missions/hem-02/start', { method: 'POST' });
  const id = start.body.attempt.attemptId as string;
  for (const step of MISSION_BY_ID.get('hem-02')!.steps) await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
  await page.evaluate(([k, v]) => sessionStorage.setItem(k!, v!), [ATTEMPT_KEY, id]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  await page.route('**/api/missions/*/start', (route) => route.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '30' }, body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many mission starts. Wait before trying again.' } }) }));
  const button = page.locator('.result-next-start');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('.result-next [role="alert"]')).toContainText('Too many mission starts');
  await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  await expect(button).toBeEnabled();
});
