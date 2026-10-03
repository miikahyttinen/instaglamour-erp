# TASK-002: Backend gigs — gigs, cost lines, history, attachments

- **owner:** backend
- **status:** todo
- **spec:** UC-002, UC-003, UC-004, UC-005, UC-007, UC-008, UC-009, UC-010, UC-012, UC-013, UC-025; business-rules.md
- **depends on:** TASK-001

## Goal
All gig-related endpoints with their business rules and the complete history log.

## Contract
`docs/api-contract.md`: Gigs, Cost lines, Attachments, shared objects GigSummary/GigDetail/CostLine/Attachment/GigEvent, Warning format.

## Acceptance criteria
- [ ] Create gig creates template role lines (default fees, `joinsLoadIn: true`) + Office/Sales/Production from settings (BR-020, BR-021); custom lineup only internal lines.
- [ ] Economics fields, `played`, `notFullyStaffed` exactly as specified (BR-001…BR-006, BR-010, BR-023).
- [ ] `GET /api/gigs` filters, search, sort; `yearSummary` ignores filters and includes cancelled gigs in the sum (BR-082); deleted gigs excluded.
- [ ] PATCH logs one `UPDATED` with every changed field; date fields → `NOT_EDITABLE`.
- [ ] Seller/producer change moves only the old person's **unpaid** Sales/Production lines (BR-027), incl. the split case; ids returned and logged.
- [ ] Move / cancel / uncancel / delete / restore: transitions, required reasons, 409s, events as specified.
- [ ] Load-in switch: deduct `max(amount − D, 0)`, store applied amount, restore exactly even after the setting changes; no-op when unchanged.
- [ ] Pay / unpay set and clear amount, time and partner; FUEL → 409.
- [ ] Double-booking warnings on add/assign/move; cancelled and deleted gigs ignored.
- [ ] Attachments: type/size checks, files stored in `UPLOAD_DIR` (outside the repo), download only with session, soft delete.
- [ ] Every mutation writes the specified `GigEvent`; history endpoint newest first; no endpoint edits/deletes events or hard-deletes gigs.
- [ ] Tests for each endpoint (success + errors) and each business rule above; tests and lint pass.

## Out of scope
People, tasks, hours, budget, year endpoints (TASK-003). Frontend.

## Notes
Synthetic test data only (BR-090). Cost lines created in one request must keep their order (contract: creation time, then id). Wrap each mutation + its event in one transaction.
