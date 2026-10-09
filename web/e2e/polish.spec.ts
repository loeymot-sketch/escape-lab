import { expect, test, type Page } from '@playwright/test';
import { ARTWORK, CONTINUE_HEADING, DECISION, FIRST_VISIT_HEADING, apiCall, clickArtwork, completeLabViaApi, completeMissionViaApi, freshStudent, json, openAs, openAttemptAt, openFaculty, openHome, patched, resetDemo, sessionToken, startMissionViaUi, submit, teacherToken, watchProblems } from './support/helpers';
import { auditPage } from './support/audit';

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

test.describe('decision and choice options: lettered chips, never the raw option id', () => {
  test('a decision step shows A/B/C chips and the full labels, with no raw id and no clipping', async ({ page }) => {
    await resetDemo(page);
    await openAttemptAt(page, 'hem-02', 0);
    const buttons = page.locator('.answer-options button');
    await expect(buttons).toHaveCount(3);
    await expect(page.locator('.answer-options .chip')).toHaveText(['A', 'B', 'C']);
    await expect(buttons.nth(0)).toContainText('Accept and report');
    await expect(buttons.nth(1)).toContainText('Reject and request a new sample');
    await expect(buttons.nth(2)).toContainText('Correct the interference and re-measure');
    const texts = await buttons.allInnerTexts();
    for (const text of texts) expect(text).not.toMatch(/\b(accept|reject|repeat)\b(?!\s+(and|the))/);
    for (const text of texts) expect(text.replace(/\s+/g, ' ')).toMatch(/^[ABC] /);
    // Nothing is clipped: each button's content fits its box.
    const fits = await buttons.evaluateAll((els) => els.map((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1));
    expect(fits).toEqual([true, true, true]);
    // The chip is decoration: the accessible name is the label alone, and selecting still works by label.
    await expect(page.getByRole('button', { name: DECISION.reject })).toHaveAccessibleName('Reject and request a new sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await expect(page.getByRole('button', { name: DECISION.reject })).toHaveAttribute('aria-pressed', 'true');
    await expect(submit(page)).toBeEnabled();
  });

  test('the longest option of the Master Lab decision step wraps inside its button', async ({ page }) => {
    await resetDemo(page);
    const token = await sessionToken(page);
    for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
    try {
      await openAttemptAt(page, 'master-01', 3);
      const longest = page.locator('.answer-options button').filter({ hasText: 'Alert the clinician' });
      await expect(longest.locator('.chip')).toHaveText('C');
      expect(await longest.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    } finally {
      await apiCall(token, '/demo/reset', { method: 'POST' });
    }
  });
});

test.describe('friendly wording instead of step-type jargon', () => {
  test('the case header and the lab lobby use plain labels', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Lab map');
    await page.getByRole('button', { name: 'Review Hematology Lab' }).click();
    const lobby = await page.locator('.mission-picker').innerText();
    expect(lobby).toContain('Spot the finding · Difficulty: Foundation');
    expect(lobby).toContain('Make the call');
    expect(lobby).not.toMatch(/Image identify|Stepper|Decision ·|Matching|Choice ·/);
    await page.getByRole('button', { name: /^Replay Blood Smear Code$/ }).click();
    await expect(page.locator('.case-meta span').last()).toHaveText('Spot the finding');
    await page.getByRole('button', { name: '← Exit mission' }).click();
    for (const [mission, step, label] of [['hem-02', 0, 'Make the call'], ['mic-02', 0, 'Put in order'], ['mic-03', 0, 'Match the pairs'], ['mic-01', 0, 'Reason it through']] as const) {
      await openAttemptAt(page, mission, step);
      await expect(page.locator('.case-meta span').last()).toHaveText(label);
    }
  });
});

test.describe('illustrative image label and marker', () => {
  test('the label sits below the image, outside the clickable area, and clicks near it still register on the image', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const image = (await page.locator('.scientific').boundingBox())!;
    const chip = (await page.locator('.image-watermark').boundingBox())!;
    await expect(page.locator('.image-watermark')).toHaveText('Illustrative training image');
    expect(chip.y).toBeGreaterThanOrEqual(image.y + image.height - 1);
    expect(await page.locator('.image-watermark').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    // The corner where the label used to sit now registers a click on the artwork.
    await page.locator('.scientific').click({ position: { x: 20, y: 18 } });
    await expect(page.locator('.marker')).toBeVisible();
    const marker = (await page.locator('.marker').boundingBox())!;
    expect(Math.abs(marker.x + marker.width / 2 - (image.x + 20))).toBeLessThan(2);
    // And so does a click on the bottom edge, right above the label.
    await page.locator('.scientific').click({ position: { x: 60, y: image.height - 4 } });
    expect(Math.abs((await page.locator('.marker').boundingBox())!.x + marker.width / 2 - (image.x + 60))).toBeLessThan(3);
  });

  test('the hotspot marker is a ring centred on the key and leaves the value readable', async ({ page }) => {
    await resetDemo(page);
    const token = await sessionToken(page);
    await completeMissionViaApi(token, 'bio-01');
    await openAttemptAt(page, 'bio-02', 0);
    await clickArtwork(page, ARTWORK.panel);
    const marker = page.locator('.marker');
    const box = (await marker.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(28);
    expect(await marker.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    const image = (await page.locator('.scientific-image').boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (image.x + (image.width * ARTWORK.panel.x) / ARTWORK.panel.width))).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - (image.y + (image.height * ARTWORK.panel.y) / ARTWORK.panel.height))).toBeLessThan(2);
  });
});

test.describe('leaderboard never prints arithmetic that is false', () => {
  test('a learner outside any class gets a neutral empty state: no row, no gap, no count', async ({ page }) => {
    await openAs(page, await freshStudent());
    await nav(page, 'Progress');
    await expect(page.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The leaderboard is not available yet' })).toBeVisible();
    await expect(page.getByText('The class leaderboard appears when your learning group is set up.')).toBeVisible();
    await expect(page.locator('.leaderboard-row')).toHaveCount(0);
    await expect(page.locator('.leaderboard-gap')).toHaveCount(0);
    await expect(page.getByText(/Showing \d+ of \d+ ranked students/)).toHaveCount(0);
    expect(await page.locator('.leaderboard-panel').innerText()).not.toMatch(/#1|0 XP|…/);
  });

  test('a class learner still sees real rows and a true count', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Progress');
    const count = page.locator('.leaderboard-panel .list-count');
    await expect(count).toBeVisible();
    const [, shown, total] = (await count.innerText()).match(/Showing (\d+) of (\d+) ranked students\./)!.map(Number);
    expect(shown).toBe(await page.locator('.leaderboard-row').count());
    expect(total).toBeGreaterThanOrEqual(shown!);
  });

  test('no gap row when the learner is the next rank after the listed rows', async ({ page }) => {
    await page.route('**/api/leaderboard**', (route) => patched(route, (b) => ({ ...b, rows: b.rows.slice(0, 3).map((r: any) => ({ ...r, you: false })), me: { rank: 4, name: 'Me', xp: 5, labs: 0, accuracyPct: null, you: true }, total: 4 })));
    await openHome(page);
    await nav(page, 'Progress');
    await expect(page.locator('.leaderboard-row')).toHaveCount(4);
    await expect(page.locator('.leaderboard-gap')).toHaveCount(0);
    await expect(page.getByText('Showing 4 of 4 ranked students.')).toBeVisible();
  });
});

test.describe('dashboard heading follows the learner', () => {
  test('a fresh learner is invited to start', async ({ page }) => {
    await openAs(page, await freshStudent());
    await expect(page.getByRole('heading', { name: FIRST_VISIT_HEADING })).toBeVisible();
    await expect(page.getByRole('heading', { name: CONTINUE_HEADING })).toHaveCount(0);
  });

  test('the demo learner, who has progress, is invited to continue', async ({ page }) => {
    await resetDemo(page);
    await expect(page.getByRole('heading', { name: CONTINUE_HEADING })).toBeVisible();
    await expect(page.getByRole('heading', { name: FIRST_VISIT_HEADING })).toHaveCount(0);
  });
});

test.describe('lab results', () => {
  test('with no escaped lab, the empty state offers a way forward', async ({ page }) => {
    await openAs(page, await freshStudent());
    await nav(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'No escaped lab yet' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to the laboratory map' }).click();
    await expect(page.getByRole('heading', { name: 'Laboratory map', exact: true })).toBeVisible();
  });

  test('the Master Lab results render once escaped (one mission, ledger, competencies, badge) with no console error and no 4xx', async ({ page }) => {
    const problems = watchProblems(page);
    const token = await resetDemo(page);
    try {
      // Before the escape the server refuses, and the page lists no Master Lab result.
      expect((await apiCall(token, '/labs/master/results')).status).toBe(409);
      for (const slug of ['hematology', 'microbiology', 'biochemistry', 'master']) await completeLabViaApi(token, slug);
      const server = await apiCall(token, '/labs/master/results');
      expect(server.status).toBe(200);
      expect(server.body.badge.id).toBe('clinical-detective');
      await page.reload();
      await nav(page, 'Lab results');
      const master = page.locator('.result-lab').filter({ hasText: 'Master Lab' });
      await expect(master).toBeVisible();
      await expect(page.locator('.result-lab')).toHaveCount(4);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(master.getByRole('heading', { name: 'Escape confirmed' })).toBeVisible();
      await expect(master.locator('.tag')).toHaveText(`${server.body.xp} XP`);
      await expect(master.locator('.mission-row')).toHaveCount(1);
      await expect(master.locator('.mission-row')).toContainText(server.body.missions[0].title);
      await expect(master.getByRole('list', { name: 'Master Lab score ledger' }).getByRole('listitem')).toHaveCount(server.body.ledger.length);
      await expect(master.getByRole('list', { name: 'Master Lab badge' })).toContainText('Clinical Detective');
      const bars = master.getByRole('list', { name: 'Master Lab competencies' }).getByRole('listitem');
      await expect(bars).toHaveCount(server.body.competencies.length);
      expect(server.body.competencies.length).toBeGreaterThan(0);
      for (const [i, c] of (server.body.competencies as { name: string; pct: number }[]).entries()) {
        await expect(bars.nth(i)).toContainText(c.name);
        await expect(bars.nth(i)).toContainText(`${c.pct}%`);
      }
      expect(problems).toEqual([]);
    } finally {
      await apiCall(token, '/demo/reset', { method: 'POST' });
    }
  });
});

test.describe('coming-soon cards and settings feedback', () => {
  test('a coming-soon lab has a neutral emblem and one label, no lock', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Lab map');
    const card = page.locator('.lab-card').filter({ hasText: 'Immunology' });
    await expect(card.getByText('Coming soon')).toHaveCount(1);
    await expect(card.locator('svg[aria-label]')).toHaveCount(0);
    await expect(card.getByRole('img')).toHaveCount(0);
    const emblem = await card.locator('.lab-emblem').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, svg: el.querySelectorAll('svg').length }));
    expect(emblem.svg).toBe(1);
    expect(emblem.bg).not.toBe('rgb(255, 255, 255)');
    await expect(page.getByText('Coming soon')).toHaveCount(await page.locator('.lab-card .soon').count());
  });

  test('saving a setting shows a visible "Preferences saved" confirmation above the options', async ({ page }) => {
    await resetDemo(page);
    await nav(page, 'Learning settings');
    const first = page.getByRole('checkbox').first();
    const before = await first.isChecked();
    await first.click();
    const saved = page.getByRole('status').filter({ hasText: 'Preferences saved' });
    await expect(saved).toBeVisible();
    const rows = (await page.locator('.setting-row').first().boundingBox())!;
    expect((await saved.boundingBox())!.y).toBeLessThan(rows.y);
    await first.setChecked(before);
  });
});

