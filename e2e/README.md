# Instaglamour ERP — end-to-end tests

Playwright (Chromium) tests that run the **real frontend against the real backend** (TASK-004).
Mismatches and bugs found are recorded in [`FINDINGS.md`](FINDINGS.md).

## Run

Needs Node 24 and Docker. From the repo root:

```bash
cd e2e
npm install
npx playwright install chromium
npm run e2e
```

`npm run e2e` does everything:

1. `scripts/prepare.mjs`
   - installs `backend/` and `frontend/` dependencies if `node_modules` is missing,
   - `docker compose up -d --wait db-test` (the **test** Postgres on `127.0.0.1:5433`; the dev
     database on 5432 is never touched),
   - drops and recreates the database **`instaglamour_e2e`**, runs the migrations and loads
     `backend/seed/seed.example.json` (synthetic data only — never `seed.local.json`),
   - empties the upload directory `$TMPDIR/instaglamour-e2e-uploads`.
2. `playwright test`, which starts
   - the backend (`scripts/start-backend.mjs`) on **http://127.0.0.1:3100** with
     `DEV_LOGIN_ENABLED=true`, `FRONTEND_URL=http://localhost:5180`, `UPLOAD_DIR` under `/tmp`,
   - the frontend dev server (`scripts/start-frontend.mjs`) on **http://localhost:5180** with
     `VITE_USE_MOCKS=false`, `VITE_DEV_LOGIN=true` and `/api` proxied to the backend on 3100
     (see FINDINGS F-001 for why the proxy is overridden from here).

All configuration is passed as environment variables (`scripts/env.mjs`); no `.env` file is read
or written. The values there are local-only placeholders, not secrets.

Every flow runs twice: project **`mobile-375`** (375 × 812, touch) and **`desktop-1280`**.
The suite shares one database and runs with one worker, in file order; it expects the fresh
database that `npm run e2e` creates.

### Options

| What | How |
|---|---|
| Other ports | `E2E_BACKEND_PORT=3200 E2E_FRONTEND_PORT=5190 npm run e2e` |
| Watch the browser | `npm run e2e:headed` |
| One viewport | `npm run e2e -- --project=mobile-375` |
| One file | `npm run e2e -- tests/05-people.spec.ts` |
| Report of the last run | `npm run e2e:report` |
| Reuse servers you started yourself | `node scripts/prepare.mjs`, then `node scripts/start-backend.mjs` and `node scripts/start-frontend.mjs` in two terminals, then `E2E_REUSE=1 npx playwright test` |
| Backend logs | `E2E_LOG_LEVEL=info npm run e2e` |

## What is covered

| File | Flow |
|---|---|
| `01-login-year` | Dev login → year page figures match `GET /api/years/{year}`; sign out; ended session → sign-in with notice; unknown email refused |
| `02-gig-create-costs` | New gig from a template → cost lines → assign a person → load-in switch → mark paid → economics; gig list summary and year page updated without reload; double-booking warning |
| `03-gig-lifecycle` | Edit price and additional sales; move; cancel and adjust price; uncancel; delete; restore from the deleted view; history lists all events |
| `04-attachments` | Upload a synthetic PDF, download it, remove it; a fake PDF is refused (415) with a translated message |
| `05-people` | Add, rename, deactivate; the person page shows their lines |
| `06-tasks` | Add, mark done, reopen |
| `07-hours` | Add own entry; totals page and year page updated |
| `08-budget` | Edit a row; year page budget and year result; copy to the next year (and the 409 on a second copy) |
| `09-language-year` | Switch to English; change year (buttons and picker); both survive a reload |
| `10-no-horizontal-scroll` | No horizontal scroll on every main page (and with expanded content) |
| `11-cross-checks` | Seller change moves Sales lines; EN amount input; upcoming gigs in an empty year; hours saved for another year; gig search + cancelled filter |

Every test also fails on uncaught page errors or `console.error` output in the browser.

## Rules

- **Synthetic data only (BR-090):** "Partner A", "Person 1", "Venue X", `@example.com`. Money
  values typed by the tests are 1000 cents or multiples of 10000 cents.
- The tests never change `frontend/` or `backend/`. A failure caused by the app is recorded in
  `FINDINGS.md` and the test is marked `test.fixme('…', 'F-00x …')`.
