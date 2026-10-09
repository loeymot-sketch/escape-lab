# Escape Lab backend

API for the Escape Lab design system. It owns everything a student must not be able to tamper with: answer keys, scoring, timers, the Code Vault, lab exits, the Master Lab and teacher analytics.

- **Runtime:** Node 22.18+ (runs TypeScript natively, no build step) with the built-in `node:sqlite`. **Zero runtime dependencies.** `typescript` and `@types/node` are dev-only, for `npm run typecheck`.
- **Status:** MVP. The backend suite covers the full journey of 3 labs and the Master Lab, plus the seeded demo class. The current test counts live in `docs/FINAL_VALIDATION_REPORT.md`, not here, so they do not go stale.
- **Node check:** `npm test` and `npm run typecheck` verify the Node version first; `npm start` and `npm run seed:demo` do not, and fail on Node < 22.18 with `node: bad option: --disable-warning=ExperimentalWarning`.

```bash
npm install            # dev tools only
npm test               # in-memory database, fake clock (count: see docs/FINAL_VALIDATION_REPORT.md)
npm run typecheck
cp .env.example .env   # set AUTH_SECRET
npm start              # http://localhost:3000   (docs: GET /api/openapi.json); listens on all interfaces, or on 127.0.0.1 only with DEMO_MODE=1 (override with HOST)
DB_PATH=./data/demo.db npm run seed:demo   # Alex Martin, Dr. Claire Moreau and a class of 38 (see Demo mode)
DEMO_MODE=1 DB_PATH=./data/demo.db npm start
```

## How the game maps to the API

| Design system | Endpoint |
| --- | --- |
| `LabMap` / `LabJourney`, `LabNode` states | `GET /api/labs` returns `completed`, `current`, `available`, `locked`, `coming_soon` and `lockedReason` ("Clear 3 labs (1 of 3 cleared)") |
| Lab lobby, `MissionCard` (completed, current/available, locked) | `GET /api/labs/:slug` returns each mission's `state`, `bestScore`, `unlocksWith` ("Complete mission 01 to unlock") and the vault |
| Mission shell, six engines | `POST /api/missions/:id/start`, then `POST /api/attempts/:id/answer` per step |
| `FragmentFound` | `fragment: {labSlug, position, digit}` in the answer response (only when newly found) |
| `CodeVault` | `GET /api/vault` returns slots such as `[7, 4, null]`. The code itself is never returned |
| `CodeLock` | `POST /api/labs/:slug/unlock {code}`: 200, 409 `vault_incomplete`, 422 `incorrect_code`, 429 after 5 wrong codes in 10 minutes |
| `LabAssistant` (BETA) | `POST /api/attempts/:id/hint`: costs 15 XP, `source` is `assistant` or `standard` |
| `ScoreLedger`, `ResultPage` | `GET /api/attempts/:id/result`: `ledger` rows (`earned`, `penalty`, `unearned`), `stats`, `badge`, `masterCode`, `competencies`, `strongest`, `improvement` |
| `DashboardPage` | `GET /api/dashboard`: level, XP, streak, progress, `continue` (a mission, or `kind: "unlock"` when only the code lock remains), `recommended` |
| `ProfilePage`, settings (language, sound, reduced motion, notifications) | `GET` / `PUT /api/profile`: identity, XP (earned and carried over), level, accuracy, average mission time, labs, badges, settings |
| Lab results page | `GET /api/labs/:slug/results` once the lab is escaped: lab XP, accuracy, total time, hints, per-mission scores, `ledger`, competencies, badge, code digits |
| `Leaderboard` | `GET /api/leaderboard?scope=week\|all&cohort=class\|all`: top 20 plus your own row in `me`. `total` counts the students with XP in the window, the same for every viewer (a student without XP is not ranked; their `me` row has `rank = total + 1`). Names are abbreviated ("Inès M."), no emails. `week` counts XP earned in the last 7 days |
| Badges, competencies | `GET /api/badges` (7 badges), `GET /api/competencies` |
| Teacher roster | `GET /api/classes/:id/students?q=&status=all\|attention\|active\|inactive` and `.../students/:studentId` (metrics, labs, competencies, attempt history with `answersSubmitted`) |
| Teacher cohort view ("Needs attention") | `GET /api/classes/:id/analytics`: cohort figures, `hardestMission`, per-mission `successPct`, `cleanFirstTryPct`, `avgTime`, `avgHints`, per-step `avgWrong`, content status |
| Content approval (Draft, Reviewed, Approved) | `GET /api/content/missions`, `PUT /api/content/missions/:id/status` (teachers only; approval requires a prior review) |
| Demo mode | `POST /api/auth/demo {role}`, `POST /api/demo/reset` (only with `DEMO_MODE=1`) |

