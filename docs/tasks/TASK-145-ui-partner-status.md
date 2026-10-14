# TASK-145: Partner status on person page + Osakas label — UI
- **owner:** ui · **status:** done · **spec:** UC-032, api-contract "Partner status" · **depends on:** none (backend TASK-020 parallel; TASK-144 gig list runs in parallel — don't touch `features/gigs/`)
## Acceptance criteria
- [ ] Person page: "Osakas / Partner" switch; turning on opens a small form for the Google email (hint shows the required domain if available from config, else generic), errors REQUIRED/INVALID_VALUE/DUPLICATE translated; active partner shows email (inline-editable via PUT); turning off → confirm dialog ("Kirjautuminen estyy heti / Sign-in stops immediately") → DELETE; 409 CANNOT_REMOVE_SELF / LAST_PARTNER messages; own row shows the switch disabled with a note.
- [ ] "Osakas" StatusTag in the people list (new column/filter "Osakas" via the shared ExcelTable filter if the list uses it, else a filter select) and on the person page header.
- [ ] Pickers (seller, producer, task owner, offer seller) offer only **active** partners; existing records still render inactive partner names. Reference cache refreshed after changes.
- [ ] MSW mocks for the endpoints (synthetic emails `@example.com`), FI/EN, unit tests; tests/lint/build pass; headless check both themes 375/1440. `frontend/` only; no `e2e/`.
