// The mission timer changes tone as the server's remaining time runs down (E8). The tone is a CSS class driven by the server
// snapshot of remainingSec; the server alone still decides when time is up (see states.spec.ts for expiry).
import { DatabaseSync } from 'node:sqlite';
import { expect, test } from '@playwright/test';
import { openAttemptAt, resetDemo } from './support/helpers';

/** Moves a live attempt's start into the past by `seconds` (test preparation on the suite's own database). */
function ageAttemptInDb(attemptId: string, seconds: number) {
  const db = new DatabaseSync(process.env.E2E_DB_PATH!);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const changed = db.prepare('UPDATE attempts SET started_at = started_at - ? WHERE id = ? AND status = ?').run(seconds * 1000, attemptId, 'in_progress').changes;
    expect(Number(changed)).toBe(1);
  } finally {
    db.close();
  }
}

test.describe('timer urgency tones', () => {
  test('calm at the start, warning under a minute, critical under twenty seconds (Blood Smear Code, 240 s limit)', async ({ page }) => {
    await resetDemo(page);
    const id = await openAttemptAt(page, 'hem-01');
    const timer = page.getByRole('timer');
    await expect(timer).toHaveClass(/^timer\s*$/);
    ageAttemptInDb(id, 240 - 55);
    await page.reload();
    await expect(page.locator('.case-panel h1')).toBeVisible();
    await expect(timer).toHaveClass(/warning/);
    await expect(timer).not.toHaveClass(/critical/);
    ageAttemptInDb(id, 40);
    await page.reload();
    await expect(page.locator('.case-panel h1')).toBeVisible();
    await expect(timer).toHaveClass(/critical/);
    // The displayed time is still the server's snapshot, not a client estimate.
    await expect(timer).toHaveText(/00:(0\d|1\d)/);
  });

  test('a closed attempt carries no urgency tone', async ({ page }) => {
    await resetDemo(page);
    const id = await openAttemptAt(page, 'hem-01');
    ageAttemptInDb(id, 7200);
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'Time is up.' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveClass(/^timer\s*$/);
  });
});
