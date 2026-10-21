import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apiCall, navigateSection, openFaculty, openHome, resetDemo, teacherToken } from './support/helpers';

/** Zero axe violations, summarised per node. */
async function clean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`));
  expect(summary, label).toEqual([]);
}

/** Clicks a point given in natural pixels of the picture shown in `frame` (the picture keeps its aspect ratio). */
async function clickNatural(page: Page, frame: string, natural: { width: number; height: number }, x: number, y: number) {
  const el = page.locator(frame).first();
  await el.scrollIntoViewIfNeeded();
  const box = (await el.boundingBox())!;
  await page.mouse.click(box.x + (box.width * x) / natural.width, box.y + (box.height * y) / natural.height);
}
const SMEAR = { width: 1672, height: 941 };

test.describe('Teacher Studio', () => {
  test.beforeEach(async () => {
    // The faculty guest is shared: put its rooms back to the showcase before each test.
    const teacher = await teacherToken();
    expect((await apiCall(teacher, '/demo/reset', { method: 'POST' })).status).toBe(200);
  });

  test('the showcase: three published rooms with class results, a heatmap of clicks, and no accessibility violation', async ({ page }) => {
    await openHome(page);
    await openFaculty(page);
    await page.getByRole('button', { name: 'Teacher Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Your rooms' })).toBeVisible();
    await expect(page.locator('.studio-card')).toHaveCount(3);
    await expect(page.locator('.studio-card .status-chip.published')).toHaveCount(3);
    await clean(page, 'studio list');

    await page.locator('.studio-card', { hasText: 'frottis' }).getByRole('button', { name: 'Results' }).click();
    await expect(page.locator('.results-kpis')).toBeVisible();
    await expect(page.locator('.heatmap').first().locator('.heat-dots circle').first()).toBeVisible();
    expect(await page.locator('.heatmap').first().locator('.heat-dots circle.trap').count()).toBeGreaterThan(0);
    await expect(page.locator('.results-table tbody tr').first()).toBeVisible();
    await clean(page, 'results');

    // One student's answers, with the expected ones.
    await page.locator('.results-table tbody tr').first().getByRole('button', { name: /Answers/ }).click();
    await expect(page.getByText('STUDENT ANSWERS')).toBeVisible();
    await expect(page.locator('.review-item').first()).toBeVisible();
  });

  test('a teacher builds a room with a trap option and a click zone, tests the 5 px tolerance, and publishes it', async ({ page }) => {
    await openHome(page);
    await openFaculty(page);
    await page.getByRole('button', { name: 'Teacher Studio' }).click();
    await page.getByRole('button', { name: 'New room' }).click();
    await expect(page.getByRole('tab', { name: /Questions/ })).toBeVisible();

    // Question 1: multiple choice; the blank question already has a correct, a wrong and a trap option.
    await page.getByRole('button', { name: 'Add a question' }).click();
    await page.getByRole('button', { name: 'Multiple choice' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Which antibody appears first in a primary response?');
    await page.getByLabel('Option 1', { exact: true }).fill('IgM');
    await page.getByLabel('Option 2', { exact: true }).fill('IgA');
    await page.getByLabel('Option 3', { exact: true }).fill('IgG');
    await page.getByLabel('Feedback when option 3 is chosen').fill('IgG dominates later: a classic trap.');

    // Question 2: a click zone on the library smear.
    await page.getByRole('button', { name: 'Add a question' }).click();
    await page.getByRole('button', { name: 'Click on the picture' }).click();
    await page.getByLabel('Question', { exact: true }).fill('Click the schistocyte.');
    await page.getByRole('button', { name: 'Choose the picture students will click on' }).click();
    await page.getByRole('tab', { name: 'Library' }).click();
    await page.locator('.image-grid button', { hasText: 'Stylised blood smear' }).click();
    await page.getByLabel('Description for learners who cannot see the picture').fill('Stylised blood smear with many round red cells');
    // Draw a circle: press on the centre (1232, 440) and drag 60 px to the right.
    const frame = page.locator('.room-picture-frame.editing');
    await frame.scrollIntoViewIfNeeded();
    const box = (await frame.boundingBox())!;
    const at = (x: number, y: number) => ({ x: box.x + (box.width * x) / SMEAR.width, y: box.y + (box.height * y) / SMEAR.height });
    await page.mouse.move(at(1232, 440).x, at(1232, 440).y);
    await page.mouse.down();
    await page.mouse.move(at(1292, 440).x, at(1292, 440).y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.zone-list li')).toHaveCount(1);
    await page.getByLabel('Label of zone 1').fill('Fragmented cell');
    // The text alternative needs at least 3 labels before the room can be published (quality check error otherwise).
    await page.locator('fieldset', { hasText: 'Decoy labels for the text alternative' }).getByRole('button', { name: 'Add' }).click();
    await page.getByRole('textbox', { name: 'Decoy labels for the text alternative 1', exact: true }).fill('Target cell');
    await page.locator('fieldset', { hasText: 'Decoy labels for the text alternative' }).getByRole('button', { name: 'Add' }).click();
    await page.getByRole('textbox', { name: 'Decoy labels for the text alternative 2', exact: true }).fill('Platelet clump');
    // The drag is rounded to whole screen pixels: set the radius exactly, then test clicks at 64 px (inside the 5 px tolerance) and 80 px.
    await page.locator('.zone-list li').first().getByLabel(/radius/).fill('60');
    await page.getByRole('button', { name: 'Test a click' }).click();
    await clickNatural(page, '.room-picture-frame.editing', SMEAR, 1232 + 63, 440);
    await expect(page.locator('.hotspot-test')).toContainText('Accepted');
    await clickNatural(page, '.room-picture-frame.editing', SMEAR, 1232 + 85, 440);
    await expect(page.locator('.hotspot-test')).toContainText(/Missed: 2\d px/);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('All changes saved').or(page.getByText('Saved', { exact: true }))).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.locator('.studio-editor-title .status-chip')).toHaveText('Published');
    await clean(page, 'editor');

    // The server holds the room with its trap and its zone in natural pixels.
    const teacher = await teacherToken();
    const rooms = (await apiCall(teacher, '/studio/rooms')).body.rooms as Array<{ id: string; title: string; status: string }>;
    const mine = rooms.find((r) => r.status === 'published' && !r.id.startsWith('room-demo-'))!;
    const room = (await apiCall(teacher, `/studio/rooms/${mine.id}`)).body;
    expect(room.doc.questions[0].options.find((o: { label: string }) => o.label === 'IgG').trap).toBe(true);
    expect(room.doc.questions[1].zones[0]).toMatchObject({ shape: 'circle', x: 1232, y: 440, r: 60 });
    expect(room.doc.questions[1].tolerance).toBe(5);
  });

  test('a student plays the trapped smear room: trap feedback, right answer, fragment of the vault', async ({ page }) => {
    await resetDemo(page);
    await navigateSection(page, 'Teacher rooms');
    await expect(page.getByRole('heading', { name: 'Rooms from your teachers' })).toBeVisible();
    await clean(page, 'student rooms');
    await page.locator('.room-card', { hasText: 'frottis' }).getByRole('button', { name: /Enter the room/ }).click();
    await expect(page.locator('.room-picture-frame.pickable')).toBeVisible();
    // Two overlapping red cells: a visual trap.
    await clickNatural(page, '.room-picture-frame.pickable', SMEAR, 1075, 222);
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.locator('.room-verdict.trap')).toContainText('Trap!');
    await clean(page, 'player');
    await clickNatural(page, '.room-picture-frame.pickable', SMEAR, 1232, 440);
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.locator('.room-verdict.right')).toContainText('Correct');
    await expect(page.locator('.room-fragment')).toContainText('F');
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.locator('.room-option').first()).toBeVisible();
    // The answers are never in what the page received: no option is marked correct in the DOM.
    expect(await page.locator('[data-correct], .correct').count()).toBe(0);
  });
});
