# TASK-171: Create purchase order by hand (Ostotilaukset page + gig page button)
- **owner:** ui · **status:** todo · **spec:** api-contract "Purchase orders created by partners" · **parallel:** TASK-043; another agent changes year selectors (layout/top bar, year pages, offers) — avoid those files
## Acceptance criteria
- [ ] **Ostotilaukset page:** button **"Uusi ostotilaus" / "New purchase order"** → dialog: choose person (searchable select of active people), then their eligible fees (`GET …/po-eligible-lines`) as a checklist (gig date, venue, role, amount), selected total, **"Luo ostotilaus"** → 201 → go to the new PO page (or show it) with its number. Empty state "Ei avoimia palkkioita / No unpaid fees".
- [ ] **Gig page:** button **"Luo ostotilaus" / "Create purchase order"** (in the cost list header/actions) → same dialog with `eventId` set: choose a person from **this gig's crew** who has eligible fees here; their eligible lines on this gig pre-ticked; create → success notice with link to the PO; cost lines refresh and show the "PO <number>" tag.
- [ ] 409 `COST_LINE_NOT_ELIGIBLE` → message + refetch; double-submit guarded; keyboard accessible dialog.
- [ ] PO log/history shows the creating partner's name for hand-made POs (API sends it).
- [ ] MSW mocks per contract; tests; lint; build; add an e2e test (gig page → create PO for one person → PO listed, lines tagged) — run it after TASK-043 is on main (fresh E2E_DB_NAME, free ports); headless check 375/1440.
