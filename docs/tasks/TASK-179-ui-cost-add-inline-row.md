# TASK-179: Cost list — "Lisää rivi" adds an empty inline row (no separate form)

- **owner:** ui
- **status:** done
- **spec:** owner request 2026-11-04
- **depends on:** none

## Goal
Clicking "Lisää rivi" must not open a separate form. It adds a new **empty row** at the end of the
cost table, edited in place with the same kinds of inline fields the other rows use (type, person,
description, budget). A row left completely empty is simply dropped in the UI (never sent).

## Contract
Existing only: `POST /api/gigs/{id}/cost-lines` (`type` required; `OTHER`/`OTHER_ROLE` need `description`;
SALES/PRODUCTION partners only → `personId: NOT_PARTNER`). `type` is not editable after create, so the
draft row lives only in the UI until it is saved. No contract change.

## Acceptance criteria
- [ ] "Lisää rivi" appends a draft row at the bottom of the cost table (same columns as other rows) and focuses its type select. The old `AddCostLineForm` (separate form, title, Save/Cancel buttons) is removed.
- [ ] Draft row fields: type select (same groups as now), person select (partners only for SALES/PRODUCTION, same rules as now incl. clearing a non-partner on type change), description, budget. Choosing an internal type prefills the default fee when the budget is empty (as now).
- [ ] The draft is **saved automatically** (POST) when focus leaves the row and the type is chosen and, for OTHER/OTHER_ROLE, a description is given. On success the draft is replaced by the real line (normal inline-editable row). Double-booking warnings show as now.
- [ ] If focus leaves the row while it is **completely empty** (no type, person, description or budget), the draft row is removed without any request. Esc in the row also removes the draft.
- [ ] If something is filled but it can't be saved yet (no type, or missing required description), the row stays with the inline field error(s) (e.g. "Pakollinen"); nothing is sent. Server errors (e.g. NOT_PARTNER) show inline on the field.
- [ ] The draft row has a remove (trash) button that drops it in the UI.
- [ ] Only one draft row at a time; while it exists, "Lisää rivi" focuses it instead of adding another.
- [ ] Works on phone layout (row stacks like other rows).
- [ ] Unit tests updated/added; e2e specs that use the add form updated (02, and any others using it — grep for the add form/title). Tests, lint, build pass.

## Out of scope
Backend changes; making `type` editable on saved lines.
