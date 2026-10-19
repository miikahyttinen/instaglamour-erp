# Use case index — Phase 1 (MVP)

Status: R = Review, A = Approved, I = Implemented, Retired = removed (IDs are never reused).
Actor is a signed-in partner unless stated.

| ID | Use case | Status |
|---|---|---|
| UC-001 | Sign in, sign out, choose language | A |
| UC-022 | Year page (home) | A |
| **Gigs** ||
| UC-002 | Create gig | A |
| UC-003 | View gig list | A |
| UC-004 | View and edit gig | A |
| UC-005 | Manage gig costs and staffing | A |
| UC-007 | Manage price and additional sales | A |
| UC-008 | Manage gig attachments | A |
| UC-009 | Move gig | A |
| UC-010 | Cancel gig | A |
| UC-012 | Uncancel gig | A |
| UC-013 | View gig history | A |
| UC-025 | Delete and restore gig | A |
| **People, tasks, hours** ||
| UC-014 | Manage people | A |
| UC-017 | Manage tasks | A |
| UC-018 | Log own hours | A |
| UC-019 | View hours totals | A |
| **Budget** ||
| UC-020 | Manage yearly budget | A |
| **Clients & offers (phase 2)** ||
| UC-027 | Manage clients | A |
| UC-028 | Offer list | A |
| UC-029 | Create and edit offer | A |
| UC-030 | View offer via public link | A |
| UC-031 | Convert offer to gig | A |
| UC-032 | Manage partner status | A |
| **Purchase orders** ||
| UC-033 | Freelancer link: see own gigs, create purchase order | Freelancer |
| UC-034 | Manage purchase orders (list, search, mark paid, log) | Partner |
| **Data** ||
| UC-035 | Import data from a JSON file (seed format) | Partner |
| **Development** ||
| UC-024 | Load local seed data | A |

Retired: UC-006 (→ UC-005), UC-011 (no Played status), UC-015 (no customer register),
UC-016 and UC-026 (seed only), UC-021 (→ UC-020), UC-023 (→ UC-022).

## Cross-cutting requirements
- **NFR-1** Works on desktop and a 375 px phone screen.
- **NFR-2** All texts, labels, dates and numbers localized FI/EN.
- **NFR-3** Only signed-in partners can access data or files.
- **NFR-4** Failed saves never lose the user's input.
- **NFR-5** The selected year is in the header on every screen (BR-081).
- **NFR-6** No real names, business numbers, customer data or secrets in the repository (BR-090).
- **NFR-8** Inline editing: every editable field of an existing item is edited in place and **saves on blur** (and Enter in single-line fields); Esc reverts; per-field saving/saved/error state. Creating new items, reason-requiring actions (cancel/uncancel/delete), gig dates (Move) and mark paid keep their buttons/dialogs. See `docs/design.md` → Inline editing.
- **NFR-7** Visual design per `docs/design.md`: dark and light theme (toggle in header, default follows OS), Afacad font, Instaglamour logo.
