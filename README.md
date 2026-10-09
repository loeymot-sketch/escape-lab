# Escape Lab

Escape Lab is a biomedical learning MVP with a server-authoritative Node/SQLite backend and a premium React/Vite frontend.

> **Status (read first).** Local academic prototype. Technically verified **locally only** (no remote CI, no independent human review; the audit rounds were run by AI agents of the same team). **Not biomedically validated**: questions, answers, explanations, hints, values and images are unreviewed by experts, and the images are illustrative, not clinical references. **Not production ready.** Not yet fully accessible: no real screen-reader test has been done, and the Blood Smear Code mission has no non-visual alternative. Convergence of the audit loop is **not** claimed: see `docs/FINAL_VALIDATION_REPORT.md` (top section) for the current numbers and `docs/KNOWN_LIMITATIONS.md` for open items.

## Putting it online

The site builds on Vercel from `web/`; the API needs its own host. Read `docs/DEPLOY.md` first: it explains the three settings and the risk of a public demonstration API (FR / EN).

## Run locally

**Step 0, in every terminal:** run `node -v`; it must print **v22.18 or higher** (`nvm use 22`, or `export PATH=$HOME/.nvm/versions/node/v22.23.2/bin:$PATH`). The default shell Node on the machine that produced the evidence is 18. Only the test, typecheck, build and end-to-end commands check the version (`pretest`, `pretypecheck`, `prebuild`, `pretest:e2e`); `npm start` and `npm run seed:demo` have **no version preflight**, so on Node 18 they fail with a raw `node: bad option: --disable-warning=ExperimentalWarning` instead of a friendly message.

Backend (Node 22.18+):

```bash
cd be
npm install
cp .env.example .env
DB_PATH=./data/demo.db npm run seed:demo
DEMO_MODE=1 DB_PATH=./data/demo.db npm start
```

Frontend:

```bash
cd web
npm install
npm run dev
```

The frontend uses `VITE_API_URL` when provided and otherwise targets `http://localhost:3000/api`. The demo API listens on `127.0.0.1` only (IPv4); to avoid depending on how `localhost` resolves, start the frontend with `VITE_API_URL=http://127.0.0.1:3000/api npm run dev` and open it at `http://localhost:5173` (the `CORS_ORIGIN` of `.env.example`). It opens directly in the student guest demo: no user account, registration or sign-in screen is exposed. The faculty demo is an optional in-product guest switch. Demo mode requires the backend to be seeded and started with `DEMO_MODE=1`.

## Product boundary

The backend remains authoritative for answers, scoring, timers, attempts, hints, code fragments, exits, badges, and teacher analytics. The frontend only renders public payloads and submits user responses.

Scientific imagery in this MVP is illustrative training artwork, always labelled as such on screen. It is not clinical imagery and has not been validated by a biomedical reviewer; replace it with faculty-approved assets (and recalibrate the hotspot keys in `be/src/content.ts`) before any real teaching use.

See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for the current known limitations, [docs/FINAL_VALIDATION_REPORT.md](docs/FINAL_VALIDATION_REPORT.md) for the verification state, and [docs/CODEX_INITIAL_AUDIT.md](docs/CODEX_INITIAL_AUDIT.md) for the initial (historical) repository audit.

## Demonstration (faculty / Erasmus)

The app has an in-app **About & demo guide** page (sidebar, both guests): principle, limits, an 8-step guided demonstration of about 7 minutes, what is verified and what is not, and the validation roadmap. The presenter script is in [docs/FACULTY_DEMO_SCRIPT.md](docs/FACULTY_DEMO_SCRIPT.md) (French), the portfolio screenshots in [docs/demo-screenshots/](docs/demo-screenshots/), the biomedical review backlog in [docs/SCIENTIFIC_REVIEW_BACKLOG.md](docs/SCIENTIFIC_REVIEW_BACKLOG.md), and the current validation status in [docs/FINAL_VALIDATION_REPORT.md](docs/FINAL_VALIDATION_REPORT.md).

Status: **a technically verified (locally) academic prototype, demonstrable.** Biomedical content is **not validated** by experts, images are illustrative, faculty data is generated demonstration data, and no remote CI or independent human review exists. Not production ready.
