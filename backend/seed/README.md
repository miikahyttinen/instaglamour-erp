# Seed data (UC-024)

The seed fills a local database. **Real business data never goes into the repository (BR-090).**

| File | Committed? | Content |
|---|---|---|
| `seed.local.json` | **No** (gitignored) | Real partners, people, templates, fees, budget rows… |
| `seed.example.json` | Yes | Synthetic demo data only ("Partner A", "Person 1", "Venue X", round dummy amounts, `@example.com`) |

`npm run db:seed` loads `seed.local.json` if it exists, otherwise `seed.example.json`.

## Commands

```bash
npm run db:seed                          # load (idempotent, safe to re-run)
npm run db:reset                         # DELETE ALL DATA (keeps the schema), then load
npx tsx seed/run.ts --file path/to.json  # load a specific file (add --reset to empty first)
```

The whole file is validated first. If anything is wrong, every problem is printed and
**nothing is loaded** (one transaction). On success it prints, per data type, how many items were
**created**, **updated** and **skipped** (already there).

## Import from the app (UC-035)

Partners can load a file in this format without the command line: **Data import** in the app
(`POST /api/import`). Same validation, same re-run rules (below), one transaction, and a **Check**
(dry run) that shows the exact counts without saving anything. Differences from the seed command:

- Max **10 MB**.
- Every partner email must be in `AUTH_ALLOWED_DOMAIN` (`.env`).
- **No photos:** a reference with `image` is rejected (the server never reads files named in an
  upload). Import the references without `image` and add the photos in the app.
- No `--reset`: an import never deletes anything (emptying the database is `npm run db:reset`).
- Every real import is logged (partner, time, file name, counts) and shown in the import history.

Imports and seed runs never run at the same time (a database lock), so importing the same file twice
at once can't create duplicates. Import files contain real data: keep them out of git like
`seed.local.json` (BR-090).

## Re-running (idempotency)

