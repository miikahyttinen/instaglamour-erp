# TASK-025: Active partners have no freelancer link
- **owner:** backend · **status:** todo · **spec:** BR-113 (2026-10-18), api-contract "Purchase orders" · **depends on:** TASK-023 · **parallel:** TASK-153
## Acceptance criteria
- [ ] `GET /api/public/freelancers/{token}` and `POST …/purchase-orders`: person is an active partner → 404 `NOT_FOUND`.
- [ ] `GET /api/people/{id}/freelancer-link` and `POST …/regenerate`: active partner → 409 `PERSON_IS_PARTNER` (after 404 for unknown person).
- [ ] Removed partner (inactive Partner) → link works again (same token unless regenerated).
- [ ] Existing POs of a person who becomes a partner stay manageable by partners (list/pay/unpay/cancel unchanged).
- [ ] Tests; tests and lint pass; README.
