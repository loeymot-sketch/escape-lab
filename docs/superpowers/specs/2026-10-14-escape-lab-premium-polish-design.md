# Escape Lab — Premium polish & gamification pass (design spec)

Date: 2026-10-14. Author: Claude (autonomous session, green light given by the owner to "aller jusqu'au bout").
Status: approved by the owner's explicit mandate ("je donne le feu vert pour y aller jusqu'au bout et livrer un résultat impressionnant, fonctionnel sans faute").

## 1. Intent (what the owner wants and why)

The project is a university-application portfolio piece: a gamified biomedical investigation game (Escape Lab) that must
impress a selection committee (ESSTSM / Université de Monastir, HEPL, Erasmus+). The owner asked for a final pass that:

1. audits and improves **every screen, mission, feedback, result, badge, vault, leaderboard, progression, error, resume, expiry,
   responsive, accessibility and FR/EN** aspect;
2. keeps the product **functional without faults** (all automated suites green: unit, API, E2E, responsive, a11y, WebKit);
3. **preserves server authority** on answers, scores, timers, fragments and unlocks;
4. **never invents biomedical content** (no new zones, images, keys or scientific corrections without explicit validation);
5. keeps every image **labelled as illustrative** until provenance/licence/content are verified.

Success = a demo that looks and feels premium end to end (gate → dashboard → labs → every engine → feedback → result → vault →
badges → leaderboard → faculty), with verified evidence (tests + screenshots), honest documentation of what remains
human-validated only.

## 2. Baseline (measured on 2026-10-14, Node v22.23.2)

| Check | Result |
|---|---|
| Backend tests | 276/276 |
| Frontend tests | 357/357 (24 files) |
| Production build | passes, **JS entry 399 275 / 400 000 B, CSS 119 980 / 120 000 B** (budgets saturated), gzip: JS 120 KB, CSS 27 KB |
| Visual audit | 106 screenshots (desktop 1440 / phone 390, EN / FR) in the session scratchpad |

## 3. Audit findings (defects to fix)

All of these come from the layered theme history: `styles.css` (dark MVP) → `visual-refresh.css` (light editorial) →
`neon-theme.css` / `game-world.css` (dark neon). The light theme text colours (`#29484e`, `#41595e`, `#173344`, `#52696c`,
`#33474f`, `#00494b`) were never overridden on several screens, so they render as near-invisible dark text on the dark
background.

| # | Screen | Defect | Evidence |
|---|---|---|---|
| D1 | Mission (desktop) | Lab-assistant robot (`::before` on `.case-aside>.aside-card:first-child`) overlaps the card heading ("Observe before you decide", "Take a moment to understand.") | desk-en-04/07 |
| D2 | Mission (phone) | The same robot decoration lands on the **Case status** card and hides the "Wrong answers" value | phone-en-04/12 |
| D3 | Mission, multi-zone point step | Observation checklist rows are unstyled buttons ("Hemolysis indexPending") | desk-en-14 |
| D4 | Progress vault | Hero image uses `object-fit: contain` in a box taller than the image: ~250 px of empty dark area | desk-en-20 |
| D5 | Lab results | Mission rows, competency labels and "Strongest area / To improve" lines are unreadable (light-theme colours) | desk-en-24 |
| D6 | Faculty (3 screens) | Mission names, roster names, student bars, "Demonstration data" note, content-review titles unreadable | desk-en-27/28/29 |
| D7 | About & demo guide | Page title, section headings, intro paragraphs and quality points unreadable; cards are light-theme islands | desk-en-26 |
| D8 | Learning settings | "Reduce motion" label unreadable, checkbox unthemed | desk-en-25 |
| D9 | Vault unlock form | White unthemed input | desk-en-20, phone-en-20 |
| D10 | Mission, expired/gone | Disabled Submit button still shown under the "Time is up" panel (noise) | desk-en-15 |

## 4. Enhancements (gamification & UX, server data only)

