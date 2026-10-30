# TASK-045: Invoice status, prepayment, balance (backend)
- **owner:** backend · **status:** todo · **spec:** api-contract "Invoice status, prepayment and balance" (2026-10-31) · **parallel:** TASK-172
## Acceptance criteria
- [ ] Non-destructive migration: enum `InvoiceStatus`, columns `invoice_status` (default NONE), `invoice_status_at`, `invoice_status_by`, `prepayment_cents` (default 0, check ≥ 0); copy READY from `ready_for_invoice_at/by`; then drop the two ready columns (data copied first — allowed) and remove the ready endpoints.
- [ ] Fields + derived `balanceCents` in EventSummary/EventDetail; PATCH validation, history (UPDATED changes), at/by on status change; deleted 409; `?invoiceStatus=` filter; seed/import optional fields.
- [ ] Tests (each status, prepayment validation, balance incl. additional sales and negative, cancelled allowed, history, migration copy test on a scratch schema, filter, seed); tests + lint; README.
