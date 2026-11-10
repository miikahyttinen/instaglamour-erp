# TASK-199: Omat keikat on phone — action tags after the title, role/status top right

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-10
- **depends on:** none

## Acceptance criteria (phone layout only, < 600 px; desktop unchanged)
- [ ] Gig rows: the "Miehitys kesken" tag sits right after the event title on line 1 (inline, title truncates with … before the tag is pushed out). The role chips (Tuottaja red, musician roles) sit in the **top-right corner** of the row.
- [ ] Offer rows: the "Sopimus tekemättä" and "Follow-up?" tags sit right after the event name on line 1; the offer status tag (Hyväksytty / Avoin) sits in the **top-right corner**. The "Follow-up tehty" checkbox stays on line 2 and keeps working without triggering the row link.
- [ ] Line 2 keeps date · client · venue. Rows stay compact; several role chips wrap within the top-right area without overlapping the title; no horizontal scroll at 375 and 414.
- [ ] Unit/CSS tests + e2e 25/27 phone checks updated; tests, lint, build pass; run e2e 25 and 27 (own E2E_DB_NAME/ports, COMPOSE_PROJECT_NAME=instaglamour-erp; stop servers after). Attach a 375 screenshot (gitignored `frontend/tmp-screens/`).
