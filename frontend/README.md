# Instaglamour ERP — frontend

React + TypeScript (strict) + Vite, React Router, TanStack Query, i18next (Finnish default,
English), MSW mocks, Vitest + React Testing Library, ESLint. Mobile-first (works at 375 px).

## Commands

```sh
npm install
npm run dev        # dev server on http://localhost:5173, proxies /api → http://localhost:3000 (configurable, see "Other ports")
npm run dev:mock   # same, but /api is answered by in-browser mocks + dev login shown
npm test           # Vitest (uses the same mocks through msw/node)
npm run lint       # ESLint (no warnings allowed) + TypeScript type check
npm run build      # production build into dist/
```

## Run with mocks (no backend needed)

```sh
npm install
npm run dev:mock
```

Open http://localhost:5173 and use the **dev login** form with a synthetic partner:
`partner.a@example.com`, `partner.b@example.com` (English) or `partner.c@example.com`.
Any other email shows "no access". The mock session lasts until the browser tab is closed.

`dev:mock` just sets `VITE_USE_MOCKS=true VITE_DEV_LOGIN=true`. You can instead put these in
`.env.local` (gitignored; see `.env.example`) and run `npm run dev`.
"Sign in with Google" is a real page navigation and is not mocked — it needs the backend.

Try `/login?error=WRONG_DOMAIN` (or `NOT_A_PARTNER`, `SIGN_IN_FAILED`) to see the sign-in errors.

## Run against the backend

1. Start the backend on http://localhost:3000 (see `backend/`).
2. Make sure `VITE_USE_MOCKS` is not `true` (unset or `false` in `.env.local`).
3. For dev login set `VITE_DEV_LOGIN=true` here **and** `DEV_LOGIN_ENABLED=true` in the backend `.env`.
4. `npm run dev` and open http://localhost:5173. All `/api` calls go through the Vite proxy,
   so the session cookie is same-origin.

### Other ports

The dev server reads two optional variables (shell or `.env.local`; see `.env.example`).
Unset or empty means the default.

| Variable | Default | What |
|---|---|---|
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Where the dev server proxies `/api` |
| `VITE_PORT` | `5173` | Dev server port (an invalid value stops the server with an error) |

```sh
VITE_API_PROXY_TARGET=http://localhost:3100 VITE_PORT=5273 npm run dev
```

`--port` on the command line still wins over `VITE_PORT`.

## Structure

| Path | What |
|---|---|
| `src/api/enums.ts` | Every code list from the contract / domain model (single source for the unions) |
| `src/api/types.ts` | Types for every shared object, request and response in `docs/api-contract.md` |
| `src/api/client.ts` | `apiRequest`, `ApiError` (`status`, `code`, `fields`), global 401 hook |
| `src/api/endpoints.ts` | Typed function per endpoint |
| `src/api/cache.ts` | Shared root query keys and `invalidateYearData()`: call it after every gig, cost line, hours or budget mutation |
| `src/auth/` | `me` query, auth guard, sign-in page, `useSignedInPartner()` / `useSelectedYear()` |
| `src/layout/` | App shell (Layout v2.1): collapsible sidebar, phone drawer, sticky top bar with year selector + language / theme / sign out (desktop), `.page-container` |
| `src/reference/useReference.ts` | Reference data, loaded once per session and cached |
| `src/i18n/` | `fi.ts` / `en.ts` texts (glossary terms), label helpers for codes and errors |
| `src/lib/format.ts` | Money (cents), date, hours and percent formatting per language |
| `src/mocks/` | MSW handlers and synthetic data (browser worker + Node server for tests). All state is in `db` (`data.ts`); `resetMockDb()` resets every store. Gig rules live in `gigStore.ts`, demo gigs in `gigSeed.ts`; tasks, hours and budget in `tasksStore.ts`, `hoursStore.ts`, `budgetStore.ts`. Budget rows (`/api/budget-categories`, `budgetCategoryHandlers` in `budgetHandlers.ts`) live in `db.reference.budgetCategories` (active rows only; removing drops the row there and keeps its amounts in `db.budget`). The year mock is computed from these stores |
| `src/features/<feature>/` | One folder per feature: `year`, `gigs`, `clients`, `people`, `tasks`, `hours`, `budget`; pages, query hooks and the feature texts in `i18n.ts` (gig texts are still in `src/i18n/fi.ts` / `en.ts`) |
| `src/features/gigs/` | Gig list, new gig, gig page (costs, attachments, history, move/cancel/delete dialogs) |
| `src/features/clients/` | Client register (UC-027): list + search + add, client page (inline name/notes, gigs, offers, delete), `ClientSelect` / `InlineClientSelect` ("–", clients, "New client…") used by the new gig form and the gig page. Mock: `mocks/clientHandlers.ts`; clients and a minimal `offers` list live in `db.gigs` (seed: Client A–C in `gigSeed.ts`) |
| `src/components/` | Shared UI: `Button`/`IconButton`, `Card`, `StatTile`/`StatGrid`, `MiniBars`, `PageHead`, `SectionLabel`, `StatusTag`, `Notice`, `DataTable`, `Dialog`, `Field`, `MoneyInput`, `Logo` (see "Design system") |
| `src/components/inline/` | Inline (save-on-blur) fields and `useInlineSave` (see "Inline editing") |
| `src/lib/hours.ts` | Hours input parsing / validation / formatting (shared by the hours feature and `InlineHours`) |
| `src/styles/` | `tokens.css` (all design tokens, dark + light), `fonts.css` (self-hosted fonts) |
| `src/styles.css` | Global + shared component styles (tokens only) |
| `src/theme/` | Dark/light theme: `useTheme()`, `setTheme()`, `initTheme()` |
| `src/styleguide/` | Dev-only `/styleguide` page |
| `src/assets/brand/` | Processed logos (generated, see "Logos") |
| `src/pages/` | Not-found page |
| `src/test/` | Test setup, `renderApp`, `gigFixtures` (synthetic gigs, `addMockClient`), `offerFixtures` (`mockOffer`), `testFile` for uploads |

