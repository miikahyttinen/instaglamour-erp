# TASK-022: Fixed Spotify link for all offers
- **owner:** backend · **status:** done · **spec:** api-contract "Offers" + "Public offer" (change 2026-10-15), UC-029, UC-030 · **depends on:** none · **parallel:** TASK-150 (UI)
## Goal
The owner wants one hard-coded Spotify link on every offer instead of a per-offer field with a seeded default.
## Contract
- Constant `SPOTIFY_URL = 'https://open.spotify.com/playlist/1iHADEaVKULre5JnAMAslK?si=79b91f974ef940b9'` in backend code (e.g. `backend/src/offers/constants.ts`). The owner asked for this exact link to be hard-coded; it is a public marketing link and may be committed.
- `PublicOffer.spotifyUrl` (public endpoint and `OfferDetail.preview`) = that constant, always (non-null).
- `OfferDetail` has no `spotifyUrl`. `spotifyUrl` in POST/PATCH /api/offers → 400 `VALIDATION_ERROR`, `fields.spotifyUrl = INVALID_VALUE`.
## Acceptance criteria
- [ ] Constant added; serializer uses it; `spotifyUrl` removed from offer input schemas, OfferDetail and history field list.
- [ ] Seed: stop reading `offers.default_spotify_url` and per-offer `spotifyUrl`; remove them from `seed/schema.ts` (an old local seed file that still contains them must still load — accept and ignore the keys) and `seed.example.json`; update seed README.
- [ ] Keep the `spotify_url` DB column (no destructive migration); mark it obsolete in `schema.prisma` with a comment.
- [ ] Tests updated (public offer returns the constant, preview same, POST/PATCH with spotifyUrl → 400); tests and lint pass.
## Out of scope
Frontend, e2e (TASK-150).
