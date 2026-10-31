# TASK-175: Compact density + rows instead of cards on phones
- **owner:** ui · **status:** done · **spec:** docs/design.md → "Compact density" (2026-10-31)
## Acceptance criteria
- [ ] Spacing tokens tightened (tokens.css / styles.css) so desktop pages show clearly more content (target: ~25–35 % more table rows visible at 1440×900 on Keikat/Tarjoukset; less padding in cards/sections/forms). Document the new values in tokens comments.
- [ ] Phones (< 600 px): replace card layouts with compact rows in ExcelTable, DataTable and hand-made lists (people, clients, offers, purchase orders, hours, tasks, budget, cost lines on the gig page, invoice rows, year page lists). Row = line 1: title/link + main figure/tag; line 2 (only if needed): secondary fields. Whole row tappable where it links. Filters/sort sheet on phones keeps working.
- [ ] Gig page and other detail pages: tighter field grid, small fields side by side, one-line label/value where possible.
- [ ] No horizontal scroll at 375/600/900/1440/1920; touch targets ≥ 40 px on phones; both themes checked (screenshots before/after in /tmp for comparison).
- [ ] Tests updated (phone-card assertions → row assertions); update e2e specs that assert cards/layout (allowed) and run the full e2e suite (fresh E2E_DB_NAME, free ports); lint, build.
