# TASK-104: UI people

- **owner:** ui
- **status:** todo
- **spec:** UC-014
- **depends on:** TASK-101 (merged)

## Goal
People register (feature folder: `people`).

## Contract
People endpoints (docs/api-contract.md → People).

## Acceptance criteria
- [ ] List (active by default, filter inactive/all), add with name, rename, activate/deactivate.
- [ ] `DUPLICATE_NAME` warning shown (saving still succeeds).
- [ ] Person page: their cost lines for the selected year (gig date, lineup, venue, type, budgeted, actual, paid) with totals; gig links to `/gigs/{id}`.
- [ ] Works at 375 px. Tests; tests, lint and build pass.

## Parallel-work rules (5 UI tasks run at the same time)
- Put all code for this feature in `frontend/src/features/<feature>/` (page, components, hooks, tests).
- Translations: create `src/features/<feature>/i18n.ts` exporting `fi` and `en` objects under ONE top-level key named after the feature; add only **one line** each to `src/i18n/fi.ts` and `src/i18n/en.ts` to include it. Keys must match between FI and EN.
- Mocks: create `src/mocks/<feature>Handlers.ts` (and data in the same file or `src/mocks/<feature>Data.ts`); add only **one line** to `src/mocks/handlers.ts` to register them.
- Routing: replace the feature placeholder with **one line** in the router.
- Do not edit other shared files (api types/client, layout, styles.css, format helpers). If you need a shared change, report it instead; small local helpers are fine inside your feature folder.
- Other UI tasks run in parallel; TASK-102 (gigs) owns the Gigs page and gig mocks.
