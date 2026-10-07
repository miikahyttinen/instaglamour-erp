# TASK-139: Public offer page — UI
- **owner:** ui · **status:** todo · **spec:** UC-030, BR-104, api-contract "Public offer" · **depends on:** TASK-137 (runs parallel to TASK-138)
## Acceptance criteria
- [ ] Route `/o/:token` **outside** the auth guard and app shell (no sidebar/top bar/year); never calls authenticated endpoints.
- [ ] Shared presentational component `OfferPreview` (in `src/features/offers/OfferPreview.tsx`, used by TASK-138 too — create it here with a stable props API documented in README): logo, event name, client, date with weekday, venue/city, lineup, includes, Spotify button, references, seller name/email/phone. No price.
- [ ] FI/EN switch (browser language default), light/dark per OS, print-friendly, `<meta name="robots" content="noindex">`.
- [ ] Not-found page for 404 (no detail). Loading and error states.
- [ ] MSW mock for the public endpoint; unit tests (no price rendered even if present in data; no auth calls); tests/lint/build pass; headless check both themes 375/1440. `frontend/` only; no `e2e/`.
