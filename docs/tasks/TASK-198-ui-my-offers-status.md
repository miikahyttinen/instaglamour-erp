# TASK-198: Omat keikat offers — show offer status; "Sopimus tekemättä" yellow

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-09
- **depends on:** none

## Acceptance criteria
- [ ] In the Omat keikat "Tarjoukset" section each row also shows the offer's status tag, exactly as on the Tarjoukset list (same label and colour): contractMissing rows are ACCEPTED ("Hyväksytty"), followUp rows are OPEN ("Avoin") — derive from the list the row comes from (no API change; the backend rules guarantee it).
- [ ] "Sopimus tekemättä" tag uses the yellow (warning) tone instead of red. "Follow-up?" stays blue.
- [ ] Phone layout stays compact (status tag fits next to the other tag or on line 2); no horizontal scroll at 375.
- [ ] Unit tests + e2e 27 updated; tests, lint, build pass; run e2e 27 (own E2E_DB_NAME/ports, COMPOSE_PROJECT_NAME=instaglamour-erp; stop servers after).
