# TASK-189: Convert dialog — lineup not prefilled, must be chosen

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "Convert to gig: no lineup prefill (owner request 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] Convert dialog "Kokoonpano" select starts empty ("Valitse kokoonpano"), lists active lineups + "Oma kokoonpano"; custom name field (shown for "Oma kokoonpano") starts empty — the offer's event name is never put there.
- [ ] Submit without a choice → inline REQUIRED on the select; "Oma kokoonpano" with empty name → REQUIRED on the name; nothing sent.
- [ ] MSW event-draft mock returns null lineup fields. Unit tests + e2e 16 convert test updated (pick a lineup or type a custom name explicitly). Tests, lint, build pass; run e2e 16 with your own E2E_DB_NAME/ports (COMPOSE_PROJECT_NAME=instaglamour-erp) — it may need TASK-055; report if so.
