# TASK-118: Inline edit foundation (save on blur)

- **owner:** ui
- **status:** done
- **spec:** NFR-8, docs/design.md → Inline editing
- **depends on:** none (blocks TASK-119…123)

## Goal
Shared components and a hook so every screen can switch to in-place editing consistently.

## Acceptance criteria
- [ ] `useInlineSave` hook: takes the saved value + an async `save(next)`; handles dirty check, saving/saved/error state, Esc revert, error → translated field code, keeps typed value on error.
- [ ] Components in `src/components/inline/`: `InlineText`, `InlineTextarea`, `InlineMoney` (euros ↔ cents, FI/EN parsing via existing helpers), `InlineHours`, `InlineDate`, `InlineSelect`, `InlineCheckbox`/`InlineSwitch` (save on change). All with label (visible or visually hidden), `disabled`, `validate?`, design per design.md (quiet look, hover hairline, focus input style, state indicator), works at 375 px.
- [ ] Polite live region announcements for saved/error.
- [ ] `/styleguide` section showing every inline component in all states, both themes; README usage docs.
- [ ] Unit tests: blur saves, Enter saves, Esc reverts, no request when unchanged, error keeps value and shows translated message, select saves on change.
- [ ] Tests, lint, build pass. No feature screens changed (TASK-119…123).
