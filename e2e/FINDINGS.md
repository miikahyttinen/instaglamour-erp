# E2E findings — TASK-004, TASK-007, TASK-008 … TASK-014, TASK-017, TASK-021

Mismatches and bugs found while running the real frontend against the real backend.
The e2e suite does not fix `frontend/` or `backend/` code; it records problems here and marks
affected tests `test.fixme` with the finding id.

Severity: **blocker** (a flow cannot be completed), **major** (wrong data or behaviour a user
notices), **minor** (developer experience, cosmetic, or workaround available).

Run of 2026-10-03 against `main` at `720c5c1`: **all smoke flows pass at 375 px and 1280 px**;
no `test.fixme` is needed. The findings below are about running the stack, not about the app's
behaviour.

Run of 2026-10-04 against `main` at `bb6dfe3` (after the design restyle, TASK-110…116), see
[TASK-007](#task-007--suite-update-after-the-design-restyle): **61 passed, 1 skipped (by design),
0 failed, 0 `test.fixme`** at 375 px and 1280 px from a fresh database.

Run of 2026-10-05 against `main` at `18de851` (inline editing, TASK-118…123), see
[TASK-008](#task-008--suite-update-for-inline-editing): **71 passed, 3 skipped (1 by design,
2 `test.fixme` for F-004), 0 failed** at 375 px and 1280 px from a fresh database.

F-004 fixed in TASK-124: its test runs again (`tests/07-hours.spec.ts`: 6 passed at 375 px and
1280 px).

Run of 2026-10-05 against `main` at `b8437f8` (Layout v2, TASK-125…130; TASK-131 / TASK-132 not
merged yet), see [TASK-009](#task-009--suite-update-for-layout-v2): **102 passed, 0 failed,
30 skipped** from a fresh database — 2 `test.fixme` for F-005 (one per project), 1 by design
(economics toggle, gig table ≥ 1200 px), 27 viewport-only (15 desktop-sidebar tests at 375 px,
12 phone-drawer tests at 1280 px).

Run of 2026-10-05 against `main` at `c7535d5` (technical setup / logistics / house technician,
TASK-010, TASK-133), see TASK-011: the API helper `createGigViaApi()` still sent the old
`technicalSetup: []` array, so `POST /gigs` answered 400 `technicalSetup: INVALID_VALUE` and 17
tests failed in their setup — a suite problem, not an app bug. After fixing the helper and adding
`tests/13-tech-logistics.spec.ts`: **106 passed, 0 failed, 30 skipped** (same 30 as above) at
375 px and 1280 px from a fresh database. No new findings.

Run of 2026-10-05 against `main` at `cc5a780` (partner-managed budget rows, TASK-012, TASK-134),
see TASK-013: 4 tests failed (as reported in TASK-013) because the suite still expected the old seed categories ("Vuokra",
"Insurance") and a button-free budget table — suite problems, not app bugs. After updating
`08-budget` / `11-cross-checks` to the "Category A…I" seed and the new markup, and adding the
add / rename / remove row flow to `08-budget`: **108 passed, 0 failed, 30 skipped** (same 30 as
above) at 375 px and 1280 px from a fresh database. No new findings.

Run of 2026-10-05 against `main` at `25a908b` (hours as spreadsheet-style tables, TASK-136), see
[TASK-014](#task-014--suite-update-for-the-hours-tables): the baseline failed 4 tests (07 "log own
hours" and 10 "hours totals with a month opened", both projects) because they used the removed
`hours-grand-total`, per-partner total labels and month cells — suite problems, not app bugs.
After updating 07 / 10 and adding `tests/14-hours-tables.spec.ts`: **122 passed, 0 failed,
30 skipped** (same 30 as above) at 375 px and 1280 px from a fresh database. No new findings.

Run of 2026-10-07 against `main` at `fd24ff2` (clients, offers, public link; TASK-015, 016, 137,
138, 139), see [TASK-017](#task-017--clients-and-offers-end-to-end-layout-tests-after-the-menu-grew-to-8-items):
baseline 119 passed / 3 failed (outdated 6-item menu and 7-column checks). After the update and
the new specs 15–17: **174 passed, 0 failed, 46 skipped** at 375 px and 1280 px from a fresh
database — 6 `test.fixme` (F-005, F-006, F-007, one per project each), 1 by design (economics
toggle, gig table ≥ 1200 px), 39 viewport-only (21 desktop-sidebar tests at 375 px, 18
phone-drawer tests at 1280 px). New findings: F-006 (major), F-007 (minor).

Run of 2026-10-15 against `main` at `bad7ee9` (Excel-style gig / offer lists, partner status), see
[TASK-021](#task-021--excel-style-filters-keikat-tarjoukset-and-partner-status): **183 passed,
0 failed, 43 skipped** at 375 px and 1280 px from a fresh database (4 `test.fixme`: F-005, F-008).
New findings: F-008 (major), F-009 (minor).

| Id | Severity | Side to fix | Summary |
|---|---|---|---|
| F-001 | minor | frontend | `/api` proxy target and dev port are hard-coded in `vite.config.ts` |
| F-002 | minor | backend | `npm install` fails on a fresh checkout without `DATABASE_URL` |
| F-003 | minor | frontend | Year page tiles: secondary figure is read before its label ("Keikkoja 5 1 Peruttuja") |
| F-004 | major | frontend | **Fixed (TASK-124).** My hours: an inline hours error does not wrap; the page scrolls sideways and the message is cut off |
| F-005 | minor | frontend | Collapsed sidebar: while the CSS tooltip shows (hover / focus), it is added to the item's accessible name ("Vuosi Vuosi") |
| F-006 | major | frontend | **Fixed (TASK-141).** Gig list: the 8-column table does not fit next to the expanded sidebar at 1200–1263 px; "Kate-%" is cut off and the table scrolls sideways |
| F-007 | minor | frontend | **Fixed (TASK-141).** Convert to gig: a zero-delay double click on "Luo keikka" sends two requests (server answers 201 + 409; one gig, so AC-3 holds) |
| F-008 | major | frontend | **Fixed (TASK-147).** Gig list: ticking "Peruttu" in the Tila filter (= every status) is not kept in the URL; after a reload or from a shared link the cancelled gigs are hidden again |
| F-009 | minor | frontend | **Fixed (TASK-147).** Excel tables: when the column filters hide every row, the header (and its filter buttons) disappears from 600 px; only "Tyhjennä suodattimet" is left |

---

## F-001 — Frontend `/api` proxy target is not configurable

- **Severity:** minor (workaround in `e2e/`)
- **Where:** `frontend/vite.config.ts` → `server.proxy['/api'].target = 'http://localhost:3000'`,
  `server.port = 5173`.
- **Steps:** start the backend on another port (e.g. `PORT=3100`, to not clash with a developer's
  own backend on 3000), then `npm run dev` in `frontend/`.
- **Expected:** the dev server can be pointed at the backend's address (e.g. an env variable such
  as `VITE_API_PROXY_TARGET`, default `http://localhost:3000`), so the stack can run on other ports.
- **Actual:** the proxy always targets `localhost:3000`; requests go to whatever runs there (a
  developer's backend with the dev database) or fail. The port can be overridden with
  `--port`, the proxy target cannot.
- **Contract:** the contract only says "frontend dev server proxies `/api`", so this is not a
  contract violation; it's a configurability gap on the **frontend** side.
- **Workaround used:** `e2e/scripts/start-frontend.mjs` starts Vite through its JS API with the
  frontend's own config file and overrides only `server.port` and the proxy target. No frontend
  file is changed.

## F-002 — Backend `npm install` fails without `DATABASE_URL`

- **Severity:** minor (the step order in `backend/README.md` avoids it)
- **Where:** `backend/package.json` `"postinstall": "prisma generate"` together with
  `backend/prisma.config.ts` (`env('DATABASE_URL')`).
- **Steps:** fresh checkout (no `backend/.env`), `cd backend && npm ci`.
- **Expected:** dependencies install and the Prisma client is generated; `prisma generate` does
  not need a database connection.
- **Actual:** `npm ci` exits 1 — `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.
  Works after `cp .env.example .env` (the README's step order) or with `DATABASE_URL` set.
- **Contract:** not a contract matter; **backend** tooling. Possible fix: give `DATABASE_URL` a
  fallback in `prisma.config.ts` for `generate`, or document it more prominently.
- **Workaround used:** `e2e/scripts/prepare.mjs` runs `npm ci` with the e2e `DATABASE_URL` in the
  environment when `backend/node_modules` is missing.

## F-003 — Year page tiles: the secondary figure is read before its label

- **Severity:** minor (accessibility; the figures are correct and visible)
- **Where:** `frontend/src/features/year/YearPage.tsx` → `Secondary` (value `<span>` before the
  label `<span>`) inside the `LinkTile` link. The shared `frontend/src/components/StatTile.tsx`
  has the same order for `secondaryValue` / `secondaryCaption` (gig page economics tiles).
- **Steps:** open the year page with a screen reader, or read the accessible names of the links
  in the "Keikat" section.
- **Expected:** each figure is announced with its label first, as the main figure is
  ("Keikkoja 5, Peruttuja 1"; "Kulut, budjetti 11 500,00 €, Kulut, toteuma 1 900,00 €").
- **Actual:** the link names are `Keikkoja 5 1 Peruttuja` and
  `Kulut, budjetti 11 500,00 € 1 900,00 € Kulut, toteuma` — the actual-cost amount is announced
  between the budget amount and its own label, so it is easy to attach it to the wrong label.
  Before the restyle the cancelled count was its own link named `Peruttuja 1`.
- **Possible fix:** put the label first in the DOM and keep the visual order with CSS (`order` /
  `flex-direction: row-reverse`), or give the secondary figure a visually hidden prefix.
- **Tests:** not a `test.fixme` — the e2e tests read each figure through its own label
  (`.year-fig-label` → `.year-fig-value`, `e2e/tests/year.ts`), which holds either way.

## F-004 — My hours: an inline hours error makes the page scroll sideways

- **Status:** fixed in TASK-124. `nowrap` now applies only to the read-only value and the inline
  control (`.hour-amount:not(.inline-field)`, `.hour-amount .inline-control`); the field error
  wraps (`white-space: normal; overflow-wrap: anywhere`), right-aligned in its column. The test
  below is a regular `test` again and passes at 375 px and 1280 px.
- **Severity:** major (NFR-1; on a phone the only explanation of the error is cut off)
- **Where:** `frontend/src/features/hours/hours.css` → `.hours-page .hour-amount { white-space: nowrap; }`
  (line ~102). The inline field's error paragraph (`.field-error`, from
  `components/inline/InlineFieldFrame.tsx`) sits inside `.hour-amount` and inherits `nowrap`, in a
  7.5rem grid column.
- **Steps:** My hours → an own entry → type `0,3` in its hours field ("Tunnit: <date> <comment>")
  → leave the field.
- **Expected:** "Tunnit 0,25–24 neljännestunnin tarkkuudella." wraps under the field; no horizontal
  scrolling (NFR-1). The value is not saved — that part works.
- **Actual:** the message stays on one line: the page is 460 px wide in a 375 px viewport (the text
  is cut at "neljännestun…") and 1281 px in a 1280 px viewport.
- **Possible fix:** limit `nowrap` to the value, e.g. `.hours-page .hour-amount .inline-control
  { white-space: nowrap; }` and `.hours-page .hour-amount .field-error { white-space: normal;
  text-align: right; }` (or let the error span the whole grid row).
- **Tests:** `e2e/tests/07-hours.spec.ts` → (was `test.fixme`) `test('an invalid-hours error does not cause
  horizontal scrolling (F-004)')`. The assertion was moved out of the inline-hours test into its own
  test so the rest of that flow (save, Esc, invalid not saved, reload) keeps running. Other inline
  errors (gig price, cost lines, tasks, people, budget) do not overflow; those tests check it.

## F-005 — Collapsed sidebar: the tooltip is added to the accessible name

- **Severity:** minor (accessibility; navigation works, and the name is right while no tooltip shows)
- **Where:** `frontend/src/styles.css` → `.nav-item[data-tooltip]::after { content: attr(data-tooltip); … }`
  together with `visibility: visible` on `:hover` / `:focus-visible`; set from
  `frontend/src/layout/Sidebar.tsx` (`data-tooltip={tip(label)}` on the nav links and foot buttons).
- **Steps:** desktop (≥ 900 px) → collapse the sidebar ("Pienennä valikko") → hover or Tab to a
  nav item, e.g. "Vuosi".
- **Expected:** the tooltip shows the label and the accessible name stays the label ("Vuosi"),
  as docs/design.md says: "icons only, label as tooltip **and** accessible name".
- **Actual:** while the tooltip is visible, Chromium includes the CSS generated content in the
  name computation: the link is announced as **"Vuosi Vuosi"**. A screen-reader user tabbing
  through the collapsed rail (focus shows the tooltip) hears every item twice. The sign-out
  button (no `aria-label`, tooltip "Kirjaudu ulos · Kirjautuneena: …") gets
  "Kirjaudu ulos Kirjaudu ulos · Kirjautuneena: …". Buttons with an `aria-label` (language,
  theme) are not affected.
- **Possible fix:** give the generated content empty alternative text,
  `content: attr(data-tooltip) / "";` (supported in Chromium/Safari; keep the plain
  `content: attr(data-tooltip)` before it as a fallback), or render the tooltip as an
  `aria-hidden="true"` element instead of `::after`.
- **Tests:** `e2e/tests/12-layout-v2.spec.ts` →
  `test.fixme('collapsed: the hover / focus tooltip shows the label and keeps the accessible name (F-005)')`
  (fails with `Expected: "Vuosi"`, `Received: "Vuosi Vuosi"`). The reachability test in the same
  file finds every collapsed item by its name with the pointer moved away and passes.

## F-006 — Gig list: the 8-column table overflows its box next to the expanded sidebar (1200–1263 px)

- **Severity:** major (NFR-1; at a common laptop width a column of figures is hidden and the
  table must be scrolled sideways, although the design switches to cards exactly to avoid this)
- **Where:** `frontend/src/features/gigs/GigListPage.tsx` (`GigTable`: the table is used from
  `WIDE_QUERY` = `(min-width: 1200px)`, `frontend/src/lib/useMediaQuery.ts`, regardless of the
  sidebar state) and `frontend/src/features/gigs/gigList.css` (`.gig-table` column widths; the
  comment there says "Eight columns in ~890 px (1200 px viewport next to the expanded sidebar)").
- **Steps:** desktop, sidebar expanded (default) → window 1200 px wide → Keikat.
- **Expected:** from 1200 px the table fits the content column (≈ 886 px), as the CSS comment
  intends, or the list stays as cards until the table fits.
- **Actual:** after TASK-137 added the "Asiakas" column the table needs ≈ 950 px: its scroll box
  (`.table-wrap`, `overflow-x: auto`) is 886 px, so 64 px are hidden — "Kate-%" is cut and the
  table scrolls sideways. Measured min-content widths at 1200 px: Päivä 159 (nowrap date range),
  Keikka 169, Asiakas 92, Myyjä / tuottaja 99, Kokonaishinta 136, Kulut budjetti 100, Kulut
  toteuma 100, Kate-% 96. It fits from ≈ 1264 px with the sidebar expanded, and at every width
  ≥ 1200 px with it collapsed (1054 px box). The page itself does not scroll, which is why the
  old page-level check could not see it.
- **Possible fix:** switch to the table by the list's own width (container query ≥ ≈ 960 px, or
  `WIDE_QUERY` + collapsed sidebar), or make the columns narrower at 1200–1279 px (e.g. let the
  date range wrap, merge "Kulut, budjetti / toteuma" into one column as the cards do).
- **Tests:** `e2e/tests/12-layout-v2.spec.ts` →
  `test.fixme('gig list: the 8-column table fits next to the expanded sidebar from 1200 px, no sideways scroll inside the table (F-006)')`
  (fails with `sidebar expanded, 1200 px: table 950 px in a 886 px box`). The breakpoint test above
  it (cards at 1199 px, the 8-column table at 1200 / 1440 px, no page scroll) passes.
- **Fixed (TASK-141):** the table still switches at 1200 px viewport, but now fits the box: the
  inner column gutters are 12 px instead of 20 px (outer edges keep `--cell-pad-x`, as in the
  budget table), and at 1200–1279 px a date range wraps after its dash (two inline-block parts),
  so the date column is one date wide. Min-content width of the table 950 → 786 px at 1200 px
  (838 px from 1280 px, where ranges stay on one line). The test is no longer `fixme` and passes
  at 1200 / 1280 / 1440 px in both sidebar states.

## F-007 — Convert to gig: a zero-delay double click sends two requests

- **Severity:** minor (no wrong data: the server creates one gig and answers the second request
  with 409 `ALREADY_CONVERTED`; the user sees "Keikka luotu." and the gig link)
- **Where:** `frontend/src/features/offers/offerParts.tsx` → `ConfirmDialog`: the confirm button
  is `disabled={mutation.isPending}`; React Query publishes `isPending` asynchronously, so a second
  click in the same frame is not blocked. Used by `ConvertDialog.tsx`, whose comment says "a double
  click sends one request (AC-3)".
- **Steps:** an offer → Muuta keikaksi → double-click "Luo keikka" with no delay between the clicks
  (Playwright `dblclick()`; also scripted or very fast clicks).
- **Expected:** one `POST /api/offers/{id}/convert`.
- **Actual:** two requests; one answers 201, the other 409. Two clicks 30 / 80 / 150 ms apart send
  one request (the button is disabled by then), so a normal human double click is fine.
- **Possible fix:** guard synchronously, e.g. a `useRef` flag set in the click handler before
  `mutation.mutate()`, or check `useIsMutating` / a local `submitting` state set before the call.
- **Tests:** `e2e/tests/16-offers.spec.ts` →
  `test.fixme('convert: a zero-delay double click sends only one request (F-007)')` (fails with
  `[201, 409]`). AC-3 itself is tested and passes: a human-speed double click sends one request,
  a zero-delay one still makes exactly one gig and shows success, and two parallel API requests
  give 201 + 409 and one gig.
- **Fixed (TASK-141):** `ConfirmDialog` (used by convert, delete and regenerate-link) sets a
  `useRef` flag and a `submitting` state in the click handler before `mutation.mutate()`; further
  clicks return early and the button is disabled. The guard is released on error so the user can
  retry. Unit test in `offerParts.test.tsx`; the e2e test is no longer `fixme` and passes.

---

## F-008 — Gig list: "show every status" in the Tila filter does not survive a reload

- **Severity:** major (UC-003 / design.md: filters are kept in the URL; a reload or a shared link
  silently hides the cancelled gigs the user chose to see)
- **Where:** `frontend/src/features/gigs/GigListPage.tsx` → `useDefaultStatusFilter()` together
  with `ColumnFilterPanel.apply()` (`frontend/src/components/ColumnFilter.tsx`), which turns "every
  value checked" into *no filter* (`undefined`) and so removes `f.status` from the URL.
- **Steps:** Keikat (default: Myyty + Soitettu) → "Suodata: Tila" → tick "Peruttu" → OK (the
  cancelled gig appears; every value is checked, so the URL has no `f.status`) → reload.
- **Expected:** the cancelled gig is still shown (the same rows as before the reload).
- **Actual:** the URL has no status filter, so the default status filter applies again and the
  cancelled gig is hidden. The same happens after "Tyhjennä suodattimet" (shows every status, a
  reload hides the cancelled again). A filter of only "Peruttu" (`f.status=CANCELLED`) survives.
- **Possible fix:** write an explicit marker when the user's status choice equals "all" while a
  default exists (e.g. keep `f.status=SOLD&f.status=PLAYED&f.status=CANCELLED`, or `f.status=*`),
  or let `useDefaultStatusFilter` treat any `f.*` / a "filters touched" URL flag as user-chosen.
- **Tests:** `e2e/tests/18-gig-list-filters.spec.ts` →
  `test.fixme('gig list: a Tila filter that shows every status (cancelled included) survives a reload (F-008)')`
  (fails after the reload: 3 rows instead of 4, the cancelled one missing). The main gig list test
  in the same file passes (default view, Tila, Paikka + search, URL state of a narrowed filter,
  clear).
- **Fixed (TASK-147):** an explicit "every status" choice (ticking the rest, "Valitse kaikki",
  "Tyhjennä suodattimet") is written as the marker `f.allStatuses=1`; only a URL with neither
  `f.status` nor the marker gets the default (a plain `/gigs` link). `f.status` stays empty, so the
  table shows no active Tila filter. The `test.fixme` is now a `test` and passes at 375 / 1280 px;
  unit tests in `GigListPage.test.tsx`.

## F-009 — Excel tables: the filter buttons disappear when the filters hide every row

- **Severity:** minor (a workaround exists: "Tyhjennä suodattimet" or the search box)
- **Where:** `frontend/src/components/ExcelTable.tsx`: when `rows.length > 0 && visible.length
  === 0`, the empty box with "Tyhjennä suodattimet" replaces the whole `<table>`, including
  `<thead>` and its "Suodata: <column>" buttons. Phones keep the "Suodattimet" button in the bar.
- **Steps:** desktop → Keikat → search "venue z" (the seed's cancelled gig): "Ei suodattimia
  vastaavia keikkoja." — there is no Tila header to tick "Peruttu"; the only way is to clear every
  filter. Same in the offer list.
- **Expected (Excel-like):** the header row stays, so one filter can be loosened.
- **Tests:** none fail; `11-cross-checks` ticks "Peruttu" before searching, and its "fresh visit"
  part uses "Tyhjennä suodattimet".
- **Fixed (TASK-147):** from 600 px the table and its header (with the filter buttons) stay; the
  message and "Tyhjennä suodattimet" are shown under the header inside the table frame (not as a
  data row, so row counts stay 0). Phones unchanged (cards replaced by the message; the
  "Suodattimet" button stays in the bar). Unit tests in `ExcelTable.test.tsx`.

---

## TASK-021 — Excel-style filters (Keikat, Tarjoukset) and partner status

Run of 2026-10-15 against `main` at `bad7ee9` (ExcelTable gig / offer lists TASK-143 / 144,
partner status TASK-020 / 145, gig pickers TASK-146; TASK-147 responsive tables not merged yet),
fresh database `instaglamour_e2e_t021`, ports 3121 / 5191.

Baseline (partial, stopped at the first failures): the suite still expected the old gig list —
`03-gig-lifecycle` (card list "Keikkalista"), `10-no-horizontal-scroll` ("Näytä talous" toggle,
`?cancelled=1`), `11-cross-checks` ("Näytä myös perutut"), `12-layout-v2` (cards below 1200 px,
headers "Keikka" / "Myyjä / tuottaja"), `15-clients` (card line "Asiakas: …") and `16-offers`
(filter `<select>`s). Suite problems, not app bugs.

| Change | Files |
|---|---|
| Gig list = one table "Keikkalista" at every width (`gigTable()`, `gigListRows()`); `isGigTable()` / `GIG_TABLE_MIN_WIDTH` removed | `tests/gigs.ts`, `tests/helpers.ts`, `03`, `15` |
| Excel filter helpers (header popover from 600 px, "Suodattimet" sheet below) | new `tests/excel.ts` |
| Search + Tila "Peruttu" instead of "Näytä myös perutut" | `11-cross-checks` |
| Economics-toggle no-scroll test removed (cards show every field) | `10-no-horizontal-scroll` |
| Breakpoint test → one table at 1199 / 1200 / 1440 px with the always-shown columns and filter buttons; the F-006 table-box test removed (superseded by TASK-147: full width, no sideways table scroll) | `12-layout-v2` |
| Offer list filters: Tila through the popover / sheet and `f.status=` (Avoin = not expired); other columns via `f.<key>=` URLs (they may be hidden after TASK-147); API filters checked separately; clear filters | `16-offers` |
| New: gig list filters | `18-gig-list-filters` |
| New: partner status (UC-032) | `19-partner-status` |

Result: **183 passed, 0 failed, 43 skipped** at 375 px and 1280 px from a fresh database —
4 `test.fixme` (F-005 and F-008, one per project each), 39 viewport-only (21 desktop-sidebar
tests at 375 px, 18 phone-drawer tests at 1280 px). New findings: F-008 (major), F-009 (minor).
Not covered: AC-3 "last partner cannot be removed" (`LAST_PARTNER`) — the shared seed always has
several active partners and removing them would break the other specs; covered by backend tests.

---

## TASK-017 — clients and offers end to end; layout tests after the menu grew to 8 items

Baseline on `main` at `fd24ff2` (fresh database, 375 px and 1280 px): **119 passed, 3 failed,
30 skipped**. The three failures in `12-layout-v2`:

| Test | Cause | Verdict / change |
|---|---|---|
| Phone drawer (375 px) | Expected 6 links, the drawer has 8 (Tarjoukset first, Asiakkaat after Keikat) | Outdated test. `NAV` has the 8 items; the drawer test now also checks their order |
| Collapsed sidebar names (1280 px) | Same: 6 vs 8 links | Outdated test. Also checks the menu order by accessible name (pointer moved away first, F-005) |
| Gig list cards below / table from 1200 px | Expected 7 column headers, the table has 8 (client column). The test stopped there, before its page-scroll check | The column count was outdated: the test now expects the 8 named headers and passes (the page does not scroll). **But the 8-column table really overflows its own scroll box at 1200 px next to the expanded sidebar** (950 px in 886 px) — a real bug the page-level check can't see: **F-006**, new `test.fixme` that measures the table box at 1200 / 1280 / 1440 px with the sidebar expanded and collapsed |

New specs: `15-clients` (5 tests per project), `16-offers` (8 per project, one `fixme`),
`17-public-offer` (2 per project); helpers in `tests/offers.ts`. `tests/pages.ts` now also lists
the offers list, deleted view, new offer, an offer page, the clients list and a client page, so
`10-no-horizontal-scroll` and `12-layout-v2` check them in every sidebar / drawer state (they
pass). `scripts/env.mjs` / `prepare.mjs`: optional `E2E_DB_NAME` so two checkouts can run the
suite at the same time on the shared test Postgres.

Observations (not bugs):

- The public page fetches `GET /api/public/offers/{token}` twice per load **in the dev server**:
  React StrictMode mounts it twice and the first request is aborted (`signal` in the query). A
  production build makes one request. The test asserts which requests are made (only that GET,
  without a cookie), not how many.
- References (PM, 2026-10-07): the public `references` field is being redesigned (list of photo + quote + author). The offer and public-link tests assert only that the references region is shown with "Näytä referenssit" on and absent when off, never its contents or shape. Re-run after that change: same 174 passed / 46 skipped.
- The offer list figures test needs offers before and after today, so it writes tagged offers to
  the current year; it skips itself after 20 December (no future dates left in the year).

---

## TASK-014 — suite update for the hours tables

TASK-136 replaced the hours totals (tile, per-partner list, expandable month groups) with one flat
table "Tuntikirjaukset <year>" (Päivä | Osakas | Kommentti | Tunnit, total row, partner filter
`?partner=`) and My hours with the table "Omat tunnit <year>". The list / expand version
originally described in TASK-014 is obsolete; the suite follows the revised section.

| Spec / helper | Change |
|---|---|
| `hours.ts` (new) | Table locators, partner filter, total row, `readRows()` (input values for own rows, text for others; dates normalised to ISO), `expectOrdered()` (column order with the UI's `fi-FI` base comparison; ties free), `expectFlatNoCharts()` |
| 07 hours | Totals page: `hours-grand-total` → total row `hours-table-total`; the per-partner label `Yhteensä <partner>` → filter "Osakas" = me, total row = my hours; also checks the new entry is an own inline row. Same expected figures as before |
| 10 no horizontal scroll | "hours totals with a month opened" (no months any more) → "hours totals filtered by a partner and sorted by comment" |
| 14 hours tables (new) | See README; 7 tests per project |

No assertion was removed or loosened; no app bug found.

---

## TASK-009 — suite update for Layout v2

After TASK-125…130 (sidebar / drawer, smaller type, per-screen alignment), the baseline run on
`885bbc6` gave **66 passed, 7 failed, 1 skipped**. Every failure was the old navigation in the
tests, not an app bug: six phone flows (02, 05, 06, 07, 08, 09) waited for the bottom nav,
which is gone, and 09 on desktop expected the signed-in name as the sign-out button's
description (it is visible text in the expanded sidebar now) and the old phone language group.

| Spec / helper | Change |
|---|---|
| `helpers.ts` | `goNav()` uses the sidebar on desktop and ☰ → drawer link on phones, and asserts the drawer closes. New: `navDrawer()`, `menuButton()`, `openDrawer()`, `signOutButton()`, `languageButton()`, `themeButton()`, `expectSignedInShown()` (visible text **or** the sign-out button's accessible description, so it holds before and after TASK-132). Desktop account controls are found by accessible name on the whole page, never by sidebar position. `GIG_TABLE_MIN_WIDTH = 1200` |
| `gigs.ts` | `gigListRows()` switches at 1200 px (`isGigTable()`), not 900 px |
| `pages.ts` (new) | The busiest seed records and the list of main pages, shared by 10 and 12 |
| 09 language/year | One flow for both viewports: the single language toggle ("Vaihda kieleksi English" → "Change language to Suomi", the old name gone); the drawer closes with Esc; signed-in partner shown in FI and EN; final language checked on the server |
| 10 no horizontal scroll | Uses `pages.ts`; the economics-toggle test is skipped where the gig list is a table (≥ 1200 px) instead of "desktop" |

New checks (`12-layout-v2.spec.ts`):

- **Sidebar persistence (desktop):** expanded by default (≈ 232 px, labels visible, no ☰ or
  drawer); collapse → ≈ 64 px, `localStorage` `ig-sidebar=collapsed`; still collapsed after a
  reload and in a new tab; expand with the keyboard (Enter) → persists after a reload.
- **Collapsed nav reachable by name:** each of the six links found by its exact accessible name,
  in the viewport, ≤ 64 px wide, tooltip text = label, opens its page with `aria-current="page"`,
  the rail stays collapsed; Enter on a focused link navigates; language, theme and sign-out found
  by name. Tooltip vs. name: F-005 (`fixme`).
- **Phone drawer:** no navigation landmark and no rail when closed; ☰ `aria-expanded` false →
  true; dialog "Päävalikko" `aria-modal`, focus on "Sulje valikko", six links, current page
  marked, language / theme / sign-out at the bottom, page scroll locked; **focus trap**: Tab and
  Shift+Tab (all focusables + 2, so it wraps both ways) never leave the drawer; **Esc** closes and
  returns focus to ☰; **backdrop** click closes without navigating; **close button** closes;
  **navigation** closes (also a link to the current page); browser **Back** closes it.
- **No horizontal scroll in both sidebar states:** every main page with the sidebar expanded and
  collapsed at 900, 1280 and 1440 px; on phones every main page with the drawer closed and open.
- **Breakpoints:** gig list cards at 1199 px, table (7 columns) at 1200 and 1440 px; gig page cost
  list compact rows at 1280 px (expanded sidebar, list 968 px) and the full table at 1440 px,
  with the table / rowgroup semantics kept in both.
- **Theme:** one toggle named after the other theme; `data-theme` flips and survives a reload.

Not added as a project: a 1440 px project would rerun the writing flows, which tag records per
viewport (`M` / `D`) and expect a fresh database; 1440 px is covered by resizing in 12 instead.

---

## TASK-008 — suite update for inline editing

After TASK-118…123 (no Edit/Save buttons; fields save on blur / Enter, selects and switches on
change), the old suite failed 9 tests at 375 px (02 create/costs, 03, 05, 06, 07, 08 and three in
11; the baseline run was stopped during the 1280 px pass, which showed the same failures so far). Every failure was the old
interaction in the test, not an app bug. The flows now edit like a user does — focus, type, leave
(blur) or press Enter — and assert that the request is one PATCH with just that field (budget: a
PUT of the whole row), that the value is on the page, and that it is still there **after a
reload** (and in the API), proving it reached the backend. No assertion was removed or loosened.

Shared helpers in `tests/helpers.ts`: `editInline()` (focus → type → blur/Enter, waits for the 2xx
write and returns its body), `selectInline()`, `expectEscReverts()` (Esc restores the saved value,
leaving the field sends nothing), `expectInvalidNotSent()` (translated error as the field's
accessible description, `aria-invalid`, typed value kept, no request), `expectNoEditSaveButtons()`
and `trackWrites()`. `tests/gigs.ts`: `costField()` ("Budjetti: <line>" …), `totalPrice()` (group
"Kokonaishinta"); `infoValue()` was removed (the info lists are inputs now).

| Spec | Change | New checks |
|---|---|---|
| 02 create/costs | Budget cell and paid amount are inline inputs (`costField`); paid line shows time · partner next to the amount | New test: budget (blur), description (Enter, line renamed "Toimisto (…)"), paid amount (blur) → economics; Esc on budget and paid amount; `abc` → "Virheellinen arvo.", `-10` → "Summa ei voi olla negatiivinen."; reload + API; no Edit/Save in the cost table. Double booking: person select persists after reload |
| 03 lifecycle | Price, additional sales and description edited in place (blur / Enter), reload checks; cancelled gig: price edited in place (no "Muokkaa hintaa" button); history now has one "Tietoja muutettu" per saved field (5 instead of 2) | New test: venue (Enter, heading follows), Esc on lineup name and price, `-100` price and empty lineup name refused with translated errors, reload + API; no Edit/Save buttons on the gig page (also when cancelled) |
| 05 people | Rename via textbox "Nimi: <name>" (Enter), open via link "Avaa: <name>", deactivate via switch "Aktiivinen" on the person page | Esc and empty name ("Pakollinen tieto.") not saved; no dialog; no Rename/Activate/Deactivate/Edit/Save buttons (list and person page); visible "Nimi" / "Aktiivinen" fields on the person page; the deactivated notice is still shown after 2 s; reload + API. New test: reactivate from the list switch |
| 06 tasks | Row found by its "Poista: <title>" button (the title is an input value); owner / due date read from their fields | New test: title (Enter), description and due date (blur), owner select (change); Esc; empty title refused; reload + API; delete through the "Poista tehtävä" dialog |
| 07 hours | New entry checked through "Kommentti: <date> <comment>" / "Tunnit: …" values | New test: hours (blur) → year total, comment (Enter); Esc; `0,3` → INVALID_HOURS message and empty comment refused; reload + API. `test.fixme` for F-004 |
| 08 budget | Cells saved on blur / Enter (PUT of the whole row, body asserted); no per-row Save | No buttons in the budget table; variance and totals after each save; Esc; `-10` refused; reload |
| 11 cross-checks | Seller select saves on change (no "Muokkaa perustietoja"); EN budget cell saved on blur with "…: saved" announced; the hours notice is picked by its text (each inline field has its own polite live region) | Seller and moved Sales line persist after reload; EN value persists after reload |

---

## TASK-007 — suite update after the design restyle

After TASK-110…116, 16 of 62 tests failed. Every failure was an outdated markup assumption in
the tests; **no app bug blocked a flow**, so no `test.fixme` was added. Assertions were moved to
the new markup (accessible roles and names where the app provides them) with the same coverage;
none was removed or loosened.

| Test (viewport) | Cause | Change |
|---|---|---|
| 01 login-year (both) | Cancelled count is now the secondary figure inside the "Keikkoja" tile (no own link); year result moved to the page head; desktop has a sign-out icon button instead of the menu (from 900 px) | Read the figure by its label inside the tile link; year result in the page head (still a link to `/budget`); `signOutFromHeader()` uses the menu on phones and the icon button on desktop |
| 02 create/costs (both) | `.total-line` → `.new-gig-total`; cost lines `list/listitem` → one `<tbody aria-label>` per line in table "Kulut ja miehitys"; economics table → stat tiles; budget cell no longer has `<strong>`; back link text `‹ Keikat` → icon + `Keikat`; actual costs on the year page are the secondary figure of the budgeted-costs tile | `totalPriceLine()`, `costLine()` / `costLines()` (rowgroups), `econTile()` (budget = big figure, actual = "Toteuma" figure), `td.cost-budget`, back link by name inside `main`, year figure by label |
| 02 double booking (both) | Cost line `list/listitem` → named `<tbody>` | `costLine()` |
| 03 lifecycle (both) | `.total-line` → `.gig-edit-total`; `.info-list` → `dl.gig-info`; `.gig-header` → page head | `totalPriceLine()`, `infoValue()` (`term` → `definition`), `pageHead()`; added a guard that the gig list has loaded before asserting the deleted gig is gone, and that "Peruttu" is gone after uncancel |
| 05 people (both) | People list `list` → table "Henkilöt"; "Ei käytössä" tag moved from inside the `<h1>` to the page-head subtitle | Table role; tag asserted in the page-head subtitle |
| 08 budget (both) | Year result moved from the "Budjetti" section to the page head | Asserted in the page head |
| 09 language/year (desktop) | From 900 px the header has a language icon button ("Vaihda kieleksi English") and no menu; the signed-in name is the sign-out button's description | Desktop branch: icon button, its new name ("Change language to Suomi") instead of `aria-pressed`, and `toHaveAccessibleDescription(/Kirjautuneena: Partner C/)`; phone branch unchanged |
| 11 BR-027 (both) | Cost line `list/listitem` → named `<tbody>` | `costLine()` |
| 11 search filter (desktop) | Gig list is a table "Keikkalista" from 900 px (cards below) | `gigListRows()` picks table rows or list items by viewport |

---

## Observations (not bugs)

- **Year result placement (PM to confirm):** UC-022 lists the year result under "Budget"; since
  TASK-113 ("year result emphasised") it is a tile in the year page's head, outside the "Budjetti"
  section. It still shows the BR-063 figure and opens `/budget`, so the tests accept the new place.
- **Desktop header:** the signed-in partner is no longer visible text on desktop; it is only the
  sign-out button's tooltip / accessible description. UC-001 does not require it to be shown.

- The load-in switch (`role="switch"`) and the gig-list filter checkboxes are controlled by
  server / URL state, so they change only after the request or navigation. Tests click them and
  then wait for the new state (Playwright's `check()` / `uncheck()` expect an immediate change).
- Headless Chromium has no PDF viewer; the attachment test checks the response that the new tab
  receives (200, `application/pdf`) and the bytes and `inline` disposition via the same URL.
- Port 5174 (suggested in the task) was taken by a developer's server on this machine; the suite
  defaults to 5180 and 3100 and both can be changed (`E2E_FRONTEND_PORT`, `E2E_BACKEND_PORT`).
- The suite expects the fresh database that `npm run e2e` creates. Re-running specs against an
  already-used database (`E2E_REUSE=1` without `prepare`) can fail in the budget flow because the
  copy target year is no longer empty and typed values equal the saved ones.
