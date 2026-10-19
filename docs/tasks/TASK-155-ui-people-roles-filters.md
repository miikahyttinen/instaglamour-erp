# TASK-155: People list — roles, gig count, filters on one line
- **owner:** ui · **status:** done · **spec:** api-contract "People: roles and gig count" · **depends on:** none · **parallel:** TASK-027
## Acceptance criteria
- [ ] People list (Henkilöt): new columns **Roolit / Roles** (role tags, FI/EN role labels) and **Keikkoja / Gig count** (number, right-aligned). Keep the Osakas label. Full width, no sideways scroll; phone cards show both.
- [ ] Filters on **one line**: existing Aktiiviset / Ei aktiiviset / Kaikki control, then a **Rooli / Role** select (Kaikki roolit + every musician role) replacing the "Osakkuus" filter, then a checkbox **Näytä vain osakkaat / Show only partners** (`partner=true` when checked; unchecked = no partner filter). Wraps nicely on phones. Filter state in the URL.
- [ ] Person page: shows gig count and an inline-editable **Roolit** multi-select (checkbox list or tag picker, saves on change per NFR-8, Esc reverts), using `PATCH roles`.
- [ ] Types (`Person.roles`, `Person.gigCount` required), endpoints, MSW mocks (synthetic roles/counts, `?role` filter, PATCH validation), fixtures updated.
- [ ] Tests, lint, build; update e2e specs that use the "Osakkuus" filter (e.g. `e2e/tests/19-partner-status.spec.ts`) — allowed; headless check 375/900/1440.
