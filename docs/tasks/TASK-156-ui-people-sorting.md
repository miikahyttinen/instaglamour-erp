# TASK-156: Sort the people list
- **owner:** ui · **status:** done · **spec:** owner request 2026-10-19; docs/design.md "Excel-style tables" (sort toggles) · **depends on:** TASK-155
## Goal
Partners can sort Henkilöt by name, gigs played and partnership.
## Acceptance criteria
- [ ] Sortable column headers (same sort toggle look and `aria-sort` as the Excel tables; reuse `ExcelTable`/its sort helpers or the same styling): **Nimi** (alphabetical, FI collation, case-insensitive), **Keikkoja** (number), **Osakas** (partners first, then others; ties by name). Clicking toggles asc/desc; default = Nimi ascending. Secondary order always by name.
- [ ] Sort state in the URL (`?sort=name|gigCount|partner&dir=asc|desc`), together with the existing filters; survives reload.
- [ ] Phones (cards): a "Järjestys / Sort" select with the same three options + direction.
- [ ] Client-side (no API change). Full width, no sideways scroll.
- [ ] Tests (each sort, toggle, URL, default, phone select), lint, build; headless check 375/900/1440.
