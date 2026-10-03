# TASK-004: End-to-end tests against the real stack

- **owner:** backend (integration; may create `e2e/` at the repo root)
- **status:** todo
- **spec:** all approved UCs; docs/api-contract.md
- **depends on:** all TASK-00x and TASK-10x (merged)

## Goal
Prove the real frontend and real backend work together, and find every mismatch between them.

## What to build
- `e2e/` at the repo root: **Playwright** (Chromium) tests that start Postgres (docker compose), a freshly migrated and seeded **test** database (example seed only), the backend with `DEV_LOGIN_ENABLED=true`, and the frontend dev server **without mocks**.
- npm script `e2e` in `e2e/package.json`; README with how to run.
- Smoke flows (FI UI), run at **375 px and 1280 px**:
  1. Dev login → year page shows figures.
  2. Create gig from a template → cost lines created → assign a person → load-in switch → mark paid → economics update.
  3. Edit price and additional sales; move; cancel (adjust price); uncancel; delete and restore; history shows the events.
  4. Upload a small synthetic PDF, download it, remove it.
  5. People: add, rename, deactivate; person page shows their lines.
  6. Tasks: add, mark done, reopen.
  7. Hours: add own entry; totals page shows it; year page hours updated.
  8. Budget: edit a row; year page budget/year result updated; copy to next year.
  9. Language switch to EN; year switch.
- Assert there is **no horizontal scroll** at 375 px on every main page.

## Rules
- You may only create/edit files in `e2e/` and `.gitignore`. **Do not fix frontend or backend code.** Record every bug or mismatch in `e2e/FINDINGS.md` (what, where, expected vs actual, which side is wrong per the contract) and mark the affected test `test.fixme` with a reference to the finding.
- Use a separate database for e2e (e.g. `instaglamour_e2e` on the test Postgres) — never the dev database.

## Acceptance criteria
- [ ] `cd e2e && npm install && npx playwright install chromium && npm run e2e` runs the whole stack and the suite.
- [ ] All flows above covered at both viewport sizes.
- [ ] Every failure is either fixed by test correction (if the test was wrong) or documented in FINDINGS.md.
- [ ] Synthetic data only (BR-090).
