import { expect, test, type Page } from '@playwright/test';
import { apiCall, homeHeading, json, moveContent, openFaculty, openHome, patched, prepareContentStatus, resetDemo, sessionToken, statusPill, teacherToken } from './support/helpers';

const nav = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const alert = (page: Page) => page.getByRole('alert');

test.describe('faculty roster, detail and class scope', () => {
  test.beforeEach(async ({ page }) => { await openHome(page); await openFaculty(page); });

  test('a roster row opens that student, not just the first one', async ({ page }) => {
    const rows = page.locator('button.mission-row');
    await expect(rows.first()).toBeVisible();
    const names = await rows.locator('span').allTextContents();
    expect(names.length).toBeGreaterThan(2);
    const target = names[2]!;
    await page.getByRole('button', { name: `Open ${target}` }).click();
    await expect(page.getByRole('heading', { name: 'Student detail' })).toBeVisible();
    await expect(page.locator('.profile-card h2')).toHaveText(target);
    await expect(page.getByLabel('Student')).toHaveValue(/\d+/);
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    // The picker switches student without leaving the page.
    const other = names[0]!;
    await page.getByLabel('Student').selectOption({ label: other });
    await expect(page.locator('.profile-card h2')).toHaveText(other);
    // No invented program or level.
    await expect(page.locator('.profile-card')).not.toContainText('Biomedical');
    await expect(page.locator('.profile-card')).toContainText(/Level \d+ · [\d,]+ XP/);
  });

  test('the roster and the mission signal say how much is shown, and can show everything', async ({ page }) => {
    await expect(page.getByText(/Showing 8 of 38 students\./)).toBeVisible();
    await expect(page.getByText(/Showing 8 of 10 missions\./)).toBeVisible();
    await expect(page.locator('button.mission-row')).toHaveCount(8);
    await page.getByRole('button', { name: 'Show all 38' }).click();
    await expect(page.locator('button.mission-row')).toHaveCount(38);
    await expect(page.getByRole('button', { name: 'Show fewer' })).toBeVisible();
    await page.getByRole('button', { name: 'Show all 10' }).click();
    await expect(page.locator('.teacher-panel').first().locator('li.mission-signal')).toHaveCount(10);
  });

  test('student history rows have unique keys even when a mission was replayed (no React key warning)', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') warnings.push(m.text()); });
    await nav(page, 'Student detail');
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    await page.getByLabel('Student').selectOption({ index: 1 });
    await expect(page.getByText('ATTEMPT HISTORY')).toBeVisible();
    expect(warnings.filter((w) => /key/i.test(w))).toEqual([]);
  });

  test('with several classes a selector appears; a class the server does not know is a clear 404', async ({ page }) => {
    await page.route('**/api/classes', (route) => patched(route, (b) => ({ classes: [...b.classes, { id: 99999, name: 'Ghost class', joinCode: 'ZZZZZZ', students: 0 }] })));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Faculty', exact: true })).toBeVisible();
    const picker = page.getByLabel('Class', { exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator('option')).toHaveCount(3);
    await picker.selectOption({ label: 'Ghost class (0)' });
    await expect(alert(page).getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(alert(page)).toContainText('Unknown class.');
    await picker.selectOption({ index: 0 });
    await expect(alert(page)).toHaveCount(0);
    await expect(page.getByText('MISSION SIGNAL')).toBeVisible();
  });

  test('the demo teacher has two classes, so the selector is there; the empty one shows real empty states', async ({ page }) => {
    const picker = page.getByLabel('Class', { exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator('option')).toHaveCount(2);
    await picker.selectOption({ label: 'L2 Biomedical Sciences (0)' });
    await expect(page.getByRole('heading', { name: 'No students in this class yet' })).toBeVisible();
    await expect(page.locator('.stat').filter({ hasText: /^Students/ })).toContainText('0');
    // R9-C-03: an empty class has no completion or attention figure to show.
    await expect(page.locator('.stat').filter({ hasText: /^Completion/ })).toContainText('—');
    await nav(page, 'Student detail');
    await expect(page.getByLabel('Class', { exact: true })).toBeVisible();
  });

  test('a single class shows no selector', async ({ page }) => {
    await page.route('**/api/classes', (route) => patched(route, (b) => ({ classes: b.classes.slice(0, 1) })));
    await nav(page, 'Student detail');
    await nav(page, 'Faculty');
    await expect(page.getByText('MISSION SIGNAL')).toBeVisible();
    await expect(page.getByLabel('Class', { exact: true })).toHaveCount(0);
  });

  test('403, 404 and 401 each get their own copy', async ({ page }) => {
    await page.route('**/api/classes', (route) => route.fulfill(json(403, { error: { code: 'wrong_role', message: 'This endpoint is for teacher accounts.' } })));
    await nav(page, 'Student detail');
    await expect(alert(page).getByRole('heading', { name: 'Faculty access required' })).toBeVisible();
    await expect(alert(page)).toContainText('This endpoint is for teacher accounts.');
    await page.unroute('**/api/classes');

    await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => route.fulfill(json(404, { error: { code: 'not_found', message: 'This student is not in the class.' } })));
    await nav(page, 'Faculty');
    await nav(page, 'Student detail');
    await expect(alert(page).getByRole('heading', { name: 'Not found' })).toBeVisible();
    await expect(alert(page)).toContainText('This student is not in the class.');
    await page.unroute(/\/api\/classes\/\d+\/students\/\d+$/);

    // The session expires once: a faculty guest stays a faculty guest after recovery (it is not turned into the student demo).
    let rejected = false;
    await page.route('**/api/classes', (route) => {
      if (rejected) return route.continue();
      rejected = true;
      return route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Authentication required.' } }));
    });
    await nav(page, 'Faculty');
    await expect(page.getByRole('status').filter({ hasText: 'faculty guest session expired' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to student demo' })).toBeVisible();
  });

  test('a server that rejects every faculty call does not make the app recreate sessions forever', async ({ page }) => {
    // (the describe's beforeEach already opened the faculty guest)
    let logins = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/auth/demo')) logins += 1; });
    await page.route('**/api/classes', (route) => route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Authentication required.' } })));
    await nav(page, 'Student detail');
    await expect(page.getByRole('alert').filter({ hasText: 'The server keeps rejecting guest sessions' })).toBeVisible({ timeout: 20_000 });
    const afterHalt = logins;
    await page.waitForTimeout(3000);
    expect(logins, 'no further session is created once the guard has halted').toBe(afterHalt);
    expect(afterHalt).toBeLessThanOrEqual(4);
    await expect(page.getByRole('button', { name: /Reopen the laboratory/ })).toBeVisible();
  });
});

test.describe('content review guards', () => {
  test('students have no entry point, and the server refuses them too', async ({ page }) => {
    const token = await resetDemo(page);
    await expect(page.getByRole('button', { name: 'Content review' })).toHaveCount(0);
    for (const [path, method, body] of [['/content/missions', 'GET', undefined], ['/content/missions/hem-01/status', 'PUT', { status: 'reviewed' }], ['/classes', 'GET', undefined]] as const) {
      const reply = await apiCall(token, path, { method, body });
      expect(reply.status, path).toBe(403);
      expect(reply.body.error.code).toBe('wrong_role');
    }
  });

  test('the server refuses to approve content that was never reviewed, and the UI only offers legal moves', async ({ page }) => {
    // Independent of every other test: this mission starts from draft whatever ran before.
    await prepareContentStatus('hem-02', 'draft');
    const teacher = await teacherToken();
    const early = await apiCall(teacher, '/content/missions/hem-02/status', { method: 'PUT', body: { status: 'approved' } });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('review_required');

    await openHome(page);
    await openFaculty(page);
    await nav(page, 'Content review');
    const row = page.locator('.content-row').filter({ hasText: 'Fix the Sample' });
    await expect(statusPill(row)).toHaveText('Draft');
    await expect(row.getByRole('button')).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Mark reviewed' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await moveContent(page, row, 'Mark reviewed', 'reviewed');
    await expect(row.getByRole('button')).toHaveCount(1);
    await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible();
    // The server owns the decision: it is still there after a reload.
    await page.reload();
    await nav(page, 'Content review');
    await expect(statusPill(page.locator('.content-row').filter({ hasText: 'Fix the Sample' }))).toHaveText('Reviewed');
    await prepareContentStatus('hem-02', 'draft');
  });

  test('a server refusal during a transition is announced and the row is unchanged', async ({ page }) => {
    await prepareContentStatus('hem-02', 'reviewed');
    await openHome(page);
    await openFaculty(page);
    await nav(page, 'Content review');
    const row = page.locator('.content-row').filter({ hasText: 'Fix the Sample' });
    await expect(statusPill(row)).toHaveText('Reviewed');
    await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible();
    await page.route('**/api/content/missions/hem-02/status', (route) => route.fulfill(json(409, { error: { code: 'review_required', message: 'Content must be reviewed before it can be approved.' } })));
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(alert(page)).toContainText('Content must be reviewed before it can be approved.');
    await expect(statusPill(row)).toHaveText('Reviewed');
    await page.unroute('**/api/content/missions/hem-02/status');
    await moveContent(page, row, 'Approve', 'approved');
    await moveContent(page, row, 'Return to draft', 'draft');
  });

  test('a teacher cannot read another class and a student session cannot read cohort data', async ({ page }) => {
    const teacher = await teacherToken();
    expect((await apiCall(teacher, '/classes/99999/students')).status).toBe(404);
    expect((await apiCall(teacher, '/classes/99999/analytics')).status).toBe(404);
    expect((await apiCall(teacher, '/dashboard')).status).toBe(403);
    await openHome(page);
    expect((await apiCall(await sessionToken(page), '/classes/1/analytics')).status).toBe(403);
  });
});
