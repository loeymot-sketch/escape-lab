// Smoke subset against the PRODUCTION bundle (`vite build` + `vite preview`, see playwright.config.ts): minified
// code, hashed assets, no dev server and no StrictMode double effects. Landing, a mission, its result, and the
// refusal to start when the bundle was built without an API address.
import { expect, test } from '@playwright/test';
import { ARTWORK, apiCall, clickArtwork, resetDemo, sessionToken, startMissionViaUi, submit, HOME_HEADING } from './support/helpers';

test.describe('production bundle', () => {
  test('landing: the served page is the built bundle, the hero is a small WebP, and every API call goes to the configured API', async ({ page }) => {
    const problems: string[] = [];
    const apiOrigins = new Set<string>();
    const requested: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
    page.on('request', (request) => {
      requested.push(request.url());
      if (request.url().includes('/api/')) apiOrigins.add(new URL(request.url()).origin);
    });
    const image = page.waitForResponse((response) => /labescape-investigation-hero-[\w-]+\.webp$/.test(response.url()));
    await resetDemo(page);

    // Built, hashed, minified assets: not the dev server.
    const scripts = await page.locator('script[src]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).getAttribute('src')));
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/^\/assets\/index-[\w-]+\.js$/);
    expect(requested.some((url) => url.includes('/@vite/') || url.includes('/src/'))).toBe(false);

    // The hero is the optimised WebP, decoded, labelled, and within the image budget.
    const hero = await image;
    expect(hero.headers()['content-type']).toContain('image/webp');
    expect(Number(hero.headers()['content-length'])).toBeLessThanOrEqual(300_000);
    const decoded = await page.locator('.hero-science img').evaluate((el) => ({ width: (el as HTMLImageElement).naturalWidth, alt: (el as HTMLImageElement).alt }));
    expect(decoded.width).toBeGreaterThan(0);
    expect(decoded.alt).toContain('Illustrative');
    await expect(page.locator('.hero-science .illustrative-tag')).toHaveText('Illustrative image');
    await expect(page.locator('.lab-strip .lab-card').first()).toBeVisible();
    // Smoke budget for the shipped bundle (the dev server's unbundled module graph says nothing about it); ~15x headroom.
    const domContentLoaded = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).domContentLoadedEventEnd);
    expect(domContentLoaded).toBeLessThan(3_000);

    expect([...apiOrigins]).toEqual(['http://localhost:3000']);
    expect(problems).toEqual([]);
  });

  test('a mission: wrong answer, right answer, and a result that equals the server record', async ({ page }) => {
    await resetDemo(page);
    await startMissionViaUi(page, 'Hematology Lab', 'Blood Smear Code');
    await expect(page.locator('.case-meta + .scenario-note')).toHaveText('Educational scenario — not clinical guidance');
    await page.locator('.scientific').click({ position: { x: 20, y: 20 } });
    await submit(page).click();
    await expect(page.getByRole('alert')).toContainText('Not quite.');
    const id = (await page.evaluate(() => sessionStorage.getItem('escape-demo-attempt')))!;
    await clickArtwork(page, ARTWORK.smear);
    await submit(page).click();
    await expect(page.getByRole('heading', { name: 'Investigation complete.' })).toBeVisible();
    const stored = (await apiCall(await sessionToken(page), `/attempts/${id}/result`)).body as { score: number; maxScore: number };
    await expect(page.locator('.result-stats .stat').first().locator('strong')).toHaveText(`${stored.score} of ${stored.maxScore} XP`);
    await expect(page.getByText('Server-calculated')).toBeVisible();
  });

  test('a bundle built without VITE_API_URL refuses to start with a clear alert and calls no API', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/') || request.url().includes('localhost:3000')) calls.push(request.url()); });
    await page.goto('http://127.0.0.1:4174/');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Escape Lab is not configured');
    await expect(alert).toContainText('VITE_API_URL');
    await expect(page.getByRole('heading', { name: HOME_HEADING })).toHaveCount(0);
    expect(calls).toEqual([]);
  });
});
