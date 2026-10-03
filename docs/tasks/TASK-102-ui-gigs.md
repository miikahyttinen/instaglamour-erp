# TASK-102: UI gigs — list, create, gig page, costs, attachments, history

- **owner:** ui
- **status:** done
- **spec:** UC-002, UC-003, UC-004, UC-005, UC-007, UC-008, UC-009, UC-010, UC-012, UC-013, UC-025
- **depends on:** TASK-101

## Goal
All gig screens.

## Contract
`docs/api-contract.md`: Gigs, Cost lines, Attachments (+ mocks for them).

## Acceptance criteria
- [ ] Gig list for the selected year with year summary on top, filters, search, cancelled toggle, deleted view, phone cards (UC-003).
- [ ] New gig form with template/custom lineup, validation errors from field codes (UC-002).
- [ ] Gig page with all sections of UC-004; editing basic info, price and additional sales; shows which Sales/Production lines moved after a seller/producer change.
- [ ] Cost list: add/edit/remove lines, person picker (active people), load-in switch, mark paid (amount defaults to budget, editable) / unpaid with paid time and partner shown, no pay action for FUEL, double-booking warnings shown (UC-005).
- [ ] Move, cancel (with reminder to adjust price and add a note), uncancel, delete, restore — reasons required, dialogs (UC-009, UC-010, UC-012, UC-025).
- [ ] Attachments: upload (also phone camera/files), open/download, remove; size/type errors (UC-008).
- [ ] History: readable, localized descriptions for every event type with old → new values (UC-013).
- [ ] Tests for the acceptance criteria; tests and lint pass; works at 375 px.
