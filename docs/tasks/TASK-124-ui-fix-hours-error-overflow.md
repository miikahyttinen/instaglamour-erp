# TASK-124: Fix hours error overflow (e2e finding F-004)

- **owner:** ui
- **status:** done
- **spec:** e2e/FINDINGS.md F-004, NFR-1
- **depends on:** none

## Goal
An invalid-hours error on My hours makes the page scroll horizontally (375 px: 460 px wide, text cut off; 1280 px: 1281 px).

## Acceptance criteria
- [ ] Cause per F-004: `.hours-page .hour-amount { white-space: nowrap }` in `features/hours/hours.css` is inherited by the field error. Restrict nowrap to the control; error text wraps.
- [ ] No horizontal scroll with an error shown at 375 and 1280 px (headless check, own port).
- [ ] Remove the `test.fixme` for F-004 in `e2e/tests/07-hours.spec.ts` and mark F-004 fixed in `e2e/FINDINGS.md`; that test passes. Run only `cd e2e && npx playwright test tests/07-hours.spec.ts` with free ports.
- [ ] Unit tests, lint, build pass.
