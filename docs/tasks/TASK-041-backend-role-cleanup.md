# TASK-041: Remove Horn 1/2 and Technician roles (backend)
- **owner:** backend · **status:** todo · **spec:** api-contract "Role cleanup" (2026-10-30), domain-model CostType · **parallel:** TASK-169
## Acceptance criteria
- [ ] Migration converts cost lines, person roles and lineup template roles per the contract, then removes `HORN_1`, `HORN_2`, `TECHNICIAN` from the Postgres `CostType` enum (recreate the type safely; no other data loss). Migration test on a populated scratch schema (each mapping rule, dedupe/order of roles).
- [ ] `MUSICIAN_ROLES`/`COST_TYPES` updated; requests with removed codes → 400 `INVALID_VALUE`; reference data updated.
- [ ] Seed/import accept and convert the old codes (tests with an old-style file).
- [ ] Tests updated; tests + lint pass; README.
