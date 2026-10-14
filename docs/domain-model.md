# Domain model

- **Status:** Approved

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
| technical_setup | TechnicalSetup \| null | dropdown; null = not set |
| logistics | Logistics \| null | dropdown; null = not set |
| house_technician | bool | default false |
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

## BudgetCategory (managed by partners)
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | required, one name (shown in both languages); unique among active rows (case-insensitive) |
| active | bool | removing a row sets false; its year values are kept |
| sort_order | int | creation order |

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

### TechnicalSetup (single choice)
`HOUSE_TECH` (house tech), `SET_A`, `SET_B`, `SET_C` (own PA sets)

### Logistics (single choice)
`OWN_VAN`, `RENTAL_VAN`, `TAXI`, `OTHER`

## Change log
- 2026-10-05 – Budget rows managed by partners (single name, no actuals-only rows, fuel row removed) (PM)
- 2026-10-05 – Technical setup single choice, new Logistics field, house_technician boolean (owner request) (PM)
- 2026-10-03 – First draft and iterations (PM)
- 2026-10-03 – BudgetCategory active/sort_order (PM)
- 2026-10-03 – Simplified MVP: no Played status, price + additional sales fields, one notes field, one cost list, paid timestamp, plain attachments, seed-only templates/settings, simple people/tasks, budget as one row per category per year (PM)


---

# Clients & Offers (owner request 2026-10-07)

## Client
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | string | required, unique among non-deleted (case-insensitive, trimmed) |
| notes | text | optional |
| deleted_at | timestamp | soft delete; only allowed when no gig/offer links (BR-101) |

No agencies: one client per gig and per offer. Real client names exist only in the local database / local seed (BR-090).

## Gig (addition)
| Field | Type | Notes |
|---|---|---|
| client_id | → Client | optional |
| offer_id | → Offer | optional, unique; set when created by "Convert to gig" |

## Offer
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| client_id | → Client | required |
| event_name | string | required |
| event_date | date | required; determines the offer's year |
| venue | string | required |
| city | string | optional |
| lineup | string[] | one line per item, shown to the customer |
| includes_text | text | "what's included", shown to the customer; default from setting `offers.default_includes` |
| spotify_url | string | optional; default from setting `offers.default_spotify_url` |
| price_cents | int | optional, excl. VAT, **internal only** |
| seller_id | → Partner | required, default = creator |
| show_references | bool | shows the active References (see Reference) |
| source | `EMAIL` \| `WEBSITE` \| `INSTAGRAM` \| `OTHER` \| null | |
| event_type | `PRIVATE` \| `WEDDING` \| `CORPORATE` \| null | |
| disposition | `PENDING` \| `WON` \| `CANCELLED` \| `NO_RESPONSE` \| `LOST_PRICE` \| `LOST_COMPETITOR` \| `LOST_OTHER` \| `NO_CAPACITY` | default `PENDING` |
| *status* | derived (server) | `OPEN` (PENDING) · `ACCEPTED` (WON) · `REJECTED` (others); *expired* = OPEN and event_date < today |
| gig_id | → Gig | set by convert; at most one gig per offer |
| share_token | string | ≥ 32 random bytes, URL-safe, unique; regenerating invalidates the old link |
| deleted_at | timestamp | soft delete |
| created_at, updated_at | timestamp | |

## OfferEvent (history)
`CREATED`, `UPDATED` (field old → new), `DISPOSITION_CHANGED`, `CONVERTED` (gig id), `LINK_REGENERATED`, `DELETED`, `RESTORED` — partner + time; append-only.

## Partner (addition)
| phone | string | optional, shown on the public offer as seller contact (local seed) |

## Settings (additions, local seed)
`offers.default_includes`, `offers.default_spotify_url` (text). (`offers.references_*` are obsolete — replaced by Reference.)

## Reference (testimonial) — owner request 2026-10-07
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| quote_fi | text | required |
| quote_en | text | optional (falls back to FI on the EN page) |
| author | string | required, e.g. "— Name, Company" |
| image | file | optional photo (PNG/JPG/WebP ≤ 10 MB) stored like attachments in `UPLOAD_DIR`; placeholder shown when missing |
| sort_order | int | display order |
| active | bool | inactive references are not shown on offers |

Replaces settings `offers.references_fi/_en`. Real quotes, authors and photos exist only in the local database/uploads (BR-090); the example seed has 3 synthetic references without photos.

## Partner management (owner request 2026-10-14)
Partner gains: `active` (bool, default true), `granted_by` / `granted_at`, `revoked_by` / `revoked_at`.
A Person is a partner when an **active** Partner links to it. Partners are now created/removed in the app (UC-032), not only via seed.
