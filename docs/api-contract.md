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
| 409 | `LINEUP_IN_USE` | Deleting a lineup that gigs link to |
| 409 | `ALREADY_CONVERTED` | Converting an offer that already has a gig |
| 409 | `CANNOT_REMOVE_SELF` / `LAST_PARTNER` | Removing own partner status / the last active partner |
| 409 | `COST_LINE_ON_PURCHASE_ORDER` | Changing person/amount/paid state of, or deleting, a cost line on an open/paid PO; cancelling/deleting a gig with lines on an open PO |
| 409 | `PERSON_IS_PARTNER` | Freelancer link of an active partner (partners have no freelancer link) |
| 409 | `OFFER_NOT_CONVERTIBLE` | Converting (or getting the gig draft of) an offer that is not ACCEPTED or whose event date is before today (BR-109) |
| 409 | `COST_LINE_NOT_ELIGIBLE` | Creating a PO with a fee that is not eligible (BR-114); `details.costLineIds` |
| 429 | `RATE_LIMITED` | Public offer and freelancer endpoints: > 60 requests/min/IP (`Retry-After` header) |
| 413 | `FILE_TOO_LARGE` | Upload too large (attachments > 20 MB; reference photos > 10 MB) |
| 415 | `UNSUPPORTED_FILE_TYPE` | Wrong type (attachments: PDF/DOCX/PNG/JPG; reference photos: PNG/JPG/WebP) |

