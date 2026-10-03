# Domain model

- **Status:** Review

> This repository contains no real names, customer data or business figures (BR-090).
> Business values (default fees, deduction, sign-in domain, budget categories, templates)
> come from the local, uncommitted seed / `.env`. Specs refer to them by name, not value.

## Overview

```
Partner (user) ──┬── sells / produces ──┐
                 ├── HourEntry           │
                 └── Task                ▼
                                        Gig ◄── created from ── LineupTemplate ── TemplateRole
                                        ├── CostLine ── Person (optional)
                                        ├── Attachment
                                        └── GigEvent (full history)

BudgetCategory ── BudgetYear (per year: budget + actual, expense + income)
Setting (seeded key/value)
```

Money: EUR, excl. VAT, 2 decimals, never negative. All tables have `created_at`, `updated_at`.
No customer data is stored; it is in the contract attachment.
Concurrent edits: last save wins.

## Year (BR-080)
- A gig belongs to the year of its `start_date`.
- An hour entry belongs to the year of its `date`.
- A budget row has an explicit `year`.

---

## Partner
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| person_id | → Person | partners are also people who play / work gigs |
| email | string | Google account in `AUTH_ALLOWED_DOMAIN`, unique |
| language | `fi` \| `en` | default `fi` |

## Person
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | required |
| active | bool | inactive = hidden from pickers, kept on old gigs |

## LineupTemplate (seed only, no edit screen)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | |
| roles | TemplateRole[] | ordered: `role`, `default_fee` |

## Setting (seed only, no edit screen)
| Key | Meaning |
|---|---|
| `fees.office_default` | Office fee on a new gig |
| `fees.sales_default` | Sales fee on a new gig |
| `fees.production_default` | Production fee on a new gig |
| `fees.load_in_deduction` | Amount the load-in switch deducts (BR-026) |

---

## Gig
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| start_date | date | required; sets the year |
| end_date | date | optional; multi-day gigs; ≥ start_date |
| status | `SOLD` \| `CANCELLED` | "played" = SOLD and date passed (BR-010) |
| lineup_template_id | → LineupTemplate | null = custom lineup |
| lineup_name | string | required |
| venue | string | required |
| technical_setup | TechnicalSetup[] | multi-select |
| seller_id | → Partner | required |
| producer_id | → Partner | required |
| price | money | required |
| additional_sales_amount | money | default 0 |
| additional_sales_description | string | optional |
| notes | text | one free notes field |
| deleted_at, deleted_by | | soft delete (BR-018) |
| *total_price* | derived | price + additional_sales_amount |

## CostLine
One list per gig: people's fees and all other costs.
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| gig_id | → Gig | |
| type | CostType | a Role or an ExpenseCategory |
| person_id | → Person | optional (required to be "staffed" for musician roles) |
| description | string | optional; required for `OTHER` |
| budgeted_amount | money | |
| joins_load_in | bool | musician roles only; default true (BR-026) |
| load_in_deduction_applied | money | amount deducted when switched off, so switching on restores it exactly |
| actual_amount | money | null until paid; never set for `FUEL` (BR-008) |
| paid_at | timestamp | set automatically when marked paid in the UI |
| paid_by | → Partner | set automatically |

"Paid" = `paid_at` is set.

## Attachment
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| gig_id | → Gig | |
| filename, content_type, size_bytes | | PDF, DOCX, PNG, JPG; ≤ 20 MB |
| uploaded_by, uploaded_at | | |
| deleted_at | timestamp | soft delete |

Files are stored on local disk outside the repository (path from `.env`).

## GigEvent — full history (BR-015)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| gig_id | → Gig | |
| type | see below | |
| partner_id | → Partner | who |
| at | timestamp | when |
| reason | text | required for CANCELLED, UNCANCELLED, DELETED |
| details | json | changed fields with old → new values |

Types: `CREATED`, `UPDATED`, `MOVED`, `CANCELLED`, `UNCANCELLED`, `DELETED`, `RESTORED`,
`COST_ADDED`, `COST_UPDATED`, `COST_REMOVED`, `COST_PAID`, `COST_UNPAID`,
`ATTACHMENT_ADDED`, `ATTACHMENT_REMOVED`.

---

## Task
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| title | string | required |
| description | text | optional |
| due_date | date | optional |
| owner_id | → Partner | required |
| status | `OPEN` \| `DONE` | |
| completed_at | timestamp | set when DONE |

## HourEntry
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| partner_id | → Partner | |
| date | date | sets the year |
| comment | string | required |
| hours | decimal | 0.25…24, 0.25 steps |

## BudgetCategory (seed only)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| code | string | stable id |
| name_fi, name_en | string | |
| budgeted | bool | false = actuals only (e.g. `FUEL`) |

## BudgetYear
One row per category per year. All four numbers are typed in by partners.
| Field | Type |
|---|---|
| category_id | → BudgetCategory |
| year | int |
| budget_expense | money |
| budget_income | money |
| actual_expense | money |
| actual_income | money |

---

## Fixed lists

### CostType
**Roles** (people): `VOC`, `BACKING_VOC`, `BASS`, `GUITAR`, `DRUMS`, `KEYS`, `PIANO`, `MIX`,
`HORN_1`, `HORN_2`, `SAX`, `TRUMPET`, `TROMBONE`, `VIOLIN`, `DJ`, `TECHNICIAN`, `OTHER_ROLE`
— these are **musician roles** (load-in switch, staffing check).
**Internal roles:** `OFFICE`, `SALES`, `PRODUCTION`.
**Expense categories:** `FUEL` (estimate only), `VEHICLE`, `TRAVEL`, `PARKING`, `ACCOMMODATION`,
`FOOD`, `EQUIPMENT_RENTAL`, `ARRANGEMENT`, `LEAD_FEE`, `OTHER`.

FI/EN labels live in the translation files.

### TechnicalSetup (multi-select)
`HOUSE_TECH`, `HOUSE_TECHNICIAN`, `SET_A`, `SET_B`, `SET_C`, `OWN_PA`, `VAN`

## Change log
- 2026-10-03 – First draft and iterations (PM)
- 2026-10-03 – Simplified MVP: no Played status, price + additional sales fields, one notes field, one cost list, paid timestamp, plain attachments, seed-only templates/settings, simple people/tasks, budget as one row per category per year (PM)
