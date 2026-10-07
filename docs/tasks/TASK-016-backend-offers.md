# TASK-016: Offers — backend
- **owner:** backend · **status:** done · **spec:** UC-028…031, BR-102…107, domain-model, api-contract "Offers" + "Public offer" · **depends on:** TASK-015
## Acceptance criteria
- [ ] Migration: `offer`, `offer_event`, `gig.offer_id` (unique nullable), `partner.phone` (nullable). Enums per domain model. `share_token` ≥ 32 random bytes URL-safe (crypto), unique.
- [ ] Endpoints per contract incl. year filter, filters, summary (BR-106), patch (all fields, logged; disposition old → new), regenerate-link, convert (transaction; BR-105; 409 ALREADY_CONVERTED; idempotent under concurrency), delete/restore, history. Status/expired derived on the server (Helsinki today).
- [ ] **Public endpoint** `GET /api/public/offers/{token}`: no session; exact field whitelist; 404 for unknown/regenerated/deleted; `X-Robots-Tag: noindex`; constant-time-ish lookup by token; simple rate limit (e.g. 60/min/IP). Test that **no price/disposition/internal field** appears.
- [ ] Client endpoints now count/list offers; client delete 409 if offers link. Gig responses include `offerId`.
- [ ] Settings `offers.default_includes`, `offers.default_spotify_url`, `offers.references_fi`, `offers.references_en`; partner `phone` in seed. Example seed: synthetic offers across dispositions incl. one converted.
- [ ] Tests (rules, public whitelist, convert idempotency, regenerate) + lint pass. `backend/` only.
