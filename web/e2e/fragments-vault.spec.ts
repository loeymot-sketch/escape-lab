import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, apiCall, chooseCorrectOption, clickArtwork, completeLabViaApi, freshStudent, openAs, resetDemo, startMissionViaUi, submit, HOME_HEADING } from './support/helpers';
import { exitCode } from './support/content';

test.describe('Code Vault: fragments, unlock and results', () => {
  test('the final answer reveals the server fragment on the result screen', async ({ page }) => {
    await openAs(page, await freshStudent());
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    const fragment = page.locator('.fragment-reveal');
    await expect(fragment).toBeVisible();
    await expect(fragment).toContainText('CODE FRAGMENT DISCOVERED');
    await expect(fragment.locator('strong')).toHaveText('7');
    await expect(fragment).toContainText('Position 1 added to the Code Vault.');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    // The record is the server's: the vault shows the same digit.
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('list', { name: 'Hematology Lab code fragments' }).getByRole('listitem').first()).toContainText('7');
  });

  test('a replay of a completed mission gives no second fragment', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.locator('.fragment-reveal')).toHaveCount(0);
  });

  test('a refresh on a finished attempt shows the stored result instead of silently returning to the dashboard', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.getByText('Server-calculated')).toBeVisible();
    await expect(page.getByText(/Vault progress for this laboratory: 7 4 2/)).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toBeVisible();
  });

  test('the Master Lab reveals one fragment per solved step', async ({ page }) => {
    const token = await freshStudent();
    for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
    await openAs(page, token);
    await startMissionViaUi(page, 'Master Lab', 'Clinical Detective');
    const digits = exitCode('master').split('');
    for (let i = 0; i < 4; i += 1) {
      await expect(page.getByText(`STEP ${i + 1} / 4`)).toBeVisible();
      await chooseCorrectOption(page, 'master-01', i);
      await submit(page).click();
      if (i < 3) {
        const note = page.locator('.fragment-reveal.inline');
        await expect(note).toBeVisible();
        await expect(note.locator('strong')).toHaveText(digits[i]!);
        await expect(note).toContainText(`Position ${i + 1}`);
      }
    }
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    const reveals = page.locator('.fragment-reveal strong');
    await expect(reveals).toHaveText(digits);
  });

  test('wrong then right exit code: clear notices, attempts left, unlock, results, and no axe violations', async ({ page }) => {
    const token = await freshStudent();
    await completeLabViaApi(token, 'hematology', false);
    await openAs(page, token);
    await page.getByRole('button', { name: 'Progress' }).click();
    const input = page.getByLabel(/Exit code for Hematology Lab/);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('inputmode', 'numeric');
    await expect(input).toHaveAttribute('pattern', '[0-9]*');
    const unlock = page.getByRole('button', { name: 'Unlock' });
    await expect(unlock).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await input.fill('00');
    await expect(unlock).toBeDisabled();
    await input.fill('000');
    await unlock.click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Incorrect code.');
    await expect(alert).toContainText('4 attempts left');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await input.fill(exitCode('hematology'));
    await unlock.click();
    const status = page.getByRole('status').filter({ hasText: 'unlocked' });
    await expect(status).toContainText('Hematology Lab unlocked.');
    await expect(status).toContainText('Its results are now available.');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('ESCAPED')).toBeVisible();
    await expect(page.getByLabel(/Exit code for Hematology Lab/)).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Lab results' }).click();
    await expect(page.getByRole('heading', { name: 'Escape confirmed' })).toBeVisible();
    await expect(page.getByText('Hematology Lab').first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Hematology Lab score ledger' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the exit code is refused until every fragment is found (no input is offered)', async ({ page }) => {
    const token = await resetDemo(page);
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByText('2 of 3 fragments found')).toBeVisible();
    await expect(page.getByLabel(/Exit code for/)).toHaveCount(0);
    const early = await apiCall(token, '/labs/microbiology/unlock', { method: 'POST', body: { code: exitCode('microbiology') } });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('vault_incomplete');
  });
});
