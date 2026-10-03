# Instaglamour ERP — frontend

React + TypeScript (strict) + Vite, React Router, TanStack Query, i18next (Finnish default,
English), MSW mocks, Vitest + React Testing Library, ESLint. Mobile-first (works at 375 px).

## Commands

```sh
npm install
npm run dev        # dev server on http://localhost:5173, proxies /api → http://localhost:3000 (configurable, see "Other ports")
npm run dev:mock   # same, but /api is answered by in-browser mocks + dev login shown
npm test           # Vitest (uses the same mocks through msw/node)
npm run lint       # ESLint (no warnings allowed) + TypeScript type check
npm run build      # production build into dist/
```

## Run with mocks (no backend needed)

```sh
npm install
npm run dev:mock
```

Open http://localhost:5173 and use the **dev login** form with a synthetic partner:
`partner.a@example.com`, `partner.b@example.com` (English) or `partner.c@example.com`.
Any other email shows "no access". The mock session lasts until the browser tab is closed.

`dev:mock` just sets `VITE_USE_MOCKS=true VITE_DEV_LOGIN=true`. You can instead put these in
`.env.local` (gitignored; see `.env.example`) and run `npm run dev`.
"Sign in with Google" is a real page navigation and is not mocked — it needs the backend.

Try `/login?error=WRONG_DOMAIN` (or `NOT_A_PARTNER`, `SIGN_IN_FAILED`) to see the sign-in errors.

## Run against the backend

1. Start the backend on http://localhost:3000 (see `backend/`).
2. Make sure `VITE_USE_MOCKS` is not `true` (unset or `false` in `.env.local`).
3. For dev login set `VITE_DEV_LOGIN=true` here **and** `DEV_LOGIN_ENABLED=true` in the backend `.env`.
4. `npm run dev` and open http://localhost:5173. All `/api` calls go through the Vite proxy,
   so the session cookie is same-origin.

### Other ports

The dev server reads two optional variables (shell or `.env.local`; see `.env.example`).
Unset or empty means the default.

| Variable | Default | What |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Where the dev server proxies `/api` |
| `VITE_PORT` | `5173` | Dev server port (an invalid value stops the server with an error) |

```sh
VITE_API_PROXY_TARGET=http://localhost:3100 VITE_PORT=5273 npm run dev
```

`--port` on the command line still wins over `VITE_PORT`.

## Structure

| Path | What |
|---|---|
| `src/api/enums.ts` | Every code list from the contract / domain model (single source for the unions) |
| `src/api/types.ts` | Types for every shared object, request and response in `docs/api-contract.md` |
| `src/api/client.ts` | `apiRequest`, `ApiError` (`status`, `code`, `fields`), global 401 hook |
| `src/api/endpoints.ts` | Typed function per endpoint |
| `src/api/cache.ts` | Shared root query keys and `invalidateYearData()`: call it after every gig, cost line, hours or budget mutation |
| `src/auth/` | `me` query, auth guard, sign-in page, `useSignedInPartner()` / `useSelectedYear()` |
| `src/layout/` | App shell: header with year selector + menu (language, sign-out), nav |
| `src/reference/useReference.ts` | Reference data, loaded once per session and cached |
| `src/i18n/` | `fi.ts` / `en.ts` texts (glossary terms), label helpers for codes and errors |
| `src/lib/format.ts` | Money (cents), date, hours and percent formatting per language |
| `src/mocks/` | MSW handlers and synthetic data (browser worker + Node server for tests). All state is in `db` (`data.ts`); `resetMockDb()` resets every store. Gig rules live in `gigStore.ts`, demo gigs in `gigSeed.ts`; tasks, hours and budget in `tasksStore.ts`, `hoursStore.ts`, `budgetStore.ts`. The year mock is computed from these stores |
| `src/features/<feature>/` | One folder per feature: `year`, `gigs`, `people`, `tasks`, `hours`, `budget`; pages, query hooks and the feature texts in `i18n.ts` (gig texts are still in `src/i18n/fi.ts` / `en.ts`) |
| `src/features/gigs/` | Gig list, new gig, gig page (costs, attachments, history, move/cancel/delete dialogs) |
| `src/components/` | Shared `Dialog`, `Field`, `MoneyInput` |
| `src/pages/` | Not-found page |
| `src/test/` | Test setup, `renderApp`, `gigFixtures` (synthetic gigs), `testFile` for uploads |

## Conventions

- **Never** show the server's `message`; translate `error.code` and field codes with
  `apiErrorMessage()` / `apiFieldErrors()` from `src/i18n/labels.ts`.
- Code labels: `t('costType.BASS')`, `t('technicalSetup.VAN')`, `t('gigStatus.PLAYED')`,
  `t('gigEventType.MOVED')`, … A test fails if any code is missing in FI or EN.
- Money is integer cents end to end; format with `formatMoney(cents, lang)` and parse input
  with `parseMoneyToCents(text, lang)`.
- Pages below the guard read the year with `useSelectedYear()`; change it only through
  `useUpdateMe()` (it saves via `PATCH /api/me`).
- Mocks and tests use synthetic data only ("Partner A", "Person 1", "Venue X", `@example.com`,
  round dummy amounts). No real names, domains or business numbers (BR-090).
- To add mocks for a new contract section, add a handler array in `src/mocks/handlers.ts`
  and include it in `handlers`.
- Upload tests use Node's `FormData`/`File` (set in `src/test/setup.ts`) because Vitest's
  jsdom → Node fetch bridge drops file names and bytes. Create test files with `testFile()`.
- With mocks on, attachment downloads are fetched and opened as a blob URL (the mock
  service worker can't answer a plain navigation). Against the backend they are normal links.
