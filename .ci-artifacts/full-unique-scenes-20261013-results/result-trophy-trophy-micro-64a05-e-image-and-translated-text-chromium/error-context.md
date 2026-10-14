# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: result-trophy.spec.ts >> trophy microbiology 320: real debrief, complete image and translated text
- Location: e2e/result-trophy.spec.ts:104:29

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('.result-hero').locator('img')
Expected: "true"
Received: ""
Timeout:  10000ms

Call log:
  - Expect "toHaveAttribute" locator('.result-hero').locator('img') with timeout 10000ms
  - waiting for locator('.result-hero').locator('img')
    24 × locator resolved to <img alt="" src="/src/assets/mission-result-trophy.webp"/>
       - unexpected value "null"

```

# Page snapshot

```yaml
- main [ref=f2e3]:
  - region [ref=f2e4]:
    - group "Langue / Language" [ref=f2e6]:
      - button "Français" [ref=f2e7] [cursor=pointer]: FR
      - button "English" [pressed] [ref=f2e8] [cursor=pointer]: EN
    - generic [ref=f2e9]:
      - generic [ref=f2e10]:
        - generic [ref=f2e11]: CASE COMPLETE
        - generic [ref=f2e12]: Microbiology
      - heading "Investigation complete." [active] [level=1] [ref=f2e13]
      - paragraph [ref=f2e14]: Microbe Detective
  - paragraph [ref=f2e15]: Case archived. Here is your mission debrief.
  - region "Mission score" [ref=f2e16]:
    - generic [ref=f2e17]:
      - generic [ref=f2e18]: SCORE
      - generic [ref=f2e21]:
        - text: "180"
        - generic [ref=f2e22]: / 180 XP
    - progressbar "Score" [ref=f2e23]
  - generic [ref=f2e25]:
    - generic [ref=f2e34]:
      - generic [ref=f2e35]: Accuracy
      - strong [ref=f2e36]: 100%
      - generic [ref=f2e37]: 0 wrong · 0 hints
    - generic [ref=f2e43]:
      - generic [ref=f2e44]: Time
      - strong [ref=f2e45]: 00:00
      - generic [ref=f2e46]: Official timer
  - paragraph [ref=f2e47]: "New personal best: +55 XP added to your total."
  - region [ref=f2e48]:
    - heading "Final step explained" [level=2] [ref=f2e49]
    - paragraph [ref=f2e50]: Of these four, only Staphylococcus aureus is coagulase-positive. Staphylococci are catalase-positive; the other listed species are coagulase-negative.
  - list "Score ledger" [ref=f2e51]:
    - listitem [ref=f2e52]:
      - generic [ref=f2e53]:
        - text: Base mission
        - generic [ref=f2e54]: Mission completed
      - generic [ref=f2e55]: "+100"
    - listitem [ref=f2e56]:
      - generic [ref=f2e57]:
        - text: First attempt
        - generic [ref=f2e58]: Every step solved first time
      - generic [ref=f2e59]: "+30"
    - listitem [ref=f2e60]:
      - generic [ref=f2e61]:
        - text: Time bonus
        - generic [ref=f2e62]: Finished in 00:00
      - generic [ref=f2e63]: "+30"
    - listitem [ref=f2e64]:
      - generic [ref=f2e65]:
        - text: No hint used
        - generic [ref=f2e66]: No Lab Assistant hint
      - generic [ref=f2e67]: "+20"
  - paragraph [ref=f2e68]: "Vault progress for this laboratory: 3 8 ·"
  - generic [ref=f2e69]:
    - button "Replay mission" [ref=f2e70] [cursor=pointer]
    - button "Back to the laboratory" [ref=f2e74] [cursor=pointer]
    - button "Return to mission control" [ref=f2e77] [cursor=pointer]
