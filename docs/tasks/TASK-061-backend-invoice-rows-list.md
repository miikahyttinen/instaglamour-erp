# TASK-061: GET /api/invoice-rows (all invoice rows)

- **owner:** backend
- **status:** done
- **spec:** docs/api-contract.md "Laskutus page: all invoice rows (owner request 2026-11-13)"
- **depends on:** none

## Acceptance criteria
- [ ] `GET /api/invoice-rows` exactly as specified (non-deleted gigs, all statuses/years; NOT_SENT first then SENT, newest createdAt first, ties by id; shape incl. client name and the gig's invoicingDetails). Auth required. One query (no N+1).
- [ ] Tests: ordering, deleted gig excluded, cancelled gig included, client null, invoicingDetails included, auto flag. Backend tests + lint pass.