test.describe('faculty copy and data', () => {
  test('mission signal: the server-flagged mission is first and called out; no mission claims "On track"', async ({ page }) => {
    const teacher = await teacherToken();
    const classes = await apiCall(teacher, '/classes');
    const analytics = await apiCall(teacher, `/classes/${classes.body.classes[0].id}/analytics`);
    const flagged = (analytics.body.missions as { title: string; needsAttention: boolean; successPct: number | null }[]).filter((m) => m.needsAttention);
    expect(flagged.length).toBeGreaterThan(0);
    await openHome(page);
    await openFaculty(page);
    const panel = page.locator('.teacher-panel').first();
    await expect(panel.locator('.flag-pill')).toHaveCount(flagged.length);
    await expect(panel.locator('li.mission-signal').first()).toContainText(flagged[0]!.title);
    await expect(panel.locator('li.mission-signal').first()).toContainText('Needs attention');
    await expect(panel).not.toContainText('On track');
    // Every listed mission shows its server percentage next to a bar.
    await expect(panel.locator('li.mission-signal .bar')).toHaveCount(8);
    await expect(panel.locator('li.mission-signal').first()).toContainText(`accuracy ${flagged[0]!.successPct}%`);
  });

  test('student detail: no developer wording, correct plurals, and the lab and competency breakdown', async ({ page }) => {
    const teacher = await teacherToken();
    const classes = await apiCall(teacher, '/classes');
    const classId = classes.body.classes[0].id as number;
    const roster = await apiCall(teacher, `/classes/${classId}/students`);
    const first = roster.body.students[0];
    const detail = await apiCall(teacher, `/classes/${classId}/students/${first.id}`);
    await openHome(page);
    await openFaculty(page);
    await nav(page, 'Student detail');
    await expect(page.locator('.profile-card h2')).toHaveText(first.name);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/teacher-scoped|Server-scoped|API/);
    expect(body).not.toMatch(/\b1 answers\b|\b1 hints\b|\b1 missions\b/);
    const labs = page.getByRole('list', { name: 'Progress by laboratory' }).getByRole('listitem');
    await expect(labs).toHaveCount(detail.body.labs.length);
    for (const [i, lab] of (detail.body.labs as { name: string; completed: number; total: number }[]).entries()) {
      await expect(labs.nth(i)).toContainText(lab.name);
      await expect(labs.nth(i)).toContainText(`${lab.completed}/${lab.total}`);
    }
    const comps = page.getByRole('list', { name: 'Competencies' }).getByRole('listitem');
    await expect(comps).toHaveCount(detail.body.competencies.length);
    await expect(comps.first()).toContainText(`${detail.body.competencies[0].pct}%`);
  });

  test('student detail pluralises counts from a patched record', async ({ page }) => {
    await page.route('**/api/classes/*/students/*', (route) => patched(route, (b) => ({ ...b, student: { ...b.student, missionsCompleted: 1, hintsUsed: 1 }, labs: b.labs.map((l: any, i: number) => ({ ...l, completed: i === 0 ? 1 : 0 })), history: [{ ...b.history[0], answersSubmitted: 1, wrongAnswers: 0, hintsUsed: 1 }] })));
    await openHome(page);
    await openFaculty(page);
    await nav(page, 'Student detail');
    await expect(page.locator('.profile-card')).toContainText('1 mission completed · 1 hint used');
    await expect(page.locator('.mission-table li').first()).toContainText('1 answer · 0 wrong · 1 hint');
  });

  test('no class: the empty state does not promise a creation flow that does not exist', async ({ page }) => {
    await page.route('**/api/classes', (route) => route.fulfill(json(200, { classes: [] })));
    await openHome(page);
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'No class yet' })).toBeVisible();
    const text = await page.locator('.state-panel.empty').innerText();
    expect(text).toContain('not available in this demonstration');
    expect(text).not.toMatch(/Create a class to see/);
    await expect(page.locator('.state-panel.empty').getByRole('button')).toHaveCount(0);
  });

  test('content review: lab names, capitalised statuses, and an error that says what failed', async ({ page }) => {
    await openHome(page);
    await openFaculty(page);
    await nav(page, 'Content review');
    const rows = page.locator('.content-row');
    await expect(rows.first()).toBeVisible();
    const labCells = await rows.locator('span:not(.status-pill)').allTextContents();
    for (const cell of labCells) expect(cell).not.toMatch(/^(hematology|microbiology|biochemistry|master)$/);
    expect(new Set(labCells)).toEqual(new Set(['Hematology', 'Microbiology', 'Clinical Biochemistry', 'Master Lab']));
    for (const pill of await rows.locator('.status-pill').allTextContents()) expect(pill).toMatch(/^(Draft|Reviewed|Approved)$/);
    await page.route('**/api/content/missions/*/status', (route) => route.fulfill(json(500, { error: { code: 'internal_error', message: 'Temporary outage' } })));
    await page.getByRole('button', { name: /^(Mark reviewed|Approve|Return to draft)$/ }).first().click();
    // R11-C-01: a 5xx proves nothing about what was stored, so the alert says the change could not be confirmed (it no longer claims a failed update).
    await expect(page.getByRole('alert')).toHaveText(/^Could not confirm the status change: Temporary outage/);
  });
});

