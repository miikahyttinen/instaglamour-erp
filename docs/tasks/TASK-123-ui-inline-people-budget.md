# TASK-123: Inline edit — people and budget

- **owner:** ui
- **status:** todo
- **spec:** NFR-8, docs/design.md → Inline editing
- **depends on:** TASK-118

## Goal
Switch people names and budget rows (`src/features/people/`, `src/features/budget/`) to in-place editing with save on blur.

## Acceptance criteria
- [ ] People: name editable inline in the list and on the person page (duplicate warning shown); active toggle saves on change; rename dialog removed.
- [ ] Budget: each money cell saves on blur (PUT the row), per-row Save/Cancel buttons removed; totals and variance update; actuals-only rules unchanged.
- [ ] Tests, lint, build pass; e2e green for your flows.

## Rules (five tasks run in parallel)
- Use only the TASK-118 inline components/hook (see `/styleguide` and README). Do not edit shared files; report needs.
- Edit only your listed files. Keep existing API calls (PATCH one field / PUT budget row); no backend or contract change.
- Remove Edit/Save buttons and edit modes for existing items; keep create forms, reason dialogs, Move, pay/unpay as they are.
- Update unit tests to the new interaction; also update affected `e2e/` specs **only if needed for your screen** and run `cd e2e && npm run e2e` (use free `E2E_BACKEND_PORT`/`E2E_FRONTEND_PORT`; the e2e DB is shared — if another agent is running it, wait and retry).
- Check both themes at 375 and 1280 px in headless Chrome (own debug port 9400–9900).
