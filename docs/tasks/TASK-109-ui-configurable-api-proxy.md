# TASK-109: Configurable API proxy target (e2e finding F-001)

- **owner:** ui
- **status:** todo
- **spec:** e2e/FINDINGS.md F-001
- **depends on:** none

## Goal
The dev server's `/api` proxy target and port can be set via environment variables, so the e2e suite and developers can run on other ports without workarounds.

## Acceptance criteria
- [ ] `frontend/vite.config.ts` reads `VITE_API_PROXY_TARGET` (default `http://localhost:3000`) and `VITE_PORT` (default the current port); documented in `frontend/.env.example` and README.
- [ ] Default behaviour unchanged when the variables are not set.
- [ ] Tests, lint and build pass.

## Notes
`e2e/` currently works around this; do not edit `e2e/` — the PM will simplify it afterwards if needed.
