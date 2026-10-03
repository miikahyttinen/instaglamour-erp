# TASK-005: Double-booking warning for performers only

- **owner:** backend
- **status:** todo
- **spec:** BR-022 (updated), UC-005 AC-5, api-contract.md → Warning format
- **depends on:** TASK-002

## Goal
Warnings only when a **performer** is double booked. Partners being seller/producer on several gigs the same day is normal.

## Acceptance criteria
- [ ] The double-booking check (cost line add, person change, gig move) only considers musician-role lines (`costTypes.musicianRoles`), both for the line being changed and for the lines on other gigs.
- [ ] Adding/assigning OFFICE, SALES, PRODUCTION or an expense never returns `PERSON_DOUBLE_BOOKED`.
- [ ] A person who is SALES on gig A and VOC on gig B on the same day gets no warning; VOC on both → warning.
- [ ] Moving a gig warns only for its musician-role people.
- [ ] Existing tests updated, new tests for the cases above; tests and lint pass.
