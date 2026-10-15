# TASK-150: Remove the Spotify field from offer forms (fixed link)
- **owner:** ui · **status:** done · **spec:** api-contract "Offers" + "Public offer" (change 2026-10-15), UC-029, UC-030 · **depends on:** none · **parallel:** TASK-022 (backend), TASK-148/149 (don't touch styles.css, DataTable, gigs/hours/budget)
## Goal
The Spotify link is now one fixed link from the backend (`PublicOffer.spotifyUrl`, always set). Partners no longer enter it.
## Acceptance criteria
- [ ] Remove the Spotify field from New offer and the offer page (inline field); remove `spotifyUrl` from `OfferDetail` / create / patch types and i18n keys no longer used.
- [ ] Public offer page and internal preview keep the "Listen on Spotify" button, using `PublicOffer.spotifyUrl` (now `string`, non-null).
- [ ] MSW mocks: offers have no `spotifyUrl`; public/preview return a fixed synthetic link constant in the mock (`https://example.com/listen/demo-band`) — don't put the real link in mocks or tests; mock POST/PATCH with `spotifyUrl` → 400 like the contract. Remove `defaultSpotifyUrl` from mock settings and the "minimal" demo offer's "no Spotify" note.
- [ ] e2e: update `e2e/` specs that set or assert an offer Spotify field (allowed edit for this task).
- [ ] Tests, lint, build pass; README offer sections updated.
