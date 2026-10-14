# TASK-021: E2E for Excel-style filters (Keikat, Tarjoukset) and partner status
- **owner:** backend (integration; `e2e/` only) · **status:** todo · **spec:** docs/design.md "Excel-style tables", UC-003, UC-029, UC-032 · **depends on:** TASK-143, TASK-144, TASK-020, TASK-145
## Goal
The gig and offer lists moved to `ExcelTable` with header filter popovers (URL state `?sort=&dir=&f.<key>=`), and partner status is now managed in the app. Bring the Playwright suite up to date and cover the new behaviour.
## Acceptance criteria
- [ ] Fix specs broken by the gig list change: `11-cross-checks.spec.ts:107` ("Näytä myös perutut" is gone → Tila filter popover, tick "Peruttu", OK); any use of the old seller select, Tulevat/Menneet buttons, or headers "Keikka" / "Myyjä / tuottaja".
- [ ] `16-offers.spec.ts` (~lines 287–312) filter section uses the header popovers and `f.status=` URLs.
- [ ] New gig list spec: default view hides cancelled gigs; Tila filter shows them; one more column filter (e.g. Myyjä) combined with search (AND); filter state survives reload via URL; "Tyhjennä suodattimet" resets.
- [ ] New partner status spec (UC-032): grant partner to a person (label "Osakas" on person page and list, "Osakkuus" filter); invalid/duplicate email errors; own switch is locked; removing a partner ends that partner's session (their next request → sign-in) and they can no longer sign in via dev login; removed partner is not offered as offer seller / task owner but their name still shows on existing records.
- [ ] Accessible names: filter buttons "Suodata: <column>", popover dialog with same name, "Valitse kaikki", "Tyhjennä", "OK", "Peruuta"; gig table "Keikkalista".
- [ ] Full suite from a fresh DB (`E2E_DB_NAME=instaglamour_e2e_t021`, free ports via `E2E_BACKEND_PORT` / `E2E_FRONTEND_PORT`) green; report counts. Keep F-005 `fixme` as is. Synthetic data only.
## Out of scope
App code. If a test reveals a real bug, report it (with the failing step) instead of fixing app code.
## Notes
Gig seller/producer pickers are being restricted to active partners in parallel (TASK-146); don't assert on gig pickers for removed partners.
