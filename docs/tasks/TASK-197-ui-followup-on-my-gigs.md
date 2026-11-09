# TASK-197: Follow-up checkbox only on Omat keikat; FI wording "Follow-up"

- **owner:** ui
- **status:** todo
- **spec:** docs/api-contract.md "Contract done, follow-up done, My offers" (revised 2026-11-09)
- **depends on:** TASK-196 (merged on main)

## Acceptance criteria
- [ ] Remove the "Seuranta tehty" checkbox column from the Tarjoukset list (all layouts) and the checkbox from the offer page.
- [ ] Omat keikat → Tarjoukset section: each follow-up row has a checkbox "Follow-up tehty" (EN "Follow-up done") that PATCHes `followUpDone: true` immediately; the row then disappears (refetch `['my-offers']`); inline error on failure. Clicking the checkbox must not trigger the row link.
- [ ] FI texts: tag "Seuranta?" → "Follow-up?", label "Seuranta tehty" → "Follow-up tehty" (incl. history field label). EN unchanged.
- [ ] Unit tests + e2e 27 updated; tests, lint, build pass; run e2e 27 (own E2E_DB_NAME/ports, COMPOSE_PROJECT_NAME=instaglamour-erp; stop servers after).
