# Business rules

- **Status:** Approved

Rules only — concrete values are seeded settings (`domain-model.md`).

## Year
| ID | Rule |
|---|---|
| BR-080 | The year is the primary dimension. Gig → year of start date; hour entry → year of date; budget row → its year. |
| BR-081 | **Revised 2026-10-30:** the year is chosen **on the pages that need it** (Vuosi, Budjetti, Tunnit, Keikat) with a page-level year selector (default current year, remembered per partner and shared by those pages). Other pages (offers, purchase orders, clients, people, tasks) show all years; offers newest created first. |
| BR-082 | **Sold gigs sum** = Σ total price of all non-deleted gigs in the year (cancelled gigs included with their adjusted price, BR-013). |
| BR-083 | **Hours sum** = Σ hours in the year, per partner (with monthly totals) and for all partners. |

## Gig economics
| ID | Rule |
|---|---|
| BR-001 | **Budgeted costs** = Σ cost line `budgeted_amount`. |
| BR-002 | **Actual costs** = Σ cost line `actual_amount` of paid lines. |
| BR-003 | **Margin** = total price − costs (budget and actual). |
| BR-004 | **Margin %** = margin / total price, 1 decimal; "–" when total price = 0. |
| BR-006 | **Total price** = price + additional sales amount. |
| BR-007 | **Revised 2026-11-11:** invoicing details are a free-text field on the gig ("Laskutustiedot"). Invoicing is a separate system. Clients are stored with name and notes only (BR-100). |
| BR-008 | **Fuel** on a gig is an estimate only: a `FUEL` expense has a budgeted amount and never an actual amount. Actual fuel, if tracked, goes into a budget row of the partners' own choosing. |

## Gig lifecycle
| ID | Rule |
|---|---|
| BR-010 | Statuses: `SOLD`, `CANCELLED`. A SOLD gig whose start date has passed is shown as "played"; there is no separate status. |
| BR-011 | `SOLD → CANCELLED` requires a reason. `CANCELLED → SOLD` (uncancel) requires a reason. |
| BR-012 | **Move** changes the dates of a SOLD gig and is logged with old and new dates. |
| BR-013 | **Cancelled gig billing:** the partner sets the price / additional sales to what is still billed (0 if nothing) and explains it in the notes. The gig then counts normally in the year. |
| BR-015 | **Everything is logged:** every create, field change (old → new), move, cancel, uncancel, delete, restore, cost line change, paid/unpaid and attachment change, with partner and time. History cannot be edited or deleted. |
| BR-017 | Gig list shows SOLD gigs by default; cancelled via filter. |
| BR-018 | **Soft delete** with reason; a deleted gig is excluded everywhere and can be restored. |

## Costs and staffing
| ID | Rule |
|---|---|
| BR-020 | **Revised 2026-11-06:** a gig created from a lineup gets one cost line per lineup line (any cost type) with its default amount and description; musician roles `joins_load_in = true`, no person except SALES (seller) / PRODUCTION (producer). Lineup edits never change existing gigs. |
| BR-021 | **Revised 2026-11-06:** every new gig has a `SALES` (seller) and `PRODUCTION` (producer) line — from the lineup, or added with 0 € if the lineup lacks one. A gig without a lineup gets `OFFICE`, `SALES`, `PRODUCTION` at 0 €. There are no default fee settings; lineups define all fees. |
| BR-022 | Double booking applies to **performers only** (musician-role lines: musicians, Mix, DJ, Technician…). Putting a person on a musician-role line when they already have a musician-role line on another non-cancelled, non-deleted gig with overlapping dates shows a warning naming that gig; it doesn't block. Internal lines (Office, Sales, Production) and expenses never trigger or count towards the warning. |
| BR-023 | A gig with a musician-role line without a person is "not fully staffed". |
| BR-024 | One person may have several lines on a gig; several people may share a role (e.g. Production split). |
| BR-025 | **Mark paid:** one action in the UI sets `actual_amount` (default = budgeted amount, editable), `paid_at` = now and `paid_by` = the partner, and logs `COST_PAID`. **Unmark** clears them and logs `COST_UNPAID`. |
| BR-026 | **Load-in switch** (musician roles): switching off subtracts `fees.load_in_deduction` from the line's budgeted amount (not below 0) and stores the amount deducted; switching on adds that stored amount back. Later setting changes don't affect existing lines. |
| BR-027 | **Seller/producer change:** unpaid `SALES` (`PRODUCTION`) lines held by the old seller (producer) move to the new one, keeping the amount. Paid lines and lines of other people (split) don't change. The partner is told which lines moved. |

