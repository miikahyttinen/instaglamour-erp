# Use case index — Phase 1 (MVP)

Status: R = Review, A = Approved, I = Implemented, Retired = removed (IDs are never reused).
Actor is a signed-in partner unless stated.

| ID | Use case | Status |
|---|---|---|
| UC-001 | Sign in, sign out, choose language | R |
| UC-022 | Year page (home) | R |
| **Gigs** ||
| UC-002 | Create gig | R |
| UC-003 | View gig list | R |
| UC-004 | View and edit gig | R |
| UC-005 | Manage gig costs and staffing | R |
| UC-007 | Manage price and additional sales | R |
| UC-008 | Manage gig attachments | R |
| UC-009 | Move gig | R |
| UC-010 | Cancel gig | R |
| UC-012 | Uncancel gig | R |
| UC-013 | View gig history | R |
| UC-025 | Delete and restore gig | R |
| **People, tasks, hours** ||
| UC-014 | Manage people | R |
| UC-017 | Manage tasks | R |
| UC-018 | Log own hours | R |
| UC-019 | View hours totals | R |
| **Budget** ||
| UC-020 | Manage yearly budget | R |
| **Development** ||
| UC-024 | Load local seed data | R |

Retired: UC-006 (→ UC-005), UC-011 (no Played status), UC-015 (no customer register),
UC-016 and UC-026 (seed only), UC-021 (→ UC-020), UC-023 (→ UC-022).

## Cross-cutting requirements
- **NFR-1** Works on desktop and a 375 px phone screen.
- **NFR-2** All texts, labels, dates and numbers localized FI/EN.
- **NFR-3** Only signed-in partners can access data or files.
- **NFR-4** Failed saves never lose the user's input.
- **NFR-5** The selected year is in the header on every screen (BR-081).
- **NFR-6** No real names, business numbers, customer data or secrets in the repository (BR-090).
