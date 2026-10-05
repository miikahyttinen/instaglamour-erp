# TASK-011: Update e2e suite for technical setup / logistics / house technician

- **owner:** backend (integration; edits `e2e/` only)
- **status:** done
- **depends on:** TASK-010, TASK-133 (merged)

## Goal
17 e2e tests fail because e2e helpers create gigs via the API with the old `technicalSetup` array (backend now returns 400 `technicalSetup: INVALID_VALUE`), and UI steps may use the old "Tekniikka" checkbox group.

## Acceptance criteria
- [ ] API helpers send `technicalSetup` as one code or null, `logistics` as one code or null, `houseTechnician` boolean (contract 2026-10-05).
- [ ] UI steps use the new controls: combobox "Tekniikka" (–, Talon tekniikka, Setti A/B/C), combobox "Logistiikka" (–, Oma paku, Vuokrapaku, Taksi, Muu), switch "Talon teknikko".
- [ ] New checks: create a gig with Set A + Own van + house technician on; on the gig page change each inline (select saves on change, switch saves on change), reload persists, history shows old → new.
- [ ] Full suite green from a fresh DB at both viewports (report counts); real bugs → fixme + FINDINGS.md. Only `e2e/` edited.
