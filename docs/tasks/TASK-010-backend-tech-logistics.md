# TASK-010: Technical setup (single), logistics, house technician — backend

- **owner:** backend
- **status:** done
- **spec:** domain-model.md (Gig, TechnicalSetup, Logistics), api-contract.md (GigSummary, GigCreate, GigUpdate, Reference)
- **depends on:** none (UI TASK-133 runs in parallel against the contract)

## Acceptance criteria
- [ ] Migration: `technical_setup` becomes a nullable single enum (`HOUSE_TECH | SET_A | SET_B | SET_C`); new nullable `logistics` (`OWN_VAN | RENTAL_VAN | TAXI | OTHER`); new `house_technician boolean not null default false`.
- [ ] **Data migration** of existing gigs from the old array: technical_setup = first of SET_A, SET_B, SET_C, HOUSE_TECH present (else null; OWN_PA alone → null); house_technician = array contains HOUSE_TECHNICIAN; logistics = OWN_VAN if array contains VAN, else null. New migration file; never edit old migrations.
- [ ] API per contract: create/update/read; invalid values → 400 `INVALID_VALUE`; `GET /api/reference` returns `technicalSetups` and `logistics`; PATCH logs `UPDATED` with old → new for the three fields.
- [ ] Seed format + `seed.example.json` updated (synthetic); seed loader accepts the new fields; document in `seed/README.md`. Note for the owner: a local `seed.local.json` with gigs must use the new fields.
- [ ] Tests: migration mapping (unit or SQL test), create/update/validation/reference/history; all tests and lint pass.
- [ ] Do not edit `frontend/` or `e2e/`.
