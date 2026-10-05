# TASK-014: e2e for the hours summary list

- **owner:** backend (integration; edits `e2e/` only)
- **status:** todo
- **depends on:** TASK-135 (merged)

## Goal
`/hours/totals` is now a plain list (no charts): total tile, table "Osakkaat" (Partner | Tunnit <year>) with a total row; clicking a partner (button = partner name, `aria-expanded`) expands region "<Partner>: kirjaukset <year>" with month groups. My hours has no bars. Old month buttons / per-partner cards are gone.

## Acceptance criteria
- [ ] Update hours-related specs (07, 10, 12, 11 where relevant) to the new names without weakening them.
- [ ] New checks: all partners listed incl. 0 h, sorted by hours desc then name; rows sum to the total row = total tile = year page hours; expanding a partner shows their entries by month with month totals summing to the row; own entries editable inline (edit → totals update after save), others read-only; one partner open at a time; `?partner=` survives reload; **no bar charts** on either hours page.
- [ ] Full suite green from a fresh DB at both viewports; report counts. Only `e2e/` edited.
