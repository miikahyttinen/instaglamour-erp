# TASK-143: Shared Excel-style table with column filters + apply to Tarjoukset
- **owner:** ui · **status:** done · **spec:** docs/design.md → "Excel-style tables", UC-028 change 2026-10-14 · **depends on:** none (blocks TASK-144)
## Acceptance criteria
- [ ] Shared component in `src/components/` (e.g. `ExcelTable` + `ColumnFilter`) per design.md: sortable headers, filter icon per filterable column, popover with search/select all/clear/checkbox values incl. blank/OK/Cancel, highlighted icon when active, pinned first column, numeric alignment, URL-persisted filters + sort, "Clear filters", phone cards + "Suodattimet" sheet. Accessible (buttons with names like "Suodata: Myyjä", popover as dialog, focus management, Esc).
- [ ] Documented API in README + `/styleguide` demo.
- [ ] **Tarjoukset** offer list rebuilt on it: filters for Status (incl. Vanhentunut), Asiakas, Myyjä, Lähde, Tapahtumatyyppi, Lopputulos (+ any other sensible text column); remove the filter dropdowns above the table; keep search, Deleted view, inline selects, convert/link/delete actions, open value + win rate tiles (unfiltered).
- [ ] Unit tests (filtering, combination, blank, URL persistence, clear, keyboard); tests/lint/build pass; headless check both themes 375/1440. Do not edit `e2e/` (PM will update it).
