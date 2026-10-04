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
- **Tables:** `--surface`, header row `--surface-2` with mono uppercase labels + sort icons, hairline row borders, generous row height, numbers right-aligned tabular. Phone: rows become cards (label/value) as today.
- **Status tags:** mono uppercase, 1 px border, tinted background: Sold/Played = info, Done/Paid = ok, Overdue/Not fully staffed/contract-like warnings = warn, Cancelled/Deleted = danger or muted.
- **Dialogs:** `--surface`, 1 px border, title uppercase; phone = bottom sheet.
- **Icons:** thin line icons (e.g. `lucide-react`), 16 px, stroke 1.5.

## Logos
- Source: `frontend/assets/` (local, gitignored, 1080×1080 JPG). Committed versions: cropped to the logo (bbox ≈ x 50–1030, y 414–666) with **transparent background**, as optimized PNG (2× resolution for the header size) or SVG trace if clean.
- Dark theme → white logo; light theme → black logo. Header height ~28–32 px; sign-in page larger (~64–80 px).
- Also produce a favicon from the logo.

## Themes
- Dark and light. Default follows the OS (`prefers-color-scheme`); the header toggle overrides it and is remembered in `localStorage` (per browser). No flash of wrong theme on load.
