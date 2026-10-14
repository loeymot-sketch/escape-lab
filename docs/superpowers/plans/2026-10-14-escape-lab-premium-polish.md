# Escape Lab premium polish — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair every unreadable or overlapping screen found by the 2026-10-14 visual audit and add server-data-only gamification polish (level bar, result celebration, badge dates, podium, timer urgency, themed vault/checklist), with full automated evidence including a real WebKit engine run.

**Architecture:** Presentation-only changes in `web/` (CSS in the existing layered stylesheets, small React additions, one normaliser field). The backend is not modified. New strings go through `t()` with French entries. Playwright gains port overrides and a WebKit smoke project.

**Tech Stack:** React 19, Vite 6, Vitest 4 (jsdom), Playwright 1.52 (Chromium, iPhone 13 emulation, WebKit), Node 22.23.2 (`export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH` in every shell).

**Spec:** `docs/superpowers/specs/2026-10-14-escape-lab-premium-polish-design.md`

## Global Constraints

- Server authority: no client-side score, timer verdict, fragment or unlock logic; display only what the server sends.
- No change to `be/src/content.ts` (keys, hints, explanations, images); illustrative labels stay on every image.
- English UI strings asserted by tests stay byte-identical; every new `t('…')` literal needs a French entry in `web/src/i18n/fr/<area>.ts` (coverage test).
- Animations are disabled under `prefers-reduced-motion: reduce` and `html[data-reduce-motion="true"]`.
- Build budgets after the raise: JS entry 440 000 B, lazy JS 160 000 B, CSS 140 000 B, rasters ≤ 300 000 B each.
- Existing E2E assertions that Submit is **disabled** after expiry/gone stay valid: Submit remains rendered (spec item D10 is therefore dropped on purpose).
- Node ≥ 22.18 for every npm script. Ports 3000/5173 may be taken by another local session: use `E2E_API_PORT` / `E2E_WEB_PORT`.

## Review Focus

1. A dashboard payload whose `levelProgress.into` exceeds `size` (or is missing) must raise the payload error, never render a >100 % bar → test in Task 5.
2. A result with `xpAwarded: 0` and `newBest: true` must not animate a "+0 XP" celebration → test in Task 6.
3. Reduce-motion (system or server preference) must make the count-up show the final score immediately → test in Task 6.
4. A timer at exactly 60 s / 20 s must take the warning / critical tone (boundary inclusive) → test in Task 8.
5. The phone layout must never let the robot decoration cover the Case status values → E2E check in Task 2.

---

### Task 0: Checkpoint the inherited work

**Files:** everything currently modified/untracked except `.ci-artifacts/`, `web/src/assets/mission-master-*.png` (2.3 MB each, unreferenced) and `web/src/assets/lab-{hematology,microbiology,biochemistry}.webp`, `mission-result-trophy.webp`, `lab-assistant-robot.webp` (keep: robot is referenced from CSS; trophy is served from `public/12.webp`; the three plain lab scenes are unreferenced but tiny — keep).

- [ ] **Step 1:** `git status --short | grep -v '^?? .ci-artifacts'` and confirm the list matches the baseline (57 modified + untracked assets/specs/docs).
- [ ] **Step 2:** Add `web/src/assets/mission-master-*.png` to `.gitignore` (they are not imported anywhere; `grep -rn mission-master web/src` is empty).
- [ ] **Step 3:** Commit: `git add -A . ':!.ci-artifacts' && git commit -m "checkpoint: multi-zone pilot, scenes and faculty audit (validated 276/276, 357/357)"` (plus the spec and this plan).

### Task 1: Dark readability repair (D5–D9)

**Files:** Modify `web/src/game-world.css` (append a "readability" block at the end, before the media queries is fine), `web/src/scripts/../scripts/check-build-budget.mjs` (budget raise, Task 1b).

- [ ] **Step 1:** Append to `game-world.css`:

