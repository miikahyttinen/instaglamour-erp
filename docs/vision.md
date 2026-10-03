# Vision

- **Status:** Review

## Problem
Instaglamour runs its business in a spreadsheet. It is visual but has no data model: data spread
over dozens of copied sheets, free-text cost lines that don't sum, people retyped on every gig,
cancellations as renamed sheets, fragile formulas.

## Goal
A simple web app with a proper data model for gigs, their costs and staffing, partner tasks and
hours, and the yearly budget — organised by **year**.

## Users
The partners. Everyone has the same rights and sees everything.

## Principles
- **Year first:** sold gigs sum, hours sum and budget vs. actual per year (BR-080…BR-083).
- **Simple:** only what replaces the spreadsheet; no statistics.
- **Everything is logged** on gigs (BR-015).
- **No business data in the repository or on GitHub** (BR-090).

## Non-functional
- Responsive web app (desktop + phone), Finnish and English UI.
- EUR excl. VAT.
- Local development only for now.
- Stack: React + TypeScript (frontend), Node.js + TypeScript (backend), PostgreSQL.

## MVP scope
- Google sign-in
- Year page (home)
- Gigs: create, list, edit, move, cancel/uncancel, soft delete/restore, full history
- One cost list per gig (people + expenses), load-in switch, mark paid
- Attachments (contract etc.)
- People (name, active)
- Tasks (open/done)
- Hours (date, comment, hours) with year and month totals
- Yearly budget: budget and actual per category
- Lineup templates, settings and budget categories from the local seed (no edit screens)

## Out of scope
Customer register, invoicing, payroll, per diems, sales pipeline, statistics, deployment,
template/settings edit screens, spreadsheet import.

## Decisions (summary)
| Topic | Decision |
|---|---|
| Customers | Not stored; details in the contract |
| Gig status | Sold / Cancelled; "played" derived from date |
| Price | Price + additional sales (amount, description) |
| Cancelled gig billing | Adjust price, explain in notes; counts normally |
| Costs | One list; load-in switch deducts from budgeted amount |
| Paid | Marked in UI; time and partner recorded |
| Fuel | Estimate on gig; actual in yearly budget |
| History | Everything logged |
| Concurrent edits | Last save wins |
| Templates / settings | Seed only |
| Tasks | Open/Done, owner, due date |
| Hours | Year + month totals per partner |
| Budget actuals | One number per category per year |
| Sign-in | Google, allowed domain + registered partner |
| Hosting | Local only for now |

## Open questions
None.

## Change log
- 2026-10-03 – First draft and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
