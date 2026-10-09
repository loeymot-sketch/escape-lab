import { DatabaseSync } from 'node:sqlite';
import { expect, type Locator, type Page } from '@playwright/test';

export const API = 'http://localhost:3000/api';
export const TOKEN_KEY = 'escape-demo-token';
export const ATTEMPT_KEY = 'escape-demo-attempt';

/** Landmarks measured on the shipped artwork, in artwork pixels (not copied from any server key). */
export const ARTWORK = {
  smear: { width: 1672, height: 941, x: 1230, y: 440, what: 'the schistocyte' },
  panel: { width: 1600, height: 900, x: 880, y: 395, what: 'the potassium result' },
};

/** The dashboard heading depends on the learner: a fresh one is invited to start, one with progress to continue. */
export const FIRST_VISIT_HEADING = /Choose your first investigation/;
export const CONTINUE_HEADING = /Continue your investigations/;
export const HOME_HEADING = /Choose your first investigation|Continue your investigations|All investigations complete/;
export const homeHeading = (page: Page) => page.getByRole('heading', { name: HOME_HEADING });

/** The three decision options as the learner reads them (the backend's authored labels; the option ids are never shown). */
export const DECISION = { accept: /Accept and report/, reject: /Reject and request a new sample/, repeat: /Correct the interference and re-measure/ };

export async function sessionToken(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), TOKEN_KEY)).toBeTruthy();
  return (await page.evaluate((k) => sessionStorage.getItem(k), TOKEN_KEY))!;
}

/** Direct API call from the test process, authenticated like the page (never from app code). */
export async function apiCall(token: string | null, path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

/** Opens the app and waits until the guest session exists. */
export async function openHome(page: Page) {
  await page.goto('/');
  await expect(homeHeading(page)).toBeVisible();
}

/** Restores the demo guest to the prepared state and reloads the app. */
export async function resetDemo(page: Page) {
  await page.goto('/');
  const token = await sessionToken(page);
  await page.evaluate((k) => sessionStorage.removeItem(k), ATTEMPT_KEY);
  const reset = await apiCall(token, '/demo/reset', { method: 'POST' });
  expect(reset.status).toBe(200);
  await page.reload();
  await expect(homeHeading(page)).toBeVisible();
  return token;
}

let registrations = 0;
/** Registers a throwaway learner (the e2e API allows 40 registrations per hour per address; the budget is guarded). */
export async function freshStudent(): Promise<string> {
  registrations += 1;
  if (registrations > 30) throw new Error('E2E registration budget exhausted: reuse an existing fresh learner.');
  const email = `e2e-${Date.now()}-${registrations}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const reply = await apiCall(null, '/auth/register', { method: 'POST', body: { name: 'E2E Learner', email, password: 'e2e learner password 1' } });
  expect(reply.status).toBe(201);
  return reply.body.token as string;
}

/** Opens the app signed in as an existing bearer (no demo login). */
export async function openAs(page: Page, token: string) {
  await page.addInitScript(([k, a, t]) => {
    // Switching learner: drop the previous learner's attempt pointer once, keep this bearer on every load.
    if (sessionStorage.getItem(k) !== t) { sessionStorage.setItem(k, t); sessionStorage.removeItem(a); }
  }, [TOKEN_KEY, ATTEMPT_KEY, token] as const);
  await page.goto('/');
  await expect(homeHeading(page)).toBeVisible();
}

/** Starts a mission through the real lab lobby UI. */
export async function startMissionViaUi(page: Page, labName: RegExp | string, missionTitle: string) {
  await page.getByRole('button', { name: 'Lab map' }).click();
  await page.getByRole('button', { name: new RegExp(`^(Enter|Review) ${typeof labName === 'string' ? labName : labName.source}`) }).click();
  await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^(Start|Resume|Replay) ${missionTitle}$`) }).click();
  await expect(page.locator('.case-panel h1')).toBeVisible();
}

export const submit = (page: Page) => page.getByRole('button', { name: /Submit answer|Checking…/ });