## Conventions

- **Never** show the server's `message`; translate `error.code` and field codes with
  `apiErrorMessage()` / `apiFieldErrors()` from `src/i18n/labels.ts`.
- Code labels: `t('costType.BASS')`, `t('technicalSetup.SET_A')`, `t('logistics.OWN_VAN')`, `t('gigStatus.PLAYED')`,
  `t('gigEventType.MOVED')`, … A test fails if any code is missing in FI or EN.
- Money is integer cents end to end; format with `formatMoney(cents, lang)` and parse input
  with `parseMoneyToCents(text, lang)`.
- Pages below the guard read the year with `useSelectedYear()`; change it only through
  `useUpdateMe()` (it saves via `PATCH /api/me`).
- Mocks and tests use synthetic data only ("Partner A", "Person 1", "Venue X", `@example.com`,
  round dummy amounts). No real names, domains or business numbers (BR-090).
- To add mocks for a new contract section, add a handler array in `src/mocks/handlers.ts`
  and include it in `handlers`.
- Upload tests use Node's `FormData`/`File` (set in `src/test/setup.ts`) because Vitest's
  jsdom → Node fetch bridge drops file names and bytes. Create test files with `testFile()`.
- With mocks on, attachment downloads are fetched and opened as a blob URL (the mock
  service worker can't answer a plain navigation). Against the backend they are normal links.

## Design system

Spec: `docs/design.md`. Open **http://localhost:5173/styleguide** (`npm run dev:mock`, no sign-in
needed) to see every token and component in both themes, at any width. It is the reference for
screen work: if a screen needs something the styleguide doesn't show, add it to the shared
components and the styleguide first. The page exists only on the dev server (not in the nav, not in
production builds) and its texts are English on purpose.

### Rules for screens

- **No colours, font names or magic sizes in feature CSS.** Use the tokens below. If a token is
  missing, add it to `src/styles/tokens.css` (both themes) and the styleguide.
- Prefer the components. For a hand-written element use the shared classes listed below.
- Write titles and labels in normal case in i18n and JSX; CSS makes them uppercase
  (tests and screen readers see the normal-case text).
- Icons: `lucide-react`. The app sets 16 px / stroke 1.5 for all icons (`LucideProvider` in
  `App.tsx`); pass `size` only for exceptions (sidebar items use `--icon-nav` 18 via CSS, ☰ uses 20). Icons are `aria-hidden`
  automatically; give icon-only buttons a label (`IconButton label=…`).
