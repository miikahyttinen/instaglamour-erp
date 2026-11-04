# TASK-050: Freelancer PO with VAT and sound check (backend)
- **owner:** backend · **status:** todo · **spec:** api-contract "Freelancer PO: VAT and sound check" (2026-11-04) · **parallel:** TASK-177
## Acceptance criteria
- [ ] Migration (non-destructive): PO `vat_liable`; PO line `base_cents`, `soundcheck`, `deduction_cents`, `vat_cents` (existing lines backfilled: base = amount, soundcheck true, 0, 0). Setting `fees.performer_vat_rate_bp` (default 1350 when missing; seedable).
- [ ] Public create endpoint with the new body (and legacy body); amount math per contract with integer rounding; all-or-nothing, locks and numbering unchanged; FreelancerView `settings`.
- [ ] PO shapes extended; paying uses amountCents. Partner path unchanged.
- [ ] Tests (VAT on/off, sound check off deducts setting value, not below 0, rounding, legacy body, validation, totals, pay sets actual); tests + lint; README.
