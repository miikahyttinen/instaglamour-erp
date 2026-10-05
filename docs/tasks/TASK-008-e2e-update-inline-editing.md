# TASK-008: Update e2e suite for inline editing

- **owner:** backend (integration; edits `e2e/` only)
- **status:** todo
- **spec:** NFR-8, docs/design.md → Inline editing
- **depends on:** TASK-119…123

## Goal
The UI switched to in-place editing (no Edit/Save buttons; fields save on blur/Enter, selects/switches on change). Update the e2e suite to the new interaction **without weakening it**, and add coverage of the new behaviour.

## Acceptance criteria
- [ ] Specs for gigs (02, 03, 11), tasks (06), hours (07) updated now; people (05) and budget (08) once TASK-123 is merged (the PM will tell you).
- [ ] Each flow edits by focusing a field, typing, and leaving it (blur or Enter); asserts the saved value persists after a page reload (proves it reached the backend).
- [ ] New checks: Esc reverts without saving; an invalid value shows the translated error and is not saved (verify by reload); **no Edit/Save buttons** on gig info/price, cost lines, tasks, hours, people, budget.
- [ ] Real bugs → keep assertion, `test.fixme`, document in `e2e/FINDINGS.md` (severity, file).
- [ ] Full suite green from a fresh DB at 375 and 1280 px (report counts).
- [ ] Only `e2e/` edited.

## Notes
New accessible names (from the UI developers): gig fields by label ("Kokoonpano", "Paikka", "Hinta", "Myyjä"…; total in `role="group"` "Kokonaishinta"); cost line fields "Budjetti: <line>", "Kuvaus: <line>", "Maksettu summa: <line>", "Henkilö: <line>"; task title label "Otsikko", delete "Poista: {title}", dialog "Poista tehtävä"; hours fields "Tunnit: <date> <comment>", "Kommentti: …" (comments are input values → use `getByDisplayValue`/`toHaveValue`).
