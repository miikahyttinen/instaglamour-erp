# TASK-114: Restyle people

- **owner:** ui
- **status:** done
- **spec:** docs/design.md, NFR-7
- **depends on:** TASK-110

## Goal
Restyle the people list and person page (`src/features/people`) to the design system.

## Acceptance criteria
- [ ] PageHead + filter; list as DataTable/cards; person page with totals as StatTiles and cost lines as DataTable; inactive as muted tag.
- [ ] Tests, lint, build pass.

## Rules (six restyle tasks run in parallel)
- Use only the tokens and shared components from TASK-110 (see `/styleguide` and `frontend/README.md`). Do not edit shared files (`src/styles.css`, `src/components/*`, layout, i18n core, api, mocks) — if a shared component is missing something, implement locally in your feature and report it.
- Edit only your feature folder (CSS + TSX markup/classes). No behaviour changes; keep all tests passing (update selectors only if markup changes).
- Check both themes at 375 and 1280 px in headless Chrome against `npm run dev:mock`; no horizontal scroll.
- Style reference: `docs/design.md` (and, for look only, `/Users/miikahyttinen/dev/instaglamour-erp/design_help.png` — never copy text or data from it).
