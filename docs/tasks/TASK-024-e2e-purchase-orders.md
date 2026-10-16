# TASK-024: E2E for purchase orders (UC-033, UC-034)
- **owner:** backend (integration; `e2e/` only) · **status:** todo · **spec:** UC-033, UC-034, BR-113…BR-119, api-contract "Purchase orders" · **depends on:** TASK-023, TASK-151, TASK-152
## Goal
Cover the real end-to-end flow against the real backend: freelancer link → create PO → partner marks paid → gig cost lines paid, and the guards around it.
## Acceptance criteria
- [ ] Setup via API: a person (synthetic, tagged) with fee lines on two played gigs, one upcoming gig, one paid line, one 0-amount line, plus a cancelled gig line.
- [ ] Person page: copy link shows `/f/<token>`; regenerate → old link shows "Linkkiä ei löydy".
- [ ] Freelancer page without session: only own lines; no price/client/other people (check page text and JSON); upcoming not selectable; cancelled gig and 0-amount lines hidden; select fees from two gigs → create → number matches `^[A-Z0-9-]+-\d{4,}$` and starts with the name slug; fees now "Ostotilaus <number>".
- [ ] Two parallel creates with the same line via API → one 201, one 409 `COST_LINE_NOT_ELIGIBLE`.
- [ ] Partner Ostotilaukset: PO in list; search by part of the number finds it (and finds a PO from another year); Mark paid → green "Maksettu <date> klo <time>"; gig page cost lines paid, PO tag shown, controls locked; amount PATCH → 409; freelancer page shows Maksettu.
- [ ] PO page: Unmark paid (confirm) → open, lines unpaid; Cancel with reason → fees selectable again on the freelancer page; log on list and PO page shows created (Freelancer), paid, unpaid, cancelled with actors.
- [ ] Gig cancel with a line on an OPEN PO → error shown, gig unchanged.
- [ ] No horizontal scroll on the list, PO page and freelancer page at 375 and 1280.
- [ ] Full suite from a fresh DB (`E2E_DB_NAME=instaglamour_e2e_t024`, free ports) green; report counts. Real bugs → `test.fixme` + FINDINGS.md, don't change app code.
