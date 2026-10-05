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
Other widths (900, 1199, 1200, 1440 px) are checked inside `12-layout-v2` by resizing the desktop
page, without a third project (the flows that write data tag records per viewport, `M` / `D`).
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
| `02-gig-create-costs` | New gig from a template → cost lines → assign a person → load-in switch → mark paid → economics; gig list summary and year page updated without reload; double-booking warning; cost lines edited in place (budget, description, paid amount), Esc, invalid amounts |
| `03-gig-lifecycle` | Gig info and price edited in place (Esc, invalid values, no Edit/Save buttons); edit price and additional sales; move; cancel and adjust price; uncancel; delete; restore from the deleted view; history lists all events |
| `04-attachments` | Upload a synthetic PDF, download it, remove it; a fake PDF is refused (415) with a translated message |
| `05-people` | Add, rename in place, deactivate with the switch; Esc / empty name; the person page shows their lines; reactivate from the list |
| `06-tasks` | Add, mark done, reopen; edit title / description / owner / due date in place, Esc, empty title; delete |
| `07-hours` | Add own entry; totals page and year page updated; edit hours / comment in place, Esc, invalid hours |
| `08-budget` | Seed rows "Category A…I", each with name field, four money cells and "Poista rivi <name>"; edit a row in place (PUT per cell save, Esc, invalid amount); year page budget and year result; copy to the next year (and the 409 on a second copy). Partner-managed rows (UC-020 A2–A4): add ("Rivin nimi" + "Lisää rivi") → zeros in this and the next year; empty → REQUIRED and duplicate (case-insensitive, trimmed) → "Nimi on jo käytössä.", nothing sent / created; rename in place (blur, Enter, Esc, empty, duplicate) persists after reload and the money cell labels follow; remove: Cancel keeps it, "Poistetaanko rivi?" → Poista hides it from every year, the totals and the year page; API: removed row's PUT / PATCH → 404 |
| `09-language-year` | Switch to English with the one language toggle; change year (buttons and picker); both survive a reload; signed-in partner shown |
| `10-no-horizontal-scroll` | No horizontal scroll on every main page (and with expanded content) |
| `11-cross-checks` | Seller change moves Sales lines; EN amount input; upcoming gigs in an empty year; hours saved for another year; gig search + cancelled filter |
| `12-layout-v2` | Desktop: sidebar collapse / expand persists across reload and tabs; collapsed nav items and account controls reachable by accessible name; tooltip keeps the name (F-005, `fixme`); gig list cards below 1200 px / table from 1200 px (1199, 1200, 1440); cost list compact rows at 1280 px, full table at 1440 px; no horizontal scroll on every page with the sidebar expanded and collapsed at 900, 1280 and 1440 px. Phone: ☰ drawer opens, traps focus, closes on Esc / backdrop / close / navigation / back, returns focus to ☰; no horizontal scroll on every page with the drawer open. Both: one theme toggle, persists across reload |
| `13-tech-logistics` | New gig form: "Tekniikka" and "Logistiikka" selects (with "–") and the "Talon teknikko" switch; Set A + Own van + house technician sent as single codes / boolean; on the gig page each control saves on change (one PATCH per field), "–" clears to null, reload persists, history shows old → new. API: arrays and unknown codes → 400 `INVALID_VALUE`, omitted fields default to null / null / false |

Every test also fails on uncaught page errors or `console.error` output in the browser.

## Rules

- **Synthetic data only (BR-090):** "Partner A", "Person 1", "Venue X", `@example.com`. Money
  values typed by the tests are 1000 cents or multiples of 10000 cents.
- Prefer accessible roles and names; shared locators for the restyled markup live in
  `tests/gigs.ts` (gig page, gig list; `createGigViaApi()` sends `technicalSetup` / `logistics` as
  one code or null and `houseTechnician` as a boolean, contract 2026-10-05), `tests/year.ts` (year page figures) and `tests/helpers.ts`
  (`pageHead`, `goNav`, `openDrawer`, `signOutFromHeader`, `languageButton`, `themeButton`,
  `expectSignedInShown`). Shared page list: `tests/pages.ts`.
- **Layout v2:** from **900 px** (`isWide()`) the main nav is a collapsible left sidebar; below
  that, ☰ ("Valikko") opens it as the drawer dialog "Päävalikko" — `goNav()` opens the drawer on
  phones and checks that it closes. Language, theme and sign-out are found **by accessible name**,
  in the drawer on phones and anywhere on the page on desktop (not by sidebar position), so the
  move to the top bar (TASK-132) needs no test change. The gig list is a table only from
  **1200 px** (`isGigTable()` in `tests/gigs.ts`), cards below.
- **Inline editing (NFR-8):** edit like a user — `editInline()` focuses the field, types, leaves
  it (blur) or presses Enter and waits for the write; `selectInline()` for selects. Then assert the
  value **after `page.reload()`** to prove it reached the backend. `expectEscReverts()` and
  `expectInvalidNotSent()` check that nothing is sent; `expectNoEditSaveButtons()` that existing
  items have no Edit/Save buttons. Input values are not text: use `toHaveValue()` on the field's
  label ("Budjetti: Laulu", "Kommentti: <date> <comment>", "Nimi: <name>"…), not `getByText()`.
  Every inline field has its own polite `role="status"` region, so pick page notices by text.
- The tests never change `frontend/` or `backend/`. A failure caused by the app is recorded in
  `FINDINGS.md` and the test is marked `test.fixme('…', 'F-00x …')`.
