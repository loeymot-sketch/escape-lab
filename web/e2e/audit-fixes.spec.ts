import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ARTWORK, ATTEMPT_KEY, DECISION, HOME_HEADING as HOME, TOKEN_KEY, expireAttemptInDb, apiCall, caseStatus, clickArtwork, completeLabViaApi, freshStudent, homeHeading, json, openAs, outage, patched, prepareContentStatus, resetDemo, serverError, sessionToken, settle, slow, startMissionViaUi, submit, teacherToken } from './support/helpers';
import { exitCode } from './support/content';

// Regression tests for the adversarial browser audit (VA-02, VA-03, VA-04, VA-05, VA-06, skip link).

test.describe('adversarial audit fixes', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('the dashboard explains LabEscape and says the guest data is demonstration data', async ({ page }) => {
    const how = page.getByRole('region', { name: /Investigate, earn fragments, open the exit/ });
    await expect(how).toBeVisible();
    await expect(how.getByRole('listitem')).toHaveCount(4);
    await expect(how).toContainText('exit code');
    await expect(page.getByText(/prepared demonstration data, not real people/)).toBeVisible();
    await expect(page.getByText(/Nothing you do creates an account/)).toBeVisible();
  });

  test('VA-03: keyboard focus stays on the control after a wrong answer and after a hint', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    // Opening a mission puts focus on the question, not on <body>.
    await expect(page.locator('#case-prompt')).toBeFocused();
    await page.getByRole('button', { name: DECISION.accept }).click();
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    await expect(submit(page)).toBeFocused();

  });

  test('VA-03: focus stays on Ask Lab Assistant while hints remain and moves to the question when they run out', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code'); // two hints on its single step
    const hint = page.getByRole('button', { name: /Ask Lab Assistant/ });
    await hint.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.hint-result')).toBeVisible();
    await expect(hint).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();
    await expect(page.locator('#case-prompt')).toBeFocused();
  });

  test('VA-03/VA-04: after a correct answer focus moves to the next question and the old banner names its step', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.locator('#case-prompt')).toBeFocused();
    const banner = page.locator('.feedback.correct');
    await expect(banner).toContainText('Step 1 correct.');
    await expect(banner.getByText('Correct.', { exact: true })).toHaveCount(0);
  });

  test('VA-02: an attempt the server no longer knows gets a clear message, a disabled Submit and a way out', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await expect(submit(page)).toBeEnabled();
    // Another visitor resets the shared guest: this attempt disappears on the server.
    const token = await sessionToken(page);
    expect((await apiCall(token, '/demo/reset', { method: 'POST' })).status).toBe(200);
    await submit(page).click();
    const panel = page.getByRole('alert').filter({ hasText: 'This case is no longer available.' });
    await expect(panel).toBeVisible();
    await expect(page.getByText('Unknown attempt.')).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeDisabled();
    await panel.getByRole('button', { name: 'Restart mission' }).click();
    await expect(page.getByText('STEP 1 / 1')).toBeVisible();
    await expect(caseStatus(page, 'Wrong answers')).toHaveText('0');
    await expect(page.getByRole('alert').filter({ hasText: 'This case is no longer available.' })).toHaveCount(0);
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await expect(submit(page)).toBeEnabled();
  });

  test('skip link: the first Tab stop jumps to the content', async ({ page }) => {
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
  });

  test('a locked lab payload without its reason is an explicit error, not invented copy', async ({ page }) => {
    await page.route('**/api/labs', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const locked = body.labs.find((lab: { state: string }) => lab.state === 'locked');
      if (locked) delete locked.lockedReason;
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    await expect(page.getByRole('alert')).toContainText(/Invalid server labs payload: lockedReason/);
    await expect(page.getByText('Finish the earlier laboratories first.')).toHaveCount(0);
    // A route.fetch still in flight when the test ends would be reported against the NEXT test.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('R2V-01/02: the dashboard hero never overflows the page, at any width', async ({ page }) => {
    for (const width of [601, 700, 768, 901, 960, 1024, 1090, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: /Choose your first investigation|Continue your investigations/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      const layout = await page.evaluate(() => {
        const h1 = document.querySelector('.hero h1') as HTMLElement;
        const art = document.querySelector('.hero-science')!.getBoundingClientRect();
        const box = h1.getBoundingClientRect();
        // A word split across two lines occupies two client rects: count them per word.
        const text = h1.firstChild as Text;
        const split: string[] = [];
        for (const match of text.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index!);
          range.setEnd(text, match.index! + match[0].length);
          if (range.getClientRects().length > 1) split.push(match[0]);
        }
        const sideBySide = art.top < box.bottom;
        return { split, sideBySide, titleRight: Math.round(box.right), artLeft: Math.round(art.left), clipped: h1.scrollWidth > h1.clientWidth + 1 };
      });
      expect(layout.split, `title words broken across lines at ${width}px`).toEqual([]);
      expect(layout.clipped, `hero title clipped at ${width}px`).toBe(false);
      if (layout.sideBySide) expect(layout.titleRight, `hero title under the image at ${width}px`).toBeLessThanOrEqual(layout.artLeft);
    }
  });

  test('R2V-03/04: focus lands on the result heading, then on the page heading after leaving the mission', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeFocused();
    await page.getByRole('button', { name: /Return to mission control/ }).click();
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R2V-04: Exit mission also returns focus to the page heading', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.getByRole('button', { name: /Exit mission/ }).click();
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R2V-05: after a successful Unlock focus stays inside the vault card, after a wrong code it returns to the input', async ({ page }) => {
    const student = await freshStudent();
    await completeLabViaApi(student, 'hematology', false);
    await openAs(page, student);
    await page.getByRole('button', { name: 'Progress' }).click();
    const input = page.getByLabel(/Exit code for Hematology Lab/);
    await input.fill('000');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByRole('alert')).toContainText('Incorrect code.');
    await expect(input).toBeFocused();
    await input.fill(exitCode('hematology'));
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByText(/Hematology Lab unlocked\./)).toBeVisible();
    await expect(page.locator('.vault-card').filter({ hasText: 'Hematology Lab' })).toBeFocused();
  });

  test('R2V-09: several escaped labs give every results section its own landmark name (axe clean)', async ({ page }) => {
    const student = await freshStudent();
    await completeLabViaApi(student, 'hematology');
    await completeLabViaApi(student, 'microbiology');
    await openAs(page, student);
    await page.getByRole('button', { name: 'Lab results' }).click();
    await expect(page.getByRole('heading', { name: 'Escape confirmed' })).toHaveCount(2);
    await expect(page.getByRole('region', { name: 'Hematology Lab results' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Microbiology Lab results' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('R4-01: laboratory card titles are never split inside a word, on the dashboard and on the lab map', async ({ page }) => {
    const splitWords = () => page.evaluate(() => {
      const split: string[] = [];
      for (const heading of document.querySelectorAll('.lab-card h2, .lab-card h3')) {
        const text = heading.firstChild as Text;
        for (const match of text.data.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index!);
          range.setEnd(text, match.index! + match[0].length);
          if (range.getClientRects().length > 1) split.push(match[0]);
        }
        const h = heading as HTMLElement;
        if (h.scrollWidth > h.clientWidth + 1) split.push(`${h.textContent} (clipped)`);
      }
      return split;
    });
    for (const width of [601, 640, 700, 768, 901, 930, 965, 1024, 1100, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.locator('.lab-card').first()).toBeVisible();
      expect(await splitWords(), `dashboard cards at ${width}px`).toEqual([]);
      await page.getByRole('button', { name: 'Lab map' }).click();
      await expect(page.locator('.map-grid .lab-card').first()).toBeVisible();
      expect(await splitWords(), `lab map cards at ${width}px`).toEqual([]);
    }
  });

  test('R4-02: the matching step never widens a small phone', async ({ page }) => {
    for (const width of [320, 340, 360]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/');
      await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
      await expect(page.locator('select')).toHaveCount(4);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: /Exit mission/ }).click();
    }
  });

  test('R4-03: Return to student demo puts focus on the page heading', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to student demo' }).click();
    await expect(page.getByRole('heading', { name: /Choose your first investigation|Continue your investigations/ })).toBeFocused();
  });

  test('R4-04/06: the Master Lab note is on the analytics page, and content review keeps focus in its row with a described action', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByText(/Master Lab mission is listed but never counted/)).toBeVisible();
    await prepareContentStatus('hem-02', 'draft');
    await page.getByRole('button', { name: 'Content review' }).click();
    const action = page.locator('[data-content-action="hem-02"]');
    await expect(action).toHaveText('Mark reviewed');
    const titleId = await action.getAttribute('aria-describedby');
    expect(titleId).toBe('content-title-hem-02');
    await expect(page.locator(`#${titleId}`)).not.toBeEmpty();
    await action.click();
    await expect(action).toHaveText('Approve');
    await expect(action).toBeFocused();
    await prepareContentStatus('hem-02', 'draft');
  });

  test('R4-05: the page background is one gradient on the canvas, with no flat band under short or long pages', async ({ page }) => {
    const paint = () => page.evaluate(() => ({ rootImage: getComputedStyle(document.documentElement).backgroundImage, rootColor: getComputedStyle(document.documentElement).backgroundColor, bodyImage: getComputedStyle(document.body).backgroundImage, attachment: getComputedStyle(document.body).backgroundAttachment }));
    for (const check of [await paint()]) {
      expect(check.rootImage).toBe('none');
      expect(check.rootColor).toBe('rgba(0, 0, 0, 0)');
      expect(check.bodyImage).toContain('gradient');
      expect(check.attachment).toBe('fixed');
    }
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    expect((await paint()).rootColor).toBe('rgba(0, 0, 0, 0)');
  });

  test('R4-07: an unreadable reply to an answer the server recorded refreshes the screen and says so, without a false failure banner', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.route('**/api/attempts/*/answer', async (route) => {
      await route.fetch(); // the server really records the answer...
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>proxy page</html>' }); // ...but the browser cannot read the reply
    });
    await page.getByRole('button', { name: DECISION.reject }).click();
    await submit(page).click();
    await expect(page.getByText('STEP 2 / 3')).toBeVisible();
    await expect(page.getByText(/The server recorded your action, but its reply could not be read/)).toBeVisible();
    await expect(page.getByText('This could not be completed.')).toHaveCount(0);
  });

  test('R5-01: the order engine never splits a word on a small phone', async ({ page }) => {
    for (const width of [300, 320, 360]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/');
      await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
      await expect(page.locator('.drag-row').first()).toBeVisible();
      const split = await page.evaluate(() => {
        const out: string[] = [];
        for (const label of document.querySelectorAll('.drag-row b')) {
          const text = label.firstChild as Text;
          for (const match of text.data.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, match.index!);
            range.setEnd(text, match.index! + match[0].length);
            if (range.getClientRects().length > 1) out.push(match[0]);
          }
        }
        return out;
      });
      expect(split, `split words at ${width}px`).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: /Exit mission/ }).click();
    }
  });

  test('R5-02/03: a long single-word student name never widens the Faculty pages', async ({ page }) => {
    const longName = 'Wolfeschlegelsteinhausenbergerdorff'.repeat(2);
    const token = await sessionToken(page);
    expect((await apiCall(token, '/profile', { method: 'PUT', body: { name: longName } })).status).toBe(200);
    // On a phone the guest actions live in the Guest options popover; on wider screens they are in the sidebar.
    const guest = async (page: Page, name: string) => {
      const direct = page.getByRole('button', { name, exact: true });
      const options = page.getByRole('button', { name: 'Guest options' });
      // isVisible() does not wait: let the app draw one of the two entry points before choosing.
      await direct.or(options).first().waitFor();
      if (!(await direct.isVisible())) await options.click();
      await page.getByRole('button', { name, exact: true }).click();
    };
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await guest(page, 'Faculty guest');
      await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
      // A clicked button relabels itself to "Show fewer", so always click the first one still labelled "Show all".
      const showAll = page.getByRole('button', { name: /^Show all/ });
      while ((await showAll.count()) > 0) await showAll.first().click();
      const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await wide(), `analytics at ${width}px`).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: 'Student detail' }).click();
      await expect(page.locator('.picker-label select')).toHaveCount(2);
      await page.locator('.picker-label select').last().selectOption({ label: longName });
      await expect(page.locator('.profile-card h2')).toHaveText(longName);
      expect(await wide(), `student detail at ${width}px`).toBeLessThanOrEqual(0);
      const select = await page.locator('.picker-label select').last().boundingBox();
      expect(select!.width, `student select width at ${width}px`).toBeLessThanOrEqual(width);
      await guest(page, 'Return to student demo');
      await expect(page.getByRole('heading', { name: /Choose your first investigation|Continue your investigations/ })).toBeVisible();
    }
  });

  test('R5-09: tabbing out of the Guest options popover closes it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Guest options' }).click();
    await expect(page.getByRole('group', { name: 'Guest options' })).toBeVisible();
    await page.locator('main').evaluate((main) => (main as HTMLElement).focus());
    await expect(page.getByRole('group', { name: 'Guest options' })).toHaveCount(0);
  });

  test('R6-01: a long unbroken class name never widens the Faculty page', async ({ page }) => {
    const longClass = 'W'.repeat(79);
    await page.route('**/api/classes', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.classes[0].name = longClass;
      await route.fulfill({ response, json: body });
    });
    await page.route('**/api/classes/*/analytics', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.class.name = longClass;
      await route.fulfill({ response, json: body });
    });
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      // The faculty guest persists across reloads of the tab: only switch the first time.
      const intelligence = page.getByRole('heading', { name: 'Class intelligence' });
      const direct = page.getByRole('button', { name: 'Faculty guest', exact: true });
      const options = page.getByRole('button', { name: 'Guest options' });
      // isVisible() does not wait: let the app settle on one of the three states before choosing.
      await intelligence.or(direct).or(options).first().waitFor();
      if (!(await intelligence.isVisible())) {
        if (!(await direct.isVisible())) await options.click();
        await page.getByRole('button', { name: 'Faculty guest', exact: true }).click();
      }
      await expect(page.locator('.tag').first()).toContainText('WWWW');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `class tag at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('R6-04: a specimen image that fails to load says so instead of leaving a blank box', async ({ page }) => {
    await page.route(/blood-smear.*\.webp/, (route) => route.abort());
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.getByRole('alert').filter({ hasText: 'The illustrative image could not be loaded' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  });

  test('R6-05: when the stored guest session vanishes, the next action reopens a guest session instead of looping', async ({ page }) => {
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.getByText(/Your guest session expired, so a new guest session was opened/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Choose your first investigation|Continue your investigations/ })).toBeVisible();
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.locator('.map-grid .lab-card').first()).toBeVisible();
  });

  test('R6-02: the mission header with the countdown stays visible while scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await page.locator('.player > header').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeLessThanOrEqual(1);
    await expect(page.getByRole('timer')).toBeInViewport();
  });

  test('R6-07: a laboratory with no fragment yet is "NOT STARTED" on Progress, not "IN PROGRESS"', async ({ page }) => {
    await page.getByRole('button', { name: 'Progress' }).click();
    const master = page.locator('.vault-card').filter({ hasText: /Master/ });
    await expect(master.locator('.vault-card-head span')).toHaveText('NOT STARTED');
  });

  test('R7-01: the sticky mission header never hides a focused control, and it is not sticky on very short screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.locator('.answer-options button').first().focus();
    const clear = await page.evaluate(() => {
      const header = document.querySelector('.player > header')!.getBoundingClientRect();
      const focused = document.activeElement!.getBoundingClientRect();
      return { headerBottom: header.bottom, focusedTop: focused.top };
    });
    expect(clear.focusedTop, 'focused option sits below the sticky header').toBeGreaterThanOrEqual(clear.headerBottom - 1);
    await page.setViewportSize({ width: 375, height: 300 });
    expect(await page.locator('.player > header').evaluate((el) => getComputedStyle(el).position)).toBe('static');
  });

  test('R7-03: a failing hero image does not paint its alt text over the ILLUSTRATIVE IMAGE tag', async ({ page }) => {
    // Only the picture request fails (in the dev server the same URL with ?import is a JS module and must load).
    await page.route(/labescape-investigation-hero.*\.webp/, (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()));
    await page.reload();
    await expect(page.getByRole('heading', { name: /Choose your first investigation|Continue your investigations/ })).toBeVisible();
    expect(await page.locator('.hero-science img').evaluate((el) => getComputedStyle(el).fontSize)).toBe('0px');
    await expect(page.locator('.hero-science img')).toHaveAttribute('alt', /Illustrative biomedical investigation workstation/);
  });

  test('R7-04: when a faculty guest session expires, a faculty guest session is reopened (not the student demo)', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Content review' }).click();
    await expect(page.getByText(/Your faculty guest session expired, so a new faculty guest session was opened/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to student demo' })).toBeVisible();
  });

  test('R7-05/06: the student avatar keeps its round shape and shows the whole first emoji sequence', async ({ page }) => {
    const name = '\u{1F469}\u{1F3FD}\u200D\u{1F52C} Zed Lab';
    const token = await sessionToken(page);
    expect((await apiCall(token, '/profile', { method: 'PUT', body: { name } })).status).toBe(200);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Guest options' }).click();
    await page.getByRole('button', { name: 'Faculty guest', exact: true }).click();
    await page.getByRole('button', { name: 'Student detail' }).click();
    await expect(page.locator('.picker-label select')).toHaveCount(2); // class picker + student picker
    await page.locator('.picker-label select').last().selectOption({ label: name });
    await expect(page.locator('.avatar.big')).toHaveText('\u{1F469}\u{1F3FD}\u200D\u{1F52C}');
    const box = await page.locator('.avatar.big').boundingBox();
    expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([64, 64]);
  });

  test('R8-01: a faculty guest stays faculty when its session expires after a page reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Content review' }).click();
    await expect(page.getByText(/Your faculty guest session expired/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Return to student demo' })).toBeVisible();
  });

  test('R8-02: leaderboard names wrap at spaces only and XP never splits, on small phones', async ({ page }) => {
    for (const width of [320, 360, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Progress' }).click();
      await expect(page.locator('.leaderboard-row').first()).toBeVisible();
      const problems = await page.evaluate(() => {
        const out: string[] = [];
        for (const row of document.querySelectorAll('.leaderboard-row')) {
          const name = row.querySelector('b')!;
          const text = (name.querySelector('bdi') ?? name).firstChild as Text | null; // R12: the name sits in a bdi (bidi isolation)
          if (text) for (const match of text.data.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(text, match.index!);
            range.setEnd(text, match.index! + match[0].length);
            if (range.getClientRects().length > 1) out.push(`name word split: ${match[0]}`);
          }
          for (const cell of row.querySelectorAll('span')) if (cell.getClientRects().length && cell.getBoundingClientRect().height > 2 * parseFloat(getComputedStyle(cell).lineHeight || '16') - 1) out.push(`cell wraps: ${cell.textContent}`);
        }
        return out;
      });
      expect(problems, `leaderboard at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });

  test('R8-03/04: a very long lab name, blurb or mission title never widens the lobby or the mission header', async ({ page }) => {
    const word = 'Immunohematologicalinvestigationbenchmark';
    // A navigation in the loop can cancel an intercepted request mid-flight: that one is simply dropped.
    await page.route('**/api/labs/hematology', (route) => patched(route, (body) => ({ ...body, lab: { ...body.lab, name: word, blurb: word + word } })).catch(() => undefined));
    await page.route('**/api/missions/hem-01/start', (route) => patched(route, (body) => ({ ...body, attempt: { ...body.attempt, mission: { ...body.attempt.mission, title: word } } })).catch(() => undefined));
    for (const width of [320, 375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await page.getByRole('button', { name: 'Lab map' }).click();
      await page.getByRole('button', { name: /^(Enter|Review) Hematology Lab/ }).click();
      await expect(page.getByRole('heading', { name: word, level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `lobby at ${width}px`).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: /^(Start|Resume|Replay) / }).first().click();
      await expect(page.locator('.case-panel h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `mission at ${width}px`).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: /Exit mission/ }).click();
    }
  });

  test('R8-05: one expired session failing several parallel requests is ONE recovery, not a halt', async ({ page }) => {
    let logins = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/auth/demo')) logins += 1; });
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByText(/Your guest session expired, so a new guest session was opened/)).toBeVisible();
    await expect(page.getByText('The server keeps rejecting guest sessions')).toHaveCount(0);
    expect(logins).toBe(1);
  });

  test('R8-06: without JavaScript the page says why it is empty', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<noscript>[\s\S]*needs JavaScript[\s\S]*<\/noscript>/);
  });

  test('review: a background refresh that finds the attempt deleted closes the case instead of a timer warning', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const token = await sessionToken(page);
    expect((await apiCall(token, '/demo/reset', { method: 'POST' })).status).toBe(200);
    // Coming back to the tab triggers the background refresh.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert').filter({ hasText: 'This case is no longer available.' })).toBeVisible();
    await expect(page.getByText(/Could not refresh the timer/)).toHaveCount(0);
    await expect(submit(page)).toBeDisabled();
  });

  test('review: a failed Restart in the closed state is announced, not silent', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const token = await sessionToken(page);
    expect((await apiCall(token, '/demo/reset', { method: 'POST' })).status).toBe(200);
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    const panel = page.getByRole('alert').filter({ hasText: 'This case is no longer available.' });
    await expect(panel).toBeVisible();
    await page.route('**/api/missions/hem-01/start', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'mission_locked', message: 'Complete mission 01 to unlock.' } }) }));
    await panel.getByRole('button', { name: 'Restart mission' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Restart failed: Complete mission 01 to unlock.' })).toBeVisible();
  });

  test('review: a failed Faculty switch does not turn a later student recovery into a faculty session', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => (route.request().postDataJSON()?.role === 'teacher'
      ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many attempts.' } }) })
      : route.continue()));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many attempts.' })).toBeVisible();
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.getByText(/Your guest session expired, so a new guest session was opened/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Faculty guest' })).toBeVisible();
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Round 9 (browser audit waves B and C).
test.describe('round 9: engines, long server strings, request timeout', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('R9-B-01 / R10-B-04: keyboard focus stays on the pressed Move button at the first or last place, and a further Enter does nothing', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    const rows = page.locator('.drag-row b');
    const labels = await rows.allTextContents();
    const focused = page.locator('.drag-row button:focus');
    await page.getByRole('button', { name: `Move up: ${labels[1]}` }).focus();
    await page.keyboard.press('Enter');
    expect(await rows.allTextContents()).toEqual([labels[1], labels[0], ...labels.slice(2)]);
    // The item is first: Move up is now aria-disabled but keeps focus, so more presses change nothing (they used to send it back down).
    await expect(focused).toHaveAttribute('aria-label', `Move up: ${labels[1]}`);
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Enter');
    expect(await rows.allTextContents()).toEqual([labels[1], labels[0], ...labels.slice(2)]);
    await expect(focused).toHaveAttribute('aria-label', `Move up: ${labels[1]}`);
    await expect(page.getByRole('button', { name: `Move up: ${labels[1]}` })).toBeDisabled();
    // Walk the item to the bottom by keyboard alone (Tab to Move down): focus must never fall to <body>.
    await page.keyboard.press('Tab');
    await expect(focused).toHaveAttribute('aria-label', `Move down: ${labels[1]}`);
    for (let i = 0; i < labels.length - 1; i += 1) {
      await page.keyboard.press('Enter');
      await expect(focused).toHaveCount(1);
    }
    expect((await rows.allTextContents()).at(-1)).toBe(labels[1]);
    await expect(focused).toHaveAttribute('aria-label', `Move down: ${labels[1]}`);
    const settled = await rows.allTextContents();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    expect(await rows.allTextContents()).toEqual(settled);
    await expect(focused).toHaveAttribute('aria-label', `Move down: ${labels[1]}`);
  });

  /** An unbroken string like a mistyped identifier: it has no space to wrap at. */
  const LONG = 'W'.repeat(80);
  const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const WIDTHS = [320, 375, 768, 1440];
  /** Every listed element must stay inside the panel that holds it. */
  const escapes = (page: Page, selector: string) => page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const box = el.getBoundingClientRect();
      const host = el.closest('.case-panel, .aside-card, .assistant-inline, .result-screen, .result-lab') as HTMLElement | null;
      if (!host || box.width === 0) continue;
      const bounds = host.getBoundingClientRect();
      if (box.right > bounds.right + 1 || box.left < bounds.left - 1) out.push(`${sel}: ${Math.round(box.left)}-${Math.round(box.right)} outside ${Math.round(bounds.left)}-${Math.round(bounds.right)}`);
    }
    return out;
  }, selector);
  const longAttempt = (attempt: any) => {
    if (!attempt) return attempt;
    const longer = (list?: Array<{ label: string }>) => list?.map((item) => ({ ...item, label: item.label + LONG }));
    const step = attempt.step && {
      ...attempt.step,
      sample: attempt.step.sample && { ...attempt.step.sample, label: LONG },
      hintsGiven: (attempt.step.hintsGiven ?? []).map((given: any) => ({ ...given, text: LONG })),
      items: longer(attempt.step.items), left: longer(attempt.step.left), right: longer(attempt.step.right),
      values: (attempt.step.values ?? []).map((v: any) => ({ ...v, name: v.name + LONG, value: v.value + LONG, unit: LONG, ref: LONG })),
    };
    return { ...attempt, step, revealed: (attempt.revealed ?? []).map((v: any) => ({ ...v, name: v.name + LONG, value: v.value + LONG, unit: LONG, ref: LONG })) };
  };
  async function injectLongStrings(page: Page) {
    await page.route('**/api/missions/*/start', (route) => patched(route, (body) => ({ ...body, attempt: longAttempt(body.attempt) })).catch(() => undefined));
    await page.route(/\/api\/attempts\/[^/]+$/, (route) => patched(route, (body) => longAttempt(body)).catch(() => undefined));
    await page.route('**/api/attempts/*/hint', (route) => patched(route, (body) => ({ ...body, hint: LONG, attempt: longAttempt(body.attempt) })).catch(() => undefined));
    await page.route('**/api/attempts/*/answer', (route) => patched(route, (body) => ({
      ...body,
      feedback: { ...body.feedback, message: body.correct ? body.feedback.message : LONG },
      attempt: longAttempt(body.attempt),
      result: body.result && { ...body.result, ledger: body.result.ledger.map((row: any) => ({ ...row, label: row.label + LONG, reason: LONG })) },
    })).catch(() => undefined));
  }

  test('R9-B-02: unbroken long values, hints, samples and wrong-answer text never widen the case page', async ({ page }) => {
    await injectLongStrings(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
    await page.getByRole('button', { name: DECISION.accept }).click();
    await submit(page).click();
    await expect(page.locator('.feedback.wrong')).toContainText(LONG);
    await page.getByRole('button', { name: /Ask Lab Assistant/ }).click();
    await expect(page.locator('.hint-result')).toContainText(LONG);
    await expect(page.locator('.sample-chip')).toContainText(LONG);
    await expect(page.locator('.value').first()).toContainText(LONG);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `case page at ${width}px`).toBeLessThanOrEqual(0);
      for (const sel of ['.hint-result', '.value', '.value b', '.value span', '.value em', '.value small', '.sample-chip', '.feedback.wrong', '.feedback p']) {
        expect(await escapes(page, sel), `${sel} at ${width}px`).toEqual([]);
      }
    }
  });

  test('R9-B-02: unbroken long order and matching labels stay inside their rows and never cover a control', async ({ page }) => {
    await injectLongStrings(page);
    await startMissionViaUi(page, 'Microbiology Lab', 'Gram Stain Challenge');
    await expect(page.locator('.drag-row b').first()).toContainText(LONG);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `order at ${width}px`).toBeLessThanOrEqual(0);
      expect(await escapes(page, '.drag-row b'), `order labels at ${width}px`).toEqual([]);
      expect(await escapes(page, '.move-buttons button'), `move buttons at ${width}px`).toEqual([]);
    }
    await page.getByRole('button', { name: /Exit mission/ }).click();
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    await expect(page.locator('.match-row span').first()).toContainText(LONG);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `matching at ${width}px`).toBeLessThanOrEqual(0);
      const clashes = await page.evaluate(() => {
        const out: string[] = [];
        const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        for (const row of document.querySelectorAll('.match-row')) {
          const label = row.querySelector('span')!.getBoundingClientRect();
          const select = row.querySelector('select')!.getBoundingClientRect();
          if (hit(label, select)) out.push('label overlaps its select');
        }
        const submit = document.querySelector<HTMLButtonElement>('button.submit')!;
        submit.scrollIntoView({ block: 'center' });
        const box = submit.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!submit.contains(top)) out.push(`Submit is covered by ${top?.tagName}.${top?.className}`);
        return out;
      });
      expect(clashes, `matching at ${width}px`).toEqual([]);
    }
  });

  test('R9-B-02: an unbroken ledger reason on the mission result never widens the page', async ({ page }) => {
    await injectLongStrings(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.locator('.ledger').first()).toContainText(LONG);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      expect(await overflow(page), `result at ${width}px`).toBeLessThanOrEqual(0);
      expect(await escapes(page, '.ledger li span'), `ledger at ${width}px`).toEqual([]);
    }
  });

  test('R9-B-03: a boot request the server never answers ends in an alert with a way to retry', async ({ page }) => {
    await page.evaluate((k) => sessionStorage.removeItem(k), TOKEN_KEY);
    await page.clock.install();
    let calls = 0;
    await page.route('**/api/auth/demo', async (route) => {
      calls += 1;
      if (calls === 1) return new Promise<void>(() => undefined); // never answered
      return route.continue();
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Preparing your investigation…' })).toBeVisible();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert')).toContainText(/did not answer in time/);
    await page.getByRole('button', { name: 'Reopen the laboratory' }).click();
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
  });

  test('R9-B-03: an answer the server never confirms ends in an alert and Submit works again', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.clock.install();
    await page.route('**/api/attempts/*/answer', () => new Promise<void>(() => undefined));
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('button', { name: /Checking…/ })).toBeDisabled();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toContainText(/did not answer in time/);
    await expect(page.getByRole('button', { name: /Submit answer/ })).toBeEnabled();
  });

  test('R9-B-03: a hint the server never delivers ends in an alert and the hint button works again', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.clock.install();
    await page.route('**/api/attempts/*/hint', () => new Promise<void>(() => undefined));
    await page.getByRole('button', { name: /Ask Lab Assistant/ }).click();
    await expect(page.getByRole('button', { name: /Requesting hint/ })).toBeDisabled();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toContainText(/did not answer in time/);
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeEnabled();
  });

  test('R9-B-03: a mission start the server never answers ends in an alert and Start works again', async ({ page }) => {
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: /^(Enter|Review) Hematology Lab/ }).click();
    await page.clock.install();
    await page.route('**/api/missions/hem-01/start', () => new Promise<void>(() => undefined));
    const start = page.getByRole('button', { name: /^(Start|Resume|Replay) Blood Smear Code$/ });
    await start.click();
    await expect(page.getByRole('button', { name: /^Starting Blood Smear Code$/ })).toBeVisible();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert')).toContainText(/did not answer in time/);
    await expect(start).toBeEnabled();
  });
});

