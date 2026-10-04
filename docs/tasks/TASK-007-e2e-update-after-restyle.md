# TASK-007: Update e2e suite after the design restyle

- **owner:** backend (integration; edits `e2e/` only)
- **status:** done
- **spec:** all approved UCs; docs/design.md
- **depends on:** TASK-110…TASK-116 (merged)

## Goal
After the restyle (lists → tables, links → icon buttons, new page heads), 16 of 62 e2e tests fail. Make the suite green again **without weakening it**, and separate test problems from real bugs.

## Acceptance criteria
- [ ] Every failing test analysed: (a) outdated selector/markup assumption → update the test, preferring accessible roles/names; (b) real app bug or regression (wrong figure, missing action, broken flow, inaccessible control, horizontal scroll) → keep the assertion, mark `test.fixme`, and document in `e2e/FINDINGS.md` with severity and which side/file should change.
- [ ] No assertion is removed or loosened just to pass; behaviour coverage stays the same.
- [ ] Full suite run from a fresh DB at 375 and 1280 px; report pass/fail/fixme counts.
- [ ] Only `e2e/` is edited.
