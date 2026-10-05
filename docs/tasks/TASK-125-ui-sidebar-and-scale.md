# TASK-125: Sidebar navigation, smaller type scale, spacing & layout container

- **owner:** ui
- **status:** done
- **spec:** docs/design.md → "Layout v2"
- **depends on:** none (blocks TASK-126…130)

## Acceptance criteria
- [ ] **Sidebar** per Layout v2: logo, icon nav (lucide), active state, bottom area (language, theme, sign out + name when expanded), collapse/expand toggle persisted in localStorage, smooth transition (reduced-motion safe), collapsed = icons with tooltip + accessible name.
- [ ] **Phone:** top bar (☰, logo, year selector), sidebar as overlay drawer with backdrop, focus trap, closes on Esc/backdrop/navigation; bottom nav removed.
- [ ] **Content top bar** with year selector (right), sticky.
- [ ] **Tokens:** new type scale and spacing tokens per Layout v2; `PageHead`, `StatTile`, `StatGrid` (12-col spans), `Card`, `DataTable`, `SectionLabel`, inline fields and buttons updated to them; a shared `.page-container` (max 1200 px, page padding) used by the app shell for every route.
- [ ] `/styleguide` updated (sidebar expanded/collapsed, drawer, new scale); README updated.
- [ ] All existing screens still work and inherit the new scale/spacing via shared components (per-screen alignment is TASK-126…130).
- [ ] Unit tests updated (AppShell nav, collapse persistence, drawer open/close/Esc, focus trap); tests, lint, build pass.
- [ ] Headless check both themes at 375, 900 and 1440 px (own debug port). **Do not edit `e2e/`** — the PM will update it after all layout tasks.