Every enhancement renders data the server already sends. No new scoring rule, no new content.

| # | Where | What | Server field used |
|---|---|---|---|
| E1 | Dashboard | **Level progress bar**: "Level 6 · 8 240 XP · 760 XP to level 7" with an animated bar | `dashboard.user.levelProgress {into,size}` (currently dropped by the normalizer) |
| E2 | Result screen | **Score count-up** and bar fill animation; XP-gain banner; new-badge chips pulse; new-fragment reveal animates (all gated by reduce-motion) | existing `MissionResult` |
| E3 | Result screen | "Mission summary" strip: steps solved first time (`firstTrySteps/steps`), time vs limit | existing `stats` |
| E4 | Badges | Earned date on earned badges; locked badges show a lock glyph and muted style | `badge.earnedAt` (already normalised) |
| E5 | Leaderboard | Podium styling for ranks 1-3 (gold / silver / bronze) and a "You" highlight that stays readable | existing rows |
| E6 | Vault | Themed unlock input; "READY" cards glow; unlock success message styled as a celebration | existing |
| E7 | Multi-zone checklist | Proper chip list with ✓/○ states, active target highlighted | existing |
| E8 | Mission header | Timer turns amber under 60 s and red under 20 s (CSS state classes, server time only) | `remainingSec` |

## 5. Constraints and invariants

- Server authority is untouched: no client computes a score, a timer verdict, a fragment or an unlock. The dashboard level bar
  only displays `levelProgress` as sent.
- No biomedical content change: `be/src/content.ts` keys, hints, explanations and images are not modified. Illustrative
  labels stay on every image.
- English UI strings stay byte-identical where tests assert them; **every new string gets a French entry** (the i18n coverage
  test enforces it).
- Build budgets: dead light-theme CSS is removed where it is fully overridden (verified by screenshot diff), and the budgets are
  raised to a documented, still-small ceiling (JS entry 440 000 B ≈ 125 KB gzip; CSS 140 000 B ≈ 30 KB gzip) so the polish
  cannot be blocked by a 20-byte margin. The raise is written in `check-build-budget.mjs` with the measured gzip figures.
- Reduce-motion: every new animation is disabled under `prefers-reduced-motion` and under the server-owned
  `data-reduce-motion="true"` preference.
- Accessibility: new visuals keep their text equivalents (progress bars carry `role="progressbar"` + `aria-valuetext`).

## 6. Testing strategy (evidence before claims)

1. Unit (Vitest): new normaliser field (`levelProgress`), count-up hook, badge date formatting, timer state classes, i18n coverage.
2. Backend (node:test): unchanged suite must stay 276/276 (no backend change planned beyond none).
3. E2E (Playwright, Chromium + iPhone 13 emulation + production bundle): full suite; snapshot specs updated only where a
   change is intended, with the diff reviewed.
4. **WebKit**: Playwright WebKit is installed in this session; a smoke project (landing, dashboard, one mission, result,
   vault) runs on WebKit desktop and on an iPhone WebKit descriptor. This is a real WebKit engine run, not a physical device.
5. Visual regression: the 106-screenshot walkthrough is re-run after the changes and compared screen by screen.
6. Accessibility: axe specs stay green; contrast of the repaired screens is checked by axe (`color-contrast`).

## 7. Out of scope (explicitly)

- New biomedical zones, images, missions, keys or corrections.
- Per-visitor guest sandboxes (documented product decision).
- Deployment, push, migrations, secrets.
- Native FR review by a speaker, physical-device Safari testing, image provenance/licence validation: these remain **human
  tasks** and are listed as such in the final report.

## 8. Risks

- Removing dead CSS could change a screen the audit did not capture → mitigated by the full screenshot walkthrough diff and
  the existing snapshot specs.
- Ports 3000/5173 are occupied by another local session → the Playwright config gains `E2E_API_PORT` / `E2E_WEB_PORT`
  overrides (default unchanged).
