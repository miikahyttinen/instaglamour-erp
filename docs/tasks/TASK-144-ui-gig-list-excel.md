# TASK-144: Keikat list on the shared Excel-style table
- **owner:** ui · **status:** done · **spec:** docs/design.md → "Excel-style tables", UC-003 change 2026-10-14 · **depends on:** TASK-143
## Acceptance criteria
- [ ] Gig list (table ≥ 1200 px and cards) rebuilt on the shared component so it **looks like Tarjoukset** (same header, paddings, row height, pinned first column, tags, numeric alignment).
- [ ] Column filters for Tila (Myyty/Soitettu/Peruttu), Kokoonpano, Paikka, Asiakas, Myyjä, Tuottaja, Miehitys kesken; remove the filter dropdowns/toggles above the table (keep search and the Keikat/Poistetut view switch; "Näytä myös perutut" becomes the Tila filter).
- [ ] Year summary tiles unchanged (unfiltered); scroll-to-today kept; F-006 fit at 1200 px kept or table scrolls inside its frame with pinned column (no page scroll).
- [ ] Unit tests updated; tests/lint/build pass; headless check both themes 375/1200/1440. Do not edit `e2e/`.
