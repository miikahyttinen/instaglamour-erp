# TASK-151: Freelancer public page + person-page link
- **owner:** ui · **status:** todo · **spec:** UC-033, UC-034 A4, BR-113…BR-116, api-contract "Purchase orders" · **depends on:** none · **parallel:** TASK-023 (backend), TASK-152 (PO pages — owns `features/purchaseOrders/` and the gig page tag; you own `features/freelancer/` and the person page)
## Goal
Public page `/f/<token>` where a freelancer sees their fees and creates a purchase order number; partners copy/regenerate the link on the person page.
## Acceptance criteria
- [ ] Route `/f/:token` outside auth and shell, like `/o/:token` (never calls an authenticated endpoint); `<meta name="robots" content="noindex">`; logo, person name, FI/EN switch (default FI, remembered in localStorage with try/catch); dark/light follows OS.
- [ ] **Fees** list (table ≥ 600 px, cards below; full width, no sideways scroll): date, venue, role (type label from i18n; description for OTHER/OTHER_ROLE), amount, state. SELECTABLE rows have a checkbox; UPCOMING shows "Keikka ei ole vielä soitettu / Not played yet"; ON_PO shows "Ostotilaus <number>"; PAID shows "Maksettu / Paid". Unpaid/selectable first is fine; otherwise newest first.
- [ ] Selected count + total; button **Luo ostotilausnumero / Create purchase order number** (disabled when none selected; double-click guarded). On 201: new PO highlighted at top of **Ostotilaukset / Purchase orders** with a copy-to-clipboard button for the number; list refetched. On 409 `COST_LINE_NOT_ELIGIBLE`: message, refetch, keep remaining valid selections. 429: friendly retry message. 404: "Linkkiä ei löydy / Link not found".
- [ ] Purchase orders list: number (copy), created date, total, status label (Avoin / green "Maksettu <pvm> klo <aika>" / grey "Peruttu"), its fees.
- [ ] Person page: **Freelancer-linkki** section with the full link, **Kopioi linkki** and **Luo uusi linkki** (confirm: old link stops working).
- [ ] Types for all PO shapes in `src/api/types.ts` exactly per contract (coordinate: TASK-152 adds the same types — put shared PO types in a new file `src/api/purchaseOrderTypes.ts` re-exported from types.ts; if it already exists after merge, keep one copy). MSW handlers in `src/mocks/freelancerHandlers.ts` + mock store implementing eligibility, all-or-nothing, number format (synthetic names only).
- [ ] Tests (render, selection/total, create success/409/404, i18n EN, person link copy/regenerate); tests, lint, build pass; headless check at 375/900/1440 both themes; README section.
## Out of scope
Partner PO list/detail pages, gig page tag, nav item (TASK-152). Backend.
