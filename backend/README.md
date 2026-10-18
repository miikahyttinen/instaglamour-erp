# Instaglamour ERP — backend

Node 24 + TypeScript (strict), Fastify, Prisma 7 (PostgreSQL 16), Zod, Vitest, ESLint.
API contract: `../docs/api-contract.md`.

## First-time setup

```bash
# 1. Databases (from the repo root): dev on :5432, tests on :5433
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # then edit: SESSION_SECRET, AUTH_ALLOWED_DOMAIN, Google client…
npm install                   # also generates the Prisma client
npm run db:migrate            # apply migrations
npm run db:seed               # seed/seed.local.json if present, else seed/seed.example.json
npm run dev                   # API on http://localhost:3000
```

`npm install` / `npm ci` (and `npm run build`) work without `.env`: `prisma generate` doesn't
connect to the database, so `prisma.config.ts` uses a placeholder URL for `generate` only.
`db:migrate`, `db:seed`, `dev` and `start` still need a real `DATABASE_URL` and fail with an
error naming it when it's missing (`npm test` uses `TEST_DATABASE_URL`).

For local work without Google, set `DEV_LOGIN_ENABLED=true` in `.env` and sign in with
`POST /api/auth/dev-login {"email": "partner.a@example.com"}` (example seed). **Never enable it
outside local development.**

`.env`, `seed/seed.local.json` and uploads are gitignored — never commit them (BR-090).

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with reload (tsx watch) |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm test` | Vitest against the **test** database (`TEST_DATABASE_URL`, migrated automatically) |
| `npm run lint` | `tsc --noEmit` + ESLint |
| `npm run db:migrate` | Apply pending migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev -- --name x` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:seed` | Load seed data (idempotent) — see `seed/README.md` |
| `npm run db:reset` | **Delete all data**, then seed |

## Environment (`.env`)

| Variable | Meaning |
|---|---|
| `PORT` | API port (default 3000) |
| `DATABASE_URL` / `TEST_DATABASE_URL` | Dev and test databases (must differ — tests empty theirs) |
| `SESSION_SECRET` | Signs cookies; ≥ 16 chars, e.g. `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth "Web application" client |
| `GOOGLE_REDIRECT_URL` | Must be an authorised redirect URI of that client, e.g. `http://localhost:3000/api/auth/google/callback` |
| `AUTH_ALLOWED_DOMAIN` | Only verified Google accounts in this domain may sign in (BR-070) |
| `DEV_LOGIN_ENABLED` | `true` registers `POST /api/auth/dev-login` (otherwise 404) |
| `FRONTEND_URL` | Where the Google callback redirects (`/` or `/login?error=…`), e.g. `http://localhost:5173` |
| `UPLOAD_DIR` | Attachment and reference photo storage, outside the repository (created on first upload; tests use a temp dir; `npm run db:seed` copies seed photos here) |

## Sign-in

`GET /api/auth/google/start` → Google (authorization code + PKCE, state in a signed short-lived
cookie, `hd` hint) → `GET /api/auth/google/callback`: the code is exchanged server-side, the ID
token is verified (signature, audience, expiry) and the email must be Google-verified, in
`AUTH_ALLOWED_DOMAIN` and belong to an **active** partner. On success an httpOnly, `SameSite=Lax` session cookie
is set (30 days, sliding; sessions are stored hashed in the `session` table).
A session of a partner who is no longer active is refused (401) and deleted.

Partner status (UC-032, BR-110…112) is managed with `PUT/DELETE /api/people/{id}/partner`
(`src/partners/store.ts`). Every grant/revoke runs in one transaction under a Postgres advisory lock
(`pg_advisory_xact_lock`), so the "not yourself" / "not the last active partner" guards hold under
concurrent requests. Removal deactivates the partner (the row and its id stay, so old gigs, offers,
tasks and hours keep it) and deletes all its sessions in the same transaction; changing an active
partner's email also ends its sessions (except the requester's own). The email must be in
`AUTH_ALLOWED_DOMAIN` (checked on the server) and is unique case-insensitively (DB index
`partner_email_lower_key`). New seller/producer/owner choices must be active partners.

Every `/api/*` route except `/api/auth/*` and the exact public routes
`GET /api/public/offers/{token}`, `GET /api/public/offers/{token}/references/{id}/image`,
`GET /api/public/freelancers/{token}` and `POST /api/public/freelancers/{token}/purchase-orders`
returns 401 without a session (`PUBLIC_ROUTES` in `src/app.ts`).

Public rate limits: 60 requests/min per IP. The public offer page and the freelancer endpoints share
one budget; public reference photos have their own. They key on `request.ip`. The app sets `trustProxy: true`, so that IP comes
from `X-Forwarded-For`: only expose the server behind a proxy that sets it (otherwise a client can
spoof it and bypass the limit).

## Purchase orders (UC-033, UC-034)