- Status colour only means status: Sold/Played = `info`, Done/Paid = `ok`, Overdue / Not fully
  staffed / contract warnings = `warn`, Cancelled/Deleted = `danger` (or `muted`).
- Breakpoints: phone first; `min-width: 600px` (tablet: dialogs centred, 2-column forms, tables
  instead of cards); `min-width: 900px` (desktop: sidebar instead of the ☰ drawer);
  `min-width: 1200px` (`lg` StatGrid spans).
  `useMediaQuery(DESKTOP_QUERY)` / `useMediaQuery(WIDE_QUERY)` from `src/lib/useMediaQuery.ts` give
  the 900 / 1200 px breakpoints in JS (don't write your own copies of the query).
  **Breakpoints are viewport widths, and from 900 px the sidebar takes 232 px (64 collapsed).**
  At 900 px the content column is only about 590 px wide (900 − 232 − 2 × 40), narrower than a
  600 px phone/tablet layout. Check every screen at 900 px with the sidebar expanded.
- Pages: one `<PageHead>` (its `h1` is the page title), content directly on the page
  background; cards and tables bring their own surface. `.page` is transparent.
- Touch targets stay ≥ 44 px on phones (`--control-h` is 44 px on phones, 36 px on desktop).

### Layout v2: app shell and spacing rules

- **Shell** (`src/layout/AppShell.tsx`, Layout v2.1). Desktop: `Sidebar` (variant `rail`) on the
  left with the logo, icon nav and, bottom-left, only the collapse / expand toggle (no divider
  line). A sticky top bar shows the current section (left) and, on the right, the year selector
  followed by `TopbarControls`: language (shows the current code, e.g. `FI`) · theme · sign out,
  as `IconButton`s whose accessible name is also the tooltip; sign out is additionally described
  by "Kirjautuneena: <name>" / "Signed in as <name>" (`aria-describedby` + `title`). Phone: a
  sticky top bar with ☰, the logo and the year only; ☰ opens `NavDrawer` with the same
  `Sidebar` (variant `drawer`, `account` prop) whose bottom has language, theme, the signed-in
  name and sign out. The drawer is a modal dialog: it traps focus, closes on Esc, a backdrop
  click, navigation or the X, and returns focus to ☰. There is no bottom nav. Shared texts for
  both placements: `useAccountLabels()` (`src/layout/accountLabels.ts`).
- Collapse state: `localStorage['ig-sidebar']` = `expanded` | `collapsed`
  (`useSidebarCollapsed()`, try/catch). When collapsed, labels are visually hidden (they stay the
  accessible names) and appear as a CSS tooltip from `data-tooltip`.
- **Every route renders inside `.page-container`** (AppShell). It is left-aligned at the sidebar
  edge, has `--page-pad` on both sides, a content width of at most `--content-max` 1200 px, and
  `--space-5` / `--space-6` (desktop) above. **Don't add your own max-width or side padding on a
  page.** Everything shares one left edge.
- Vertical rhythm comes from the components: `PageHead`, `SectionLabel`, `.divider` and
  `StatGrid` use `--section-gap` (32 → 40). Don't add extra margins between sections; if a
  screen needs a different gap, use `--section-gap` / `--grid-gap` / `--space-*`.
- Grids of tiles/cards: `StatGrid` + `span` (see below). Use `--grid-gap` for hand-made grids.
- Tables: the cell x-padding is `--cell-pad-x` (= `--card-pad`), so the first column lines up with
  the content of cards above. Header and body padding are identical. Numeric columns: `numeric`
  (right, tabular). Rows are at least `--row-h` 48 px.
- Forms / inline fields: wrap a section's fields in `<FieldList>` to get one label column
  (`--label-w` 160 px; `labelWidth="sm" | "lg"`). Quiet inline values start exactly at the
  label's / column header's left edge; only the hover / focus outline extends into the gutter
  (`--inline-pad-x` + 1 px), so give inline fields at least 9 px of room on the left. Cards and
  table cells already have it.

### Tokens (`src/styles/tokens.css`)

| Group | Tokens |
|---|---|
| Colour | `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--label`, `--accent`, `--accent-contrast`, `--backdrop` |
| Status | `--info-fg/-bg/-border`, `--ok-fg/-bg/-border`, `--warn-fg/-bg/-border`, `--danger-fg/-bg/-border` |
| Font | `--font-sans` (Afacad), `--font-mono` (JetBrains Mono) |
| Type size | `--fs-meta` 10, `--fs-label` 10, `--fs-small` 12, `--fs-body` 14, `--fs-lg` 16, `--fs-figure` 20, `--fs-title` 20→22 (px; → = desktop) |
| Type other | `--lh-tight` 1.15, `--lh-body` 1.5, `--ls-label` (0.14em), `--ls-title`, `--fw-regular`, `--fw-medium`, `--fw-bold` |
| Spacing | `--space-1` … `--space-7` = 4/8/12/16/24/32/48 px |
| Layout | `--page-pad` 16→40, `--section-gap` 32→40, `--card-pad` 16→20, `--grid-gap` 16, `--content-max` 1200, `--label-w` 160 |
| Table | `--row-h` 48, `--cell-pad-y` 12, `--cell-pad-x` (= `--card-pad`) |
| Shape / size | `--radius` (2 px, the max), `--hairline` (1 px), `--tap` 44, `--control-h` 44→36, `--inline-pad-x` 8, `--inline-num-trail` (space right of an inline money/hours unit), `--icon` 16, `--icon-nav` 18, `--icon-stroke` |
| Shell | `--topbar-h` 56, `--sidebar-w` 232, `--sidebar-w-collapsed` 64, `--drawer-w` min(280 px, 85vw), `--nav-item-h` 44→40 |
| Motion | `--dur` 200 ms, `--ease`. Always add a `prefers-reduced-motion: reduce` override. |
| Stacking | `--z-topbar` 20, `--z-sidebar` 30, `--z-drawer` 40, `--z-dialog` 50 |
| Grid spans | `--span`, `--span-sm`, `--span-md`, `--span-lg` (registered, not inherited; see `StatGrid`) |


### Components (`src/components/`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant?: 'ghost' \| 'primary' \| 'danger'` (ghost), `size?: 'md' \| 'sm'`, `block?`, `icon?: LucideIcon`, + all `<button>` props | `type="button"` by default. One primary per view at most. |
| `buttonClass(style)` | same `variant/size/block/className` | From `buttonClass.ts`: button look for `<a>` / `<Link>`. |
| `IconButton` | `icon`, `label` (required: aria-label + tooltip), `variant?: 'plain' \| 'ghost'`, `text?` (short visible code), + `<button>` props | Edit/remove in rows, toolbars. |
| `PageHead` | `title`, `subtitle?` (mono line), `actions?`, `children?` (above the title, e.g. back link) | `h1` + divider. |
| `SectionLabel` | `as?: 'h2' \| 'h3' \| 'p'` (h2), `id?`, `children` | Mono label above a group. |
| `Card` | `as?: 'section' \| 'div' \| 'article'`, `label?`, `title?` (h2), `actions?`, `flush?` (no padding), `span?: GridSpan` | Surface panel, `--card-pad`. A `DataTable` in a `flush` card loses its own frame. |
| `StatTile` | `label`, `value`, `caption?`, `secondaryValue?`, `secondaryCaption?`, `bars?: MiniBar[]`, `barsLabel?`, `barsCaption?`, `span?: GridSpan` | A `region` named by `label`. Wrap tiles in `StatGrid`. |
| `StatGrid` | `children`, `className?` | **12-column grid**, gap `--grid-gap`, rows stretch (equal heights per row), margin-bottom `--section-gap`. Children: `StatTile` / `Card` with `span`, or any element with `style={spanStyle(span)}`, or CSS `--span*` on the children. |
| `GridSpan`, `spanStyle()` | `grid.ts`: `number` (all widths) or `{ base?, sm?, md?, lg? }` (< 600 / ≥ 600 / ≥ 900 / ≥ 1200 viewport) | A missing breakpoint falls back to the next smaller one. No span = 12 / 6 / 6 / 3. Example: `span={{ base: 6, sm: 4, lg: 2 }}` = 2, 3, then 6 per row. CSS version: `.my-grid > * { --span: 6; --span-lg: 3; }`. |
| `FieldList` | `labelWidth?: 'sm' \| 'md' \| 'lg'` (120 / 160 / 200 px), `className?`, `children` (`Field`s / inline fields) | Phones: label above. From 600 px: label column + control column; hint/error under the control; checkbox groups put their legend in the label column. |
| `MiniBars` | `bars: { label, value, current?, valueText? }[]`, `label` (accessible name), `showLabels?` (true), `height?: number \| string` (48 px; a number is px, a string any CSS length), `compact?` (bar area `--space-6` 32 px, for tiles with a secondary figure) | Bar labels must be unique. Screen readers get a "label: valueText" list. |
| `StatusTag` | `tone?: 'info' \| 'ok' \| 'warn' \| 'danger' \| 'muted'` (muted), `children`, `title?` | Gig statuses: use `GigStatusTag` (gigs feature). |
| `Notice` | `tone?: 'info' \| 'ok' \| 'warn' \| 'danger'` (info), `role?: 'alert' \| 'status' \| 'note'`, `children` | Same as `.notice` / `.notice-*`. |
| `DataTable<T>` | `columns`, `rows`, `rowKey`, `caption` (required, visually hidden unless `showCaption`), `empty?`, `cardsOnPhone?` (true), `cardsBelow?: 'sm' \| 'lg'` (`sm` = cards below 600 px; `lg` = below 1200 px, for wide tables that would scroll next to the sidebar at 900–1199 px), `rowClassName?`, `footer?` (`<tr>`s), `className?` | Column: `key`, `label`, `cell(row)`, `header?`, `numeric?`, `primary?` (card title on phones), `hideOnPhone?`, `sort?: 'asc' \| 'desc'`, `onSort?` (makes the header a sort button; caller owns the sort state), `className?`. |
| `Dialog` | `title`, `onClose`, `children` | Bottom sheet on phones, centred from 600 px. Put buttons in `<div className="form-actions">`. |
| `Field` | `label`, `error?`, `hint?`, `children(fieldProps)` | Spread `fieldProps` on the native `input`/`select`/`textarea`; they are styled globally. |
| `MoneyInput` | `value`, `onChange`, + field props | Euro input; the € sits inside the field, so it ends at the same right edge as other fields. |
| `Logo` | `size?: 'header' \| 'large'`, `theme?` (override), `className?` | White in dark, black in light. |

### Inline editing (`src/components/inline/`, NFR-8)

Existing items are edited in place: no Edit/Save buttons. Import everything from
`components/inline`. See every component and state on `/styleguide` → "Inline editing".

Behaviour (same for all): the field looks like a quiet value (hairline on hover, always on touch
screens; input style on focus). **Blur saves**, Enter saves single-line fields (Ctrl/Cmd+Enter in
`InlineTextarea`), **Esc** restores the last saved value. Unchanged values are not sent (`"1000"`
equals `1000,00 €`). Selects, checkboxes, switches and checkbox groups save **on change**.
Client-side checks run first (same `FieldCode`s as the API); invalid values are not sent.
States: saving (spinner), saved (ok check, 1.5 s), error (danger border + translated message
under the field; the typed value stays; the next blur retries). "Label: saved" / "Label: error" is
announced in a polite live region. While a save runs the field stays editable; a newer value is
saved right after. When the `value` prop changes (refetch), an unedited field follows it.

Common props (`InlineBaseProps<T>`):

| Prop | Type | Notes |
|---|---|---|
| `label` | `string` (required) | Visible mono label; `hideLabel` makes it visually hidden (table cells) but it stays the accessible name. |
| `value` | per component | The **saved** value from the server. |
| `onSave` | `(next) => Promise<unknown>` (required) | Return the API call. Reject (`ApiError`) → error state. Do cache invalidation / warnings / notices in here. |
| `validate?` | `(next) => FieldCode \| null \| undefined` | Extra client-side check after parsing. |
| `field?` | `string` | API field name: which code to show from a `VALIDATION_ERROR` (default: the first one). Other errors show `errors.<code>`. |
| `disabled?`, `hint?`, `className?`, `hideLabel?` | | |

| Component | Value / extra props | Parsing & checks |
|---|---|---|
| `InlineText` | `value: string` with `required`, else `string \| null`; `maxLength?`, `placeholder?`, `autoComplete?` | Trimmed. Empty → `REQUIRED` or `null`. Too long → `TOO_LONG`. |
| `InlineTextarea` | as `InlineText` + `rows?` (2; grows with content in Chrome) | Enter = new line; Ctrl/Cmd+Enter or blur saves. |
| `InlineMoney` | cents: `number` with `required`, else `number \| null`; `placeholder?` | Euro text ↔ cents via `parseMoneyField` / `centsToInput` (FI `1 234,50`, EN `1,234.50`). `NEGATIVE_AMOUNT`, `INVALID_VALUE`, `REQUIRED`. Re-formats on language change. |
| `InlineHours` | `value: number`; `placeholder?` | `lib/hours.ts`: 0.25…24 in 0.25 steps else `INVALID_HOURS`; empty `REQUIRED`. |
| `InlineDate` | `YYYY-MM-DD`: `string` with `required`, else `string \| null`; `min?`, `max?` | Native date input; saves on blur/Enter. `REQUIRED` / `INVALID_DATE`. |
| `InlineSelect<V>` | `value: V`, `options: { value: V; label; disabled? }[]` (`V` = `string \| number \| null`) | Saves on change. Include the current value; `{ value: null, label: '–' }` for none. |
| `InlineCheckbox` / `InlineSwitch` | `value: boolean` | Saves on change. Switch has `role="switch"`. |
| `InlineCheckboxGroup<V>` | `value: V[]`, `options: { value: V; label }[]` (`V extends string`) | Saves the whole list (in `options` order) on each change. |

`InlineMoney` / `InlineHours` draw their unit (€ / h) inside the field, so they end at the same right
edge as the other inline fields. To line a plain (read-only) number up digit-for-digit with them, put
it in the same column with class `inline-num-value` (right-aligned, tabular, padded by
`--inline-num-trail`) and format it with a no-break space before the unit, like `formatMoney`.

```tsx
import { InlineText, InlineTextarea, InlineMoney, InlineHours, InlineDate, InlineSelect,
  InlineCheckbox, InlineSwitch, InlineCheckboxGroup } from '../../components/inline';

// One PATCH per field; invalidate in onSave.
const patch = (body: GigUpdate) => gigsApi.update(gig.id, body).then(() => invalidateYearData(qc));

<InlineText label={t('gigForm.venue')} required value={gig.venue} field="venue"
  onSave={(venue) => patch({ venue })} />
<InlineTextarea label={t('gigForm.notes')} value={gig.notes} field="notes"
  onSave={(notes) => patch({ notes })} />
<InlineMoney label={t('gigForm.price')} required value={gig.priceCents} field="priceCents"
  onSave={(priceCents) => patch({ priceCents })} />
<InlineHours label={t('hours.hours')} value={entry.hours} field="hours"
  onSave={(hours) => hoursApi.update(entry.id, { hours })} />
<InlineDate label={t('tasks.dueDate')} value={task.dueDate} field="dueDate"
  onSave={(dueDate) => tasksApi.update(task.id, { dueDate })} />
<InlineSelect label={t('costs.person')} hideLabel value={line.personId} field="personId"
  options={[{ value: null, label: '–' }, ...people.map((p) => ({ value: p.id, label: p.name }))]}
  onSave={async (personId) => showWarnings((await costLinesApi.update(line.id, { personId })).warnings)} />
<InlineCheckbox label={t('people.active')} value={person.active}
  onSave={(active) => peopleApi.update(person.id, { active })} />
<InlineSwitch label={t('costs.loadIn')} value={line.joinsLoadIn === true}
  onSave={(joinsLoadIn) => costLinesApi.update(line.id, { joinsLoadIn })} />
// One choice or none (gig page basic info; options from features/gigs/gigOptions.ts):
<InlineSelect<TechnicalSetup | null> label={t('gigForm.technicalSetup')} value={gig.technicalSetup}
  field="technicalSetup" options={[{ value: null, label: NONE_LABEL }, ...technicalSetupOptions]}
  onSave={(technicalSetup) => patch({ technicalSetup })} />
<InlineSwitch label={t('gigForm.houseTechnician')} value={gig.houseTechnician} field="houseTechnician"
  onSave={(houseTechnician) => patch({ houseTechnician })} />
// Multi-choice list (no current use in the app; see /styleguide):
<InlineCheckboxGroup label="…" value={selected} options={codes.map((c) => ({ value: c, label: t(`ns.${c}`) }))}
  onSave={(next) => save(next)} />

// Budget row (PUT the whole row) in a table cell:
<InlineMoney label={`${t('budget.budgeted')}, ${name}`} hideLabel value={row.budgetedCents}
  field="budgetedCents" onSave={(budgetedCents) => budgetApi.put(row.id, { ...row, budgetedCents })} />
```

(Names of APIs/keys above are illustrative; use the real ones of your screen.)

Read-only values (deleted gig, other partners' entries): render plain text, or pass `disabled`
(looks like a muted value).

**Custom control** (only if no component fits): `useInlineSave({ value, save, toDraft?, parse?,
validate?, equals?, field?, disabled?, formatKey? })` → `{ draft, setDraft, commit(draft?), revert,
status, error, dirty }`, rendered in `InlineFieldFrame` (`label`, `hideLabel?`, `hint?`, `status`,
`error`, `disabled?`, `multiline?`, `children(controlProps)`). For text-like inputs spread
`textControlProps(state, multiline?)` (value, onChange, blur/Enter/Esc). `InlineStateIcon` and
`InlineAnnouncer` are the indicator and live region alone; `inlineErrorMessage(t, error, field?)`
gives the translated message. Texts: `inline.*` in `src/i18n/fi.ts` / `en.ts`.

Theme in code: `useTheme()` → `{ theme, setTheme, toggleTheme }` (`src/theme/theme.ts`).
Shell parts in `src/layout/`: `Sidebar` (rail / drawer), `NavDrawer` (modal drawer, uses
`useFocusTrap` from `src/lib/`), `sidebarState.ts`, `navItems.ts` (`NAV_ITEMS`,
`activeNavItem(pathname)`), `YearSelector`, `ThemeToggle` and `LanguageButtons` (sign-in page).

### Shared classes (for hand-written markup)

| Class | Use |
|---|---|
| `.label` / `.meta` / `.mono` | Mono uppercase label (10 px) / mono caption (10 px) / mono text |
| `.muted`, `.small`, `.num`, `.visually-hidden` | Secondary text, 12 px text, right-aligned tabular number, screen-reader only |
| `.btn` + `.btn-ghost/-primary/-danger`, `.btn-sm`, `.btn-block`, `.icon-btn` | What `Button`/`IconButton` render. |
| `.segmented` | Toggle group of `<button aria-pressed>` |
| `.tag .tag-<tone>` | What `StatusTag` renders. For gig statuses use `GigStatusTag` / `GigDeletedTag` (`src/features/gigs/GigStatusTag.tsx`; tones in `gigStatusTone.ts`). |
| `.notice .notice-<ok\|warn\|error\|danger>` | Message box |
| `.card`, `.stat-grid`, `.stat-tile`, `.section-label`, `.page-head`, `.divider`, `.field-list` | As the components |
| `.page-container` | The content container (AppShell renders it; do not nest another) |
| `.nav-item` (+ `.nav-item-label`, `data-tooltip`) | Sidebar item look (links and buttons) |
| `.table-wrap > table.data-table[.data-table-cards]` | Table look; for card mode give each `td` a `data-label`, `.cell-primary` for the card title, `.hide-phone` |
| `.form-row`, `.form-actions`, `.check-grid`, `label.check`, `.field-error`, `.field-hint` | Forms |
| `.back-link`, `.empty`, `.filters` | Mono back link above a title, empty-state line, filter bar (segmented + controls). Used by People / Tasks; new screens should prefer their own scoped class. |

### Theme

Dark and light (`<html data-theme>`). Default follows `prefers-color-scheme` (dark when unknown);
the header toggle stores an explicit choice in `localStorage['ig-theme']`. The inline script in
`index.html` applies it before first paint (keep it in sync with `src/theme/theme.ts`; a test
checks the key). Any element with `data-theme="dark|light"` re-themes its subtree (used by the
styleguide). In tests there is no `matchMedia` (= phone, dark); use `installMatchMedia()` from
`src/test/matchMedia.ts` to simulate desktop or an OS preference.

### Logos

`src/assets/brand/logo-{white,black}.png` (64 px tall = 2× header) and `-large` (160 px = 2× the
80 px sign-in logo), `public/favicon.png`, `public/apple-touch-icon.png`. Generated by
`scripts/make-logos.py` from the gitignored source JPGs in `frontend/assets/` (**never commit
the JPGs**). Needs Pillow, which is not a project dependency:

```sh
python3 -m venv /tmp/logo-venv && /tmp/logo-venv/bin/pip install Pillow
/tmp/logo-venv/bin/python scripts/make-logos.py [source-dir]
```

