# TASK-159: Simple editable convert modal (replaces the full form)
- **owner:** ui · **status:** todo · **spec:** UC-031 (2026-10-20, modal) · **depends on:** TASK-158 · **contract:** unchanged (gig-draft + convert with GigCreate body)
## Acceptance criteria
- [ ] "Muuta keikaksi" (offer list and offer page) opens a **modal** again (same look/size as the old `ConvertDialog`, see git history before TASK-158), not `/gigs/new?fromOffer=`.
- [ ] Modal loads `GET /api/offers/{id}/gig-draft` and shows editable, prefilled fields: alkupäivä (date), kokoonpano (lineupName), paikka (venue), asiakas (client select, may be empty), hinta (price), myyjä, tuottaja (active partners + prefilled value). Yellow warn badge **"Tarkista, että tiedot ovat oikein." / "Review that the information is correct."** at the top.
- [ ] Confirm **Muuta keikaksi** → `POST /api/offers/{id}/convert` with the draft merged with the edited fields → success notice with a link to the new gig (as the old dialog did); list/page refresh. Cancel/Esc closes. Field errors (400) shown next to fields; 409 ALREADY_CONVERTED → message + gig link. Double-submit guarded. Focus trap and keyboard accessible.
- [ ] Remove the `fromOffer` convert mode from `NewGigPage` (back to plain new gig) and its tests; keep the shared `parseGigCreate` mock.
- [ ] Update unit tests and `e2e/tests/16-offers.spec.ts` convert tests (allowed); run 16-offers e2e with a fresh E2E_DB_NAME; tests, lint, build; headless check 375/1440.
