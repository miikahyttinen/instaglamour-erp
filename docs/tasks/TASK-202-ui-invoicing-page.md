# TASK-202: Laskutus page — all invoice rows

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "Laskutus page: all invoice rows (owner request 2026-11-13)"
- **depends on:** none (MSW mocks)

## Acceptance criteria
- [ ] Menu item "Laskutus / Invoicing" (`/invoicing`) right after Keikat (pick a fitting icon).
- [ ] Table from `GET /api/invoice-rows` in API order: status tag (Lähettämättä / Lähetetty, same tones as the gig page invoice rows), created date, client, gig (date + lineup name, link to gig page), description (+ "Automaattinen" hint for auto rows), amount (right-aligned), Laskutustiedot (multi-line, clamped to 2–3 lines with an expand toggle or full text in title). Empty state "Ei laskuja / No invoices".
- [ ] Shared pager, 100 rows per page (`?page=`), like other lists.
- [ ] Phone: compact two-line rows (line 1: client + status tag; line 2: gig date · description · amount; Laskutustiedot under them, clamped). No horizontal scroll at 375; no sideways scroll 600–1920 (add the page to the e2e layout checks).
- [ ] Cache: refresh `['invoice-rows']` after any invoice-row or gig change.
- [ ] MSW mock + unit tests; e2e spec (rows from two gigs appear in the right order, paging hidden for few rows, link opens the gig) — may need TASK-061; say if not run. Tests, lint, build pass. `docs/design.md` one line.
