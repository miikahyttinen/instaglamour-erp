# Business rules

- **Status:** Approved

Rules only — concrete values are seeded settings (`domain-model.md`).

## Year
| ID | Rule |
|---|---|
| BR-080 | The year is the primary dimension. Gig → year of start date; hour entry → year of date; budget row → its year. |
| BR-081 | The app has a **selected year** (default: current), shown in the header on every screen, remembered per partner. All totals use it. |
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
| BR-007 | No customer or invoicing data is stored; it is in the contract attachment. Invoicing is a separate system. |
| BR-008 | `FUEL` cost lines are estimates: budgeted amount only, never paid. Actual fuel is entered in the yearly budget. |

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
| BR-020 | A gig created from a template gets one cost line per template role (no person) with the role's default fee and `joins_load_in = true`. |
| BR-021 | Every new gig gets `OFFICE`, `SALES` (person = seller) and `PRODUCTION` (person = producer) lines with the default fees from settings. |
| BR-022 | Adding a person who is on another non-cancelled, non-deleted gig with overlapping dates shows a warning naming that gig; it doesn't block. |
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
- 2026-10-03 – First draft and iterations (PM)
- 2026-10-03 – Simplified MVP rules (PM)
