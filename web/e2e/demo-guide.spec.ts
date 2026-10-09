import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ATTEMPT_KEY, homeHeading, openFaculty, resetDemo, watchProblems } from './support/helpers';
import { auditPage } from './support/audit';

// The About & demo guide: a static page for both roles, reachable from the section navigation, presentation-ready in 5 to 7 minutes.
// The phone-menu checks live in mobile.spec.ts (the mobile-iphone13 project only runs that file).
const ABOUT = 'About & demo guide';
const navAbout = (page: Page) => page.getByRole('button', { name: ABOUT, exact: true });
const aboutHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'About Escape Lab' });
const mainText = (page: Page) => page.locator('main').innerText();
const VIEWPORTS = [[320, 700], [375, 812], [768, 1024], [1440, 900]] as const;

async function openAbout(page: Page) {
  await navAbout(page).click();
  await expect(aboutHeading(page)).toBeVisible();
}
async function openAboutAsFaculty(page: Page) {
  await resetDemo(page);
  await openFaculty(page);
  await openAbout(page);
}
async function noHorizontalScroll(page: Page, label: string) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll, `${label} overflows horizontally`).toBeLessThanOrEqual(m.client);
}
async function axeClean(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`)), label).toEqual([]);
}

test.describe('About & demo guide: reach it', () => {
  test('a student reaches it from the sidebar; it is the current page, focuses its heading and names the tab', async ({ page }) => {
    await resetDemo(page);
    await expect(navAbout(page)).toBeVisible();
    await openAbout(page);
    await expect(navAbout(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav [aria-current="page"]')).toHaveCount(1);
    await expect(page).toHaveTitle('About & demo guide · Escape Lab');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(aboutHeading(page)).toBeFocused();
    await expect(page.locator('header .crumb')).toHaveText('About & demo guide');
    // Leaving moves the current-page mark away again.
    await page.getByRole('button', { name: 'Lab map', exact: true }).click();
    await expect(navAbout(page)).not.toHaveAttribute('aria-current', 'page');
  });

  test('a faculty guest reaches it from the sidebar too, next to the faculty sections', async ({ page }) => {
    await resetDemo(page);
    await openFaculty(page);
    for (const name of ['Faculty', 'Student detail', 'Content review', ABOUT]) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lab map', exact: true })).toHaveCount(0);
    await openAbout(page);
    await expect(navAbout(page)).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('About & demo guide · Escape Lab');
    await expect(aboutHeading(page)).toBeFocused();
  });
});

test.describe('About & demo guide: content', () => {
  test('states the principle, the boundaries, the honest validation status and the planned roadmap', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    const text = await mainText(page);
    expect(text).toMatch(/serious game for biomedical laboratory training/i);
    expect(text).toContain('Biomedical education first. Technology supports learning.');
    expect(text).toContain('A replacement for teachers, laboratory placements, real laboratory practice or biomedical experts');
    expect(text).toContain('A diagnostic tool');
    expect(text).toContain('illustrative training material');
    expect(text).toContain('Technically verified locally');
    expect(text).toContain('Not yet biomedically validated');
    expect(text).toContain('qualified biomedical experts or educators');
    expect(text).toContain('All validation so far is local');
    expect(text).toContain('no independent human security or accessibility review');
    expect(text).toContain('Planned, not done');
    expect(text).toContain('Images in this prototype are presented as illustrative training material, not as clinical or diagnostic reference. Their provenance and licensing still have to be documented and reviewed before any teaching use. This is a teaching prototype, not a medical device or diagnostic tool.');
    expect(text).not.toMatch(/production[- ]ready/i);
    expect(text).not.toMatch(/\b\d+\s*(?:tests?|specs?)\b/i);
    // Headings: one h1, then h2 sections, then h3 cards, in order.
    const levels = await page.locator('main :is(h1,h2,h3)').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.reduce((previous, level) => { expect(level - previous, `heading jump ${previous} -> ${level}`).toBeLessThanOrEqual(1); return level; }, 1);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['What it is, and what it is not', 'A guided demonstration', 'How quality is assured', 'Scientific validation roadmap']);
  });

  test('lists the eight demonstration steps and five roadmap phases, all of them PLANNED', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    const steps = page.locator('.about-steps > li');
    await expect(steps).toHaveCount(8);
    await expect(steps.nth(0)).toContainText('You are here');
    await expect(steps.nth(2)).toContainText('Blood Smear Code');
    await expect(steps.nth(3)).toContainText('Fix the Sample');
    await expect(steps.nth(4)).toContainText('does not state the answer');
    await expect(steps.nth(4)).toContainText('The server records');
    for (let i = 0; i < 8; i += 1) await expect(steps.nth(i)).toContainText(/about \d+( min| s)/);
    const phases = page.locator('.about-roadmap > li');
    await expect(phases).toHaveCount(5);
    for (let i = 0; i < 5; i += 1) await expect(phases.nth(i)).toContainText('PLANNED');
    await expect(page.getByRole('list', { name: 'Proposed academic direction' }).locator('li')).toHaveText([/Create\s+Monastir/, /Observe & Learn\s+HEPL \/ Liège/, /Validate & Transfer\s+Monastir/]);
  });
});

test.describe('About & demo guide: the Open buttons use the real navigation', () => {
  test('a student: lab map, Hematology mission picker and Progress vault; no attempt is ever started from the page', async ({ page }) => {
    await resetDemo(page);
    const problems = watchProblems(page);
    await openAbout(page);
    await page.getByRole('button', { name: 'Open the lab map' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratory map' })).toBeVisible();
    await openAbout(page);
    // Both mission steps point at the Hematology lab; the first one is enough to prove where it lands.
    await page.getByRole('button', { name: 'Open the Hematology lab' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hematology Lab' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a mission' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Blood Smear Code/ })).toBeVisible();
    await openAbout(page);
    await page.getByRole('button', { name: 'Open the Hematology lab' }).nth(1).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Hematology Lab' })).toBeVisible();
    await openAbout(page);
    await page.getByRole('button', { name: 'Open the Progress vault' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Progress vault' })).toBeVisible();
    expect(await page.evaluate((k) => sessionStorage.getItem(k), ATTEMPT_KEY)).toBeNull();
    expect(problems).toEqual([]);
  });

  test('the last step jumps to the quality and roadmap sections and puts focus on their headings', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await page.getByRole('button', { name: 'Go to quality' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'How quality is assured' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'How quality is assured' })).toBeInViewport();
    await page.getByRole('button', { name: 'Go to roadmap' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Scientific validation roadmap' })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: 'Scientific validation roadmap' })).toBeInViewport();
  });

  test('the student guest is told how to reach the faculty step and is offered no faculty button', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    const faculty = page.locator('.about-steps > li').nth(6);
    await expect(faculty).toContainText('In the Faculty guest');
    await expect(faculty).toContainText('Faculty guest button');
    await expect(faculty.getByRole('button')).toHaveCount(0);
  });

  test('a faculty guest: analytics and Content review open; the student steps say which guest they need', async ({ page }) => {
    await openAboutAsFaculty(page);
    const steps = page.locator('.about-steps > li');
    for (const i of [1, 2, 3, 4, 5]) {
      await expect(steps.nth(i)).toContainText('In the student guest');
      await expect(steps.nth(i).getByRole('button')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Open Faculty analytics' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
    await openAbout(page);
    await page.getByRole('button', { name: 'Open Content review' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Content review' })).toBeVisible();
  });

  test('a reload leaves the app working (there is no URL routing: the dashboard returns) and the page opens again', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await page.reload();
    await expect(homeHeading(page)).toBeVisible();
    await openAbout(page);
    await expect(page.getByRole('button', { name: 'Open the lab map' })).toBeVisible();
  });
});

test.describe('About & demo guide: it is static', () => {
  test('visiting it issues no request at all, and it still opens with the API down', async ({ page }) => {
    await resetDemo(page);
    const seen: string[] = [];
    page.on('request', (r) => { seen.push(`${r.method()} ${r.url()}`); });
    await openAbout(page);
    await page.getByRole('button', { name: 'Go to roadmap' }).click();
    await page.waitForTimeout(600);
    expect(seen.filter((u) => u.includes('/api/')), 'requests issued while on the About page').toEqual([]);
    // Cut the API completely, then open the page from another screen: it renders from the bundle alone.
    await page.getByRole('button', { name: 'Lab map', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratory map' })).toBeVisible();
    await page.route('**/api/**', (route) => route.abort('connectionrefused'));
    await openAbout(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(4);
  });
});

test.describe('About & demo guide: roles and guest switching', () => {
  test('switching guest while on the page lands on the new guest\'s own home, with the same nav item available', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await page.getByRole('button', { name: 'Faculty guest' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lab map', exact: true })).toHaveCount(0);
    await expect(navAbout(page)).toBeVisible();
    await openAbout(page);
    await expect(page.getByRole('button', { name: 'Open Faculty analytics' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open the lab map' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Return to student demo' }).click();
    await expect(homeHeading(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Faculty analytics' })).toHaveCount(0);
    await openAbout(page);
    await expect(page.getByRole('button', { name: 'Open the lab map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Faculty analytics' })).toHaveCount(0);
  });

  test('resetting the guest from the page returns to the dashboard', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await page.getByRole('button', { name: 'Reset guest session' }).click();
    await page.getByRole('button', { name: 'Confirm reset' }).click();
    await expect(homeHeading(page)).toBeVisible();
  });
});

test.describe('About & demo guide: accessibility and layout', () => {
  for (const role of ['student', 'faculty'] as const) {
    test(`${role}: axe finds nothing and nothing scrolls sideways at 320, 375, 768 and 1440 px`, async ({ page }) => {
      await resetDemo(page);
      if (role === 'faculty') await openFaculty(page);
      await openAbout(page);
      for (const [width, height] of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        await expect(aboutHeading(page)).toBeVisible();
        await noHorizontalScroll(page, `${role} ${width}`);
        await axeClean(page, `${role} ${width}`);
        const audit = await auditPage(page);
        expect(audit.smallText, `${role} ${width} small text`).toEqual([]);
      }
    });
  }

  test('on a narrow screen every control is at least 44px tall and 40px wide', async ({ page }) => {
    await resetDemo(page);
    await page.setViewportSize({ width: 320, height: 700 });
    await openAbout(page);
    const audit = await auditPage(page, { minControl: 44 });
    expect(audit.smallControls).toEqual([]);
  });

  test('keyboard only: Tab walks the sidebar, then the page in reading order; Enter on an Open button navigates; focus is always visible', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await expect(aboutHeading(page)).toBeFocused();
    const expected = ['Open the lab map', 'Open the Hematology lab', 'Open the Hematology lab', 'Open the Progress vault', 'Go to quality', 'Go to roadmap'];
    const reached: string[] = [];
    for (let i = 0; i < 20 && reached.length < expected.length; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const cs = el ? getComputedStyle(el) : null;
        return { inMain: !!el?.closest('main'), name: el?.textContent?.replace(/\s+/g, ' ').trim() ?? '', outline: cs ? `${cs.outlineStyle} ${parseFloat(cs.outlineWidth)}` : '', visible: !!el && el.getClientRects().length > 0 };
      });
      expect(info.visible).toBe(true);
      if (info.inMain) {
        expect(info.outline, `focus ring on "${info.name}"`).toBe('solid 3');
        reached.push(info.name);
      }
    }
    expect(reached).toEqual(expected);
    // Shift+Tab goes back; Enter activates the button that has focus.
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Open the lab map' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratory map' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratory map' })).toBeFocused();
  });

  test('reduced motion: the page animates nothing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await resetDemo(page);
    await openAbout(page);
    const animated = await page.locator('.about, .about *').evaluateAll((els) => els.filter((e) => e.getAnimations().length > 0).length);
    expect(animated).toBe(0);
  });
});


// Round 16: honesty of the wording, the preparation block, the role-aware step 7 and the sticky sidebar.
test.describe('round 16: About & demo guide wording and layout', () => {
  test('R16-D-01: the page never presents the AI-agent audits as independent or external', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    const text = await mainText(page);
    expect(text).toContain('Repeated adversarial audits, carried out by AI review agents of the project team, tried to break the application. They are not an external or independent human review.');
    expect(text).toContain('no independent human security or accessibility review');
    for (const match of text.matchAll(/independent/gi)) expect(text.slice(Math.max(0, match.index! - 24), match.index! + 40).toLowerCase()).toMatch(/\b(no|not an external or) independent human/);
    expect(text).not.toMatch(/artwork/i);
  });

  for (const [width, height] of [[1440, 900], [375, 812]] as const) {
    test(`R16-D-02/03: a Before you present block opens the guide, steps 3 and 4 say replay (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await resetDemo(page);
      await openAbout(page);
      const block = page.getByRole('group', { name: 'Before you present' });
      await expect(block).toBeVisible();
      await expect(block).toContainText('Reset guest session');
      await expect(block).toContainText('Confirm reset');
      await expect(block).toContainText('Guest options');
      await expect(block).toContainText('Mark reviewed');
      await expect(block).toContainText('The Faculty-side reset is not available in the interface.');
      await expect(block).toContainText('level, XP and completed missions already exist');
      // It sits inside the guide section, above the first step.
      const order = await page.evaluate(() => {
        const b = document.querySelector('.about-prepare')!, first = document.querySelector('.about-steps')!, section = document.querySelector('[aria-labelledby="about-demo"]')!;
        return { inside: section.contains(b), before: !!(b.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING), modal: !!b.closest('[role="dialog"]') };
      });
      expect(order).toEqual({ inside: true, before: true, modal: false });
      const steps = page.locator('.about-steps > li');
      await expect(steps.nth(2)).toContainText('replay the mission Blood Smear Code');
      await expect(steps.nth(3)).toContainText('replay the mission Fix the Sample');
      await expect(steps.nth(3)).toContainText('in a new account Fix the Sample stays locked until Blood Smear Code is completed');
      await noHorizontalScroll(page, `prepare ${width}`);
      await axeClean(page, `prepare ${width}`);
    });
  }

  test('R16-D-04: the footer does not call the images artwork and says provenance and licensing are still to be documented', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await expect(page.locator('.about-foot')).toContainText('Their provenance and licensing still have to be documented and reviewed before any teaching use.');
    await expect(page.locator('.about-card.isnt')).toContainText('illustrative training material only');
  });

  test('R16-D-05: the academic loop is a proposed direction, not an agreement, and the pilot needs approval', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await expect(page.getByRole('heading', { level: 3, name: 'Proposed academic direction' })).toBeVisible();
    const roadmap = page.locator('[aria-labelledby="about-roadmap"]');
    await expect(roadmap).toContainText('This is a proposal, not an agreement');
    await expect(roadmap).toContainText('would require ethics and data-protection approval');
  });

  test('R16-D-06..10: step 5 names its mission, step 6 may already be unlocked, step 7 works on a phone too', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    const steps = page.locator('.about-steps > li');
    await expect(steps.nth(4)).toContainText('In Fix the Sample');
    await expect(steps.nth(4)).toContainText('Microbe Detective or Anemia Detective');
    await expect(steps.nth(4)).toContainText('(some ordering and matching steps show how many items are in place)');
    await expect(steps.nth(5)).toContainText('may already be unlocked');
    await expect(steps.nth(6)).toContainText('Use the Faculty guest button (in the sidebar, or in Guest options on a phone).');
  });

  test('R16-C-02: in the Faculty guest, step 7 says so instead of asking to switch', async ({ page }) => {
    await openAboutAsFaculty(page);
    const faculty = page.locator('.about-steps > li').nth(6);
    await expect(faculty.locator('.about-chip.here')).toHaveText('You are in the Faculty guest');
    await expect(faculty).not.toContainText('Switch to the Faculty guest');
    await expect(faculty).not.toContainText('Use the Faculty guest button');
    await expect(faculty).toContainText('Show the class analytics');
    await expect(faculty.getByRole('button')).toHaveCount(2);
  });

  test('R16-B-01: on a long About page at 1440x900 the navigation and the guest controls stay in the viewport while scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await resetDemo(page);
    await openAbout(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, 'the page is long enough to need scrolling').toBeGreaterThan(2000);
    for (const y of [800, 1800, height]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(Math.min(y, height - 900) - 5);
      for (const name of ['Investigations', 'Lab map', 'Learning settings', ABOUT, 'Faculty guest', 'Reset guest session']) await expect(page.getByRole('button', { name, exact: true }), `${name} at scrollY ${y}`).toBeInViewport({ ratio: 1 });
    }
    await noHorizontalScroll(page, 'sticky sidebar 1440');
    await axeClean(page, 'sticky sidebar 1440');
    // Still usable: the Faculty guest button works from the bottom of the page.
    await page.getByRole('button', { name: 'Faculty guest', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Class intelligence' })).toBeVisible();
  });

  test('R16-B-01: on a landscape phone (667x375) the sidebar scrolls inside itself and every navigation item can be reached', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await resetDemo(page);
    await openAbout(page);
    const aside = page.locator('.app > aside');
    const box = await aside.evaluate((el) => ({ position: getComputedStyle(el).position, client: el.clientHeight, scroll: el.scrollHeight, view: window.innerHeight }));
    expect(box.position).toBe('sticky');
    expect(box.client).toBeLessThanOrEqual(box.view);
    await page.evaluate(() => window.scrollTo(0, 1500));
    for (const name of ['Investigations', 'Lab map', 'Progress', 'Lab results', 'Learning settings', ABOUT]) {
      const button = page.locator('.app > aside nav').getByRole('button', { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      await expect(button, name).toBeInViewport({ ratio: 1 });
    }
    await page.getByRole('button', { name: 'Faculty guest', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Faculty guest', exact: true })).toBeInViewport({ ratio: 1 });
    await noHorizontalScroll(page, 'landscape 667');
    await axeClean(page, 'landscape 667');
  });

  test('R16-B-01: on a portrait phone the navigation is not sticky (mobile layout unchanged)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await resetDemo(page);
    const position = await page.locator('.app > aside').evaluate((el) => getComputedStyle(el).position);
    expect(position).not.toBe('sticky');
  });
});

// Round 17: the guidance says only what the application does, for the guest that is reading it.
test.describe('round 17: About & demo guide matches the application', () => {
  for (const [width, height] of [[1440, 900], [375, 812]] as const) {
    test(`R17-D-02/03/05/06: steps, timing and the student Before you present block (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await resetDemo(page);
      await openAbout(page);
      const text = await mainText(page);
      expect(text).not.toMatch(/cannot host a retry/);
      const steps = page.locator('.about-steps > li');
      await expect(steps.nth(2).getByRole('heading', { level: 3 })).toHaveText('Open one biomedical mission');
      await expect(steps.nth(4)).toContainText('Blood Smear Code also accepts a wrong answer');
      await expect(steps.nth(4)).toContainText('Fix the Sample');
      await expect(page.locator('#about-demo + .about-chip')).toHaveText('about 7 minutes with navigation');
      const block = page.getByRole('group', { name: 'Before you present' });
      await expect(block).toContainText('only a new personal best adds XP');
      await expect(block).toContainText('adds attempts to the student’s history');
      await expect(block).toContainText('step 2');
      await expect(block).toContainText('result screen of step 5');
      await expect(block).toContainText('ask the developer to reset the demo data');
      await expect(block).toContainText('Reset guest session');
      await expect(block).not.toContainText('no Reset guest session');
      await noHorizontalScroll(page, `student about ${width}`);
      await axeClean(page, `student about ${width}`);
    });

    test(`R17-D-04/01: the Faculty guest reads a role-aware Before you present block and a step 7 that names the demonstration data (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await resetDemo(page);
      // On a phone the guest switch lives in Guest options.
      if (width <= 600) await page.getByRole('button', { name: 'Guest options' }).click();
      await openFaculty(page);
      await openAbout(page);
      const block = page.getByRole('group', { name: 'Before you present' });
      await expect(block).toContainText('no Reset guest session');
      await expect(block).toContainText('Return to student demo');
      await expect(block).toContainText('Confirm reset');
      await expect(block).toContainText('Approve, then Return to draft');
      await expect(block).toContainText('Now draft');
      await expect(block).toContainText('ask the developer to reset the demo data');
      await expect(block).toContainText('only a new personal best adds XP');
      const text = await mainText(page);
      expect(text).not.toMatch(/FACULTY_DEMO_SCRIPT|docs\//);
      await expect(page.locator('.about-steps > li').nth(6)).toContainText('generated demonstration data, not real learners');
      await noHorizontalScroll(page, `faculty about ${width}`);
      await axeClean(page, `faculty about ${width}`);
    });
  }

  test('R17-D-01: the student guest reads the same statement in step 7', async ({ page }) => {
    await resetDemo(page);
    await openAbout(page);
    await expect(page.locator('.about-steps > li').nth(6)).toContainText('generated demonstration data, not real learners');
  });
});
