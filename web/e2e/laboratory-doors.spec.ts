import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { navigateSection, ARTWORK, clickArtwork, resetDemo, startMissionViaUi, submit } from './support/helpers';

const snapshotStyle = fileURLToPath(new URL('./support/component-snapshots.css', import.meta.url));
const rooms = [
  { slug: 'hematology', tone: 'red', name: 'Hematology', fr: 'Hématologie', lab: 'Hematology Lab', mission: 'Blood Smear Code', emblem: 'droplet' },
  { slug: 'microbiology', tone: 'teal', name: 'Microbiology', fr: 'Microbiologie', lab: 'Microbiology Lab', mission: 'Petri Dish Mystery', emblem: 'microscope' },
  { slug: 'biochemistry', tone: 'gold', name: 'Clinical Biochemistry', fr: 'Biochimie clinique', lab: 'Clinical Biochemistry Lab', mission: 'Organ Rescue Mission', emblem: 'flask-conical' },
] as const;

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

async function readableScene(card: Locator) {
  const collisions = await card.locator('.lab-card-scene').evaluate((scene) => {
    const labels = [...scene.querySelectorAll('.lab-index, .lab-state, .lab-card-top > svg, .lab-emblem, .lab-door-nameplate')].map((el) => ({ name: el.getAttribute('class'), box: el.getBoundingClientRect() }));
    const frame = scene.getBoundingClientRect();
    return labels.flatMap((current, index) => {
      const issues: string[] = [];
      if (current.box.left < frame.left || current.box.right > frame.right + 1 || current.box.top < frame.top || current.box.bottom > frame.bottom + 1) issues.push(`${current.name} outside scene`);
      for (const other of labels.slice(index + 1)) if (current.box.left < other.box.right - 1 && other.box.left < current.box.right - 1 && current.box.top < other.box.bottom - 1 && other.box.top < current.box.bottom - 1) issues.push(`${current.name} overlaps ${other.name}`);
      return issues;
    });
  });
  expect(collisions).toEqual([]);
  const clipped = await card.locator('.lab-door-nameplate').evaluate((el) => ({ horizontal: el.scrollWidth > el.clientWidth + 1, vertical: el.scrollHeight > el.clientHeight + 1 }));
  expect(clipped).toEqual({ horizontal: false, vertical: false });
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]] as const) {
  test.describe(`named laboratory doors at ${width}px`, () => {
    test.use({ viewport: { width, height }, hasTouch: width < 500 });
    test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });

    for (const room of rooms) test(`${room.slug}: translated door, map and playable hero preserve evidence`, async ({ page }) => {
      await resetDemo(page);
      const card = page.locator(`.lab-strip .lab-card.${room.tone}`);
      const image = card.locator('.lab-card-scene img');
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBe(1400);
      const source = (await image.getAttribute('src'))!;
      expect(source).toContain(`lab-${room.slug}-door`);
      expect(await image.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(934);
      await expect(image).toHaveCSS('object-fit', 'cover');
      const asset = await page.request.get(source);
      expect(asset.ok()).toBe(true);
      expect(asset.headers()['content-type']).toContain('image/webp');
      expect((await asset.body()).length).toBeLessThanOrEqual(300_000);
      await expect(card.locator('.lab-door-nameplate')).toHaveText(room.name);
      await expect(card.locator(`.lab-emblem .lucide-${room.emblem}`)).toBeVisible();
      await expect(card.locator('.lab-card-scene')).toHaveAttribute('aria-hidden', 'true');
      await expect(image).toHaveAttribute('alt', '');
      await readableScene(card);
      await page.mouse.move(0, 0);
      await expect(card).toHaveScreenshot(`${room.slug}-card-en-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
      await page.getByRole('button', { name: 'Français' }).click();
      await expect(card.locator('.lab-door-nameplate')).toHaveText(room.fr);
      await expect(card.getByRole('heading')).toHaveText(room.fr);
      await readableScene(card);
      await noOverflow(page);
      await page.mouse.move(0, 0); // Compare the resting card, not a retained hover from language switching.
      await expect(card).toHaveScreenshot(`${room.slug}-card-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
      if (width === 390) expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

      await page.getByRole('button', { name: 'English' }).click();
      await navigateSection(page, 'Lab map');
      const mapCard = page.locator(`.map-grid .lab-card.${room.tone}`);
      await expect(mapCard.locator('img')).toHaveAttribute('src', source);
      await mapCard.scrollIntoViewIfNeeded();
      await noOverflow(page);
      await page.mouse.move(0, 0);
      await expect(mapCard.locator('.lab-card-scene')).toHaveScreenshot(`${room.slug}-map-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
      await startMissionViaUi(page, room.lab, room.mission);
      const hero = page.locator('.mission-hero');
      const missionSource = room.slug === 'hematology' ? 'mission-hematology-investigation' : room.slug === 'microbiology' ? 'mission-microbiology-petri' : '6.webp';
      await expect(hero.locator('img')).toHaveAttribute('src', new RegExp(missionSource));
      await expect.poll(() => hero.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1400);
      if (width < 500) await expect(hero.locator('.mission-kicker-divider')).toHaveCSS('display', 'none');
      await expect(hero.locator('.mission-hero-kicker')).toHaveText(`CASE FILE · ${room.name} Educational simulation`);
      const kickerGeometry = await hero.locator('.mission-hero-kicker').evaluate((el) => {
        const first = el.querySelector('.mission-kicker-case')!.getBoundingClientRect();
        const second = el.querySelector('.mission-kicker-simulation')!.getBoundingClientRect();
        return { overlap: first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom, separation: second.top >= first.bottom - 1 ? second.top - first.bottom : second.left - first.right };
      });
      expect(kickerGeometry.overlap).toBe(false);
      expect(kickerGeometry.separation).toBeGreaterThanOrEqual(5);
      await expect(hero).toHaveScreenshot(`${room.slug}-hero-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
      await noOverflow(page);

      // Decorative scenery never replaces scientific evidence or its coordinate space.
      if (room.slug === 'hematology') {
        const evidence = page.locator('.scientific-image');
        await expect.poll(() => evidence.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(ARTWORK.smear.width);
        expect(await evidence.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(ARTWORK.smear.height);
        const box = (await evidence.boundingBox())!;
        expect(Math.abs(box.width / box.height - ARTWORK.smear.width / ARTWORK.smear.height)).toBeLessThan(0.01);
        await expect(evidence).not.toHaveAttribute('src', source);
        await evidence.scrollIntoViewIfNeeded();
        expect(await page.locator('.scientific').evaluate((el) => { const box = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); })).toBe(true);
        await clickArtwork(page, ARTWORK.smear);
        await submit(page).click();
        await expect(page.locator('.result-hero .eyebrow')).toHaveText('CASE COMPLETE Hematology');
        if (width === 390) await expect(page.locator('.result-hero')).toHaveScreenshot('hematology-result-390.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
      } else if (room.slug === 'microbiology') {
        await expect(page.locator('.culture-thumb img')).toHaveCount(4);
        await expect(page.locator('.matching-list select')).toHaveCount(4);
        for (const photo of await page.locator('.culture-thumb img').all()) await expect(photo).not.toHaveAttribute('src', source);
      } else {
        await expect(page.locator('#case-prompt')).not.toBeEmpty();
        await expect(page.locator('.values .value')).not.toHaveCount(0);
      }
    });

    for (const room of rooms) test(`${room.slug}: a locked-state layout fixture keeps its label and lock separate`, async ({ page }) => {
      // The current standard rooms are open. This is an explicit mocked API-contract layout state, not a real unlock claim.
      await resetDemo(page); // Use the existing guest instead of consuming another registration slot.
      await page.route('**/api/labs', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.labs = body.labs.map((lab: { slug: string; state: string; lockedReason?: string }) => lab.slug === room.slug ? { ...lab, state: 'locked', lockedReason: 'Laboratory unavailable in this layout fixture.' } : lab);
        await route.fulfill({ response, json: body });
      });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Choose a laboratory' })).toBeVisible();
      const card = page.locator(`.lab-strip .lab-card.${room.tone}`);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveClass(/locked/);
      await expect(card.getByRole('button')).toHaveCount(0);
      await expect(card.locator('.lab-card-top > svg')).toBeVisible();
      await expect(card.locator('.lab-door-nameplate')).toHaveText(room.name);
      await readableScene(card);
      await noOverflow(page);
    });
  });
}
