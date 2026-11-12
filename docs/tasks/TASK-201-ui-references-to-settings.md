# TASK-201: Move the references page into Asetukset

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-12
- **depends on:** none

## Acceptance criteria
- [ ] Asetukset gets a tab "Referenssit / References" (`/settings/references`) that hosts the existing references page (list, add, edit, reorder, photo upload) inside the settings layout (h2 instead of its own page head, like the import tab). Tab order: Kokoonpanot, Parametrit, Referenssit, Tietojen tuonti.
- [ ] The "Referenssit" button on the Tarjoukset page is removed; the old route `/offers/references` redirects to `/settings/references`.
- [ ] No other behaviour change. Unit tests + e2e (grep for `/offers/references` and the button) updated; tests, lint, build pass; run the affected e2e (own E2E_DB_NAME/ports, COMPOSE_PROJECT_NAME=instaglamour-erp; stop servers after).
