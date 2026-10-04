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
| `src/layout/` | App shell: header with year selector + menu (language, sign-out), nav |
| `src/reference/useReference.ts` | Reference data, loaded once per session and cached |
| `src/i18n/` | `fi.ts` / `en.ts` texts (glossary terms), label helpers for codes and errors |
| `src/lib/format.ts` | Money (cents), date, hours and percent formatting per language |
| `src/mocks/` | MSW handlers and synthetic data (browser worker + Node server for tests). All state is in `db` (`data.ts`); `resetMockDb()` resets every store. Gig rules live in `gigStore.ts`, demo gigs in `gigSeed.ts`; tasks, hours and budget in `tasksStore.ts`, `hoursStore.ts`, `budgetStore.ts`. The year mock is computed from these stores |
| `src/features/<feature>/` | One folder per feature: `year`, `gigs`, `people`, `tasks`, `hours`, `budget`; pages, query hooks and the feature texts in `i18n.ts` (gig texts are still in `src/i18n/fi.ts` / `en.ts`) |
| `src/features/gigs/` | Gig list, new gig, gig page (costs, attachments, history, move/cancel/delete dialogs) |
| `src/components/` | Shared UI: `Button`/`IconButton`, `Card`, `StatTile`/`StatGrid`, `MiniBars`, `PageHead`, `SectionLabel`, `StatusTag`, `Notice`, `DataTable`, `Dialog`, `Field`, `MoneyInput`, `Logo` (see "Design system") |
| `src/styles/` | `tokens.css` (all design tokens, dark + light), `fonts.css` (self-hosted fonts) |
| `src/styles.css` | Global + shared component styles (tokens only) |
| `src/theme/` | Dark/light theme: `useTheme()`, `setTheme()`, `initTheme()` |
| `src/styleguide/` | Dev-only `/styleguide` page |
| `src/assets/brand/` | Processed logos (generated, see "Logos") |
| `src/pages/` | Not-found page |
| `src/test/` | Test setup, `renderApp`, `gigFixtures` (synthetic gigs), `testFile` for uploads |

## Conventions

- **Never** show the server's `message`; translate `error.code` and field codes with
  `apiErrorMessage()` / `apiFieldErrors()` from `src/i18n/labels.ts`.
- Code labels: `t('costType.BASS')`, `t('technicalSetup.VAN')`, `t('gigStatus.PLAYED')`,
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
  `App.tsx`); pass `size` only for exceptions (bottom nav uses 20). Icons are `aria-hidden`
  automatically; give icon-only buttons a label (`IconButton label=…`).
- Status colour only means status: Sold/Played = `info`, Done/Paid = `ok`, Overdue / Not fully
  staffed / contract warnings = `warn`, Cancelled/Deleted = `danger` (or `muted`).
- Breakpoints: phone first; `min-width: 600px` (tablet: dialogs centred, 2-column forms, tables
  instead of cards); `min-width: 900px` (desktop: header nav + icon buttons, no bottom nav).
  `useMediaQuery(DESKTOP_QUERY)` from `src/lib/useMediaQuery.ts` gives the same breakpoint in JS.
- Pages: one `<PageHead>` (its `h1` is the page title), content directly on the page
  background; cards and tables bring their own surface. `.page` is now transparent.
- Touch targets stay ≥ 44 px on phones (`--control-h` is 44 px on phones, 36 px on desktop).

### Tokens (`src/styles/tokens.css`)

| Group | Tokens |
|---|---|
| Colour | `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--label`, `--accent`, `--accent-contrast`, `--backdrop` |
| Status | `--info-fg/-bg/-border`, `--ok-fg/-bg/-border`, `--warn-fg/-bg/-border`, `--danger-fg/-bg/-border` |
| Font | `--font-sans` (Afacad), `--font-mono` (JetBrains Mono) |
| Type size | `--fs-meta` 10, `--fs-label` 11, `--fs-small` 13, `--fs-body` 15, `--fs-lg` 18, `--fs-figure` 24→28, `--fs-title` 24→32 (px; → = desktop) |
| Type other | `--lh-tight`, `--lh-body`, `--ls-label` (0.14em), `--ls-title`, `--fw-regular`, `--fw-medium`, `--fw-bold` |
| Spacing | `--space-1` … `--space-7` = 4/8/12/16/24/32/48 px, `--page-pad` 16→48, `--content-max` |
| Shape / size | `--radius` (2 px, the max), `--hairline` (1 px), `--tap` 44, `--control-h` 44→36, `--icon` 16, `--icon-stroke`, `--header-h`, `--bottom-nav-h` |


