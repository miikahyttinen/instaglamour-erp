# TASK-051: Lineups — CRUD, lines of any cost type, default fee settings removed

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "Lineups and settings page (owner decision 2026-11-06)"; BR-020, BR-021 (revised)
- **depends on:** none

## Goal
Lineups (lineup templates) become editable in the app and define all default fees of a new gig: an
ordered list of cost lines of any type with default amounts. The `fees.office_default`,
`fees.sales_default`, `fees.production_default` settings are removed.

## Contract
"Lineups and settings page" section: `GET/POST /api/lineup-templates`, `PATCH/DELETE /api/lineup-templates/{id}`,
`/api/reference` changes, gig create (incl. offer conversion) rules, migration, seed/import format, 409 `LINEUP_IN_USE`.

## Acceptance criteria
- [ ] Prisma migration: template lines table (or reshaped `TemplateRole`) with `type`, `description`, `defaultCents`, `position`; `active` on the template; data migration exactly as in the contract (old roles first, then OFFICE/SALES/PRODUCTION with the old setting values read from the DB — never hard-coded); old setting rows deleted.
- [ ] CRUD endpoints with validation and error codes as specified (DUPLICATE name case-insensitive, DESCRIPTION_REQUIRED, NEGATIVE_AMOUNT/INVALID_VALUE, TOO_LONG, ≤ 100 lines, LINEUP_IN_USE, 404).
- [ ] `/api/reference`: active lineups with `lines`; `roles` and the three default settings removed.
- [ ] Gig create + offer convert: lines from the lineup in order; SALES/PRODUCTION persons = seller/producer; missing SALES/PRODUCTION added at 0 €; custom lineup → OFFICE/SALES/PRODUCTION at 0 €; inactive lineup → 400 `lineupTemplateId: UNKNOWN_REFERENCE`. Logged as before.
- [ ] Seed loader + import: new `lines` format, legacy `roles` converted, old fee keys optional/ignored except for the legacy conversion; `seed.example.*` updated to the new format with synthetic values; `backend/seed/README.md` updated. Update `docs/domain-model.md` settings table (remove the three keys, describe lineup lines).
- [ ] Remove all code paths using the three default settings (events/create.ts, domain/costLines.ts, enums, reference).
- [ ] Tests for CRUD, migration logic, gig create rules, import legacy conversion; all backend tests and lint pass. Check e2e still passes where it depends on seed (run the e2e suite with your own DB/ports: E2E_DB_NAME/E2E_BACKEND_PORT/E2E_FRONTEND_PORT, COMPOSE_PROJECT_NAME=instaglamour-erp; e2e failures caused only by the not-yet-updated UI may be reported instead of fixed).

## Out of scope
UI. Changing existing gigs.