test.describe('round 9: faculty and guest switching', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('R9-C-01: after a 409 on a status change the row shows the server status and the next action works', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const row = page.locator('.content-row').filter({ hasText: 'Microbe Detective' });
    await expect(row.locator('.status-pill')).toHaveText('Draft');
    // A second teacher tab (here: the API) moves the mission on while this page still shows "Draft".
    await prepareContentStatus('mic-01', 'approved');
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not update the status' })).toBeVisible();
    await expect(row.locator('.status-pill')).toHaveText('Approved');
    await expect(row.getByRole('button', { name: 'Mark reviewed' })).toHaveCount(0);
    // The only action offered is a legal one, and it works.
    await row.getByRole('button', { name: 'Return to draft', exact: true }).click();
    await expect(row.locator('.status-pill')).toHaveText('Draft');
    await prepareContentStatus('mic-01', 'draft');
  });

  test('R9-C-02: the "faculty session expired" notice does not survive a deliberate guest switch or reset', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Content review' }).click();
    await expect(page.getByText(/Your faculty guest session expired/)).toBeVisible();
    await page.getByRole('button', { name: 'Return to student demo' }).click();
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect(page.getByText(/session expired/)).toHaveCount(0);
    // And it does not come back after going to faculty and back.
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await expect(page.getByText(/session expired/)).toHaveCount(0);
  });

  test('R9-C-02: a student recovery notice does not follow the learner to the faculty view, or survive a reset', async ({ page }) => {
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Lab map' }).click();
    await expect(page.getByText(/Your guest session expired, so a new guest session was opened/)).toBeVisible();
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await expect(page.getByText(/session expired/)).toHaveCount(0);
  });
});