```css
/* Readability repair: the light editorial palette (#29484e, #41595e, #173344, #52696c) never got dark overrides on these screens. */
.mission-row, .mission-signal, .bar-row, .insight, .content-row, .leaderboard-row, .setting-row, .about-step p, .about-card li { color: #d3e5f2; }
.mission-row b, .mission-signal b, .bar-row b, .leaderboard-row b, .content-row b, .content-title b, .insight b { color: #f1f8ff; }
.mission-row small, .mission-signal small, .mission-signal .sample-size, .bar-row small, .mission-row .metric-label, .mission-row .id-tag, .review-trail { color: #9fbfd5; }
button.mission-row { color: #d3e5f2; }
button.mission-row:hover { background: rgb(13 82 112 / 38%); }
.mission-table, .mission-row, .mission-signal, .content-row, .setting-row { border-color: rgb(53 109 140 / 44%); }
.faculty-demo-note { border-left-color: #2fcfff; background: rgb(15 105 143 / 22%); color: #c6dcea; }
.content-head { color: #8bdfff; border-color: rgb(53 109 140 / 44%); }
.status-pill { background: #0b3c56; color: #d5f1ff; }
.status-pill.reviewed { background: #4c3a0f; color: #ffe39a; }
.status-pill.approved { background: #0f4b3c; color: #a9f5d3; }
.picker-label label { color: #a9c4d8; }
.settings-card .setting-row { color: #e2f0fa; }
.setting-row input { accent-color: #19d8ff; }
.unlock-row input { background: #082b45; border-color: #2a88b2; color: #e8f6ff; }
.unlock-row input::placeholder { color: #7fa6bf; }
.result-lab .mission-row span { color: #d3e5f2; }
/* About page: headings and body text on the page background (the light cards keep their own palette). */
.about-head h1, .about-section h2, .about-loop-title { color: #f4fbff; text-shadow: 0 0 22px rgb(25 216 255 / 14%); }
.about-principle { color: #8ceeff; border-left-color: #ff6571; }
.about-lede, .about-intro, .about-loop-note, .about-points dd, .about-step-note { color: #b7d0e2; }
.about-points dt { color: #eaf5ff; }
.about-points > div { border-top-color: rgb(53 109 140 / 44%); }
.about-state { color: #9fbfd5; }
.about-chip.quiet { background: #0b3c56; color: #d5f1ff; }
.about-step:not(:last-child)::after { background: rgb(53 109 140 / 60%); }
```

- [ ] **Step 2:** Run `npm run build` (from `web/`, with `VITE_API_URL=/api`). Expected: the CSS budget fails (120 000 B exceeded) → that is the signal for Task 1b.

### Task 1b: Budget raise with rationale

**Files:** Modify `web/scripts/check-build-budget.mjs:12-15`.

- [ ] **Step 1:** Replace the budgets line and its comment:

```js
/**
 * `js` is the ENTRY file that index.html loads on every first visit. `lazyJs` is everything loaded only on demand (the French
 * dictionary, the point engine): English visitors never download it.
 * 2026-10-14: the neon game-world theme and the visual polish pass sit on top of three earlier stylesheets, so the ceilings were
 * raised once from 400 000 / 120 000 to 440 000 / 140 000 B. Measured transfer sizes at that date: entry JS 120 KB gzip,
 * CSS 27 KB gzip, which stays well inside a phone's first-load budget; a further raise needs a new measurement here.
 */
const budgets = { js: 440_000, lazyJs: 160_000, css: 140_000 };
```

- [ ] **Step 2:** `npm run build` → passes; note the figures for the final report.
- [ ] **Step 3:** Commit `fix(theme): dark readability for faculty, results, about, settings, vault input; raise budgets with measurement`.

### Task 2: Robot decoration and assistant heading (D1, D2)

**Files:** Modify `web/src/pages/mission.tsx:484` (desktop aside card gets `className="aside-card assistant-card"`, review card `aside-card review-assistant assistant-card`), `web/src/game-world.css:460-461`.

- [ ] **Step 1:** In `mission.tsx` change the two `aside-card` class strings: assistant → `'aside-card assistant-card'`; `reviewAssistant` desktop variant → `'aside-card review-assistant assistant-card'` (the inline variant keeps `assistant-inline review-assistant`).
- [ ] **Step 2:** In `game-world.css` replace the selectors `.case-aside>.aside-card:first-child` (two occurrences on lines 460–461) with `.case-aside>.assistant-card`, and add:

```css
.assistant-card .eyebrow, .assistant-card h2, .assistant-inline .eyebrow { padding-right: 92px; }
.assistant-card h2 { min-height: 0; }
```

