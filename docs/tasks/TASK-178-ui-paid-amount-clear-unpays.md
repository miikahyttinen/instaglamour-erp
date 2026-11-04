# TASK-178: Cost list — clearing the paid amount unmarks paid; no paid log in the table

- **owner:** ui
- **status:** done
- **spec:** docs/business-rules.md (BR-025)
- **depends on:** none

## Goal
Owner 2026-11-04: the "Poista maksumerkintä" button is not needed. On a paid cost line, setting the
actual amount to 0 or empty unmarks the line paid. The cost table also must not show the paid log
(paid time · partner); that history is in the gig log.

## Contract
Existing: `POST /api/cost-lines/{id}/pay` (`{ actualCents }`), `POST /api/cost-lines/{id}/unpay`. No contract change.

## Acceptance criteria
- [ ] The "Poista maksumerkintä / Unmark paid" button is removed from the cost list actions cell (only the remove button stays). Remove the now-unused i18n key if nothing else uses it.
- [ ] Paid line, editable view: the actual amount inline field saves on Enter/blur as today. If the value is **empty or 0**, call `POST /unpay` instead of `/pay`; the line goes back to unpaid and shows the "Merkitse maksetuksi" button. Other invalid input still shows the inline error.
- [ ] Unpay errors show inline on the field (same pattern as other inline save errors).
- [ ] The paid info (check icon + paid time · partner) is no longer shown in the cost table — neither in the editable nor the read-only view. Read-only paid lines show just the amount.
- [ ] Pay input (PayControl) unchanged: empty + blur still cancels without saving; entering 0 on an **unpaid** line also cancels without paying.
- [ ] Lines on a purchase order: unchanged (locked).
- [ ] Unit tests updated/added; e2e specs that used the unmark button or paid info updated (02/03/18/20 as needed). Tests, lint, build pass.

## Out of scope
Backend changes; the purchase order page; the gig log.