test.describe('round 9: resync, settings and reset', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('R9-B-04: an unlock the server executed but whose reply is unreadable shows the unlocked lab, not an error', async ({ page }) => {
    const token = await freshStudent();
    await completeLabViaApi(token, 'hematology', false);
    await openAs(page, token);
    await page.route('**/api/labs/hematology/unlock', async (route) => {
      await route.fetch(); // the server really opens the exit...
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'garbled' }); // ...but the reply cannot be read
    });
    await page.getByRole('button', { name: 'Progress' }).click();
    const card = page.locator('.vault-card').filter({ hasText: 'Hematology' });
    await card.getByRole('textbox').fill(exitCode('hematology'));
    await card.getByRole('button', { name: 'Unlock' }).click();
    await expect(card).toContainText('Exit unlocked');
    await expect(card.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(card.getByRole('status')).toContainText(/unlocked/i);
  });

  test('R9-B-04: a settings change the server stored but whose reply is unreadable is shown as saved, not rolled back', async ({ page }) => {
    await page.getByRole('button', { name: 'Learning settings' }).click();
    const box = page.getByRole('checkbox', { name: 'Reduce motion' });
    const before = await box.isChecked();
    await page.route('**/api/profile', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await route.fetch();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await box.click();
    await expect(page.getByRole('status').filter({ hasText: 'Preferences saved' })).toBeVisible();
    await expect(box).toBeChecked({ checked: !before });
    await expect(page.getByRole('alert')).toHaveCount(0);
    const stored = await apiCall(await sessionToken(page), '/profile');
    expect(stored.body.settings.reduceMotion).toBe(!before);
    await page.unroute('**/api/profile');
    await box.click();
  });

  test('R9-B-05: only settings that change something are offered', async ({ page }) => {
    await page.getByRole('button', { name: 'Learning settings' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: 'Reduce motion' })).toBeVisible();
    await expect(page.getByText(/Sound effects|Progress notifications/)).toHaveCount(0);
  });

  test('R9-B-09: Reset guest session asks first; Cancel and Escape keep everything, Confirm resets (keyboard only)', async ({ page }) => {
    let resets = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/demo/reset')) resets += 1; });
    const reset = page.getByRole('button', { name: 'Reset guest session' });
    await reset.focus();
    await page.keyboard.press('Enter');
    const group = page.getByRole('group', { name: 'Confirm guest reset' });
    await expect(group).toBeVisible();
    await expect(group).toContainText(/cannot be undone/);
    // Focus starts on the safe choice.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(group).toHaveCount(0);
    await expect(reset).toBeFocused();
    expect(resets).toBe(0);
    // Escape also backs out.
    await page.keyboard.press('Enter');
    await expect(group).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(group).toHaveCount(0);
    await expect(reset).toBeFocused();
    expect(resets).toBe(0);
    // Confirming resets.
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Confirm reset' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect.poll(() => resets).toBe(1);
  });
});

test.describe('round 9: faculty roster, analytics and content review', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });
  const openFacultyPage = async (page: Page) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
  };

  test('R9-C-03: an empty class shows no-data states, not Completion 0% and "Follow-up recommended"', async ({ page }) => {
    await page.route('**/api/classes/*/analytics', (route) => patched(route, (b) => ({ ...b, cohort: { ...b.cohort, students: 0, avgCompletionPct: 0, needsAttention: 0 }, missions: [] })));
    await page.route('**/api/classes/*/students', (route) => patched(route, (b) => ({ ...b, total: 0, students: [] })));
    await openFacultyPage(page);
    const stats = page.locator('.teacher-stats');
    await expect(stats.locator('.stat').filter({ hasText: 'Completion' })).toContainText('—');
    await expect(stats.locator('.stat').filter({ hasText: 'Needs attention' })).toContainText('—');
    await expect(stats).toContainText('No students yet');
    await expect(stats).not.toContainText('0%');
    await expect(stats).not.toContainText('Follow-up recommended');
  });

  test('R9-C-04/05: same-name students are told apart, and a roster row names its accuracy and reason', async ({ page }) => {
    let ids: number[] = [];
    await page.route('**/api/classes/*/students', (route) => patched(route, (b) => {
      b.students[1].name = b.students[0].name;
      ids = [b.students[0].id, b.students[1].id];
      return b;
    }));
    await openFacultyPage(page);
    await expect(page.locator('button.mission-row').first()).toBeVisible();
    const name = (await page.locator('button.mission-row span').first().textContent())!.replace(/#\d+$/, '').trim();
    const twins = page.getByRole('button', { name: new RegExp(`^Open ${name} \\(#\\d+\\)`) });
    await expect(twins).toHaveCount(2);
    const names = await twins.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(new Set(names).size).toBe(2);
    expect(names.join(' ')).toContain(`#${ids[0]}`);
    expect(names.join(' ')).toContain(`#${ids[1]}`);
    // Others stay untagged.
    await expect(page.locator('button.mission-row .id-tag')).toHaveCount(2);
    // R9-C-05: the accessible name carries the accuracy and the reason the row shows, and the number is labelled on screen.
    const row = page.locator('button.mission-row').first();
    await expect(row).toHaveAccessibleName(/accuracy (\d+%|not available), (On track|.+)/);
    await expect(row.locator('b')).toContainText('accuracy');
    const reason = (await row.locator('small').last().textContent())!.trim();
    expect(await row.getAttribute('aria-label')).toContain(reason);
    // The Student detail picker shows the same discriminator.
    await twins.first().click();
    await expect(page.locator('.profile-card')).toBeVisible();
    const options = await page.locator('.picker-label select').last().locator('option').allTextContents();
    expect(options.filter((o) => o.startsWith(name))).toHaveLength(2);
    expect(new Set(options).size).toBe(options.length);
  });

  test('R9-C-07: a success % shows how many students it rests on, and the Master mission is listed after the standard ones', async ({ page }) => {
    await page.route('**/api/classes/*/analytics', (route) => patched(route, (b) => {
      const master = { missionId: 'master-01', title: 'Clinical Detective', labSlug: 'master', studentsStarted: 1, studentsCompleted: 1, successPct: 5, needsAttention: false };
      return { ...b, missions: [master, ...b.missions.filter((m: any) => m.labSlug !== 'master')] };
    }));
    await openFacultyPage(page);
    await page.getByRole('button', { name: /^Show all/ }).first().click();
    const rows = page.locator('li.mission-signal');
    await expect(rows.last()).toContainText('Clinical Detective');
    await expect(rows.last()).toContainText('Not counted in class figures');
    const withData = rows.filter({ has: page.locator('.bar') });
    expect(await withData.count()).toBeGreaterThan(1);
    for (const text of await withData.allTextContents()) expect(text).toMatch(/\d+ of \d+ students completed/);
  });

  test('R9-C-08: a failed faculty page has exactly one h1', async ({ page }) => {
    await page.route('**/api/classes', (route) => route.fulfill(serverError()));
    await openFacultyPage(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Faculty view unavailable', level: 2 })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('R9-C-09: a laboratory with one mission says "1 mission"', async ({ page }) => {
    await page.route('**/api/labs', (route) => patched(route, (b) => ({ ...b, labs: b.labs.map((l: any, i: number) => (i === 0 ? { ...l, missions: { completed: 1, total: 1 }, fragments: { found: 1, total: 1 } } : l)) })));
    await page.getByRole('button', { name: 'Lab map' }).click();
    const card = page.locator('.lab-card').first();
    await expect(card).toContainText('1 of 1 mission · 1 of 1 code fragment');
    await expect(card).not.toContainText('1 missions');
  });

  test('R9-C-06: content review shows who moved a mission and when (verbatim from the server), and announces a save', async ({ page }) => {
    await prepareContentStatus('hem-02', 'draft');
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const row = page.locator('.content-row').filter({ hasText: 'Fix the Sample' });
    await expect(row.locator('.review-trail')).toBeVisible();
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fix the Sample is now reviewed.' })).toBeVisible();
    const listed = await apiCall(await teacherToken(), '/content/missions');
    const server = (listed.body.missions as { missionId: string; reviewedBy: string; updatedAt: number }[]).find((m) => m.missionId === 'hem-02')!;
    expect(server.reviewedBy).toBeTruthy();
    await expect(row.locator('.review-trail')).toContainText(`Reviewed by ${server.reviewedBy}`);
    await expect(row.locator('.review-trail time')).toHaveAttribute('datetime', new Date(server.updatedAt).toISOString());
    await prepareContentStatus('hem-02', 'draft');
  });
});

