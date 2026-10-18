# TASK-153: Hide the freelancer link for partners
- **owner:** ui · **status:** done · **spec:** BR-113 (2026-10-18), UC-034 A4, api-contract "Purchase orders" · **depends on:** TASK-151 · **parallel:** TASK-025
## Acceptance criteria
- [ ] Person page: no "Freelancer-linkki" section (and no link request) when `person.partner?.active`. Granting partner status hides it immediately; removing shows it again.
- [ ] Handle 409 `PERSON_IS_PARTNER` (FI/EN text) gracefully if it happens anyway.
- [ ] MSW: link endpoints → 409 `PERSON_IS_PARTNER` for active partners; public freelancer endpoints → 404 for active partners.
- [ ] e2e: add a check to `e2e/tests/20-purchase-orders.spec.ts` (allowed): partner's person page has no link section; API link → 409; making the test person a partner → their old `/f/` link shows "Linkkiä ei löydy"; removing it → link works again. Run that spec plus 19-partner-status with a fresh E2E_DB_NAME and free ports (after TASK-025 is on main, or note if not yet).
- [ ] Tests, lint, build pass.
