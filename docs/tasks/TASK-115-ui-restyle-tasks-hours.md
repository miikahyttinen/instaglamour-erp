# TASK-115: Restyle tasks and hours

- **owner:** ui
- **status:** todo
- **spec:** docs/design.md, NFR-7
- **depends on:** TASK-110

## Goal
Restyle the tasks page and both hours pages (`src/features/tasks`, `src/features/hours`) to the design system.

## Acceptance criteria
- [ ] Tasks: PageHead, filters, rows with done toggle, overdue as warn tag.
- [ ] Hours: year total as StatTile, month groups with SectionLabels; totals page per partner with MiniBars for months.
- [ ] Tests, lint, build pass.

## Rules (six restyle tasks run in parallel)
- Use only the tokens and shared components from TASK-110 (see `/styleguide` and `frontend/README.md`). Do not edit shared files (`src/styles.css`, `src/components/*`, layout, i18n core, api, mocks) — if a shared component is missing something, implement locally in your feature and report it.
- Edit only your feature folder (CSS + TSX markup/classes). No behaviour changes; keep all tests passing (update selectors only if markup changes).
- Check both themes at 375 and 1280 px in headless Chrome against `npm run dev:mock`; no horizontal scroll.
- Style reference: `docs/design.md` (and, for look only, `/Users/miikahyttinen/dev/instaglamour-erp/design_help.png` — never copy text or data from it).