The route table, request bodies and the error statuses (400, 401, 403, 404, 405, 409, 413, 415, 422, 429, declared per route) are generated from code: `npm run openapi` writes `openapi.json`, and the running server serves it at `/api/openapi.json`. Success-response schemas are not yet machine-described (error bodies share one `{ error: { code, message, details? } }` shape); see `docs/API_CONTRACT_MATRIX.md` and the frontend normalizers in `web/src/lib` for the consumed shapes.

### Answer shapes (`POST /api/attempts/:id/answer`)

```jsonc
{ "stepId": "hem-01-s1", "response": { "x": 62, "y": 41 } }                       // image_identify (percent of the image box)
{ "stepId": "hem-03-s1", "response": { "choice": "A" } }                           // choice / stepper
{ "stepId": "hem-02-s1", "response": { "decision": "reject" } }                    // decision cards
{ "stepId": "mic-02-s1", "response": { "order": ["heat", "crystal", "iodine", "decolor", "safranin"] } }  // drag order
{ "stepId": "mic-03-s1", "response": { "pairs": { "pink-mac": "ecoli", "swarm": "proteus" } } }           // matching
```

A malformed response is a `400` and costs nothing. A well-formed wrong response returns `correct: false`, `penaltyXp: -10`, the pointer "Not quite. Compare the MCV with the reference range first." and, for order and matching only, `progress: {correct, total}`. The explanation arrives only with a correct answer.

## Rules

| Rule | XP |
| --- | --- |
| Base mission | +100 (Master Lab +300) |
| First attempt | +30 if every step was solved first time (Master Lab: +30 per step) |
| Time bonus | up to +30 (Master Lab +90): full inside 25% of the time limit, linear to 0 at the limit |
| No hint | +20 (Master Lab +60) |
| Wrong answer | -10 each |
| Hint | -15 each |

Maximum is 180 XP per mission and 570 for the Master Lab. A score never goes below 0. **Total XP is the sum of the best score per mission**, so a replay can improve a score but never farm XP. `GET /api/rules` publishes these numbers. Level n starts at 250 x n x (n - 1) XP (0, 500, 1,500, 3,000, 5,000, 7,500, 10,500 ...), the same curve as the design system's XP indicator. Seven badges: one per escaped lab (Hematology Detective, Microbiology Investigator, Biochemistry Analyst), First Escape, Perfect Mission, No Hint and Clinical Detective.

**Accuracy** of a mission is steps solved / (steps solved + wrong answers) for the best attempt. Lab and overall accuracy are the mean of mission accuracies. **Teacher "success"** of a mission is the class mean of that accuracy (the lowest mission is the hardest; only that one is flagged, and only when it falls under 70% and at least 3 students completed it, or every student of a smaller class; the Master Lab is never counted); the share of clean first tries is returned beside it. A student **needs attention** after 7 days without activity while unfinished, or with accuracy under 60%. **Labs completed** (dashboard, profile, leaderboard, roster, analytics) counts the three standard labs whose exit code was entered, out of 3; the Master Lab is the capstone with its own badge and is not counted. The dashboard's **overall progress** (`overall.completedMissions` of `totalMissions`) uses the same basis as the profile and the teacher views: the nine standard missions; the Master Lab is extra and never makes it "10 of 9".

