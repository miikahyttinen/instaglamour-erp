# TASK-019: Make the F-006 layout test independent of the gig list's auto-scroll
- **owner:** backend (integration; `e2e/` only) · **status:** todo · **depends on:** none
## Goal
`12-layout-v2.spec.ts:202` (F-006 table fits) fails on main: `toBeInViewport()` on the first column header gets ratio 0.44 at 1200 px — the gig list auto-scrolls to today, so the header row is partly above the viewport. The table width itself is not the issue.
## Acceptance criteria
- [ ] Before measuring, scroll the table into view (e.g. `scrollIntoViewIfNeeded` on the table / header) or assert on the table box geometry instead of viewport visibility; keep the actual assertion (table scrollWidth ≤ clientWidth, no page scroll) unchanged and strict for all 6 states.
- [ ] Check other specs for the same auto-scroll brittleness and fix similarly.
- [ ] Full suite from a fresh DB (`E2E_DB_NAME=instaglamour_e2e_t019`, free ports) green; report counts.