```

# Test source

```ts
  1   | import { expect, test, type Page } from '@playwright/test';
  2   | import AxeBuilder from '@axe-core/playwright';
  3   | import { statSync } from 'node:fs';
  4   | import { fileURLToPath } from 'node:url';
  5   | import { ARTWORK, ATTEMPT_KEY, apiCall, clickArtwork, completeLabViaApi, expireAttemptInDb, openAttemptAt, outage, patched, resetDemo, sessionToken, slow, startMissionViaUi, submit, watchProblems } from './support/helpers';
  6   | import { MISSION_BY_ID, correctResponse } from './support/content';
  7   | 
  8   | const rooms = [
  9   |   { slug: 'hematology', mission: 'hem-01', en: 'Hematology', fr: 'Hématologie' },
  10  |   { slug: 'microbiology', mission: 'mic-01', en: 'Microbiology', fr: 'Microbiologie' },
  11  |   { slug: 'biochemistry', mission: 'bio-01', en: 'Clinical Biochemistry', fr: 'Biochimie clinique' },
  12  |   { slug: 'master', mission: 'master-01', en: 'Master Lab', fr: 'Laboratoire Master' },
  13  | ];
  14  | 
  15  | // Preparation uses the real public API in the isolated E2E database. No result is fabricated.
  16  | async function completedAttempt(page: Page, token: string, missionId: string) {
  17  |   if (missionId === 'master-01') for (const slug of ['hematology', 'microbiology', 'biochemistry']) await completeLabViaApi(token, slug);
  18  |   const start = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  19  |   expect([200, 201]).toContain(start.status);
  20  |   const id = start.body.attempt.attemptId as string;
  21  |   for (const step of MISSION_BY_ID.get(missionId)!.steps) {
  22  |     const answer = await apiCall(token, `/attempts/${id}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
  23  |     expect(answer.status).toBe(200);
  24  |   }
  25  |   const result = await apiCall(token, `/attempts/${id}/result`);
  26  |   expect(result.status).toBe(200);
  27  |   await page.evaluate(([key, value]) => sessionStorage.setItem(key!, value!), [ATTEMPT_KEY, id]);
  28  |   return result.body;
  29  | }
  30  | 
  31  | async function geometry(page: Page) {
  32  |   const hero = page.locator('.result-hero');
  33  |   const image = hero.locator('img');
  34  |   await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1401);
  35  |   await expect(image).toHaveAttribute('alt', '');
> 36  |   await expect(image).toHaveAttribute('aria-hidden', 'true');
      |                       ^ Error: expect(locator).toHaveAttribute(expected) failed
  37  |   await expect(image).toHaveCSS('object-fit', 'contain');
  38  |   const measured = await hero.evaluate((el) => {
  39  |     const box = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
  40  |     const scene = box('img'), copy = box('.result-hero-copy'), lang = box('.result-lang'), eyebrow = box('.eyebrow');
  41  |     const title = box('h1'), mission = box('.result-hero-copy>p'), frame = el.getBoundingClientRect();
  42  |     return {
  43  |       ratio: scene.width / scene.height, naturalHeight: (el.querySelector('img') as HTMLImageElement).naturalHeight,
  44  |       titleClearance: eyebrow.top - lang.bottom, imageClearance: scene.top - copy.bottom,
  45  |       titleGap: title.top - eyebrow.bottom, missionGap: mission.top - title.bottom,
  46  |       imageInside: scene.left >= frame.left - .5 && scene.right <= frame.right + .5 && scene.bottom <= frame.bottom + .5,
  47  |       textInside: [eyebrow, title, mission, lang].every((r) => r.left >= frame.left && r.right <= frame.right && r.top >= frame.top && r.bottom <= scene.top),
  48  |       overflow: document.documentElement.scrollWidth - innerWidth,
  49  |     };
  50  |   });
  51  |   expect(measured.naturalHeight).toBe(934);
  52  |   expect(Math.abs(measured.ratio - 1.5)).toBeLessThan(.001);
  53  |   expect(measured.titleClearance).toBeGreaterThanOrEqual(10);
  54  |   expect(measured.imageClearance).toBeGreaterThanOrEqual(-.5);
  55  |   expect(measured.titleGap).toBeGreaterThanOrEqual(10);
  56  |   expect(measured.missionGap).toBeGreaterThanOrEqual(8);
  57  |   expect(measured.imageInside).toBe(true);
  58  |   expect(measured.textInside).toBe(true);
  59  |   expect(measured.overflow).toBeLessThanOrEqual(1);
  60  |   await expect(page.getByRole('navigation')).toHaveCount(0);
  61  |   const spacing = await hero.locator('h1').evaluate((el) => { const css = getComputedStyle(el); return Number.parseFloat(css.letterSpacing) / Number.parseFloat(css.fontSize); });
  62  |   expect(spacing).toBeCloseTo(-.02, 3);
  63  |   await debriefGeometry(page);
  64  |   for (const button of await page.locator('.result-screen').getByRole('button').all()) {
  65  |     const box = (await button.boundingBox())!;
  66  |     expect(box.width).toBeGreaterThanOrEqual(44);
  67  |     expect(box.height).toBeGreaterThanOrEqual(44);
  68  |   }
  69  | }
  70  | 
  71  | async function debriefGeometry(page: Page) {
  72  |   const failures = await page.locator('.result-screen').evaluate((el) => {
  73  |     const frame = el.getBoundingClientRect();
  74  |     const boxes = [...el.querySelectorAll('.result-score-card,.result-stats .stat,.result-explanation,.ledger li,.result-actions button')];
  75  |     return boxes.flatMap((node) => {
  76  |       const rect = node.getBoundingClientRect();
  77  |       return rect.left < frame.left || rect.right > frame.right + .5 || node.scrollWidth > node.clientWidth + 1 ? [`${node.className}: clipped or outside result`] : [];
  78  |     });
  79  |   });
  80  |   expect(failures).toEqual([]);
  81  |   const wrappedStats = await page.locator('.result-stats .stat strong,.result-stats .stat>div>span').evaluateAll((elements) => elements.flatMap((el) => {
  82  |     const range = document.createRange(); range.selectNodeContents(el);
  83  |     const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  84  |     return new Set(lines.map((rect) => Math.round(rect.top))).size > 1 ? [el.textContent] : [];
  85  |   }));
  86  |   expect(wrappedStats).toEqual([]);
  87  |   const oneScoreLine = await page.locator('.result-score-top>b').evaluate((el) => {
  88  |     const range = document.createRange(); range.selectNodeContents(el);
  89  |     const boxes = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  90  |     // Different font sizes share a baseline but not their top coordinate. All runs must overlap vertically.
  91  |     return boxes.length > 0 && Math.max(...boxes.map((rect) => rect.top)) < Math.min(...boxes.map((rect) => rect.bottom));
  92  |   });
  93  |   expect(oneScoreLine).toBe(true);
  94  |   const actions = page.locator('.result-actions');
  95  |   await expect(actions.getByRole('button')).toHaveCount(3);
  96  |   const grid = (await actions.boundingBox())!, last = (await actions.getByRole('button').last().boundingBox())!;
  97  |   expect(Math.abs(last.width - grid.width)).toBeLessThanOrEqual(.5);
  98  |   expect(last.x).toBeCloseTo(grid.x, 0);
  99  | }
  100 | 
  101 | test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
  102 | 
  103 | for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 900]]) {
  104 |   for (const room of rooms) test(`trophy ${room.slug} ${width}: real debrief, complete image and translated text`, async ({ page }) => {
  105 |     await page.setViewportSize({ width: width!, height: height! });
  106 |     const problems = watchProblems(page);
  107 |     const token = await resetDemo(page);
  108 |     const result = await completedAttempt(page, token, room.mission);
  109 |     await page.reload();
  110 |     const hero = page.locator('.result-hero');
  111 |     await expect(hero.locator('h1')).toHaveText('Investigation complete.');
  112 |     await expect(hero.locator('h1')).toBeFocused();
  113 |     await expect(hero.locator('.eyebrow')).toHaveText(`CASE COMPLETE ${room.en}`);
  114 |     await expect(page.locator('.result-score-top>b')).toHaveText(`${result.score} / ${result.maxScore} XP`);
  115 |     await expect(page.locator('.result-stats .stat').nth(0).locator('strong')).toHaveText(`${result.stats.accuracyPct}%`);
  116 |     await expect(page.locator('.result-stats .stat').nth(1).locator('strong')).toHaveText(result.stats.elapsed);
  117 |     await expect(hero.locator('img')).toHaveAttribute('src', /mission-result-trophy/);
  118 |     expect(statSync(fileURLToPath(new URL('../src/assets/mission-result-trophy.webp', import.meta.url))).size).toBeLessThanOrEqual(300_000);
  119 |     await geometry(page);
  120 |     await page.mouse.move(0, 0);
  121 |     await expect(hero).toHaveScreenshot(`trophy-${room.slug}-en-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  122 |     await hero.getByRole('button', { name: 'Français' }).click();
  123 |     await expect(hero.locator('h1')).toHaveText('Enquête terminée.');
  124 |     await expect(hero.locator('.eyebrow')).toHaveText(`DOSSIER TERMINÉ ${room.fr}`);
  125 |     await geometry(page);
  126 |     await page.mouse.move(0, 0);
  127 |     await expect(hero).toHaveScreenshot(`trophy-${room.slug}-fr-${width}.png`, { animations: 'disabled', scale: 'css', maxDiffPixelRatio: .002 });
  128 |     if (width === 390) expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  129 |     expect(problems).toEqual([]);
  130 |   });
  131 | }
  132 | 
  133 | test('result loading never celebrates before the result has actually arrived', async ({ page }) => {
  134 |   await page.setViewportSize({ width: 320, height: 568 });
  135 |   const token = await resetDemo(page);
  136 |   await completedAttempt(page, token, 'hem-01');
```