# TASK-108: UI integration polish

- **owner:** ui
- **status:** todo
- **spec:** NFR-1…NFR-6, UC-022 (consistency), developer reports from TASK-102…107
- **depends on:** TASK-102…TASK-107 (merged)

## Goal
Make the separately built screens behave as one app.

## Acceptance criteria
- [ ] **Cache freshness:** every mutation that changes gig, cost line, hours or budget data invalidates the year page query (`['years', …]`) and any affected lists (gig list, person cost lines, hours totals, budget). One helper, used everywhere; remove ad-hoc key guesses (e.g. `['year']`).
- [ ] **Mocks:** `resetMockDb()` resets every feature mock store (gigs, people, tasks, hours, budget); remove per-test manual resets that become redundant. The year mock takes hours and budget totals from the hours and budget mock stores so `dev:mock` figures are consistent across pages.
- [ ] **Folder convention:** move `src/gigs/` to `src/features/gigs/` (imports updated, no behaviour change) so all features live under `src/features/`.
- [ ] **Shared files tidy:** `App.tsx`, `src/i18n/fi.ts`, `src/i18n/en.ts`, `src/mocks/handlers.ts` have consistent import/registration order; no unused imports; one route per path.
- [ ] **Real-browser check at 375 px and 1280 px** (headless Chrome against `dev:mock`) of every page: no horizontal scroll, nothing cut off; fix CSS issues found.
- [ ] Tests, lint and build pass.

## Out of scope
New features; backend; `e2e/` (TASK-004 runs in parallel).
