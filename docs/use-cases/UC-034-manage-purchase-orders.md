# UC-034: Manage purchase orders

- **Status:** Approved (owner decisions 2026-10-16)
- **Phase:** 2
- **Primary actor:** Partner
- **Business rules:** BR-113…BR-119, BR-025

## Goal
Partners see purchase orders created by freelancers, find one by number, and mark it paid — which marks its fees paid on the gigs.

## Main flow
1. Partner opens **Ostotilaukset / Purchase orders** (menu). Table (Excel-style): number, freelancer, created, gig dates, total, status. Selected year = year of creation.
2. Status column: open PO → **Merkitse maksetuksi / Mark paid** button; paid PO → green label **Maksettu <date> klo <time> / Paid <date time>**; cancelled → grey label.
3. **Search** box finds a PO by number (or freelancer name) **across all years**.
4. Below the table: **Log** of recent PO events (created by freelancer, paid, unpaid, cancelled — who and when).
5. Clicking a number opens the PO page: fees (gig date, venue, lineup, role, amount, link to gig), actions, and the PO's own log.

## Alternative flows
- **A1 – Mark paid** (list or PO page): every fee line on the PO is marked paid with its PO amount, now, by me (same as BR-025, logged on the gig with the PO number).
- **A2 – Unmark paid** (PO page, confirmation): PO back to open; its fee lines back to unpaid.
- **A3 – Cancel** an open PO (PO page, reason required): its fees become selectable again for the freelancer.
- **A4 – Person page** (not for active partners — they have no freelancer link): partner copies the person's freelancer link, or regenerates it (old link stops working).
- **A5 – Gig page:** a fee line on a PO shows a "PO <number>" tag linking to it; its person, amount and paid state can't be changed while the PO is open or paid.

## Acceptance criteria
- [ ] AC-1: A PO created on the public page appears in the list immediately; search by part of its number finds it in any year.
- [ ] AC-2: Mark paid shows the green "Paid <date time>" label and the gig cost lines are paid; unmark reverts both.
- [ ] AC-3: Cancelled PO's fees are selectable again on the freelancer page.
- [ ] AC-4: Every PO event is in the log with actor (freelancer or partner) and time.