## Attachments
| ID | Rule |
|---|---|
| BR-040 | PDF, DOCX, PNG, JPG; max 20 MB. Only signed-in partners can download. Removal is a soft delete. |

## Tasks
| ID | Rule |
|---|---|
| BR-030 | A task has one owner; status `OPEN` or `DONE`. Overdue = past due date and OPEN. |

## Hours
| ID | Rule |
|---|---|
| BR-050 | Entry = date, comment (required), hours (0.25…24, 0.25 steps). |
| BR-051 | Partners edit only their own entries; everyone sees all totals. |

## Yearly budget
| ID | Rule |
|---|---|
| BR-060 | Per category and year, partners type budget and actual (expense and income). **Variance** = budget − actual. |
| BR-063 | **Year result** = sold gigs sum − actual gig costs + Σ actual income − Σ actual expense (fixed). |

## Access
| ID | Rule |
|---|---|
| BR-070 | Google sign-in only; account must be in `AUTH_ALLOWED_DOMAIN` and a registered partner. |

## Data protection
| ID | Rule |
|---|---|
| BR-090 | No real names, numbers from the business, customer data or secrets ever go to the repository / GitHub. Seed data, `.env` and uploads are local and gitignored. Tests and the example seed use synthetic data only. |

## Change log
- 2026-10-05 – BR-008/BR-062: partner-managed budget rows; fuel row and actuals-only rows removed (PM)
- 2026-10-03 – First draft and iterations (PM)
- 2026-10-03 – Simplified MVP rules (PM)
- 2026-10-03 – BR-022: double booking for performers only (owner decision) (PM)


## Clients & Offers (2026-10-07)
| ID | Rule |
|---|---|
| BR-100 | A client has a name (required, unique case-insensitively among active clients) and notes. Gigs and offers link to **at most one** client (no agencies). Gig client is optional; offer client is required. |
| BR-101 | A client can be deleted only when no gig or offer links to it (409 `CLIENT_IN_USE`); deletion is soft. |
| BR-102 | Offer status is derived on the server from disposition: PENDING → OPEN, WON → ACCEPTED, any other → REJECTED. *Expired* = OPEN and event date before today (display only). |
| BR-103 | Every offer change is logged (OfferEvent); disposition changes are always logged with old → new. |
| BR-104 | **Public link:** each offer has one unguessable link `/o/<token>` (≥ 32 random bytes, URL-safe). It works without sign-in and shows **only that offer**, **without price** or any internal field (disposition, source, event type, notes, gig link). Regenerating the token invalidates the old link; a deleted offer's link returns 404. |
| BR-105 | **Convert to gig:** creates a gig from the offer — start date = event date, venue = venue (+ ", city"), lineup **not prefilled** (owner 2026-11-07: the partner picks a lineup or types a custom lineup name), client = offer client, price = offer price (0 if empty), seller and producer = offer seller — as **prefilled, editable values** in the new-gig form (owner decision 2026-10-20; the partner reviews and may change any field) — links gig ↔ offer, sets disposition WON (logged). Only one gig per offer (409 `ALREADY_CONVERTED`). |
| BR-106 | **Offer figures for the selected year** (offers whose event date is in the year, non-deleted): *open value* = Σ price of OPEN, non-expired offers; *win rate* = WON / decided, where decided = disposition not PENDING and not CANCELLED ("–" when none decided). |
| BR-107 | Email sync is out of scope. |
| BR-109 | **Only accepted, upcoming offers can be converted** (owner 2026-10-22): disposition WON (status ACCEPTED) and event date today or later (Helsinki); otherwise gig-draft and convert → 409 `OFFER_NOT_CONVERTIBLE` and the UI shows no convert button. Already converted → `ALREADY_CONVERTED` (checked first). Seed/import conversions are exempt. |
| BR-108 | **References:** an offer with `showReferences` shows all **active** references in sort order (photo, quote in the page language — EN falls back to FI — and author). Reference photos are served publicly **only** through a URL scoped to a valid offer token whose offer shows references; otherwise 404. |
| BR-110 | **Partner status** is set on the person page. Making a person a partner requires a Google email in `AUTH_ALLOWED_DOMAIN`, unique among partners (case-insensitive); it creates (or re-activates) the Partner linked to the person. |
| BR-111 | Removing partner status deactivates the Partner: sign-in is refused (BR-070 requires an **active** partner) and **all its sessions are revoked immediately**. Name stays on existing gigs, offers, tasks, hours and history. Inactive partners are not offered for new seller/producer/owner choices. |
| BR-112 | A partner cannot remove their own partner status (409 `CANNOT_REMOVE_SELF`), and the last active partner cannot be removed (409 `LAST_PARTNER`). Grant/revoke records who and when. |

