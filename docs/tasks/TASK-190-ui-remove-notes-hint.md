# TASK-190: Remove the "no invoicing details in notes" hint

- **owner:** ui
- **status:** todo
- **spec:** owner request 2026-11-07
- **depends on:** none

## Acceptance criteria
- [ ] The notes field hint "Älä kirjoita laskutustietoja muistiinpanoihin." / "Do not put invoicing details in the notes." is removed from the new-gig form (NewEventPage) and the gig page (EventInfoFields); i18n key `eventForm.noCustomerData` removed.
- [ ] Tests referencing the text updated (unit + grep e2e); tests, lint, build pass.
