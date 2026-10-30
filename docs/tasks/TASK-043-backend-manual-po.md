# TASK-043: Partners create purchase orders by hand (backend)
- **owner:** backend · **status:** todo · **spec:** api-contract "Purchase orders created by partners" (2026-10-31), BR-114…118 · **parallel:** TASK-171
## Acceptance criteria
- [ ] `GET /api/people/{id}/po-eligible-lines?eventId=` and `POST /api/purchase-orders` exactly per contract; reuse the existing PO creation path (numbering, snapshots, per-person advisory lock, all-or-nothing, CostLine.purchaseOrder, history/log), with the partner eligibility rule and `partnerId` on the CREATED event.
- [ ] Tests: upcoming gig allowed, cancelled/deleted/paid/on-PO/fuel/zero excluded, another person's line → 409, concurrency with the freelancer path (same line twice → one wins), log actor; tests + lint pass; README.
