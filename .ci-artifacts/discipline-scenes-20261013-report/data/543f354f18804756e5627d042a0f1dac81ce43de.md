# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: image-integration.spec.ts >> discipline-specific mission scenes >> Acid-Base Emergency uses a dedicated evidence scene
- Location: e2e/image-integration.spec.ts:301:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^(Start|Resume|Replay) Acid-Base Emergency$/ })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "Skip to main content" [ref=f1e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary "Primary" [ref=f1e5]:
    - generic [ref=f1e6]: ESCAPELAB
    - generic [ref=f1e11]: BIOMEDICAL TRAINING
    - generic [ref=f1e12]:
      - text: Project conceived and developed with passion by
      - strong [ref=f1e13]: Sawssen Jemaiel
    - navigation "Sections" [ref=f1e14]:
      - button "Rooms" [ref=f1e15] [cursor=pointer]
      - button "Vault" [ref=f1e20] [cursor=pointer]
      - button "Badges" [ref=f1e25] [cursor=pointer]
      - button "Lab map" [ref=f1e33] [cursor=pointer]
      - button "Leaderboard" [ref=f1e37] [cursor=pointer]
      - button "Lab results" [ref=f1e45] [cursor=pointer]
      - button "Learning settings" [ref=f1e50] [cursor=pointer]
      - button "About & demo guide" [ref=f1e55] [cursor=pointer]
    - generic [ref=f1e59]:
      - generic [ref=f1e60]: Guest demo · server-side scoring
      - button "Faculty guest" [ref=f1e62] [cursor=pointer]
      - button "Reset guest session" [ref=f1e63] [cursor=pointer]
  - generic [ref=f1e64]:
    - banner [ref=f1e65]:
      - generic [ref=f1e66]: Laboratory
      - group "Langue / Language" [ref=f1e67]:
        - button "Français" [ref=f1e68] [cursor=pointer]: FR
        - button "English" [pressed] [ref=f1e69] [cursor=pointer]: EN
      - generic [ref=f1e70]: Guest laboratory
    - main [ref=f1e75]:
      - button "← All laboratories" [ref=f1e76] [cursor=pointer]
      - generic [ref=f1e77]:
        - generic [ref=f1e78]: BIOCHEMISTRY
        - heading "Clinical Biochemistry Lab" [active] [level=1] [ref=f1e79]
        - paragraph [ref=f1e80]: Interpret organ panels, spot interference and read acid-base status.
      - generic [ref=f1e81]:
        - generic [ref=f1e86]:
          - generic [ref=f1e87]: Missions
          - strong [ref=f1e88]: 0 of 3
          - generic [ref=f1e89]: Completed in this laboratory
        - generic [ref=f1e98]:
          - generic [ref=f1e99]: Code fragments
          - strong [ref=f1e100]: 0 of 3
          - generic [ref=f1e101]: Found by completing missions
      - region [ref=f1e102]:
        - generic [ref=f1e103]: MISSION PICKER
        - heading "Choose a mission" [level=2] [ref=f1e104]
        - list [ref=f1e105]:
          - listitem [ref=f1e106]:
            - generic [aria-hidden] [ref=f1e107]: "01"
            - generic [ref=f1e108]:
              - heading "Organ Rescue Mission" [level=3] [ref=f1e109]
              - paragraph [ref=f1e110]: "Work through the case · Difficulty: Intermediate · about 8 min"
              - paragraph [ref=f1e111]: Ready
            - button "Start Organ Rescue Mission" [ref=f1e112] [cursor=pointer]: Start
          - listitem [ref=f1e113]:
            - generic [aria-hidden] [ref=f1e114]: "02"
            - generic [ref=f1e115]:
              - heading "Lab Value Hacker" [level=3] [ref=f1e116]
              - paragraph [ref=f1e117]: "Spot the finding · Difficulty: Intermediate · about 4 min"
              - paragraph [ref=f1e118]: Complete mission 01 to unlock
            - button "Locked Lab Value Hacker" [disabled] [ref=f1e119]: Locked
          - listitem [ref=f1e124]:
            - generic [aria-hidden] [ref=f1e125]: "03"
            - generic [ref=f1e126]:
              - heading "Acid-Base Emergency" [level=3] [ref=f1e127]
              - paragraph [ref=f1e128]: "Work through the case · Difficulty: Advanced · about 10 min"
              - paragraph [ref=f1e129]: Complete mission 02 to unlock
            - button "Locked Acid-Base Emergency" [disabled] [ref=f1e130]: Locked
```

# Test source

```ts
  1   | import { DatabaseSync } from 'node:sqlite';
  2   | import { expect, type Locator, type Page } from '@playwright/test';
  3   | 
  4   | export const API = 'http://localhost:3000/api';
  5   | export const TOKEN_KEY = 'escape-demo-token';
  6   | export const ATTEMPT_KEY = 'escape-demo-attempt';
  7   | 
  8   | /** Landmarks measured on the shipped artwork, in artwork pixels (not copied from any server key). */
  9   | export const ARTWORK = {
  10  |   smear: { width: 1672, height: 941, x: 1230, y: 440, what: 'the schistocyte' },
  11  |   panel: { width: 1600, height: 900, x: 880, y: 395, what: 'the potassium result' },
  12  | };
  13  | 
  14  | /** The dashboard heading depends on the learner: a fresh one is invited to start, one with progress to continue. */
  15  | export const FIRST_VISIT_HEADING = /Choose a laboratory/;
  16  | export const CONTINUE_HEADING = /Choose a laboratory/;
  17  | export const HOME_HEADING = /Choose a laboratory/;
  18  | export const homeHeading = (page: Page) => page.getByRole('heading', { name: HOME_HEADING });
  19  | 
  20  | /** Follow the visible game navigation. Secondary screens live in the phone menu, never behind a hidden click. */
  21  | export async function navigateSection(page: Page, name: string, touch = false) {
  22  |   const labels: Record<string, string> = { Investigations: 'Rooms', Progress: 'Vault', Enquêtes: 'Salles', Progression: 'Coffre' };
  23  |   const target = page.getByRole('button', { name: labels[name] ?? name, exact: true });
  24  |   const menu = page.getByRole('button', { name: /^(Guest options|Options invité)$/ });
  25  |   if (!await target.isVisible() && await menu.isVisible()) {
  26  |     if (await menu.getAttribute('aria-expanded') !== 'true') { if (touch) await menu.tap(); else await menu.click(); }
  27  |   }
  28  |   await expect(target).toBeVisible();
  29  |   if (touch) await target.tap(); else await target.click();
  30  | }
  31  | 
  32  | /** The three decision options as the learner reads them (the backend's authored labels; the option ids are never shown). */
  33  | export const DECISION = { accept: /Accept and report/, reject: /Reject and request a new sample/, repeat: /Correct the interference and re-measure/ };
  34  | 
  35  | export async function sessionToken(page: Page): Promise<string> {
  36  |   await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), TOKEN_KEY)).toBeTruthy();
  37  |   return (await page.evaluate((k) => sessionStorage.getItem(k), TOKEN_KEY))!;
  38  | }
  39  | 
  40  | /** Direct API call from the test process, authenticated like the page (never from app code). */
  41  | export async function apiCall(token: string | null, path: string, init: { method?: string; body?: unknown } = {}) {
  42  |   const response = await fetch(`${API}${path}`, {
  43  |     method: init.method ?? 'GET',
  44  |     headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
  45  |     body: init.body === undefined ? undefined : JSON.stringify(init.body),
  46  |   });
  47  |   const text = await response.text();
  48  |   return { status: response.status, body: text ? JSON.parse(text) : undefined };
  49  | }
  50  | 
  51  | /** Opens the app and waits until the guest session exists. */
  52  | export async function openHome(page: Page) {
  53  |   await page.goto('/');
  54  |   await expect(homeHeading(page)).toBeVisible();
  55  | }
  56  | 
  57  | /** Restores the demo guest to the prepared state and reloads the app. */
  58  | export async function resetDemo(page: Page) {
  59  |   await page.goto('/');
  60  |   const token = await sessionToken(page);
  61  |   await page.evaluate((k) => sessionStorage.removeItem(k), ATTEMPT_KEY);
  62  |   const reset = await apiCall(token, '/demo/reset', { method: 'POST' });
  63  |   expect(reset.status).toBe(200);
  64  |   await page.reload();
  65  |   await expect(homeHeading(page)).toBeVisible();
  66  |   return token;
  67  | }
  68  | 
  69  | let registrations = 0;
  70  | /** Registers a throwaway learner (the e2e API allows 40 registrations per hour per address; the budget is guarded). */
  71  | export async function freshStudent(): Promise<string> {
  72  |   registrations += 1;
  73  |   if (registrations > 30) throw new Error('E2E registration budget exhausted: reuse an existing fresh learner.');
  74  |   const email = `e2e-${Date.now()}-${registrations}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  75  |   const reply = await apiCall(null, '/auth/register', { method: 'POST', body: { name: 'E2E Learner', email, password: 'e2e learner password 1' } });
  76  |   expect(reply.status).toBe(201);
  77  |   return reply.body.token as string;
  78  | }
  79  | 
  80  | /** Opens the app signed in as an existing bearer (no demo login). */
  81  | export async function openAs(page: Page, token: string) {
  82  |   await page.addInitScript(([k, a, t]) => {
  83  |     // Switching learner: drop the previous learner's attempt pointer once, keep this bearer on every load.
  84  |     if (sessionStorage.getItem(k) !== t) { sessionStorage.setItem(k, t); sessionStorage.removeItem(a); }
  85  |   }, [TOKEN_KEY, ATTEMPT_KEY, token] as const);
  86  |   await page.goto('/');
  87  |   await expect(homeHeading(page)).toBeVisible();
  88  | }
  89  | 
  90  | /** Starts a mission through the real lab lobby UI. */
  91  | export async function startMissionViaUi(page: Page, labName: RegExp | string, missionTitle: string) {
  92  |   await navigateSection(page, 'Lab map');
  93  |   await page.getByRole('button', { name: new RegExp(`^(Enter|Review) ${typeof labName === 'string' ? labName : labName.source}`) }).click();
  94  |   await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
> 95  |   await page.getByRole('button', { name: new RegExp(`^(Start|Resume|Replay) ${missionTitle}$`) }).click();
      |                                                                                                   ^ Error: locator.click: Test timeout of 30000ms exceeded.
  96  |   await expect(page.locator('.case-panel h1')).toBeVisible();
  97  | }
  98  | 
  99  | export const submit = (page: Page) => page.getByRole('button', { name: /Submit answer|Checking…/ });
  100 | 
  101 | /** The learner reads the server-confirmed correction, then explicitly opens the saved next step. */
  102 | export async function continueStep(page: Page) {
  103 |   await expect(page.locator('.step-review')).toBeVisible();
  104 |   await page.getByRole('button', { name: /^(Continue|Continuer)$/ }).click();
  105 |   await expect(page.locator('.step-review')).toHaveCount(0);
  106 | }
  107 | 
  108 | /** Click the visible feature of an artwork, computed from the rendered image rectangle. */
  109 | export async function clickArtwork(page: Page, art: { width: number; height: number; x: number; y: number }, offset = { x: 0, y: 0 }) {
  110 |   const image = page.locator('.scientific-image');
  111 |   const box = (await image.boundingBox())!;
  112 |   expect(box).not.toBeNull();
  113 |   // The image must be undistorted: rendered ratio == natural ratio.
  114 |   expect(Math.abs(box.width / box.height - art.width / art.height)).toBeLessThan(0.01);
  115 |   await page.locator('.scientific').click({ position: { x: (box.width * art.x) / art.width + offset.x, y: (box.height * art.y) / art.height + offset.y } });
  116 | }
  117 | 
  118 | /** Makes a real attempt run past its time limit by moving its start into the past (the server then reports it expired). */
  119 | export function expireAttemptInDb(attemptId: string) {
  120 |   const db = new DatabaseSync(process.env.E2E_DB_PATH!);
  121 |   try {
  122 |     db.exec('PRAGMA busy_timeout = 5000');
  123 |     const changed = db.prepare('UPDATE attempts SET started_at = started_at - 7200000 WHERE id = ? AND status = ?').run(attemptId, 'in_progress').changes;
  124 |     expect(Number(changed)).toBe(1);
  125 |   } finally {
  126 |     db.close();
  127 |   }
  128 | }
  129 | 
  130 | import { MISSION_BY_ID, correctResponse, exitCode, missionsOf } from './content';
  131 | 
  132 | /** Plays one mission to completion through the public API (test preparation only). */
  133 | export async function completeMissionViaApi(token: string, missionId: string) {
  134 |   const started = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  135 |   expect([200, 201]).toContain(started.status);
  136 |   let attempt = started.body.attempt;
  137 |   for (const step of MISSION_BY_ID.get(missionId)!.steps) {
  138 |     const answered = await apiCall(token, `/attempts/${attempt.attemptId}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
  139 |     expect(answered.status).toBe(200);
  140 |     attempt = answered.body.attempt;
  141 |   }
  142 | }
  143 | 
  144 | /** Completes every mission of a lab and, optionally, opens its exit with the real code. */
  145 | export async function completeLabViaApi(token: string, slug: string, unlock = true) {
  146 |   for (const m of missionsOf(slug)) await completeMissionViaApi(token, m.id);
  147 |   if (unlock) {
  148 |     const reply = await apiCall(token, `/labs/${slug}/unlock`, { method: 'POST', body: { code: exitCode(slug) } });
  149 |     expect(reply.status).toBe(200);
  150 |   }
  151 | }
  152 | 
  153 | /** Reorders the visible list with the real Move up buttons until it matches `labels`. */
  154 | export async function arrangeOrder(page: Page, labels: string[]) {
  155 |   const rows = page.locator('.drag-row b');
  156 |   for (let target = 0; target < labels.length; target += 1) {
  157 |     for (let guard = 0; guard < 10; guard += 1) {
  158 |       const current = await rows.allTextContents();
  159 |       const at = current.indexOf(labels[target]!);
  160 |       if (at <= target) break;
  161 |       await page.getByRole('button', { name: `Move up: ${labels[target]}` }).click();
  162 |     }
  163 |   }
  164 |   expect(await rows.allTextContents()).toEqual(labels);
  165 | }
  166 | 
  167 | export const caseStatus = (page: Page, label: string) => page.locator('.status-row').filter({ hasText: label }).locator('dd');
  168 | 
  169 | /** Selects the authored correct option of a choice/decision step in the UI. */
  170 | export async function chooseCorrectOption(page: Page, missionId: string, stepIndex: number) {
  171 |   const step = MISSION_BY_ID.get(missionId)!.steps[stepIndex]!;
  172 |   const key = step.key as { answer: string };
  173 |   const options = step.data.options ?? [{ id: 'accept', label: 'Accept and report' }, { id: 'reject', label: 'Reject and request a new sample' }, { id: 'repeat', label: 'Correct the interference and re-measure' }];
  174 |   const label = options.find((o) => o.id === key.answer)!.label;
  175 |   await page.locator('.answer-options button').filter({ hasText: label }).first().click();
  176 | }
  177 | 
  178 | export const AXE_TAGS = undefined;
  179 | 
  180 | import type { Route } from '@playwright/test';
  181 | 
  182 | export const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  183 | export const serverError = (message = 'Temporary outage') => json(500, { error: { code: 'internal_error', message } });
  184 | 
  185 | /** Fails matching requests until `lift()` is called. Pages mount effects twice in dev, so a one-shot failure would be lost. */
  186 | export async function outage(page: Page, glob: string | RegExp, response = serverError(), method = 'GET') {
  187 |   let down = true;
  188 |   await page.route(glob, (route) => (down && route.request().method() === method ? route.fulfill(response) : route.continue()));
  189 |   return { lift: () => { down = false; } };
  190 | }
  191 | 
  192 | /**
  193 |  * Holds matching requests until `release()` is called, so the loading state can be observed deterministically
  194 |  * (event-based: no clock involved). Pass `ms` only for a test that deliberately never releases.
  195 |  */
```