# UC-035: Import data from a JSON file

- **Status:** Approved (owner request 2026-10-19)
- **Phase:** 2
- **Primary actor:** Partner
- **Business rules:** BR-090, BR-120, BR-121

## Goal
Load real data (gigs, people, offers, clients, hours, budget…) into the app from a JSON file in the seed format, without command-line tools.

## Main flow
1. Partner opens **Tietojen tuonti / Data import** (left menu, last item).
2. Partner chooses a `.json` file. The page shows its name and size.
3. Partner clicks **Tarkista / Check**. The system validates the file and does a dry run: a table shows, per data type, how many items would be **created**, **updated** and **skipped** (already exist). Nothing is saved.
4. Partner clicks **Tuo / Import** and confirms. The system imports everything in one go and shows the result counts.
5. The import is listed in **Tuontihistoria / Import history** (when, who, file name, counts).

## Alternative flows
- **A1 – Same file again:** items that already exist are skipped (idempotent), nothing is duplicated or overwritten.

## Error flows
- **E1 – Invalid file** (not JSON, wrong format, unknown person/partner/template references, partner email outside the allowed domain, reference photo paths): every problem is listed with its location; nothing is imported.
- **E2 – File too large** (> 10 MB) → message.

## Acceptance criteria
- [ ] AC-1: Check shows exact counts and saves nothing.
- [ ] AC-2: Import is all-or-nothing and re-importing the same file creates nothing new.
- [ ] AC-3: Existing data edited in the app is never overwritten or deleted by an import.
- [ ] AC-4: Every import is in the history with partner, time, file name and counts.
