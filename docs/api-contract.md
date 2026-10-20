# API contract — MVP

- **Status:** Approved (derived from approved UCs; changes need the project owner's OK)
- **Base URL:** `/api` (backend on `http://localhost:3000`, frontend dev server proxies `/api`)

## Conventions

| Topic | Rule |
|---|---|
| Format | JSON, `camelCase` keys. Uploads use `multipart/form-data`. |
| Money | Integer **cents** in fields ending `Cents` (EUR, excl. VAT). Never floats. |
| Percent | Number with 1 decimal (e.g. `31.8`) or `null` when total price is 0. |
| Dates | `YYYY-MM-DD`. Timestamps: ISO 8601 UTC (`2026-01-01T12:00:00.000Z`). |
| Hours | Number, multiple of 0.25 (e.g. `1.25`). |
| IDs | UUID strings. |
| Auth | httpOnly session cookie set by the backend. Every endpoint except `/api/auth/*` returns **401** without a valid session. |
| Concurrency | Last save wins. |
| Deleted gigs | Excluded from every list, sum and overlap check unless stated. |
| Today | "Today" (played, overdue, upcoming, default year) is the date in Europe/Helsinki. |
| Year params | `year` in paths/queries: 4-digit integer, else 400 `INVALID_VALUE`. Unknown ids in filters → empty result; malformed ids → 400 `INVALID_VALUE`. |
| No-op requests | A request that changes nothing returns 200 and writes no history event. |
| Check order | Validation (400) → existence (404) → state (409). |

### Error format
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable (English, for logs)", "fields": { "venue": "REQUIRED" }, "details": { } } }
```
`fields` (400 only) and `details` (extra machine-readable data for some 409s, e.g. `costLineIds`, `purchaseOrderNumber`) are optional.
The UI translates `code` and the field codes; it never shows `message` to users.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input. `fields` maps field → field code |
| 401 | `UNAUTHENTICATED` | No / expired session |
| 403 | `FORBIDDEN` | Not allowed (e.g. editing another partner's hours) |
| 404 | `NOT_FOUND` | Unknown id |
| 409 | `INVALID_STATUS_TRANSITION` | e.g. move/cancel a cancelled gig, uncancel a sold gig |
| 409 | `GIG_DELETED` | Changing a deleted gig (except restore) |
| 409 | `COST_NOT_PAYABLE` | Paying a `FUEL` line |
| 409 | `BUDGET_NOT_EMPTY` | Copy budget into a year that already has budget numbers |
| 409 | `CLIENT_IN_USE` | Deleting a client that gigs/offers link to |
| 409 | `ALREADY_CONVERTED` | Converting an offer that already has a gig |
| 409 | `CANNOT_REMOVE_SELF` / `LAST_PARTNER` | Removing own partner status / the last active partner |
| 409 | `COST_LINE_ON_PURCHASE_ORDER` | Changing person/amount/paid state of, or deleting, a cost line on an open/paid PO; cancelling/deleting a gig with lines on an open PO |
| 409 | `PERSON_IS_PARTNER` | Freelancer link of an active partner (partners have no freelancer link) |
| 409 | `COST_LINE_NOT_ELIGIBLE` | Creating a PO with a fee that is not eligible (BR-114); `details.costLineIds` |
| 429 | `RATE_LIMITED` | Public offer and freelancer endpoints: > 60 requests/min/IP (`Retry-After` header) |
| 413 | `FILE_TOO_LARGE` | Upload too large (attachments > 20 MB; reference photos > 10 MB) |
| 415 | `UNSUPPORTED_FILE_TYPE` | Wrong type (attachments: PDF/DOCX/PNG/JPG; reference photos: PNG/JPG/WebP) |

**Field codes:** `REQUIRED`, `INVALID_DATE`, `END_BEFORE_START`, `NEGATIVE_AMOUNT`, `INVALID_VALUE`,
`DESCRIPTION_REQUIRED`, `INVALID_HOURS`, `DUPLICATE`, `TOO_LONG` (strings > 500 chars; notes/description > 5000),
`UNKNOWN_REFERENCE` (id that doesn't exist), `NOT_EDITABLE` (e.g. dates in PATCH gig).

### Warning format (non-blocking, returned alongside success)
```json
{ "code": "PERSON_DOUBLE_BOOKED", "personId": "…", "otherGigId": "…", "otherGigStartDate": "2026-05-01", "otherGigLineupName": "…" }
```
Double booking (BR-022): only **musician-role** lines count, on both sides. Warn when a person on a musician-role line
also has a musician-role line on another non-cancelled, non-deleted gig whose date range overlaps (`endDate` null = one day).
Internal roles (OFFICE, SALES, PRODUCTION) and expenses never warn.

---

## Shared objects

### Partner
```json
{ "id": "…", "personId": "…", "name": "Partner A", "email": "a@example.com", "language": "fi", "selectedYear": 2026 }
```
`name` comes from the linked Person. `selectedYear` defaults to the current year.

### Person
```json
{ "id": "…", "name": "Person 1", "active": true }
```

### GigSummary
```json
{
  "id": "…", "startDate": "2026-05-01", "endDate": null, "year": 2026,
  "status": "SOLD", "played": false,
  "lineupTemplateId": "…", "lineupName": "Template A",  // lineupTemplateId: null for a custom lineup "venue": "Venue X",
  "technicalSetup": "SET_A", "logistics": "OWN_VAN", "houseTechnician": false, "sellerId": "…", "producerId": "…",
  "priceCents": 100000, "additionalSalesCents": 0, "additionalSalesDescription": null,
  "notes": null,
  "totalPriceCents": 100000, "budgetedCostsCents": 70000, "actualCostsCents": 0,
  "marginBudgetCents": 30000, "marginActualCents": 100000,
  "marginBudgetPct": 30.0, "marginActualPct": 100.0,
  "notFullyStaffed": true, "deletedAt": null,
  "createdAt": "…", "updatedAt": "…"
}
```
- `played` = `status == "SOLD"` and `startDate` < today (BR-010).
- Economics per BR-001…BR-006: `budgetedCostsCents` = Σ line `budgetedCents`; `actualCostsCents` = Σ `actualCents` of paid lines.
- `notFullyStaffed` (BR-023): some musician-role line has `personId = null`.

### GigDetail
`GigSummary` + `"costLines": [CostLine]` (ordered by creation time, then id; lines created together keep their creation order) + `"attachments": [Attachment]` (non-deleted, newest first).

### CostLine
```json
{
  "id": "…", "gigId": "…", "type": "BASS", "personId": null, "description": null,
  "budgetedCents": 30000,
  "joinsLoadIn": true, "loadInDeductionAppliedCents": null,
  "actualCents": null, "paidAt": null, "paidBy": null
}
```
- `type`: one of the CostType codes (`domain-model.md`).
- `joinsLoadIn`: boolean for musician roles, `null` for internal roles and expenses.
- Paid ⇔ `paidAt != null`.

### Attachment
```json
{ "id": "…", "gigId": "…", "filename": "contract.pdf", "contentType": "application/pdf", "sizeBytes": 12345, "uploadedBy": "…", "uploadedAt": "…" }
```

### GigEvent
```json
{ "id": "…", "gigId": "…", "type": "UPDATED", "partnerId": "…", "at": "…", "reason": null, "details": { } }
```
`details` by type:
| Type | details |
|---|---|
| `CREATED` | `{}` |
| `UPDATED` | `{ "changes": [{ "field": "venue", "from": "Venue X", "to": "Venue Y" }], "movedCostLineIds": [] }` |
| `MOVED` | `{ "from": { "startDate", "endDate" }, "to": { "startDate", "endDate" } }` |
| `CANCELLED`, `UNCANCELLED`, `DELETED`, `RESTORED` | `{}` (reason in `reason`) |
| `COST_ADDED`, `COST_REMOVED` | `{ "costLineId", "type", "personId", "budgetedCents" }` |
| `COST_UPDATED` | `{ "costLineId", "type", "changes": [{ "field", "from", "to" }] }` (incl. `joinsLoadIn`, `budgetedCents` from the switch) |
| `COST_PAID` | `{ "costLineId", "type", "actualCents" }` |
| `COST_UNPAID` | `{ "costLineId", "type", "previousActualCents" }` |
| `ATTACHMENT_ADDED`, `ATTACHMENT_REMOVED` | `{ "attachmentId", "filename" }` |

### Task
```json
{ "id": "…", "title": "…", "description": null, "dueDate": "2026-06-01", "ownerId": "…", "status": "OPEN", "completedAt": null, "overdue": false }
```
`overdue` = `status == "OPEN"` and `dueDate` < today.

### HourEntry
```json
{ "id": "…", "partnerId": "…", "date": "2026-03-02", "comment": "…", "hours": 1.5 }
```

### BudgetRow
```json
{
  "categoryId": "…", "year": 2026,
  "budgetExpenseCents": 0, "budgetIncomeCents": 0,
  "actualExpenseCents": 0, "actualIncomeCents": 0,
  "varianceExpenseCents": 0, "varianceIncomeCents": 0
}
```
Variance = budget − actual (BR-060). Inactive categories are excluded from rows and totals; `PUT` on an inactive category → 404.

---

## Auth & me (UC-001)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/auth/google/start` | — | 302 to Google |
| `GET /api/auth/google/callback` | Google params | Valid → session cookie + 302 to `{FRONTEND_URL}/`. Wrong domain → 302 `{FRONTEND_URL}/login?error=WRONG_DOMAIN`. Not a partner → `…?error=NOT_A_PARTNER`. Failure → `…?error=SIGN_IN_FAILED` |
| `POST /api/auth/dev-login` | `{ "email" }` | 200 `Partner`. Missing/blank email → 400 `email: REQUIRED`. **Exists only when `DEV_LOGIN_ENABLED=true`** in `.env`; otherwise 404. Email must be a registered partner (else 403) |
| `POST /api/auth/logout` | — | 204, cookie cleared |
| `GET /api/me` | — | 200 `Partner` |
| `PATCH /api/me` | `{ "language"?: "fi"\|"en", "selectedYear"?: int }` | 200 `Partner`. `selectedYear` integer 2000–2100, else 400 `INVALID_VALUE` |

Session lifetime: 30 days sliding.

## Reference data

| Method & path | Response |
|---|---|
| `GET /api/reference` | 200 below |

```json
{
  "partners": [Partner],
  "lineupTemplates": [{ "id": "…", "name": "Template A", "roles": [{ "role": "VOC", "defaultFeeCents": 30000 }] }],  // roles are musician roles only, in template order
  "settings": { "officeDefaultCents": 0, "salesDefaultCents": 0, "productionDefaultCents": 0, "loadInDeductionCents": 0 },
  "costTypes": { "musicianRoles": ["VOC", "…"], "internalRoles": ["OFFICE", "SALES", "PRODUCTION"], "expenseCategories": ["FUEL", "…"] },
  "technicalSetups": ["HOUSE_TECH", "SET_A", "SET_B", "SET_C"],
  "logistics": ["OWN_VAN", "RENTAL_VAN", "TAXI", "OTHER"],
  "budgetCategories": [{ "id": "…", "name": "Category A" }]  // active rows only, in sortOrder
}
```

## Year page (UC-022)

`GET /api/years/{year}` → 200
```json
{
  "year": 2026,
  "gigs": { "gigCount": 0, "cancelledCount": 0, "soldGigsSumCents": 0, "budgetedCostsCents": 0, "actualCostsCents": 0, "marginBudgetCents": 0, "marginActualCents": 0 },
  "hours": { "partners": [{ "partnerId": "…", "total": 0 }], "grandTotal": 0 },
  "budget": { "budgetExpenseCents": 0, "budgetIncomeCents": 0, "actualExpenseCents": 0, "actualIncomeCents": 0 },
  "yearResultCents": 0,
  "upcomingGigs": [GigSummary]
}
```
- `gigCount` = non-deleted SOLD gigs of the year; `cancelledCount` = non-deleted CANCELLED.
- `soldGigsSumCents` = Σ `totalPriceCents` of all non-deleted gigs of the year, incl. cancelled (BR-082). Gig costs and margins use the same set.
- `yearResultCents` = soldGigsSum − actualCosts + budget.actualIncome − budget.actualExpense (BR-063).
- `upcomingGigs` = next 5 non-deleted SOLD gigs with `startDate` ≥ today, regardless of `year`.

## Gigs (UC-002…UC-004, UC-007, UC-009, UC-010, UC-012, UC-013, UC-025)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/gigs` | query below | 200 `{ "gigs": [GigSummary], "yearSummary": {…} }` |
| `POST /api/gigs` | GigCreate | 201 `GigDetail` |
| `GET /api/gigs/{id}` | — | 200 `GigDetail` (also for deleted gigs, read-only) |
| `PATCH /api/gigs/{id}` | GigUpdate | 200 `{ "gig": GigDetail, "movedCostLineIds": [] }` |
| `POST /api/gigs/{id}/move` | `{ "startDate", "endDate"?: date\|null, "reason"?: string }` | 200 `{ "gig": GigDetail, "warnings": [Warning] }`; 409 if CANCELLED |
| `POST /api/gigs/{id}/cancel` | `{ "reason" }` | 200 `GigDetail`; 409 if not SOLD |
| `POST /api/gigs/{id}/uncancel` | `{ "reason" }` | 200 `GigDetail`; 409 if not CANCELLED |
| `POST /api/gigs/{id}/delete` | `{ "reason" }` | 204 (soft delete) |
| `POST /api/gigs/{id}/restore` | — | 200 `GigDetail`; 409 if not deleted |
| `GET /api/gigs/{id}/history` | — | 200 `[GigEvent]` newest first |

**`GET /api/gigs` query:** `year` (required), `status` (`SOLD` default \| `CANCELLED` \| `ALL`),
`when` (`all` default \| `upcoming` \| `past`), `sellerId`, `producerId`, `notFullyStaffed=true`,
`q` (case-insensitive substring of venue, lineupName, notes), `deleted=true` (only deleted gigs; the status filter still applies, so the deleted view sends `status=ALL`).
Sorted by `startDate` ascending.
`yearSummary` = the `gigs` object of `GET /api/years/{year}` — it ignores all filters except `year`.

**GigCreate**
```json
{
  "startDate": "2026-05-01", "endDate": null,
  "lineupTemplateId": "…", "lineupName": null,
  "venue": "Venue X", "technicalSetup": null, "logistics": null, "houseTechnician": false,
  "sellerId": "…", "producerId": "…",
  "priceCents": 100000, "additionalSalesCents": 0, "additionalSalesDescription": null,
  "notes": null
}
```
- Required: `startDate`, `venue`, `sellerId`, `producerId`, `priceCents`, and either `lineupTemplateId` or `lineupName` (custom).
- `technicalSetup`: one of `HOUSE_TECH | SET_A | SET_B | SET_C` or `null`; `logistics`: one of `OWN_VAN | RENTAL_VAN | TAXI | OTHER` or `null`; `houseTechnician`: boolean (default false). Invalid value → 400 `INVALID_VALUE`.
- With a template and no `lineupName`, `lineupName` = template name.
- Creates cost lines per BR-020 / BR-021 using current seeded settings; logs `CREATED`.

**GigUpdate** (all optional): `lineupName`, `venue`, `technicalSetup`, `logistics`, `houseTechnician`, `sellerId`, `producerId`,
`priceCents`, `additionalSalesCents`, `additionalSalesDescription`, `notes`.
`startDate` / `endDate` → 400 `NOT_EDITABLE` (use move). Allowed on CANCELLED gigs.
Seller/producer change applies BR-027; moved line ids are returned and logged in `UPDATED.details.movedCostLineIds` (no separate cost events). Logs one `UPDATED` with all changed fields.

## Cost lines (UC-005)

All mutations return 200 `{ "gig": GigDetail, "warnings": [Warning] }` (204 never used here) and log an event.

| Method & path | Request | Notes |
|---|---|---|
| `POST /api/gigs/{id}/cost-lines` | `{ "type", "personId"?, "description"?, "budgetedCents" }` | Musician roles get `joinsLoadIn: true`. `OTHER`/`OTHER_ROLE` need `description`. Warns on double booking. `COST_ADDED` |
| `PATCH /api/cost-lines/{id}` | `{ "personId"?: id\|null, "description"?, "budgetedCents"?, "joinsLoadIn"? }` | `type` not editable (400 `type: NOT_EDITABLE`). If both `budgetedCents` and `joinsLoadIn` are sent, budget is applied first, then the switch (BR-026). `joinsLoadIn` on non-musician lines → 400 `INVALID_VALUE`. Warns on double booking when `personId` changes. `COST_UPDATED` |
| `DELETE /api/cost-lines/{id}` | — | Returns 200 with the updated gig. `COST_REMOVED` |
| `POST /api/cost-lines/{id}/pay` | `{ "actualCents"? }` | Default = `budgetedCents`. Sets `paidAt` = now, `paidBy` = me. Already paid → updates the amount only (original `paidAt`/`paidBy` kept; a new `COST_PAID` event records who changed it). FUEL → 409. `COST_PAID` |
| `POST /api/cost-lines/{id}/unpay` | — | Clears actual/paidAt/paidBy. `COST_UNPAID` |

**Load-in switch (BR-026):** `joinsLoadIn: false` → `budgetedCents = max(budgetedCents − settings.loadInDeductionCents, 0)`,
`loadInDeductionAppliedCents` = amount actually deducted. `joinsLoadIn: true` → `budgetedCents += loadInDeductionAppliedCents`, which is then set to `null`. Setting the same value again is a no-op.

## Attachments (UC-008)

| Method & path | Request | Response |
|---|---|---|
| `POST /api/gigs/{id}/attachments` | multipart, field `file` | 201 `Attachment`; 413 / 415; missing file → 400 `file: REQUIRED`. Type is detected from file content. `ATTACHMENT_ADDED` |
| `GET /api/attachments/{id}/download` | — | 200 file with `Content-Type` and `Content-Disposition` (inline for PDF/images, attachment for DOCX) |
| `DELETE /api/attachments/{id}` | — | 204 soft delete. `ATTACHMENT_REMOVED` |

Allowed: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`. Max 20 MB.

## People (UC-014)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/people` | `?active=true` (default) \| `false` \| `all` | 200 `[Person]` sorted by name |
| `POST /api/people` | `{ "name" }` | 201 `{ "person": Person, "warnings": [{ "code": "DUPLICATE_NAME" }] }` |
| `PATCH /api/people/{id}` | `{ "name"?, "active"? }` | 200 `{ "person": Person, "warnings": [] }` |
| `GET /api/people/{id}/cost-lines` | `?year=` | 200 `{ "lines": [{ "costLine": CostLine, "gigId", "gigStartDate", "gigLineupName", "gigVenue", "gigStatus" }], "totals": { "budgetedCents", "actualCents" } }` (non-deleted gigs of the year) |

Duplicate = case-insensitive exact name match with another person.

## Tasks (UC-017)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/tasks` | `?status=OPEN` (default) \| `DONE` \| `ALL`, `ownerId` | 200 `[Task]`: overdue first, then by `dueDate` (nulls last), then `createdAt` |
| `POST /api/tasks` | `{ "title", "ownerId"? (a Partner id; default me), "dueDate"?, "description"? }` | 201 `Task` |
| `PATCH /api/tasks/{id}` | any of `title`, `ownerId`, `dueDate`, `description`, `status` | 200 `Task`. `DONE` sets `completedAt`; `OPEN` clears it |
| `DELETE /api/tasks/{id}` | — | 204 |

## Hours (UC-018, UC-019)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/hours` | `?year=` (required), `partnerId` (default me) | 200 `[HourEntry]` newest first |
| `POST /api/hours` | `{ "date", "comment", "hours" }` | 201 `HourEntry` (partner = me) |
| `PATCH /api/hours/{id}` | any of `date`, `comment`, `hours` | 200; 403 if not own |
| `DELETE /api/hours/{id}` | — | 204; 403 if not own |
| `GET /api/hours/totals` | `?year=` | 200 `{ "year", "partners": [{ "partnerId", "months": [12 numbers, Jan…Dec], "total" }], "grandTotal" }` — every partner listed, zeros included |

`hours`: 0.25…24 in 0.25 steps, else `INVALID_HOURS`. `comment` required.

## Budget (UC-020)

| Method & path | Request | Response |
|---|---|---|
| `GET /api/budget` | `?year=` | 200 `{ "year", "rows": [BudgetRow], "totals": { "budgetExpenseCents", "budgetIncomeCents", "actualExpenseCents", "actualIncomeCents", "varianceExpenseCents", "varianceIncomeCents" } }` — one row per active category (zeros if none stored) |
| `PUT /api/budget/{year}/{categoryId}` | `{ "budgetExpenseCents", "budgetIncomeCents", "actualExpenseCents", "actualIncomeCents" }` | 200 `BudgetRow` (404 if the row is unknown or removed) |
| `POST /api/budget/{year}/copy-from-previous` | — | 200 same as GET. Copies budget fields from `year − 1`; actuals untouched. 409 `BUDGET_NOT_EMPTY` if any budget field in `year` is non-zero |

## Budget rows (UC-020)

| Method & path | Request | Response |
|---|---|---|
| `POST /api/budget-categories` | `{ "name" }` | 201 `{ "id", "name" }`. Empty → 400 `name: REQUIRED`; duplicate among active rows (case-insensitive, trimmed) → 400 `name: DUPLICATE`; > 500 chars → `TOO_LONG` |
| `PATCH /api/budget-categories/{id}` | `{ "name" }` | 200 `{ "id", "name" }`; same validation; 404 if unknown or removed |
| `DELETE /api/budget-categories/{id}` | — | 204. Soft delete (active = false); year values kept; excluded from `GET /api/budget`, totals and the year page |

`PUT /api/budget/{year}/{categoryId}` no longer has an actuals-only rule: all four fields accepted for every active row.

## Clients (UC-027)
| Method & path | Request | Response |
|---|---|---|
| `GET /api/clients` | `?q=` | 200 `[{ id, name, notes, gigCount, offerCount }]` sorted by name |
| `POST /api/clients` | `{ name, notes? }` | 201 `Client`; `name: REQUIRED / DUPLICATE / TOO_LONG` |
| `GET /api/clients/{id}` | — | 200 `{ client, gigs: [GigSummary], offers: [OfferSummary] }` (all years, newest first) |
| `PATCH /api/clients/{id}` | `{ name?, notes? }` | 200 `Client` |
| `DELETE /api/clients/{id}` | — | 204 soft; 409 `CLIENT_IN_USE` when any gig/offer links to it (including deleted ones, so restore never points to a deleted client) |

`Client = { id, name, notes }`. `GET /api/clients?q=` matches the name (substring, case-insensitive). A deleted client is `UNKNOWN_REFERENCE` for new links; existing gigs keep showing its `clientName`. Gig objects gain `clientId: id|null`, `clientName: string|null`, `offerId: id|null`; GigCreate/GigUpdate accept `clientId` (null clears; unknown → `UNKNOWN_REFERENCE`). `GET /api/gigs` `q` also matches client name.

## Offers (UC-028, UC-029, UC-031)
`OfferSummary = { id, clientId, clientName, eventName, eventDate, venue, city, priceCents|null, sellerId, source|null, eventType|null, disposition, status: OPEN|ACCEPTED|REJECTED, expired: bool, gigId|null, createdAt, updatedAt, deletedAt|null }`
`OfferDetail = OfferSummary + { lineup: string[], includesText, showReferences, sharePath: "/o/<token>", preview: PublicOffer }` — `preview` is exactly what `GET /api/public/offers/{token}` returns for this offer (incl. the references list and seller phone), so the internal page shows the same view as the customer.

| Method & path | Request | Response |
|---|---|---|
| `GET /api/offers` | `year` (required), `q`, `status`, `sellerId`, `disposition`, `eventType`, `source`, `deleted=true` | 200 `{ offers: [OfferSummary], summary: { openValueCents, winRatePct|null, wonCount, decidedCount } }` — summary ignores filters except year (BR-106) |
| `POST /api/offers` | `{ clientId, eventName, eventDate, venue, city?, lineup?, includesText?, showReferences?, priceCents?, sellerId?, source?, eventType? }` | 201 `OfferDetail` (defaults from settings; seller default me) |
| `GET /api/offers/{id}` | — | 200 `OfferDetail` |
| `PATCH /api/offers/{id}` | any editable field incl. `disposition` | 200 `OfferDetail`; logged |
| `POST /api/offers/{id}/regenerate-link` | — | 200 `OfferDetail` (new `sharePath`) |
| `POST /api/offers/{id}/convert` | — | 201 `{ offer: OfferDetail, gig: GigDetail }`; 409 `ALREADY_CONVERTED` |
| `POST /api/offers/{id}/delete` / `/restore` | — | 204 / 200 |
| `GET /api/offers/{id}/history` | — | 200 `[OfferEvent]` newest first |

- `status` filter: `OPEN` (incl. expired) · `ACCEPTED` · `REJECTED` · `EXPIRED` (open and past).
- Deleted offers: GET and history work; PATCH, regenerate-link, convert, delete → 409 `INVALID_STATUS_TRANSITION`; restore of a non-deleted offer → same.
- Create: omitted `includesText` → setting default; `null`/`""` → none. **Spotify (changed 2026-10-15):** the Spotify link is one fixed link in code for all offers; offers have no `spotifyUrl` field. `spotifyUrl` in POST/PATCH → 400 `VALIDATION_ERROR` with `fields.spotifyUrl = INVALID_VALUE`. Lineup items trimmed, blanks dropped, ≤ 100 items × 500 chars.
- `OfferEvent = { id, offerId, type, partnerId, at, details }`; details: `UPDATED {changes:[{field,from,to}]}`, `DISPOSITION_CHANGED {from,to}`, `CONVERTED {gigId}`, others `{}`.

## Public offer (UC-030) — no authentication
`GET /api/public/offers/{token}` → 200 `PublicOffer = { eventName, clientName, eventDate, venue, city|null, lineup: string[], includesText|null, spotifyUrl: string (always the fixed Instaglamour playlist link, constant in backend code), references: [{ id, quote: { fi, en|null }, author, imageUrl: string|null }] | null (active references in order; null when the offer hides references; `imageUrl` = `/api/public/offers/{token}/references/{id}/image?v=<imageVersion>`), seller: { name, email, phone|null } }` — nothing else. Unknown/regenerated/deleted → 404 `NOT_FOUND`. Response header `X-Robots-Tag: noindex`. This is the only `/api` route besides `/api/auth/*` reachable without a session.

## References (owner request 2026-10-07)
`Reference = { id, quoteFi, quoteEn|null, author, hasImage, imageVersion: string|null, sortOrder, active }` — `imageVersion` changes on every upload/remove (e.g. the upload timestamp); image URLs carry it as `?v=<imageVersion>` (servers ignore unknown query params) so replaced photos are never served from cache.
| Method & path | Request | Response |
|---|---|---|
| `GET /api/references` | — | 200 `[Reference]` in sort order (incl. inactive) |
| `POST /api/references` | `{ quoteFi, quoteEn?, author, active? }` | 201 `Reference` (appended last); `REQUIRED`/`TOO_LONG` (quote ≤ 5000, author ≤ 200) |
| `PATCH /api/references/{id}` | any of `quoteFi, quoteEn, author, active` | 200 `Reference` |
| `POST /api/references/reorder` | `{ ids: [id…] }` (exactly all ids) | 200 `[Reference]`; otherwise 400 `ids: INVALID_VALUE` |
| `PUT /api/references/{id}/image` | multipart `file` (PNG/JPG/WebP ≤ 10 MB) | 200 `Reference`; 413 `FILE_TOO_LARGE` / 415 `UNSUPPORTED_FILE_TYPE` (reference limits differ from attachments; the UI shows reference-specific texts) |
| `DELETE /api/references/{id}/image` | — | 200 `Reference` |
| `GET /api/references/{id}/image` | — (session) | 200 image |
| `DELETE /api/references/{id}` | — | 204 (hard delete incl. image file) |
| `GET /api/public/offers/{token}/references/{id}/image` | — (no session) | 200 image only if token valid, offer not deleted, `showReferences` true, reference active and has image; else 404 |

## Partner status (UC-032)
`Person` gains `partner: { id, email, active } | null` (null = never a partner). `Partner` (in `/api/me`, `/api/reference`) gains `active`; `/api/reference.partners` lists all partners incl. inactive (UI offers only active ones for new choices).
| Method & path | Request | Response |
|---|---|---|
| `PUT /api/people/{id}/partner` | `{ email }` | 200 `Person` — makes/keeps the person an active partner with this email. `email: REQUIRED / INVALID_VALUE` (not in allowed domain) `/ DUPLICATE` |
| `DELETE /api/people/{id}/partner` | — | 200 `Person` — deactivates; revokes all its sessions. 409 `CANNOT_REMOVE_SELF`, 409 `LAST_PARTNER`; 404 if not a partner |
`GET /api/people` gains `?partner=true|false` (`true` = active partner; `false` = never or removed; combines with `active`).
- DELETE on a person who is not an active partner → 404. Changing an active partner's email (PUT with a new email) ends that partner's other sessions (old Google account). Granting to an inactive person → 409 `INVALID_STATUS_TRANSITION`.
- The seed never reactivates or changes existing partners (insert-only), so a removal in the app is permanent until re-granted in the app.
- Convert offer → gig: if the offer's seller is no longer an active partner, the converting partner becomes seller and producer. Sign-in (Google and dev login) requires an **active** partner; an inactive partner's existing session → 401 on the next request.

## Purchase orders (UC-033, UC-034) — owner request 2026-10-16
**Shapes**
- `CostLine` gains `purchaseOrder: { id, number, status } | null` — the OPEN or PAID PO the line is on (cancelled POs don't count).
- `PurchaseOrderLine = { costLineId, gigId, gigStartDate, gigVenue, gigLineupName, type, description|null, amountCents }`
- `PurchaseOrder = { id, number, personId, personName, status: OPEN|PAID|CANCELLED, totalCents, createdAt, paidAt|null, paidBy|null, cancelledAt|null, cancelledBy|null, cancelReason|null, lines: [PurchaseOrderLine] }` (`paidBy`/`cancelledBy` = partner id)
- `PurchaseOrderEvent = { id, purchaseOrderId, number, type: CREATED|PAID|UNPAID|CANCELLED, partnerId|null (null = freelancer via link), at, details }`; details: `CANCELLED {reason}`, `PAID {totalCents}`, others `{}`.

**Partner endpoints (signed in)**
| Method & path | Request | Response |
|---|---|---|
| `GET /api/purchase-orders` | `year` (required unless `q`), `q` (substring of number or person name, case-insensitive; **when `q` is given, `year` is ignored and all years are searched**), `status` | 200 `{ purchaseOrders: [PurchaseOrder] }` newest first. Year = year of `createdAt`. |
| `GET /api/purchase-orders/{id}` | — | 200 `PurchaseOrder` |
| `POST /api/purchase-orders/{id}/pay` | — | 200 `PurchaseOrder` — OPEN → PAID; every line's cost line: `actualCents` = line `amountCents`, `paidAt` = now, `paidBy` = me, GigEvent `COST_PAID` with `details.purchaseOrderNumber`. Not OPEN → 409 `INVALID_STATUS_TRANSITION`. |
| `POST /api/purchase-orders/{id}/unpay` | — | 200 `PurchaseOrder` — PAID → OPEN; lines unpaid, GigEvent `COST_UNPAID` with `details.purchaseOrderNumber`. Not PAID → 409 `INVALID_STATUS_TRANSITION`. |
| `POST /api/purchase-orders/{id}/cancel` | `{ reason }` (required, ≤ 500) | 200 `PurchaseOrder` — OPEN → CANCELLED. Not OPEN → 409 `INVALID_STATUS_TRANSITION`. |
| `GET /api/purchase-orders/{id}/history` | — | 200 `[PurchaseOrderEvent]` newest first |
| `GET /api/purchase-orders/events` | `limit` (1…200, default 50) | 200 `[PurchaseOrderEvent]` newest first, all POs |
| `GET /api/people/{id}/freelancer-link` | — | 200 `{ sharePath: "/f/<token>" }` — every person always has a token (backfilled by migration, created with the person). Unknown person → 404. Inactive person → 200 (link exists but the public page returns 404 until the person is active again). **Active partner → 409 `PERSON_IS_PARTNER`** (same for regenerate). |
| `POST /api/people/{id}/freelancer-link/regenerate` | — | 200 `{ sharePath }` (old token → 404) |

**Lock (BR-118):** while a cost line has `purchaseOrder != null`: `PATCH /api/cost-lines/{id}` with `personId`, `budgetedCents` or `joinsLoadIn`, `DELETE`, `/pay`, `/unpay` → 409 `COST_LINE_ON_PURCHASE_ORDER` (`details.purchaseOrderNumber`); `description` stays editable. Gig cancel / delete while any line is on an **OPEN** PO → same 409.

**Public endpoints (no session, `X-Robots-Tag: noindex`, rate limit 60/min/IP shared with public offers → 429 `RATE_LIMITED`)**
| Method & path | Request | Response |
|---|---|---|
| `GET /api/public/freelancers/{token}` | — | 200 `FreelancerView` |
| `POST /api/public/freelancers/{token}/purchase-orders` | `{ costLineIds: [id] }` (1…200, unique; else 400 `costLineIds: INVALID_VALUE`) | 201 `PublicPurchaseOrder`. Any id not eligible (BR-114) or not this person's → 409 `COST_LINE_NOT_ELIGIBLE` with `details.costLineIds` (the offending ids); nothing created. |

- `FreelancerView = { name, lines: [FreelancerLine], purchaseOrders: [PublicPurchaseOrder] }` — lines newest gig first; POs newest first (incl. cancelled).
- `FreelancerLine = { costLineId, gigStartDate, gigEndDate|null, venue, type, description|null, amountCents, state: SELECTABLE|UPCOMING|ON_PO|PAID, purchaseOrderNumber|null }` — only the person's lines with `budgetedCents > 0` on non-deleted SOLD gigs (cancelled gigs are not shown). `amountCents` = PO snapshot when ON_PO, actual when PAID, else budgeted. `UPCOMING` = gig not played yet. A line paid through a PO is `PAID` with its `purchaseOrderNumber`.
- `PublicPurchaseOrder = { number, status, totalCents, createdAt, paidAt|null, lines: [{ gigStartDate, venue, type, description|null, amountCents }] }` — no ids, partner names or cancel reason.
- Unknown/regenerated token, inactive person or **active partner** (`partner.active`) → 404 `NOT_FOUND` (GET and POST).
- Seller/producer change (BR-027) does not move SALES/PRODUCTION lines that are on an OPEN/PAID PO.
- `FUEL` lines are never shown to the freelancer and never eligible (they can't be paid). Unmarking a PAID PO also unpays lines on gigs cancelled/deleted after payment.
- Concurrency: creation locks the person's lines (e.g. `pg_advisory_xact_lock` on person id) so two requests can't put a line on two POs. Number per BR-116 (global DB sequence).

## Data import (UC-035)
| Method & path | Request | Response |
|---|---|---|
| `POST /api/import` | Query `dryRun=true\|false` (default false), `filename` (optional, ≤ 200, for the log). Body: the seed JSON document (`Content-Type: application/json`, ≤ 10 MB) | 200 `{ dryRun, summary: ImportSummary }` |
| `GET /api/import/runs` | — | 200 `[ImportRun]` newest first, last 50 |

- `ImportSummary = { partners, people, lineupTemplates, settings, budgetCategories, clients, gigs, offers, references, tasks, hours, budget }`, each `{ created: int, updated: int, skipped: int }` (updated = existing item changed per the seed README re-run rules, e.g. person `active`, template roles, settings).
- `ImportRun = { id, partnerId, at, filename|null, summary: ImportSummary }` — only real imports (not dry runs).
- Dry run executes the full load inside a transaction and rolls it back, so the counts are exact.
- Invalid document → 400 `VALIDATION_ERROR` with `details.errors: string[]` (every problem, path-prefixed, same texts as the seed CLI). Not JSON → 400 `VALIDATION_ERROR` `details.errors: ["not valid JSON"]`. Partner email outside `AUTH_ALLOWED_DOMAIN` → listed in `details.errors`. Any reference `image` → listed in `details.errors` ("image paths are not allowed in an import"). > 10 MB → 413 `FILE_TOO_LARGE`.
- Offers in the seed/import may carry `createdAt` (ISO 8601 date-time with offset, not in the future): on insert the offer's `createdAt` and `updatedAt`, and the time of its creation history event, are set to it (default: now). Existing offers are never changed by a re-import.
- Concurrent imports are serialized (advisory lock); the seed loader's rules (BR-120) apply unchanged.

## People: roles and gig count (owner request 2026-10-19)
- `Person` gains `roles: MusicianRole[]` (the roles the person can play; codes from `MUSICIAN_ROLES`, unique, in `MUSICIAN_ROLES` order) and `gigCount: int` = number of distinct non-deleted gigs with status SOLD and start date before today (played, all years) where the person has at least one **musician-role** cost line. Both are in every `Person` response (`GET /api/people`, POST/PATCH responses, partner endpoints).
- `PATCH /api/people/{id}` accepts `roles: MusicianRole[]` (replaces the list; duplicates or non-musician codes → 400 `roles: INVALID_VALUE`). Logged like other person changes (if people have history; otherwise no log).
- `GET /api/people` gains `?role=<MusicianRole>` (people whose `roles` include it; combines with `active` and `partner`; unknown code → 400 `INVALID_VALUE`).
- Migration backfill: for every person, `roles` = distinct musician-role types of their cost lines on non-deleted gigs (any status, any year).
- Seed/import: `people[]` and `partners[]` accept optional `roles: MusicianRole[]`. On (re)load a person's roles are set from the file **only when the person has no roles yet** (never overwrites app edits); counted as `updated`.

## Offer statistics (owner request 2026-10-20, like the offer prototype's KPI cards)
`GET /api/offers/stats?year=<selected year>` → 200 `OfferStats`. All non-deleted offers, **all years** (not only the selected one). "Value" = `priceCents` (offers without a price count in counts but add 0 to values and are left out of averages). "Open" = disposition PENDING and event date ≥ today (not expired). Months/years of `createdAt` in Europe/Helsinki.
```
OfferStats = {
  createdByMonth: [{ month: "YYYY-MM", count, valueCents }],        // the 6 most recent COMPLETED months, oldest first
  averageByCreatedYear: [{ year, averageCents|null, count }],       // year-5 … year (6 items), average over priced offers
  byEventYear: [{ year, count, valueCents }],                       // year-3 … year+2 (6 items), by event date, all statuses
  openValueByEventYear: [{ year, valueCents, count }],              // year … year+3 (4 items), open offers by event date
  openByEventType: [{ eventType|null, count, valueCents }],         // all open offers, sorted by value desc (null = no type)
  winRate: { pct|null, won, decided,                                // all years; decided = disposition not PENDING and not CANCELLED
             byEventType: [{ eventType, pct|null, won, decided }] } // one item per EVENT_TYPES value, in that order
}
```
`year` missing/invalid → 400 `INVALID_VALUE`. The existing `GET /api/offers` `summary` stays (unused by the new cards).

## Change log
- 2026-10-20 – GET /api/offers/stats (offer KPI cards) (PM)
- 2026-10-20 – Seed/import: optional offer `createdAt` (PM)
- 2026-10-19 – Person.roles, Person.gigCount, ?role filter, roles in seed/import (PM)
- 2026-10-19 – Data import (UC-035): POST /api/import (dry run), GET /api/import/runs (PM)
- 2026-10-18 – Active partners have no freelancer link: public 404, link endpoints 409 `PERSON_IS_PARTNER` (PM)
- 2026-10-16 – Error format: optional `details`; freelancer-link for unknown/inactive person (PM)
- 2026-10-16 – Purchase orders (UC-033, UC-034): freelancer link, public freelancer view + create PO, PO list/search/pay/unpay/cancel/log, CostLine.purchaseOrder, COST_LINE_ON_PURCHASE_ORDER, COST_LINE_NOT_ELIGIBLE (PM)
- 2026-10-14 – Partner status clarifications (404, ?partner, email change, inactive person, seed insert-only, convert with removed seller) (PM)
- 2026-10-14 – Partner status managed in the app (UC-032): person.partner, PUT/DELETE /api/people/{id}/partner, partner.active, CANNOT_REMOVE_SELF, LAST_PARTNER (PM)
- 2026-10-07 – Reference.imageVersion + `?v=` cache busting; reorder validation; reference upload error texts (PM)
- 2026-10-15 – Spotify link is a fixed constant in code: `spotifyUrl` removed from offer create/patch/detail; PublicOffer.spotifyUrl always the constant (PM)
- 2026-10-07 – References entity + endpoints; PublicOffer.references becomes a list with photos (owner request, breaking for references) (PM)
- 2026-10-07 – Offers clarifications from TASK-016: RATE_LIMITED, status filter values, deleted-offer behaviour, create defaults/validation, OfferEvent shape (PM)
- 2026-10-07 – OfferDetail.preview (= PublicOffer); PublicOffer nullability and references as plain text (PM)
- 2026-10-07 – Clients, Offers, public offer endpoint; gig clientId/offerId (owner request) (PM)
- 2026-10-05 – Budget rows managed via /api/budget-categories; reference budgetCategories = {id, name}; no `budgeted` flag (owner request, breaking) (PM)
- 2026-10-05 – technicalSetup is a single value or null; new `logistics` and `houseTechnician`; reference adds `logistics` (owner request, breaking change for technicalSetup) (PM)
- 2026-10-03 – First version (PM)
- 2026-10-03 – Double booking for musician-role lines only (owner decision, behaviour change) (PM)
- 2026-10-03 – Clarifications after TASK-003: inactive budget categories, `year` = 4-digit integer in queries, unknown filter ids return empty lists (PM)
- 2026-10-03 – Clarifications after TASK-002: no-op requests, check order, deleted view, re-pay, NOT_EDITABLE type, upload codes (PM)
- 2026-10-03 – Clarifications after wave 1, no behaviour changes: Helsinki "today", FRONTEND_URL redirects, dev-login and selectedYear validation, nullable lineupTemplateId, template roles, active budget categories, cost line order (PM)
