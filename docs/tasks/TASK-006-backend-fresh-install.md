# TASK-006: Backend installs on a fresh checkout (e2e finding F-002)

- **owner:** backend
- **status:** todo
- **spec:** e2e/FINDINGS.md F-002
- **depends on:** none

## Goal
`npm ci` / `npm install` in `backend/` must succeed on a fresh checkout without a `.env` file.

## Acceptance criteria
- [ ] `prisma generate` during install no longer requires `DATABASE_URL` (e.g. a safe placeholder fallback for generate only, or move generate out of postinstall into `build`/`dev`/`test` scripts) — runtime still requires a real `DATABASE_URL` and fails clearly without it.
- [ ] Verified: in a clean copy without `.env`, `npm ci` succeeds; with `.env`, migrate/seed/dev/test work as before.
- [ ] README updated if the step order changes. Tests and lint pass.
