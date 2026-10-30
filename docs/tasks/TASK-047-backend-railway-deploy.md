# TASK-047: Make the app deployable on Railway (single service)
- **owner:** backend (+ root files; may touch frontend build config only) · **status:** todo · **spec:** owner request 2026-10-31
## Acceptance criteria
- [ ] **One service:** in production the backend serves the built frontend (`frontend/dist`) with `@fastify/static` + SPA fallback (all non-`/api` GETs → `index.html`; long cache for hashed assets, no-cache for index.html). `/api/*` unchanged. Dev setup (Vite proxy) unchanged.
- [ ] Root build/start: a root `package.json` (or `railway.json` + nixpacks config) so Railway builds both: install backend + frontend, `npm run build` in frontend (production env, no mocks/dev login), `npm run build` in backend; start = backend `npm start`. Node version pinned (engines / `.nvmrc`). `railway.json` with `deploy.preDeployCommand: "cd backend && npm run db:migrate"`, healthcheck path, restart policy.
- [ ] `prisma` and `dotenv` (and anything `prisma.config.ts`/migrate needs) in backend `dependencies`, so `migrate deploy` works in the runtime image.
- [ ] `HOST` default `0.0.0.0` when `NODE_ENV=production` (keep 127.0.0.1 for dev); `PORT` from env.
- [ ] `GET /api/health` → 200 `{ ok: true }` (checks DB with a cheap query; 503 if down), no auth.
- [ ] `UPLOAD_DIR` documented for a Railway volume (e.g. `/data/uploads`); app creates it if missing.
- [ ] Startup fails fast with a clear message if production config is unsafe: `DEV_LOGIN_ENABLED=true` with `NODE_ENV=production` refused; `FRONTEND_URL` must be https in production.
- [ ] README "Deploy to Railway" section: services (app + Postgres + volume), every env var with example placeholders (no real values), pre-deploy migrations, first-deploy data copy (`pg_dump -Fc` local → `pg_restore` to Railway; copying uploads to the volume), Google OAuth redirect setup, backups.
- [ ] Tests (static serving + SPA fallback, health, config guards); tests + lint pass; `npm run build` from root works locally and `NODE_ENV=production node backend/dist/...` serves the app on one port (smoke test).
