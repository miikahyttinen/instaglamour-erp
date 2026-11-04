# Design system

- **Status:** Approved (project owner, 2026-10-04)
- **Reference:** a local screenshot `design_help.png` (NOT in git — it contains real names; never copy any text or data from it).

## Character
Dark, minimal, editorial. Near-black surfaces, thin hairline borders, sharp corners, no shadows,
lots of space. Big bold uppercase page titles; tiny uppercase **monospace** labels with wide letter
spacing; numbers large and bold. Colour is used only for status.

## Typography
| Use | Font | Style |
|---|---|---|
| All text, headings, numbers | **Afacad** (self-hosted, e.g. `@fontsource/afacad`) | |
| Page title | Afacad 700 | uppercase, ~28–32 px desktop / 24 px phone, tight letter spacing |
| Big figures (stat tiles) | Afacad 700 | 24–28 px |
| Body / table cells | Afacad 400–500 | 14–15 px |
| Labels, table headers, buttons, status tags, small meta lines | monospace (e.g. `@fontsource/jetbrains-mono`, fallback `ui-monospace`) | 10–11 px, uppercase, letter-spacing 0.12–0.16em |

## Colour tokens (CSS custom properties on `:root[data-theme]`)
| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0a0a0a` | `#fafafa` |
| `--surface` (cards, table) | `#141414` | `#ffffff` |
| `--surface-2` (table header, inputs hover) | `#1c1c1c` | `#f2f2f2` |
| `--border` (hairlines) | `#2e2e2e` | `#e0e0e0` |
| `--border-strong` (inputs, buttons) | `#4a4a4a` | `#bdbdbd` |
| `--text` | `#f2f2f2` | `#0a0a0a` |
| `--text-muted` | `#9a9a9a` | `#5c5c5c` |
| `--label` (mono labels) | `#858585` | `#6b6b6b` |
| `--accent` (primary emphasis, active bar) | `#ffffff` | `#0a0a0a` |
| `--accent-contrast` | `#0a0a0a` | `#ffffff` |
| `--info-fg` / `--info-bg` / `--info-border` | `#6ea8ff` / `#121c2e` / `#1e3b6a` | `#1d4ed8` / `#eaf1ff` / `#bcd0f5` |
| `--ok-fg` / `--ok-bg` / `--ok-border` | `#34d399` / `#0b251c` / `#0c533b` | `#047857` / `#e7f6ef` / `#a7dcc4` |
| `--warn-fg` / `--warn-bg` / `--warn-border` | `#fbbf24` / `#2a2210` / `#5c4a14` | `#a16207` / `#fdf6e3` / `#ecd9a3` |
| `--danger-fg` / `--danger-bg` / `--danger-border` | `#f87171` / `#2a1212` / `#5c1f1f` | `#b91c1c` / `#fdecec` / `#f0b4b4` |

