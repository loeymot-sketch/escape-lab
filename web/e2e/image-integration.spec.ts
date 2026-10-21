import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { navigateSection, chooseCorrectOption, completeLabViaApi, completeMissionViaApi, continueStep, resetDemo, startMissionViaUi, submit } from './support/helpers';

const componentSnapshotStyle = fileURLToPath(new URL('./support/component-snapshots.css', import.meta.url));

const noOverflow = async (page: Page) => {
  const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(size.content).toBeLessThanOrEqual(size.viewport);
};

const headerIsReadable = async (page: Page) => {
  const defects = await page.locator('.player>header').evaluate((header) => {
    const controls = [...header.children].map((el) => ({ name: el.className, box: el.getBoundingClientRect() }));
    const problems: string[] = [];
    for (const [index, current] of controls.entries()) {
      if (current.box.left < 0 || current.box.right > innerWidth + 1) problems.push(`${current.name} leaves the viewport`);
      for (const other of controls.slice(index + 1)) {
        if (current.box.left < other.box.right - 1 && other.box.left < current.box.right - 1 && current.box.top < other.box.bottom - 1 && other.box.top < current.box.bottom - 1) problems.push(`${current.name} overlaps ${other.name}`);
      }
    }
    return problems;
  });
  expect(defects).toEqual([]);
};

