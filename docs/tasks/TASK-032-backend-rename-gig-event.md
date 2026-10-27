# TASK-032: Rename Gig → Event (backend, data, seed)
- **owner:** backend · **status:** done · **spec:** docs/saas-roadmap.md, api-contract "Rename Gig → Event" · **depends on:** none · **parallel:** TASK-161 (UI)
## Acceptance criteria
- [ ] Migration that **renames** (no drop/recreate, data kept): table `gig` → `event`, history table → `event_history`, every `gig_id` column → `event_id`, related enums (`GigStatus` → `EventStatus`, `GigEventType` → `EventHistoryType`), indexes/constraints names where practical. Test the migration on a populated copy (scratch schema) — row counts and FKs intact.
- [ ] Prisma models/fields, TS types, modules, routes, serializers, errors renamed per the mapping; API paths `/api/events…`, `/api/offers/{id}/event-draft`; error `EVENT_DELETED`. No old aliases.
- [ ] Seed/import: `events` key; legacy `gigs` accepted (both → error); `ImportSummary.events`; READMEs and `seed.example.json` updated.
- [ ] All tests renamed/updated and passing; lint clean; `grep -ri gig backend/src backend/test` returns only intentional legacy-alias handling (list them in the report).
- [ ] backend README.
## Out of scope
Frontend, e2e (TASK-161), docs other than backend READMEs (PM).
