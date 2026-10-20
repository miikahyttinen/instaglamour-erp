# TASK-030: Convert offer with an edited gig
- **owner:** backend · **status:** done · **spec:** api-contract Offers (2026-10-20), BR-105, UC-031 · **depends on:** none · **parallel:** TASK-158
## Acceptance criteria
- [ ] `GET /api/offers/{id}/gig-draft` returns GigCreate (+ `clientId`) per BR-105 (lineupName = event name, lineupTemplateId null, venue "venue, city", price 0 if empty, seller/producer = offer seller or the caller if that seller is inactive); 409s per contract.
- [ ] `POST /api/offers/{id}/convert` with a GigCreate body: same validation/errors as `POST /api/gigs` (reuse the gig create path), cost lines per BR-020/021, link, disposition WON, logs (gig CREATED, offer CONVERTED / DISPOSITION_CHANGED). No body → unchanged behaviour. Still one gig per offer under concurrency.
- [ ] Tests (draft values incl. inactive seller; body overrides; validation 400; 409s; no-body regression); tests and lint pass.
