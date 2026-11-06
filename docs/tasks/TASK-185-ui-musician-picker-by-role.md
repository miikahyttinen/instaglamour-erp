# TASK-185: Person picker on musician lines shows only people with that role

- **owner:** ui
- **status:** todo
- **spec:** owner request 2026-11-06
- **depends on:** none

## Goal
On a cost line whose type is a musician role (e.g. GUITAR, DRUMS, MIX…), the person picker lists
only active people whose `Person.roles` include that role. Custom role (`OTHER_ROLE`, "Oma rooli")
lists everyone (active), as do internal-role lines other than SALES/PRODUCTION (partners only, unchanged) and expenses.

## Contract
Existing: `Person.roles: MusicianRole[]`, `POST /api/people` `{ name }`, `PATCH /api/people/{id}` `{ roles }`.
No contract change; filtering is client-side.

## Acceptance criteria
- [ ] `selectablePeople` (personOptions.ts) takes the line type: musician role except OTHER_ROLE → active people with that role; OTHER_ROLE / non-musician non-partner-only types → all active people; SALES/PRODUCTION → active partners (unchanged). The line's current person always stays listed even if they don't match (existing data stays visible).
- [ ] Applies everywhere the cost-line person picker is used: saved lines (desktop, compact, phone) and the "Lisää rivi" draft row (changing the draft's type clears a chosen person who doesn't match the new type, like the partner rule).
- [ ] "+ Uusi henkilö…" stays available on musician lines: after creating the person, if the line type is a musician role other than OTHER_ROLE, set the new person's roles to `[role]` with `PATCH /api/people/{id}` before assigning, so they match the filter. If the PATCH fails, still assign the person and show the error inline.
- [ ] When no one has the role, the picker shows only "– ei henkilöä –" and "+ Uusi henkilö…" (no extra message needed).
- [ ] Unit tests for the filter rules (incl. current person kept, OTHER_ROLE = everyone, new person gets the role); tests, lint, build pass; affected e2e (02, and any spec that assigns musicians — make sure the synthetic seed/test people have matching roles or create them via the new-person flow) pass.

## Out of scope
Backend validation (assignment of a person without the role is still allowed by the API); the people page.
