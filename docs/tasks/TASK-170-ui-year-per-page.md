# TASK-170: Year selector per page instead of global
- **owner:** ui · **status:** todo · **spec:** api-contract "Year is no longer global", BR-081 revised · **parallel:** TASK-042; another agent is relabelling Events → Keikat (i18n + routes) — expect small conflicts; keep both
## Acceptance criteria
- [ ] Remove the year selector from the top bar (desktop + phone drawer). Add a **page-level year selector** (same look as the old one: ‹ 2026 ›) at the top of **Vuosi**, **Budjetti**, **Tunnit**, **Keikat**; it reads/writes `Me.selectedYear` (PATCH /api/me) so the four pages share the year; default current year.
- [ ] **Tarjoukset:** no year; table shows all offers, default sort created newest first. KPI cards: call stats without year; year cards (average, by event year, open value) show bars for year−3…year+2 with the current year selected by default (clickable); month card, by-type and win-rate unchanged.
- [ ] **Ostotilaukset**, **person page cost lines**, **clients**, **tasks**: no year dependency (all years, newest first); remove any "selected year" wording.
- [ ] MSW mocks per contract; tests; update e2e specs that use the top-bar year selector or year URLs (allowed) and run the full suite after TASK-042 is on main (fresh E2E_DB_NAME, free ports); lint, build; headless check 375/1440.
