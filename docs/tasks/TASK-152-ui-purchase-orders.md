# TASK-152: Purchase orders pages (partners) + gig cost line tag
- **owner:** ui · **status:** done · **spec:** UC-034, BR-117…BR-119, api-contract "Purchase orders", docs/design.md "Excel-style tables" · **depends on:** none · **parallel:** TASK-023 (backend), TASK-151 (freelancer page + person page — don't edit `features/freelancer/` or `features/people/`)
## Goal
Partners see, search and settle purchase orders; gig cost lines show their PO.
## Acceptance criteria
- [ ] Nav item **Ostotilaukset / Purchase orders** (icon e.g. `Receipt`) after Keikat; route `/purchase-orders` and `/purchase-orders/:id`.
- [ ] List on `ExcelTable` (full width, no sideways scroll, phone cards): Numero (link, pinned/priority 1), Freelancer, Luotu (date+time), Keikat (gig dates, comma-separated), Summa, Tila. Filters on Freelancer and Tila. Year = selected year by created date.
- [ ] Tila cell: OPEN → button **Merkitse maksetuksi / Mark paid** (one click, then shows the paid label; error message on failure); PAID → green tag **Maksettu 16.10.2026 klo 14.32 / Paid 16 Oct 2026 14:32** (localized); CANCELLED → grey tag **Peruttu / Cancelled**.
- [ ] **Search** box above the table: searches number / freelancer name across **all years** (`q`, ignores year; show a hint "Haetaan kaikilta vuosilta / Searching all years"); search in URL.
- [ ] **Loki / Log** section below the table: `GET /api/purchase-orders/events` — time, PO number (link), event (Luotu freelancerin linkillä / Merkitty maksetuksi / Maksu peruttu / Peruttu: <reason>), actor (partner name or "Freelancer").
- [ ] PO page: header number + status, freelancer (link to person), totals, fee lines (gig date, venue, lineup, role, amount, link to gig), actions: Mark paid / Unmark paid (confirm) / Cancel (dialog, reason required), PO history.
- [ ] Gig page cost list: line with `purchaseOrder` shows a tag "PO <number>" linking to the PO; person, amount, load-in and paid controls disabled with a tooltip/hint "Ostotilauksella <number>"; description still editable. Handle 409 `COST_LINE_ON_PURCHASE_ORDER` with a clear message. Gig cancel/delete 409 same.
- [ ] Types per contract in `src/api/purchaseOrderTypes.ts` (re-exported from types.ts; TASK-151 may add the same file — keep one copy on merge); `CostLine.purchaseOrder` added (required, `| null`) and fixtures updated. MSW handlers `src/mocks/purchaseOrderHandlers.ts` with seed POs (synthetic names: "Person 1" …), pay/unpay/cancel updating mock cost lines.
- [ ] Tests (list, pay, labels FI/EN, search all years, log, PO page actions, gig line lock); tests, lint, build pass; headless check 375/900/1440/1920 both themes; README section.
## Out of scope
Freelancer public page and person-page link (TASK-151). Backend.
