# TASK-103: UI year page (home)

- **owner:** ui
- **status:** todo
- **spec:** UC-022
- **depends on:** TASK-101 (merged)

## Goal
The home page for the selected year (feature folder: `year`).

## Contract
`GET /api/years/{year}` (docs/api-contract.md → Year page).

## Acceptance criteria
- [ ] Shows for the selected year: gig count, cancelled count, sold gigs sum, budgeted and actual costs, margin; hours per partner and total; budget totals (expense/income, budget/actual) and the year result; next 5 upcoming gigs with "not fully staffed" flag.
- [ ] Figures link to their pages (`/gigs`, `/hours`, `/budget`; a gig opens `/gigs/{id}`).
- [ ] Changing the year updates the figures; upcoming gigs relate to today.
- [ ] Empty year shows zeros.
- [ ] Is the route `/` after sign-in. Works at 375 px.
- [ ] Tests; tests, lint and build pass.

## Parallel-work rules (5 UI tasks run at the same time)
- Put all code for this feature in `frontend/src/features/<feature>/` (page, components, hooks, tests).
- Translations: create `src/features/<feature>/i18n.ts` exporting `fi` and `en` objects under ONE top-level key named after the feature; add only **one line** each to `src/i18n/fi.ts` and `src/i18n/en.ts` to include it. Keys must match between FI and EN.
- Mocks: create `src/mocks/<feature>Handlers.ts` (and data in the same file or `src/mocks/<feature>Data.ts`); add only **one line** to `src/mocks/handlers.ts` to register them.
- Routing: replace the feature placeholder with **one line** in the router.
- Do not edit other shared files (api types/client, layout, styles.css, format helpers). If you need a shared change, report it instead; small local helpers are fine inside your feature folder.
- Other UI tasks run in parallel; TASK-102 (gigs) owns the Gigs page and gig mocks.
