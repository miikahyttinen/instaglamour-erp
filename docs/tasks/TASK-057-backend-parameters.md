# TASK-057: Settings parameters API

- **owner:** backend
- **status:** done
- **spec:** docs/api-contract.md "Settings: Parameters tab (owner request 2026-11-09)"
- **depends on:** none

## Acceptance criteria
- [ ] Parameter registry in code (ordered list: key, type MONEY, limits) with `fees.load_in_deduction`; designed so adding a parameter is one entry.
- [ ] Migration: `setting.updated_by` nullable FK → partner.
- [ ] `GET /api/settings/parameters`, `PATCH /api/settings/parameters/{key}` exactly as specified (upsert, validation, 404 unknown key, updatedBy/updatedAt).
- [ ] `/api/reference` reflects new value; existing cost lines untouched; later load-in switch-off and freelancer PO sound-check deduction use the new value (tests).
- [ ] Seed/import keep working (setting rows from file only set when missing, as before). Backend tests + lint pass.
