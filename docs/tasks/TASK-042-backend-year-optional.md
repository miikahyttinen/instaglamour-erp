# TASK-042: Year optional on offers / purchase orders / person cost lines; offer stats ranges
- **owner:** backend · **status:** todo · **spec:** api-contract "Year is no longer global" (2026-10-30), BR-081 revised · **parallel:** TASK-170
## Acceptance criteria
- [ ] `GET /api/offers`, `GET /api/purchase-orders`, `GET /api/people/{id}/cost-lines`: `year` optional per contract (invalid year still 400); results all years, newest first; existing filters unchanged.
- [ ] `GET /api/offers/stats`: `year` optional (default current Helsinki year); ranges year−3…year+2 for the three year series; others unchanged.
- [ ] Tests updated/added; tests + lint pass; README.
