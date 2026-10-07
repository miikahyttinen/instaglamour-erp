# TASK-015: Clients — backend
- **owner:** backend · **status:** todo · **spec:** UC-027, BR-100/101, domain-model "Clients & Offers", api-contract "Clients" · **depends on:** none (UI TASK-137 parallel)
## Acceptance criteria
- [ ] Migration: `client` table (name, notes, deleted_at, timestamps; unique active name case-insensitive, trimmed); `gig.client_id` nullable FK. (Offers come in TASK-016 — do not add offer tables now; `offerId` on gigs is added in TASK-016.)
- [ ] Endpoints per contract: list (with gigCount/offerCount — offerCount 0 until TASK-016), create, get (client + gigs; `offers: []` until TASK-016), patch, delete (soft; 409 `CLIENT_IN_USE`).
- [ ] Gigs: `clientId`/`clientName` in GigSummary/Detail; create/patch accept `clientId` (null clears, unknown → `UNKNOWN_REFERENCE`, logged in UPDATED); gig list `q` matches client name.
- [ ] Seed: `clients` section (name, notes) + gig `client` by name; example seed gets ~5 synthetic demo clients ("Client A Oy", "Client B ry", …) linked to most example gigs; old local seeds without clients still load.
- [ ] Tests + lint pass. `backend/` only.