- [ ] **Step 3:** Add an E2E assertion in `web/e2e/mobile.spec.ts` (new test "case status values stay readable next to the assistant art"): on iPhone 13, open `hem-02` via `openAttemptAt`, then `expect(page.locator('.case-status-card .status-row dd').first()).toBeVisible()` and check with `evaluate` that `document.elementFromPoint(x, y)` at the dd centre is the dd itself (not a pseudo-element host with the robot). Also on desktop (`a11y.spec.ts` or `polish.spec.ts`): the `.assistant-card h2` right edge must be ≤ card right − 90.
- [ ] **Step 4:** Run those two tests; commit `fix(mission): keep the lab-assistant art off the headings and the case status`.

### Task 3: Observation checklist chips (D3, E7)

**Files:** Modify `web/src/components/point-engine.tsx:60-64`, `web/src/game-world.css` (append).

- [ ] **Step 1:** In `point-engine.tsx`, give the group `className="observation-list"` and each row `className="observation-row"` (`+ ' selected'` when selected, `+ ' active'` when `activeTarget?.id === target.id`). Replace the `✓/○` glyph span with `<i aria-hidden="true">{selected ? '✓' : String(index + 1)}</i>` and keep the label and state text.
- [ ] **Step 2:** CSS:

```css
.observation-list { display: grid; gap: 8px; margin: 14px 0 6px; }
.observation-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 8px 12px; border: 1px solid #216d91; border-radius: 12px; background: rgb(8 46 71 / 90%); color: #e5f5ff; font: inherit; font-size: 13px; text-align: left; }
.observation-row i { display: grid; place-items: center; flex: 0 0 26px; width: 26px; height: 26px; border-radius: 50%; border: 1px solid #2fcfff; font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; font-style: normal; color: #8ceeff; }
.observation-row span { flex: 1 1 auto; min-width: 0; }
.observation-row b { flex: 0 0 auto; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #9fbfd5; }
.observation-row.active { border-color: #8ceeff; box-shadow: 0 0 0 1px rgb(25 216 255 / 35%), 0 0 16px rgb(25 216 255 / 18%); }
.observation-row.selected i { border-color: #27dcb4; background: rgb(8 92 78 / 55%); color: #70f5d7; }
.observation-row.selected b { color: #70f5d7; }
```

- [ ] **Step 3:** Run `npx vitest run src/components` and the targeted E2E `npx playwright test e2e/point-text.spec.ts`; commit `feat(point): readable observation checklist`.

### Task 4: Vault hero cover layout (D4, E6)

**Files:** Modify `web/src/game-world.css:229-233`; check `web/e2e/vault-art.spec.ts` for assertions on `.vault-hero img` CSS first.

- [ ] **Step 1:** Read `vault-art.spec.ts`; if it asserts `object-fit: contain` or a natural ratio on the hero image, adapt the assertion to the new layout (height-capped cover) in the same change and re-baseline its snapshots.
- [ ] **Step 2:** CSS:

```css
.vault-hero { position: relative; min-height: clamp(250px, 34vw, 420px); }
.vault-hero>img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 38%; }
.vault-hero-copy { position: relative; z-index: 1; margin-top: clamp(160px, 22vw, 290px); background: linear-gradient(180deg, rgb(6 26 44 / 0%), rgb(6 26 44 / 92%) 38%); }
.vault-card-head span.ready { color: #ffd15b; border-color: #e3b33e; box-shadow: 0 0 14px rgb(255 200 61 / 30%); }
.success-note { border-color: #27dcb4; background: rgb(8 92 78 / 45%); color: #a9f5d3; }
```

- [ ] **Step 3:** In `progress.tsx` VaultCard head: add class `ready` to the status span when `vault.complete && !vault.exited`.
- [ ] **Step 4:** Run `npx playwright test e2e/vault-art.spec.ts e2e/fragments-vault.spec.ts --update-snapshots` only after reviewing the new look in a screenshot; commit `feat(vault): cinematic hero and ready-state glow`.

### Task 5: Dashboard level progress (E1)

**Files:** Modify `web/src/lib/student.ts` (Dashboard type + normaliser), `web/src/lib/student.test.ts`, `web/src/pages/student.tsx` (DashboardView), `web/src/i18n/fr/student.ts`, `web/src/game-world.css`.

