import { expect, test, type Page } from '@playwright/test';
import { ARTWORK, arrangeOrder, caseStatus, clickArtwork, completeMissionViaApi, freshStudent, openAs, resetDemo, startMissionViaUi, submit, DECISION } from './support/helpers';
import { MISSION_BY_ID } from './support/content';

const wrongAnswers = (page: Page) => caseStatus(page, 'Wrong answers');
const penalty = (page: Page) => caseStatus(page, 'XP penalty');
const option = (page: Page, label: string | RegExp) => page.locator('.answer-options button').filter({ hasText: label });
const complete = (page: Page) => expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();

test.describe('six engines: wrong answer, retry and refresh with the penalty restored from the server', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('point (image hotspot)', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(submit(page)).toBeDisabled();
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    // The wrong marker stays so the learner can adjust it.
    await expect(page.locator('.marker')).toBeVisible();
    await expect(submit(page)).toBeEnabled();

    await page.reload();
    await expect(page.getByText(/CASE FILE · Hematology/)).toBeVisible();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    await expect(submit(page)).toBeDisabled();
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await complete(page);
    await expect(page.getByText('1 wrong')).toBeVisible();
  });

  test('point on the second artwork: the visible potassium cell is correct, the neighbouring row is not', async ({ page }) => {
    // bio-02 is locked for the prepared demo learner, so a fresh learner finishes bio-01 through the API first.
    const token = await freshStudent();
    await completeMissionViaApi(token, 'bio-01');
    await openAs(page, token);
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Lab Value Hacker');
    // The sodium result sits one row (70 of 900 artwork px) above potassium.
    await clickArtwork(page, { ...ARTWORK.panel, y: ARTWORK.panel.y - 70 });
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await clickArtwork(page, ARTWORK.panel);
    await submit(page).click();
    await complete(page);
  });

  test('a locked mission cannot be started from the lobby', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Enter Clinical Biochemistry Lab' }).click();
    await expect(page.getByRole('button', { name: 'Locked Lab Value Hacker' })).toBeDisabled();
    await expect(page.getByText('Complete mission 01 to unlock')).toBeVisible();
  });

  test('choice', async ({ page }) => {
    await startMissionViaUi(page, 'Clinical Biochemistry Lab', 'Organ Rescue Mission');
    await option(page, 'Liver').click();
    await expect(option(page, 'Liver')).toHaveAttribute('aria-pressed', 'true');
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(wrongAnswers(page)).toHaveText('1');
    // Selection kept after a wrong answer, so Submit and the visual state agree.
    await expect(option(page, 'Liver')).toHaveAttribute('aria-pressed', 'true');
    await expect(submit(page)).toBeEnabled();

    await page.reload();
    await expect(page.getByText(/CASE FILE · Clinical Biochemistry/)).toBeVisible();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    await option(page, 'Kidney').click();
    await submit(page).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct.' })).toBeVisible();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
  });

  test('decision', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.accept }).click();
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(wrongAnswers(page)).toHaveText('1');
    await page.reload();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(page.getByText('STEP 1 / 3')).toBeVisible();
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.getByText(/Sample 2\./)).toBeVisible();
    await expect(wrongAnswers(page)).toHaveText('1');
    await page.getByRole('button', { name: DECISION.repeat }).click();
    await submit(page).click();
    await page.getByRole('button', { name: DECISION.accept }).click();
    await submit(page).click();
    await complete(page);
  });

  test('stepper keeps earlier values and the penalty across a refresh', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Anemia Detective');
    await expect(page.getByText('STEP 1 / 3')).toBeVisible();
    await expect(page.locator('.value', { hasText: 'MCV' })).toBeVisible();
    await option(page, 'Microcytic').click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    // Step 2 introduces ferritin/TIBC/RDW; the server also keeps Hb and MCV from step 1.
    for (const name of ['Hb', 'MCV', 'Ferritin', 'TIBC', 'RDW']) await expect(page.locator('.value').filter({ hasText: new RegExp(`^${name}`) })).toHaveCount(1);
    await expect(page.getByText('EVIDENCE REVEALED SO FAR')).toBeVisible();
    await expect(page.locator('.value', { hasText: 'Ferritin' })).toContainText('Low');

    await option(page, 'Anemia of chronic disease').click();
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(wrongAnswers(page)).toHaveText('1');
    await page.reload();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    for (const name of ['Hb', 'MCV', 'Ferritin']) await expect(page.locator('.value').filter({ hasText: new RegExp(`^${name}`) })).toHaveCount(1);
    await option(page, 'Iron deficiency anemia').click();
    await submit(page).click();
    await option(page, /Evaluate for a source/).click();
    await submit(page).click();
    await complete(page);
  });

  test('order', async ({ page }) => {
    const mission = MISSION_BY_ID.get('mic-02')!;
    const labels = new Map(mission.steps[0]!.data.items!.map((i) => [i.id, i.label]));
    const correct = (mission.steps[0]!.key as { order: string[] }).order.map((id) => labels.get(id)!);
    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    const rows = page.locator('.drag-row b');
    const before = await rows.allTextContents();
    expect(before).not.toEqual(correct);

    // Accessible names are item specific, ends are disabled and moves are announced.
    await expect(page.getByRole('button', { name: `Move up: ${before[0]}` })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Move down: ${before.at(-1)}` })).toBeDisabled();
    await page.getByRole('button', { name: `Move down: ${before[0]}` }).click();
    await expect(page.locator('p.sr-only[role="status"]')).toHaveText(`${before[0]} moved to position 2 of 5.`);
    await page.getByRole('button', { name: `Move up: ${before[0]}` }).click();
    expect(await rows.allTextContents()).toEqual(before);

    // Submit is coherent with the list on screen, also after a wrong answer.
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(page.getByRole('alert')).toContainText(/\d of 5 in the right place/);
    expect(await rows.allTextContents()).toEqual(before);
    await expect(submit(page)).toBeEnabled();
    await expect(wrongAnswers(page)).toHaveText('1');

    await page.reload();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    await arrangeOrder(page, correct);
    await submit(page).click();
    await complete(page);
  });

  test('match', async ({ page }) => {
    const step = MISSION_BY_ID.get('mic-03')!.steps[0]!;
    const key = (step.key as { pairs: Record<string, string> }).pairs;
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const selects = page.locator('select');
    await expect(selects).toHaveCount(4);
    const lefts = step.data.left!.map((l) => l.id);
    const rights = lefts.map((l) => key[l]!);
    // A deliberately wrong but valid (distinct) assignment: rotate the correct rights.
    const wrong = lefts.map((_, i) => rights[(i + 1) % rights.length]!);
    for (let i = 0; i < 4; i += 1) await selects.nth(i).selectOption(wrong[i]!);
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(page.getByRole('alert')).toContainText(/\d of 4 in the right place/);
    for (let i = 0; i < 4; i += 1) await expect(selects.nth(i)).toHaveValue(wrong[i]!);
    await expect(wrongAnswers(page)).toHaveText('1');

    await page.reload();
    await expect(wrongAnswers(page)).toHaveText('1');
    await expect(penalty(page)).toHaveText('-10');
    await expect(submit(page)).toBeDisabled();
    for (let i = 0; i < 4; i += 1) await selects.nth(i).selectOption(rights[i]!);
    await expect(submit(page)).toBeEnabled();
    await submit(page).click();
    await complete(page);
  });
});
