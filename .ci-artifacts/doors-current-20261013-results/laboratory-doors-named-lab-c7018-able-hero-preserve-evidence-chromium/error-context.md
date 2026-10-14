# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: laboratory-doors.spec.ts >> named laboratory doors at 320px >> microbiology: translated door, map and playable hero preserve evidence
- Location: e2e/laboratory-doors.spec.ts:36:31

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.mission-hero')
  1653 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: microbiology-hero-320.png

Call log:
  - Expect "toHaveScreenshot(microbiology-hero-320.png)" locator('.mission-hero') with timeout 10000ms
    - verifying given screenshot expectation
  - waiting for locator('.mission-hero')
    - locator resolved to <section class="mission-hero" aria-labelledby="mission-title">…</section>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 1653 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.mission-hero')
    - locator resolved to <section class="mission-hero" aria-labelledby="mission-title">…</section>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 1653 pixels (ratio 0.03 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - button "Exit mission" [ref=f1e5] [cursor=pointer]
    - generic [ref=f1e8]:
      - generic [ref=f1e9]: CASE FILE · Microbiology
      - generic [ref=f1e10]: Petri Dish Mystery
    - timer "Time left 06:00" [ref=f1e11]:
      - generic [aria-hidden] [ref=f1e15]: 06:00
    - group "Langue / Language" [ref=f1e16]:
      - button "Français" [ref=f1e17] [cursor=pointer]: FR
      - button "English" [pressed] [ref=f1e18] [cursor=pointer]: EN
  - region "Mission overview" [ref=f1e19]:
    - progressbar "Mission progress" [ref=f1e20]
    - region [ref=f1e21]:
      - generic [ref=f1e24]:
        - generic [ref=f1e25]:
          - generic [ref=f1e26]: CASE FILE · Microbiology
          - generic [ref=f1e28]: Educational simulation
        - heading "Petri Dish Mystery" [level=1] [ref=f1e29]
        - paragraph [ref=f1e30]: Microbiology / Match the pairs
      - generic [ref=f1e31]:
        - generic [ref=f1e32]: STEP 1 / 1
        - generic [ref=f1e33]: "01"
    - list "Mission steps" [ref=f1e34]:
      - listitem "Current step 1" [ref=f1e35]:
        - generic [ref=f1e36]: "01"
  - main [ref=f1e37]:
    - region [ref=f1e38]:
      - generic [ref=f1e39]:
        - generic [ref=f1e40]: YOUR INVESTIGATION
        - generic [ref=f1e43]: QUESTION 1
      - heading "Match each plate observation to the organism it most suggests (presumptive identification)." [active] [level=1] [ref=f1e44]
      - generic [ref=f1e45]:
        - generic [ref=f1e46]: YOUR RESPONSE
        - generic [ref=f1e47]: Match the pairs
      - paragraph [ref=f1e48]: Inspect each image in detail, then associate the observation with an organism.
      - generic [ref=f1e49]:
        - generic [ref=f1e50]:
          - generic [ref=f1e51]:
            - 'button "Inspect image: Pink colonies on MacConkey agar" [ref=f1e53]':
              - img "Pink MacConkey agar plate with pink colonies." [ref=f1e54]
            - generic [ref=f1e59] [cursor=pointer]: Pink colonies on MacConkey agar
          - combobox "Association for Pink colonies on MacConkey agar" [ref=f1e61]:
            - option "Choose association…" [selected]
            - option "Proteus mirabilis"
            - option "Escherichia coli"
            - option "Pseudomonas aeruginosa"
            - option "Streptococcus pyogenes"
        - generic [ref=f1e62]:
          - generic [ref=f1e63]:
            - 'button "Inspect image: Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains" [ref=f1e65]':
              - img "Blood agar plate with pale colonies and clear halos." [ref=f1e66]
            - generic [ref=f1e71] [cursor=pointer]: Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains
          - combobox "Association for Clear zone of beta-hemolysis on blood agar, Gram-positive cocci in chains" [ref=f1e73]:
            - option "Choose association…" [selected]
            - option "Proteus mirabilis"
            - option "Escherichia coli"
            - option "Pseudomonas aeruginosa"
            - option "Streptococcus pyogenes"
        - generic [ref=f1e74]:
          - generic [ref=f1e75]:
            - 'button "Inspect image: Swarming growth that spreads across the blood agar plate" [ref=f1e77]':
              - img "Red blood agar with concentric rings of spreading growth." [ref=f1e78]
            - generic [ref=f1e83] [cursor=pointer]: Swarming growth that spreads across the blood agar plate
          - combobox "Association for Swarming growth that spreads across the blood agar plate" [ref=f1e85]:
            - option "Choose association…" [selected]
            - option "Proteus mirabilis"
            - option "Escherichia coli"
            - option "Pseudomonas aeruginosa"
            - option "Streptococcus pyogenes"
        - generic [ref=f1e86]:
          - generic [ref=f1e87]:
            - 'button "Inspect image: Green pigment with a sweet, fruity odor" [ref=f1e89]':
              - img "Green agar plate with green-pigmented colonies." [ref=f1e90]
            - generic [ref=f1e95] [cursor=pointer]: Green pigment with a sweet, fruity odor
          - combobox "Association for Green pigment with a sweet, fruity odor" [ref=f1e97]:
            - option "Choose association…" [selected]
            - option "Proteus mirabilis"
            - option "Escherichia coli"
            - option "Pseudomonas aeruginosa"
            - option "Streptococcus pyogenes"
      - status [ref=f1e98]: 0 of 4 matched. Match every item to enable Submit.
      - generic [ref=f1e99]:
        - generic [ref=f1e100]: LAB ASSISTANT · BETA
        - generic [ref=f1e101]:
          - button "Ask Lab Assistant" [ref=f1e102] [cursor=pointer]
          - paragraph [ref=f1e105]: Observe before you decide. Each hint costs 15 XP. Using a hint also forfeits the 20 XP no-hint bonus.
        - paragraph [ref=f1e106]: "Hints used on this step: 0 of 2."
      - button "Submit answer" [disabled] [ref=f1e107]
      - paragraph [ref=f1e110]: Educational scenario — not clinical guidance
    - complementary "Lab assistant and case status" [ref=f1e111]:
      - generic [ref=f1e112]:
        - generic [ref=f1e113]: CASE STATUS
        - generic [ref=f1e114]:
          - generic [ref=f1e115]:
            - term [ref=f1e116]: Wrong answers
            - definition [ref=f1e117]: "0"
          - generic [ref=f1e118]:
            - term [ref=f1e119]: Hints used
            - definition [ref=f1e120]: "0"
          - generic [ref=f1e121]:
            - term [ref=f1e122]: XP penalty so far
            - definition [ref=f1e123]: "0"
```

# Test source

```ts
  1   | import { expect, test, type Locator, type Page } from '@playwright/test';
  2   | import { fileURLToPath } from 'node:url';
  3   | import AxeBuilder from '@axe-core/playwright';
  4   | import { navigateSection, ARTWORK, clickArtwork, resetDemo, startMissionViaUi, submit } from './support/helpers';
  5   | 
  6   | const snapshotStyle = fileURLToPath(new URL('./support/component-snapshots.css', import.meta.url));
  7   | const rooms = [
  8   |   { slug: 'hematology', tone: 'red', name: 'Hematology', fr: 'Hématologie', lab: 'Hematology Lab', mission: 'Blood Smear Code', emblem: 'droplet' },
  9   |   { slug: 'microbiology', tone: 'teal', name: 'Microbiology', fr: 'Microbiologie', lab: 'Microbiology Lab', mission: 'Petri Dish Mystery', emblem: 'microscope' },
  10  |   { slug: 'biochemistry', tone: 'gold', name: 'Clinical Biochemistry', fr: 'Biochimie clinique', lab: 'Clinical Biochemistry Lab', mission: 'Organ Rescue Mission', emblem: 'flask-conical' },
  11  | ] as const;
  12  | 
  13  | const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  14  | 
  15  | async function readableScene(card: Locator) {
  16  |   const collisions = await card.locator('.lab-card-scene').evaluate((scene) => {
  17  |     const labels = [...scene.querySelectorAll('.lab-index, .lab-state, .lab-card-top > svg, .lab-emblem, .lab-door-nameplate')].map((el) => ({ name: el.getAttribute('class'), box: el.getBoundingClientRect() }));
  18  |     const frame = scene.getBoundingClientRect();
  19  |     return labels.flatMap((current, index) => {
  20  |       const issues: string[] = [];
  21  |       if (current.box.left < frame.left || current.box.right > frame.right + 1 || current.box.top < frame.top || current.box.bottom > frame.bottom + 1) issues.push(`${current.name} outside scene`);
  22  |       for (const other of labels.slice(index + 1)) if (current.box.left < other.box.right - 1 && other.box.left < current.box.right - 1 && current.box.top < other.box.bottom - 1 && other.box.top < current.box.bottom - 1) issues.push(`${current.name} overlaps ${other.name}`);
  23  |       return issues;
  24  |     });
  25  |   });
  26  |   expect(collisions).toEqual([]);
  27  |   const clipped = await card.locator('.lab-door-nameplate').evaluate((el) => ({ horizontal: el.scrollWidth > el.clientWidth + 1, vertical: el.scrollHeight > el.clientHeight + 1 }));
  28  |   expect(clipped).toEqual({ horizontal: false, vertical: false });
  29  | }
  30  | 
  31  | for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]] as const) {
  32  |   test.describe(`named laboratory doors at ${width}px`, () => {
  33  |     test.use({ viewport: { width, height }, hasTouch: width < 500 });
  34  |     test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  35  | 
  36  |     for (const room of rooms) test(`${room.slug}: translated door, map and playable hero preserve evidence`, async ({ page }) => {
  37  |       await resetDemo(page);
  38  |       const card = page.locator(`.lab-strip .lab-card.${room.tone}`);
  39  |       const image = card.locator('.lab-card-scene img');
  40  |       await image.scrollIntoViewIfNeeded();
  41  |       await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBe(1400);
  42  |       const source = (await image.getAttribute('src'))!;
  43  |       expect(source).toContain(`lab-${room.slug}-door`);
  44  |       expect(await image.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(934);
  45  |       await expect(image).toHaveCSS('object-fit', 'cover');
  46  |       const asset = await page.request.get(source);
  47  |       expect(asset.ok()).toBe(true);
  48  |       expect(asset.headers()['content-type']).toContain('image/webp');
  49  |       expect((await asset.body()).length).toBeLessThanOrEqual(300_000);
  50  |       await expect(card.locator('.lab-door-nameplate')).toHaveText(room.name);
  51  |       await expect(card.locator(`.lab-emblem .lucide-${room.emblem}`)).toBeVisible();
  52  |       await expect(card.locator('.lab-card-scene')).toHaveAttribute('aria-hidden', 'true');
  53  |       await expect(image).toHaveAttribute('alt', '');
  54  |       await readableScene(card);
  55  |       await page.mouse.move(0, 0);
  56  |       await expect(card).toHaveScreenshot(`${room.slug}-card-en-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
  57  |       await page.getByRole('button', { name: 'Français' }).click();
  58  |       await expect(card.locator('.lab-door-nameplate')).toHaveText(room.fr);
  59  |       await expect(card.getByRole('heading')).toHaveText(room.fr);
  60  |       await readableScene(card);
  61  |       await noOverflow(page);
  62  |       await page.mouse.move(0, 0); // Compare the resting card, not a retained hover from language switching.
  63  |       await expect(card).toHaveScreenshot(`${room.slug}-card-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
  64  |       if (width === 390) expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  65  | 
  66  |       await page.getByRole('button', { name: 'English' }).click();
  67  |       await navigateSection(page, 'Lab map');
  68  |       const mapCard = page.locator(`.map-grid .lab-card.${room.tone}`);
  69  |       await expect(mapCard.locator('img')).toHaveAttribute('src', source);
  70  |       await mapCard.scrollIntoViewIfNeeded();
  71  |       await noOverflow(page);
  72  |       await page.mouse.move(0, 0);
  73  |       await expect(mapCard.locator('.lab-card-scene')).toHaveScreenshot(`${room.slug}-map-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
  74  |       await startMissionViaUi(page, room.lab, room.mission);
  75  |       const hero = page.locator('.mission-hero');
  76  |       const missionSource = room.slug === 'hematology' ? 'mission-hematology-investigation' : room.slug === 'microbiology' ? 'mission-microbiology-petri' : 'mission-biochemistry-acid-base';
  77  |       await expect(hero.locator('img')).toHaveAttribute('src', new RegExp(missionSource));
  78  |       await expect.poll(() => hero.locator('img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1400);
  79  |       if (width < 500) await expect(hero.locator('.mission-kicker-divider')).toHaveCSS('display', 'none');
  80  |       await expect(hero.locator('.mission-hero-kicker')).toHaveText(`CASE FILE · ${room.name} Educational simulation`);
  81  |       const kickerGeometry = await hero.locator('.mission-hero-kicker').evaluate((el) => {
  82  |         const first = el.querySelector('.mission-kicker-case')!.getBoundingClientRect();
  83  |         const second = el.querySelector('.mission-kicker-simulation')!.getBoundingClientRect();
  84  |         return { overlap: first.left < second.right && second.left < first.right && first.top < second.bottom && second.top < first.bottom, separation: second.top >= first.bottom - 1 ? second.top - first.bottom : second.left - first.right };
  85  |       });
  86  |       expect(kickerGeometry.overlap).toBe(false);
  87  |       expect(kickerGeometry.separation).toBeGreaterThanOrEqual(5);
> 88  |       await expect(hero).toHaveScreenshot(`${room.slug}-hero-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002, stylePath: snapshotStyle });
      |                          ^ Error: expect(locator).toHaveScreenshot(expected) failed
  89  |       await noOverflow(page);
  90  | 
  91  |       // Decorative scenery never replaces scientific evidence or its coordinate space.
  92  |       if (room.slug === 'hematology') {
  93  |         const evidence = page.locator('.scientific-image');
  94  |         await expect.poll(() => evidence.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(ARTWORK.smear.width);
  95  |         expect(await evidence.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(ARTWORK.smear.height);
  96  |         const box = (await evidence.boundingBox())!;
  97  |         expect(Math.abs(box.width / box.height - ARTWORK.smear.width / ARTWORK.smear.height)).toBeLessThan(0.01);
  98  |         await expect(evidence).not.toHaveAttribute('src', source);
  99  |         await evidence.scrollIntoViewIfNeeded();
  100 |         expect(await page.locator('.scientific').evaluate((el) => { const box = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); })).toBe(true);
  101 |         await clickArtwork(page, ARTWORK.smear);
  102 |         await submit(page).click();
  103 |         await expect(page.locator('.result-hero .eyebrow')).toHaveText('CASE COMPLETE Hematology');
  104 |         if (width === 390) await expect(page.locator('.result-hero')).toHaveScreenshot('hematology-result-390.png', { animations: 'disabled', scale: 'css', maxDiffPixelRatio: 0.002 });
  105 |       } else if (room.slug === 'microbiology') {
  106 |         await expect(page.locator('.culture-thumb img')).toHaveCount(4);
  107 |         await expect(page.locator('.matching-list select')).toHaveCount(4);
  108 |         for (const photo of await page.locator('.culture-thumb img').all()) await expect(photo).not.toHaveAttribute('src', source);
  109 |       } else {
  110 |         await expect(page.locator('#case-prompt')).not.toBeEmpty();
  111 |         await expect(page.locator('.values .value')).not.toHaveCount(0);
  112 |       }
  113 |     });
  114 | 
  115 |     for (const room of rooms) test(`${room.slug}: a locked-state layout fixture keeps its label and lock separate`, async ({ page }) => {
  116 |       // The current standard rooms are open. This is an explicit mocked API-contract layout state, not a real unlock claim.
  117 |       await resetDemo(page); // Use the existing guest instead of consuming another registration slot.
  118 |       await page.route('**/api/labs', async (route) => {
  119 |         const response = await route.fetch();
  120 |         const body = await response.json();
  121 |         body.labs = body.labs.map((lab: { slug: string; state: string; lockedReason?: string }) => lab.slug === room.slug ? { ...lab, state: 'locked', lockedReason: 'Laboratory unavailable in this layout fixture.' } : lab);
  122 |         await route.fulfill({ response, json: body });
  123 |       });
  124 |       await page.reload();
  125 |       await expect(page.getByRole('heading', { name: 'Choose a laboratory' })).toBeVisible();
  126 |       const card = page.locator(`.lab-strip .lab-card.${room.tone}`);
  127 |       await card.scrollIntoViewIfNeeded();
  128 |       await expect(card).toHaveClass(/locked/);
  129 |       await expect(card.getByRole('button')).toHaveCount(0);
  130 |       await expect(card.locator('.lab-card-top > svg')).toBeVisible();
  131 |       await expect(card.locator('.lab-door-nameplate')).toHaveText(room.name);
  132 |       await readableScene(card);
  133 |       await noOverflow(page);
  134 |     });
  135 |   });
  136 | }
  137 | 
```