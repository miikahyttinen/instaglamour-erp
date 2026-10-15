# TASK-147: Responsive Excel tables — full width, no horizontal scroll
- **owner:** ui · **status:** done · **spec:** docs/design.md → "Excel-style tables" (responsive 2026-10-15) · **depends on:** TASK-143, TASK-144, TASK-146
## Goal
Keikat and Tarjoukset tables currently scroll sideways (`width: max-content`, `nowrap`) and the page is capped at `--content-max`. The owner wants them responsive: use all available width, and fit the screen instead of scrolling.
## Contract
None (UI only).
## Acceptance criteria
- [ ] Gig list and offer list pages use the full width of the content area (no `--content-max` cap on these two pages; page padding stays). Other pages unchanged.
- [ ] `ExcelTable` from 600 px: `width: 100%`, no `max-content`, no horizontal scroll container. Text cells wrap (lineup/event, venue/place, client, names); dates, money, %, tags and the header filter/sort controls don't wrap. Remove the pinned-first-column scroll styling that is no longer needed.
- [ ] Column priority support in `ExcelTable` (e.g. `priority?: 1 | 2 | 3`, 1 = always shown). Hide priority 3 below 1400 px and priority 2 below 1100 px of **table container** width (container queries preferred so the expanded/collapsed sidebar is respected). A hidden column's active filter still applies, and "Tyhjennä suodattimet" still clears it; sort by a hidden column still works.
- [ ] Gigs priorities — 1: Kokoonpano, Päivä, Paikka, Tila, Kokonaishinta, Kate-% · 2: Asiakas, Myyjä, Miehitys kesken · 3: Tuottaja, Kulut budjetti, Kulut toteuma.
- [ ] Offers priorities — 1: event, eventDate, client, price, status, actions · 2: place, seller, disposition, gig · 3: created, source, eventType. Deleted-offers view: all columns priority 1.
- [ ] No horizontal page or table scroll at 600, 900, 1200, 1440, 1920 px, sidebar expanded and collapsed, both themes (headless check, screenshots compared). At 1920 the table fills the width.
- [ ] Phone cards (< 600 px) unchanged and still show all fields.
- [ ] Unit tests for priority hiding (class/attribute based) and filter-on-hidden-column; tests, lint, build pass.
## Out of scope
e2e (TASK-021 runs in parallel; it will update layout tests after this merges), backend.
