# TASK-193: Paging for list tables

- **owner:** ui
- **status:** todo
- **spec:** owner request 2026-11-07
- **depends on:** none

## Goal
Add paging to the main list tables. Page sizes: **Ostotilaukset (purchase orders) 50**, **Keikat (gigs) 100**,
**Tarjoukset (offers) 100**, **Asiakkaat (clients) 100**, **Henkilöt (people) 100**.
Client-side paging (the API already returns the full filtered list; no contract change).

## Acceptance criteria
- [ ] One shared pager component (e.g. in `components/`, used by ExcelTable/DataTable or by each page) shown under the table: "‹ Edellinen", "Sivu 2 / 5" (or page number buttons with ellipsis), "Seuraava ›", plus "1–100 / 342" count. FI/EN texts. Hidden when everything fits on one page. Mobile-friendly (≥ 32 px buttons, no horizontal scroll at 375).
- [ ] Paging applies **after** filtering and sorting (page 1 = first rows of the current order). Totals/summary rows and stat cards keep using the full filtered set, not just the page.
- [ ] Current page in the URL (`?page=N`, omitted for page 1) so back/refresh keep it; changing a filter, search or sort resets to page 1; an out-of-range page clamps to the last page. Changing page scrolls to the top of the table/page.
- [ ] Applied to: PurchaseOrderListPage (50), EventListPage (100), OfferListPage (100), ClientsPage (100), PeoplePage (100). Page sizes as named constants.
- [ ] Unit tests: shared pager + each page (paging after sort/filter, reset on filter change, URL param, hidden on one page); e2e: one spec for paging on a list with > page size synthetic rows if practical (or unit coverage only — say which), and update specs that assume all rows on one page. Tests, lint, build pass; run affected e2e with your own E2E_DB_NAME/ports (COMPOSE_PROJECT_NAME=instaglamour-erp), stop servers after.
- [ ] `docs/design.md`: one line for the pager.

## Out of scope
Server-side paging; other tables (gig cost lines, tasks, hours, budget).
