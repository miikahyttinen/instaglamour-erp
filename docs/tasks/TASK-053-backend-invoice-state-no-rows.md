# TASK-053: invoiceState — played gig without invoice rows is NONE, not PARTLY_INVOICED

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "Invoicing: no label before the first invoice (owner decision 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] `backend/src/domain/invoicing.ts`: PARTLY_INVOICED only when the gig has ≥ 1 invoice row; played with no rows → NONE. Update the doc comment.
- [ ] Same rule in the `?invoiceState=` filter (SQL/where-clause, if derived separately) so list filter and label agree.
- [ ] Tests: played no rows → NONE (and filter); played with one SENT row < total → PARTLY_INVOICED; existing cases unchanged. All backend tests + lint pass.
- [ ] This task may also edit the frontend mock: apply the same rule in `frontend/src/mocks/eventStore.ts` (and its tests `invoiceFigures.test.ts`, `eventHandlers.test.ts`); frontend unit tests + lint must pass.
