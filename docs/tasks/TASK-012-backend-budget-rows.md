# TASK-012: Partner-managed budget rows — backend

- **owner:** backend
- **status:** todo
- **spec:** UC-020, BR-008, BR-062, domain-model (BudgetCategory), api-contract (Budget rows, Reference, Budget)
- **depends on:** none (UI TASK-134 runs in parallel)

## Acceptance criteria
- [ ] Migration: `budget_category` gets a single `name` (from `name_fi`), drops `name_fi`/`name_en`/`budgeted`/`code`-uniqueness needs per the domain model (keep `code` nullable if useful for seed idempotency; document); keeps `active`, `sort_order`. The `FUEL` category (and any `budgeted = false` row) is **deactivated** (active = false), values kept. New migration only.
- [ ] Endpoints `POST/PATCH/DELETE /api/budget-categories` per contract (validation REQUIRED / DUPLICATE / TOO_LONG, soft delete, 404 for removed).
- [ ] `GET /api/reference` → `budgetCategories: [{id, name}]` active only in sort order; `GET/PUT /api/budget` without the actuals-only rule; removed rows excluded from rows, totals, copy-from-previous and the year page.
- [ ] Seed format: categories by `name` (idempotent by name, or code if given); example seed synthetic ("Category A…"), no fuel/actuals-only rows; `seed/README.md` updated. Old seed files with `nameFi/nameEn/budgeted` either still load (mapped) or fail with a clear message — document which.
- [ ] Tests (migration mapping incl. FUEL deactivation, endpoints, totals exclusion); tests and lint pass. `backend/` only.
