# TASK-161: Rename Gig → Event (frontend + e2e)
- **owner:** ui · **status:** todo · **spec:** docs/saas-roadmap.md, api-contract "Rename Gig → Event" · **depends on:** none · **parallel:** TASK-032 (backend)
## Acceptance criteria
- [ ] API client, types, query keys, MSW mocks and fixtures use the new paths/shapes/fields exactly per the mapping.
- [ ] Code: `features/gigs` → `features/events`, components/hooks/CSS classes/i18n keys renamed (`Gig*` → `Event*`).
- [ ] Routes `/events`, `/events/new`, `/events/:id`; old `/gigs…` URLs redirect (keep query string).
- [ ] Labels FI/EN per contract (nav, page titles, table names e.g. "Tapahtumalista / Event list", buttons, notices, history texts, purchase-order and people columns, year page, offer convert modal "Muuta tapahtumaksi").
- [ ] e2e: rename helpers/specs/accessible names (allowed); run the **full** e2e suite after TASK-032 is on main (fresh E2E_DB_NAME, free ports, background/timeouts) and report counts; until then run unit tests against MSW.
- [ ] `grep -riE 'gig|keikk' frontend/src e2e/tests` returns only intentional leftovers (list them). Tests, lint, build pass; frontend README + root README screenshots text updated (no new screenshots needed).
