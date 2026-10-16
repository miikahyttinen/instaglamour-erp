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
| Another database (two checkouts at once) | `E2E_DB_NAME=instaglamour_e2e_mine npm run e2e` (must match `instaglamour_e2e[a-z0-9_]*`; the upload dir gets the same suffix) |
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
| `07-hours` | Add own entry; totals table (total row, filtered by me) and year page updated; edit hours / comment in place, Esc, invalid hours |
| `08-budget` | Seed rows "Category A…I", each with name field, four money cells and "Poista rivi <name>"; edit a row in place (PUT per cell save, Esc, invalid amount); year page budget and year result; copy to the next year (and the 409 on a second copy). Partner-managed rows (UC-020 A2–A4): add ("Rivin nimi" + "Lisää rivi") → zeros in this and the next year; empty → REQUIRED and duplicate (case-insensitive, trimmed) → "Nimi on jo käytössä.", nothing sent / created; rename in place (blur, Enter, Esc, empty, duplicate) persists after reload and the money cell labels follow; remove: Cancel keeps it, "Poistetaanko rivi?" → Poista hides it from every year, the totals and the year page; API: removed row's PUT / PATCH → 404 |
| `09-language-year` | Switch to English with the one language toggle; change year (buttons and picker); both survive a reload; signed-in partner shown |
| `10-no-horizontal-scroll` | No horizontal scroll on every main page (incl. Ostotilaukset), incl. offers (list, deleted view, new, offer page) and clients (list, client page) (and hours totals filtered and sorted; the gig economics toggle is gone with the Excel table) |
| `11-cross-checks` | Seller change moves Sales lines; EN amount input; upcoming gigs in an empty year; hours saved for another year; gig search (API `q`) + Tila filter "Peruttu" (client-side); a fresh visit hides the cancelled gig until "Tyhjennä suodattimet" |
| `12-layout-v2` | Desktop: sidebar collapse / expand persists across reload and tabs; the nine nav items (Vuosi, Tarjoukset, Keikat, Ostotilaukset, Asiakkaat, Henkilöt, Tehtävät, Tunnit, Budjetti) in menu order, collapsed items and account controls reachable by accessible name; tooltip keeps the name (F-005, `fixme`); gig list is one Excel-style table "Keikkalista" at 1199 / 1200 / 1440 px with the always-shown columns (Kokoonpano, Päivä, Paikka, Tila, Kokonaishinta, Kate-%) and filter buttons for Kokoonpano / Paikka / Tila (the F-006 table-box check was removed: TASK-147 makes the tables full width without sideways scroll); cost list compact rows at 1280 px, full table at 1440 px; no horizontal scroll on every page with the sidebar expanded and collapsed at 900, 1280 and 1440 px. Phone: ☰ drawer opens, traps focus, closes on Esc / backdrop / close / navigation / back, returns focus to ☰; no horizontal scroll on every page with the drawer open. Both: one theme toggle, persists across reload |
| `13-tech-logistics` | New gig form: "Tekniikka" and "Logistiikka" selects (with "–") and the "Talon teknikko" switch; Set A + Own van + house technician sent as single codes / boolean; on the gig page each control saves on change (one PATCH per field), "–" clears to null, reload persists, history shows old → new. API: arrays and unknown codes → 400 `INVALID_VALUE`, omitted fields default to null / null / false |
| `14-hours-tables` | Hours as flat tables (UC-018, UC-019, TASK-136). Totals "Tuntikirjaukset <year>": every entry of the year exactly once (vs. `GET /hours` per partner), date ascending by default, total row = Σ rows = `grandTotal` = year page "Yhteensä"; filter "Osakas" (Kaikki + every partner) → only that partner's rows, total = their year hours, `?partner=` survives reload, "Kaikki" removes it; 0 h partner → empty message; each column sorts asc / desc (`aria-sort`, the others `none`). Own rows: date / comment / hours inputs + "Poista: …", others' rows no controls; inline hours / comment / date edits update the total row and persist after reload (and on the year page); API PATCH / DELETE of another partner's entry → 403. My hours "Omat tunnit <year>": own entries only, no partner column, total row = year total, sorting, delete with "Poistetaanko tuntikirjaus?" (Peruuta keeps it). Both pages: nothing with `aria-expanded`, one table / one row group, no month headings, no charts; no horizontal scroll (also filtered and sorted) |
| `15-clients` | Clients (UC-027, BR-100, BR-101). Add: empty name → REQUIRED (nothing sent), duplicate in another case with spaces → DUPLICATE from the server, not created; search (substring, case-insensitive), counts = API, order = API. Client page: name (Enter) and notes (blur) in place, Esc, empty, duplicate → refused, reload + API; gigs of all years newest first and offers, each linking to its page. Attach: gig page select saves `{ clientId }` on change, "–" clears, "+ Uusi asiakas…" creates and links; new gig form with "New client…" sends `clientId`; gig list client column (table) / line (cards) and search by client = API `q`. Delete: linked to a gig → dialog shows CLIENT_IN_USE, nothing deleted; offer link and a deleted gig's link → 409 too; unlinked → deleted, gone from the list, `UNKNOWN_REFERENCE` for new links, its name reusable. Anonymous `/api/clients` → 401 |
| `16-offers` | Offers (UC-028, UC-029, UC-031; BR-102…BR-106). New offer: empty-year state; client / event / date / venue REQUIRED (nothing sent); seller = me; lineup from a template; body without `includesText` → setting default; no Spotify field on New offer or the offer page, `spotifyUrl` absent from `OfferDetail`, the preview shows the fixed link (any http(s)); share path ≥ 43 URL-safe chars; preview without price or internal labels; references region shown with "Näytä referenssit" on and gone after switching it off (only presence: reference contents / shape are being redesigned); API REQUIRED; `spotifyUrl` in POST / PATCH → 400 `INVALID_VALUE` (fixed link, contract 2026-10-15). List (current year, tagged offers around today): BR-102 `status` / `expired` of every offer; summary = BR-106 computed from the rows; tiles "Avoimet tarjoukset" / "Voittoprosentti" and caption = that; rows = offers of the year; default sort event date asc; sort price asc / desc (empty last) and event name (headers with `aria-sort` on desktop, `?sort=&dir=` on phones), kept after reload; Tila column filter through the header popover (sheet on phones): Vanhentunut / Avoin (not expired) / Hyväksytty / Hylätty, two values = OR, `f.status=` in the URL, Peruuta and Esc keep it; seller, disposition, event type, source and AND-combinations through `f.<key>=` URLs; API filters (status=OPEN incl. expired, seller, disposition, event type, source) = their rows with an unchanged summary; figures ignore filters; filter + search survive a reload; "Tyhjennä suodattimet" clears filters, keeps the search. Inline source / event type / disposition in the list: one PATCH each, status follows, reload, history (DISPOSITION_CHANGED old → new in API and words); offer page price / event name / disposition in place. Copy link (clipboard or fallback field); regenerate (Cancel keeps it; old 404, new 200, `LINK_REGENERATED`); delete from the page and the row → notice, gone, public 404; Deleted view; deleted page read-only (fields disabled, Restore only), API PATCH / regenerate / convert / delete → 409; restore from the page and the Deleted view. Convert: dialog facts (date with weekday, venue + city, client, lineup = event, price, seller and producer); human double click → one request; gig per BR-105 (custom lineup, seller = producer = offer seller, client, price), offer WON / ACCEPTED, `CONVERTED` + `DISPOSITION_CHANGED`, gig `CREATED`, year page counts it; "Keikka →" in the row and on the page; gig page "Tarjouksesta: <event>" links back; second convert → 409 `ALREADY_CONVERTED`, one gig; no price → 0 €; stale page → "already converted" notice + gig link; two parallel requests → 201 + 409, one gig; zero-delay double click → one gig, success (one request: F-007 `fixme`) |
| `17-public-offer` | Public link (UC-030, BR-104) in a **fresh browser context without cookies**: only that offer (event, client, weekday date, venue, lineup, includes, references region when on (presence only), seller contact, Spotify = the fixed `spotifyUrl` from the JSON, always set); no references region when off; no shell; the price (in every format) is in no DOM and no response body (HTML, scripts, JSON); no notes, ids, source, event type, disposition or other offer; JSON keys exactly the PublicOffer shape; `X-Robots-Tag: noindex`, `<meta name="robots">`, no `Set-Cookie`; every `/api` request is the public GET, none carries a cookie; FI / EN switch sends nothing; the anonymous context gets 401 from `/api/me`, offers, clients, gigs. Unknown (long, altered, short) token → "Tarjousta ei löytynyt"; regenerated → old not found, new works; deleted → not found; an English browser gets "Offer not found" |
| `18-gig-list-filters` | Gig list as an Excel-style table (UC-003, TASK-144), own year per project (2041 / 2042), four tagged gigs (one cancelled). Default view hides the cancelled gig (default Tila filter, not in the URL; no "Näytä myös perutut", Tulevat / Menneet); filter buttons "Suodata: <column>" (`aria-haspopup="dialog"`, `aria-expanded`, "Suodatin käytössä" description when active); popover dialog "Suodata: Tila" (sheet "Suodattimet" on phones) with "Valitse kaikki", "Tyhjennä", "OK" (disabled with nothing checked), "Peruuta" (focus back on the button); tick "Peruttu" → shown; search AND Paikka filter ("Näytetään 2 / 3", no row when nothing passes both); Tila "Peruttu" only + Paikka + search survive a reload; "Tyhjennä suodattimet" removes every `f.*`, keeps `q`. Every status ticked survives a reload: F-008 `fixme` |
| `19-partner-status` | Partner status (UC-032, BR-110…112) on a tagged person per test (seed partners stay active). Grant: switch "Osakas" → dialog "Tee osakkaaksi: <name>"; empty email → REQUIRED (nothing sent), other domain → 400 `INVALID_VALUE`, another partner's email in upper case → `DUPLICATE`, each under the field; valid → "Osakas" label on the person page and in the list, reference partner active; "Osakkuus" filter Osakkaat / Muut / Kaikki = `?partner=` = API, survives reload. Own switch checked + disabled with "Et voi poistaa omaa osakkuuttasi.", API → 409 `CANNOT_REMOVE_SELF`. Remove: the partner signs in (dev login) in a second browser and creates an offer, a gig, a task and hours; Partner A removes (Peruuta keeps it; "Kirjautuminen estyy heti."); the partner's next request → sign-in page with the session notice, `/api/me` 401, dev login refused (UI and 403); not offered as offer seller / task owner; name still on the offer, gig (seller, producer), task owner and hours totals; list under "Muut"; second DELETE → 404 |
| `20-purchase-orders` | Purchase orders (UC-033, UC-034, BR-113…119, TASK-024). Setup via API: a tagged person with fee lines on two played gigs (own past year per project, 2023 / 2024), an upcoming gig, a line paid outside a PO, a 0 € line, a line on a cancelled gig and another person's line; one PO backdated three years in the e2e DB (`backdatePo()`, psql in `db-test`) for the cross-year search. Person page: "Freelancer-linkki" = origin + `/f/<token>`, copy, "Luo uusi linkki" → old link "Linkkiä ei löydy" (404 `NOT_FOUND`). Freelancer page in a fresh context without cookies: only own lines (5 rows), JSON keys exactly FreelancerView / FreelancerLine / PublicPurchaseOrder, `X-Robots-Tag: noindex`, no price / client / notes / other person / partner in page text, DOM or any `/api` body, only public calls; upcoming and paid not selectable, cancelled gig and 0 € line hidden; tick fees of two gigs → total → create → number `^[A-Z0-9-]+-\d{4,}$` starting with the name slug, fees "Ostotilaus <number>". Two parallel public creates with the same line → 201 + 409 `COST_LINE_NOT_ELIGIBLE` (`details.costLineIds`), one PO. Ostotilaukset: PO in the year list, search by part of the number (all years, "Haetaan kaikilta vuosilta") also finds the other-year PO; "Merkitse maksetuksi: <number>" → green "Maksettu <d.m.yyyy> klo <hh.mm>" = API `paidAt`; gig page: lines paid with the PO amount, "Ostotilaus <number>" tag linking to the PO, person / budget / load-in disabled, no pay / unpay / remove; `PATCH budgetedCents` → 409 `COST_LINE_ON_PURCHASE_ORDER`; freelancer page "Maksettu". PO page: "Peru maksu" (confirm) → Avoin, lines unpaid; "Peru ostotilaus" (reason required) → Peruttu, fees selectable again on the freelancer page (reason not shown there); history on the PO page and the list log = created (Freelancer), paid, unpaid, cancelled with Partner A, newest first (= API). Gig cancel with a line on an open PO → 409 shown in the dialog ("Rivi on ostotilauksella <number>."), gig still SOLD after reload; delete → 409. No horizontal scroll on the list, PO page and freelancer page |

