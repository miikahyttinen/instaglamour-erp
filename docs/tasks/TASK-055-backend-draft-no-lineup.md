# TASK-055: event-draft — no lineup prefill

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "Convert to gig: no lineup prefill (owner request 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] `GET /api/offers/{id}/event-draft` returns `lineupTemplateId: null`, `lineupName: null`; everything else unchanged. Body-less convert unchanged.
- [ ] Tests updated; backend tests + lint pass.
