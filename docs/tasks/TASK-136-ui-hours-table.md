# TASK-136: Hours as spreadsheet-style tables

- **owner:** ui
- **status:** done
- **spec:** UC-018, UC-019 (owner choice 2026-10-05: "All entries in one table", Excel style, no collapsing)
- **depends on:** TASK-135 (merged; this replaces its partner list / expandable rows and the month groups)

## Acceptance criteria
- [ ] **Yhteenveto / Totals** (`/hours/totals`): one flat `DataTable`-style table of all entries of the selected year: Päivä/Date | Osakas/Partner | Kommentti/Comment | Tunnit/Hours (right-aligned, tabular). Default sort date ascending (ties: partner, then created); clicking a column header sorts asc/desc (`aria-sort`). Total row at the bottom = sum of shown rows. Partner filter (select: Kaikki/All + partners) above the table, kept in the URL (`?partner=`); total follows the filter. No total tile duplication needed (optional single tile above is fine). No expand/collapse, no charts, no month grouping.
- [ ] Own rows: date, comment, hours inline-editable (InlineDate/InlineText/InlineHours, hidden labels unique per row) + delete icon with confirmation; others' rows read-only plain text.
- [ ] **Omat tunnit / My hours** (`/hours`): same table style with only own entries (columns Date | Comment | Hours), same sorting and total row; year total figure above; add form unchanged; moving an entry to another year still shows the notice.
- [ ] Data: use existing endpoints (`GET /api/hours?year=&partnerId=` per partner and/or for all partners — if listing all partners needs one call per partner, do it in parallel and document; no API change).
- [ ] Phone (< 600 px): table becomes compact cards or scrolls inside its own frame — no page-level horizontal scroll.
- [ ] Remove now-unused code/CSS (partner list, expand rows, HourMonthGroups if unused). FI/EN texts; unit tests updated; tests, lint, build pass; headless check both themes 375/1440 (own port). `frontend/` only; do not edit `e2e/`.
