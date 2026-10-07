# TASK-141: Fix F-006 (gig table overflow 1200–1263 px) and F-007 (double convert request)
- **owner:** ui · **status:** todo · **spec:** e2e/FINDINGS.md F-006, F-007 · **depends on:** none (runs parallel to TASK-140; don't touch OfferPreview or the references page)
## Acceptance criteria
- [ ] F-006: the 8-column gig table never overflows its box: either make it fit from 1200 px with the sidebar expanded (tighter columns, wrap secondary text, combine seller/producer), or switch to table only when the **content box** is wide enough (container query / measured width) — your choice, documented. Remove the F-006 `test.fixme` in `e2e/tests/12-layout-v2.spec.ts` (only that line/marker) and mark F-006 fixed in FINDINGS.
- [ ] F-007: the convert confirm button is disabled synchronously on first click (ref guard), so a zero-delay double click sends one request; same guard for other confirm dialogs in `offerParts.tsx`. Remove the F-007 fixme and mark fixed.
- [ ] Run only the two affected specs with free ports and `E2E_DB_NAME=instaglamour_e2e_t141`; unit tests, lint, build pass; headless check 1200/1280/1440 sidebar expanded/collapsed.