test.describe('minimum type size on key pages (desktop)', () => {
  test('no text renders below 11px on the student and faculty pages', async ({ page }) => {
    await resetDemo(page);
    const seen: Record<string, string[]> = {};
    const check = async (name: string) => { seen[name] = (await auditPage(page)).smallText; };
    await check('dashboard');
    for (const name of ['Lab map', 'Progress', 'Lab results', 'Learning settings']) { await nav(page, name); await expect(page.locator('h1')).toBeVisible(); await page.waitForLoadState('networkidle'); await check(name); }
    await openAttemptAt(page, 'hem-02', 0);
    await check('decision mission');
    await page.getByRole('button', { name: DECISION.accept }).click();
    await check('decision selected');
    await openAttemptAt(page, 'hem-01', 0);
    await clickArtwork(page, ARTWORK.smear);
    await check('point mission');
    await openAttemptAt(page, 'mic-02', 0);
    await check('order mission');
    await openAttemptAt(page, 'mic-03', 0);
    await check('match mission');
    expect(Object.fromEntries(Object.entries(seen).filter(([, v]) => v.length))).toEqual({});
  });

  test('no text renders below 11px on the faculty pages', async ({ page }) => {
    await openHome(page);
    await openFaculty(page);
    const seen: Record<string, string[]> = {};
    await expect(page.locator('li.mission-signal').first()).toBeVisible();
    seen.analytics = (await auditPage(page)).smallText;
    await nav(page, 'Student detail');
    await expect(page.locator('.profile-card h2')).toBeVisible();
    seen.student = (await auditPage(page)).smallText;
    await nav(page, 'Content review');
    await expect(page.locator('.content-row').first()).toBeVisible();
    seen.content = (await auditPage(page)).smallText;
    expect(Object.fromEntries(Object.entries(seen).filter(([, v]) => v.length))).toEqual({});
  });
});
