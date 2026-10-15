# TASK-149: Responsive full-width tables on the gig page (costs), Hours and Budget
- **owner:** ui · **status:** todo · **spec:** docs/design.md → "Full-width, responsive tables everywhere" · **depends on:** TASK-147 · **parallel:** TASK-148 (shell + DataTable)
## Goal
Make the gig page cost list, the hours tables and the budget table fill the page width and never scroll sideways. TASK-148 removes the page width cap globally in parallel; this task only touches these features' own components and CSS.
## Acceptance criteria
- [ ] Gig page cost list (`CostList.tsx`, `gigPage.css`, incl. the `@container cost-list` rules): fills the width; no horizontal scroll at ≥ 600 px; inline inputs/selects shrink sensibly; existing narrow/stacked layout kept for small containers.
- [ ] Hours tables (`features/hours/`): width 100%, no sideways scroll; text (comment) wraps, dates and hours don't.
- [ ] Budget table (`features/budget/`): width 100%, no sideways scroll; category text wraps, amounts don't; inline inputs keep usable widths.
- [ ] Headless check at 600, 900, 1200, 1440, 1920 px, sidebar expanded/collapsed, both themes, FI/EN. To see true full width before TASK-148 lands, you may locally override `.page-container { max-width: none }` in the browser — **do not edit `src/styles.css`, `components/DataTable.tsx` or the layout**.
- [ ] Unit tests updated; tests, lint, build pass.
## Out of scope
Shared layout/`styles.css`/`DataTable` (TASK-148), gig list, offers.