/** Click the visible feature of an artwork, computed from the rendered image rectangle. */
export async function clickArtwork(page: Page, art: { width: number; height: number; x: number; y: number }, offset = { x: 0, y: 0 }) {
  const image = page.locator('.scientific-image');
  const box = (await image.boundingBox())!;
  expect(box).not.toBeNull();
  // The image must be undistorted: rendered ratio == natural ratio.
  expect(Math.abs(box.width / box.height - art.width / art.height)).toBeLessThan(0.01);
  await page.locator('.scientific').click({ position: { x: (box.width * art.x) / art.width + offset.x, y: (box.height * art.y) / art.height + offset.y } });
}

/** Makes a real attempt run past its time limit by moving its start into the past (the server then reports it expired). */
export function expireAttemptInDb(attemptId: string) {
  const db = new DatabaseSync(process.env.E2E_DB_PATH!);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const changed = db.prepare('UPDATE attempts SET started_at = started_at - 7200000 WHERE id = ? AND status = ?').run(attemptId, 'in_progress').changes;
    expect(Number(changed)).toBe(1);
  } finally {
    db.close();
  }
}

import { MISSION_BY_ID, correctResponse, exitCode, missionsOf } from './content';

/** Plays one mission to completion through the public API (test preparation only). */
export async function completeMissionViaApi(token: string, missionId: string) {
  const started = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  expect([200, 201]).toContain(started.status);
  let attempt = started.body.attempt;
  for (const step of MISSION_BY_ID.get(missionId)!.steps) {
    const answered = await apiCall(token, `/attempts/${attempt.attemptId}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
    expect(answered.status).toBe(200);
    attempt = answered.body.attempt;
  }
}

/** Completes every mission of a lab and, optionally, opens its exit with the real code. */
export async function completeLabViaApi(token: string, slug: string, unlock = true) {
  for (const m of missionsOf(slug)) await completeMissionViaApi(token, m.id);
  if (unlock) {
    const reply = await apiCall(token, `/labs/${slug}/unlock`, { method: 'POST', body: { code: exitCode(slug) } });
    expect(reply.status).toBe(200);
  }
}

/** Reorders the visible list with the real Move up buttons until it matches `labels`. */
export async function arrangeOrder(page: Page, labels: string[]) {
  const rows = page.locator('.drag-row b');
  for (let target = 0; target < labels.length; target += 1) {
    for (let guard = 0; guard < 10; guard += 1) {
      const current = await rows.allTextContents();
      const at = current.indexOf(labels[target]!);
      if (at <= target) break;
      await page.getByRole('button', { name: `Move up: ${labels[target]}` }).click();
    }
  }
  expect(await rows.allTextContents()).toEqual(labels);
}

export const caseStatus = (page: Page, label: string) => page.locator('.status-row').filter({ hasText: label }).locator('dd');

/** Selects the authored correct option of a choice/decision step in the UI. */
export async function chooseCorrectOption(page: Page, missionId: string, stepIndex: number) {
  const step = MISSION_BY_ID.get(missionId)!.steps[stepIndex]!;
  const key = step.key as { answer: string };
  const options = step.data.options ?? [{ id: 'accept', label: 'Accept and report' }, { id: 'reject', label: 'Reject and request a new sample' }, { id: 'repeat', label: 'Correct the interference and re-measure' }];
  const label = options.find((o) => o.id === key.answer)!.label;
  await page.locator('.answer-options button').filter({ hasText: label }).first().click();
}

export const AXE_TAGS = undefined;

import type { Route } from '@playwright/test';

export const json = (status: number, body: unknown) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
export const serverError = (message = 'Temporary outage') => json(500, { error: { code: 'internal_error', message } });

/** Fails matching requests until `lift()` is called. Pages mount effects twice in dev, so a one-shot failure would be lost. */
export async function outage(page: Page, glob: string | RegExp, response = serverError(), method = 'GET') {
  let down = true;
  await page.route(glob, (route) => (down && route.request().method() === method ? route.fulfill(response) : route.continue()));
  return { lift: () => { down = false; } };
}

/**
 * Holds matching requests until `release()` is called, so the loading state can be observed deterministically
 * (event-based: no clock involved). Pass `ms` only for a test that deliberately never releases.
 */
export async function slow(page: Page, glob: string | RegExp, ms?: number) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(glob, async (route) => {
    await (ms === undefined ? gate : Promise.race([gate, new Promise((r) => setTimeout(r, ms))]));
    await route.continue();
  });
  return { release };
}

/** Lets the page process everything that has already been delivered to it (two animation frames), for assertions that something did NOT happen. */
export const settle = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/** Real response, patched by the test. */
export async function patched(route: Route, patch: (body: any) => unknown) {
  try {
    const response = await route.fetch();
    await route.fulfill({ response, json: patch(await response.json()) });
  } catch (error) {
    // A request still in flight when the test (or its page) ends is aborted by Playwright and would be reported against
    // the next test: that is test hygiene, not a product failure. Every other error is rethrown.
    if (/Test ended|has been closed|Target closed/i.test(String(error))) return;
    throw error;
  }
}

export async function openFaculty(page: Page) {
  await page.getByRole('button', { name: 'Faculty guest' }).click();
  await expect(page.getByRole('heading', { name: 'Class intelligence' })).toBeVisible();
}

export async function teacherToken(): Promise<string> {
  const login = await apiCall(null, '/auth/demo', { method: 'POST', body: { role: 'teacher' } });
  expect(login.status).toBe(200);
  return login.body.token as string;
}

export type ContentStatus = 'draft' | 'reviewed' | 'approved';

/** Puts a mission's review status in a known state through the API, so a content test never depends on what an earlier test left. */
export async function prepareContentStatus(missionId: string, status: ContentStatus) {
  const teacher = await teacherToken();
  // The server only allows draft -> reviewed -> approved -> draft: walk that cycle from wherever the mission currently is.
  const next: Record<ContentStatus, ContentStatus> = { draft: 'reviewed', reviewed: 'approved', approved: 'draft' };
  const list = await apiCall(teacher, '/content/missions');
  expect(list.status).toBe(200);
  let current = (list.body.missions as { missionId: string; status: ContentStatus }[]).find((m) => m.missionId === missionId)!.status;
  for (let guard = 0; current !== status && guard < 3; guard++) {
    const step = next[current];
    const reply = await apiCall(teacher, `/content/missions/${missionId}/status`, { method: 'PUT', body: { status: step } });
    expect(reply.status).toBe(200);
    current = reply.body.status;
  }
  expect(current).toBe(status);
}

/** The status pill of a content row (never getByText: the action buttons carry the same words). */
export const statusPill = (row: Locator) => row.locator('.status-pill');

/** Clicks a content-review action, waits for the server's PUT to succeed, then asserts the pill shows what the server stored. */
export async function moveContent(page: Page, row: Locator, action: 'Mark reviewed' | 'Approve' | 'Return to draft', expected: ContentStatus, how: 'click' | 'tap' = 'click') {
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/content\/missions\/[^/]+\/status$/.test(r.url()));
  const button = row.getByRole('button', { name: action, exact: true });
  if (how === 'tap') await button.tap(); else await button.click();
  expect((await saved).status()).toBe(200);
  await expect(statusPill(row)).toHaveText(expected.charAt(0).toUpperCase() + expected.slice(1));
}

/** Starts a mission through the API (answering the steps before `stepIndex` correctly), points the page at that attempt and reloads. */
export async function openAttemptAt(page: Page, missionId: string, stepIndex = 0) {
  const token = await sessionToken(page);
  const started = await apiCall(token, `/missions/${missionId}/start`, { method: 'POST' });
  expect([200, 201]).toContain(started.status);
  const attemptId = started.body.attempt.attemptId as string;
  for (const step of MISSION_BY_ID.get(missionId)!.steps.slice(0, stepIndex)) {
    const answered = await apiCall(token, `/attempts/${attemptId}/answer`, { method: 'POST', body: { stepId: step.id, response: correctResponse(step.key as never) } });
    expect(answered.status).toBe(200);
  }
  await page.evaluate(([k, id]) => sessionStorage.setItem(k!, id!), [ATTEMPT_KEY, attemptId]);
  await page.reload();
  await expect(page.locator('.case-panel h1')).toBeVisible();
  return attemptId;
}

/** Collects console errors, page errors and 4xx/5xx responses so a test can assert that a flow was clean. */
export function watchProblems(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e)}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
  return problems;
}
