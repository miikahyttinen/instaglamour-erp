# TASK-134: Partner-managed budget rows — UI

- **owner:** ui
- **status:** todo
- **spec:** UC-020, api-contract (Budget rows, Reference, Budget), design.md (inline editing)
- **depends on:** none (backend TASK-012 runs in parallel)

## Acceptance criteria
- [ ] Types: `budgetCategories: {id, name}[]`; no `budgeted`/`code`/`nameFi`/`nameEn`.
- [ ] Budget page: **"Add row"** (name input + Add; errors REQUIRED/DUPLICATE translated); each row's **name editable inline** (`InlineText`, saves on blur/Enter); **remove** icon button per row with confirmation dialog ("values are kept, row disappears from all years").
- [ ] No actuals-only rows/badge: every row shows budget and actual cells.
- [ ] Empty state when there are no rows ("Add your first row").
- [ ] Reference cache and budget/year queries refresh after add/rename/remove.
- [ ] FI/EN texts; MSW mocks for the three endpoints + updated reference/budget mocks (synthetic, no fuel row).
- [ ] Unit tests; tests, lint, build pass; headless check both themes 375/1440 (own port). `frontend/` only; do not edit `e2e/`.
