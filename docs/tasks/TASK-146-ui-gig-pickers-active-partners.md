# TASK-146: Gig seller/producer pickers offer only active partners
- **owner:** ui · **status:** todo · **spec:** UC-032, BR-111 · **depends on:** TASK-144, TASK-145
## Goal
BR-111: inactive partners are not offered for new seller/producer choices. TASK-145 did this for offers and tasks; the gig pickers were left because TASK-144 was editing `features/gigs/`.
## Contract
`Person.partner: { id, email, active } | null` (api-contract "Partner status"); `?partner=true` returns active partners.
## Acceptance criteria
- [ ] `NewGigPage.tsx` seller and producer selects list only active partners (use `activePartners` from `src/reference/partners.ts`).
- [ ] `GigInfoFields.tsx` seller/producer selects list active partners plus the gig's current value if that partner is inactive (same pattern as `partnerOptions(..., current)` used for offers/tasks), so existing gigs still show their seller/producer.
- [ ] Name lookups (gig list, gig page, history) keep using the full partner list, so removed partners' names still show.
- [ ] `Person.partner` is required (not optional) in `src/api/types.ts`; fix fixtures that lack it (e.g. `features/gigs/historyText.test.ts` → `partner: null`).
- [ ] Gig list Myyjä/Tuottaja filters keep showing inactive partners that appear in rows (they come from row values).
- [ ] Tests for both pickers (inactive partner hidden; current inactive value kept); tests, lint, build pass.
## Out of scope
Backend, e2e.
