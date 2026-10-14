# TASK-020: Partner status managed in the app — backend
- **owner:** backend · **status:** done · **spec:** UC-032, BR-070, BR-110…112, api-contract "Partner status" · **depends on:** none (UI TASK-145 parallel)
## Acceptance criteria
- [ ] Migration: partner `active`, `granted_by/at`, `revoked_by/at`; unique email case-insensitive.
- [ ] `PUT/DELETE /api/people/{id}/partner` per contract (domain check from `AUTH_ALLOWED_DOMAIN`, DUPLICATE, re-activation of a previously removed partner keeps its id, CANNOT_REMOVE_SELF, LAST_PARTNER in a transaction/lock so two concurrent removals can't remove the last two).
- [ ] Deactivation revokes all sessions of that partner; session resolution and both sign-in paths require `active`.
- [ ] `Person.partner` in people endpoints; `?partner=` filter; `Partner.active` in me/reference; reference keeps inactive partners; validation for new seller/producer/owner/hours rejects inactive partners (`UNKNOWN_REFERENCE`) while existing records keep them.
- [ ] Seed: partners in seed are active; example seed unchanged otherwise.
- [ ] Tests (grant, re-grant, revoke + immediate 401, self/last-partner guards incl. concurrency, domain/duplicate, pickers) + lint pass. `backend/` only.
