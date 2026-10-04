# TASK-110: Design foundation — tokens, themes, fonts, logo, header, shared components

- **owner:** ui
- **status:** todo
- **spec:** docs/design.md, NFR-7
- **depends on:** none (blocks TASK-111…116)

## Goal
Everything the screen restyles (TASK-111…116) build on, so they can run in parallel without inventing styles.

## Acceptance criteria
- [ ] **Fonts:** Afacad + a monospace (per design.md), self-hosted via npm packages (no external font CDN at runtime).
- [ ] **Tokens:** all colour/spacing/typography tokens from design.md as CSS custom properties for dark and light (`:root[data-theme="dark"|"light"]`); existing global styles in `src/styles.css` migrated to tokens; no hard-coded colours left in shared CSS.
- [ ] **Theme:** default from `prefers-color-scheme`; header toggle (sun/moon) overrides and persists in `localStorage` (wrapped in try/catch); theme applied before first paint (inline script in `index.html`) — no flash. FI/EN labels for the toggle.
- [ ] **Logo:** cropped, transparent-background white and black logos generated from the local source files (see Notes) into `src/assets/brand/` (optimized; 2× header size); theme-aware `<Logo>` component; favicon. The original JPGs are NOT committed.
- [ ] **App shell/header** per design.md: logo left, nav, year selector, right-side icon buttons (language, theme, sign out); phone layout keeps bottom nav; sign-in page restyled with the large logo.
- [ ] **Shared components** in `src/components/` (restyle existing ones, add missing): `Button` (ghost/primary/danger, icon), inputs/select/textarea via existing `fields.tsx`, `Dialog` (bottom sheet on phone), `Card`, `StatTile` (label, big value, caption, optional mini bars), `PageHead` (title, mono subtitle, actions, divider), `SectionLabel`, `StatusTag` (info/ok/warn/danger/muted), `DataTable` styles (header, rows, numeric cells, phone card mode), `MiniBars`. Icons via `lucide-react`.
- [ ] **Styleguide page** at `/styleguide` (dev only, not in nav) showing every component in both themes — the reference for TASK-111…116. Document component usage in `frontend/README.md`.
- [ ] Existing screens keep working (they will look partly restyled via shared styles — fine); tests, lint, build pass; screenshots checked in headless Chrome at 375 and 1280 px in both themes.

## Out of scope
Restyling individual feature screens beyond what shared styles give for free (TASK-111…116).

## Notes
- Source files are gitignored and therefore NOT in your worktree. Read them from the main checkout:
  - Logos: `/Users/miikahyttinen/dev/instaglamour-erp/frontend/assets/Instaglamour-Some-1080x1080px-black.jpg` and `…-white.jpg` (logo bbox ≈ x 50–1030, y 414–666).
  - Style reference: `/Users/miikahyttinen/dev/instaglamour-erp/design_help.png` — look at it for style only; **never copy any text, names or numbers from it** (it contains real data).
- New dependencies allowed: font packages, `lucide-react`. Image processing for the logo may use a local tool/script that is not committed, or a committed dev script — your choice, documented.
