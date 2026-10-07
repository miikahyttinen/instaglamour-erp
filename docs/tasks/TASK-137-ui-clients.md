# TASK-137: Clients — UI
- **owner:** ui · **status:** todo · **spec:** UC-027, api-contract "Clients" · **depends on:** none (backend TASK-015 parallel)
## Acceptance criteria
- [ ] Sidebar/drawer item **Asiakkaat / Clients** (icon) after Keikat.
- [ ] Clients list: searchable table (Name · Gigs · Offers), add form (name, notes), errors REQUIRED/DUPLICATE translated.
- [ ] Client page: name + notes inline-editable; tables of the client's gigs and offers (offers may be empty until offers exist — render the section with empty state); delete with confirmation, `CLIENT_IN_USE` message.
- [ ] Gig page basic info: inline client select (— + clients + "New client…"); new gig form: client select; gig list: client column + search.
- [ ] Types, MSW mocks (synthetic demo clients), FI/EN, unit tests; tests/lint/build pass; headless check both themes 375/1440. `frontend/` only; no `e2e/`.