test.describe('round 9: mission screen and dashboard details', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('R9-B-10: once every laboratory is cleared the dashboard says so', async ({ page }) => {
    const token = await freshStudent();
    for (const slug of ['hematology', 'microbiology', 'biochemistry', 'master']) await completeLabViaApi(token, slug);
    await openAs(page, token);
    await expect(page.getByRole('heading', { name: 'All investigations complete.' })).toBeVisible();
    await expect(page.getByText('Select a discipline to begin')).toHaveCount(0);
    await expect(page.getByText('Continue your investigations.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Lab results' }).click();
    await expect(page.getByRole('heading', { name: 'Hematology Lab: Escape confirmed' })).toBeVisible();
  });

  test('R9-B-12: the mission header names the laboratory, never the internal mission id', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.locator('.player-title .eyebrow')).toHaveText('CASE FILE · Hematology');
    await expect(page.locator('.player')).not.toContainText('hem-01');
  });

  test('R9-B-11: at tablet width the case status card spans the case panel', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1000 });
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const panel = (await page.locator('.case-panel').boundingBox())!;
    const status = (await page.locator('.case-status-card').boundingBox())!;
    expect(Math.abs(status.width - panel.width)).toBeLessThanOrEqual(1);
  });

  test('R9-B-15: a slow mission start does not take over the screen after the learner went elsewhere', async ({ page }) => {
    const gate = await slow(page, '**/api/missions/*/start');
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: /^(Enter|Review) Hematology Lab/ }).click();
    await page.getByRole('button', { name: /^(Start|Resume|Replay) Blood Smear Code$/ }).click();
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
    gate.release();
    await expect(page.getByRole('status').filter({ hasText: 'Starting mission' })).toHaveCount(0);
    await expect(page.locator('.case-panel')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Progress vault' })).toBeVisible();
  });

  test('R9-B-15: Exit mission is disabled while an answer is being checked', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const gate = await slow(page, '**/api/attempts/*/answer');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('button', { name: /Exit mission/ })).toBeDisabled();
    gate.release();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
  });

  test('R9-B-15: an old "cannot reach the server" alert disappears once the server answers again', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    let down = true;
    await page.route('**/api/attempts/*/answer', (route) => (down ? route.abort('failed') : route.continue()));
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toBeVisible();
    down = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toHaveCount(0);
  });

  test('R9-B-16: the page declares an inline icon, so no /favicon.ico request is made', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/<link rel="icon" href="data:image\/svg\+xml,/);
  });

  test('R9-B-17: a duplicated matching association is styled as an error, not only announced', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const selects = page.locator('select');
    const options = await selects.first().locator('option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean));
    await selects.nth(0).selectOption(options[0]!);
    await selects.nth(1).selectOption(options[0]!);
    const border = (i: number) => selects.nth(i).evaluate((el) => getComputedStyle(el).borderTopColor);
    await expect(selects.nth(0)).toHaveAttribute('aria-invalid', 'true');
    expect(await border(0)).not.toBe(await border(2));
    expect(await border(1)).toBe(await border(0));
  });

  test('R9-B-17: the countdown keeps running when the computer clock is stepped back', async ({ page }) => {
    await page.clock.install();
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const left = async () => {
      const label = (await page.getByRole('timer').getAttribute('aria-label'))!;
      const [, m, s] = /(\d+):(\d+)/.exec(label)!;
      return Number(m) * 60 + Number(s);
    };
    const before = await left();
    await page.clock.setSystemTime(new Date(Date.now() - 3_600_000));
    await page.clock.runFor(5_000);
    expect(before - (await left())).toBeGreaterThanOrEqual(4);
  });

  test('R9-B-06: both paid hints are still on screen after a reload, with no second charge', async ({ page }) => {
    const HINTS = ['Ignore the round cells with central pallor.', 'The cell you want is smaller than its neighbours and has pointed corners.'];
    let hintCalls = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && /\/api\/attempts\/[^/]+\/hint$/.test(request.url())) hintCalls += 1; });
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code'); // two hints on its single step
    const ask = page.getByRole('button', { name: /Ask Lab Assistant/ });
    await ask.click();
    await expect(page.locator('.hint-result')).toHaveCount(1);
    await expect(page.locator('.hint-result').first()).toContainText(HINTS[0]!);
    await ask.click();
    await expect(page.locator('.hint-result')).toHaveCount(2);
    await expect(page.locator('.hint-result').nth(1)).toContainText(HINTS[1]!);
    await expect(page.getByText('Hints used on this step: 2 of 2.')).toBeVisible();
    await expect(caseStatus(page, 'Hints used')).toHaveText('2');
    const penalty = await caseStatus(page, 'XP penalty').innerText();
    expect(hintCalls).toBe(2);

    await page.reload();
    await expect(page.getByText('Hints used on this step: 2 of 2.')).toBeVisible();
    const shown = page.locator('.hint-result');
    await expect(shown).toHaveCount(2);
    await expect(shown.nth(0)).toContainText(HINTS[0]!);
    await expect(shown.nth(1)).toContainText(HINTS[1]!);
    await expect(shown.nth(0)).toContainText('Hint 1.');
    await expect(shown.nth(1)).toContainText('Hint 2.');
    await expect(page.getByText(/Earlier hint text is not stored/)).toHaveCount(0);
    await expect(caseStatus(page, 'Hints used')).toHaveText('2');
    await expect(caseStatus(page, 'XP penalty')).toHaveText(penalty);
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();
    expect(hintCalls, 'reloading never asks for (or pays for) another hint').toBe(2);

    // Leaving the mission and coming back resumes the same attempt with the same hints.
    await page.getByRole('button', { name: /Exit mission/ }).click();
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.locator('.hint-result')).toHaveCount(2);
    await expect(page.locator('.hint-result').nth(1)).toContainText(HINTS[1]!);
    await expect(caseStatus(page, 'XP penalty')).toHaveText(penalty);
    expect(hintCalls).toBe(2);
  });
});

test.describe('round 10: shell, settings, rules and resync', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  const settingsFailures: Array<[string, ReturnType<typeof json>]> = [
    ['403', json(403, { error: { code: 'forbidden', message: 'Settings are not available to this account.' } })],
    ['500', serverError()],
    ['503', json(503, { error: { code: 'unavailable', message: 'Settings service unavailable' } })],
    ['invalid JSON', { status: 200, contentType: 'application/json', body: '{not json' }],
    ['incomplete payload', json(200, { settings: { sound: true } })],
  ];
  const settingsAlert = (page: Page) => page.getByRole('alert').filter({ hasText: /learning settings could not be loaded/i });

  for (const [name, response] of settingsFailures) {
    test(`R10-C-01: a failed GET /profile (${name}) is a visible alert with Retry for both roles`, async ({ page }) => {
      const down = await outage(page, '**/api/profile', response as ReturnType<typeof serverError>);
      await page.reload();
      await expect(homeHeading(page)).toBeVisible();
      await expect(settingsAlert(page)).toBeVisible();
      await expect(settingsAlert(page).getByRole('button', { name: 'Retry' })).toBeVisible();
      // The Learning settings page keeps its own panel: one alert there, not two.
      await page.getByRole('button', { name: 'Learning settings' }).click();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await page.getByRole('button', { name: 'Investigations' }).click();
      await expect(settingsAlert(page)).toBeVisible();
      // The faculty guest has the same notice.
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
      await expect(settingsAlert(page)).toBeVisible();
      down.lift();
      await settingsAlert(page).getByRole('button', { name: 'Retry' }).click();
      await expect(settingsAlert(page)).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
    });
  }

  test('R10-C-01: the saved Reduce motion preference is applied once Retry succeeds', async ({ page }) => {
    const token = await sessionToken(page);
    expect((await apiCall(token, '/profile', { method: 'PUT', body: { reduceMotion: true } })).status).toBe(200);
    try {
      const down = await outage(page, '**/api/profile');
      await page.reload();
      await expect(homeHeading(page)).toBeVisible();
      await expect(settingsAlert(page)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBeUndefined();
      down.lift();
      await settingsAlert(page).getByRole('button', { name: 'Retry' }).click();
      await expect(settingsAlert(page)).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBe('true');
    } finally {
      await apiCall(token, '/profile', { method: 'PUT', body: { reduceMotion: false } });
    }
  });

  test('R10-C-01: a 401 on GET /profile ends in a visible alert (the guest gate), never in silence', async ({ page }) => {
    await page.route('**/api/profile', (route) => route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Sign in again.' } })));
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reopen the laboratory' })).toBeVisible();
  });

  test('R10-C-02: a 401 that arrives while a guest switch is in flight does not leave the student notice on the faculty session', async ({ page }) => {
    let release401: () => void = () => undefined;
    const gate401 = new Promise<void>((resolve) => { release401 = resolve; });
    let answered401 = false;
    await page.route('**/api/labs', async (route) => {
      await gate401;
      await route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Sign in again.' } }));
      answered401 = true;
    });
    let releaseSwitch: () => void = () => undefined;
    const gateSwitch = new Promise<void>((resolve) => { releaseSwitch = resolve; });
    await page.route('**/api/auth/demo', async (route) => { await gateSwitch; await route.continue(); });
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('button', { name: 'Switching…' })).toBeVisible();
    release401();
    await expect.poll(() => answered401).toBe(true);
    await settle(page); await settle(page); await settle(page);
    releaseSwitch();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await settle(page);
    await expect(page.getByText(/session expired/)).toHaveCount(0);
  });

  test('R10-C-02: and the faculty notice does not leak onto the student session either', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    let release401: () => void = () => undefined;
    const gate401 = new Promise<void>((resolve) => { release401 = resolve; });
    let answered401 = false;
    await page.route('**/api/content/missions', async (route) => {
      await gate401;
      await route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Sign in again.' } }));
      answered401 = true;
    });
    let releaseSwitch: () => void = () => undefined;
    const gateSwitch = new Promise<void>((resolve) => { releaseSwitch = resolve; });
    await page.route('**/api/auth/demo', async (route) => { await gateSwitch; await route.continue(); });
    await page.getByRole('button', { name: 'Content review' }).click();
    await page.getByRole('button', { name: 'Return to student demo' }).click();
    await expect(page.getByRole('button', { name: 'Resetting…' })).toBeVisible();
    release401();
    await expect.poll(() => answered401).toBe(true);
    await settle(page); await settle(page); await settle(page);
    releaseSwitch();
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await settle(page);
    await expect(page.getByText(/session expired/)).toHaveCount(0);
  });

  test('R10-C-03: dismissing the session notice by keyboard leaves focus on the page heading, not on the document', async ({ page }) => {
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Lab map' }).click();
    const notice = page.getByRole('status').filter({ hasText: /session expired/ });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Dismiss' }).focus();
    await page.keyboard.press('Enter');
    await expect(notice).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R10-C-03: dismissing an error banner by keyboard leaves focus on the page heading', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => route.fulfill(serverError()));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    const banner = page.getByRole('alert').filter({ hasText: 'Temporary outage' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Dismiss' }).focus();
    await page.keyboard.press('Enter');
    await expect(banner).toHaveCount(0);
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R10-C-04: a failed GET /rules is announced with a Retry, and the hint price appears once it works', async ({ page }) => {
    const down = await outage(page, '**/api/rules', json(503, { error: { code: 'unavailable', message: 'Rules service unavailable' } }));
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const alert = page.getByRole('alert').filter({ hasText: /hint price|scoring rules/i });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Rules service unavailable');
    await expect(page.getByText(/Each hint costs \d+ XP/)).toHaveCount(0);
    // Not blocking: hints and the answer still work.
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeEnabled();
    down.lift();
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText(/Each hint costs \d+ XP/)).toBeVisible();
  });

  test('R10-B-01: an unbroken new-badge name on the mission result never widens the page', async ({ page }) => {
    const LONG = 'W'.repeat(60);
    await page.route('**/api/attempts/*/answer', (route) => patched(route, (body) => ({
      ...body,
      result: body.result && { ...body.result, newBadges: [{ id: 'long-badge', name: `Perfect Mission${LONG}`, description: LONG }, { id: 'second', name: LONG, description: 'x' }] },
    })).catch(() => undefined));
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await expect(page.locator('.badge-chips li').first()).toContainText(LONG);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `result at ${width}px`).toBeLessThanOrEqual(0);
      const outside = await page.evaluate(() => Array.from(document.querySelectorAll('.badge-chips li')).map((el) => el.getBoundingClientRect()).filter((r) => r.left < -0.5 || r.right > document.documentElement.clientWidth + 0.5).length);
      expect(outside, `badge chips outside the screen at ${width}px`).toBe(0);
    }
  });

  test('R10-B-02: after the 20 s timeout Submit and Exit work again at once, while the resync runs on its own', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.clock.install();
    await page.route('**/api/attempts/*/answer', () => new Promise<void>(() => undefined));
    await page.route(/\/api\/attempts\/[^/]+$/, () => new Promise<void>(() => undefined));
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('button', { name: /Checking…/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Exit mission/ })).toBeDisabled();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toContainText(/did not answer in time/);
    // The server record is being re-read (that request hangs too), but the learner is not locked out meanwhile.
    await expect(page.getByRole('button', { name: /Submit answer/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Exit mission/ })).toBeEnabled();
    await expect(page.getByRole('status').filter({ hasText: /Checking what the server recorded/ })).toBeVisible();
    await page.clock.fastForward(21_000);
    await expect(page.getByText(/Could not refresh the timer from the server/)).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /Checking what the server recorded/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Submit answer/ })).toBeEnabled();
  });

  test('R10-B-02: the same for a hint that never arrives', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.clock.install();
    await page.route('**/api/attempts/*/hint', () => new Promise<void>(() => undefined));
    await page.route(/\/api\/attempts\/[^/]+$/, () => new Promise<void>(() => undefined));
    await page.getByRole('button', { name: /Ask Lab Assistant/ }).click();
    await expect(page.getByRole('button', { name: /Requesting hint/ })).toBeDisabled();
    await page.clock.fastForward(21_000);
    await expect(page.getByRole('alert').filter({ hasText: 'This could not be completed.' })).toContainText(/did not answer in time/);
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Exit mission/ })).toBeEnabled();
  });

  test('R10-B-03: a stale tab that asks for a hint after the hints were bought elsewhere re-reads the attempt', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code'); // two hints on its single step
    await expect(page.getByText('Hints used on this step: 0 of 2.')).toBeVisible();
    const token = await sessionToken(page);
    const attemptId = (await page.evaluate((k) => sessionStorage.getItem(k), 'escape-demo-attempt'))!;
    const current = await apiCall(token, `/attempts/${attemptId}`);
    const stepId = current.body.step.id as string;
    // "Another tab" buys both hints.
    for (let i = 0; i < 2; i += 1) expect((await apiCall(token, `/attempts/${attemptId}/hint`, { method: 'POST', body: { stepId } })).status).toBe(200);
    await page.getByRole('button', { name: /Ask Lab Assistant/ }).click();
    await expect(page.getByRole('alert')).toContainText('No more hints are available');
    await expect(page.getByText('Hints used on this step: 2 of 2.')).toBeVisible();
    await expect(page.locator('.hint-result')).toHaveCount(2);
    await expect(caseStatus(page, 'Hints used')).toHaveText('2');
    await expect(page.getByRole('button', { name: 'No more hints on this step' })).toBeDisabled();
  });

  test('R10-B-05: "Return to mission control" lands on Mission control, also when the mission was started from a laboratory', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect(page.locator('.crumb')).toHaveText('Mission control');
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R10-C-06: a reviewer name made of stacked combining marks is clipped inside its own row', async ({ page }) => {
    const zalgo = `Dr N${'\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307'.repeat(40)}ame`;
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.route('**/api/content/missions', (route) => patched(route, (body) => ({
      ...body, missions: body.missions.map((m: any, i: number) => (i === 0 ? { ...m, reviewedBy: zalgo, updatedAt: Date.parse('2026-10-08T12:00:00Z'), status: 'reviewed' } : m)),
    })));
    await page.getByRole('button', { name: 'Content review' }).click();
    const trail = page.locator('.review-trail').first();
    await expect(trail).toContainText('Dr N');
    const clip = await trail.evaluate((el) => getComputedStyle(el).overflow);
    expect(['hidden', 'clip']).toContain(clip);
  });

  test('R10-C-08: the "list could not be refreshed" alert has a Retry that re-reads the list', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const row = page.locator('.content-row').filter({ hasText: 'Microbe Detective' });
    await expect(row.locator('.status-pill')).toHaveText('Draft');
    await prepareContentStatus('mic-01', 'approved');
    const down = await outage(page, '**/api/content/missions');
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    const stale = page.getByRole('alert').filter({ hasText: 'could not be refreshed' });
    await expect(stale).toBeVisible();
    await expect(row.locator('.status-pill')).toHaveText('Draft');
    down.lift();
    await stale.getByRole('button', { name: 'Retry' }).click();
    await expect(stale).toHaveCount(0);
    await expect(row.locator('.status-pill')).toHaveText('Approved');
    await prepareContentStatus('mic-01', 'draft');
  });

  test('R10-C-11: a student heading with a namesake tag separates the name from the id', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({ ...body, students: [...body.students, { ...body.students[0], id: 9999 }] })));
    await page.getByRole('button', { name: 'Student detail' }).click();
    const heading = page.locator('.profile-card h2');
    await expect(heading.locator('.id-tag')).toBeVisible();
    const text = (await heading.textContent())!;
    expect(text).toMatch(/\S\s+#\d+$/);
    await expect(page.getByRole('heading', { name: /\S #\d+$/ })).toBeVisible();
  });
});