**Interfaces:** `Dashboard.user` becomes `{ level: number; xp: number; levelProgress: { into: number; size: number } }`.

- [ ] **Step 1 (test first):** In `student.test.ts` add:

```ts
it('reads the level progress and refuses a progress beyond its level size', () => {
  const base = JSON.parse(JSON.stringify(DASHBOARD_FIXTURE));
  base.user.levelProgress = { into: 740, size: 3000 };
  expect(normalizeDashboard(base).user.levelProgress).toEqual({ into: 740, size: 3000 });
  base.user.levelProgress = { into: 3001, size: 3000 };
  expect(() => normalizeDashboard(base)).toThrow(/levelProgress/);
  delete base.user.levelProgress;
  expect(() => normalizeDashboard(base)).toThrow(/levelProgress/);
});
```
(use the existing dashboard fixture in `src/lib/fixtures.ts` — find its export name first.)

- [ ] **Step 2:** Run `npx vitest run src/lib/student.test.ts` → FAIL.
- [ ] **Step 3:** Normaliser: `const progress = rec(user.levelProgress, D, 'user.levelProgress'); const into = nonNeg(progress.into, D, 'user.levelProgress.into'); const size = nonNeg(progress.size, D, 'user.levelProgress.size'); if (size <= 0 || into > size) throw new PayloadError(\`Invalid server ${D} payload: user.levelProgress.\`);` and return `user: { level, xp, levelProgress: { into, size } }`. Update the fixture in `fixtures.ts` and every test fixture that builds a dashboard (grep `levelProgress`/`user: {` in tests) so existing tests keep passing.
- [ ] **Step 4:** Dashboard UI, in `DashboardView` right after the `dashboard-next-step` section:

```tsx
<section className="level-strip" aria-label={t('Level progress')}>
  <div className="level-badge"><span>{t('LEVEL')}</span><b>{formatInt(dashboard.user.level)}</b></div>
  <div className="level-body">
    <div className="level-head"><b>{t('{xp} XP', { xp: formatInt(dashboard.user.xp) })}</b><span>{t('{left} XP to level {next}', { left: formatInt(dashboard.user.levelProgress.size - dashboard.user.levelProgress.into), next: formatInt(dashboard.user.level + 1) })}</span></div>
    <div className="level-bar" role="progressbar" aria-label={t('Level progress')} aria-valuemin={0} aria-valuemax={dashboard.user.levelProgress.size} aria-valuenow={dashboard.user.levelProgress.into} aria-valuetext={t('{into} of {size} XP into level {level}', { into: formatInt(dashboard.user.levelProgress.into), size: formatInt(dashboard.user.levelProgress.size), level: formatInt(dashboard.user.level) })}><i style={{ width: `${dashboard.user.levelProgress.size > 0 ? (100 * dashboard.user.levelProgress.into) / dashboard.user.levelProgress.size : 0}%` }} /></div>
  </div>
</section>
```

- [ ] **Step 5:** French (`fr/student.ts`): `'Level progress': 'Progression de niveau'`, `'LEVEL': 'NIVEAU'`, `'{xp} XP': '{xp} XP'` is identical → use `'{xp} XP'` only via the SAME regex? No: `{xp} XP` has no letters other than XP and matches `SAME`, so no entry needed. `'{left} XP to level {next}': '{left} XP avant le niveau {next}'`, `'{into} of {size} XP into level {level}': '{into} XP sur {size} dans le niveau {level}'`.
- [ ] **Step 6:** CSS (`game-world.css`):

```css
.level-strip { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; align-items: center; margin: 14px 0 0; padding: 14px 16px; border: 1px solid rgb(37 142 188 / 62%); border-radius: 16px; background: linear-gradient(135deg, rgb(9 42 68 / 94%), rgb(4 23 41 / 96%)); }
.level-badge { display: grid; place-items: center; min-width: 64px; padding: 6px 10px; border: 1px solid #e3b33e; border-radius: 14px; background: radial-gradient(circle, #5c4115, #22190b); color: #ffe081; }
.level-badge span { font: 700 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.level-badge b { font-size: 26px; line-height: 1; letter-spacing: -.03em; }
.level-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; margin-bottom: 8px; color: #a9c4d8; font-size: 12px; }
.level-head b { color: #f1f8ff; font-size: 14px; }
.level-bar { height: 10px; overflow: hidden; border: 1px solid #237194; border-radius: 999px; background: #09263d; }
.level-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #16bfe8, #ffc83d); box-shadow: 0 0 12px rgb(25 216 255 / 45%); transition: width .9s cubic-bezier(.2,.8,.2,1); }
```

