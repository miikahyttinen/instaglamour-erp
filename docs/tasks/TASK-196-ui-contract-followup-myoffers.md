# TASK-196: Contract done checkbox, follow-up checkbox, My gigs offers section, red producer chip

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "Contract done, follow-up done, My offers (owner request 2026-11-09)"
- **depends on:** none (MSW mocks)

## Acceptance criteria
- [ ] Omat keikat: "Tuottaja" chip red (danger tone); musician chips unchanged.
- [ ] Omat keikat: second section "Tarjoukset / Offers" from `GET /api/me/offers`: contractMissing rows with red tag "Sopimus tekemättä / Contract not done" (link to gig if eventId, else offer), then followUp rows with blue (info) tag "Seuranta? / Follow-up?" (link to offer). Row: date, event name, client, venue/city. Empty state "Ei avoimia tarjouksia / No open offers". Mobile compact rows like the gig section.
- [ ] Checkbox "Sopimus tehty / Contract done" in the new gig form and the "Muuta keikaksi" dialog (default unchecked, sent as `contractDone`), and on the gig page (saves immediately via PATCH, inline error on failure).
- [ ] Tarjoukset list: checkbox column "Seuranta tehty / Follow-up done" (saves immediately via PATCH); same checkbox on the offer page. Mobile: fits in the compact offer row.
- [ ] Toggling these refreshes `['my-offers']` (new cache key) as well as offer/gig queries.
- [ ] MSW mocks (fields + `/api/me/offers` with the contract rules); unit tests; e2e spec (convert an accepted offer without contract → appears as "Sopimus tekemättä"; tick contract done on the gig → disappears; open offer shows "Seuranta?" until follow-up done is ticked) — may need TASK-058; say what you couldn't run. Tests, lint, build pass.
