# TASK-049: Invoicing v3 — sent/not sent, automatic final invoice (backend)
- **owner:** backend · **status:** done · **spec:** api-contract "Invoicing v3" (2026-11-04) · **parallel:** TASK-176
## Acceptance criteria
- [ ] Migration: row status enum → NOT_SENT/SENT with data conversion (READY→NOT_SENT, SENT/PAID→SENT); `event.final_invoice_created_at` (nullable). Non-destructive for rows; tested on a populated scratch schema.
- [ ] Derived figures + `invoiceState` exactly per contract; filter; remove paid-related fields; endpoints validate statuses.
- [ ] Final-invoice job: startup + every 15 min (disable with `INVOICE_JOB_ENABLED=false`, default on; off in tests unless called directly), Helsinki time, 48 h after end/start, once per gig, idempotent under concurrency, history entry with `auto: true`. Export the job function for tests; test with a fixed clock (before/after 48 h, fully covered, cancelled, deleted, total 0, already created, row deleted afterwards → not recreated, two parallel runs → one row).
- [ ] Seed/import: accept new statuses and legacy READY/PAID (converted). README. Tests + lint pass.
