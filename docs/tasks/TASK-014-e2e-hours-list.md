# TASK-014: e2e for the hours summary list

- **owner:** backend (integration; edits `e2e/` only)
- **status:** done
- **depends on:** TASK-135, TASK-136 (merged)

## Goal
`/hours/totals` is now a plain list (no charts): total tile, table "Osakkaat" (Partner | Tunnit <year>) with a total row; clicking a partner (button = partner name, `aria-expanded`) expands region "<Partner>: kirjaukset <year>" with month groups. My hours has no bars. Old month buttons / per-partner cards are gone.

## Acceptance criteria
- [ ] Update hours-related specs (07, 10, 12, 11 where relevant) to the new names without weakening them.
- [ ] New checks: all partners listed incl. 0 h, sorted by hours desc then name; rows sum to the total row = total tile = year page hours; expanding a partner shows their entries by month with month totals summing to the row; own entries editable inline (edit → totals update after save), others read-only; one partner open at a time; `?partner=` survives reload; **no bar charts** on either hours page.
- [ ] Full suite green from a fresh DB at both viewports; report counts. Only `e2e/` edited.

## Revised 2026-10-05 — layout is now TASK-136 (spreadsheet tables), the list/expand version above is obsolete
- Totals: table "Tuntikirjaukset <year>" (Päivä | Osakas | Kommentti | Tunnit), default date ascending, sortable headers (`aria-sort`, buttons with same names), partner filter combobox "Osakas" (Kaikki + partners, `?partner=`), total row rowheader "Yhteensä" value `data-testid="hours-table-total"`.
- My hours: table "Omat tunnit <year>" (Päivä | Kommentti | Tunnit), total row, year total `data-testid="hours-year-total"`.
- Own rows inline: "Päivämäärä: <d> <comment>", "Kommentti: …", "Tunnit: …", delete "Poista: …" → dialog "Poistetaanko tuntikirjaus?". Others read-only.
- Checks: every entry once; unfiltered total = year page hours; filter total = partner's hours; sorting each column asc/desc; inline edit updates totals and persists after reload; others' rows have no inputs; no expand buttons, no month groups, no charts; no page horizontal scroll at 375.
