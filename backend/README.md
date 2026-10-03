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
| `UPLOAD_DIR` | Attachment storage, outside the repository (created on first upload; tests use a temp dir) |

## Sign-in

`GET /api/auth/google/start` → Google (authorization code + PKCE, state in a signed short-lived
cookie, `hd` hint) → `GET /api/auth/google/callback`: the code is exchanged server-side, the ID
token is verified (signature, audience, expiry) and the email must be Google-verified, in
`AUTH_ALLOWED_DOMAIN` and belong to a partner. On success an httpOnly, `SameSite=Lax` session cookie
is set (30 days, sliding; sessions are stored hashed in the `session` table).
Every `/api/*` route except `/api/auth/*` returns 401 without a session.

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
src/budget/        budget rows + loadBudget (single source for /api/budget and the year page)
src/http/errors.ts contract error format + zod → field codes (`parseInput`)
src/routes/        endpoints
test/              Vitest (integration tests use the test database)
```
