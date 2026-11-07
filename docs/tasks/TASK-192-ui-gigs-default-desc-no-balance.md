# TASK-192: Gig list — newest/future first by default; drop "Laskuttamatta" column

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-07
- **depends on:** none

## Acceptance criteria
- [ ] The Keikat list's default sort is date descending (same as `/gigs?sort=date&dir=desc`): latest/future gigs first. Opening `/gigs` without params uses it; the URL may stay clean (no params) when the default is active. Clicking the date header still toggles asc/desc; other sorts work as before. The page still opens at the top (TASK-191).
- [ ] The "Laskuttamatta / Not invoiced yet" column (`balance`, `g.balanceCents`) is removed from the gig list table (all layouts incl. phone rows). It stays on the gig page invoicing box; the list's sort option for it is removed (old `?sort=balance` falls back to the default).
- [ ] Unit tests + e2e (e.g. 18, 11, 12, 23 — grep for the column header, sort order or row order assumptions) updated; tests, lint, build pass; run affected e2e with your own E2E_DB_NAME/ports (COMPOSE_PROJECT_NAME=instaglamour-erp), stop servers after.