test.describe('round 11: faculty, dashboard wording, session recovery', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  const openContent = async (page: Page) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const row = page.locator('.content-row').filter({ hasText: 'Microbe Detective' });
    await expect(row.locator('.status-pill')).toHaveText('Draft');
    return row;
  };
  const lostReplies: Array<[string, (route: import('@playwright/test').Route) => Promise<void>]> = [
    ['502 HTML page', async (route) => { await route.fetch(); await route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }); }],
    ['connection dropped', async (route) => { await route.fetch(); await route.abort('failed'); }],
    ['unreadable 200', async (route) => { await route.fetch(); await route.fulfill({ status: 200, contentType: 'application/json', body: '{not json' }); }],
  ];
  for (const [name, handler] of lostReplies) {
    test(`R11-C-01: a status change applied by the server whose reply is lost (${name}) shows the real status and does not claim a failure`, async ({ page }) => {
      await prepareContentStatus('mic-01', 'draft');
      try {
        const row = await openContent(page);
        await page.route('**/api/content/missions/mic-01/status', handler);
        await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
        await expect(row.locator('.status-pill')).toHaveText('Reviewed');
        const alert = page.getByRole('alert').filter({ hasText: /Could not confirm the status change/ });
        await expect(alert).toBeVisible();
        await expect(alert).toContainText('what the server recorded');
        await expect(page.getByText(/Could not update the status/)).toHaveCount(0);
        await page.unroute('**/api/content/missions/mic-01/status');
        // The legal next action is offered and works.
        await row.getByRole('button', { name: 'Approve', exact: true }).click();
        await expect(row.locator('.status-pill')).toHaveText('Approved');
        await expect(alert).toHaveCount(0);
      } finally {
        await prepareContentStatus('mic-01', 'draft');
      }
    });
  }

  test('R11-C-01: a 503 that did NOT store the change leaves the real (old) status, with the same truthful wording', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    const row = await openContent(page);
    await page.route('**/api/content/missions/mic-01/status', (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: '' }));
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: /Could not confirm the status change/ });
    await expect(alert).toBeVisible();
    // R11-B-07: an empty-bodied 503 reads as a sentence, not as "Request failed (503)".
    // R12-C-05: and an unconfirmed change (it may have been applied) is never followed by advice to repeat it.
    await expect(alert).toContainText('The server had a problem.');
    await expect(alert).not.toContainText('Please retry');
    await expect(alert).not.toContainText('Request failed');
    await expect(row.locator('.status-pill')).toHaveText('Draft');
  });

  test('R11-C-01: a clean 4xx refusal keeps the "Could not update the status" wording and needs no re-read', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    const row = await openContent(page);
    let rereads = 0;
    await page.route('**/api/content/missions', (route) => { rereads += 1; return route.continue(); });
    await page.route('**/api/content/missions/mic-01/status', (route) => route.fulfill(json(400, { error: { code: 'validation_error', message: 'Not allowed here.' } })));
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not update the status: Not allowed here.' })).toBeVisible();
    await settle(page);
    expect(rereads).toBe(0);
  });

  test('R11-C-02 / R11-B-06: the dashboard says the figures count the standard missions and labs, and the Master Lab is separate', async ({ page }) => {
    const token = await freshStudent();
    for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
    await openAs(page, token);
    const stats = page.locator('.stats').first();
    await expect(stats.locator('.stat').filter({ hasText: 'Missions completed' })).toContainText('9 of 9');
    await expect(stats.locator('.stat').filter({ hasText: 'Missions completed' })).toContainText('100% of the standard missions');
    await expect(stats.locator('.stat').filter({ hasText: 'Missions completed' })).toContainText('Master Lab is tracked separately');
    await expect(stats.locator('.stat').filter({ hasText: 'Labs cleared' })).toContainText('3 of 3');
    await expect(stats.locator('.stat').filter({ hasText: 'Labs cleared' })).toContainText('standard labs');
    await expect(page.getByText('of the investigation map')).toHaveCount(0);
    // The Master Lab is still open, so nothing claims that every investigation is complete.
    await expect(page.getByRole('heading', { name: 'All investigations complete.' })).toHaveCount(0);
    await completeLabViaApi(token, 'master');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'All investigations complete.' })).toBeVisible();
    await expect(stats.locator('.stat').filter({ hasText: 'Labs cleared' })).toContainText('3 of 3');
    await expect(page.locator('.lab-strip .lab-card').filter({ hasText: 'CLEARED' })).toHaveCount(4);
  });

  test('R11-C-03: namesakes that differ only by inner spaces or case get an id tag too', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    // The roster answers late on purpose: while it loads, the only select on the page is the Class picker (this test used to read that one: a race, not a flake).
    await page.route(/\/api\/classes\/\d+\/students$/, async (route) => { await new Promise((r) => setTimeout(r, 800)); await route.fallback(); });
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({
      ...body,
      students: [...body.students, { ...body.students[0], id: 9001, name: 'Zed  Quinn' }, { ...body.students[0], id: 9002, name: 'Zed Quinn' }, { ...body.students[0], id: 9003, name: 'zed quinn' }],
    })));
    await page.getByRole('button', { name: 'Student detail' }).click();
    const picker = page.getByLabel('Student', { exact: true });
    await expect(picker.locator('option')).not.toHaveCount(0);
    const texts = (await picker.locator('option').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
    expect(texts.filter((t) => /^zed quinn/i.test(t))).toEqual(['Zed Quinn (#9001)', 'Zed Quinn (#9002)', 'zed quinn (#9003)']);
  });

  test('R11-C-04: the previous guest Reduce motion does not stay applied when the new guest profile cannot be loaded', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    const teacher = await sessionToken(page);
    expect((await apiCall(teacher, '/profile', { method: 'PUT', body: { reduceMotion: true } })).status).toBe(200);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBe('true');
      await page.route('**/api/profile', (route) => (route.request().method() === 'GET' ? route.fulfill(serverError()) : route.continue()));
      await page.getByRole('button', { name: 'Return to student demo' }).click();
      await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: /learning settings could not be loaded/i })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.reduceMotion)).toBeUndefined();
    } finally {
      await apiCall(teacher, '/profile', { method: 'PUT', body: { reduceMotion: false } });
    }
  });

  test('R11-C-05: a 401 from the old token that lands during a switch which then fails ends in the automatic recovery, not in a dead error panel', async ({ page }) => {
    let release401: () => void = () => undefined;
    const gate401 = new Promise<void>((resolve) => { release401 = resolve; });
    let answered401 = false;
    await page.route('**/api/labs', async (route) => {
      // Only the request of the OLD session is rejected; the fresh session must load normally.
      if (answered401) { await route.continue(); return; }
      await gate401;
      answered401 = true;
      await route.fulfill(json(401, { error: { code: 'unauthorized', message: 'Sign in again.' } }));
    });
    let releaseSwitch: () => void = () => undefined;
    const gateSwitch = new Promise<void>((resolve) => { releaseSwitch = resolve; });
    let logins = 0;
    await page.route('**/api/auth/demo', async (route) => {
      logins += 1;
      if (logins === 1) { await gateSwitch; await route.fulfill(serverError('Switch refused')); return; }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Lab map' }).click();
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('button', { name: 'Switching…' })).toBeVisible();
    release401();
    await expect.poll(() => answered401).toBe(true);
    await settle(page); await settle(page); await settle(page);
    releaseSwitch();
    // The recovery opens a fresh student guest and says why.
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect(page.getByText(/Your guest session expired, so a new guest session was opened/)).toBeVisible();
    await expect(page.getByText('This page could not be loaded')).toHaveCount(0);
    expect(logins).toBe(2);
  });

  test('R11-B-05: after an automatic session recovery keyboard focus lands on the page heading, on a page and in a mission', async ({ page }) => {
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await page.getByRole('button', { name: 'Lab map' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Your guest session expired/)).toBeVisible();
    await expect(page.locator('main h1').first()).toBeFocused();

    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.evaluate((key) => sessionStorage.removeItem(key), TOKEN_KEY);
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R11-B-04: the expired and gone panels offer "Return to mission control" and land there, whichever screen the mission started from', async ({ page }) => {
    // Started from the dashboard.
    await page.getByRole('button', { name: /^(Start the next investigation|Resume active investigation)/ }).click();
    await expect(page.locator('.case-panel h1')).toBeVisible();
    await page.route('**/api/attempts/*/hint', (route) => route.fulfill(json(409, { error: { code: 'time_expired', message: 'This attempt has exceeded its time limit.' } })));
    await page.getByRole('button', { name: 'Ask Lab Assistant' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Time is up.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to the laboratory' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await expect(page.getByRole('heading', { name: HOME })).toBeVisible();
    await expect(page.locator('.crumb')).toHaveText('Mission control');
    await expect(page.locator('main h1').first()).toBeFocused();
    await page.unroute('**/api/attempts/*/hint');
    // Started from a laboratory.
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    expireAttemptInDb((await page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY))!);
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'Time is up.' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to mission control' }).click();
    await expect(page.locator('.crumb')).toHaveText('Mission control');
  });

  test('R11-B-07: an empty-bodied 503 on the settings load reads as a sentence in the banner', async ({ page }) => {
    await page.route('**/api/profile', (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: '' }));
    await page.reload();
    await expect(homeHeading(page)).toBeVisible();
    const banner = page.getByRole('alert').filter({ hasText: /learning settings could not be loaded/i });
    await expect(banner).toContainText('The server had a problem. Please retry.');
    await expect(banner).not.toContainText('Request failed');
  });

  test('R11-C-07: in a class with no completions the dash stays beside "No completions yet"', async ({ page }) => {
    await page.route('**/api/classes/*/analytics', (route) => patched(route, (b) => ({
      ...b, missions: b.missions.map((m: any) => ({ ...m, successPct: null, studentsCompleted: 0, needsAttention: false })),
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const row = page.locator('li.mission-signal').first();
      await expect(row.getByText('No completions yet')).toBeVisible();
      const label = (await row.getByText('No completions yet').boundingBox())!;
      const dash = (await row.locator('.signal-empty b').boundingBox())!;
      const name = (await row.locator('> span').first().boundingBox())!;
      expect(dash.y, `dash on the label line at ${width}px`).toBeLessThan(label.y + label.height);
      expect(dash.y + dash.height, `dash on the label line at ${width}px`).toBeGreaterThan(label.y);
      expect(dash.x, `dash right of the label at ${width}px`).toBeGreaterThan(label.x);
      expect(dash.y, `dash not under the mission name at ${width}px`).toBeLessThan(name.y + name.height);
    }
  });
});

// ------------------------------------------------------------------ round 12 (frontend)
/** True when the characters of `needle`, found in the text of `el`, are laid out left to right (an unclosed bidi override reverses them). */
async function laidOutLeftToRight(el: import('@playwright/test').Locator, needle: string): Promise<boolean> {
  return el.evaluate((node, text) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const at = (t.textContent ?? '').indexOf(text);
      if (at < 0) continue;
      const xs: number[] = [];
      for (let i = 0; i < text.length; i += 1) {
        const r = document.createRange();
        r.setStart(t, at + i);
        r.setEnd(t, at + i + 1);
        const box = r.getBoundingClientRect();
        if (text[i] !== ' ') xs.push(box.left);
      }
      return xs.every((x, i) => i === 0 || x > xs[i - 1]!);
    }
    throw new Error(`text not found: ${text}`);
  }, needle);
}

