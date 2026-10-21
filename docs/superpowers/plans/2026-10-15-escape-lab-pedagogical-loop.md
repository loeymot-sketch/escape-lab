# Escape Lab pedagogical loop — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pedagogical loop visible (journal, debrief by competency and step, mastery, route, recommendation, exit opened with earned fragments) from server-computed data only.

**Architecture:** Small additive fields on existing API payloads (`be/src/game.ts`, `engines.ts`, `rules.ts`, `scoring.ts`), tolerant normalisers in `web/src/lib`, four presentational components, CSS appended to `web/src/game-world.css`. No new routes, no schema change.

**Tech Stack:** Node 22 (`export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH`), node:test, React 19, Vitest, Playwright (`E2E_API_PORT=3200 E2E_WEB_PORT=5280`).

**Spec:** `docs/superpowers/specs/2026-10-15-escape-lab-pedagogical-loop-design.md`

## Global Constraints

- Server authority; `be/src/content.ts` untouched; English strings asserted by tests unchanged; French entry for every new `t()` literal; motion-safe.
- `.result-actions` keeps exactly 3 buttons; `.result-lede` order keeps the XP note at index 1; completed lobby rows keep the word "Completed".
- Budgets: JS entry ≤ 440 000 B, CSS ≤ 140 000 B.

## Review Focus

1. A stored result without `steps`/`previousBest` (older attempt) must render without the debrief and without a "previous best" line → unit test in Task 3.
2. `mastery` for a mission whose best equals exactly 80 % / 50 % of the maximum → boundary test in Task 1.
3. The exit CTA must appear only when every fragment slot is filled and the lab is not exited; a 422/429 from the server is shown as sent, never retried automatically → E2E in Task 5.
4. The journal must never contain prompts of upcoming steps nor any key → backend test in Task 1.
5. A recommendation pointing at a locked mission must not appear (the server only recommends open missions) → backend test in Task 1.

---

### Task 1: Backend additions (journal, public competency, result debrief, recommendation, mastery, rules)

**Files:** Modify `be/src/engines.ts` (PublicStep), `be/src/game.ts` (attemptView, complete, result, labLobby, dashboard helper), `be/src/scoring.ts` (`MASTERY_PCT`, `REVIEW_PCT`, `masteryOf`), `be/src/rules.ts`; Test `be/test/pedagogy.test.ts` (use `be/test/helpers.ts` conventions: `startApp`/`api` as the other tests do).

- [ ] **Step 1 (red):** write `pedagogy.test.ts` with: (a) `GET /attempts/:id` journal has one row per step, states upcoming/current, counts rise after a wrong answer, `step.competency` is public, no row contains `prompt`, `answer`, `x`, `y`, `order` or `pairs`; (b) after completion the result has `previousBest: null` first time and the earlier best on replay, `steps` with explanations and the recorded `wrong`, and `recommended` equal to `GET /dashboard` `recommended`; (c) lobby `mastery` is `mastered` at 80 %, `completed` at 79 %, `review` at 49 %, `completed` at 50 %, `null` without a best (use `masteryOf` directly for the boundaries plus one API case); (d) `GET /rules` publishes `mastery.masteredPct === 80` and `reviewPct === 50`.
- [ ] **Step 2:** run `npm test -- --test-name-pattern pedagogy` style (`node --test test/pedagogy.test.ts`) → FAIL.
- [ ] **Step 3:** implement; `masteryOf(best, max)`: `best === null ? null : best * 100 >= max * MASTERY_PCT ? 'mastered' : best * 100 < max * REVIEW_PCT ? 'review' : 'completed'`; extract `private recommendation(uid, done, exits, cont)` from `dashboard()` and reuse in `result()`.
- [ ] **Step 4:** `npm test` (be) → all green (276 + new); `npm run typecheck`; commit `feat(api): journal, competency, result debrief, recommendation and mastery (server-computed)`.

### Task 2: Client normalisers

**Files:** Modify `web/src/lib/attempt.ts`, `web/src/lib/student.ts`, `web/src/lib/fixtures.ts`; Test `web/src/lib/attempt.test.ts`, `web/src/lib/student.test.ts`.

