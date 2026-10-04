# TASK-117: Design cleanup — dead global styles and leftovers

- **owner:** ui
- **status:** todo
- **spec:** docs/design.md
- **depends on:** TASK-110…TASK-116 (merged)

## Goal
Remove what the parallel restyles left behind, so shared styles stay small and consistent. No visual or behaviour change.

## Acceptance criteria
- [ ] Remove global rules in `src/styles.css` that no screen uses any more (the restyle developers listed: gig list `.view-switch .filters .filter-row .filter-search .filter-checks .empty .gig-rows .gig-row-head .gig-card .gig-date .gig-main .gig-link .gig-flags .gig-people .gig-total .econ-toggle .gig-econ .deleted-row`; gig page `.gig-header… .gig-actions .gig-section… .info-list… .econ-table… .cost-lines .cost-line .cost-head .cost-body .paid-info .cost-totals… .attachment-list .attachment… .history-…`; plus `.person-create` moved into gigPage.css). **Verify each with grep before removing**; keep anything still referenced (`.back-link`, `.total-line`, `.cell-label` etc. if still used).
- [ ] Remove the legacy compatibility classes/tokens from TASK-110 (`.badge-*`, `.btn-small`, `.btn-danger-solid`, `.stats/.stat`, `.notice-*`, old token aliases `--muted --primary …`) **only if** nothing references them any more; otherwise list what still does.
- [ ] `StatusBadge.tsx`: replace remaining uses with the shared `StatusTag` (Sold/Played = info, Cancelled = danger, Deleted = danger) and delete it; remove duplicated local status-tag mappings in favour of one shared helper in the gigs feature.
- [ ] Hours: remove the empty `.page-actions` div on the totals page if trivial.
- [ ] Before/after headless screenshots of every page in both themes at 375 and 1280 px look identical (except intended removals of nothing visible). Use your own Chrome debug port.
- [ ] Tests, lint, build pass. Do not edit `e2e/` (TASK-007 runs in parallel).
