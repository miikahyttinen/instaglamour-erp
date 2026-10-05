# TASK-135: Hours summary — total hours and hours per partner first

- **owner:** ui
- **status:** todo
- **spec:** UC-019 (owner request 2026-10-05: "totals should show total hours and hours for each partner")
- **depends on:** none

## Acceptance criteria
- [ ] `/hours/totals` top: one StatTile "Yhteensä / Total" with the year's total hours (large).
- [ ] Directly below: "Osakkaat / Partners" list — one row per partner (all partners, 0 h included, sorted by hours desc, then name): name, horizontal share bar, year hours right-aligned (tabular); a total row at the bottom equal to the tile.
- [ ] Month detail kept but compact: one partner × month table below (12 month columns + total; phone: cards or horizontal-scroll inside its own frame without page scroll); tapping a partner's month still shows that month's entries (own entries editable inline as today, others read-only).
- [ ] Remove the per-partner 12-box cards and the total-tile month bars (avoid duplication).
- [ ] FI/EN texts; uses existing `/api/hours/totals` (no API change); unit tests updated; tests, lint, build pass; headless check both themes at 375/1440 (own port). `frontend/` only, do not edit `e2e/` (PM will update it).
