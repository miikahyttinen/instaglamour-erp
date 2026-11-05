# TASK-181: Cost list — musician/technical roles first, lighter grey rows

- **owner:** ui
- **status:** todo
- **spec:** owner request 2026-11-05
- **depends on:** none

## Goal
In the gig cost table, lines whose type is a musician role (`reference.costTypes.musicianRoles` —
musicians, Mix, DJ, Technician…) are always shown first, then all other lines. Musician rows get a
slightly lighter grey background than the other rows so the two groups are easy to tell apart.

## Contract
None (client-side ordering of `event.costLines`).

## Acceptance criteria
- [ ] Musician-role lines are listed first, other lines after; within each group the existing order from the API is kept (stable).
- [ ] A new musician-role line added via the "Lisää rivi" draft row (which stays at the bottom while being typed) moves up into the musician group once saved. Focus/keyboard flow after save must not break.
- [ ] Musician rows have a slightly lighter grey background (new design token, light and dark theme); paid-row styling still works on top of it. Phone layout: same distinction on stacked rows.
- [ ] Same ordering in the read-only (deleted gig) view.
- [ ] `docs/design.md`: one line describing the grouping and shade.
- [ ] Unit tests for ordering (incl. a saved draft musician line moving up); tests, lint, build pass; e2e 02 still passes.

## Out of scope
Backend ordering; group headings; other pages.
