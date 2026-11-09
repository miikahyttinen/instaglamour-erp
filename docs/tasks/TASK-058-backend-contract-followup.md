# TASK-058: contractDone (gig), followUpDone (offer), GET /api/me/offers

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "Contract done, follow-up done, My offers (owner request 2026-11-09)"
- **depends on:** none

## Acceptance criteria
- [ ] Migration: `event.contract_done` (default false; existing gigs with start date < today Helsinki → true), `offer.follow_up_done` (default false).
- [ ] `contractDone` on EventSummary/EventDetail, accepted in create, convert body and PATCH; logged. `followUpDone` on OfferSummary/OfferDetail, accepted in PATCH offer; logged.
- [ ] `GET /api/me/offers` exactly as specified (seller = me, contractMissing and followUp rules, sorting, shape).
- [ ] Seed/import accept optional `contractDone` / `followUpDone` (default false; seed gigs follow the migration rule if absent? — no: default false, document it). Update seed README.
- [ ] Tests for migration rule, fields, logging, and every `/api/me/offers` inclusion/exclusion case (other sellers, deleted, cancelled gig, converted with contract done, expired open offer, follow-up done). Backend tests + lint pass.
