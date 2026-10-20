# TASK-158: Convert to gig opens a prefilled, editable form
- **owner:** ui · **status:** done · **spec:** UC-031 (2026-10-20), api-contract Offers · **depends on:** none · **parallel:** TASK-030
## Acceptance criteria
- [ ] "Muuta keikaksi / Convert to gig" (offer list and offer page) navigates to the new-gig form in convert mode (e.g. `/gigs/new?fromOffer=<id>`), prefilled from `GET /api/offers/{id}/gig-draft`. Reuse `NewGigPage` — all its fields editable (date(s), lineup template or custom name, venue, client, technical setup, logistics, house technician, seller, producer, price, additional sales, notes).
- [ ] A **yellow (warn) badge/notice** at the top: **"Tarkista, että tiedot ovat oikein." / "Review that the information is correct."**, plus "Tarjouksesta: <event name>" linking back.
- [ ] Submit → `POST /api/offers/{id}/convert` with the form as body → go to the new gig; offer list/page show the gig link. Cancel → back to the offer. 409 ALREADY_CONVERTED → message + link to the existing gig. Double-submit guarded.
- [ ] Inactive partners not offered in pickers except the prefilled value (existing rules).
- [ ] MSW mocks for gig-draft and convert-with-body; tests; update e2e specs that click convert (`16-offers.spec.ts`, others) — allowed — and run them with a fresh E2E_DB_NAME after TASK-030 is on main (or report); lint, build; headless check 375/1440.
