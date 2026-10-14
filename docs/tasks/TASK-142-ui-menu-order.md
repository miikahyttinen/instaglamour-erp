# TASK-142: Year first in the menu
- **owner:** ui (may also edit the menu-order expectations in `e2e/`) · **status:** todo · **depends on:** none
## Goal
Owner request: put **Vuosi / Year** at the very top of the menu. New order: Vuosi, Tarjoukset, Keikat, Asiakkaat, Henkilöt, Tehtävät, Tunnit, Budjetti.
## Acceptance criteria
- [ ] `frontend/src/layout/navItems.ts` order changed (sidebar expanded/collapsed and phone drawer); unit tests updated.
- [ ] e2e: update only the expected menu order in `e2e/tests/12-layout-v2.spec.ts` (and anywhere else that asserts the order); run `12-layout-v2` with `E2E_DB_NAME=instaglamour_e2e_t142` and free ports.
- [ ] Unit tests, lint, build pass.
