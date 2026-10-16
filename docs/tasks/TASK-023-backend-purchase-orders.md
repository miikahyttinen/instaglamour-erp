# TASK-023: Purchase orders — backend
- **owner:** backend · **status:** done · **spec:** UC-033, UC-034, BR-113…BR-119, api-contract "Purchase orders", domain-model "Purchase orders" · **depends on:** none · **parallel:** TASK-151, TASK-152 (UI, against MSW)
## Goal
Freelancers create purchase orders from their unpaid, played fees through a secret public link; partners list, search, mark paid / unmark / cancel them, with a full log.
## Contract
api-contract "Purchase orders" (all endpoints, shapes, errors, lock, public rate limit) — implement exactly.
## Acceptance criteria
- [ ] Migration: `person.freelancer_token` (unique, backfilled for existing people with crypto-random ≥ 32 bytes base64url; new people get one on create), `purchase_order` (+ global sequence for the running number), `purchase_order_line` (unique active line per cost line — enforce in code under a lock; a partial unique index is welcome), `purchase_order_event`. Non-destructive.
- [ ] PO number per BR-116 (accents stripped: ä→A, ö→O, å→A, etc.; collapse/trim dashes; empty slug → `PERSON`; 4-digit zero-padded, grows past 9999). Unit tests for the slug.
- [ ] Public `GET /api/public/freelancers/{token}` and `POST …/purchase-orders`: eligibility BR-114, all-or-nothing, advisory lock per person, 404 for unknown/regenerated/inactive, `noindex`, shares the public-offer rate limiter. Response whitelists only the contract fields (test that no client/price/other people/notes leak).
- [ ] Partner endpoints: list (year by createdAt; `q` searches all years; status filter), detail, pay/unpay/cancel with state checks, history, recent events, freelancer-link get/regenerate.
- [ ] Pay/unpay update the cost lines and write GigEvents `COST_PAID`/`COST_UNPAID` with `purchaseOrderNumber`; gig economics reflect it.
- [ ] Lock BR-118 on cost-line PATCH/DELETE/pay/unpay and gig cancel/delete (409 `COST_LINE_ON_PURCHASE_ORDER`); `CostLine.purchaseOrder` in all gig/cost-line responses and in `GET /api/people/{id}/cost-lines`.
- [ ] Every PO change logs a PurchaseOrderEvent (CREATED with partnerId null).
- [ ] Tests for every endpoint, error and the lock; concurrency test (two parallel creates with the same line → one 201, one 409); tests and lint pass. Synthetic data only.
- [ ] `backend/README.md` updated.
## Out of scope
UI, e2e (TASK-024 later). Email/notifications.
