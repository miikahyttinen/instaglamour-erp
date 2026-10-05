# Seed data (UC-024)

The seed fills a local database. **Real business data never goes into the repository (BR-090).**

| File | Committed? | Content |
|---|---|---|
| `seed.local.json` | **No** (gitignored) | Real partners, people, templates, fees, budget categories… |
| `seed.example.json` | Yes | Synthetic demo data only ("Partner A", "Person 1", "Venue X", round dummy amounts, `@example.com`) |

`npm run db:seed` loads `seed.local.json` if it exists, otherwise `seed.example.json`.

## Commands

```bash
npm run db:seed                          # load (idempotent, safe to re-run)
npm run db:reset                         # DELETE ALL DATA (keeps the schema), then load
npx tsx seed/run.ts --file path/to.json  # load a specific file (add --reset to empty first)
```

The whole file is validated first. If anything is wrong, every problem is printed and
**nothing is loaded** (one transaction).

## Re-running (idempotency)

| Data | Natural key | On re-run |
|---|---|---|
| Partner | `email` (case-insensitive) | Person name updated; `language` only set when created (it is a user preference) |
| Person | `name` | `active` updated |
| Lineup template | `name` | Roles replaced by the file's roles |
| Setting | key | Value updated |
| Budget category | `code` | Names, `budgeted`, `active`, order updated |
| Gig | `startDate` + `venue` + `lineupName` | Inserted only if missing (never overwrites app edits) |
| Task | `title` + owner | Inserted only if missing |
| Hour entry | partner + `date` + `comment` | Inserted only if missing |
| Budget row | `category` + `year` | Inserted only if missing |

Nothing is ever deleted except with `--reset`.

## Format

All money is **integer cents** (EUR, excl. VAT): `30000` = 300.00 €. Dates are `YYYY-MM-DD`.
Partners, templates, people and categories are referenced by email / name / code.

```jsonc
{
  "partners": [                       // required, ≥ 1. Partners are also people.
    { "name": "Partner A", "email": "partner.a@example.com", "language": "fi" }  // language: fi|en, default fi
  ],
  "people": [                         // non-partner people; don't repeat partner names here
    { "name": "Person 1", "active": true }                                     // active default true
  ],
  "lineupTemplates": [
    { "name": "Template A", "roles": [ { "role": "VOC", "defaultFeeCents": 30000 } ] }  // roles in display order
  ],
  "settings": {                       // all four keys required
    "fees.office_default": 10000,
    "fees.sales_default": 10000,
    "fees.production_default": 10000,
    "fees.load_in_deduction": 1000
  },
  "budgetCategories": [               // listed order = display order
    { "code": "FUEL", "nameFi": "Polttoaine", "nameEn": "Fuel", "budgeted": false, "active": true }
  ],                                  // budgeted default true; false = actuals only

  // Optional business data (demo / migration):
  "gigs": [
    {
      "startDate": "2026-05-01", "endDate": "2026-05-02",   // endDate optional, ≥ startDate
      "status": "SOLD",                                     // SOLD (default) | CANCELLED
      "lineupTemplate": "Template A",                       // and/or lineupName (one is required)
      "lineupName": "Custom name",                          // default = template name
      "venue": "Venue X",
      "technicalSetup": "HOUSE_TECH",                       // optional, one of HOUSE_TECH | SET_A | SET_B | SET_C
      "logistics": "OWN_VAN",                               // optional, one of OWN_VAN | RENTAL_VAN | TAXI | OTHER
      "houseTechnician": false,                             // optional, default false
      "seller": "partner.a@example.com", "producer": "partner.b@example.com",
      "priceCents": 100000, "additionalSalesCents": 0, "additionalSalesDescription": "…", "notes": "…",
      "costLines": [                                        // omit → generated per BR-020/BR-021 from template + settings
        {
          "type": "BASS",                                   // any CostType (docs/domain-model.md)
          "person": "Person 1",                             // optional; person or partner name
          "description": "…",                               // required for OTHER and OTHER_ROLE
          "budgetedCents": 30000,
          "joinsLoadIn": true,                              // musician roles only, default true
          "actualCents": 30000, "paidBy": "partner.b@example.com"  // both or neither; never for FUEL
        }
      ]
    }
  ],
  "tasks": [
    { "title": "…", "owner": "partner.a@example.com", "dueDate": "2026-06-01", "description": "…", "status": "OPEN" }
  ],
  "hours": [
    { "partner": "partner.a@example.com", "date": "2026-03-02", "comment": "…", "hours": 1.5 }  // 0.25…24, 0.25 steps
  ],
  "budget": [
    { "year": 2026, "category": "RENT",
      "budgetExpenseCents": 0, "budgetIncomeCents": 0, "actualExpenseCents": 0, "actualIncomeCents": 0 }
  ]                                   // amounts default 0; budget amounts must be 0 for budgeted=false categories
}
```

Unknown keys are rejected (catches typos). Seeded gigs get a `CREATED` history event by their seller.

### Technical setup format change (TASK-010)

`technicalSetup` used to be a list. It is now **one value or omitted**, and two new fields exist.
A gig in an older seed file (e.g. your `seed.local.json`) with a list is rejected with a hint; convert it the
same way the database migration converts existing gigs:

| Old list contains | New fields |
|---|---|
| `SET_A`, `SET_B`, `SET_C`, `HOUSE_TECH` | `technicalSetup` = the first of these present, in this order (`SET_A` before `SET_B` before `SET_C` before `HOUSE_TECH`) |
| `HOUSE_TECHNICIAN` | `"houseTechnician": true` |
| `VAN` | `"logistics": "OWN_VAN"` |
| `OWN_PA` | no equivalent: leave it out (or note it in `notes` if it matters) |

Example: `["HOUSE_TECH", "HOUSE_TECHNICIAN", "VAN"]` → `"technicalSetup": "HOUSE_TECH", "houseTechnician": true, "logistics": "OWN_VAN"`.

## Making your local seed

```bash
cp seed/seed.example.json seed/seed.local.json   # then replace with real data
git status                                       # seed.local.json must NOT appear
```
