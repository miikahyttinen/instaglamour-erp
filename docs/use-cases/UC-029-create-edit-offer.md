# UC-029: Create and edit offer

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-100, BR-102, BR-103

## Goal
Write an offer for a client, internally, in the customer-facing format.

## Main flow
1. Partner selects **New offer**; form: client (select + "New client…"), event name, event date, venue, city, seller (default me), lineup (one item per line; can be filled from a lineup template), what's included (default text), show references (switch), price (internal), source, event type.
2. Partner saves → offer page.
3. **Offer page:** customer-style preview of the offer + internal panel (price, source, event type, disposition, created, history) + actions: Copy public link, Regenerate link, Convert to gig#, Delete. All fields edit in place (save on blur/Enter or on change).

## Alternative flows
- **A1 – Regenerate link** (confirmation: old link stops working).

## Error flows
- **E1 – Missing client/event/date/venue** → field errors, nothing saved.

## References (2026-10-07)
Partners manage references on **Tarjoukset → Referenssit** (`/offers/references`): add (FI quote, EN quote, author), upload/replace/remove photo, reorder, activate/deactivate, delete. Offers with "Näytä referenssit" show the active ones (photo + quote + author); missing photo → neutral placeholder.

## Acceptance criteria
- [ ] AC-1: Create with required fields; defaults from settings.
- [ ] AC-2: Every change saved in place and logged; disposition history visible.
- [ ] AC-3: Preview matches what the public page shows (without the internal panel).

## Change log
- 2026-10-07 – First version (PM)
