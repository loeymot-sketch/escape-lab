// Text readability on the dark theme: every selector below is body text or a heading that the 2026-10-14 visual audit found
// unreadable (light-palette colours left on the dark background). axe cannot measure these surfaces (gradients, images), so the
// contrast is computed here from the rendered colours against the nearest opaque ancestor background, falling back to the page base.
import { expect, test, type Page } from '@playwright/test';
import { completeLabViaApi, navigateSection, openFaculty, resetDemo, sessionToken } from './support/helpers';

const PAGE_BASE = [6, 21, 34]; // #061522, the app's base background behind every translucent panel.

/** Minimum WCAG AA contrast of the text of every visible element matching `selector` against the surface behind it. */
async function textContrast(page: Page, selector: string) {
  return page.evaluate(({ sel, base }) => {
    const parse = (css: string) => { const m = (css.match(/[\d.]+/g) ?? []).map(Number); return { r: m[0] ?? 0, g: m[1] ?? 0, b: m[2] ?? 0, a: m[3] ?? 1 }; };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    const surface = (el: Element) => {
      let color = { r: base[0]!, g: base[1]!, b: base[2]! };
      const chain: ReturnType<typeof parse>[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) chain.push(parse(getComputedStyle(n).backgroundColor));
      for (const layer of chain.reverse()) color = { r: layer.r * layer.a + color.r * (1 - layer.a), g: layer.g * layer.a + color.g * (1 - layer.a), b: layer.b * layer.a + color.b * (1 - layer.a) };
      return color;
    };
    return Array.from(document.querySelectorAll<HTMLElement>(sel))
      .map((el) => ({ el, content: (el instanceof HTMLInputElement ? el.value : el.textContent ?? '').trim() }))
      .filter(({ el, content }) => el.getClientRects().length > 0 && content.length > 0)
      .map(({ el, content }) => {
        const text = parse(getComputedStyle(el).color);
        const [hi, lo] = [lum(text), lum(surface(el))].sort((x, y) => y - x);
        return { label: content.slice(0, 40), color: getComputedStyle(el).color, ratio: Number(((hi! + 0.05) / (lo! + 0.05)).toFixed(2)) };
      });
  }, { sel: selector, base: PAGE_BASE });
}

async function readable(page: Page, selector: string, minimum = 4.5) {
  const measured = await textContrast(page, selector);
  expect(measured.length, `no visible text matched ${selector}`).toBeGreaterThan(0);
  const weak = measured.filter((m) => m.ratio < minimum).map((m) => `${selector} "${m.label}" ${m.color} = ${m.ratio}:1`);
  expect(weak, `${selector} must read at ${minimum}:1 on the dark theme`).toEqual([]);
}

test.describe('dark-theme readability', () => {
  test('Lab results: mission rows, competency labels and insights', async ({ page }) => {
    await resetDemo(page);
    await navigateSection(page, 'Lab results');
    await expect(page.getByRole('heading', { name: 'Lab results' })).toBeVisible();
    // The results of each escaped lab load after the heading: wait for the first card before measuring.
    await expect(page.locator('.result-lab .mission-row').first()).toBeVisible();
    await readable(page, '.result-lab .mission-row > span');
    await readable(page, '.result-lab .mission-row small');
    await readable(page, '.result-lab .bar-row > span');
    await readable(page, '.result-lab .insight');
  });

  test('Faculty: mission signal, roster, student detail and content review', async ({ page }) => {
    await resetDemo(page);
    await openFaculty(page);
    await expect(page.locator('.mission-signal').first()).toBeVisible();
    await expect(page.locator('button.mission-row').first()).toBeVisible();
    await readable(page, '.faculty-demo-note');
    await readable(page, '.mission-signal > span');
    await readable(page, '.mission-signal .sample-size');
    await readable(page, 'button.mission-row > span');
    await readable(page, 'button.mission-row small');
    await navigateSection(page, 'Student detail');
    await expect(page.getByRole('heading', { name: 'Student detail' })).toBeVisible();
    await expect(page.locator('.bar-row').first()).toBeVisible();
    await expect(page.locator('.mission-row').first()).toBeVisible();
    await readable(page, '.bar-row > span');
    await readable(page, '.bar-row small');
    await readable(page, '.insight');
    await readable(page, '.mission-row > span');
    await navigateSection(page, 'Content review');
    await expect(page.locator('.content-row').first()).toBeVisible();
    await readable(page, '.content-title b');
    await readable(page, '.review-trail');
    await readable(page, '.content-row > span');
  });

  test('About & demo guide: title, section headings, lede and quality points', async ({ page }) => {
    await resetDemo(page);
    await navigateSection(page, 'About & demo guide');
    await readable(page, '.about-head h1');
    await readable(page, '.about-principle');
    await readable(page, '.about-lede');
    await readable(page, '.about-section h2');
    await readable(page, '.about-intro');
    await readable(page, '.about-points dt');
    await readable(page, '.about-points dd');
    await readable(page, '.about-loop-note');
  });

  test('Learning settings and the vault unlock input', async ({ page }) => {
    await resetDemo(page);
    await navigateSection(page, 'Learning settings');
    await readable(page, '.setting-row > span');
    const token = await sessionToken(page);
    await completeLabViaApi(token, 'microbiology', false);
    await navigateSection(page, 'Vault');
    const input = page.locator('.unlock-row input').first();
    await expect(input).toBeVisible();
    await input.fill('12');
    await readable(page, '.unlock-row input');
  });
});
