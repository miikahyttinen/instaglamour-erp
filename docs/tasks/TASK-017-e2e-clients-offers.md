# TASK-017: e2e for clients and offers (+ fix 3 failing layout tests)

- **owner:** backend (integration; edits `e2e/` only)
- **status:** todo
- **depends on:** TASK-015, 016, 137, 138, 139 (merged)

## Goal
Cover Clients and Offers end to end against the real stack, and resolve 3 failures in `12-layout-v2.spec.ts` after the menu grew to 8 items (Tarjoukset first, Asiakkaat after Keikat) and the gig list got a client column:
1. mobile drawer test, 2. collapsed sidebar names test (likely expect 6 items), 3. **"gig list: cards below 1200 px, table from 1200 px"** — decide whether the test is outdated or the 8-column table really overflows at 1200 px next to the expanded sidebar (if real: keep assertion, `test.fixme`, FINDINGS with file to change).

## Acceptance criteria
- [ ] Layout tests updated to 8 nav items in the right order; the 1200 px case analysed (test fix vs real bug).
- [ ] **Clients:** add (REQUIRED/DUPLICATE), rename/notes inline persist, search, client page lists gigs and offers, attach client to a gig (gig page inline + new gig form + "New client…"), gig list client column/search, delete blocked when linked (CLIENT_IN_USE), delete allowed when unlinked.
- [ ] **Offers:** create (required fields, defaults applied when empty), list for the selected year with open value + win rate matching BR-106 computed from the API, sorting, filters incl. Expired, inline source/event type/disposition persist after reload with history, delete/restore (deleted read-only), regenerate link (old link 404, new works).
- [ ] **Convert to gig:** confirm dialog → gig created with BR-105 fields, offer WON/ACCEPTED, list shows "Keikka →", gig page shows "Tarjouksesta", second convert (API) → 409, concurrent double click creates one gig.
- [ ] **Public link (no session, fresh browser context):** shows only that offer; **no price** anywhere in DOM or network payload; FI/EN switch; unknown token → not-found page; no authenticated API calls made; `X-Robots-Tag: noindex`; deleted offer → 404.
- [ ] Full suite green from a fresh DB at both viewports (report counts); real bugs → fixme + FINDINGS. Only `e2e/` edited. Synthetic data only; never read `instaglamour_offer_proto/`.