**Teacher names** identify reviewers, so a teacher account cannot hold a name that reads like a colleague's: at registration (invite code) and on rename the names are compared through a canonical key (Unicode NFKC, case, accents, spacing and punctuation, zero-width / soft-hyphen / bidi / private-use characters, Arabic and Hebrew vowel marks, Cyrillic and Greek lookalikes in both cases, and the Latin look-alike classes `I l 1 |` and `O 0`) and a clash is `409 name_taken`. A name has exactly one canonical key, so "reads the same" is an equivalence relation; a rename is refused iff another teacher's key equals the new key (a teacher may stay inside their own name class). Case is folded before the look-alike table is applied, so a capital and its lower-case form always have the same key. Bidi override / embedding / isolate characters (U+202A-U+202E, U+2066-U+2069, U+061C) are a `400 validation_error` in every name. The check and the write share one write transaction, so two processes on one database cannot both win. A name containing `teacher` followed by `#`, `♯` or `№` and a number (any Unicode digits or the look-alike letters `I l | O`, with or without brackets, e.g. `(teacher #10)`, `teacher #1O`) or nothing visible (only private-use / invisible characters) is refused (`400 validation_error`), for every role; `(teacher #number)` is the suffix appended to every review record. The seeded demo teacher's name stays reserved.

Escape mechanic: each standard mission gives one digit the first time it is completed. Three digits form the lab code. Entering it exits the lab and earns its badge. The Master Lab opens after three exits, gives one digit per solved step (kept even if the attempt is abandoned), and needs the four-digit code (3916) for the Clinical Detective badge. Missions unlock in order inside a lab.

## Demo mode

`npm run seed:demo` plays the real game with a controlled clock to build the presentation data, so every figure is what the rules give: **Alex Martin** (Biomedical Sciences L3, level 6, 8,240 XP, accuracy 87%, 02:43 average mission time, one hint, 4 badges, Hematology escaped with 435 XP, 92% and 09:08) and **Dr. Claire Moreau** with a class of 38 (31 active, 81% accuracy, 73% completion, 5 needing attention, Acid-Base Emergency the hardest at 59%). A second empty class (L2) shows the empty state.

- Logins: `claire.moreau@demo.escape-lab.app` and `alex.martin@demo.escape-lab.app`, password `demo-password-1`; with `DEMO_MODE=1`, `POST /api/auth/demo {"role":"student"|"teacher"}` signs in without a password.
- `POST /api/demo/reset` replays Alex's story from scratch, or, for the demo teacher, restores the name, the two seeded classes (visitor-made classes are deleted) and the content reviews the demo teacher itself made (back to draft, recorded as extra `content_audit` rows); reviews made by other teachers are left untouched. 403 for every other account.
- With `DEMO_MODE` off the accounts created by the seed (`users.is_demo_account = 1`, set by `seedDemo` and backfilled by migration 7 for databases seeded earlier) cannot sign in (same 401 as a wrong password) and their old tokens stop working; the `@demo.escape-lab.app` domain cannot be registered any more. A real person who registered on that domain before it was reserved keeps access.
- With `DEMO_MODE=1` the server listens on `127.0.0.1` only; set `HOST=0.0.0.0` to expose it (the Dockerfile does). `HOST` is trimmed, `localhost` means `127.0.0.1`, IPv6 is written `::1` or `[::1]`; an invalid `HOST` (including dotted numbers that are not an IPv4 address) or `PORT`, or a port already in use, stops the server with one clear message and exit code 1.
- **XP carry-over:** the nine missions are worth at most 1,620 XP, so a level-6 persona cannot be earned inside this MVP. The difference is stored as `xp_carry` and reported separately (`xp.carriedOver`) rather than faked as score. The seed search is deterministic (plan 461); it is checked by the tests.
- Never enable `DEMO_MODE` in production.

## Security model

