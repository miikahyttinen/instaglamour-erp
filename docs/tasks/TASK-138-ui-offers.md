# TASK-138: Offers — UI (list, create/edit, offer page, convert)
- **owner:** ui · **status:** todo · **spec:** UC-028, UC-029, UC-031, api-contract "Offers" · **depends on:** TASK-137
## Acceptance criteria
- [ ] Menu: **Tarjoukset / Offers** as the **first** item (icon).
- [ ] Offer list per UC-028: page head with open value + win rate (selected year), New offer; Excel-style sortable table with all columns; inline selects for source/event type/disposition; filters; search; Deleted view; Gig column = **"Convert to gig#"** button (confirm dialog per UC-031) or "Keikka →" link.
- [ ] New offer form per UC-029 (client select + New client…, lineup lines with "fill from template", defaults).
- [ ] Offer page: customer-style preview (same component as the public page) + internal panel with inline editing, history, Copy public link (absolute URL), Regenerate link (confirm), Convert, Delete.
- [ ] Gig page shows "Tarjouksesta / From offer: <event>" link when `offerId` set.
- [ ] Types, MSW mocks (synthetic), FI/EN, unit tests; tests/lint/build pass; headless check both themes 375/1440. No email sync UI. `frontend/` only; no `e2e/`.
