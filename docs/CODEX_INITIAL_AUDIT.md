# Escape Lab — Initial Audit

> **State as of 2026-10-09:** the figures in this document date from earlier passes. The reference state is in `docs/FINAL_VALIDATION_REPORT.md` (local validation only): its **current state** (test counts, snapshot id, convergence status) is in its "État vérifié le plus récent" section at the top of the file; its later sections are history. The release verdict remains **ESCALATE**: no remote CI, no independent human review, no biomedical validation.

Date: 2026-10-04  
Scope: `escape-lab-backend (1).tar.gz`, extracted to `be/`.

## Repository state

The supplied repository contained a complete TypeScript backend package and no frontend, shared design system, screenshots, or visual exports. The backend has been copied into `be/` as the product source of truth. The target frontend directory `web/` was absent at audit time.

### Positive signals (not a readiness claim)

- Clear server-authoritative boundary for answers, scoring, timers, hints, code vault fragments, exits, badges, and teacher analytics.
- SQLite persistence with transactional mutations and a documented single-node deployment model.
- Generated OpenAPI contract at `be/openapi.json` and a route table exposed by the running API.
- Authentication, role checks, request validation, rate limits, demo mode, and public-payload leak tests are present.
- Backend README documents the mission catalogue, engine payloads, scoring rules, demo credentials, security model, and known limits.

### Prototype / next-phase signals

- Content is explicitly illustrative and requires faculty validation before real student use.
- Scientific image hotspots depend on final assets that are not included in the archive.
- SQLite is single-node; there is no email verification, password reset, token revocation, content-admin UI, or assignment model.
- Accessibility time extensions are not modelled.
- The Dockerfile has not been built as part of this audit.
- No frontend, responsive UI, visual QA assets, or end-to-end browser harness was supplied.

## Backend

### Routes and product areas

The API includes health and OpenAPI discovery, auth/demo sign-in, current-user profile/settings, labs and missions, attempts/answers/hints/results, vault and lab unlocks, dashboard, leaderboard, badges, competencies, teacher classes/rosters/student detail/analytics, content approval, and published rules. The exact contract is in `be/openapi.json` and the route implementation is in `be/src/routes.ts`.

### Game logic and engines

`be/src/content.ts` is the single content source for four playable labs, seven coming-soon labs, nine standard missions, and the four-step Master Lab. `be/src/engines.ts` validates the six reusable engine families: image identify, choice, drag order, matching, decision, and stepper. `be/src/game.ts` owns availability, attempts, server timestamps, scoring, fragments, vault state, exits, badges, dashboard, profile, leaderboard, and teacher views.

### Tests

The archive documents 46 backend tests covering content consistency, scoring, persistence, auth, the complete journey, demo seed/reset, assistant fallback, and teacher analytics. The test command could not run in the current shell because the installed Node runtime rejects `--disable-warning=ExperimentalWarning`; the backend declares Node `>=22.18` and must be re-run under that runtime.

### Database, auth, demo mode, limitations

The database is SQLite via Node's built-in `node:sqlite`, with explicit transactions and persisted attempts, best scores, vault fragments, exits, badges, classes, and XP events. Passwords use scrypt; tokens use HMAC-SHA256 with seven-day expiry. Demo mode is opt-in and exposes seeded student/teacher flows plus a reset limited to the flagged demo student. Known limitations are preserved from `be/README.md` and are not being expanded in this visual phase.

## Frontend

No frontend exists in the supplied archive or workspace. There is therefore no existing framework, architecture, design fidelity, or frontend technical debt to preserve. The implementation will use a small Next.js-compatible React/TypeScript app under `web/`, with a tokenized CSS design system and a typed API client that keeps all game authority on the backend.

## Design assets

No screenshots, Claude-designed frontend, image exports, biomedical microscopy assets, or validated scientific illustrations were present. The frontend must use clearly labelled placeholders/decorative surfaces for scientific imagery and must not imply that placeholder visuals are faculty-validated diagnostic material.

## Risks

- Scientific assets: image-identify missions require final validated assets and recalibrated percentage hotspots.
- Responsive design: map, mission shell, drag ordering, matching, and teacher tables need deliberate narrow-screen behavior.
- Auth/token strategy: browser storage and expiry recovery must be handled without exposing secrets or losing a mission state.
- Frontend/backend contract: engine payloads and error shapes must follow `be/openapi.json`; no client-side answer keys or scoring.
- Game persistence: refresh and resume depend on fetching the active attempt and treating server responses as authoritative.
- API errors: rate limits, locked missions, incomplete vaults, expired sessions, and malformed responses need user-readable states.
- Mobile interactions: drag order must have keyboard and button-based alternatives, not pointer-only behavior.
- Performance: avoid large visual libraries and keep decorative effects CSS-only.
- Accessibility: visible focus, semantic controls, reduced-motion support, contrast, and status announcements are required.
- Demo mode: demo credentials and reset controls must be explicit and must never be assumed in production.

## Audit conclusion

The backend is a strong MVP contract with a missing presentation layer. The next implementation phase is frontend foundation plus product integration only. No database migration, answer-key change, scoring change, medical-content rewrite, or new infrastructure is authorized by this audit.
