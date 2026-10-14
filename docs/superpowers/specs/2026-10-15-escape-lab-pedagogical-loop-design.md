# Escape Lab — visible pedagogical loop (design spec)

Date: 2026-10-15. Author: Claude, acting as supervisor on the owner's audit report ("Rapport d'audit — Escape Lab") with the owner's mandate "améliore le max et assure le meilleur UI et UX".
Status: approved by that mandate; the owner is not available mid-task, decisions are recorded here and in the plan's ledger.

## 1. Supervisor reading of the report

The report is right on its diagnosis: the demo is visually strong and the next jump must make the **pedagogical logic visible**, not add more neon. It mixes three horizons:

| Horizon | Report sections | Decision for this pass |
|---|---|---|
| Phase 1, demo of the competition | UI/UX priorities 1–3, "progression", "result screens", honest demo data | **In scope** |
| Phase 2, school pilot | real accounts, class creation, invitations, persistent results | Out of scope: weeks of security-sensitive work, not UI/UX polish |
| Phase 3, platform | teacher content studio, versioned content, admin, notifications, exports | Out of scope, same reason |

Two report items are **declined with a reason**:
- *Replace the code vault by automatic unlocks.* The vault is the escape-room identity, the demo script walks through it, and twelve E2E files encode it. Instead, the result screen now **opens the exit with the fragments the learner earned** (no retyping): the server rule stays, the learner never types digits they already proved.
- *New image zones, layers, before/after comparisons.* Every zone is biomedical content: nothing is added without expert validation (project rule). The existing multi-zone pilot and the image inspection stay as they are.

## 2. Intent

Make every screen answer "what did I just prove, what did it change, what should I do next" using **data the server already computes or can compute from stored attempts**:

1. During a mission: an **investigation journal** (which steps are solved, which competency each proved, how many wrong attempts and hints) next to the question.
2. At the end: a **debrief that teaches**: competencies acquired, step-by-step explanations with the mistakes made, progress against the previous best, the exit opened with the earned fragments, the recommended next mission.
3. In the lobby: a **route** (missions → fragments → exit) and a mastery label per mission (mastered / completed / to review / in progress) decided by the server.
4. On the dashboard: the server's **recommendation** with its reason.
5. Less persistent glow on secondary cards so the action and the reward stand out (three levels: information, expected action, reward).

## 3. Server additions (be/, no content change)

| Where | Field | Rule |
|---|---|---|
| `publicStep()` | `competency: string` | the step's competency label (not a key, not an answer) |
| `attemptView()` | `journal: { ordinal, stepId, competency, state: 'solved' \| 'current' \| 'upcoming', wrong, hints }[]` | one row per step from `step_results`; completed attempts list every step as solved |
| `complete()` payload | `previousBest: number \| null`, `steps: { ordinal, id, prompt, competency, wrong, hints, explanation }[]` | frozen at completion; explanations are all earned at that point |
| `result()` | `recommended` | same object as the dashboard's recommendation (one shared helper) |
| `labLobby()` missions | `mastery: 'mastered' \| 'completed' \| 'review' \| null` | from `bestScore / maxScore`: ≥ 80 % mastered, < 50 % review, otherwise completed; null without a best |
| `scoringRules()` | `mastery: { masteredPct: 80, reviewPct: 50, note }` | thresholds published, never computed by the client |

Older stored results have no `previousBest` / `steps`: the client treats them as absent.

## 4. Client

- Normalisers: `PublicStep.competency?`, `Attempt.journal` (default `[]`), `MissionResult.previousBest?`, `steps?`, `competencies?` (existing `normalizeCompetencies`), `recommended?`; lobby `mastery`.
- After the final answer the embedded result is shown at once, then enriched by `GET /attempts/:id/result` (fragments, competencies, recommendation); a failed enrichment keeps the embedded result.
- Mission page: `JournalCard` in the aside (desktop) and under the status card (phone).
- Result screen, in order after the XP note: personal progress (previous best → now), competencies (`CompetencyBars`), step debrief (`<details>` per step: prompt, competency, wrong/hints, explanation), ledger, fragments, vault line, **Exit ready** block (button posts `/labs/:slug/unlock` with the earned digits; success shows the escape and new badges; refusals are shown as sent), new badges, **Recommended next** (button starts the mission through the app), actions (still exactly three buttons).
- Lobby: `RouteStrip` (mission dots coloured by state/mastery → fragment slots → exit lock state) and a mastery chip per row; the word "Completed" stays in completed rows.
- Dashboard: recommendation block with the server reason and a Start button.
- Density: lower persistent glow on `.case-panel`, `.aside-card`, `.mission-scene`, `.value`; keep it on Submit/Continue, correct feedback, fragments and badges.

## 5. Invariants

Server authority unchanged (the client only renders fields and posts the earned digits to the existing unlock route). `be/src/content.ts` untouched. English asserted strings unchanged; every new string has a French entry. Motion-safe. `.result-actions` keeps three buttons. Budgets: JS entry ≤ 440 000 B, CSS ≤ 140 000 B.

## 6. Testing

Backend `pedagogy.test.ts` (journal, public competency, result steps/previousBest/recommended, mastery thresholds, rules, no key leak). Frontend unit (normalisers, `masteryLabel`, journal and route rendering). E2E `pedagogy.spec.ts` comparing every new figure with the API (`GET /attempts/:id`, `/result`, `/labs/:slug`, `/dashboard`), the exit CTA (server exit becomes true, no code typed), snapshots re-baselined after review, full suite + WebKit smoke, screenshot walkthrough.

## 7. Out of scope (recorded)

Teacher studio, accounts, production hardening, exports, notifications; new biomedical content; a "presentation mode" that hides the honesty notes; client-side text-size or contrast settings (settings are server-owned in this product).
