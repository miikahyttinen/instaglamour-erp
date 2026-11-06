# TASK-054: Musician role VOC_KEYS

- **owner:** backend
- **status:** done
- **spec:** docs/api-contract.md "New musician role "Vocal & Keys" (owner request 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] Prisma migration adds `VOC_KEYS` to the `CostType` enum; `MUSICIAN_ROLES`/`PERSON_ROLES` include it right after `BACKING_VOC`.
- [ ] Reference, people role filter/PATCH, seed/import accept it. Tests updated (reference lists, enum-order tests); all backend tests + lint pass.
