# UC-033: Freelancer link — see own gigs and create a purchase order

- **Status:** Approved (owner decisions 2026-10-16)
- **Phase:** 2
- **Primary actor:** Freelancer (any person with fee lines), **without sign-in**
- **Business rules:** BR-113, BR-114, BR-115, BR-116, BR-119

## Goal
A freelancer opens their own secret link, sees their gigs and fees, selects unpaid fees of played gigs and creates a purchase order (PO) number to put on their invoice.

## Preconditions
A partner has copied the person's link from the person page (`/f/<token>`) and sent it to them.

## Main flow
1. Freelancer opens `/f/<token>`. Page shows: Instaglamour logo, their name, FI/EN switch.
2. **Fees** list (newest gig first): gig date, venue, role (type, or description for "Other"), own fee. Each line shows its state: *selectable* (checkbox), *upcoming* (gig not played yet), *on PO <number>*, *paid*.
3. Freelancer ticks one or more selectable fees (any number of gigs); the selected total is shown.
4. Freelancer clicks **Luo ostotilausnumero / Create purchase order number**.
5. System creates the PO (e.g. `MATTI-VIRTANEN-0042`) and shows it at the top of **Purchase orders** with a copy button; the selected fees now show "on PO <number>".
6. **Purchase orders** list: number, created date, total, status (*Open* / *Paid <date time>* / *Cancelled*), and its fees.

## Alternative flows
- **A1 – Nothing selectable** → message "No unpaid fees from played gigs", button disabled.

## Error flows
- **E1 – Unknown or regenerated link, inactive person** → "Link not found" page.
- **E2 – A selected fee is no longer eligible** (paid, changed, on another PO meanwhile) → message, list refreshes, nothing is created.

## Acceptance criteria
- [ ] AC-1: Only that person's own fee lines (amount > 0) on non-deleted SOLD gigs are shown; no client, gig price, other people, internal notes or partner data.
- [ ] AC-2: Only unpaid lines of played gigs that are not on an open/paid PO can be selected.
- [ ] AC-3: Creating a PO with fees from several gigs gives one unique, readable number and shows it immediately.
- [ ] AC-4: The page works without sign-in, is `noindex`, rate-limited and FI/EN.
