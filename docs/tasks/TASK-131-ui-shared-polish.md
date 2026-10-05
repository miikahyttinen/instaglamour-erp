# TASK-131: Shared polish after Layout v2

- **owner:** ui
- **status:** done
- **spec:** docs/design.md → Layout v2
- **depends on:** TASK-125…130 (merged)

## Acceptance criteria (shared files only: `src/styles.css`, `src/styles/tokens.css`, `src/components/**`, `src/lib/useMediaQuery.ts`)
- [ ] Inline switches use `--control-h` on desktop (global `label.switch { min-height: var(--tap) }` currently wins over `.inline-switch`); remove the local workaround in `people.css` once fixed.
- [ ] Native checkboxes: `margin: 0` in `label.check input` so they align with the control column everywhere; `.check-group legend` spacing works (fieldset legend); remove local workarounds in `newGig.css` / `gigPage.css` if now redundant.
- [ ] `MoneyInput` / inline money & hours: unit (€ / h) inside the field so money inputs end at the same right edge as other fields; plain values and inputs align digit-for-digit.
- [ ] `DataTable`: option to show cards below a given breakpoint (e.g. `cardsBelow: 'lg'`), used by the person cost-lines table so it doesn't scroll inside its frame at 900–1199 px.
- [ ] Shared `WIDE_QUERY = '(min-width: 1200px)'` in `useMediaQuery.ts`; replace local copies (gig list).
- [ ] `MiniBars` accepts a CSS length for `height` (or a `compact` variant); year page uses it instead of `height={32}`.
- [ ] Before/after screenshots of every page both themes at 375/900/1440 px — only the intended differences; no horizontal scroll.
- [ ] Tests, lint, build pass. Do not edit `e2e/` (TASK-009 runs in parallel).