## Purchase orders (2026-10-16)
| ID | Rule |
|---|---|
| BR-113 | **Freelancer link:** every person has one unguessable link `/f/<token>` (≥ 32 random bytes, URL-safe), usable without sign-in. It shows only that person's own fee lines (amount > 0) on non-deleted SOLD gigs — gig date, venue, role/description, own fee, paid state — and their purchase orders. Never client, gig price, other people, notes or internal data. Regenerating invalidates the old link; an inactive person's link → 404. **Active partners have no freelancer link** (owner decision 2026-10-18): their link → 404 and the person page shows no link section; if partner status is removed, the link works again. `noindex`, rate-limited like the public offer. |
| BR-114 | **Eligible fee:** line person = the freelancer, gig SOLD and played (start date < today), not deleted, line unpaid, amount > 0, and not on an OPEN or PAID purchase order. |
| BR-115 | **Create PO:** the freelancer selects ≥ 1 eligible fee from any number of gigs; one PO is created with a snapshot of each line's amount; total = Σ snapshots. All-or-nothing: if any line isn't eligible, nothing is created. |
| BR-116 | **PO number** = name slug + `-` + running number (≥ 4 digits, zero-padded), e.g. `MATTI-VIRTANEN-0042`. Slug: person's name at creation, accents removed, upper case, non-letters/digits → `-`. The running number is global, so numbers are always unique and never reused. |
| BR-117 | **PO status:** `OPEN → PAID` (Mark paid: every line paid with its snapshot amount, now, by the partner — BR-025, logged on the gig with the PO number); `PAID → OPEN` (Unmark: lines unpaid); `OPEN → CANCELLED` (reason required; lines freed). Cancelled is final. |
| BR-118 | **Lock:** while a line is on an OPEN or PAID PO, its person, amount, load-in switch and paid state can't be changed and it can't be deleted; the gig can't be cancelled or deleted while it has lines on an OPEN PO. Change the PO first (unmark / cancel). Description stays editable. |
| BR-119 | **Everything is logged** per PO: created (by the freelancer via link), paid, unpaid, cancelled (with reason) — actor and time. The PO list year = year of creation; search by number/name covers all years. |

## Data import (2026-10-19)
| ID | Rule |
|---|---|
| BR-120 | **Import** uses the seed format and the seed loader's rules (`backend/seed/README.md`): validated as a whole, one transaction, insert-only/idempotent per natural key, never deletes or overwrites app edits. Any signed-in partner can import. |
| BR-121 | Import safety: partner emails must be in `AUTH_ALLOWED_DOMAIN`; reference `image` paths are rejected (no server file access); max 10 MB. Every real import is logged (partner, time, file name, counts). Import files contain real data and are never committed (BR-090). |

## Offer statistics (2026-10-20)
| ID | Rule |
|---|---|
| BR-122 | The Tarjoukset page shows six statistics cards (contract "Offer statistics"): offers created (selected month among the last 6 completed months: count + total value), average value (by creation year), offers per year by event date (count + total value), open offers value (by event year, from the selected year on), open offers by event type, and win rate (all years; per event type). Cards ignore the table filters. Win rate here is all-time; BR-106's per-year figures are replaced on this page by the cards. |
