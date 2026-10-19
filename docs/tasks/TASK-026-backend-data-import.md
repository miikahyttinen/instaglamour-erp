# TASK-026: Data import endpoint
- **owner:** backend · **status:** todo · **spec:** UC-035, BR-120, BR-121, api-contract "Data import" · **depends on:** none · **parallel:** TASK-154
## Goal
Let partners import a seed-format JSON through the API, reusing `seed/load.ts` (`validateSeed`, `loadSeed`).
## Acceptance criteria
- [ ] `POST /api/import` (auth required) per contract: body limit 10 MB for this route only (413 `FILE_TOO_LARGE`), JSON parse errors → 400, `validateSeed` errors → 400 `details.errors`, plus import-only checks: partner email domain (`AUTH_ALLOWED_DOMAIN`), any `references[].image` rejected. Never touches the filesystem.
- [ ] Uses `loadSeed` in one transaction; `dryRun=true` rolls back; returns `ImportSummary` (adapt the loader's summary to the contract shape; extend the loader to count created/updated/skipped per entity if it doesn't yet — keep the CLI output working).
- [ ] Advisory lock so imports run one at a time.
- [ ] Migration: `import_run` table (partner, at, filename, summary JSON). `GET /api/import/runs`.
- [ ] Tests: dry run saves nothing and counts match a real run; re-import → all skipped; invalid doc errors; domain check; image rejected; 413; auth required; runs list. Tests and lint pass. Synthetic data only.
- [ ] README (backend + seed README "Import from the app").
## Out of scope
UI, deleting data (cleaning the DB is an ops step done by the PM with `npm run db:reset`).