- Answer keys, explanations, recheck pointers and hints live only in `src/content.ts`. Public views are built in `src/engines.ts` and tests scan the lab, lobby, vault and mission payloads, and the public OpenAPI document, for answer keys and exit codes (the order/match `progress` count is a documented, deliberate partial signal).
- Scoring, timers and penalties are computed on the server from server timestamps. The client sends only answers.
- Passwords: scrypt. Tokens: HMAC-SHA256, 7 days. Login gives the same response whether or not the account exists. Rate limits on registration, login and the exit code (the code lockout is stored in the database, so it survives restarts). Limits that `.env` does not configure: 8 failed logins per account and IP per 10 minutes (on top of the per-IP failure limit), and 60 demo sign-ins (`POST /api/auth/demo`) per 10 minutes per IP (1,000 when `NODE_ENV=test`). Every limiter key is the raw socket address: there is no grouping of an IPv6 /64 and no folding of IPv4-mapped IPv6, so a client that can use many IPv6 addresses gets a fresh budget per address (round 36, A36-002, not fixed).
- Teacher accounts need `TEACHER_INVITE_CODE`. A teacher only sees classes they own, and the roster exposes names but no emails. A teacher owns at most 50 classes (`409 class_limit_reached`) and cannot own two with the same name, case, spacing and invisible characters ignored (`409 class_name_taken`, with `details`), profile/class/content-review writes are limited to 60 per minute per account (`RATE_WRITE_PER_MINUTE`), a teacher cannot rename themselves to another teacher's name (`409 name_taken`), and content reviews are attributed as `Name (teacher #id)`.
- The database file and its `-wal`/`-shm` files are created owner-only (0600); an existing file is only ever narrowed to 0600. A database file the process cannot write (no owner write bit such as 0444 / 0400, a read-only mount) ends start-up with one line (`Escape Lab API cannot start: cannot use the database at <path>: the database file is not writable ...`) and exit code 1, instead of serving reads while every write answers 500; the file is not touched. A database written by a newer build is refused before anything is changed.
- Passwords are hashed as NFC and the 10-character minimum is counted on the NFC form (a password needs at least 6 visible characters: whitespace, zero-width and filler characters do not count); login also accepts the exact string an older build hashed. Responses carry `Access-Control-Expose-Headers: Retry-After` for browser clients. `HEAD` on a `GET` route answers like `GET` without a body (uptime probes, load balancers) and never writes: an overdue attempt is closed by the next `GET`, not by a `HEAD`.
- Request bodies are capped at 64 KB, JSON only, validated against the same schemas that produce the OpenAPI document. CORS is limited to `CORS_ORIGIN`.
- Every multi-statement mutation runs in a `BEGIN IMMEDIATE` transaction; single-statement writes (register, profile, class create/join, lazy expiry) rely on SQLite's statement atomicity and UNIQUE constraints. Schema migrations also run under `BEGIN IMMEDIATE` and re-read the version inside it, so several processes starting at once are safe.

## Lab Assistant

Without configuration every hint is the faculty-written standard hint (up to two per step). With `LAB_ASSISTANT_API_KEY` and `LAB_ASSISTANT_MODEL` set, hints come from the Anthropic Messages API with a 4 second timeout. The reply is discarded in favour of the standard hint if it names the correct option (by label, or by the letter, number or position the learner sees: "Option C", "C is correct", "the third option"), says "the answer is", has no visible letter / digit / emoji, errors or times out. The penalty is the same either way. Only the guard and the fallback paths are covered by tests, with a fake `fetch`. The live API call has not been run here.

## Content

`src/content.ts` is the single source of truth: 11 labs (4 playable, 7 "coming soon"), 9 missions and the 4-step Master Lab. **It is illustrative placeholder content and faculty must validate every case, value, key and explanation before students see it.** Image hotspots are percentages of the image box and must be recalibrated against the final assets (`smear-schistocyte-01`, `panel-hemolysis-01`). Adding a mission means adding an entry to `MISSIONS`: `test/content.test.ts` then checks that its key is consistent with its data, that exit codes stay valid and that "always B" patterns don't creep in.

## Known limits and next steps

- SQLite on a single node. For several instances, move to Postgres: the SQL is plain and lives in `src/game.ts`, `src/routes.ts` (auth), `src/app.ts` and `src/demo.ts`.
- No email verification, password reset or token revocation yet.
- No admin UI for content, and no per-class assignment of labs.
- The Dockerfile is provided but has not been built here.
- Accessibility needs of the game (extra time) are not modelled: add a per-user time multiplier before real students use it.
