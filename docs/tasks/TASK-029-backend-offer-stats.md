# TASK-029: Offer statistics endpoint
- **owner:** backend · **status:** todo · **spec:** api-contract "Offer statistics", BR-122 · **depends on:** none · **parallel:** TASK-157
## Acceptance criteria
- [ ] `GET /api/offers/stats?year=` exactly per contract (series lengths/order, open/expired via Helsinki today, priced-only averages, decided rule, null eventType group, byEventType for every EVENT_TYPES value).
- [ ] Efficient (SQL aggregation or one scan; fine for thousands of offers). Auth required.
- [ ] Tests with synthetic fixtures covering each series, edge months/years, deleted offers excluded, expired excluded from open, no-price offers; tests and lint pass. README.
