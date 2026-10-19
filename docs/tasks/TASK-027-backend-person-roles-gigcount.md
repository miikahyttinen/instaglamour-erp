# TASK-027: Person roles and gig count
- **owner:** backend · **status:** done · **spec:** api-contract "People: roles and gig count", domain-model Person (2026-10-19) · **depends on:** none · **parallel:** TASK-155
## Acceptance criteria
- [ ] Migration: `person.roles` (text[] or enum array, default empty) + backfill from existing cost lines (musician roles, non-deleted gigs) — non-destructive.
- [ ] `Person.roles` (ordered per `MUSICIAN_ROLES`) and `Person.gigCount` in every Person response; efficient for the list (one grouped query, no N+1).
- [ ] `PATCH /api/people/{id}` `roles` with validation; `GET /api/people?role=` filter.
- [ ] Seed schema + loader: optional `roles` on `people[]` and `partners[]`; fill only when the person has none (also for existing people/partners — this is the one exception to partner insert-only: only `roles`, only when empty); counted as `updated`. README updated.
- [ ] Tests (count rules: cancelled/deleted/upcoming/internal-only lines excluded, multiple lines on one gig = 1; backfill; PATCH validation; filter; seed fill-empty-only); tests and lint pass. Synthetic data only.
