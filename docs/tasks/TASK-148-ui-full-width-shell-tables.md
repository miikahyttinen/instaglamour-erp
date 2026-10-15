# TASK-148: Full-width pages + responsive DataTable (shell, Clients, People, Year, Tasks)
- **owner:** ui · **status:** done · **spec:** docs/design.md → "Full-width, responsive tables everywhere" · **depends on:** TASK-147 · **parallel:** TASK-149 (gig page, hours, budget)
## Goal
Every page fills the window horizontally and every table fills its page without sideways scrolling. This task owns the shared layout and `DataTable`; TASK-149 does the gig page cost list, hours and budget.
## Acceptance criteria
- [ ] `.page-container` and `.topbar-inner` no longer capped by `--content-max` on any app page (remove the cap / make `.page-wide` behaviour the default; keep page padding). Public offer page unchanged. Clean up the now-redundant `page-wide` class usage if it becomes a no-op.
- [ ] Forms and field groups that would become uncomfortably wide keep their own max width (check New gig, New offer, Client form, Person page fields, Task form, sign-in, Not found).
- [ ] `DataTable` / `.table-wrap` / `.data-table`: `width: 100%`, no horizontal scroll box at ≥ 600 px; text cells wrap, numbers/dates/money/tags don't. Add optional column `priority` (1–3, same breakpoints and container-query approach as ExcelTable) if any table needs it to fit; reuse ExcelTable CSS/helpers where sensible.
- [ ] Tables on Clients list, Client page (gigs + offers), People list, Person page, Year page, Tasks fill the width and don't scroll sideways at 600, 900, 1200, 1440, 1920 px, sidebar expanded and collapsed, both themes, FI and EN (headless check). Phone layouts (< 600) unchanged.
- [ ] Unit tests updated/added; tests, lint, build pass. Run e2e specs 10 and 12 (fresh DB, free ports) and update layout assertions that assumed the 1200 px cap.
## Out of scope
`features/gigs/` gig page + CostList, `features/hours/`, `features/budget/` (TASK-149). Do not edit their files.
