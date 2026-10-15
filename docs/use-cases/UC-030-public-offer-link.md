# UC-030: View offer via public link

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-104

## Goal
Let the customer read their offer without signing in.

## Main flow
1. Customer opens `/o/<token>`.
2. System shows **only that offer**: logo, event name, client name, event date (weekday), venue, city, lineup, what's included, Spotify button (fixed playlist link, same on every offer), references (if enabled), seller's name, email and phone. FI/EN switch. **No price, no internal fields.**

## Alternative flows
- **A1 – Print** via the browser (clean print style).

## Error flows
- **E1 – Unknown, regenerated or deleted token** → "Offer not found" page (no hint whether it ever existed).

## Acceptance criteria
- [ ] AC-1: Works without a session; no other offer, client or app data reachable.
- [ ] AC-2: API response contains no price, disposition, source, event type, gig, notes or ids other than what is displayed.
- [ ] AC-3: Old token after regenerate → not found.
- [ ] AC-4: Phone and desktop, both themes; page is `noindex`.

## Change log
- 2026-10-07 – First version (PM)