**Field codes:** `REQUIRED`, `INVALID_DATE`, `END_BEFORE_START`, `NEGATIVE_AMOUNT`, `INVALID_VALUE`,
`DESCRIPTION_REQUIRED`, `INVALID_HOURS`, `DUPLICATE`, `TOO_LONG` (strings > 500 chars; notes/description > 5000),
`UNKNOWN_REFERENCE` (id that doesn't exist), `NOT_EDITABLE` (e.g. dates in PATCH gig), `NOT_PARTNER` (sales/production line person is not an active partner; checked only when the person changes).

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
| `GET /api/offers` | `year` (optional since 2026-10-30; without it all years, newest created first), `q`, `status`, `sellerId`, `disposition`, `eventType`, `source`, `deleted=true` | 200 `{ offers: [OfferSummary], summary: { openValueCents, winRatePct|null, wonCount, decidedCount } }` — summary ignores filters except year (BR-106) |
| `POST /api/offers` | `{ clientId, eventName, eventDate, venue, city?, lineup?, includesText?, showReferences?, priceCents?, sellerId?, source?, eventType? }` | 201 `OfferDetail` (defaults from settings; seller default me) |
| `GET /api/offers/{id}` | — | 200 `OfferDetail` |
| `PATCH /api/offers/{id}` | any editable field incl. `disposition` | 200 `OfferDetail`; logged |
| `POST /api/offers/{id}/regenerate-link` | — | 200 `OfferDetail` (new `sharePath`) |
| `GET /api/offers/{id}/gig-draft` | — | 200 `GigCreate` (incl. `clientId`) prefilled per BR-105 (incl. the inactive-seller fallback; `clientId: null` if the offer's client is deleted). Already converted → 409 `ALREADY_CONVERTED`; deleted → 409 `INVALID_STATUS_TRANSITION`; not WON or event date < today → 409 `OFFER_NOT_CONVERTIBLE` (BR-109) |
| `POST /api/offers/{id}/convert` | optional `GigCreate` (incl. `clientId`) — **changed 2026-10-20** | 201 `{ offer: OfferDetail, gig: GigDetail }`; 409 `ALREADY_CONVERTED`, 409 `OFFER_NOT_CONVERTIBLE` (BR-109, checked before the body). With a body: the gig is created from the body (same validation and errors as `POST /api/gigs`), then linked and the offer set WON; without a body: BR-105 defaults (unchanged). |
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
| `GET /api/purchase-orders` | `year` (optional since 2026-10-30), `q` (substring of number or person name, case-insensitive; **when `q` is given, `year` is ignored and all years are searched**), `status` | 200 `{ purchaseOrders: [PurchaseOrder] }` newest first. Year = year of `createdAt`. |
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
- Seed/import `converted: true` is exempt from BR-109 (historical data).
- Concurrent imports are serialized (advisory lock); the seed loader's rules (BR-120) apply unchanged.

## People: roles and gig count (owner request 2026-10-19)
- `Person` gains `roles: MusicianRole[]` (the roles the person can play; codes from `MUSICIAN_ROLES`, unique, in `MUSICIAN_ROLES` order) and `gigCount: int` = number of distinct non-deleted gigs with status SOLD and start date before today (played, all years) where the person has at least one **musician-role** cost line. Both are in every `Person` response (`GET /api/people`, POST/PATCH responses, partner endpoints).
- `PATCH /api/people/{id}` accepts `roles: MusicianRole[]` (replaces the list; duplicates or non-musician codes → 400 `roles: INVALID_VALUE`). Logged like other person changes (if people have history; otherwise no log).
- `GET /api/people` gains `?role=<MusicianRole>` (people whose `roles` include it; combines with `active` and `partner`; unknown code → 400 `INVALID_VALUE`).
- Migration backfill: for every person, `roles` = distinct musician-role types of their cost lines on non-deleted gigs (any status, any year).
- Seed/import: `people[]` and `partners[]` accept optional `roles: MusicianRole[]`. On (re)load a person's roles are set from the file **only when the person has no roles yet** (never overwrites app edits); counted as `updated`.

## Offer statistics (owner request 2026-10-20, like the offer prototype's KPI cards)
`GET /api/offers/stats?year=<optional, default current year>` → 200 `OfferStats`. All non-deleted offers, **all years** (not only the selected one). "Value" = `priceCents` (offers without a price count in counts but add 0 to values and are left out of averages). "Open" = disposition PENDING and event date ≥ today (not expired). Months/years of `createdAt` in Europe/Helsinki.
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
Details: `averageByCreatedYear[].count` = priced offers in the average, `averageCents` rounded to a cent; `openByEventType` lists only types with open offers (may be `[]`), ties by count, null last; `createdByMonth` counts back from today (ignores `year`); win `pct` 1 decimal, untyped decided offers count only in the overall rate; open offers beyond year+3 are only in `openByEventType`.
`year` invalid → 400 `INVALID_VALUE` (missing = current year; ranges per "Year is no longer global"). The existing `GET /api/offers` `summary` stays (unused by the new cards).

## Rename Gig → Event (owner decision 2026-10-27, SaaS phase 1)
**Everything called "gig" in this document is now "event".** Behaviour is unchanged; only names change. Mapping (old → new):

| Area | Old | New |
|---|---|---|
| Paths | `/api/gigs…` (all sub-paths) | `/api/events…` |
| Paths | `GET /api/offers/{id}/gig-draft` | `GET /api/offers/{id}/event-draft` |
| Shapes | `GigSummary`, `GigDetail`, `GigCreate`, `GigUpdate` | `EventSummary`, `EventDetail`, `EventCreate`, `EventUpdate` |
| Shapes | `GigEvent` (history entry) | `EventHistoryEntry` |
| Fields | `gigId` (CostLine, Attachment, Offer, PurchaseOrderLine, …) | `eventId` |
| Fields | `gigStartDate`, `gigEndDate`, `gigVenue`, `gigLineupName`, `gigStatus` | `eventStartDate`, `eventEndDate`, `eventVenue`, `eventLineupName`, `eventStatus` |
| Fields | `Person.gigCount` | `Person.eventCount` |
| Fields | convert response `{ offer, gig }` | `{ offer, event }` |
| Fields | year page `gigs` object, `yearSummary` of the list | `events` |
| Errors | `GIG_DELETED` | `EVENT_DELETED` |
| Seed/import | top-level `gigs`, `ImportSummary.gigs` | `events` (the loader **also accepts `gigs`** as a legacy alias; both together → validation error) |
| Status enum | `SOLD`, `CANCELLED` | unchanged |

Also renamed by the same rule (TASK-032): year page `events.eventCount`, `events.soldEventsSumCents`, `upcomingEvents`; clients `gigCount` → `eventCount`, `GET /api/clients/{id}` → `{ client, events, offers }`; double-booking warning `otherEventId`, `otherEventStartDate`, `otherEventLineupName`; history entry `eventId`; PATCH/move responses `{ event, … }`; FreelancerLine / PO line `eventStartDate`, `eventEndDate`, `eventVenue`, `eventLineupName`, `eventStatus`; offer history `CONVERTED {eventId}`. `GET /api/events` returns `{ events: [EventSummary], yearSummary }` (`yearSummary` keeps its name). Stored history/import JSON keys are migrated too.
No compatibility aliases for old API paths (no external clients). The UI renames routes `/gigs…` → `/events…` and redirects old `/gigs…` URLs. Labels: FI **Tapahtumat / Tapahtuma**, EN **Events / Event**; "Muuta keikaksi" → **"Muuta tapahtumaksi" / "Convert to event"**; people column "Keikkoja" → **"Tapahtumia" / "Events"**.

## Role cleanup: Horn 1/2 and Technician removed (owner decision 2026-10-30)
- Musician roles **`HORN_1`, `HORN_2` and `TECHNICIAN` are removed** from `CostType` / `MUSICIAN_ROLES` and from `/api/reference.costTypes`. `MIX` is labelled FI **"Miksaus"**, EN **"Mixing"** (covers mixing and technician work).
- Migration converts existing data (cost lines, person `roles`, lineup template roles): `HORN_1` → `TRUMPET`; `TECHNICIAN` → `MIX`; `HORN_2` → `SAX` if the line's person has `SAX` but not `TROMBONE` in roles, `TROMBONE` if the person has `TROMBONE` but not `SAX`, otherwise `TROMBONE`. Person roles are de-duplicated and kept in `MUSICIAN_ROLES` order. Stored history details keep their old codes; the UI still labels them ("Horn 1", "Horn 2", "Teknikko") in history only.
- Purchase order lines (snapshots) are converted with the same rule (person = the PO's freelancer).
- Seed/import accept the old codes and convert them the same way (HORN_2 by the person's roles in the file, else `TROMBONE`).
- API requests with the removed codes → 400 `INVALID_VALUE`.

## Year is no longer global (owner decision 2026-10-30)
The year selector leaves the top bar. Pages that need a year have their **own year selector**: **Vuosi**, **Budjetti**, **Tunnit**, **Keikat** (default = current year; the chosen year is still remembered in `Me.selectedYear` and shared by these pages). Every other page shows **all years**.
- `GET /api/offers`: `year` becomes **optional**; without it all non-deleted offers (or `deleted=true`) are returned. The UI sends no year; default sort newest created first. `summary` follows BR-106 (all non-deleted offers in scope — that year or all years — ignoring other filters; unused by the UI). With a `year`, sort stays event date ascending.
- `GET /api/purchase-orders`: `year` **optional** (without it: all years, newest first).
- `GET /api/people/{id}/cost-lines`: `year` **optional** (without it: all years, newest gig first; totals over all).
- `GET /api/offers/stats`: `year` **optional**, default = current year in the organisation time zone (Europe/Helsinki). Series ranges change to **year−3 … year+2** (6 items) for `averageByCreatedYear`, `byEventYear` and `openValueByEventYear`. `createdByMonth` (6 completed months), `openByEventType` (all open offers) and `winRate` (all time) are unchanged. The UI shows each year card's big figure for the current year by default; clicking a bar selects another year.
- Endpoints that take a required `year` today for the four year pages keep it.

## Purchase orders created by partners (owner request 2026-10-31)
For exceptions, partners can create a PO for one person by hand.
- `GET /api/people/{id}/po-eligible-lines?eventId=` → 200 `[FreelancerLine-like rows: { costLineId, eventId, eventStartDate, eventVenue, eventLineupName, type, description|null, amountCents }]` — that person's lines with `budgetedCents > 0`, unpaid, not on an OPEN/PAID PO, on non-deleted **SOLD** events (played **or upcoming**; cancelled excluded; `FUEL` excluded). Optional `eventId` limits to one gig. Newest gig first.
- `POST /api/purchase-orders` `{ personId, costLineIds: [id] }` (1…200, unique) → 201 `PurchaseOrder`. Same numbering, snapshot amounts, locks and all-or-nothing rules as the freelancer link (BR-115/116/118), but the eligibility is the one above (no "played" requirement). Any id not eligible or not that person's → 409 `COST_LINE_NOT_ELIGIBLE` with `details.costLineIds`. Unknown person → 400 `personId: UNKNOWN_REFERENCE`.
- The `CREATED` PurchaseOrderEvent gets the creating partner's id (`partnerId`), so the log shows who created it (the freelancer-link path keeps `partnerId: null` = "Freelancer").
- The freelancer link keeps its played-only rule (BR-114).
- Details: allowed for inactive persons and partners too (exception tool); unknown/malformed person on GET → 404; unknown/malformed `eventId` → `[]`; `personId` missing → REQUIRED, non-string → INVALID_VALUE.

## Gig status labels and "Ready to be invoiced" (owner decision 2026-10-31)
- UI statuses: **Tuleva / Upcoming** (blue) = SOLD and not played; **Soitettu / Played** (green) = SOLD and played; **Peruttu / Cancelled** (red). API status codes unchanged (`SOLD`, `CANCELLED` + `played`).
- **Ready to be invoiced** is set **by hand** on the gig page.
  - `EventSummary`/`EventDetail` gain `readyForInvoiceAt: datetime|null` and `readyForInvoiceBy: partnerId|null`.
  - `POST /api/events/{id}/ready-for-invoice` → 200 `EventDetail`; sets now/me; history `READY_FOR_INVOICE`. Already set → 200 no-op. Cancelled or deleted gig → 409 `INVALID_STATUS_TRANSITION` / `EVENT_DELETED`.
  - `DELETE /api/events/{id}/ready-for-invoice` → 200 `EventDetail`; clears both fields; history `READY_FOR_INVOICE_CLEARED`. Not set → 200 no-op.
  - Allowed for upcoming and played SOLD gigs. Cancelling a gig keeps the values but the UI shows "–" for cancelled gigs.
- DELETE also works on cancelled gigs (to clear a leftover flag); deleted gig → 409 `EVENT_DELETED` for both methods (wins over cancelled). Not part of seed/import.
- Keikat list column **"Valmis laskutukseen / Ready to be invoiced"**: green box when `readyForInvoiceAt` is set (and not cancelled), else "–".

## Invoice status, prepayment and balance (owner decision 2026-10-31) — replaces the "Ready to be invoiced" flag
- `EventSummary`/`EventDetail` gain:
  - `invoiceStatus: "NONE" | "READY" | "PREPAYMENT_PAID" | "INVOICED" | "PAID"` — FI/EN labels: "–", "Valmis laskutukseen / Ready to be invoiced", "Ennakko maksettu / Prepayment paid", "Laskutettu / Invoiced", "Maksettu / Invoice paid".
  - `invoiceStatusAt: datetime|null`, `invoiceStatusBy: partnerId|null` (last change).
  - `prepaymentCents: int` (default 0, ≥ 0) and derived `balanceCents = totalPriceCents − prepaymentCents` (may be negative if prepayment exceeds the total; the UI warns).
- `EventUpdate` (PATCH) accepts `invoiceStatus` (any value → any value, set by hand) and `prepaymentCents` (integer ≥ 0, else 400 `INVALID_VALUE`). Changes are logged as normal `UPDATED` field changes (old → new) and set `invoiceStatusAt/By` when the status changes. Allowed on SOLD and CANCELLED gigs (cancellation fees can be invoiced); deleted → 409 `EVENT_DELETED`.
- Removed: `readyForInvoiceAt`, `readyForInvoiceBy` and `POST/DELETE /api/events/{id}/ready-for-invoice`. Migration: gigs with `ready_for_invoice_at` set get `invoiceStatus READY` with the same at/by; old history entries `READY_FOR_INVOICE[_CLEARED]` stay and keep their texts.
- `GET /api/events` gains filter `?invoiceStatus=` (repeatable) — the UI filters client-side anyway.
- Seed/import: optional `invoiceStatus` and `prepaymentCents` per gig (default NONE / 0).

## Invoice rows (owner decision 2026-10-31) — replaces gig invoice status and prepayment
- `InvoiceRow = { id, eventId, description, amountCents (> 0), status: "READY"|"SENT"|"PAID", statusAt, statusBy: partnerId|null, createdAt, createdBy }`. FI/EN status labels: "Valmis laskutukseen / Ready to be invoiced", "Lähetetty / Invoice sent", "Maksettu / Paid".
- `EventDetail` gains `invoiceRows: [InvoiceRow]` (creation order). `EventSummary`/`EventDetail` keep `balanceCents` = `totalPriceCents − Σ amountCents of PAID rows`, and gain `invoicedCents` (Σ SENT+PAID rows), `paidCents` (Σ PAID) and derived **`invoiceState`**:
  `NONE` (no rows) · `READY` (some row READY, none SENT) · `SENT` (some row SENT) · `PARTLY_PAID` (no READY/SENT rows, some PAID, balance > 0) · `PAID` (rows exist and balance ≤ 0). Labels: "–", "Valmis laskutukseen", "Laskutettu", "Osittain maksettu", "Maksettu".
- Endpoints (return 200 `EventDetail`, logged as history `INVOICE_ROW_ADDED` / `INVOICE_ROW_UPDATED {changes}` / `INVOICE_ROW_REMOVED`):
  - `POST /api/events/{id}/invoice-rows` `{ description (1–500), amountCents (int > 0), status? (default READY) }`
  - `PATCH /api/invoice-rows/{id}` `{ description?, amountCents?, status? }` (any status → any status; sets statusAt/By on change)
  - `DELETE /api/invoice-rows/{id}`
  - Allowed on SOLD and CANCELLED gigs; deleted gig → 409 `EVENT_DELETED`. Validation 400 `REQUIRED` / `INVALID_VALUE` / `TOO_LONG`.
- `GET /api/events?invoiceState=` (repeatable) filter.
- Details (TASK-046): open rows win — any READY/SENT row gives READY/SENT even if paid rows cover the total; PAID/PARTLY_PAID only when every row is PAID. History details: ADDED/REMOVED `{ invoiceRowId, description, amountCents, status }`, UPDATED `{ invoiceRowId, description, changes }`. `createdBy`/`statusBy` may be null (migrated/seeded rows). Converted balance rows are described "Lasku". Old PATCH keys/filter are ignored like unknown keys. List items carry derived fields only; `invoiceRows` in EventDetail.
- **Removed:** `invoiceStatus`, `invoiceStatusAt`, `invoiceStatusBy`, `prepaymentCents` (fields, PATCH keys, `?invoiceStatus=` filter). Migration converts existing data into rows: `prepayment_cents > 0` → PAID row "Ennakkomaksu" (that amount); then by old status: READY → READY row "Lasku" for the balance; INVOICED → SENT row for the balance; PAID → PAID row for the balance; PREPAYMENT_PAID / NONE → nothing more. Rows only when the amount > 0. Old history entries keep their texts.
- Seed/import: optional `invoiceRows: [{ description, amountCents, status }]` per gig; legacy `invoiceStatus`/`prepaymentCents` accepted and converted the same way.

## Invoicing state: coverage + payment (owner decision 2026-10-31) — replaces `invoiceState`
The single `invoiceState` can't express the owner's five states (they overlap), so it is split into **two derived values**, shown as two tags in the Laskutus cell (two lines) and on the gig page.
Definitions: `total = totalPriceCents`; `invoiced = Σ SENT + PAID rows`; `paid = Σ PAID rows`; `open = Σ SENT rows` (sent, not paid). READY rows are drafts (not yet invoiced).
- `invoiceCoverage`: `NONE` (total = 0 and no SENT/PAID rows) · `NEEDS_INVOICES` (invoiced < total) · `FULLY_INVOICED` (invoiced ≥ total). Labels: "–", "Laskuttamatta / Needs invoices", "Laskutettu kokonaan / Fully invoiced".
- `paymentState`: `NONE` (no SENT/PAID rows) · `OPEN_INVOICES` (open > 0) · `PARTLY_PAID` (open = 0 and 0 < paid < total) · `FULLY_PAID` (open = 0 and paid ≥ total > 0). Labels: "–", "Avoimia laskuja / Open invoices", "Osittain maksettu / Partly paid", "Maksettu kokonaan / Fully paid".
- Details: coverage `NONE` also when total = 0 and there are no SENT/PAID rows (READY drafts only); payment `FULLY_PAID` when open = 0, rows exist and paid ≥ total (incl. total 0). Both filters combine with AND; values within one filter with OR. Cancelled gigs use the same formulas (their price is the amount still billed, BR-013).
- `EventSummary`/`EventDetail` also gain `readyCents` (Σ READY rows). **Keikat table only:** when `readyCents > 0`, the Laskutus cell's line 1 shows **"Laskutettavia rivejä / Rows to be invoiced"** (info, blue) instead of the coverage tag. The gig page shows the coverage tag as usual. Row status READY tag = info (blue).
- Colours: Needs invoices = warn (amber); Fully invoiced = ok (light green); Open invoices = info (blue); Partly paid = accent (purple tag, new); Fully paid = ok-strong (dark green). "–" plain.
- `EventSummary`/`EventDetail`: `invoiceState` is **removed**; add `invoiceCoverage`, `paymentState` (keep `invoicedCents`, `paidCents`, `balanceCents`; add `openCents`). Filters `?invoiceCoverage=` and `?paymentState=` (repeatable) replace `?invoiceState=`.

## Invoicing: one label (owner decision 2026-10-31) — replaces `invoiceCoverage` + `paymentState`
One derived value **`invoiceState`** = the next invoicing action; first match wins (total = totalPriceCents, paid/ready/open as before):
1. `PAID` — paid > 0 and paid ≥ total → "Maksettu / Paid" (ok-strong, dark green)
2. `ROWS_TO_INVOICE` — readyCents > 0 → "Laskutettavia rivejä / Rows to be invoiced" (info, blue)
3. `OPEN_INVOICES` — openCents > 0 → "Avoimia laskuja / Open invoices" (warn, amber)
4. `NEEDS_INVOICES` — **played gig** (SOLD and start date passed) and invoiced < total → "Laskuttamatta / Needs invoices" (**yellow**, new tone distinct from the amber of Open invoices; updated 2026-10-31). Upcoming and cancelled gigs never get this state (they fall to NONE)
5. `NONE` — otherwise (e.g. total 0 and no rows) → "–"
- `EventSummary`/`EventDetail`: remove `invoiceCoverage` and `paymentState`; add `invoiceState`; keep `invoicedCents`, `paidCents`, `openCents`, `readyCents`, `balanceCents`.
- Filter `?invoiceState=` (repeatable, OR; unknown → 400) replaces `?invoiceCoverage=` / `?paymentState=`.
- UI: the same single tag in the Keikat table (one line), phone cards and at the top of the gig page Laskutus card; one "Laskutus" filter. The purple tone is no longer used for invoicing (keep the token).

## Attachments removed (owner decision 2026-10-31)
- `POST/GET/DELETE /api/events/{id}/attachments…` and the download endpoint are **removed** (404). `EventDetail.attachments` is removed. History types `ATTACHMENT_ADDED/REMOVED` stay for old entries (UI keeps their texts).
- The `attachment` table and files on disk are **kept unused** (no data deleted); a later cleanup can drop them. Reference photos still use `UPLOAD_DIR`.

## Health check (TASK-047)
`GET /api/health` (no session) → 200 `{ ok: true }` when the database answers, else 503 `{ ok: false }` (plain body, not the error format); `Cache-Control: no-store`. In production the backend also serves the built frontend (SPA fallback for non-`/api` GETs).

## Extra allowed sign-in emails (owner request 2026-11-03)
- New optional env `AUTH_EXTRA_ALLOWED_EMAILS`: comma-separated list of exact email addresses (case-insensitive, trimmed) that are treated as if they were in `AUTH_ALLOWED_DOMAIN`.
- Applies to: Google sign-in domain check (BR-070), dev login, and partner email validation (`PUT /api/people/{id}/partner`: such an address no longer gets `email: INVALID_VALUE`). The person must still be an **active partner** to sign in.
- Unset/empty = no change. Invalid entries (not an email) → startup error.

## Invoicing v3: sent / not sent, automatic final invoice (owner decision 2026-11-04) — replaces payment tracking
**Payments are not tracked.** Invoice rows have two statuses: `NOT_SENT` ("Lähettämättä / Not sent") and `SENT` ("Lähetetty / Sent").
- Migration: row `READY` → `NOT_SENT`; `SENT` and `PAID` → `SENT`.
- Figures on `EventSummary`/`EventDetail`: `sentCents` (Σ SENT), `notSentCents` (Σ NOT_SENT), `uninvoicedCents` = max(total − sentCents − notSentCents, 0), `balanceCents` = total − sentCents ("Laskuttamatta / Not invoiced yet"). Removed: `paidCents`, `openCents`, `readyCents`, `invoicedCents`.
- **`invoiceState`** (one label, first match wins):
  1. `OPEN_INVOICES` — any NOT_SENT row → "Avoimia laskuja / Open invoices" (**yellow**)
  2. `FULLY_INVOICED` — sentCents ≥ total and total > 0 → "Laskutettu / Fully invoiced" (**dark green**, solid)
  3. `NONE` — gig not played yet (upcoming), or cancelled/total 0 without rows → "–"
  4. `PARTLY_INVOICED` — played and sentCents < total → "Osittain laskutettu / Partly invoiced" (**blue**)
  Filter `?invoiceState=` uses these values.
- **Automatic final invoice ("Loppulasku"):** a backend job (runs at startup and every 15 minutes) finds SOLD, non-deleted gigs whose end (end date, else start date) + **48 hours** (organisation time zone, Europe/Helsinki) has passed, `total > 0`, `uninvoicedCents > 0`, and `finalInvoiceCreatedAt` is null. It adds one row `{ description: "Loppulasku", amountCents: uninvoicedCents, status: NOT_SENT }` (createdBy null, history `INVOICE_ROW_ADDED` with `details.auto: true`) and sets `event.final_invoice_created_at`, so it is created **only once per gig** (deleting it does not bring it back). The job is idempotent and safe to run concurrently (row lock / advisory lock).
- Details (TASK-049): `InvoiceRow` gains **`auto: boolean`** (true only for the job's Loppulasku). Auto history entries have `partnerId: null` (UI shows "Automaattinen / Automatic"). Gaps: a cancelled gig with rows and sent < total → PARTLY_INVOICED; total 0 with only SENT rows → NONE; an upcoming fully sent gig → FULLY_INVOICED. Due time = end of the gig's last day (Helsinki) + 48 h. If the price is raised after a fully covered gig's 48 h, the job adds a Loppulasku for the difference (only once).
- Row endpoints unchanged except allowed statuses (`NOT_SENT` default, `SENT`); old values `READY`/`PAID` → 400 `INVALID_VALUE`.

## Freelancer PO: VAT and sound check (owner request 2026-11-04)
- `POST /api/public/freelancers/{token}/purchase-orders` body becomes `{ vatLiable: boolean, lines: [{ costLineId, soundcheck: boolean }] }` (1…200 unique lines; old `{ costLineIds }` still accepted = `vatLiable: false`, all `soundcheck: true`). Missing/invalid → 400 (`vatLiable: REQUIRED`, `lines: INVALID_VALUE`).
- Per line amount: `base = budgetedCents`; if `soundcheck = false` → `base − settings.loadInDeductionCents` (not below 0; the same deduction as the load-in switch, value from settings, never hard-coded); if `vatLiable` → `amount = round(base × (1 + vatRate))` where `vatRate` = setting `fees.performer_vat_rate_bp` (basis points; default 1350 = 13.5 %, seedable). The VAT is part of the cost (the app does not track VAT separately).
- `PurchaseOrderLine` gains `baseCents`, `soundcheck`, `deductionCents`, `vatCents`; `amountCents` = final. `PurchaseOrder` and `PublicPurchaseOrder` gain `vatLiable`. Totals = Σ amountCents. Paying a PO sets each cost line's actual = its `amountCents` (incl. VAT) as before.
- `FreelancerView` gains `settings: { soundcheckDeductionCents, vatRateBp }` so the page can preview amounts. FreelancerLine `amountCents` stays the budgeted fee (alv 0 %).
- Details: `baseCents` = the fee before the deduction (budgetedCents); `amountCents = round_half_up((baseCents − deductionCents) × (1 + vatRateBp/10000))`, `vatCents = amountCents − (baseCents − deductionCents)`. `soundcheckDeductionCents` in `FreelancerView.settings` is the same value as `settings.loadInDeductionCents`. `PublicPurchaseOrder.lines` also carry `baseCents, soundcheck, deductionCents, vatCents`.
- Partner-created POs (`POST /api/purchase-orders`) unchanged (no VAT/sound check; lines `soundcheck: true`, `vatLiable: false`).

## Freelancer PO: VAT rate choice (owner request 2026-11-04) — replaces the yes/no VAT question
- The modal asks **"Oletko ALV-velvollinen?"** with three options: **Ei / No**, **Kyllä, ALV 13,5 % / Yes, VAT 13.5 %**, **Kyllä, ALV 25,5 % / Yes, VAT 25.5 %**.
- Public create body: `{ vatRateBp: 0 | 1350 | 2550, lines: [...] }` (allowed values = `[0, ...settings.vatRatesBp]`; anything else → 400 `vatRateBp: INVALID_VALUE`; missing → `REQUIRED`). Legacy `vatLiable: true` = 1350, `false` = 0; legacy `{ costLineIds }` = 0.
- Setting `fees.performer_vat_rates_bp` (comma-separated basis points, default `1350,2550`; replaces `fees.performer_vat_rate_bp`, whose value, if present, is used as the first rate). `FreelancerView.settings` = `{ soundcheckDeductionCents, vatRatesBp: [1350, 2550] }`.
- `PurchaseOrder` and `PublicPurchaseOrder` gain `vatRateBp` (stored); legacy `vatLiable: true` = the first configured rate; `vatLiable` stays in responses (= vatRateBp > 0). Migration: existing POs `vat_liable = true` → `vat_rate_bp = 1350`, else 0. Line math unchanged with the chosen rate.

## Freelancer PO: sound check already set on the gig (owner request 2026-11-04) — no double deduction
- `FreelancerLine` gains `joinsLoadIn: boolean|null` and `loadInDeductionAppliedCents: int|null` (from the cost line).
- If the cost line already has `joinsLoadIn = false` (the deduction is already in `budgetedCents`, BR-026): the modal shows the sound check switch **off and locked** with the note "Merkitty keikalle: ei soundcheckiä / Set on the gig: no sound check", and **no second deduction** is made.
- Server (public create): for such a line the request's `soundcheck` is ignored; the PO line is stored as `soundcheck: false`, `baseCents = budgetedCents + loadInDeductionAppliedCents`, `deductionCents = loadInDeductionAppliedCents` (so the breakdown shows the original fee and the deduction once), and `amountCents` = (budgeted) × VAT as before. Lines with `joinsLoadIn = true` work as before (switch on by default; off → deduct `settings.loadInDeductionCents` once).
- The partner-created PO path applies the same rule (deduction shown once, never added again).

## Sales and production lines: partners only (owner decision 2026-11-04)
- A cost line of type `SALES` ("Myynti") or `PRODUCTION` ("Tuotanto") may only have a `personId` of a person who is linked to an **active partner** (or no person).
- `POST /api/events/{id}/cost-lines` and `PATCH /api/cost-lines/{id}` with such a type and any other person → 400 `personId: NOT_PARTNER`.
- Existing lines that already break the rule are left as they are (no migration); they are only checked when the person is changed.
- Automatic SALES/PRODUCTION lines (BR-021/027 seller/producer) already use partners and are unaffected.
- UI: the person picker on these lines lists only active partners.

## Lineups and settings page (owner decision 2026-11-06) — replaces template roles and default fee settings
A **lineup** (`LineupTemplate`, UI "Kokoonpano") is the cost template of a gig: an ordered list of cost lines of **any** `CostType`
(musician roles, `OFFICE`/`SALES`/`PRODUCTION`, expenses) with a default amount. Lineups now define all default fees.

- `LineupTemplate = { id, name, active: boolean, lines: [LineupLine], eventCount: int }` where
  `LineupLine = { type: CostType, description: string|null, defaultCents: int }` (in display order). `eventCount` = gigs (incl. deleted) linked to it.
  - `description` required for `OTHER` / `OTHER_ROLE` (`DESCRIPTION_REQUIRED`), ≤ 500 chars; `defaultCents` ≥ 0 int; ≤ 100 lines; the same type may appear several times.
  - `name` required, ≤ 500 chars, unique case-insensitively among all lineups → `name: DUPLICATE`.
  - Line errors use field keys `lines[<index>].<field>` (e.g. `lines[2].description: DESCRIPTION_REQUIRED`, `lines[0].defaultCents: NEGATIVE_AMOUNT`, `lines[1].type: INVALID_VALUE`); more than 100 lines → `lines: TOO_LONG`.
  - No single-lineup GET; clients use the list.
- `GET /api/lineup-templates` → 200 `[LineupTemplate]` (all, active first, then by name).
- `POST /api/lineup-templates` `{ name, lines? }` → 201 `LineupTemplate` (active).
- `PATCH /api/lineup-templates/{id}` `{ name?, active?, lines? }` → 200 `LineupTemplate`. `lines` replaces the whole list. Changes never affect existing gigs.
- `DELETE /api/lineup-templates/{id}` → 204; 409 `LINEUP_IN_USE` when `eventCount > 0` (deactivate instead). Unknown id → 404.
- Any signed-in partner may use these endpoints.
- `GET /api/reference`: `lineupTemplates` = **active** lineups only, shape `{ id, name, lines: [LineupLine] }` (the old `roles` field is removed).
  `settings` **loses** `officeDefaultCents`, `salesDefaultCents`, `productionDefaultCents` (only `loadInDeductionCents` and the existing others remain).
- **Gig create** (`POST /api/events`): `lineupTemplateId` must be an **active** lineup (inactive/unknown → 400 `lineupTemplateId: UNKNOWN_REFERENCE`); still optional (custom `lineupName` instead).
  - With a lineup: one cost line per lineup line, in order: `budgetedCents = defaultCents`, `description` copied; musician roles `joinsLoadIn: true`;
    `SALES` lines get person = seller, `PRODUCTION` lines person = producer, other lines no person.
    If the lineup has no `SALES` line one is added (seller, 0 €); same for `PRODUCTION` (producer, 0 €). No automatic `OFFICE` line.
  - Without a lineup (custom): `OFFICE` (0 €), `SALES` (seller, 0 €) and `PRODUCTION` (producer, 0 €).
  - Offer → gig conversion uses the same rules.
- Settings keys `fees.office_default`, `fees.sales_default`, `fees.production_default` are **removed**.
  Migration: every existing lineup gets `lines` = its old roles (`type` = role, `defaultCents` = old `defaultFeeCents`, in order) followed by
  `OFFICE`, `SALES`, `PRODUCTION` lines with the old setting values (so new gigs get the same amounts as before); then the three setting rows are deleted. Template table gains `active` (default true).
- Seed / import: `lineupTemplates[]` accept `lines: [{ type, description?, defaultCents }]`; the old `roles: [{ role, defaultFeeCents }]` is still accepted
  and converted like the migration (roles, then OFFICE/SALES/PRODUCTION with the file's old `fees.*_default` values if given, else 0). The three old settings keys are accepted and otherwise ignored; they're no longer required.
  Re-run rule unchanged in spirit: an existing lineup's lines are set from the file only when it has no lines yet.
- UI: the menu item "Tietojen tuonti / Data import" is replaced by **"Asetukset / Settings"** (`/settings`), a page with two sections/tabs:
  **"Kokoonpanot / Lineups"** (`/settings/lineups`, default) and **"Tietojen tuonti / Data import"** (`/settings/import`, the existing import page). The old import URL redirects there.

## Piano merged into Keys; custom role is not a person role (owner decision 2026-11-07)
- Musician role **`PIANO` is removed** from `CostType` / `MUSICIAN_ROLES` and `/api/reference.costTypes`; it is merged into **`KEYS`**, label unchanged (FI **"Koskettimet"**, EN **"Keys"**).
  Migration converts `PIANO` → `KEYS` in cost lines, lineup lines and person `roles` (person roles de-duplicated, kept in `MUSICIAN_ROLES` order).
  Stored history details keep the old code; the UI still labels `PIANO` ("Piano") in history only. Seed/import accept `PIANO` and convert it to `KEYS`.
- **`OTHER_ROLE` ("Oma rooli / Custom role") is a cost line type only, never a person role.** It stays in `MUSICIAN_ROLES` for cost lines (load-in switch, double booking, gig count), but:
  - `Person.roles` never contains it: `PATCH /api/people/{id}` with `roles` including `OTHER_ROLE` → 400 `roles: INVALID_VALUE`; `GET /api/people?role=OTHER_ROLE` → 400 `INVALID_VALUE`.
  - Migration removes `OTHER_ROLE` from every person's `roles`; seed/import silently drop it from `roles`.
  - `/api/reference.costTypes` gains `personRoles: MusicianRole[]` = `musicianRoles` without `OTHER_ROLE` (the list the people page offers).
  - UI: people page role choices/filter use `personRoles`; a custom-role cost line lists all active people (unchanged, TASK-185).

## Invoicing: no label before the first invoice (owner decision 2026-11-07)
Fixes `invoiceState` for a played gig without invoice rows (shown wrongly as "Osittain laskutettu").
- `PARTLY_INVOICED` now requires **at least one invoice row** (any status) on the gig: played (or cancelled with rows) and `sentCents < total` **and rowCount > 0**.
- A played gig with **no invoice rows** → `NONE` ("–") — e.g. during the 48 h before the automatic Loppulasku is created.
- Order of rules otherwise unchanged (OPEN_INVOICES → FULLY_INVOICED → NONE → PARTLY_INVOICED). The `?invoiceState=` filter follows the same derivation.

## New musician role "Vocal & Keys" (owner request 2026-11-07)
- New `CostType` / musician role **`VOC_KEYS`**, placed right after `BACKING_VOC` in `MUSICIAN_ROLES` and `PERSON_ROLES` (so it appears in `/api/reference.costTypes.musicianRoles` and `personRoles`).
- Labels: FI **"Laulu & koskettimet"**, EN **"Vocal & Keys"**.
- Behaves like every other musician role (load-in switch, double booking, gig count, person roles, role filter, lineups, seed/import). Migration only adds the enum value; no data changes.

## Convert to gig: no lineup prefill (owner request 2026-11-07)
- `GET /api/offers/{id}/event-draft` returns `lineupTemplateId: null` and `lineupName: null` (the offer's event name is **not** used as the lineup name any more). All other prefilled fields unchanged.
- UI convert dialog: the "Kokoonpano" select starts with no choice ("Valitse kokoonpano"); the partner must pick an active lineup or "Oma kokoonpano" and then type the custom name (empty by default). Submitting with no choice → inline `REQUIRED` on the select; "Oma kokoonpano" with an empty name → `REQUIRED` on the name.
- `POST /api/offers/{id}/convert` **without a body** keeps the old BR-105 defaults (unchanged; not used by the UI).

## My gigs page replaces the Year page (owner request 2026-11-08)
- **`GET /api/me/events`** → 200 `[MyEvent]`: the signed-in partner's **upcoming** gigs — non-deleted, status `SOLD`, start date ≥ today (Europe/Helsinki) — where the partner is the **producer** (`event.producerId` = me) **or** the partner's linked person has at least one **musician-role** cost line (`MUSICIAN_ROLES`, incl. `OTHER_ROLE`) on the gig. Sorted by start date ascending, then lineup name. No year parameter.
- `MyEvent = { eventId, startDate, endDate|null, lineupName, venue, clientName|null, roles: [MyRole], notFullyStaffed: boolean }`
  - `MyRole = { kind: "PRODUCER" } | { kind: "MUSICIAN", type: CostType, description: string|null }` — `PRODUCER` first if the partner is the producer, then one entry per own musician-role line in cost-line order (`description` set for `OTHER_ROLE` lines). A producer who also plays gets both.
  - `notFullyStaffed` = same rule as `EventSummary.notFullyStaffed` (BR-023).
- A partner with no linked person only gets producer gigs.
- UI: the menu item **"Vuosi / Year" is replaced by "Omat keikat / My gigs"** (`/my-gigs`), which is also the start page after sign-in. The Year page and its route are removed from the UI (`/year` redirects to `/my-gigs`); `GET /api/years/{year}` stays for other pages that use it.

## Settings: Parameters tab (owner request 2026-11-09)
Parameters are **defined in backend code** (a registry: key, type, min/max); only their **values** are stored (`setting` table) and editable in the app. Adding a parameter later = add it to the registry (+ UI label), no new endpoints.
- `Parameter = { key: string, type: "MONEY", value: int|null, updatedAt: datetime|null, updatedBy: partnerId|null }` (`MONEY` = cents, ≥ 0, ≤ 100 000 000). Only `MONEY` exists now; other types (e.g. `PERCENT`, `TEXT`) may be added later.
- Registry now: **`fees.load_in_deduction`** (MONEY) — "Soundcheck-vähennys / Sound check deduction": subtracted from a musician line when "Roudaus ja soundcheck" is switched off (BR-026) and in the freelancer PO sound-check question.
- `GET /api/settings/parameters` → 200 `[Parameter]` in registry order (value `null` if no row yet).
- `PATCH /api/settings/parameters/{key}` `{ value }` → 200 `Parameter`. Unknown key → 404 `NOT_FOUND`; invalid value → 400 `VALIDATION_ERROR` `value: NEGATIVE_AMOUNT | INVALID_VALUE`. Upserts the setting row; records `updatedBy` = me (new nullable column `updated_by` → partner). Any signed-in partner.
- `/api/reference.settings.loadInDeductionCents` reflects the new value immediately. **Existing cost lines are not changed** (BR-026: the stored deducted amount is used when switching back on); only later switches use the new value.
- UI: Asetukset gets a third tab **"Parametrit / Parameters"** (`/settings/parameters`) listing the parameters with label, short help text and an inline value field (money: Enter/blur saves, Esc reverts), plus "muutettu <time> · <partner>".

## Contract done, follow-up done, My offers (owner request 2026-11-09)
**Gig: "Sopimus tehty / Contract done"**
- `EventSummary`/`EventDetail` gain `contractDone: boolean`. `EventCreate` (incl. offer convert body) and `EventUpdate` accept optional `contractDone` (default `false`). Changes are logged in `UPDATED` like other fields.
- Migration: new column `event.contract_done` (default false); existing gigs with start date **before today** (Helsinki) are set to `true`, upcoming ones stay `false`.
**Offer: "Seuranta tehty / Follow-up done"**
- `OfferSummary`/`OfferDetail` gain `followUpDone: boolean` (default false). `PATCH /api/offers/{id}` accepts `followUpDone`; logged like other offer changes. Migration: column `offer.follow_up_done` default false.
**`GET /api/me/offers`** → 200 `{ contractMissing: [MyOffer], followUp: [MyOffer] }` — offers where **seller = me**, non-deleted:
- `contractMissing`: status `ACCEPTED`, event date **today or later** (Helsinki; past events are not listed), and either not converted yet (`eventId: null`) or the linked gig is non-deleted, not `CANCELLED` and `contractDone = false`. Sorted by event date ascending.
- `followUp`: status `OPEN`, **not expired**, `followUpDone = false`. Sorted by event date ascending.
- `MyOffer = { offerId, eventName, eventDate, clientName, venue, city|null, priceCents|null, eventId|null }`.
**UI**
- Omat keikat: the **"Tuottaja / Producer"** role chip is **red** (danger tone); musician chips stay neutral. Below the gigs a second section **"Tarjoukset / Offers"** lists `contractMissing` rows with a **red** tag "Sopimus tekemättä / Contract not done" (link: the gig if `eventId`, else the offer) and `followUp` rows with a **blue** tag "Seuranta? / Follow-up?" (link: the offer). Empty → "Ei avoimia tarjouksia / No open offers".
- New gig form and "Muuta keikaksi" dialog: checkbox **"Sopimus tehty / Contract done"** (unchecked by default). Gig page: the same checkbox, editable (saved immediately).
- Tarjoukset list: a checkbox column **"Seuranta tehty / Follow-up done"** saved immediately (PATCH); also on the offer page.

## Change log
- 2026-11-09 – contractDone on gigs, followUpDone on offers, GET /api/me/offers (PM)
- 2026-11-09 – Settings parameters (registry in code, editable values); fees.load_in_deduction editable (PM)
- 2026-11-08 – GET /api/me/events (My gigs); Year page replaced in the UI (PM)
- 2026-11-07 – event-draft: no lineup prefill; convert dialog requires choosing a lineup (PM)
- 2026-11-07 – New musician role VOC_KEYS "Vocal & Keys" (PM)
- 2026-11-07 – invoiceState: PARTLY_INVOICED only with ≥ 1 invoice row; played without rows → NONE (PM)
- 2026-11-07 – PIANO merged into KEYS; OTHER_ROLE not a person role; reference.costTypes.personRoles (PM)
- 2026-11-06 – Lineups (CRUD, lines of any cost type with default amounts, active flag), default fee settings removed, Settings page (PM)
- 2026-11-04 – SALES/PRODUCTION cost lines: person must be an active partner (400 NOT_PARTNER) (PM)
- 2026-11-04 – Freelancer PO: no double sound-check deduction; gig-level load-in setting shown/locked in the modal (PM)
- 2026-11-04 – Freelancer PO VAT: choice No / 13.5 % / 25.5 % (vatRateBp) (PM)
- 2026-11-04 – Freelancer PO: VAT-liable choice (+ rate setting) and per-gig sound check (deduction from settings) (PM)
- 2026-11-04 – Invoicing v3: rows NOT_SENT/SENT, no payments, states OPEN_INVOICES/FULLY_INVOICED/PARTLY_INVOICED/NONE, automatic Loppulasku 48 h after the gig (PM)
- 2026-11-03 – AUTH_EXTRA_ALLOWED_EMAILS (exception list for sign-in outside the domain) (PM)
- 2026-10-31 – Gig file attachments removed from the app (PM)
- 2026-10-31 – Invoicing back to one label (next action): PAID / ROWS_TO_INVOICE / OPEN_INVOICES / NEEDS_INVOICES / NONE (PM)
- 2026-10-31 – invoiceState split into invoiceCoverage + paymentState (owner states, colours) (PM)
- 2026-10-31 – Invoice rows per gig (READY/SENT/PAID), balance from paid rows, derived invoiceState; gig invoice status + prepayment removed (PM)
- 2026-10-31 – Invoice status (NONE/READY/PREPAYMENT_PAID/INVOICED/PAID), prepayment and balance replace the ready-for-invoice flag (PM)
- 2026-10-31 – Gig status labels Tuleva/Soitettu/Peruttu; manual "ready to be invoiced" flag + endpoints (PM)
- 2026-10-31 – Partners can create POs by hand (POST /api/purchase-orders, eligible-lines endpoint) (PM)
- 2026-10-30 – Year no longer global: optional year on offers / purchase orders / person cost lines; offer stats ranges year−3…year+2 (PM)
- 2026-10-30 – Remove HORN_1/HORN_2/TECHNICIAN roles (converted to TRUMPET/SAX|TROMBONE/MIX); MIX = "Miksaus" (PM)
- 2026-10-27 – Rename Gig → Event across API, data and UI (SaaS phase 1) (PM)
- 2026-10-22 – Convert only ACCEPTED offers with event date ≥ today: 409 OFFER_NOT_CONVERTIBLE on gig-draft and convert (PM)
- 2026-10-20 – Convert to gig via an editable prefilled form: GET /api/offers/{id}/gig-draft, convert accepts GigCreate (PM)
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
