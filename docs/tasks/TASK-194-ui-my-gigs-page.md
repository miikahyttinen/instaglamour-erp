# TASK-194: "Omat keikat / My gigs" page replaces the Year page

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "My gigs page replaces the Year page (owner request 2026-11-08)"
- **depends on:** none (build against the contract with MSW mocks)

## Acceptance criteria
- [ ] Menu: "Vuosi / Year" replaced by "Omat keikat / My gigs" (`/my-gigs`), first item, start page after sign-in and for `/`; `/year` redirects to `/my-gigs`. Year page components/routes removed (keep shared pieces other pages still use). No year selector on this page.
- [ ] List from `GET /api/me/events`, soonest first: date (weekday + date, end date if multi-day), lineup name, venue (and client if present), **roles** as chips — "Tuottaja / Producer" for PRODUCER, cost type label for MUSICIAN (custom role shows its description) — and the **"Miehitys kesken"** tag (same style as the gig list) when `notFullyStaffed`. Row/card links to the gig page.
- [ ] Empty state: "Ei tulevia keikkoja / No upcoming gigs". Loading and error states like other pages.
- [ ] Mobile-first (one compact row/card per gig at 375; no horizontal scroll); desktop table or list consistent with other lists.
- [ ] MSW mock for `/api/me/events` derived from mock events (same rules); unit tests (roles incl. producer + musician, tag, empty, link, redirects, menu); e2e: update specs that use the Year page/menu (grep "Vuosi", "/year"), add a spec for My gigs (synthetic data) — may need TASK-056 merged; say which you couldn't run. Tests, lint, build pass.
- [ ] `docs/design.md`: one line for the page.