test.describe('round 12: mission player', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('R12-B-01: when the server closes the attempt while the learner is on the question (passive expiry), focus lands on Restart mission', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).focus();
    await expect(submit(page)).toBeFocused();
    expireAttemptInDb((await page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY))!);
    // Coming back to the tab refreshes the attempt: the server now says time is up.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert').filter({ hasText: 'Time is up.' })).toBeVisible();
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Restart mission' })).toBeFocused();
  });

  test('R12-B-01: the same when the attempt vanishes (404 on the refresh)', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).focus();
    await page.route(/\/api\/attempts\/[^/]+$/, (route) => route.fulfill(json(404, { error: { code: 'not_found', message: 'Attempt not found.' } })));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert').filter({ hasText: 'This case is no longer available.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restart mission' })).toBeFocused();
  });

  test('R12-B-01: a learner who is on Exit mission when time runs out keeps focus there', async ({ page }) => {
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await page.getByRole('button', { name: /Exit mission/ }).focus();
    expireAttemptInDb((await page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY))!);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('alert').filter({ hasText: 'Time is up.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Exit mission/ })).toBeFocused();
  });

  test('R12-B-03: crossing the 900px breakpoint keeps keyboard focus on Ask Lab Assistant', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    const hint = page.getByRole('button', { name: /Ask Lab Assistant/ });
    await hint.focus();
    await expect(hint).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('.aside-card .hint')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeFocused();
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('.assistant-inline .hint')).toBeVisible();
    await expect(page.getByRole('button', { name: /Ask Lab Assistant/ })).toBeFocused();
  });
});

