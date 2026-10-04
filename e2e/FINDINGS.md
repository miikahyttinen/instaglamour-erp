# E2E findings — TASK-004, TASK-007

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

| Id | Severity | Side to fix | Summary |
|---|---|---|---|
| F-001 | minor | frontend | `/api` proxy target and dev port are hard-coded in `vite.config.ts` |
| F-002 | minor | backend | `npm install` fails on a fresh checkout without `DATABASE_URL` |
| F-003 | minor | frontend | Year page tiles: secondary figure is read before its label ("Keikkoja 5 1 Peruttuja") |

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