- [ ] **Step 1 (red):** tests: journal rows normalised (state enum enforced, counts non-negative, default `[]` when absent), `competency` optional, result `previousBest`/`steps`/`competencies`/`recommended` optional and validated when present (a step without `explanation` is rejected), lobby `mastery` enum or null.
- [ ] **Step 2:** implement; `npm test` (web) → green; commit `feat(web): normalise the pedagogical fields`.

### Task 3: Result debrief (progress, competencies, step debrief, exit CTA, recommendation)

**Files:** Modify `web/src/pages/mission.tsx` (ResultScreen, enrichment after completion), `web/src/app.tsx` (`onStartMission` prop), `web/src/i18n/fr/mission.ts`, `web/src/game-world.css`; Test `web/src/pages/mission-review.test.ts` (pure helpers: `exitReady(result)`, `progressLine(result)`), E2E in Task 5.

- [ ] Helpers (red first): `exitReady(result)` true only when `result.lab` exists, `!exited`, `fragments` present and all non-null; `earnedCode(result)` joins digits; `progressDelta(result)` returns `null` without `previousBest`, else `score - previousBest`.
- [ ] Sections in order after the XP note: `.result-progress` (previous best → now, delta), `.result-competencies` (CompetencyBars), `.result-debrief` (`<details>` list), ledger, fragments, vault line, `.result-exit` (button `Open the laboratory exit` → POST unlock; success state with badge chips; error shown), badges, `.result-next` (recommended: reason + button `Start {title}` → `onStartMission`), actions.
- [ ] French entries; commit `feat(result): teaching debrief, exit opened with earned fragments, recommended next`.

### Task 4: Journal card, route strip, mastery chips, dashboard recommendation, density

**Files:** Modify `web/src/pages/mission.tsx` (JournalCard), `web/src/pages/student.tsx` (RouteStrip, mastery chip, recommendation block), `web/src/lib/labels.ts` (`masteryLabel`), `web/src/i18n/fr/{mission,student}.ts`, `web/src/game-world.css`; Test `web/src/lib/labels.test.ts`, `web/src/components/render.test.ts` (JournalCard states), E2E in Task 5.

- [ ] Red tests first (labels, journal rendering: solved rows show competency and counts, upcoming rows show no counts).
- [ ] Density CSS: `.case-panel`, `.aside-card`, `.mission-scene`, `.value` lose their outer glow; `.submit`, `.review-continue`, `.feedback.correct`, `.fragment-reveal` keep theirs.
- [ ] Commit `feat(loop): investigation journal, lab route, mastery chips, dashboard recommendation`.

### Task 5: E2E, snapshots, full verification

**Files:** Create `web/e2e/pedagogy.spec.ts`; re-baseline `step-review`, `image-integration`, `result-trophy` (penalized), `game-navigation` (rooms) snapshots after review.

- [ ] `pedagogy.spec.ts`: journal equals `GET /attempts/:id` journal after a wrong and a right answer; result sections equal `GET /attempts/:id/result` (previousBest, steps count, competencies); exit CTA appears only with a complete vault, unlocks without typing (server `exited` true after), 429/422 path with a patched route shows the server message; lobby chips equal `GET /labs/:slug` mastery; dashboard recommendation equals `GET /dashboard`.
- [ ] Full: `cd be && npm test`, `cd web && npm test && VITE_API_URL=/api npm run build`, `CI=true E2E_API_PORT=3200 E2E_WEB_PORT=5280 npx playwright test` (all projects), screenshot walkthrough; commit `test: pedagogical loop verified`.

### Task 6: Docs

- [ ] Append to `docs/PREMIUM_POLISH_REPORT_2026-10-14.md` a "Passe 2 — boucle pédagogique (15 octobre)" section with the figures; update `plans/PLAN_ESCAPE_LAB_GAMIFICATION_ADVANCED_2026-10-13.md`; `docs/FACULTY_DEMO_SCRIPT.md` step 5/6 (the result now opens the exit); commit `docs: pedagogical loop pass`.