### Components (`src/components/`)

| Component | Props | Notes |
|---|---|---|
| `Button` | `variant?: 'ghost' \| 'primary' \| 'danger'` (ghost), `size?: 'md' \| 'sm'`, `block?`, `icon?: LucideIcon`, + all `<button>` props | `type="button"` by default. One primary per view at most. |
| `buttonClass(style)` | same `variant/size/block/className` | From `buttonClass.ts`: button look for `<a>` / `<Link>`. |
| `IconButton` | `icon`, `label` (required: aria-label + tooltip), `variant?: 'plain' \| 'ghost'`, `text?` (short visible code), + `<button>` props | Edit/remove in rows, toolbars. |
| `PageHead` | `title`, `subtitle?` (mono line), `actions?`, `children?` (above the title, e.g. back link) | `h1` + divider. |
| `SectionLabel` | `as?: 'h2' \| 'h3' \| 'p'` (h2), `id?`, `children` | Mono label above a group. |
| `Card` | `as?: 'section' \| 'div' \| 'article'`, `label?`, `title?` (h2), `actions?`, `flush?` (no padding) | Surface panel. |
| `StatTile` | `label`, `value`, `caption?`, `secondaryValue?`, `secondaryCaption?`, `bars?: MiniBar[]`, `barsLabel?`, `barsCaption?` | A `region` named by `label`. Wrap tiles in `StatGrid`. |
| `StatGrid` | `children`, `className?` | 1 col → 2 cols (600) → auto-fill 220 px (900). |
| `MiniBars` | `bars: { label, value, current?, valueText? }[]`, `label` (accessible name), `showLabels?` (true), `height?` (48) | Bar labels must be unique. Screen readers get a "label: valueText" list. |
| `StatusTag` | `tone?: 'info' \| 'ok' \| 'warn' \| 'danger' \| 'muted'` (muted), `children`, `title?` | Gig statuses: use `GigStatusTag` (gigs feature). |
| `Notice` | `tone?: 'info' \| 'ok' \| 'warn' \| 'danger'` (info), `role?: 'alert' \| 'status' \| 'note'`, `children` | Same as `.notice` / `.notice-*`. |
| `DataTable<T>` | `columns`, `rows`, `rowKey`, `caption` (required, visually hidden unless `showCaption`), `empty?`, `cardsOnPhone?` (true), `rowClassName?`, `footer?` (`<tr>`s), `className?` | Column: `key`, `label`, `cell(row)`, `header?`, `numeric?`, `primary?` (card title on phones), `hideOnPhone?`, `sort?: 'asc' \| 'desc'`, `onSort?` (makes the header a sort button; caller owns the sort state), `className?`. |
| `Dialog` | `title`, `onClose`, `children` | Bottom sheet on phones, centred from 600 px. Put buttons in `<div className="form-actions">`. |
| `Field` | `label`, `error?`, `hint?`, `children(fieldProps)` | Spread `fieldProps` on the native `input`/`select`/`textarea`; they are styled globally. |
| `MoneyInput` | `value`, `onChange`, + field props | Euro input. |
| `Logo` | `size?: 'header' \| 'large'`, `theme?` (override), `className?` | White in dark, black in light. |

Theme in code: `useTheme()` → `{ theme, setTheme, toggleTheme }` (`src/theme/theme.ts`).
Header controls: `ThemeToggle` / `ThemeButtons`, `LanguageToggle` / `LanguageButtons` in `src/layout/`.

### Shared classes (for hand-written markup)

| Class | Use |
|---|---|
| `.label` / `.meta` / `.mono` | Mono uppercase label (11 px) / mono caption (10 px) / mono text |
| `.muted`, `.small`, `.num`, `.visually-hidden` | Secondary text, 13 px text, right-aligned tabular number, screen-reader only |
| `.btn` + `.btn-ghost/-primary/-danger`, `.btn-sm`, `.btn-block`, `.icon-btn` | What `Button`/`IconButton` render. |
| `.segmented` | Toggle group of `<button aria-pressed>` |
| `.tag .tag-<tone>` | What `StatusTag` renders. For gig statuses use `GigStatusTag` / `GigDeletedTag` (`src/features/gigs/GigStatusTag.tsx`; tones in `gigStatusTone.ts`). |
| `.notice .notice-<ok\|warn\|error\|danger>` | Message box |
| `.card`, `.stat-grid`, `.stat-tile`, `.section-label`, `.page-head`, `.divider` | As the components |
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

