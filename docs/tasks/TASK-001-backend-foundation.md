# TASK-001: Backend foundation — scaffold, schema, seed, auth, reference data

- **owner:** backend
- **status:** done
- **spec:** docs/use-cases/UC-001-login-and-language.md, docs/use-cases/UC-024-load-seed-data.md, docs/domain-model.md
- **depends on:** none

## Goal
Create the backend project that all later backend tasks build on: database schema for the whole
domain model, local Postgres, seed loading, Google sign-in with sessions, `/api/me` and
`/api/reference`.

## Contract
`docs/api-contract.md`: Conventions, Error format, Auth & me, Reference data.

## What to build
- `backend/`: Node 24 + TypeScript (strict), **Fastify**, **Prisma** (PostgreSQL), **Zod** for validation,
  **Vitest** for tests, ESLint. npm scripts: `dev`, `build`, `test`, `lint`, `db:migrate`, `db:seed`, `db:reset`.
- `docker-compose.yml` at the **repo root** (this task may create it): Postgres 16 for dev and a
  separate test database. Data in a named volume.
- `backend/.env.example` (committed, placeholder values only) — `DATABASE_URL`, `TEST_DATABASE_URL`,
  `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`,
  `AUTH_ALLOWED_DOMAIN`, `DEV_LOGIN_ENABLED`, `FRONTEND_URL`, `UPLOAD_DIR`.
- Prisma schema + first migration for **every** entity in `docs/domain-model.md`
  (Partner, Person, LineupTemplate/TemplateRole, Setting, Gig, CostLine, Attachment, GigEvent,
  Task, HourEntry, BudgetCategory, BudgetYear) incl. `Partner.selectedYear`. Money as integer cents.
- Seed command (UC-024): loads `backend/seed/seed.local.json` if present, else
  `backend/seed/seed.example.json`. Idempotent (upsert by natural keys, e.g. partner email,
  template name, category code, setting key). Invalid file → report errors, load nothing (transaction).
  `--reset` empties and reseeds. Define and document the JSON format in `backend/seed/README.md`.
- `seed.example.json`: synthetic only — partners "Partner A…E" with `@example.com` emails, "Person 1…10",
  2–3 templates ("Template A/B/C"), dummy round amounts, all budget category codes from the domain model,
  a handful of gigs/tasks/hours/budget rows so the app can be demoed.
- Auth: Google OAuth (authorization code flow) with server-side verification of the ID token;
  allowed only if the email's domain = `AUTH_ALLOWED_DOMAIN` (and verified) **and** the email is a
  partner (BR-070). httpOnly, `SameSite=Lax` session cookie, 30-day sliding expiry.
  `POST /api/auth/dev-login` registered **only** when `DEV_LOGIN_ENABLED=true`.
- `GET/PATCH /api/me`, `GET /api/reference`, global 401 for everything except `/api/auth/*`,
  error handler producing the contract error format.
- `backend/README.md`: how to start Postgres, migrate, seed, run, test.

## Acceptance criteria
- [ ] `docker compose up -d` + `npm run db:migrate` + `npm run db:seed` + `npm run dev` gives a working API on :3000.
- [ ] Schema covers every entity and field in `domain-model.md`.
- [ ] Seed is idempotent; invalid seed changes nothing; local seed file wins over example.
- [ ] Dev login works only with `DEV_LOGIN_ENABLED=true` (404 otherwise); unknown email → 403.
- [ ] Google callback rejects other domains (`WRONG_DOMAIN`) and non-partners (`NOT_A_PARTNER`) — unit-test the verification logic with mocked tokens.
- [ ] Every non-auth endpoint returns 401 without a session.
- [ ] `PATCH /api/me` validates `language` and `selectedYear`.
- [ ] `GET /api/reference` matches the contract.
- [ ] Tests run against the test database; tests and lint pass.

## Out of scope
Gig, cost, attachment, people, task, hours, budget and year endpoints (TASK-002, TASK-003). Frontend.

## Notes
- **BR-090 / CLAUDE.md data protection:** no real names, domains, amounts or secrets anywhere in committed files. `.env`, `seed.local.json`, uploads are gitignored — verify `.gitignore` covers `backend/seed/seed.local.json` and `backend/.env`.
- Put the CostType / TechnicalSetup enums in one shared module; later tasks reuse it.
