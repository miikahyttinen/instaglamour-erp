# E2E findings — TASK-004, TASK-007, TASK-008

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

| Id | Severity | Side to fix | Summary |
|---|---|---|---|
| F-001 | minor | frontend | `/api` proxy target and dev port are hard-coded in `vite.config.ts` |
| F-002 | minor | backend | `npm install` fails on a fresh checkout without `DATABASE_URL` |
| F-003 | minor | frontend | Year page tiles: secondary figure is read before its label ("Keikkoja 5 1 Peruttuja") |
| F-004 | major | frontend | **Fixed (TASK-124).** My hours: an inline hours error does not wrap; the page scrolls sideways and the message is cut off |

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
