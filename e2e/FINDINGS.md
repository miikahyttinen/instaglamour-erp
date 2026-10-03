# E2E findings — TASK-004

Mismatches and bugs found while running the real frontend against the real backend.
The e2e suite does not fix `frontend/` or `backend/` code; it records problems here and marks
affected tests `test.fixme` with the finding id.

Severity: **blocker** (a flow cannot be completed), **major** (wrong data or behaviour a user
notices), **minor** (developer experience, cosmetic, or workaround available).

Run of 2026-10-03 against `main` at `720c5c1`: **all smoke flows pass at 375 px and 1280 px**;
no `test.fixme` is needed. The findings below are about running the stack, not about the app's
behaviour.

| Id | Severity | Side to fix | Summary |
|---|---|---|---|
| F-001 | minor | frontend | `/api` proxy target and dev port are hard-coded in `vite.config.ts` |
| F-002 | minor | backend | `npm install` fails on a fresh checkout without `DATABASE_URL` |

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

---

## Observations (not bugs)

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