test.describe('round 12: faculty names, errors, focus', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  const BOB = '\u202e';
  let firstId = 0;
  const twins = (body: any) => {
    firstId = body.students[0].id;
    return { ...body, students: [...body.students, { ...body.students[0], id: 9125, name: `Bob${BOB}` }, { ...body.students[0], id: 9126, name: `Bob${BOB}` }] };
  };

  test('R12-C-02: an unclosed bidi override in a student name does not reverse the #id tag in the roster, the picker or the heading', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, twins));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.getByRole('button', { name: /Show all/ }).last().click();
    const tag = page.locator('.mission-row .id-tag').filter({ hasText: '#9125' });
    await expect(tag).toBeVisible();
    expect(await laidOutLeftToRight(tag, '#9125')).toBe(true);
    await page.getByRole('button', { name: 'Student detail' }).click();
    const picker = page.getByLabel('Student', { exact: true });
    await expect(picker.locator('option')).not.toHaveCount(0);
    const options = await picker.locator('option').allTextContents();
    // The option cannot hold markup: the name is wrapped in isolate characters (FSI .. PDI) and loses any control that could escape them.
    expect(options.filter((t) => t.includes('#9125'))).toEqual(['\u2068Bob\u2069 (#9125)']);
    // The invented student has no record on the server: serve a real record under that id, with the same unclosed override in its name.
    await page.route(/\/api\/classes\/\d+\/students\/9125$/, async (route) => {
      const real = await route.fetch({ url: route.request().url().replace('/9125', `/${firstId}`) });
      const body = await real.json();
      await route.fulfill({ response: real, json: { ...body, student: { ...body.student, id: 9125, name: `Bob${BOB}` } } });
    });
    await picker.selectOption('9125');
    const heading = page.locator('.profile-card h2');
    await expect(heading.locator('.id-tag')).toHaveText('#9125');
    expect(await laidOutLeftToRight(heading, '#9125')).toBe(true);
  });

  test('R12-C-01: an unclosed bidi override in the reviewer name keeps "(teacher #id)" and the date readable', async ({ page }) => {
    await page.route('**/api/content/missions', (route) => patched(route, (body) => ({
      ...body,
      missions: body.missions.map((m: any, i: number) => (i === 0 ? { ...m, status: 'reviewed', reviewedBy: `Prof Bidi${BOB} (teacher #129)`, updatedAt: 1791453365153 } : m)),
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const trail = page.locator('.review-trail').filter({ hasText: 'Reviewed by' });
    await expect(trail).toBeVisible();
    expect(await laidOutLeftToRight(trail, '(teacher #129)')).toBe(true);
    // The suffix comes before the date on screen, as it does in the text.
    const order = await trail.evaluate((node) => {
      const t = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let suffix = Infinity;
      for (let n = t.nextNode(); n; n = t.nextNode()) {
        const at = (n.textContent ?? '').indexOf('(teacher #129)');
        if (at >= 0) { const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + 14); suffix = r.getBoundingClientRect().left; }
      }
      return { suffix, time: node.querySelector('time')!.getBoundingClientRect().left };
    });
    expect(order.suffix).toBeLessThan(order.time);
  });

  test('R12-C-09: namesakes that differ only by a zero-width space get an id tag', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({
      ...body,
      students: [...body.students, { ...body.students[0], id: 9201, name: 'Quin Voss' }, { ...body.students[0], id: 9202, name: 'Quin V\u200boss' }],
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Student detail' }).click();
    const picker = page.getByLabel('Student', { exact: true });
    await expect(picker.locator('option')).not.toHaveCount(0);
    const options = await picker.locator('option').allTextContents();
    expect(options.filter((t) => /#92(01|02)\)$/.test(t))).toHaveLength(2);
  });

  test('R12-C-03: after a keyboard Retry on a failed page load succeeds, focus lands on the page heading (Faculty)', async ({ page }) => {
    await page.route('**/api/classes', (route) => route.fulfill(serverError()));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    await page.unroute('**/api/classes');
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Where learners get stuck')).toBeVisible();
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  test('R12-C-03: the same on Student detail and Content review', async ({ page }) => {
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    for (const [nav, glob, ready] of [
      ['Student detail', /\/api\/classes\/\d+\/students\/\d+$/, page.locator('.profile-card')],
      ['Content review', '**/api/content/missions', page.locator('.content-row').first()],
    ] as const) {
      const down = await outage(page, glob);
      await page.getByRole('button', { name: nav }).click();
      const retry = page.getByRole('button', { name: 'Retry' });
      await expect(retry).toBeVisible();
      down.lift();
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect(ready).toBeVisible();
      await expect(page.locator('main h1').first()).toBeFocused();
    }
  });

  test('R12-C-03: the guest gate keeps keyboard focus after a failed Reopen, and the page heading after a successful one', async ({ page }) => {
    await page.evaluate((k) => sessionStorage.removeItem(k), TOKEN_KEY);
    let down = true;
    await page.route('**/api/auth/demo', (route) => (down ? route.fulfill(serverError()) : route.continue()));
    await page.reload();
    const reopen = page.getByRole('button', { name: 'Reopen the laboratory' });
    await expect(reopen).toBeVisible();
    await reopen.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reopen the laboratory' })).toBeFocused();
    down = false;
    await page.keyboard.press('Enter');
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.locator('main h1').first()).toBeFocused();
  });

  const emptyStatuses = [400, 408, 409, 413, 418, 422];
  for (const status of emptyStatuses) {
    test(`R12-B-02 / R12-C-04: an empty-bodied ${status} on a faculty page reads as a sentence`, async ({ page }) => {
      await page.route('**/api/classes', (route) => route.fulfill({ status, contentType: 'text/plain', body: '' }));
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      const alert = page.getByRole('alert').filter({ hasText: 'Faculty view unavailable' });
      await expect(alert).toBeVisible();
      await expect(alert).not.toContainText('Request failed');
    });
  }

  test('R12-C-04: an empty 413 on the content PUT reads as a sentence', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Content review' }).click();
    const row = page.locator('.content-row').filter({ hasText: 'Microbe Detective' });
    await page.route('**/api/content/missions/mic-01/status', (route) => route.fulfill({ status: 413, contentType: 'text/plain', body: '' }));
    await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Could not update the status' });
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText('Request failed');
  });

  test('R12-C-05: when the change was applied, its reply lost and the re-read fails, one alert shows and the retry settles it truthfully', async ({ page }) => {
    await prepareContentStatus('mic-01', 'draft');
    try {
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await page.getByRole('button', { name: 'Content review' }).click();
      const row = page.locator('.content-row').filter({ hasText: 'Microbe Detective' });
      await expect(row.locator('.status-pill')).toHaveText('Draft');
      await page.route('**/api/content/missions/mic-01/status', async (route) => { await route.fetch(); await route.fulfill({ status: 502, contentType: 'text/plain', body: '' }); });
      const down = await outage(page, '**/api/content/missions');
      await row.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'could not be refreshed' })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByRole('alert')).toContainText('Could not confirm the status change');
      await expect(page.getByRole('alert')).not.toContainText('Please retry');
      down.lift();
      await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click();
      await expect(row.locator('.status-pill')).toHaveText('Reviewed');
      await expect(page.getByRole('alert')).toHaveCount(1);
      await expect(page.getByRole('alert')).toContainText('The list below shows what the server recorded.');
      await expect(page.getByRole('alert')).not.toContainText('could not be refreshed');
      await expect(page.getByRole('alert')).not.toContainText('Please retry');
    } finally {
      await prepareContentStatus('mic-01', 'draft');
    }
  });

  test('R12-C-07: each attempt in the student history shows its date, and a capped list says so when the server reports the total', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, (body) => ({
      ...body,
      historyTotal: 27,
      history: [{ ...(body.history[0] ?? { missionId: 'hem-01', title: 'Blood Smear Code', labSlug: 'hematology', score: 100, accuracyPct: 100, answersSubmitted: 1, wrongAnswers: 0, hintsUsed: 0, elapsed: '01:00' }), completedAt: 1791453365153 }],
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Student detail' }).click();
    const row = page.locator('.teacher-panel').filter({ hasText: 'ATTEMPT HISTORY' }).locator('li.mission-row').first();
    await expect(row.locator('time')).toHaveAttribute('datetime', new Date(1791453365153).toISOString());
    await expect(page.getByText('Showing the latest 1 of 27 attempts.')).toBeVisible();
  });
});

test.describe('round 13: leaderboard, names, history figures', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  // On a phone the guest actions live in the Guest options popover; on wider screens they are in the sidebar.
  const openDetail = async (page: Page) => {
    await expect(homeHeading(page)).toBeVisible();
    const direct = page.getByRole('button', { name: 'Faculty guest', exact: true });
    if (!(await direct.isVisible())) await page.getByRole('button', { name: 'Guest options' }).click();
    await page.getByRole('button', { name: 'Faculty guest', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.getByRole('button', { name: 'Student detail', exact: true }).click();
  };
  const row = (rank: number) => ({ rank, name: `Stu D${rank}.`, xp: 500 - rank, labs: 1, accuracyPct: 80, you: false });
  const unranked = (extra: Record<string, unknown> = {}) => ({ rank: 24, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true, ...extra });
  const board = (page: Page, make: (b: any) => unknown) => page.route('**/api/leaderboard**', (route) => patched(route, make));
  const unrankedBoard = (b: any) => ({ ...b, cohortAvailable: true, total: 23, rows: Array.from({ length: 20 }, (_, i) => row(i + 1)), me: unranked() });

  for (const width of [320, 375, 1440]) {
    test(`R13-C-01: an unranked 0-XP viewer reads "not ranked yet", has no rank number and is not counted as ranked (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await board(page, unrankedBoard);
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      const panel = page.locator('.leaderboard-panel');
      const mine = panel.locator('.leaderboard-row.you');
      await expect(mine).toHaveCount(1);
      await expect(mine).toContainText('You: not ranked yet (0 XP)');
      await expect(panel.locator('.leaderboard-row')).toHaveCount(21);
      await expect(panel.locator('.leaderboard-gap')).toHaveCount(0);
      await expect(panel.getByText('Showing 20 of 23 ranked students.')).toBeVisible();
      expect(await panel.innerText()).not.toMatch(/#24|Showing 21 of/);
      const box = await mine.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }

  test('R13-C-01: a ranked viewer still gets a rank, a gap row and a count that includes them', async ({ page }) => {
    await board(page, (b) => ({ ...b, cohortAvailable: true, total: 23, rows: Array.from({ length: 20 }, (_, i) => row(i + 1)), me: unranked({ rank: 22, xp: 40 }) }));
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    const panel = page.locator('.leaderboard-panel');
    await expect(panel.locator('.leaderboard-row.you')).toContainText('#22');
    await expect(panel.locator('.leaderboard-gap')).toHaveCount(1);
    await expect(panel.getByText('Showing 21 of 23 ranked students.')).toBeVisible();
  });

  test('R13-C-02: a group that exists where nobody has XP yet is not told it is "not set up"', async ({ page }) => {
    await board(page, (b) => ({ ...b, cohortAvailable: true, total: 0, rows: [], me: unranked({ rank: 1 }) }));
    await page.getByRole('button', { name: 'Progress', exact: true }).click();
    const panel = page.locator('.leaderboard-panel');
    await expect(panel.getByText('Nobody in your group has earned XP yet.')).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Nobody is ranked yet' })).toBeVisible();
    expect(await panel.innerText()).not.toMatch(/set up|not available|#1\b/);
    await expect(panel.locator('.leaderboard-row')).toHaveCount(0);
  });

  test('R13-C-03: namesakes that differ only by a Hangul filler or a Braille blank get id tags', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({
      ...body,
      students: [...body.students,
        { ...body.students[0], id: 9301, name: 'Alex Martin' }, { ...body.students[0], id: 9302, name: 'Alex Martin\u3164' },
        { ...body.students[0], id: 9303, name: 'Mia Roe' }, { ...body.students[0], id: 9304, name: 'Mia Roe\u2800' }],
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await page.getByRole('button', { name: 'Student detail' }).click();
    const picker = page.getByLabel('Student', { exact: true });
    await expect(picker.locator('option')).not.toHaveCount(0);
    const options = await picker.locator('option').allTextContents();
    expect(options.filter((t) => /#93(01|02|03|04)\)$/.test(t))).toHaveLength(4);
  });

  for (const lead of ['\u200f', '\u200b', '\u00ad', '\u2800', '\u3164']) {
    test(`R13-C-05: a name that starts with U+${lead.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')} still gets a visible initial`, async ({ page }) => {
      await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, (body) => ({ ...body, student: { ...body.student, name: `${lead}\u0645\u0631\u064a\u0645` } })));
      await openDetail(page);
      await expect(page.locator('.avatar.big')).toHaveText('\u0645');
    });
  }

  test('R13-C-06: the picker option, the heading and the roster spell a stored override name the same way', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({ ...body, students: [{ ...body.students[0], name: 'Eve \u202enathan' }, ...body.students.slice(1)] })));
    await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, (body) => ({ ...body, student: { ...body.student, name: 'Eve \u202enathan' } })));
    await openDetail(page);
    const heading = page.locator('.profile-card h2 bdi');
    await expect(heading).toBeVisible();
    // The visible order is what the reader gets: neither surface reverses the name.
    expect(await heading.evaluate((el) => el.textContent)).toBe('Eve nathan');
    const options = await page.getByLabel('Student', { exact: true }).locator('option').allTextContents();
    expect(options.some((t) => t.includes('Eve nathan'))).toBe(true);
    expect(options.join('|')).not.toContain('\u202e');
  });

  test.describe('student detail history figures', () => {
    const detail = (page: Page, patch: (b: any) => unknown) => page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, patch));
    const open = openDetail;
    for (const bad of [27.5, 1e21, -3]) {
      test(`R13-C-08: historyTotal ${bad} raises the unexpected-response alert, not a figure`, async ({ page }) => {
        await detail(page, (b) => ({ ...b, historyTotal: bad }));
        await open(page);
        await expect(page.getByRole('alert')).toContainText('unexpected response');
        await expect(page.getByText(/attempts\./)).toHaveCount(0);
      });
    }
    test('R13-C-08: a null historyTotal means no note and the page still renders; a total below the listed rows is rejected', async ({ page }) => {
      await detail(page, (b) => ({ ...b, historyTotal: null }));
      await open(page);
      await expect(page.locator('.profile-card h2')).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText(/Showing the latest/)).toHaveCount(0);
      await page.unroute(/\/api\/classes\/\d+\/students\/\d+$/);
      await detail(page, (b) => ({ ...b, historyTotal: Math.max(0, b.history.length - 1) }));
      await page.getByLabel('Student', { exact: true }).selectOption({ index: 1 });
      await expect(page.getByRole('alert')).toContainText('unexpected response');
    });
    test('R13-C-08: level 0 raises the unexpected-response alert', async ({ page }) => {
      await detail(page, (b) => ({ ...b, student: { ...b.student, level: 0 } }));
      await open(page);
      await expect(page.getByRole('alert')).toContainText('unexpected response');
    });
    for (const width of [320, 375]) {
      test(`R13-C-08: the capped-history note wraps inside the panel at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await detail(page, (b) => ({ ...b, historyTotal: 123456 }));
        await open(page);
        const note = page.getByText(/Showing the latest \d+ of 123,?456 attempts\./);
        await expect(note).toBeVisible();
        const box = (await note.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      });
    }
  });
});

test.describe('round 14 frontend fixes', () => {
  test('R14-B-01: sidebar navigation and guest actions reach 44px on a rotated touch phone (landscape widths)', async ({ browser }) => {
    const token = await freshStudent();
    for (const [width, height] of [[812, 375], [844, 390], [740, 360], [667, 375]] as const) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, baseURL: 'http://127.0.0.1:5173' });
      try {
        const page = await context.newPage();
        await openAs(page, token);
        const nav = page.locator('.app > aside nav button');
        expect(await nav.count()).toBeGreaterThanOrEqual(4);
        for (const button of await nav.all()) {
          const box = (await button.boundingBox())!;
          expect(box.height, `${(await button.innerText()).trim()} at ${width}x${height}`).toBeGreaterThanOrEqual(44);
        }
        // Guest actions that are visible in this layout are tap targets too.
        for (const button of await page.locator('.app > aside .logout').all()) {
          if (!(await button.isVisible())) continue;
          const box = (await button.boundingBox())!;
          expect(box.height, `${(await button.innerText()).trim()} at ${width}x${height}`).toBeGreaterThanOrEqual(44);
        }
      } finally {
        await context.close();
      }
    }
  });

  test('R14-B-01: no button, select or input on the main student screens is under 44px high on a rotated touch phone', async ({ browser }) => {
    const token = await freshStudent();
    const context = await browser.newContext({ viewport: { width: 812, height: 375 }, hasTouch: true, isMobile: true, baseURL: 'http://127.0.0.1:5173' });
    try {
      const page = await context.newPage();
      await openAs(page, token);
      const small: string[] = [];
      const scan = async (where: string) => {
        const found = await page.evaluate(() => [...document.querySelectorAll('button, select, input:not([type="checkbox"]):not([type="radio"])')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('.text-button.inline') && !el.classList.contains('inline'); })
          .map((el) => ({ t: ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
          .filter((x) => x.h < 44));
        for (const f of found) small.push(`${where}: ${f.t} ${f.h}px`);
      };
      await scan('home');
      for (const name of ['Lab map', 'Progress', 'Lab results', 'Learning settings']) {
        await page.getByRole('button', { name, exact: true }).click();
        await page.waitForTimeout(300);
        await scan(name);
      }
      expect(small).toEqual([]);
    } finally {
      await context.close();
    }
  });

  for (const width of [280, 300, 320, 375]) {
    test(`R14-B-02: the Lab map does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await openAs(page, await freshStudent());
      await page.getByRole('button', { name: 'Lab map' }).click();
      await expect(page.getByRole('heading', { name: 'Laboratory map', exact: true })).toBeVisible();
      await expect(page.locator('article.lab-card').first()).toBeVisible();
      const metrics = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
      for (const card of await page.locator('article.lab-card').all()) {
        const box = (await card.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    });
  }

  test.describe('names and counts as the server sent them', () => {
    test.beforeEach(async ({ page }) => { await resetDemo(page); });
    test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

    test('R14-C-02: a classmate stored with a bidi override reads in order on the leaderboard, like on every other surface', async ({ page }) => {
      await page.route('**/api/leaderboard**', (route) => patched(route, (b) => ({
        ...b,
        rows: b.rows.map((r: any, i: number) => (i === 1 ? { ...r, name: '\u202eEve Kay', you: false } : { ...r, you: false })),
        me: { rank: b.total + 1, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true },
      })));
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      const names = page.locator('.leaderboard-row:not(.you) bdi');
      await expect(names.nth(1)).toBeVisible();
      expect(await names.nth(1).evaluate((el) => el.textContent)).toBe('Eve Kay');
      expect(await page.locator('.leaderboard-panel').evaluate((el) => el.textContent)).not.toContain('\u202e');
    });

    test('R14-C-02: a reviewer stored with a bidi override reads in order and keeps the (teacher #id) suffix', async ({ page }) => {
      await page.route('**/api/content/missions', (route) => patched(route, (body) => ({
        ...body,
        missions: body.missions.map((m: any, i: number) => (i === 0 ? { ...m, status: 'reviewed', reviewedBy: 'Dr \u202eEve Nathan (teacher #176)', updatedAt: 1791453365153 } : m)),
      })));
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await page.getByRole('button', { name: 'Content review' }).click();
      const trail = page.locator('.review-trail').filter({ hasText: 'Reviewed by' });
      await expect(trail).toBeVisible();
      expect(await trail.evaluate((el) => el.textContent)).toContain('Reviewed by Dr Eve Nathan (teacher #176)');
      expect(await trail.evaluate((el) => el.textContent)).not.toContain('\u202e');
    });

    test('R14-B-05: a leaderboard whose figures contradict each other is an unexpected-response alert, not a plausible board', async ({ page }) => {
      await page.route('**/api/leaderboard**', (route) => patched(route, (b) => ({ ...b, total: 0 })));
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'unexpected response' })).toBeVisible();
      await expect(page.getByText('Nobody is ranked yet')).toHaveCount(0);
      await expect(page.locator('.leaderboard-row')).toHaveCount(0);
    });

    test('R14-C-07: one ranked student reads as singular', async ({ page }) => {
      await page.route('**/api/leaderboard**', (route) => patched(route, (b) => ({ ...b, total: 1, rows: [{ ...b.rows[0], rank: 1, you: false }], me: { rank: 2, name: 'Me', xp: 0, labs: 0, accuracyPct: null, you: true } })));
      await page.getByRole('button', { name: 'Progress', exact: true }).click();
      await expect(page.getByText('Showing 1 of 1 ranked student.', { exact: true })).toBeVisible();
    });

    test('R14-C-06: a student detail whose missions disagree with its labs is an unexpected-response alert', async ({ page }) => {
      await page.route(/\/api\/classes\/\d+\/students\/\d+$/, (route) => patched(route, (b) => ({ ...b, student: { ...b.student, missionsCompleted: b.student.missionsCompleted + 3 } })));
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
      await page.getByRole('button', { name: 'Student detail', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'unexpected response' })).toBeVisible();
    });

    test('R14-C-03: Devanagari names that differ by one vowel sign get no id tag in the roster', async ({ page }) => {
      await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({
        ...body,
        students: [...body.students, { ...body.students[0], id: 9401, name: '\u0938\u0940\u0924\u093e' }, { ...body.students[0], id: 9402, name: '\u0938\u0924\u093e' }],
      })));
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
      await page.getByRole('button', { name: 'Student detail', exact: true }).click();
      const picker = page.getByLabel('Student', { exact: true });
      await expect(picker.locator('option')).not.toHaveCount(0);
      const options = await picker.locator('option').allTextContents();
      const mine = options.filter((t) => t.includes('\u0938'));
      expect(mine).toHaveLength(2);
      expect(mine.join('|')).not.toMatch(/#940/);
    });
  });
});