for (const [width, height] of [[320, 568], [375, 812], [390, 844], [568, 320], [667, 375], [768, 1024], [844, 390], [1280, 900]] as const) {
  test.describe(`observation images at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, deviceScaleFactor: width <= 430 ? 3 : 1, hasTouch: width <= 844 });
    test.beforeEach(async ({ page }) => { await resetDemo(page); });

    if (height >= 500) test('laboratories are visible first; compact statistics and the demo note follow them', async ({ page }) => {
      await noOverflow(page);
      const firstScene = (await page.locator('.lab-strip .lab-card-scene').first().boundingBox())!;
      const firstName = (await page.locator('.lab-strip h2').first().boundingBox())!;
      expect(firstScene.y).toBeLessThan(height - 90);
      expect(firstName.y).toBeLessThan(height);
      const lastLab = (await page.locator('.lab-strip .lab-card').last().boundingBox())!;
      const stats = (await page.locator('.dashboard-stats').boundingBox())!;
      const guide = (await page.locator('.how-it-works').boundingBox())!;
      const demo = (await page.locator('.demo-note').boundingBox())!;
      expect(stats.y).toBeGreaterThanOrEqual(lastLab.y + lastLab.height);
      expect(stats.height).toBeLessThan(150);
      expect(demo.y).toBeGreaterThanOrEqual(guide.y + guide.height);
      // Old discipline-specific cream-theme colours must not defeat the navy game's button colours.
      const buttons = await page.locator('.lab-strip .lab-card-foot button').evaluateAll((nodes) => nodes.map((node) => {
        const css = getComputedStyle(node);
        const rgb = css.color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (channels: number[]) => channels.map((value) => { const x = value / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
        const dark = luminance([9, 36, 58]);
        const light = luminance(rgb);
        return { contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05), decoration: css.textDecorationLine };
      }));
      expect(buttons).toHaveLength(3);
      for (const button of buttons) { expect(button.contrast).toBeGreaterThanOrEqual(4.5); expect(button.decoration).toBe('none'); }
      const micro = page.locator('.lab-strip .lab-card.teal');
      await micro.scrollIntoViewIfNeeded();
      await expect.poll(() => micro.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await page.mouse.move(0, 0); // Stable resting card: previous scrolls must not retain the hover zoom.
      await expect(micro).toHaveScreenshot(`microbiology-card-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
    });

    test('all four photos retain their pixels and can be inspected without changing an association', async ({ page }, testInfo) => {
      await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
      const missionHero = page.locator('.mission-hero > img');
      await expect(missionHero).toHaveAttribute('src', /mission-microbiology-petri/);
      await expect.poll(() => missionHero.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await expect(missionHero).toHaveAttribute('alt', '');
      expect(await missionHero.evaluate((el) => [el.naturalWidth, el.naturalHeight])).toEqual([1400, 934]);
      const assistant = page.locator('.assistant-inline, .case-aside > .aside-card:first-child').first();
      await expect(assistant).toBeVisible();
      const assistantDecoration = await assistant.evaluate((node) => getComputedStyle(node, '::before').backgroundImage);
      expect(assistantDecoration).toContain('lab-assistant-robot');
      const images = page.locator('.culture-thumb img');
      await expect(images).toHaveCount(4);
      for (const image of await images.all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
        const metrics = await image.evaluate((el) => {
          const img = el as HTMLImageElement;
          const box = img.getBoundingClientRect();
          return { width: box.width, height: box.height, natural: [img.naturalWidth, img.naturalHeight], fit: getComputedStyle(img).objectFit, source: img.currentSrc, alt: img.alt };
        });
        expect(metrics.natural).toEqual([720, 720]);
        expect(Math.abs(metrics.width - metrics.height)).toBeLessThan(0.5);
        expect(metrics.width).toBeGreaterThanOrEqual(128);
        expect(metrics.fit).toBe('contain');
        expect(`${metrics.source} ${metrics.alt}`).not.toMatch(/escherichia|staphylococcus|streptococcus|proteus|pseudomonas/i);
      }
      await noOverflow(page);
      const collisions = await page.locator('.match-row').evaluateAll((rows) => rows.flatMap((row) => {
        const observation = row.querySelector('.match-evidence')!.getBoundingClientRect();
        const select = row.querySelector('select')!.getBoundingClientRect();
        const overlaps = observation.left < select.right - 1 && select.left < observation.right - 1 && observation.top < select.bottom - 1 && select.top < observation.bottom - 1;
        return overlaps ? ['observation overlaps association control'] : [];
      }));
      expect(collisions).toEqual([]);
      await page.locator('select').first().selectOption('ecoli');
      // Isolate the observation component: Playwright scrolls a tall target under the sticky header.
      // Header bounds and overlaps are independently asserted below and remain visible in full-page proofs.
      await expect(page.locator('.matching-list')).toHaveScreenshot(`matching-${width}x${height}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });

      const matchingShot = testInfo.outputPath(`matching-${width}.png`);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: matchingShot, fullPage: true, animations: 'disabled' });
      await testInfo.attach('Matching layout', { path: matchingShot, contentType: 'image/png' });

      for (const language of ['en', 'fr'] as const) {
        if (language === 'fr') {
          await page.getByRole('button', { name: 'Français' }).click();
          await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
        }
        const opener = page.getByRole('button', { name: language === 'fr' ? /^Examiner l’image/ : /^Inspect image:/ }).first();
        await headerIsReadable(page);
        const originalOverflow = await page.evaluate(() => document.body.style.overflow);
        if (language === 'en') {
          if (width <= 844) await opener.tap(); else await opener.click();
        } else {
          await opener.focus();
          await page.keyboard.press('Enter');
        }
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
        await headerIsReadable(page);
        await expect(dialog.getByRole('heading')).toContainText(language === 'fr' ? 'Colonies roses' : 'Pink colonies');
        const photo = dialog.locator('.culture-viewer-photo');
        await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
        const frame = (await dialog.boundingBox())!;
        const image = (await photo.boundingBox())!;
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(width + 1);
        expect(frame.y + frame.height).toBeLessThanOrEqual(height + 1);
        expect(Math.abs(image.width - image.height)).toBeLessThan(0.5);
        expect(image.width).toBeGreaterThan(200);
        expect(image.x).toBeGreaterThanOrEqual(frame.x);
        expect(image.x + image.width).toBeLessThanOrEqual(frame.x + frame.width);
        expect(image.y).toBeGreaterThanOrEqual(frame.y);
        expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height);
        expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Shift+Tab');
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await page.locator('select').first().evaluate((el) => (el as HTMLSelectElement).focus());
        expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        await noOverflow(page);
        if (language === 'fr') {
          await expect(dialog).toHaveScreenshot(`inspection-${width}x${height}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
          const shot = testInfo.outputPath(`inspection-${width}.png`);
          await page.screenshot({ path: shot, animations: 'disabled' });
          await testInfo.attach('Image inspection in French', { path: shot, contentType: 'image/png' });
          expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
        }
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
        await expect(opener).toBeFocused();
        await expect(page.locator('.culture-zoom[data-inspected="true"]').first()).toBeVisible();
        await expect(page.locator('select').first()).toHaveValue('ecoli');
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
      }
    });
  });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]] as const) {
  test.describe(`dedicated Master environment at ${width}px`, () => {
    test.use({ viewport: { width, height } });

    test('the violet door stays sharp and distinct from the vault in locked and playable states', async ({ page }) => {
      const token = await resetDemo(page);
      const master = page.locator('.lab-strip .lab-card.violet');
      const image = master.locator('.lab-card-scene img');
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      const metrics = await image.evaluate((el) => {
        const img = el as HTMLImageElement;
        return { natural: [img.naturalWidth, img.naturalHeight], source: img.currentSrc, fit: getComputedStyle(img).objectFit, position: getComputedStyle(img).objectPosition };
      });
      expect(metrics.natural).toEqual([1400, 934]);
      expect(metrics.source).toContain('lab-master');
      expect(metrics.source).not.toContain('lab-master-open');
      expect(metrics.source).not.toContain('progression-vault');
      expect(metrics.fit).toBe('cover');
      expect(metrics.position).toBe('50% 40%');
      await expect(master).toHaveClass(/locked/);
      await expect(master.getByRole('button')).toHaveCount(0);
      await page.getByRole('button', { name: 'Français' }).click();
      await expect(master.getByRole('heading')).toHaveText('Master');
      await expect(master.getByRole('heading')).toHaveCSS('color', 'rgb(246, 251, 255)');
      await noOverflow(page);
      await page.mouse.move(0, 0);
      await expect(master).toHaveScreenshot(`master-locked-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });

      // Unlock via real server records, not a forged UI state. Exit codes are deliberately not entered.
      for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug, false);
      await page.reload();
      await expect(master).not.toHaveClass(/locked/);
      await expect(master.getByRole('button')).toBeEnabled();
      await expect(master.getByRole('button')).toHaveCSS('color', 'rgb(224, 194, 255)');
      await expect(master.getByRole('button')).toHaveCSS('text-decoration-line', 'none');
      await expect(image).toHaveAttribute('src', /lab-master-open/);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBe(1400);
      await noOverflow(page);
      await page.mouse.move(0, 0);
      await expect(master).toHaveScreenshot(`master-open-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
      await page.getByRole('button', { name: 'English' }).click();
      await navigateSection(page, 'Lab map');
      const mapMaster = page.locator('.map-grid .lab-card.violet');
      await expect(mapMaster.locator('img')).toHaveAttribute('src', /lab-master-open/);
      await mapMaster.scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.mouse.move(0, 0);
      await expect(mapMaster.locator('.lab-card-scene')).toHaveScreenshot(`master-map-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
      await startMissionViaUi(page, 'Master Lab', 'Clinical Detective');
      for (const [stepIndex, asset] of ['8.webp', '9.webp', '10.webp', '11.webp'].entries()) {
        if (stepIndex > 0) {
          await chooseCorrectOption(page, 'master-01', stepIndex - 1);
          await submit(page).click();
          await continueStep(page);
        }
        const hero = page.locator('.mission-hero > img');
        await expect(hero).toHaveAttribute('src', new RegExp(`${asset.replace('.', '\\.')}$`));
        await expect.poll(() => hero.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1400);
        await expect.poll(() => hero.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(934);
        await noOverflow(page);
        await headerIsReadable(page);
      }
      await expect(page.locator('.mission-hero')).toHaveScreenshot(`master-hero-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
    });
  });
}

test.describe('observation recovery and association guidance', () => {
  test.beforeEach(async ({ page }) => { await resetDemo(page); });

  test('a failed photo keeps its description and association; Retry restores the image', async ({ page }) => {
    let unavailable = true;
    await page.route('**/culture-observation-01.webp*', (route) => unavailable ? route.fulfill({ status: 503, body: '' }) : route.continue());
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const row = page.locator('.match-row').first();
    await expect(row.getByRole('button', { name: /^Retry image for/ })).toBeVisible();
    await expect(row.locator('label')).toContainText('Pink colonies');
    await row.locator('select').selectOption('ecoli');
    unavailable = false;
    await row.getByRole('button', { name: /^Retry image for/ }).click();
    await expect.poll(() => row.locator('.culture-thumb img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(row.locator('select')).toHaveValue('ecoli');
    await row.getByRole('button', { name: /^Inspect image:/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(row.locator('select')).toHaveValue('ecoli');
    const opener = row.getByRole('button', { name: /^Inspect image:/ });
    await opener.click();
    await page.mouse.click(0, 0);
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a photo that fails while its viewer is open can be retried without losing focus or associations', async ({ page }) => {
    let unavailable = true;
    let release: () => void = () => undefined;
    const responseGate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/culture-observation-02.webp*', async (route) => {
      await responseGate;
      return unavailable ? route.fulfill({ status: 503, body: '' }) : route.continue();
    });
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    await page.locator('select').nth(1).selectOption('spyo');
    await page.locator('.culture-thumb').nth(1).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    release();
    await expect(dialog.getByRole('alert')).toContainText('Your associations are kept.');
    unavailable = false;
    await dialog.getByRole('button', { name: 'Retry image', exact: true }).click();
    await expect.poll(() => dialog.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Close image viewer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('select').nth(1)).toHaveValue('spyo');
    await expect(page.locator('.culture-thumb').nth(1)).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('each duplicated association has a local explanation which disappears after correction', async ({ page }) => {
    await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
    const selects = page.locator('select');
    await selects.nth(0).selectOption('ecoli');
    await selects.nth(1).selectOption('ecoli');
    for (const index of [0, 1]) {
      await expect(selects.nth(index)).toHaveAttribute('aria-invalid', 'true');
      await expect(selects.nth(index)).toHaveAccessibleDescription('Already used for another observation.');
    }
    await expect(submit(page)).toBeDisabled();
    await selects.nth(1).selectOption('spyo');
    await expect(page.locator('.match-duplicate')).toHaveCount(0);
    await expect(selects.nth(0)).toHaveAttribute('aria-invalid', 'false');
    await expect(selects.nth(1)).toHaveAttribute('aria-invalid', 'false');
  });
});

test.describe('discipline-specific mission scenes', () => {
  for (const caseFile of [
    { lab: 'Hematology Lab', mission: 'Blood Smear Code', asset: 'mission-hematology-investigation' },
    { lab: 'Clinical Biochemistry Lab', mission: 'Organ Rescue Mission', asset: '6.webp' },
  ]) {
    test(`${caseFile.mission} uses a dedicated evidence scene`, async ({ page }) => {
      await resetDemo(page);
      await startMissionViaUi(page, caseFile.lab, caseFile.mission);
      const hero = page.locator('.mission-hero > img');
      await expect(hero).toHaveAttribute('src', new RegExp(caseFile.asset));
      await expect.poll(() => hero.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      expect(await hero.evaluate((el) => [el.naturalWidth, el.naturalHeight])).toEqual([1400, 934]);
      await noOverflow(page);
    });
  }
});

test.describe('every playable mission has its own evidence scene', () => {
  for (const caseFile of [
    { id: 'hem-01', lab: 'Hematology Lab', mission: 'Blood Smear Code', asset: 'mission-hematology-investigation', before: [] },
    { id: 'hem-02', lab: 'Hematology Lab', mission: 'Fix the Sample', asset: '2.webp', before: ['hem-01'] },
    { id: 'hem-03', lab: 'Hematology Lab', mission: 'Anemia Detective', asset: '3.webp', before: ['hem-01', 'hem-02'] },
    { id: 'mic-01', lab: 'Microbiology Lab', mission: 'Microbe Detective', asset: '4.webp', before: [] },
    { id: 'mic-02', lab: 'Microbiology Lab', mission: 'Gram Stain Challenge', asset: '5.webp', before: ['mic-01'] },
    { id: 'mic-03', lab: 'Microbiology Lab', mission: 'Petri Dish Mystery', asset: 'mission-microbiology-petri', before: ['mic-01', 'mic-02'] },
    { id: 'bio-01', lab: 'Clinical Biochemistry Lab', mission: 'Organ Rescue Mission', asset: '6.webp', before: [] },
    { id: 'bio-02', lab: 'Clinical Biochemistry Lab', mission: 'Lab Value Hacker', asset: '7.webp', before: ['bio-01'] },
    { id: 'bio-03', lab: 'Clinical Biochemistry Lab', mission: 'Acid-Base Emergency', asset: 'mission-biochemistry-acid-base', before: ['bio-01', 'bio-02'] },
  ]) {
    test(`${caseFile.mission} keeps its unique mission scene`, async ({ page }) => {
      const token = await resetDemo(page);
      for (const missionId of caseFile.before) await completeMissionViaApi(token, missionId);
      await startMissionViaUi(page, caseFile.lab, caseFile.mission);
      const hero = page.locator('.mission-hero > img');
      await expect(hero).toHaveAttribute('src', new RegExp(caseFile.asset));
      await expect.poll(() => hero.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
      expect(await hero.evaluate((el) => [el.naturalWidth, el.naturalHeight])).toEqual([1400, 934]);
      await noOverflow(page);
    });
  }
});

test('a failed mission scene stays accessible and does not block the investigation', async ({ page }) => {
  await resetDemo(page);
  await page.route('**/*mission-hematology-smear*', (route) => route.abort());
  await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  const scene = page.getByTestId('mission-scene').last();
  await expect(scene).toContainText('The illustrative scene could not be loaded. The investigation can continue.');
  await expect(scene).toHaveAttribute('role', 'img');
  await expect(page.getByRole('button', { name: 'Submit answer' })).toBeVisible();
});

test('mission scene stays centred in the case panel on desktop and mobile', async ({ page }) => {
  await resetDemo(page);
  await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const geometry = await page.locator('[data-testid="mission-scene"]').evaluate((scene) => {
      const panel = scene.closest('.case-panel')?.getBoundingClientRect();
      const box = scene.getBoundingClientRect();
      return panel ? { delta: Math.abs((box.left + box.width / 2) - (panel.left + panel.width / 2)), ratio: box.width / box.height } : null;
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.delta).toBeLessThan(1);
    expect(geometry!.ratio).toBeCloseTo(1400 / 934, 2);
  }
});
