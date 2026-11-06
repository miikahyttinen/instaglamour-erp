# TASK-186: Settings page with Lineups editor and Data import; lineup on gig create

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "Lineups and settings page (owner decision 2026-11-06)"
- **depends on:** none (build against the contract; MSW mocks updated)

## Goal
Replace the "Tietojen tuonti" menu item with "Asetukset". The settings page has two tabs:
"Kokoonpanot" (lineup editor) and "Tietojen tuonti" (the existing import page). Lineups define a gig's
default cost lines and amounts; the gig create form lets the partner choose one lineup (optional).

## Contract
`GET/POST /api/lineup-templates`, `PATCH/DELETE /api/lineup-templates/{id}`, `LineupTemplate`/`LineupLine`,
`/api/reference` (`lineupTemplates[].lines`, removed `roles` and default fee settings), 409 `LINEUP_IN_USE`.

## Acceptance criteria
- [ ] Menu: "Asetukset / Settings" (cog icon) replaces "Tietojen tuonti / Data import"; route `/settings` → `/settings/lineups`; tabs Kokoonpanot / Tietojen tuonti (`/settings/import` hosts the existing import page). Old import route redirects to `/settings/import`.
- [ ] Kokoonpanot list: name, number of lines, total of default amounts, gig count, active/inactive tag; "Uusi kokoonpano" button (asks name inline, creates, opens it). Inactive lineups shown after active ones, muted.
- [ ] Lineup detail/editor (`/settings/lineups/:id`): editable name (inline, save on Enter/blur); lines table with the same look as the gig cost table (type select with the same groups — musician, internal, expenses; description; default amount; move up/down; remove) and an inline "Lisää rivi" draft row like the gig page. Saving = `PATCH lines` (whole list) on each change; musician lines first is NOT forced here — order is as the user sets it. Shows the sum of default amounts. Active switch ("Käytössä"). Delete button only when gig count is 0 (confirm); `LINEUP_IN_USE` shown inline.
- [ ] Validation errors (DUPLICATE name, DESCRIPTION_REQUIRED, amounts) inline in FI/EN.
- [ ] Gig create form (and offer → gig convert form): lineup select lists active lineups (from reference) + "Oma kokoonpano" (custom name) as today; optional. Show a short preview under the select: lines count and total default amount.
- [ ] Remove all UI use of `officeDefaultCents`/`salesDefaultCents`/`productionDefaultCents` (e.g. the cost-line draft row prefill of internal fees) and of `lineupTemplates[].roles`.
- [ ] Mobile-first: list and editor usable at 375 (editor lines can use the two-row phone pattern of the cost table).
- [ ] MSW mocks + types updated; unit tests for list, editor (add/edit/move/remove lines, rename, deactivate, delete/in use), gig create lineup select; e2e: new spec for creating a lineup and creating a gig from it (synthetic data), update specs touching the import page route or the template select. Tests, lint, build pass (e2e may need the backend task merged — report if so).
- [ ] `docs/design.md`: one line for the settings page.

## Out of scope
Backend. Other settings (load-in deduction etc.) — later.
