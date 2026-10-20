# TASK-028: Offer createdAt in seed/import
- **owner:** backend · **status:** todo · **spec:** api-contract "Data import" (2026-10-20) · **depends on:** TASK-026
## Acceptance criteria
- [ ] `seed/schema.ts`: `offers[].createdAt` optional ISO 8601 date-time with offset (`2026-10-14T17:09:01.341414+00:00` must parse; microseconds allowed); future → validation error.
- [ ] `seed/load.ts`: on insert, offer `createdAt` = `updatedAt` = that value, and the offer's creation history event (if one is written on insert) gets the same time; default now. Existing offers untouched.
- [ ] Year logic unaffected (offer year = event date).
- [ ] Tests (parse formats, future rejected, insert uses it, re-import doesn't change existing); README seed format; tests and lint pass. Synthetic data only.
