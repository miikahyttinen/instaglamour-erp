# TASK-132: Move language, theme and sign out to the top bar

- **owner:** ui
- **status:** done
- **spec:** docs/design.md → "Layout v2.1"
- **depends on:** TASK-125

## Acceptance criteria
- [ ] Desktop: language, theme toggle, sign out as icon buttons in the content top bar, right of the year selector (order: year · language · theme · sign out), aligned and evenly spaced; sign out has tooltip + accessible description "Kirjautuneena: <name>" / "Signed in as <name>".
- [ ] Sidebar: bottom area only has the collapse/expand toggle, bottom-left; remove the divider line (and the name line) above it; collapsed state still shows the toggle.
- [ ] Phone: top bar unchanged (☰ · logo · year); language, theme, sign out remain at the bottom of the drawer.
- [ ] `/styleguide` and README updated; unit tests updated (AppShell: controls in top bar on desktop, in drawer on phone; sidebar bottom has only the toggle).
- [ ] Headless screenshots both themes at 375, 900, 1440 px with sidebar expanded and collapsed (own debug port); no horizontal scroll.
- [ ] Tests, lint, build pass. Do not edit `e2e/` (TASK-009 will adapt).
- [ ] Note: TASK-131 edits `src/styles.css` / components in parallel — keep your CSS changes to the shell/top bar/sidebar blocks to avoid conflicts.
