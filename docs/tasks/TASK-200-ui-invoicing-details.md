# TASK-200: Gig page — "Laskutustiedot" free text under Laskutus

- **owner:** ui
- **status:** todo
- **spec:** docs/api-contract.md "Invoicing details on the gig (owner request 2026-11-11)"
- **depends on:** none (MSW mocks)

## Acceptance criteria
- [ ] Gig page "Laskutus" box: multi-line field "Laskutustiedot / Invoicing details" under the invoice rows, inline edit like the Notes field (save on blur, Esc reverts, inline errors incl. TOO_LONG). Read-only text on deleted gigs; empty shows a muted "–" in read-only.
- [ ] History shows changes with the field label. Phone layout fine at 375.
- [ ] Types, MSW mock (store + PATCH + history), unit tests; e2e: extend an invoicing spec (e.g. 18 or the gig page spec) to edit the field and see it persist — may need TASK-059; say if not run. Tests, lint, build pass.