test.describe('round 15 frontend fixes', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test('R15-B-01: a wait of 7199 seconds reads 2 hours, not 120 minutes', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => (route.request().postDataJSON()?.role === 'teacher'
      ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many attempts.', details: { retryAfterSeconds: 7199 } } }) })
      : route.continue()));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Too many attempts.' });
    await expect(alert).toContainText('Try again in 2 hours.');
    await expect(alert).not.toContainText('120 minutes');
  });

  test('R15-B-02: Cyrillic names that differ by a breve (Andrey / Andrei) get no id tag in the roster, Latin accent twins still do', async ({ page }) => {
    await page.route(/\/api\/classes\/\d+\/students$/, (route) => patched(route, (body) => ({
      ...body,
      students: [...body.students,
        { ...body.students[0], id: 9501, name: '\u0410\u043d\u0434\u0440\u0435\u0439' }, { ...body.students[0], id: 9502, name: '\u0410\u043d\u0434\u0440\u0435\u0438' },
        { ...body.students[0], id: 9503, name: '\u00c1lex Kay' }, { ...body.students[0], id: 9504, name: 'Alex Kay' }],
    })));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.getByRole('button', { name: 'Student detail', exact: true }).click();
    const picker = page.getByLabel('Student', { exact: true });
    await expect(picker.locator('option')).not.toHaveCount(0);
    const options = await picker.locator('option').allTextContents();
    expect(options.filter((t) => t.includes('\u0410\u043d\u0434\u0440\u0435')).join('|')).not.toMatch(/#950/);
    expect(options.filter((t) => /#95(03|04)\)$/.test(t))).toHaveLength(2);
  });
});


test.describe('round 16: strict replies of the guest actions', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  const replies: Array<[string, { status: number; contentType?: string; body: string }]> = [
    ['an empty body', { status: 200, body: '' }],
    ['null', { status: 200, contentType: 'application/json', body: 'null' }],
    ['an empty object', { status: 200, contentType: 'application/json', body: '{}' }],
    ['a string', { status: 200, contentType: 'application/json', body: '"done"' }],
    ['reset as a string', { status: 200, contentType: 'application/json', body: '{"reset":"true","profile":{}}' }],
  ];
  for (const [label, reply] of replies) {
    test(`R16-B-02: POST /demo/reset answered with ${label} raises the invalid-payload alert and keeps the session usable`, async ({ page }) => {
      await page.route('**/api/demo/reset', (route) => route.fulfill(reply));
      await page.getByRole('button', { name: 'Reset guest session' }).click();
      await page.getByRole('button', { name: 'Confirm reset' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'The server sent an unexpected response.' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Invalid server demo reset payload');
      // The session is untouched: still signed in as the same guest, and navigation works.
      await page.getByRole('button', { name: 'Lab map', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Laboratory map' })).toBeVisible();
    });
  }

  test('R16-B-03: a demo login reply without the demo marker reads like every other unexpected response', async ({ page }) => {
    await page.route('**/api/auth/demo', (route) => (route.request().postDataJSON()?.role === 'teacher'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"token":"t","user":{}}' })
      : route.continue()));
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The server sent an unexpected response.' })).toContainText('Invalid server demo login payload');
  });
});

// Round 17: scrolling over the sticky sidebar, the breakpoint crossing of the phone menu, the mission header offset, the faculty demonstration-data note.
test.describe('round 17: sticky sidebar scrolling', () => {
  const openAboutPage = async (page: Page) => {
    await resetDemo(page);
    await page.getByRole('button', { name: 'About & demo guide', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'About Escape Lab' })).toBeVisible();
  };
  const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

  test('R17-B-01: the wheel over the sidebar scrolls the page (1440x900), on a nav button, blank space and the reset button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAboutPage(page);
    for (const [label, x, y] of [['nav button', 100, 200], ['blank space', 100, 600], ['bottom of the sidebar', 100, 850]] as const) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 500);
      await expect.poll(() => scrollY(page), { message: `wheel over ${label}` }).toBeGreaterThan(200);
    }
  });

  test('R17-B-01: PageDown with focus in the sidebar scrolls the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAboutPage(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Lab map', exact: true }).focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => scrollY(page)).toBeGreaterThan(200);
  });

  test.describe('touch', () => {
    test.use({ hasTouch: true });
    test('R17-B-01: a touch swipe on the sidebar scrolls the page (768x1024)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await openAboutPage(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.synthesizeScrollGesture', { x: 60, y: 700, yDistance: -300, gestureSourceType: 'touch', speed: 800 });
      await expect.poll(() => scrollY(page)).toBeGreaterThan(100);
    });
  });

  test('R17-B-01: a sidebar that overflows (landscape phone) scrolls itself first, then the page follows', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await openAboutPage(page);
    const overflow = await page.evaluate(() => { const a = document.querySelector('.app > aside')!; return a.scrollHeight - a.clientHeight; });
    expect(overflow, 'the sidebar must overflow at 667x375 for this test to mean anything').toBeGreaterThan(20);
    await page.mouse.move(60, 200);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.evaluate(() => document.querySelector('.app > aside')!.scrollTop)).toBeGreaterThan(0);
    expect(await scrollY(page), 'the page waits while the sidebar still has room').toBe(0);
    // Keep wheeling: once the sidebar reaches its end the page scrolls.
    await expect.poll(async () => { await page.mouse.wheel(0, 300); return scrollY(page); }, { timeout: 8000, intervals: [400] }).toBeGreaterThan(50);
  });
});

test.describe('round 17: phone menu across the 600/601 boundary', () => {
  const resets = (page: Page) => {
    const seen: string[] = [];
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/demo/reset')) seen.push(request.url()); });
    return seen;
  };
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 375, height: 812 }); await resetDemo(page); });

  test('R17-B-02: a reset question opened in Guest options is closed cleanly when the window grows past 600 px; the next Confirm click (250 ms press) works', async ({ page }) => {
    const seen = resets(page);
    await page.getByRole('button', { name: /Guest options/ }).click();
    await page.getByRole('button', { name: 'Reset guest session' }).click();
    await expect(page.getByRole('button', { name: 'Confirm reset' })).toBeVisible();
    await page.setViewportSize({ width: 601, height: 700 });
    const aside = page.locator('.app > aside');
    // Nothing half-open is left behind: the sidebar offers the normal button, not an orphaned question.
    await expect(aside.getByRole('button', { name: 'Reset guest session' })).toBeVisible();
    await expect(aside.getByRole('button', { name: 'Confirm reset' })).toHaveCount(0);
    await aside.getByRole('button', { name: 'Reset guest session' }).click();
    await aside.getByRole('button', { name: 'Confirm reset' }).click({ delay: 250 });
    await expect.poll(() => seen.length).toBe(1);
    await expect(homeHeading(page)).toBeVisible();
  });

  test('R17-B-02: a reset question already in the sidebar survives nothing it should not: a human-speed Confirm click right after the resize is never swallowed', async ({ page }) => {
    const seen = resets(page);
    await page.getByRole('button', { name: /Guest options/ }).click();
    await page.getByRole('button', { name: 'Reset guest session' }).click();
    await page.setViewportSize({ width: 700, height: 700 });
    const confirm = page.locator('.app > aside').getByRole('button', { name: 'Confirm reset' });
    // Crossing 600 px closes the pending question cleanly (the media-query listener runs after the resize): wait for that settled
    // state instead of reading the button early and clicking it while it is being removed. Nothing is reset by accident.
    await expect(confirm).toHaveCount(0);
    expect(seen.length).toBe(0);
    const again = page.locator('.app > aside').getByRole('button', { name: 'Reset guest session' });
    await expect(again).toBeVisible();
    // The next human-speed press on Reset then Confirm works exactly once.
    await again.click();
    await page.locator('.app > aside').getByRole('button', { name: 'Confirm reset' }).click({ delay: 250 });
    await expect.poll(() => seen.length).toBe(1);
  });

  test('R17-B-03: a reset question pending in the sidebar does not reappear in Guest options after shrinking below 601 px', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.locator('.app > aside').getByRole('button', { name: 'Reset guest session' }).click();
    await expect(page.locator('.app > aside').getByRole('button', { name: 'Confirm reset' })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: /Guest options/ }).click();
    const popover = page.getByRole('group', { name: 'Guest options' });
    await expect(popover.getByRole('button', { name: 'Reset guest session' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Confirm reset' })).toHaveCount(0);
  });

  test('R17-B-02: an open Guest options menu is closed (not hidden-but-open) when the window crosses 600 to 601 and back', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 700 });
    const trigger = page.getByRole('button', { name: /Guest options/ });
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.setViewportSize({ width: 601, height: 700 });
    await page.setViewportSize({ width: 600, height: 700 });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('group', { name: 'Guest options' })).toHaveCount(0);
  });
});

test.describe('round 17: the mission header never hides a focused control', () => {
  for (const [width, height] of [[320, 700], [375, 812], [600, 800], [601, 800], [768, 1024], [1440, 900]] as const) {
    test(`R17-B-04: scroll padding clears the sticky header with 8 px to spare, and Shift+Tab stays clear of it (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await resetDemo(page);
      await startMissionViaUi(page, 'Hematology Lab', 'Fix the Sample');
      const m = await page.evaluate(() => {
        const header = document.querySelector('.player > header')!;
        return { sticky: getComputedStyle(header).position === 'sticky', bottom: header.getBoundingClientRect().bottom, padding: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0 };
      });
      expect(m.sticky).toBe(true);
      expect(m.padding, `scroll-padding-top ${m.padding} vs header bottom ${m.bottom}`).toBeGreaterThanOrEqual(m.bottom + 8);
      await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, document.documentElement.scrollHeight); });
      const tops: number[] = [];
      for (let i = 0; i < 16; i += 1) {
        await page.keyboard.press('Shift+Tab');
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          const header = document.querySelector('.player > header')!;
          if (!el || el === document.body || header.contains(el)) return null;
          const b = el.getBoundingClientRect();
          return { top: b.top, hdr: header.getBoundingClientRect().bottom, h: b.height, ih: innerHeight };
        });
        if (r && r.h < r.ih / 2) tops.push(Math.round(r.top - r.hdr));
      }
      expect(tops.length).toBeGreaterThan(2);
      expect(Math.min(...tops), `gaps between header and focused control: ${tops.join(',')}`).toBeGreaterThanOrEqual(4);
    });
  }
});

test.describe('round 17: faculty views state that the data is generated demonstration data', () => {
  const NOTE = 'Demonstration data: the students, classes and results';
  const note = (page: Page) => page.getByRole('note').filter({ hasText: NOTE });
  const check = async (page: Page, label: string) => {
    await expect(note(page), label).toHaveCount(1);
    await expect(note(page), label).toBeVisible();
    await expect(note(page)).toContainText('generated for this prototype');
    await expect(note(page)).toContainText('They are not real learners.');
    // Calm and static: not an alert, not a live region.
    expect(await note(page).evaluate((el) => !el.closest('[role="alert"], [aria-live]'))).toBe(true);
  };
  const FACULTY_PAGES = [['Faculty', 'Class intelligence'], ['Student detail', 'Student detail'], ['Content review', 'Content review']] as const;

  test('R17-D-01: present on Class intelligence, Student detail and Content review; survives reload and a class switch; absent from the student views', async ({ page }) => {
    await resetDemo(page);
    for (const name of ['Lab map', 'Progress', 'Lab results', 'Learning settings']) {
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('note').filter({ hasText: NOTE }), `student view ${name}`).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    for (const [nav, heading] of FACULTY_PAGES) {
      await page.getByRole('button', { name: nav, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await check(page, nav);
      // A reload returns the Faculty guest to its first screen (the view is not stored): the note is there, and on the view reopened after it.
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
      await check(page, 'first screen after reload');
      await page.getByRole('button', { name: nav, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await check(page, `${nav} reopened after reload`);
    }
    await page.getByRole('button', { name: 'Faculty', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
    const picker = page.getByLabel('Class', { exact: true });
    await expect(picker).toBeVisible();
    const options = await picker.locator('option').all();
    expect(options.length).toBeGreaterThan(1);
    await picker.selectOption({ index: 1 });
    await check(page, 'after a class switch');
    await page.getByRole('button', { name: 'Student detail', exact: true }).click();
    await picker.selectOption({ index: 0 });
    await check(page, 'student detail after a class switch');
    // About is shared and stays free of the faculty note; step 7 carries the statement in words.
    await page.getByRole('button', { name: 'About & demo guide', exact: true }).click();
    await expect(page.getByRole('note').filter({ hasText: NOTE })).toHaveCount(0);
    await expect(page.locator('.about-steps > li').nth(6)).toContainText('generated demonstration data, not real learners');
  });

  test('R17-D-01: the note is shown while the class data fails to load', async ({ page }) => {
    await resetDemo(page);
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    // The switch is asynchronous: wait until the Faculty view is really there before breaking its data and reloading.
    await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
    await page.route('**/api/classes/*/analytics', (route) => route.fulfill(serverError()));
    await page.reload();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await check(page, 'faculty error state');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  for (const [width, height] of [[320, 700], [375, 812], [768, 1024], [1440, 900]] as const) {
    test(`R17-D-01: readable, no horizontal scroll, axe clean on the faculty views (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await resetDemo(page);
      if (width <= 600) await page.getByRole('button', { name: /Guest options/ }).click();
      await page.getByRole('button', { name: 'Faculty guest' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
      for (const [nav, heading] of FACULTY_PAGES) {
        await page.getByRole('button', { name: nav, exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await check(page, `${nav} ${width}`);
        const size = await note(page).evaluate((el) => ({ font: parseFloat(getComputedStyle(el).fontSize), overflow: el.scrollWidth - el.clientWidth }));
        expect(size.font).toBeGreaterThanOrEqual(12);
        expect(size.overflow).toBeLessThanOrEqual(0);
        const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(m.scroll).toBeLessThanOrEqual(m.client);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`)), `${nav} ${width}`).toEqual([]);
      }
    });
  }
});
