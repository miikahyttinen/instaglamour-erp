# TASK-127: Align gig page

- **owner:** ui
- **status:** todo
- **spec:** docs/design.md → "Layout v2"
- **depends on:** TASK-125

## Goal
Spacing and alignment pass for the gig page (`src/features/gigs`: GigPage, GigInfoFields, CostList, PersonSelect, Attachments, History, GigActions, gigPage.css).

## Acceptance criteria
- [ ] Layout v2 spacing/alignment applied; nothing misaligned at 375, 900 and 1440 px; no horizontal scroll.
- [ ] Tests, lint, build pass.

## Rules (five tasks run in parallel)
- Use only tokens/components from TASK-125 (see `/styleguide`, README). Do not edit shared files; report needs.
- Edit only your listed feature folder/files. No behaviour change.
- Apply design.md "Layout v2 → Space & alignment": one left edge, 12-col tile grid, aligned numeric columns, consistent paddings/heights, more space between sections.
- **Do not edit or run `e2e/`** — the PM updates it afterwards.
- Headless before/after screenshots both themes at 375 and 1440 px (own debug port 9400–9900); look at them yourself.
