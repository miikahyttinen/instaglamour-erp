# TASK-180: Cost list — no hint text on fuel lines

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-04 (BR-008 unchanged)
- **depends on:** none

## Goal
The actual/paid cell of a `FUEL` line shows "Arvio – ei maksumerkintää." — remove it. The cell stays empty (no pay button, as now).

## Contract
None.

## Acceptance criteria
- [ ] FUEL line actual cell is empty in editable and read-only views; still no pay button.
- [ ] `costs.fuelHint` i18n key removed if unused.
- [ ] Tests updated (unit + any e2e referencing the hint); tests, lint, build pass.

## Out of scope
Anything else.