- **Freelancer link** `/f/<token>`: `person.freelancer_token` (32 random bytes, base64url, unique).
  Existing people were backfilled by migration `20261016120000_purchase_orders` (column default built
  from `gen_random_uuid()` + `sha256`, no extension needed); regenerate uses the Node CSPRNG. An
  inactive person's link is 404. **Active partners have no freelancer link** (BR-113, 2026-10-18): their
  public link is 404 (view and create; re-checked under the PO lock), and `GET/POST
  /api/people/{id}/freelancer-link(/regenerate)` answer 409 `PERSON_IS_PARTNER` (unknown person → 404
  first). Removing partner status makes the same token work again. Existing POs of a person who becomes
  a partner stay manageable as before. The public view whitelists fields (FreelancerView / PublicPurchaseOrder).
- **Creating a PO** (public POST) runs in one transaction: `pg_advisory_xact_lock` per person, then
  `SELECT … FOR UPDATE` on the cost lines and `FOR SHARE` on their gigs, then the BR-114 check for every
  id — all or nothing (409 `COST_LINE_NOT_ELIGIBLE`, `details.costLineIds`). FUEL lines are never
  eligible (and not shown) because they can't be paid. Numbers: name slug + `purchase_order_seq`
  (global, never reused; gaps are possible after a failed request).
- **One active PO per cost line:** `purchase_order_line.active` is true while the PO is OPEN/PAID; the
  partial unique index `purchase_order_line_active_cost_line_key` backs the code check. Line snapshots
  (`cost_line_ref`, gig, type, description, amount) keep cancelled POs intact if a freed cost line is
  deleted later (`cost_line_id` is then null).
- **Lock (BR-118, `src/purchaseOrders/lock.ts`):** checked inside the mutating transaction after a row
  lock on the cost line / gig, so it can't race PO creation. PATCH counts as locked only if person,
  amount or load-in would actually change (description, or re-sending the same values, is allowed).
  Changing a gig's seller/producer doesn't move SALES/PRODUCTION lines that are on a PO (BR-027).
- **Pay / unpay** update the cost lines and write gig events `COST_PAID` / `COST_UNPAID` with
  `details.purchaseOrderNumber`. Every PO change appends a `purchase_order_event` (CREATED has
  `partner_id` null = the freelancer).
- **List year** = year of `created_at` in Europe/Helsinki; `q` (number or current person name,
  case-insensitive) searches all years.

## Layout

```
prisma/            schema.prisma + migrations (never edit an applied migration; add a new one)
seed/              seed command, format (README.md), synthetic example
src/app.ts         Fastify app: cookies, auth gate, error handler, routes
src/auth/          Google OAuth + sessions
src/domain/        shared enums (CostType, TechnicalSetup…), dates, default cost lines,
                   gig economics / year gig sums (gigEconomics.ts), load-in switch (loadIn.ts)
src/gigs/          gig data access (events, double-booking check, year gigs), input schemas, serializers
src/hours/         hour entries + loadHoursTotals (single source for /api/hours/totals and the year page)
src/clients/       client lookup + name-uniqueness check (routes/clients.ts; soft delete, BR-100/101)
src/offers/        offers (routes/offers.ts): derived status/expired (BR-102), year summary (BR-106),
                   convert-to-gig in one transaction (row lock + unique gig.offer_id, BR-105; if the
                   offer's seller is an inactive partner, the converting partner becomes the gig's
                   seller and producer, BR-111),
                   PublicOffer whitelist serializer (also OfferDetail.preview) and share tokens
                   (32 CSPRNG bytes, base64url; looked up by SHA-256, BR-104)
src/routes/publicOffers.ts  GET /api/public/offers/{token} and its token-scoped reference photos
                   (BR-108): the only non-auth routes besides /api/auth/*; noindex, 60 requests/min per IP
                   each (in-memory, 429 RATE_LIMITED); every photo miss is the same 404
src/purchaseOrders/ purchase orders (UC-033/034, BR-113…119): number slug + global sequence (number.ts),
                   freelancer link tokens (token.ts; the DB column default gives every new person one),
                   create / pay / unpay / cancel + serializers (store.ts), BR-118 lock checks (lock.ts)
src/routes/purchaseOrders.ts  partner PO endpoints + /api/people/{id}/freelancer-link(/regenerate)
src/routes/publicFreelancers.ts  public freelancer view + create PO (no session; noindex; shared limiter)
src/http/publicGuard.ts  noindex/no-store headers + per-IP limit for all public routes
src/partners/      partner status grant/revoke (UC-032): advisory-locked transaction, session revocation
src/references/    references/testimonials (routes/references.ts, BR-108): serializer, active list for
                   PublicOffer, photo responses (private; ?v=imageVersion cached a year, else no-cache + ETag;
                   errors no-store; nosniff)
src/fileStore/     UPLOAD_DIR files (attachments, reference photos): streamed upload with size limit,
                   content sniffing (PNG/JPG/WebP), random UUID file names
src/budget/        budget rows + loadBudget (single source for /api/budget and the year page); rows are
                   partner-managed (routes/budgetCategories.ts), removed = active false, values kept
src/http/errors.ts contract error format + zod → field codes (`parseInput`)
src/routes/        endpoints
test/              Vitest (integration tests use the test database)
```
