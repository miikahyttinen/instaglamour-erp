# UC-027: Manage clients

- **Status:** Approved (owner decisions 2026-10-07)
- **Phase:** 2
- **Primary actor:** Partner (UC-030: anonymous customer)
- **Business rules:** BR-100, BR-101

## Goal
Keep one register of clients (name + notes) and see each client's gigs and offers. Internal only.

## Main flow
1. Partner opens **Asiakkaat / Clients**: list of clients (name, number of gigs, number of offers), searchable.
2. Partner adds a client (name; notes optional).
3. Partner opens a client page: name and notes editable in place; lists of the client's **gigs** (date, lineup, venue, status, total price) and **offers** (event date, event, disposition/status, price) — all years, newest first, each linking to its page.

## Alternative flows
- **A1 – Rename / edit notes** inline (save on blur/Enter).
- **A2 – Attach a client to a gig:** on the gig page and new gig form, a client select (optional, with inline "New client…").
- **A3 – Delete** a client without links (confirmation).

## Error flows
- **E1 – Empty or duplicate name** → field error, nothing saved.
- **E2 – Delete a client with gigs/offers** → "Client in use" message.

## Acceptance criteria
- [ ] AC-1: Name unique (case-insensitive) among active clients; notes optional.
- [ ] AC-2: Client page lists all linked gigs and offers with links.
- [ ] AC-3: Gig page and new gig form can set/clear the client; gig list shows and searches the client name.
- [ ] AC-4: Client pages are behind sign-in; nothing client-related is public.
- [ ] AC-5: Example seed has synthetic demo clients linked to example gigs (BR-090).

## Change log
- 2026-10-07 – First version (PM)
