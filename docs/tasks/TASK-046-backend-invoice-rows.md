# TASK-046: Invoice rows per gig (backend)
- **owner:** backend · **status:** done · **spec:** api-contract "Invoice rows" (2026-10-31) · **parallel:** TASK-173
## Acceptance criteria
- [ ] Migration: `invoice_row` table (event FK, description, amount_cents > 0 check, status enum, status_at/by, created_at/by); history enum values; convert existing invoice status + prepayment into rows exactly per contract; then drop the gig `invoice_status*`/`prepayment_cents` columns and the old enum (data converted first). Migration test on a populated scratch schema (each conversion case).
- [ ] Endpoints, derived fields (`balanceCents`, `invoicedCents`, `paidCents`, `invoiceState`), `?invoiceState=` filter, history entries, deleted 409, validation.
- [ ] Seed/import `invoiceRows` + legacy conversion; tests; tests + lint; README.
