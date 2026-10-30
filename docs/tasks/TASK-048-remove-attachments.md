# TASK-048: Remove gig file attachments (backend + e2e)
- **owner:** backend · **status:** todo · **spec:** api-contract "Attachments removed" (2026-10-31) · **parallel:** TASK-174, TASK-047 (Railway; touches app.ts — keep edits minimal)
## Acceptance criteria
- [ ] Remove attachment routes, store, multipart handling used only for attachments (keep what reference photos need), `EventDetail.attachments`, attachment env/config only if unused elsewhere. No migration that drops data (table stays, mark obsolete in schema comment).
- [ ] Remove/adjust backend tests; delete or rewrite e2e `04-attachments.spec.ts` and any attachment steps in other specs (allowed); tests + lint pass; READMEs.
