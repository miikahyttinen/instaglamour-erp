# TASK-009: Update e2e suite for Layout v2 (sidebar, drawer, new breakpoints)

- **owner:** backend (integration; edits `e2e/` only)
- **status:** done
- **depends on:** TASK-125…130 (merged)

## Goal
Navigation moved to a collapsible left sidebar (desktop) and a ☰ drawer (phone, dialog "Päävalikko"); the bottom nav and header nav are gone; language is one button ("Vaihda kieleksi English"), theme one toggle; gig list shows a table only ≥ 1200 px; gig cost list switches to compact rows by container width. Update the suite without weakening it and add coverage for the new navigation.

## Acceptance criteria
- [ ] All specs pass at 375 and 1280 px (add a 1440 px project if useful for the wide gig table).
- [ ] New checks: sidebar collapse/expand persists across reload; collapsed nav items still reachable by accessible name; phone drawer opens via ☰, traps focus, closes on Esc/backdrop/navigation; no horizontal scroll on every page in both sidebar states.
- [ ] Real bugs → `test.fixme` + `e2e/FINDINGS.md`. Only `e2e/` edited. Use free ports; fresh DB run at the end; report counts.
