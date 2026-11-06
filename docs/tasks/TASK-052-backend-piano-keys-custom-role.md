# TASK-052: PIANO → KEYS; OTHER_ROLE not a person role

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "Piano merged into Keys; custom role is not a person role (owner decision 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] Prisma migration: convert `PIANO` → `KEYS` in cost lines, lineup lines and person roles (dedupe, `MUSICIAN_ROLES` order); remove `OTHER_ROLE` from person roles; remove `PIANO` from the enum (same approach as the HORN/TECHNICIAN removal migration). History JSON untouched.
- [ ] `PIANO` removed from `MUSICIAN_ROLES`/`CostType`; seed/import accept `PIANO` (→ `KEYS`) wherever a role/type is read, and drop `OTHER_ROLE` from person `roles`.
- [ ] `PATCH /api/people/{id}` roles with `OTHER_ROLE` → 400 `roles: INVALID_VALUE`; `GET /api/people?role=OTHER_ROLE` → 400 `INVALID_VALUE`; backfill/derived roles never add `OTHER_ROLE`.
- [ ] `/api/reference.costTypes.personRoles` added.
- [ ] Tests (migration incl. a person with both PIANO and KEYS, PATCH/filter validation, import conversion); all backend tests + lint pass. `seed.example.*` updated if it uses PIANO (synthetic data).
