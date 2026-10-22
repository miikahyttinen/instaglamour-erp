# TASK-160: Offers table — convert only accepted upcoming, created column, newest first
- **owner:** ui · **status:** todo · **spec:** BR-109, UC-028 change 2026-10-22, UC-031 · **depends on:** none · **parallel:** TASK-031
## Acceptance criteria
- [ ] "Muuta keikaksi" button (list row, phone card, offer page) shown only when status ACCEPTED (disposition WON), not expired-by-date (event date ≥ today, local date) and no gig yet. Otherwise the Keikka cell is empty ("–"); converted offers keep "Keikka →". Changing the disposition to Voitettu inline makes the button appear immediately.
- [ ] Handle 409 `OFFER_NOT_CONVERTIBLE` in the modal (FI/EN message, refetch). Add the code to enums/i18n.
- [ ] Offer table: **Luotu / Created** column priority 1 (always visible ≥ 600 px; date format like other dates), and **default sort = created desc** (newest first); a plain `/offers` URL uses it; URL sort still overrides. Phone cards show created date.
- [ ] MSW mock enforces BR-109 on gig-draft/convert.
- [ ] Tests; update e2e `16-offers.spec.ts` (convert tests must mark the offer won first and use a future date; default sort expectations) — allowed; run 16-offers with a fresh E2E_DB_NAME after TASK-031 is on main (or report); lint, build; headless check (no sideways scroll at 600/900/1200/1440 with the extra column).