Every test also fails on uncaught page errors or `console.error` output in the browser.

## Rules

- **Synthetic data only (BR-090):** "Partner A", "Person 1", "Venue X", `@example.com`. Money
  values typed by the tests are 1000 cents or multiples of 10000 cents.
- Prefer accessible roles and names; shared locators for the restyled markup live in
  `tests/gigs.ts` (gig page, gig list `gigTable()` / `gigListRows()`; `createGigViaApi()` sends `technicalSetup` / `logistics` as
  one code or null and `houseTechnician` as a boolean, contract 2026-10-05), `tests/year.ts` (year page figures), `tests/hours.ts` (hours tables: `totalsTable()`, `myHoursTable()`, `partnerFilter()`, `tableTotal()`, `readRows()` reads input values for own rows and text otherwise, `expectOrdered()`, `expectFlatNoCharts()`) and `tests/helpers.ts`
  (`pageHead`, `goNav`, `openDrawer`, `signOutFromHeader`, `languageButton`, `themeButton`,
  `expectSignedInShown`). Shared page list: `tests/pages.ts`. Purchase orders: `tests/po.ts` (API setup `personWithPlayedFee()`, `addLine()`, `createPoPublic()` on the `request` fixture without cookies, `backdatePo()`, `anonymous()` / `openFreelancer()`, `feeRow()`, `poRow()`, `fiPaidLabel()`). Clients / offers: `tests/offers.ts` (API setup, `offerYear()` = 2038 / 2039 per project, BR-102 `expectedStatus()` and BR-106 `br106()` from API rows, FI labels of the codes, offer list locators). Excel-style tables (gig and offer lists): `tests/excel.ts` (`filterButton()`, `filterPopover()`, `openColumnFilter()` — header popover from 600 px, the "Suodattimet" sheet below — `filterColumn()`, `tickColumnValues()`, `cancelColumnFilter()`, `clearFiltersButton()`, `urlFilter()`).