| Data | Natural key | On re-run |
|---|---|---|
| Partner | `email` (case-insensitive) | **Inserted only if missing** (created active, with its person, `language` and `phone`). An existing partner and its person are never changed — not `active`, email, name, phone or language — so a re-run never re-activates a partner removed in the app (UC-032). **One exception:** the person's `roles` are filled from the file when the person has no roles yet (counted as `updated`) |
| Person | `name` | `active` updated; `roles` set from the file **only when the person has no roles yet** (never overwrites roles edited in the app or backfilled from cost lines) |
| Lineup template | `name` | Roles replaced by the file's roles |
| Setting | key | Value updated |
| Budget category (row) | `code` if given, else `name` (case-insensitive; removed rows count too) | Inserted only if missing — partners manage the rows in the app, so a re-run never renames, reorders or brings back a row they removed |
| Client | `name` (case-insensitive, trimmed; non-deleted clients) | Inserted only if missing — partners manage clients in the app, so a re-run never changes notes or brings back a deleted client (a deleted client's name creates a new client) |
| Gig | `startDate` + `venue` + `lineupName` | Inserted only if missing (never overwrites app edits — so adding `client` to an already-loaded gig does not link it; set the client in the app) |
| Offer | `client` + `eventName` + `eventDate` (deleted offers count too) | Inserted only if missing, with a new random share link. `converted: true` also creates the gig per BR-105 (disposition WON) |
| Task | `title` + owner | Inserted only if missing |
| Hour entry | partner + `date` + `comment` | Inserted only if missing |
| Budget row | `category` + `year` | Inserted only if missing |
| Reference | `quoteFi` + `author` (trimmed) | Inserted only if missing, after the existing references in listed order; its photo is copied into `UPLOAD_DIR`. Partners manage references in the app, so a re-run never changes or re-adds one |

Nothing is ever deleted except with `--reset` (which empties the database but leaves photo files in `UPLOAD_DIR`).

## Format

All money is **integer cents** (EUR, excl. VAT): `30000` = 300.00 €. Dates are `YYYY-MM-DD`.
Partners, templates, people, clients and budget categories are referenced by email / name (budget categories: name or `code`).
`clients` is optional: older seed files without it (and gigs without `client`) still load.
`offers`, partner `phone` and the `offers.*` settings are optional too (TASK-016), and so is `references` (TASK-018).

```jsonc
{
  "partners": [                       // required, ≥ 1. Partners are also people.
    { "name": "Partner A", "email": "partner.a@example.com", "language": "fi",   // language: fi|en, default fi
      "phone": "+358 40 000 0001",                                               // optional; shown on public offers
      "roles": ["VOC"] }                                                         // optional, see people
  ],
  "people": [                         // non-partner people; don't repeat partner names here
    { "name": "Person 1", "active": true,                                       // active default true
      "roles": ["GUITAR", "BACKING_VOC"] }  // optional; roles the person can play: musician-role codes
                                            // (VOC … OTHER_ROLE), no duplicates; filled only when empty
  ],
  "lineupTemplates": [
    { "name": "Template A", "roles": [ { "role": "VOC", "defaultFeeCents": 30000 } ] }  // roles in display order
  ],
  "settings": {                       // the four fees.* keys are required (cents)
    "fees.office_default": 10000,
    "fees.sales_default": 10000,
    "fees.production_default": 10000,
    "fees.load_in_deduction": 1000,
    "offers.default_includes": "…"    // optional text (line breaks with \n): default "what's included" of a new offer
  },
  "budgetCategories": [               // the yearly budget rows; new rows are added after existing ones, in listed order
    { "name": "Category A" },                                   // one name (both languages); unique, case-insensitive
    { "name": "Category B", "code": "CAT_B", "active": true }   // code optional (UPPER_SNAKE_CASE stable key); active default true
  ],

  // Optional business data (demo / migration):
  "clients": [                        // optional (BR-100); real client names only in seed.local.json
    { "name": "Client A Oy", "notes": "…" }                     // name unique, case-insensitive; notes optional
  ],
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
      "client": "Client A Oy",                              // optional; a name from clients (case-insensitive)
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
  "offers": [                         // optional (UC-028…UC-031)
    {
      "client": "Client A Oy",                              // required; a name from clients
      "eventName": "Event 1", "eventDate": "2026-11-14", "venue": "Venue X",  // required
      "city": "City A",                                     // optional
      "lineup": ["Vocals", "Guitar"],                       // optional, one item per line
      "includesText": "…",                                  // optional; default from offers.default_includes
      "showReferences": true,                               // optional, default false
      "priceCents": 300000,                                 // optional, internal only
      "seller": "partner.a@example.com",                    // required
      "source": "EMAIL",                                    // optional: EMAIL | WEBSITE | INSTAGRAM | OTHER
      "eventType": "CORPORATE",                             // optional: PRIVATE | WEDDING | CORPORATE
      "disposition": "PENDING",                             // optional, default PENDING (see domain-model.md)
      "converted": false                                    // optional; true = also create its gig (BR-105), disposition WON
    }
  ],
  "references": [                     // optional (BR-108): testimonials on offers with showReferences; real ones only in seed.local.json
    { "quoteFi": "…",                                       // required, ≤ 5000 chars (line breaks with \n)
      "quoteEn": "…",                                       // optional; the EN page falls back to quoteFi
      "author": "— Name, Company",                          // required, ≤ 200 chars
      "active": true,                                       // optional, default true (inactive = not shown on offers)
      "image": "photos/person1.jpg" }                       // optional; PNG/JPG/WebP ≤ 10 MB, path relative to the seed file
  ],
  "tasks": [
    { "title": "…", "owner": "partner.a@example.com", "dueDate": "2026-06-01", "description": "…", "status": "OPEN" }
  ],
  "hours": [
    { "partner": "partner.a@example.com", "date": "2026-03-02", "comment": "…", "hours": 1.5 }  // 0.25…24, 0.25 steps
  ],
  "budget": [
    { "year": 2026, "category": "Category A",                // a budgetCategories name (case-insensitive) or code
      "budgetExpenseCents": 0, "budgetIncomeCents": 0, "actualExpenseCents": 0, "actualIncomeCents": 0 }
  ]                                   // amounts default 0; every row takes budget and actual amounts
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

### Budget category format change (TASK-012)

Budget rows are now managed by the partners in the app; the seed only provides the starting rows.
Each row has **one `name`**; `nameFi`, `nameEn` and `budgeted` are gone and there are no actuals-only rows
(the special fuel row is removed — actual fuel, if tracked, goes into a row of the partners' choosing, BR-008).
An older seed file with the old keys is **rejected** (nothing is loaded) with a message naming each entry.
Convert it the same way the database migration `20261005200000_budget_category_name` converts existing rows:

| Old entry | New entry |
|---|---|
| `"nameFi": "X", "nameEn": "Y"` | `"name": "X"` (the old `nameFi`) |
| `"code": "RENT"` | keep it (optional; it makes re-runs match the row even after it is renamed in the app) |
| `"budgeted": false` (e.g. `FUEL`) | leave the entry out together with its `budget` entries, or keep it as a removed row with `"active": false` (its values are loaded but hidden from every year and total) |
| `"budgeted": true` | drop the key |

`budget[].category` may stay a code if the category keeps its `code`, or use the name.

### References format change (TASK-018)

The references block used to be two free-text settings, `offers.references_fi` and `offers.references_en`.
It is now a list of references (`references`, above), each with its own quote, author and optional photo.
Older files with the two settings **still load**: the keys are accepted and ignored (not stored). Move the
content into `references` entries, one per testimonial (the text can't be split automatically).
In an existing database the migration `20261007160000_references` leaves the old setting rows in place
(unused, harmless); re-enter the references in the app or through `references` in your local seed.

Photos: keep them outside git like the local seed (e.g. next to `seed.local.json` in a gitignored folder —
check `git status`) and give the path relative to the seed file. Every photo is checked before anything is
loaded (exists, ≤ 10 MB, PNG/JPG/WebP by content); the seed command copies them into `UPLOAD_DIR`
(`.env`, default `../../instaglamour-uploads`).

### Spotify link is fixed (TASK-022)

Every offer now shows the same Spotify link, a constant in code (`src/offers/constants.ts`); offers have
no Spotify field any more. Older files still load: the setting `offers.default_spotify_url` and a per-offer
`spotifyUrl` are accepted and ignored (not stored). You can delete them from your local seed. Existing
setting rows and the `offer.spotify_url` column stay in the database, unused.

## Making your local seed

```bash
cp seed/seed.example.json seed/seed.local.json   # then replace with real data
git status                                       # seed.local.json must NOT appear
```
