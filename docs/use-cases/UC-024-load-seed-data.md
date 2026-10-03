# UC-024: Load local seed data

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Developer
- **Replaces:** —
- **Business rules:** BR-090

## Goal
Fill the local database without any business data entering the repository.

## Trigger
A developer sets up or resets a local database.

## Preconditions
- Migrations applied.

## Main flow
1. Developer runs the seed command.
2. If `seed.local.*` exists (gitignored), it is loaded: partners, people, lineup templates with default fees, settings, budget categories, optional gigs/tasks/hours/budget.
3. Otherwise the committed `seed.example.*` is loaded: synthetic data only ("Partner A", "Person 1", "Venue X", dummy amounts).
4. Seed is idempotent.

## Alternative flows
- **A1 – Reset**: `--reset` empties and reseeds.

## Error flows
- **E1 – Invalid seed file** → errors reported, nothing loaded.

## Postconditions
- Usable local database.

## Acceptance criteria
- [ ] AC-1: `.gitignore` excludes local seed, `.env`, uploads and spreadsheets.
- [ ] AC-2: The example seed and all tests contain no real names, emails, domains, venues or business numbers.
- [ ] AC-3: Running twice gives the same data; an invalid file changes nothing.
- [ ] AC-4: Every UC can be demonstrated with the example seed.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