- **Layout v2:** from **900 px** (`isWide()`) the main nav is a collapsible left sidebar; below
  that, ☰ ("Valikko") opens it as the drawer dialog "Päävalikko" — `goNav()` opens the drawer on
  phones and checks that it closes. Language, theme and sign-out are found **by accessible name**,
  in the drawer on phones and anywhere on the page on desktop (not by sidebar position), so the
  move to the top bar (TASK-132) needs no test change. The gig and offer lists are one table at
  every width (cards below 600 px are the same table rows laid out by CSS). Filter tests use
  always-shown columns (Tila, Kokoonpano, Paikka) or `f.<key>=` URLs, because TASK-147 hides
  low-priority columns on narrower tables.
- **Inline editing (NFR-8):** edit like a user — `editInline()` focuses the field, types, leaves
  it (blur) or presses Enter and waits for the write; `selectInline()` for selects. Then assert the
  value **after `page.reload()`** to prove it reached the backend. `expectEscReverts()` and
  `expectInvalidNotSent()` check that nothing is sent; `expectNoEditSaveButtons()` that existing
  items have no Edit/Save buttons. Input values are not text: use `toHaveValue()` on the field's
  label ("Budjetti: Laulu", "Kommentti: <date> <comment>", "Nimi: <name>"…), not `getByText()`.
  Every inline field has its own polite `role="status"` region, so pick page notices by text.
- **Clients and offers** write to their own years (`offerYear()`: 2038 at 375 px, 2039 at 1280 px)
  so the older specs' 2026 figures and the other project's data stay untouched. Only the offer
  figures test adds tagged offers to the current year (it needs dates before and after today) and
  computes every expectation from the API. Names are tagged `M` / `D` plus a random suffix.
- **Public offer link:** the customer side always runs in `browser.newContext()` (no storage state,
  checked to have no cookies), never in the signed-in test context. Keep the number of public
  requests low: the endpoint is rate-limited (60 / min / IP). In the dev server React StrictMode
  fetches the public offer twice (the first request is aborted), so assert *which* requests are
  made, not how many.
- The tests never change `frontend/` or `backend/`. A failure caused by the app is recorded in
  `FINDINGS.md` and the test is marked `test.fixme('…', 'F-00x …')`.
