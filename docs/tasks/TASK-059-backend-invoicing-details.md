# TASK-059: Event invoicingDetails

- **owner:** backend
- **status:** done
- **spec:** docs/api-contract.md "Invoicing details on the gig (owner request 2026-11-11)"
- **depends on:** none

## Acceptance criteria
- [ ] Migration adds nullable `event.invoicing_details` text.
- [ ] `invoicingDetails` on EventDetail (not summary); accepted in create, convert body and PATCH (trim; blank → null; > 5000 → TOO_LONG); logged in UPDATED.
- [ ] Seed/import accept optional `invoicingDetails`. Tests; backend tests + lint pass.
