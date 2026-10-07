# TASK-018: References (testimonials) — backend
- **owner:** backend · **status:** done · **spec:** BR-108, domain-model "Reference", api-contract "References" + "Public offer" · **depends on:** TASK-016
## Acceptance criteria
- [ ] Migration: `reference` table per domain model; image stored in `UPLOAD_DIR` (reuse attachment storage helpers); remove use of settings `offers.references_fi/_en` (keep the setting rows harmless or drop them in a migration — document).
- [ ] Endpoints per contract incl. upload (type sniffing as attachments, ≤ 10 MB), reorder (exact id set, else 400), delete removes the file.
- [ ] Public: `PublicOffer.references` = active references in order with `imageUrl` scoped to the token, EN quote falls back to FI on the client (send both); public image endpoint with the 404 rules of BR-108, `X-Robots-Tag: noindex`, cache headers, same rate limit as the public offer. `OfferDetail.preview` stays identical to the public payload (shared serializer).
- [ ] Seed: `references` section (quoteFi, quoteEn, author, active, optional image path relative to the seed file); example seed: 3 synthetic references, no images. Old seeds still load.
- [ ] Tests (CRUD, reorder, upload limits, public scoping: wrong token/hidden refs/inactive/no image → 404, preview == public) + lint pass. `backend/` only.
