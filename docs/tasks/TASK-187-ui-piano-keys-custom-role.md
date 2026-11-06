# TASK-187: UI — Keys/piano label, PIANO removed; custom role not offered as a person role

- **owner:** ui
- **status:** todo
- **spec:** docs/api-contract.md "Piano merged into Keys; custom role is not a person role (owner decision 2026-11-07)"
- **depends on:** none (build against the contract)

## Acceptance criteria
- [ ] `PIANO` removed from frontend enums/type options; `KEYS` label FI "Koskettimet / piano", EN "Keys / piano"; history still labels an old `PIANO` code as "Piano".
- [ ] People page and person page: role choices, role chips and the role filter use `reference.costTypes.personRoles` (no "Oma rooli"). Cost line type selects (gig, draft row, lineup editor) still offer "Oma rooli".
- [ ] Musician-line person picker unchanged (custom role → everyone); creating a new person on a custom-role line gives no role (already so).
- [ ] MSW mocks/seed updated (no PIANO, personRoles in reference); unit tests updated; e2e specs touching PIANO or role filters updated; tests, lint, build pass.
