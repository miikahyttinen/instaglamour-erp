# TASK-031: Convert only accepted, upcoming offers
- **owner:** backend · **status:** todo · **spec:** BR-109, api-contract errors + Offers · **depends on:** none · **parallel:** TASK-160
## Acceptance criteria
- [ ] `GET /api/offers/{id}/gig-draft` and `POST /api/offers/{id}/convert` (with or without body): if not already converted and (disposition ≠ WON or event date < today Helsinki) → 409 `OFFER_NOT_CONVERTIBLE`. Order: 404 → deleted 409 INVALID_STATUS_TRANSITION → ALREADY_CONVERTED → OFFER_NOT_CONVERTIBLE → body validation.
- [ ] Converting a WON offer keeps disposition WON (no DISPOSITION_CHANGED event if unchanged), still logs CONVERTED.
- [ ] Seed/import `converted: true` exempt (bypass the check in the loader path).
- [ ] Tests (pending/lost/cancelled → 409; won past → 409; won today and future → OK; import exemption; existing tests updated); tests and lint pass.
