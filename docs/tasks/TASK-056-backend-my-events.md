# TASK-056: GET /api/me/events (My gigs)

- **owner:** backend
- **status:** todo
- **spec:** docs/api-contract.md "My gigs page replaces the Year page (owner request 2026-11-08)"
- **depends on:** none

## Acceptance criteria
- [ ] `GET /api/me/events` implemented exactly as specified (upcoming = start date ≥ today Helsinki; SOLD, non-deleted; producer or own musician-role line; roles list with PRODUCER first then musician lines in cost-line order; notFullyStaffed per BR-023; sorted). Auth required.
- [ ] Tests: producer only, musician only, producer + musician on same gig (both roles), multiple musician lines, OTHER_ROLE with description, past/cancelled/deleted excluded, other partners' gigs excluded, partner without person, Helsinki "today" boundary. Backend tests + lint pass.
