# TASK-044: "Ready to be invoiced" flag on gigs (backend)
- **owner:** backend · **status:** done · **spec:** api-contract "Gig status labels and Ready to be invoiced" (2026-10-31)
## Acceptance criteria
- [ ] Migration (non-destructive): `event.ready_for_invoice_at`, `event.ready_for_invoice_by` (partner FK, nullable); history enum values `READY_FOR_INVOICE`, `READY_FOR_INVOICE_CLEARED`.
- [ ] Fields in EventSummary/EventDetail; POST/DELETE endpoints with no-op and 409 rules; history entries with partner.
- [ ] Tests (set, unset, no-ops, cancelled 409, deleted 409, list shape, history); tests + lint; README.
