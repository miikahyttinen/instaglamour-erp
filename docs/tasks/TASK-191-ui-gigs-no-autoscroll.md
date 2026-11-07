# TASK-191: Gigs page opens at the top (no auto-scroll)

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-07 (replaces UC-003 step 1 "scroll to first upcoming")
- **depends on:** none

## Acceptance criteria
- [ ] The gig list (Keikat) keeps its oldest-first order but no longer scrolls to the first upcoming gig; the page opens scrolled to the top. Remove `useScrollToFirstUpcoming` (keep the `is-first-upcoming` row marker only if something else uses it for styling).
- [ ] Navigating to the gigs page from another page also starts at the top (check that no previous scroll position is carried over; add scroll-to-top on route change if the app lacks it, for all pages).
- [ ] Unit tests/e2e that expect the auto-scroll updated; tests, lint, build pass.
