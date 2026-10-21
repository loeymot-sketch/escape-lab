// The Lab-assistant robot is a decoration drawn by CSS on the assistant card. It must never sit on the card's own heading
// (desktop) nor land on another card's values when the assistant moves inline on a phone (2026-10-14 audit, D1 and D2).
import { expect, test } from '@playwright/test';
import { openAttemptAt, resetDemo } from './support/helpers';

test.describe('lab-assistant artwork placement', () => {
  test('desktop: the assistant heading stops before the robot and the status card carries no robot', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await resetDemo(page);
    await openAttemptAt(page, 'hem-02');
    const card = page.locator('.case-aside .assistant-card').first();
    await expect(card).toBeVisible();
    const measured = await card.evaluate((el) => {
      const frame = el.getBoundingClientRect();
      // The glyphs, not the block box: a padded heading still spans the card, its text must stop before the robot.
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('h2')!);
      const heading = range.getBoundingClientRect();
      const robot = getComputedStyle(el, '::before').backgroundImage;
      return { headingRight: heading.right, frameRight: frame.right, robot };
    });
    expect(measured.robot).toContain('lab-assistant-robot');
    // The robot occupies the top-right 82 px (+8 px inset): the heading must end before that strip.
    expect(measured.frameRight - measured.headingRight).toBeGreaterThanOrEqual(90);
    const statusRobot = await page.locator('.case-status-card').evaluate((el) => getComputedStyle(el, '::before').backgroundImage);
    expect(statusRobot).toBe('none');
  });

  test('phone: the case status values are not covered by the robot', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await resetDemo(page);
    await openAttemptAt(page, 'hem-02');
    const status = page.locator('.case-status-card');
    await status.scrollIntoViewIfNeeded();
    const statusRobot = await status.evaluate((el) => getComputedStyle(el, '::before').backgroundImage);
    expect(statusRobot).toBe('none');
    const covered = await status.locator('.status-row dd').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === node || node.contains(hit) ? 'ok' : `${node.textContent} covered by ${hit?.className ?? hit?.tagName}`;
    }));
    expect(covered).toEqual(['ok', 'ok', 'ok']);
    // The inline assistant still shows its robot (presentation only).
    const inlineRobot = await page.locator('.assistant-inline').evaluate((el) => getComputedStyle(el, '::before').backgroundImage);
    expect(inlineRobot).toContain('lab-assistant-robot');
  });
});