- [ ] **Step 7:** `npm test` (web) → all green incl. i18n coverage; commit `feat(dashboard): level progress bar from the server's levelProgress`.

### Task 6: Result celebration (E2, E3)

**Files:** Create `web/src/ui/motion.ts` (+ `motion.test.ts`), modify `web/src/pages/mission.tsx` (ResultScreen), `web/src/i18n/fr/mission.ts`, `web/src/game-world.css`.

**Interfaces:** `export function prefersReducedMotion(): boolean`; `export function useCountUp(target: number, durationMs?: number): number`.

- [ ] **Step 1 (tests first), `motion.test.ts`:**

```ts
import { act, renderHook } from '@testing-library/react'; // not installed → use a tiny harness: render a component with createRoot into jsdom and read textContent
```
Keep it dependency-free: write `function mount(target)` that renders `<p>{useCountUp(target, 100)}</p>` with `createRoot`, advance fake timers via `vi.advanceTimersByTime`, and assert the text grows and ends at `target`. Second test: with `document.documentElement.dataset.reduceMotion = 'true'` the first rendered value already equals `target`. Third: `prefersReducedMotion()` is true when `matchMedia('(prefers-reduced-motion: reduce)').matches` (mock `window.matchMedia`).

- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement `motion.ts`:

```ts
import { useEffect, useState } from 'react';
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'true') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** Counts from 0 to `target` with an ease-out curve; shows `target` at once under reduce-motion. Presentation only: the value counted to is the server's figure. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); return undefined; }
    const start = performance.now();
    let handle = 0;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16);
    const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : window.clearTimeout;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) handle = raf(tick);
    };
    handle = raf(tick);
    return () => cancel(handle);
  }, [target, durationMs]);
  return value;
}
```

- [ ] **Step 4:** ResultScreen: `const shown = useCountUp(result.score);` and a `const [filled, setFilled] = useState(false); useEffect(() => { const id = window.setTimeout(() => setFilled(true), 30); return () => window.clearTimeout(id); }, []);` → bar width uses `filled ? pct : 0` (under reduce-motion the CSS transition is disabled so it jumps). Score `<b>{formatInt(shown)} …`. Add a third `Stat`: `label={t('First-try steps')} value={outOf(result.stats.firstTrySteps, result.stats.steps)} detail={t('Solved without a wrong answer')}`. Wrap the XP note: `<p className={\`result-lede result-xp-note${result.newBest && result.xpAwarded > 0 ? ' gained' : ''}\`}>`. Badge list gets `className="badge-chips celebrate"`, fragment reveal gets `fragment-reveal celebrate`.
- [ ] **Step 5:** French (`fr/mission.ts`): `'First-try steps': 'Étapes réussies du premier coup'`, `'Solved without a wrong answer': 'Résolues sans mauvaise réponse'`.
- [ ] **Step 6:** CSS:

```css
.result-score-bar i { transition: width 1.1s cubic-bezier(.2,.8,.2,1); }
.result-xp-note.gained { display: inline-block; margin-inline: 24px; padding: 8px 14px; border: 1px solid #27dcb4; border-radius: 999px; background: rgb(8 92 78 / 45%); color: #a9f5d3; font-weight: 700; }
@keyframes celebrate-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
.celebrate strong, .badge-chips.celebrate li { animation: celebrate-pop .7s cubic-bezier(.2,.8,.2,1) both; }
.badge-chips.celebrate li:nth-child(2) { animation-delay: .12s; } .badge-chips.celebrate li:nth-child(3) { animation-delay: .24s; }
@media (prefers-reduced-motion: reduce) { .celebrate strong, .badge-chips.celebrate li, .result-score-bar i, .level-bar i { animation: none; transition: none; } }
html[data-reduce-motion="true"] .celebrate strong, html[data-reduce-motion="true"] .badge-chips.celebrate li, html[data-reduce-motion="true"] .result-score-bar i, html[data-reduce-motion="true"] .level-bar i { animation: none; transition: none; }
```

