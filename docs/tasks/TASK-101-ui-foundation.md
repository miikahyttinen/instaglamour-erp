# TASK-101: UI foundation — scaffold, i18n, sign-in, app shell with year selector

- **owner:** ui
- **status:** todo
- **spec:** UC-001, use-cases/README.md (NFR-1…NFR-6), glossary.md
- **depends on:** none (build against the contract with mocks)

## Goal
The frontend project that all later UI tasks build on: sign-in, language switch, layout and the
always-visible selected year.

## Contract
`docs/api-contract.md`: Conventions, Error format, Auth & me, Reference data, plus TypeScript types for **all** shared objects.

## What to build
- `frontend/`: Vite + React + TypeScript (strict), React Router, TanStack Query, **i18next** (FI default, EN),
  **MSW** mocks enabled with `VITE_USE_MOCKS=true` (easy to switch off), Vitest + React Testing Library, ESLint.
  npm scripts: `dev`, `build`, `test`, `lint`. Dev server proxies `/api` to `http://localhost:3000`.
- Typed API client + types for every object and error in the contract; error `code`/field codes mapped to translations.
- Money formatting from cents (FI `1 234,50 €`, EN `€1,234.50`), date formatting FI `d.M.yyyy` / EN, hours formatting.
- Sign-in page: **Sign in with Google** (links to `/api/auth/google/start`), messages for `?error=` codes,
  and a dev login form (email) shown only when `VITE_DEV_LOGIN=true`.
- Auth guard: unauthenticated → sign-in page; 401 from any call → sign-in page.
- App shell: header with **selected year** (prev / next / pick; saved via `PATCH /api/me`, NFR-5), language switch
  (saved via `PATCH /api/me`), sign-out; navigation: Year (home), Gigs, People, Tasks, Hours, Budget —
  placeholder pages for now. Mobile-first: bottom or hamburger nav on phones, works at 375 px.
- Reference data loaded once and cached (partners, templates, settings, enums) with FI/EN labels for every
  enum code (CostType, TechnicalSetup, statuses) using the glossary terms.
- Mocks for auth, me, reference with synthetic data only.
- `frontend/README.md`: how to run with mocks and against the backend.

## Acceptance criteria
- [ ] `npm run dev` with mocks shows sign-in → dev login → shell with year selector and nav.
- [ ] Language switch changes all visible texts immediately and persists via `PATCH /api/me`.
- [ ] Year selector changes `selectedYear` via `PATCH /api/me` and is visible on every page.
- [ ] Sign-in error codes show translated messages; 401 anywhere returns to sign-in.
- [ ] Every enum code has FI and EN labels (test that none is missing).
- [ ] Money/date formatting helpers unit-tested for FI and EN.
- [ ] Layout works at 375 px and desktop.
- [ ] Tests and lint pass.

## Out of scope
Feature pages beyond placeholders (TASK-102, TASK-103). Backend.

## Notes
BR-090: mocks and tests use synthetic data only ("Partner A", "Person 1", "Venue X"). Don't hard-code business values.
