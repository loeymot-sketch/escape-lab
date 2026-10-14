# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: image-integration.spec.ts >> observation images at 1280 × 900 >> all four photos retain their pixels and can be inspected without changing an association
- Location: e2e/image-integration.spec.ts:64:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.assistant-inline')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('.assistant-inline') with timeout 10000ms
  - waiting for locator('.assistant-inline')

```

```yaml
- banner:
  - button "Exit mission"
  - text: CASE FILE · Microbiology Petri Dish Mystery
  - timer "Time left 05:51"
  - group "Langue / Language":
    - button "Français": FR
    - button "English" [pressed]: EN
- region "Mission overview":
  - progressbar "Mission progress"
  - region "Petri Dish Mystery":
    - text: CASE FILE · Microbiology Educational simulation
    - heading "Petri Dish Mystery" [level=1]
    - paragraph: MicrobiologyMatch the pairs
    - text: STEP 1 / 1 01
  - list "Mission steps":
    - listitem "Current step 1": "01"
- main:
  - region "Match each plate observation to the organism it most suggests (presumptive identification).":
    - text: YOUR INVESTIGATION QUESTION 1
    - heading "Match each plate observation to the organism it most suggests (presumptive identification)." [level=1]
    - text: YOUR RESPONSE Match the pairs
    - paragraph: Inspect each image in detail, then associate the observation with an organism.
    - 'button "Inspect image: Pink colonies on MacConkey agar"':
      - img "Pink MacConkey agar plate with pink colonies."
    - text: Pink colonies on MacConkey agar
    - combobox "Association for Pink colonies on MacConkey agar":
      - option "Choose association…" [selected]
      - option "Proteus mirabilis"
      - option "Escherichia coli"
      - option "Pseudomonas aeruginosa"
      - option "Streptococcus pyogenes"
    - 'button "Inspect image: Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains"':
      - img "Blood agar plate with pale colonies and clear halos."
    - text: Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains
    - combobox "Association for Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains":
      - option "Choose association…" [selected]
      - option "Proteus mirabilis"
      - option "Escherichia coli"
      - option "Pseudomonas aeruginosa"
      - option "Streptococcus pyogenes"
    - 'button "Inspect image: Swarming growth that spreads across the blood agar plate"':
      - img "Red blood agar with concentric rings of spreading growth."
    - text: Swarming growth that spreads across the blood agar plate
    - combobox "Association for Swarming growth that spreads across the blood agar plate":
      - option "Choose association…" [selected]
      - option "Proteus mirabilis"
      - option "Escherichia coli"
      - option "Pseudomonas aeruginosa"
      - option "Streptococcus pyogenes"
    - 'button "Inspect image: Green pigment with a sweet, fruity odor"':
      - img "Green agar plate with green-pigmented colonies."
    - text: Green pigment with a sweet, fruity odor
    - combobox "Association for Green pigment with a sweet, fruity odor":
      - option "Choose association…" [selected]
      - option "Proteus mirabilis"
      - option "Escherichia coli"
      - option "Pseudomonas aeruginosa"
      - option "Streptococcus pyogenes"
    - status: 0 of 4 matched. Match every item to enable Submit.
    - button "Submit answer" [disabled]
    - paragraph: Educational scenario — not clinical guidance
  - complementary "Lab assistant and case status":
    - text: LAB ASSISTANT · BETA
    - heading "Observe before you decide." [level=2]
    - paragraph: Request a contextual hint when you need a new angle. Each hint costs 15 XP. Using a hint also forfeits the 20 XP no-hint bonus.
    - button "Ask Lab Assistant"
    - paragraph: "Hints used on this step: 0 of 2."
    - text: CASE STATUS
    - term: Wrong answers
    - definition: "0"
    - term: Hints used
    - definition: "0"
    - term: XP penalty so far
    - definition: "0"
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | import { fileURLToPath } from 'node:url';
  4   | import { navigateSection, completeLabViaApi, resetDemo, startMissionViaUi, submit } from './support/helpers';
  5   | 
  6   | const componentSnapshotStyle = fileURLToPath(new URL('./support/component-snapshots.css', import.meta.url));
  7   | 
  8   | const noOverflow = async (page: Page) => {
  9   |   const size = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  10  |   expect(size.content).toBeLessThanOrEqual(size.viewport);
  11  | };
  12  | 
  13  | const headerIsReadable = async (page: Page) => {
  14  |   const defects = await page.locator('.player>header').evaluate((header) => {
  15  |     const controls = [...header.children].map((el) => ({ name: el.className, box: el.getBoundingClientRect() }));
  16  |     const problems: string[] = [];
  17  |     for (const [index, current] of controls.entries()) {
  18  |       if (current.box.left < 0 || current.box.right > innerWidth + 1) problems.push(`${current.name} leaves the viewport`);
  19  |       for (const other of controls.slice(index + 1)) {
  20  |         if (current.box.left < other.box.right - 1 && other.box.left < current.box.right - 1 && current.box.top < other.box.bottom - 1 && other.box.top < current.box.bottom - 1) problems.push(`${current.name} overlaps ${other.name}`);
  21  |       }
  22  |     }
  23  |     return problems;
  24  |   });
  25  |   expect(defects).toEqual([]);
  26  | };
  27  | 
  28  | for (const [width, height] of [[320, 568], [375, 812], [390, 844], [568, 320], [667, 375], [768, 1024], [844, 390], [1280, 900]] as const) {
  29  |   test.describe(`observation images at ${width} × ${height}`, () => {
  30  |     test.use({ viewport: { width, height }, deviceScaleFactor: width <= 430 ? 3 : 1, hasTouch: width <= 844 });
  31  |     test.beforeEach(async ({ page }) => { await resetDemo(page); });
  32  | 
  33  |     if (height >= 500) test('laboratories are visible first; compact statistics and the demo note follow them', async ({ page }) => {
  34  |       await noOverflow(page);
  35  |       const firstScene = (await page.locator('.lab-strip .lab-card-scene').first().boundingBox())!;
  36  |       const firstName = (await page.locator('.lab-strip h2').first().boundingBox())!;
  37  |       expect(firstScene.y).toBeLessThan(height - 90);
  38  |       expect(firstName.y).toBeLessThan(height);
  39  |       const lastLab = (await page.locator('.lab-strip .lab-card').last().boundingBox())!;
  40  |       const stats = (await page.locator('.dashboard-stats').boundingBox())!;
  41  |       const guide = (await page.locator('.how-it-works').boundingBox())!;
  42  |       const demo = (await page.locator('.demo-note').boundingBox())!;
  43  |       expect(stats.y).toBeGreaterThanOrEqual(lastLab.y + lastLab.height);
  44  |       expect(stats.height).toBeLessThan(150);
  45  |       expect(demo.y).toBeGreaterThanOrEqual(guide.y + guide.height);
  46  |       // Old discipline-specific cream-theme colours must not defeat the navy game's button colours.
  47  |       const buttons = await page.locator('.lab-strip .lab-card-foot button').evaluateAll((nodes) => nodes.map((node) => {
  48  |         const css = getComputedStyle(node);
  49  |         const rgb = css.color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  50  |         const luminance = (channels: number[]) => channels.map((value) => { const x = value / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  51  |         const dark = luminance([9, 36, 58]);
  52  |         const light = luminance(rgb);
  53  |         return { contrast: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05), decoration: css.textDecorationLine };
  54  |       }));
  55  |       expect(buttons).toHaveLength(3);
  56  |       for (const button of buttons) { expect(button.contrast).toBeGreaterThanOrEqual(4.5); expect(button.decoration).toBe('none'); }
  57  |       const micro = page.locator('.lab-strip .lab-card.teal');
  58  |       await micro.scrollIntoViewIfNeeded();
  59  |       await expect.poll(() => micro.locator('img').evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  60  |       await page.mouse.move(0, 0); // Stable resting card: previous scrolls must not retain the hover zoom.
  61  |       await expect(micro).toHaveScreenshot(`microbiology-card-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
  62  |     });
  63  | 
  64  |     test('all four photos retain their pixels and can be inspected without changing an association', async ({ page }, testInfo) => {
  65  |       await startMissionViaUi(page, 'Microbiology Lab', 'Petri Dish Mystery');
  66  |       const assistant = page.locator('.assistant-inline');
> 67  |       await expect(assistant).toBeVisible();
      |                               ^ Error: expect(locator).toBeVisible() failed
  68  |       const assistantDecoration = await assistant.evaluate((node) => getComputedStyle(node, '::before').backgroundImage);
  69  |       expect(assistantDecoration).toContain('lab-assistant-robot');
  70  |       const images = page.locator('.culture-thumb img');
  71  |       await expect(images).toHaveCount(4);
  72  |       for (const image of await images.all()) {
  73  |         await image.scrollIntoViewIfNeeded();
  74  |         await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  75  |         const metrics = await image.evaluate((el) => {
  76  |           const img = el as HTMLImageElement;
  77  |           const box = img.getBoundingClientRect();
  78  |           return { width: box.width, height: box.height, natural: [img.naturalWidth, img.naturalHeight], fit: getComputedStyle(img).objectFit, source: img.currentSrc, alt: img.alt };
  79  |         });
  80  |         expect(metrics.natural).toEqual([720, 720]);
  81  |         expect(Math.abs(metrics.width - metrics.height)).toBeLessThan(0.5);
  82  |         expect(metrics.width).toBeGreaterThanOrEqual(128);
  83  |         expect(metrics.fit).toBe('contain');
  84  |         expect(`${metrics.source} ${metrics.alt}`).not.toMatch(/escherichia|staphylococcus|streptococcus|proteus|pseudomonas/i);
  85  |       }
  86  |       await noOverflow(page);
  87  |       const collisions = await page.locator('.match-row').evaluateAll((rows) => rows.flatMap((row) => {
  88  |         const observation = row.querySelector('.match-evidence')!.getBoundingClientRect();
  89  |         const select = row.querySelector('select')!.getBoundingClientRect();
  90  |         const overlaps = observation.left < select.right - 1 && select.left < observation.right - 1 && observation.top < select.bottom - 1 && select.top < observation.bottom - 1;
  91  |         return overlaps ? ['observation overlaps association control'] : [];
  92  |       }));
  93  |       expect(collisions).toEqual([]);
  94  |       await page.locator('select').first().selectOption('ecoli');
  95  |       // Isolate the observation component: Playwright scrolls a tall target under the sticky header.
  96  |       // Header bounds and overlaps are independently asserted below and remain visible in full-page proofs.
  97  |       await expect(page.locator('.matching-list')).toHaveScreenshot(`matching-${width}x${height}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: componentSnapshotStyle });
  98  | 
  99  |       const matchingShot = testInfo.outputPath(`matching-${width}.png`);
  100 |       await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  101 |       await page.screenshot({ path: matchingShot, fullPage: true, animations: 'disabled' });
  102 |       await testInfo.attach('Matching layout', { path: matchingShot, contentType: 'image/png' });
  103 | 
  104 |       for (const language of ['en', 'fr'] as const) {
  105 |         if (language === 'fr') {
  106 |           await page.getByRole('button', { name: 'Français' }).click();
  107 |           await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  108 |         }
  109 |         const opener = page.getByRole('button', { name: language === 'fr' ? /^Examiner l’image/ : /^Inspect image:/ }).first();
  110 |         await headerIsReadable(page);
  111 |         const originalOverflow = await page.evaluate(() => document.body.style.overflow);
  112 |         if (language === 'en') {
  113 |           if (width <= 844) await opener.tap(); else await opener.click();
  114 |         } else {
  115 |           await opener.focus();
  116 |           await page.keyboard.press('Enter');
  117 |         }
  118 |         const dialog = page.getByRole('dialog');
  119 |         await expect(dialog).toBeVisible();
  120 |         expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  121 |         await headerIsReadable(page);
  122 |         await expect(dialog.getByRole('heading')).toContainText(language === 'fr' ? 'Colonies roses' : 'Pink colonies');
  123 |         const photo = dialog.locator('.culture-viewer-photo');
  124 |         await expect.poll(() => photo.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  125 |         const frame = (await dialog.boundingBox())!;
  126 |         const image = (await photo.boundingBox())!;
  127 |         expect(frame.x).toBeGreaterThanOrEqual(0);
  128 |         expect(frame.y).toBeGreaterThanOrEqual(0);
  129 |         expect(frame.x + frame.width).toBeLessThanOrEqual(width + 1);
  130 |         expect(frame.y + frame.height).toBeLessThanOrEqual(height + 1);
  131 |         expect(Math.abs(image.width - image.height)).toBeLessThan(0.5);
  132 |         expect(image.width).toBeGreaterThan(200);
  133 |         expect(image.x).toBeGreaterThanOrEqual(frame.x);
  134 |         expect(image.x + image.width).toBeLessThanOrEqual(frame.x + frame.width);
  135 |         expect(image.y).toBeGreaterThanOrEqual(frame.y);
  136 |         expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height);
  137 |         expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  138 |         await page.keyboard.press('Tab');
  139 |         expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  140 |         await page.keyboard.press('Shift+Tab');
  141 |         expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  142 |         await page.locator('select').first().evaluate((el) => (el as HTMLSelectElement).focus());
  143 |         expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  144 |         await noOverflow(page);
  145 |         if (language === 'fr') {
  146 |           await expect(dialog).toHaveScreenshot(`inspection-${width}x${height}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
  147 |           const shot = testInfo.outputPath(`inspection-${width}.png`);
  148 |           await page.screenshot({ path: shot, animations: 'disabled' });
  149 |           await testInfo.attach('Image inspection in French', { path: shot, contentType: 'image/png' });
  150 |           expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  151 |         }
  152 |         await page.keyboard.press('Escape');
  153 |         await expect(dialog).toBeHidden();
  154 |         await expect(opener).toBeFocused();
  155 |         await expect(page.locator('select').first()).toHaveValue('ecoli');
  156 |         await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe(originalOverflow);
  157 |       }
  158 |     });
  159 |   });
  160 | }
  161 | 
  162 | for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]] as const) {
  163 |   test.describe(`dedicated Master environment at ${width}px`, () => {
  164 |     test.use({ viewport: { width, height } });
  165 | 
  166 |     test('the violet door stays sharp and distinct from the vault in locked and playable states', async ({ page }) => {
  167 |       const token = await resetDemo(page);
```