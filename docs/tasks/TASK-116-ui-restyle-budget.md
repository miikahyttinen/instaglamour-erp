# TASK-116: Restyle budget

- **owner:** ui
- **status:** done
- **spec:** docs/design.md, NFR-7
- **depends on:** TASK-110

## Goal
Restyle the budget page (`src/features/budget`) to the design system.

## Acceptance criteria
- [ ] PageHead with copy action; totals as StatTiles (year result is shown on the year page only — budget data has no year result; criterion corrected by PM); grid as DataTable with numeric right-aligned inputs; variance coloured (ok/danger); actuals-only as muted tag; phone cards.
- [ ] Tests, lint, build pass.

## Rules (six restyle tasks run in parallel)
- Use only the tokens and shared components from TASK-110 (see `/styleguide` and `frontend/README.md`). Do not edit shared files (`src/styles.css`, `src/components/*`, layout, i18n core, api, mocks) — if a shared component is missing something, implement locally in your feature and report it.
- Edit only your feature folder (CSS + TSX markup/classes). No behaviour changes; keep all tests passing (update selectors only if markup changes).
- Check both themes at 375 and 1280 px in headless Chrome against `npm run dev:mock`; no horizontal scroll.
- Style reference: `docs/design.md` (and, for look only, `<repo>/design_help.png` — never copy text or data from it).
