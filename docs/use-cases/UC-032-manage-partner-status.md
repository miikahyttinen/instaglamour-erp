# UC-032: Manage partner status

- **Status:** Approved (owner decision 2026-10-14)
- **Phase:** 2
- **Primary actor:** Partner
- **Business rules:** BR-070, BR-110, BR-111, BR-112

## Goal
Decide in the app which people are partners — partners can sign in and act as seller, producer, task owner and log hours.

## Main flow
1. Partner opens a person page; an **Osakas / Partner** switch shows the current status.
2. Switching it on asks for the person's Google email (`@<allowed domain>`); on save the person becomes a partner and can sign in.
3. The people list and person page show an **Osakas** label; the people list can be filtered by it.

## Alternative flows
- **A1 – Change email** of an active partner (same validation).
- **A2 – Remove partner status** (confirmation: "sign-in stops immediately"); history is kept.

## Error flows
- **E1 – Email missing, wrong domain or already used** → field error.
- **E2 – Removing own status / the last partner** → message, nothing changes.

## Acceptance criteria
- [ ] AC-1: A new partner can sign in (dev login in local tests) and appears in seller/producer/owner pickers and hours.
- [ ] AC-2: A removed partner's existing session stops working on the next request; sign-in refused.
- [ ] AC-3: Own status and last partner cannot be removed.
- [ ] AC-4: Old gigs/offers/tasks/hours still show the removed partner's name.
- [ ] AC-5: "Osakas" label in people list and person page; filter in the list.

## Change log
- 2026-10-14 – First version (PM)
