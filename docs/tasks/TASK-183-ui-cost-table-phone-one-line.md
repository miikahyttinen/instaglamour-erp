# TASK-183: Cost table on phone — one line per cost line

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-05 ("fit table lines to one line on mobile, font can be smaller")
- **depends on:** none

## Goal
Below the compact switch point (< 600 px cost-list width, i.e. phones) each cost line currently
stacks into several lines. Make every cost line a **single row** on phone, using a smaller font.
Secondary fields move into an expandable detail area of that row.

## Contract
None.

## Acceptance criteria
- [ ] Phone (< 600 px list width, checked at 375 and 414): each cost line is one row, no horizontal page scroll. Columns in the row, left → right:
  1. **Type · Person** on one line, truncated with ellipsis (person omitted when none);
  2. **Budget** amount (inline money field, right-aligned);
  3. **Actual**: paid amount (green, inline editable as now) or a compact pay button — icon-only check button with accessible name "Merkitse maksetuksi: <line>" that opens the same in-place amount input (PayControl) in that cell; FUEL: empty.
  4. A small expand chevron button ("Näytä lisätiedot: <line>", `aria-expanded`).
- [ ] Tapping the chevron expands a detail area under the row (full width) containing: type label, person picker (same rules as now: partners only for SALES/PRODUCTION), description field, load-in switch (musician roles), and the remove button. Only the tapped row expands; collapse with the chevron again. Expanding never changes the row's own one-line layout.
- [ ] Smaller font for the phone cost table (e.g. 0.8125rem / 13 px for row text, money fields same), touch targets for buttons ≥ 32 px high.
- [ ] Column headers on phone: one compact header row (Tyyppi / Budjetti / Toteuma) aligned with the columns; amounts right-aligned under their headers.
- [ ] Musician rows keep their shade and order; lines on a purchase order show the lock hint in the detail area; the "Lisää rivi" draft row on phone shows its fields in the expanded form (draft is expanded by default) and keeps its save/drop rules.
- [ ] Desktop/tablet (≥ 600 px) layouts unchanged.
- [ ] Unit tests for the phone row/expand behaviour; update e2e specs that rely on the phone stacked layout (02, 12, others found by grep); tests, lint, build pass. Before/after 375 screenshots in gitignored `frontend/tmp-screens/`.

## Out of scope
Desktop/tablet layout; other tables.