- [ ] **Step 7:** `npm test`; E2E `result-trophy.spec.ts` (its snapshots are taken after the animation settles: add `await page.waitForTimeout(1300)` before `toHaveScreenshot` if they flake, or set `animations: 'disabled'` in the snapshot options which Playwright already does by default); re-baseline after reviewing; commit `feat(result): score count-up, first-try stat, celebration for badges and fragments`.

### Task 7: Badges with dates and locks (E4)

**Files:** Modify `web/src/pages/progress.tsx` (BadgeRow), `web/src/i18n/fr/progress.ts`, `web/src/game-world.css`.

- [ ] **Step 1:** BadgeRow: icon `badge.earned ? <Trophy size={15}/> : <LockKeyhole size={15}/>`; under `<small>` add `{badge.earned && badge.earnedAt !== null && <time dateTime={new Date(badge.earnedAt).toISOString()}>{t('Earned on {date}', { date: formatDateTime(new Date(badge.earnedAt)) })}</time>}` guarded by `!Number.isNaN(new Date(badge.earnedAt).getTime())`.
- [ ] **Step 2:** French: `'Earned on {date}': 'Obtenu le {date}'`.
- [ ] **Step 3:** CSS: `.badge-row time { display: block; margin-top: 3px; color: #8ceeff; font-size: 11px; }`.
- [ ] **Step 4:** `npm test`; E2E `game-navigation.spec.ts` badges snapshots re-baselined after review; commit `feat(badges): earned date and lock glyph`.

### Task 8: Leaderboard podium and timer urgency (E5, E8)

**Files:** Modify `web/src/pages/progress.tsx` (BoardRow className), `web/src/ui/common.ts(x)` (`timerTone`), `web/src/ui/common.test.ts`, `web/src/pages/mission.tsx` (timer className), `web/src/game-world.css`.

- [ ] **Step 1 (test first), `common.test.ts`:**

```ts
describe('timerTone', () => {
  it('is calm above a minute, warning at 60 s and below, critical at 20 s and below, calm when there is no limit', () => {
    expect(timerTone(61)).toBe('');
    expect(timerTone(60)).toBe('warning');
    expect(timerTone(21)).toBe('warning');
    expect(timerTone(20)).toBe('critical');
    expect(timerTone(0)).toBe('critical');
    expect(timerTone(null)).toBe('');
  });
});
```

- [ ] **Step 2:** Implement in `common.tsx`: `export const timerTone = (left: number | null): '' | 'warning' | 'critical' => (left === null ? '' : left <= 20 ? 'critical' : left <= 60 ? 'warning' : '');`
- [ ] **Step 3:** `mission.tsx` timer: `className={\`timer ${live ? timerTone(left) : ''}\`}`.
- [ ] **Step 4:** BoardRow: `className={\`leaderboard-row ${row.you ? 'you' : ''}${row.rank <= 3 ? \` rank-${row.rank}\` : ''}\`}`.
- [ ] **Step 5:** CSS:

```css
.timer.warning { border-color: #ffb13b; color: #ffcf6b; background: rgb(84 52 8 / 55%); }
.timer.critical { border-color: #ff6571; color: #ffb1b8; background: rgb(101 26 42 / 60%); animation: timer-pulse 1s ease-in-out infinite; }
@keyframes timer-pulse { 50% { box-shadow: 0 0 0 4px rgb(255 101 113 / 22%); } }
@media (prefers-reduced-motion: reduce) { .timer.critical { animation: none; } }
html[data-reduce-motion="true"] .timer.critical { animation: none; }
.leaderboard-row.rank-1 > span:first-child, .leaderboard-row.rank-2 > span:first-child, .leaderboard-row.rank-3 > span:first-child { font-weight: 800; }
.leaderboard-row.rank-1 > span:first-child { color: #ffd15b; } .leaderboard-row.rank-2 > span:first-child { color: #d9e4ee; } .leaderboard-row.rank-3 > span:first-child { color: #e0a06a; }
.leaderboard-row.rank-1:not(.you) { background: linear-gradient(90deg, rgb(92 65 21 / 40%), transparent 60%); }
```

- [ ] **Step 6:** `npm test`; re-baseline leaderboard snapshots after review; commit `feat(progress): podium ranks and timer urgency tones`.

