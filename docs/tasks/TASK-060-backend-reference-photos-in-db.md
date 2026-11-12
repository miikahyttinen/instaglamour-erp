# TASK-060: Store reference photos in the database

- **owner:** backend
- **status:** done
- **spec:** docs/api-contract.md "Reference photos stored in the database (owner decision 2026-11-12)"
- **depends on:** none

## Acceptance criteria
- [ ] Migration: `reference.image_data bytea NULL` (keep `image_storage_key` nullable for the move; no data dropped by the migration).
- [ ] Upload (`PUT /api/references/{id}/image`) writes bytes to `image_data` (content type sniffing, size limit, imageUploadedAt/version unchanged); delete clears it. No new files written to UPLOAD_DIR for references.
- [ ] Serving the image (internal and public offer-scoped URLs) reads from `image_data`; same headers/caching as now. List/reference endpoints must NOT load the bytes (select only metadata).
- [ ] Startup move job as in the contract (idempotent, safe if UPLOAD_DIR is missing, logs counts, never deletes files on disk).
- [ ] Seed loader: local seed `image` paths (if supported) load into `image_data`.
- [ ] Tests: upload/serve/replace/delete from DB, public URL scoping unchanged, move job (file present → moved; file missing → image cleared; already moved → no-op). Backend tests + lint pass. e2e reference/offer specs still pass (run with own E2E_DB_NAME/ports, COMPOSE_PROJECT_NAME=instaglamour-erp; stop servers after).