Contrast must meet WCAG AA for text in both themes. (`--label` dark raised from #7a7a7a to #858585 for AA on surfaces.)

## Shape & spacing
- Radius: **2 px** max (tags, inputs, buttons, cards). No shadows.
- Hairline borders 1 px `--border`. Section dividers: full-width 1 px line.
- Spacing scale 4/8/12/16/24/32/48. Page side padding 16 px phone, 48 px desktop.

## Components
- **Header:** logo (left, ~28–32 px tall), app sections nav, year selector; right side small icon buttons: language (FI/EN), theme toggle (sun/moon), sign out. Phone: logo + year + menu; bottom nav stays.
- **Page head:** uppercase title + one mono subtitle line (e.g. year summary), primary action as ghost button on the right, divider line below.
- **Section label:** mono uppercase label above a group ("OPEN OFFERS STATISTICS"-style).
- **Stat tile / card:** `--surface`, 1 px border, mono label top, big Afacad number, optional secondary figure + mono caption; optional mini bar chart (bars `--surface-2`, current/selected bar `--accent`).
- **Buttons:** ghost by default — transparent, 1 px `--border-strong`, mono uppercase text, optional leading icon; primary = solid `--accent` with `--accent-contrast` text; danger = ghost with danger colours. Min height 36 px (44 px touch targets on phone).
- **Inputs/selects:** transparent / `--bg`, 1 px `--border-strong`, Afacad text, mono placeholder, focus ring 1 px `--accent`.
- **Tables:** `--surface`, header row `--surface-2` with mono uppercase labels + sort icons, hairline row borders, compact row height (36 px), numbers right-aligned tabular. Phone: compact rows (see "Compact density"), no cards.
- **Status tags:** mono uppercase, 1 px border, tinted background: Sold/Played = info, Done/Paid = ok, Overdue/Not fully staffed/contract-like warnings = warn, Cancelled/Deleted = danger or muted. Offer status: Open = info, Accepted = ok, Rejected = danger (owner request 2026-10-20). Gig status: Tuleva = info (blue), Soitettu = ok (green), Peruttu = danger (red). Invoicing (2026-10-31): row status Valmis laskutukseen = info (blue), Lähetetty = ok (light green: tinted green background, green border/text; owner 2026-10-31), Maksettu = full green box (solid filled `tag-ok-strong`). Gig invoicing tag (one label, next action): Maksettu = ok-strong (full green box), Laskutettavia rivejä = info (blue), Avoimia laskuja = warn (amber), Laskuttamatta = yellow (`tone-yellow`, only played gigs), – plain. (`tone-purple` exists but is unused.)
- **Dialogs:** `--surface`, 1 px border, title uppercase; phone = bottom sheet.
- **Icons:** thin line icons (e.g. `lucide-react`), 16 px, stroke 1.5.

## Logos
- Source: `frontend/assets/` (local, gitignored, 1080×1080 JPG). Committed versions: cropped to the logo (bbox ≈ x 50–1030, y 414–666) with **transparent background**, as optimized PNG (2× resolution for the header size) or SVG trace if clean.
- Dark theme → white logo; light theme → black logo. Header height ~28–32 px; sign-in page larger (~64–80 px).
- Also produce a favicon from the logo.

## Themes
- Dark and light. Default follows the OS (`prefers-color-scheme`); the header toggle overrides it and is remembered in `localStorage` (per browser). No flash of wrong theme on load.

## Inline editing (NFR-8)
- Existing items have **no Edit/Save buttons**: fields look like quiet values (no border, hover shows a hairline, focus shows the input style) and are editable directly.
- **Save on blur**; Enter also saves single-line fields (Ctrl/Cmd+Enter in textareas); **Esc** restores the last saved value. Unchanged values are not sent.
- Per-field state: *saving* (subtle spinner/mono "Saving…"), *saved* (brief ok check, ~1.5 s), *error* (danger border + translated field error under the field; the typed value stays; retry on next blur).
- Client-side validation runs before sending (same codes as the API); invalid values are not sent.
- Selects, checkboxes and switches save immediately on change.
- Money fields: euro input, sent as cents. Hours: 0.25 steps.
- One request per field change (PATCH with just that field; budget rows PUT the whole row).
- Keyboard and screen reader: real inputs with labels; state changes announced via a polite live region.
- Not inline: creating new items (form + Add), cancel/uncancel/delete (dialog with reason), gig dates (Move dialog), mark paid / unpay (action).

## Layout v2 — sidebar, smaller type, more space (owner request 2026-10-05)
Supersedes the header/nav and typography sizes above where they differ.

### Sidebar navigation
- Left sidebar on desktop/tablet (≥ 900 px): logo at top; nav items with **line icons** + label (Year, Gigs, People, Tasks, Hours, Budget); active item = `--surface-2` background + accent bar on the left; bottom area: language, theme toggle, sign out (with signed-in name as text when expanded).
- **Collapsible:** expanded ≈ 232 px (icon + label), collapsed ≈ 64 px (icons only, label as tooltip and accessible name). Toggle button in the sidebar; state persisted in `localStorage` (try/catch); smooth width transition (respects reduced motion).
- **Phone (< 900 px):** sidebar hidden; a top bar with ☰, logo and year selector; ☰ opens the sidebar as an overlay drawer from the left (backdrop, focus trap, Esc/backdrop/nav click closes). The bottom nav is removed.
- **Top bar of the content area:** page context left (optional breadcrumb/back), **year selector** right. Sticky.

### Typography (smaller)
| Token | Size |
|---|---|
| `--fs-title` | 22 px (phone 20) |
| `--fs-figure` | 20 px |
| `--fs-lg` | 16 px |
| `--fs-body` | 14 px |
| `--fs-small` | 12 px |
| `--fs-label` | 10 px (mono, letter-spacing 0.14em) |
| `--fs-meta` | 10 px |
Line-height body 1.5.

### Space & alignment
- 8 px grid. Section gap 40 px (phone 32), card padding 20 px (phone 16), gap between tiles/cards 16 px, page padding 40 px desktop / 16 px phone.
- One content container: max width 1200 px, left-aligned to the sidebar edge + page padding; every page uses the same container, so titles, tiles, tables and forms share one left edge.
- Grid: tiles in a 12-column grid (`StatGrid` spans), consistent heights per row; labels top-aligned; values baseline-aligned.
- Tables: numeric columns right-aligned with tabular figures; header and cell padding identical; first column aligned with the page edge of cards above.
- Forms/inline fields: labels in one column width per section; inputs aligned; consistent 36 px control height (44 px touch on phone).

### Layout v2.1 — controls in the top bar (owner request 2026-10-05)
- **Desktop (≥ 900 px):** language, theme toggle and sign out move from the sidebar to the **content top bar, right of the year selector**, as icon buttons (sign out tooltip/accessible description shows "Signed in as <name>"). Order: year selector · language · theme · sign out.
- **Sidebar bottom:** only the collapse/expand toggle remains, bottom-left; **no divider line** above it.
- **Phone (< 900 px):** top bar stays ☰ · logo · year (no room for three more icons); language, theme and sign out stay at the bottom of the drawer.

## Excel-style tables (owner request 2026-10-14, responsive 2026-10-15)
Used by the gig list (Keikat) and the offer list (Tarjoukset); same component, same look.
- Header: column title + sort toggle (`aria-sort`) + **filter icon** for filterable columns. The icon is highlighted (accent) when the column is filtered.
- Filter popover (like Excel): search box (when > 8 values), "Valitse kaikki / Select all", "Tyhjennä / Clear", checkbox list of the column's distinct values in the current data (incl. "(tyhjä) / (blank)"), OK / Cancel. Keyboard accessible; Esc closes.
- Filters are client-side over the selected year's rows, combine with AND, and are kept in the URL; a "Tyhjennä suodattimet / Clear filters" button resets all. Search box above the table stays.
- **Responsive, no horizontal scroll (owner request 2026-10-15):** list pages with an Excel table (Keikat, Tarjoukset) use the **full content width** (no `--content-max`). The table is `width: 100%`; text cells wrap (dates, money, percentages and tags stay on one line). Columns have a priority; as the width shrinks, lower-priority columns are hidden instead of scrolling (see TASK-147 for the order). The table never scrolls sideways from 600 px up; below 600 px it is cards. Numeric columns right-aligned with tabular figures; identical paddings/row height to the offer list.
- Phone (< 600 px): cards; a "Suodattimet / Filters" button opens the same per-column filters in a sheet.
- Year figures/tiles above the table ignore filters (unchanged rules BR-082, BR-106).

## Full-width, responsive tables everywhere (owner request 2026-10-15)
- **Every app page uses the full content width** (sidebar to window edge, page padding kept). The `--content-max` cap is removed from `.page-container` and the top bar; `.page-wide` becomes the default. The public offer page keeps its own `--doc-max`.
- Forms, notes and single-record field groups keep their own readable max widths (e.g. `--client-form-w`, label columns) — only the page container is uncapped.
- **Every table** (`DataTable`, hand-written `.data-table`, `ExcelTable`, cost list, hours tables, budget, year page) is `width: 100%` and fills its container; **no horizontal scrolling at ≥ 600 px**. Text cells wrap; numbers, dates, money, % and tags stay on one line. Where a table has too many columns, lower-priority columns hide on narrower widths (same mechanism as ExcelTable `priority`) or the table switches to its card/stacked layout.
- Numeric columns right-aligned with tabular figures, same paddings as the Excel tables.

## Compact density (owner request 2026-10-31)
- **More on screen, less air.** Reduce spacing tokens app-wide: page padding, section gaps, card padding, table cell padding and row height, form control height (desktop 32 px, touch targets stay ≥ 40 px on phones), heading margins. Keep everything aligned and readable; no overlapping or clipped text.
- **No cards on phones.** Lists that become cards below 600 px (ExcelTable, DataTable, people, clients, offers, purchase orders, hours, tasks, budget, cost lines) render as **compact rows**: one row per item, primary text + key figure on the first line, secondary info on a second line only when it doesn't fit. Tapping the row opens the item (or the row's link). Inline-editable lists keep their controls but in a compact row layout.
- **One line where possible:** short label/value pairs, tags, dates and money stay on one line; group related small fields side by side instead of stacked.
- **Phone gig rows (2026-10-31):** line 1 = gig name (truncates first) + gig status tag on the left, flexible gap, invoicing tag + price on the right (price last, prices line up). Line 2 = date, venue, client and margin % (no labels), staffing. Table column options: `phoneInline` (line 1 before the price), `phoneEnd` (line 1 after the price), `phoneMain`, `phoneBare`.
- **Phone offer rows (2026-11-02):** line 1 = offer name (truncates first) + status tag, flexible gap, price at the right edge. Line 2 = event date, client, created (no labels). Disposition select, convert button, row icons and place are not shown on phones (they are on the offer page).
- **Task rows (2026-11-02):** one line per task (checkbox, title …, owner, due date, details + delete icons), 36 px from 600 px, 40 px on phones (owner hidden, due date as text). Description, owner/date fields on phones and the Myöhässä/Tehty tags show when the row is opened.
- **Gig page layout (2026-11-04):** from 1080 px content width two columns — left "Kulut ja miehitys" (~60 %, 2/3 from 1700 px), right the other sections in order; Muutoshistoria full width below. Narrower: one column, costs first, log last.
- **Cost list (2026-11-04):** full one-line table from 600 px list width (28 px controls on desktop, icon buttons for pay/unpay/remove). Lines grouped: **Miehitys** (musician + internal roles, `--surface-2`) and **Kulut** (expenses, new `--surface-3`), each with a head row and totals row; overall "Yhteensä" last. Budget and actual amounts right-aligned in fixed columns (tabular figures), totals under their columns. In two-column gig layout the cost table top aligns with the Perustiedot card.
