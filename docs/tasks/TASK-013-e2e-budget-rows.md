# TASK-013: e2e for partner-managed budget rows

- **owner:** backend (integration; edits `e2e/` only)
- **status:** todo
- **depends on:** TASK-012, TASK-134 (merged)

## Goal
4 tests fail after the budget-rows change (08-budget ×2, 11 "English amounts (budget)" ×2): the example seed's categories are now "Category A…I" with no fuel/actuals-only row, and `/reference` returns `{id, name}`.

## Acceptance criteria
- [ ] Update 08 and 11 to the new seed/markup without weakening them (row names via textbox "Rivin nimi, <name>" / "Row name, <name>"; money cells "<field>, <name>"; no actuals-only expectations).
- [ ] New checks: add a row ("Rivin nimi" + "Lisää rivi") → appears with zeros, also in another year; empty name → REQUIRED, duplicate (case-insensitive) → "Nimi on jo käytössä." and nothing created; rename inline (blur/Enter) persists after reload and money cell labels follow; remove via "Poista rivi <name>" → dialog "Poistetaanko rivi?" → row gone from all years and from totals/year page; Cancel keeps it; API: removed row's PUT → 404.
- [ ] Full suite green from a fresh DB at both viewports; report counts; real bugs → fixme + FINDINGS.md. Only `e2e/` edited.
