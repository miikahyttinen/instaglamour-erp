# UC-008: Manage gig attachments

- **Status:** Review
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** contracts stored elsewhere
- **Business rules:** BR-007, BR-015, BR-040

## Goal
Keep the contract (customer, invoicing and payment details) and other files with the gig.

## Trigger
A contract is signed or a file belongs to the gig.

## Preconditions
- Gig exists.

## Main flow
1. Partner uploads a file (also from a phone).
2. System checks type/size, stores it outside the repository, lists it (name, uploader, date) and logs it.

## Alternative flows
- **A1 – Open/download**.
- **A2 – Remove**: soft delete after confirmation; logged.

## Error flows
- **E1 – Wrong type or > 20 MB** → rejected.

## Postconditions
- File linked to the gig.

## Acceptance criteria
- [ ] AC-1: PDF, DOCX, PNG, JPG ≤ 20 MB accepted; others rejected.
- [ ] AC-2: Files can't be downloaded without a session.
- [ ] AC-3: Upload and removal are logged.
- [ ] AC-4: Upload works on a phone.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