### Task 9: Playwright port overrides and WebKit smoke

**Files:** Modify `web/playwright.config.ts`, `web/e2e/support/helpers.ts:4`, `web/e2e/production.spec.ts:39`; Create `web/e2e/webkit.spec.ts`.

- [ ] **Step 1:** Config: `const API_PORT = Number(process.env.E2E_API_PORT) || 3000; const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 5173; process.env.E2E_API_PORT = String(API_PORT); process.env.E2E_WEB_PORT = String(WEB_PORT);` API command gets `PORT=$E2E_API_PORT` and `CORS_ORIGIN=http://127.0.0.1:$WEB_PORT` is not needed (NODE_ENV=test); web command `VITE_API_URL=http://localhost:${API_PORT}/api npm run dev -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`; `baseURL` and `url`s use the ports; `API_URL` = `http://localhost:${API_PORT}/api`. Add projects: `{ name: 'webkit-smoke', use: { ...devices['Desktop Safari'] }, testMatch: /webkit\.spec\.ts/ }` and `{ name: 'webkit-iphone', use: { ...devices['iPhone 13'] }, testMatch: /webkit\.spec\.ts/ }`. The default `chromium` project must `testIgnore` `/webkit\.spec\.ts/` too.
- [ ] **Step 2:** helpers: `export const API = \`http://localhost:${process.env.E2E_API_PORT ?? '3000'}/api\`;`. production.spec: `expect([...apiOrigins]).toEqual([\`http://localhost:${process.env.E2E_API_PORT ?? '3000'}\`]);`
- [ ] **Step 3:** `webkit.spec.ts` smoke (each test resets the demo): (a) gate → "Choose a laboratory" heading, no console/page errors, level strip visible; (b) Blood Smear Code via UI: `clickArtwork(page, ARTWORK.smear)` → submit → result heading "Investigation complete." and score text `/\d+ \/ 180 XP/`; (c) vault page renders the four doors and `.vault-hero img` is loaded (naturalWidth > 0); (d) badges page lists 7 rows; (e) FR switch on the dashboard shows "Choisir un laboratoire"; (f) order engine via `openAttemptAt(page, 'mic-02')` → `arrangeOrder` to the correct labels → submit → result (exercises keyboard-free reordering on WebKit).
- [ ] **Step 4:** Run `E2E_API_PORT=3200 E2E_WEB_PORT=5280 npx playwright test --project=webkit-smoke --project=webkit-iphone`; fix what WebKit reveals; commit `test(e2e): port overrides and WebKit smoke projects`.

### Task 10: Full verification and screenshot walkthrough

- [ ] **Step 1:** `cd be && npm test` → 276/276. `cd web && npm test` → all green. `VITE_API_URL=/api npm run build` → budget line recorded.
- [ ] **Step 2:** Full Playwright: `CI=true E2E_API_PORT=3200 E2E_WEB_PORT=5280 npx playwright test` (chromium + mobile + production + webkit). Investigate every failure; re-baseline only intended snapshot changes (`--update-snapshots` on the named spec after looking at the diff image in `test-results/`).
- [ ] **Step 3:** Re-run the scratchpad walkthrough (`shots.mjs`, `shots2.mjs`) against the audit servers into `shots-after/`; look at every repaired screen (D1–D9) and every enhancement (E1–E8) in EN and FR, desktop and phone.
- [ ] **Step 4:** Commit `test: full verification after the polish pass`.

### Task 11: Documentation and memory

**Files:** Modify `README.md` (status paragraph: WebKit engine run, visual audit), `docs/KNOWN_LIMITATIONS.md` (line "WebKit/Safari is not tested; …" → engine-tested, device untested), `plans/PLAN_ESCAPE_LAB_GAMIFICATION_ADVANCED_2026-10-13.md` (append "Passe premium 14 octobre"), Create `docs/PREMIUM_POLISH_REPORT_2026-10-14.md` (FR: what was found, fixed, added, verified, what remains human).

- [ ] **Step 1:** Write the report with the measured figures from Task 10 (tests counts, budget bytes, E2E totals, WebKit results) and the before/after defect table.
- [ ] **Step 2:** Update the three existing docs (short, factual).
- [ ] **Step 3:** Commit `docs: premium polish report, status updates`.
