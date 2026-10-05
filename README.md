# Instaglamour ERP

A small, focused web app for the partners of a live-music band to run the business: **gigs, staffing and costs, contracts, tasks, work hours and the yearly budget — all organised by year.** It replaces a large spreadsheet with a real data model, keeps a full change history, and works on desktop and phone in Finnish and English, in dark and light mode.

> All data in this README and in the repository is **synthetic test data** ("Partner A", "Person 1", "Venue X", round amounts). Real names, customers, fees and budgets never enter the repository — see [Data protection](#data-protection).

![Year page, dark](docs/screenshots/year-dark.png)

---

## Contents
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Run it locally](#run-it-locally)
- [Specifications: vision, use cases, rules](#specifications)
- [How this was built: AI agent orchestration](#how-this-was-built-ai-agent-orchestration)
- [Testing](#testing)
- [Data protection](#data-protection)
- [Repository layout](#repository-layout)
- [Open items](#open-items)

---

## Screenshots

### Year page (home)
The selected year at a glance: sold gigs sum, costs and margin, hours per partner, budget vs. actual and the year result, plus the next upcoming gigs.

| Dark | Light |
|---|---|
| ![](docs/screenshots/year-dark.png) | ![](docs/screenshots/year-light.png) |

### Gigs
Gig list for the selected year with a year summary, search and filters (table on wide screens, cards on narrow ones).

| Dark | Light |
|---|---|
| ![](docs/screenshots/gigs-dark.png) | ![](docs/screenshots/gigs-light.png) |

### Gig page — everything edited in place
Click any field to edit; it saves when it loses focus (click outside or Enter), Esc reverts. Basic info, price and additional sales, economics, the cost & staffing list (load-in switch, mark paid), attachments and the full change history.

| Dark | Light |
|---|---|
| ![](docs/screenshots/gig-dark.png) | ![](docs/screenshots/gig-light.png) |

### New gig
Template or custom lineup, technical setup, logistics, house technician, price and additional sales.

| Dark | Light |
|---|---|
| ![](docs/screenshots/new-gig-dark.png) | ![](docs/screenshots/new-gig-light.png) |

### People and person page
| People | Person (cost lines for the year) |
|---|---|
| ![](docs/screenshots/people-dark.png) | ![](docs/screenshots/person-dark.png) |

### Tasks
Open/done, owner and due date, overdue highlighted — all edited in the row.

| Dark | Light |
|---|---|
| ![](docs/screenshots/tasks-dark.png) | ![](docs/screenshots/tasks-light.png) |

### Hours
| My hours | Totals per partner and month |
|---|---|
| ![](docs/screenshots/hours-dark.png) | ![](docs/screenshots/hours-totals-dark.png) |

### Budget
Fixed costs and income per category: budget, actual and variance; every cell saves on blur.

| Dark | Light |
|---|---|
| ![](docs/screenshots/budget-dark.png) | ![](docs/screenshots/budget-light.png) |

### Navigation, sign-in and phone
| Collapsed sidebar | Sign-in (Google) |
|---|---|
| ![](docs/screenshots/sidebar-collapsed-dark.png) | ![](docs/screenshots/signin-dark.png) |

| Phone: year | Phone: gigs | Phone: menu drawer | Phone: budget (light) |
|---|---|---|---|
| ![](docs/screenshots/phone-year-dark.png) | ![](docs/screenshots/phone-gigs-dark.png) | ![](docs/screenshots/phone-drawer-dark.png) | ![](docs/screenshots/phone-budget-light.png) |

<sub>Screenshots are taken automatically with Playwright against the app's built-in mock API (synthetic data). Native date inputs render in the headless browser's own format.</sub>

---

## Features

| Area | What it does |
|---|---|
| **Year first** | A selected year (always visible top right) drives every total: sold gigs sum, hours sum, budget vs. actual, year result. |
| **Gigs** | Create from a lineup template or custom; status *Sold / Cancelled* ("played" derived from the date); move (dates logged), cancel/uncancel with reason, soft delete & restore. |
| **Price** | Price + additional sales; total, margin and margin % calculated live. |
| **Costs & staffing** | One cost list per gig: musicians, internal fees (office/sales/production) and expenses. Load-in & soundcheck switch deducts a configured amount; *mark paid* records time and partner; fuel is an estimate only; performer double-booking warnings; unpaid sales/production lines follow a seller/producer change. |
| **Technical setup & logistics** | Technical setup (house tech, own PA set A/B/C), logistics (own van, rental van, taxi, other), house technician yes/no. |
| **Attachments** | Contracts and other files per gig (PDF, DOCX, PNG, JPG); customer and invoicing details live in the contract, not in the database. |
| **History** | Every change on a gig is logged (who, when, old → new) and cannot be edited. |
| **People, tasks, hours** | Simple people register; shared to-do list; partners log hours (date, comment, hours) with month and year totals. |
| **Budget** | Budget and actual per fixed cost/income category and year; copy budget from the previous year. |
| **Inline editing** | No Edit/Save buttons: fields save on blur/Enter, selects and switches on change, with saving/saved/error feedback. |
| **Design** | Dark & light themes, Afacad typeface + monospace labels, collapsible icon sidebar, phone drawer, Finnish & English UI, responsive down to 375 px. |
| **Access** | Google sign-in restricted to the company Workspace domain **and** registered partners. |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (strict), Vite, React Router, TanStack Query, i18next (FI/EN), MSW mocks, lucide icons, self-hosted Afacad & JetBrains Mono |
| Backend | Node.js + TypeScript, Fastify, Prisma, Zod, server-side sessions, Google OAuth (PKCE) |
| Database | PostgreSQL 16 (Docker Compose), versioned migrations |
| Tests | Vitest + Testing Library (frontend), Vitest against a real test database (backend), Playwright end-to-end against the real stack |

Money is stored as integer cents; "today" is Europe/Helsinki.

---

## Run it locally

Requirements: Node 24, Docker.

```bash
# 1. Database
docker compose up -d

# 2. Backend  (http://localhost:3000)
cd backend
cp .env.example .env          # set SESSION_SECRET; Google client + AUTH_ALLOWED_DOMAIN for real sign-in,
                              # or DEV_LOGIN_ENABLED=true for local dev login
npm install
npm run db:migrate
npm run db:seed               # loads seed/seed.local.json if present, else the synthetic example seed
npm run dev

# 3. Frontend (http://localhost:5173, or VITE_PORT=5175 npm run dev)
cd ../frontend
npm install
npm run dev                   # against the backend
npm run dev:mock              # or: no backend needed, mock API + dev login (partner.a@example.com)
```

Details: [`backend/README.md`](backend/README.md), [`frontend/README.md`](frontend/README.md) (design system, components, inline editing), [`e2e/README.md`](e2e/README.md).

---

## Specifications

Everything the code does is written down first, in [`docs/`](docs/README.md), and approved by the project owner before any task is given to a developer agent.

| Document | Content |
|---|---|
| [`vision.md`](docs/vision.md) | Problem, goal, users, principles, MVP scope, out of scope, decision log |
| [`use-cases/`](docs/use-cases/README.md) | **19 active use cases** (UC-001…UC-025; retired IDs are kept so IDs are never reused) — each with goal, trigger, main/alternative/error flows and testable acceptance criteria |
| [`business-rules.md`](docs/business-rules.md) | 34 numbered rules (BR-xxx): economics, lifecycle, staffing, load-in deduction, year sums, access, data protection |
| [`domain-model.md`](docs/domain-model.md) | Entities, fields, enums |
| [`api-contract.md`](docs/api-contract.md) | Every endpoint, request/response shape, error and field code — the single source of truth for both developers |
| [`design.md`](docs/design.md) | Design system, Layout v2 (sidebar, type scale, spacing), inline-editing rules |
| [`glossary.md`](docs/glossary.md) | Finnish ⇄ English domain terms |
| [`tasks/`](docs/tasks) | 45 developer task files with owner, dependencies and acceptance criteria |

Use cases by area:

| Area | Use cases |
|---|---|
| Access & home | UC-001 Sign in · UC-022 Year page |
| Gigs | UC-002 Create · UC-003 List · UC-004 View & edit · UC-005 Costs & staffing · UC-007 Price · UC-008 Attachments · UC-009 Move · UC-010 Cancel · UC-012 Uncancel · UC-013 History · UC-025 Delete & restore |
| People, tasks, hours | UC-014 People · UC-017 Tasks · UC-018 Log hours · UC-019 Hours totals |
| Budget | UC-020 Yearly budget |
| Development | UC-024 Local seed data |

---

## How this was built: AI agent orchestration

The whole project — specs, code, tests and this README — was produced with **[Claude Code](https://claude.com/claude-code)** working as a small, structured team. The human project owner made every product decision; the AI did the specification, implementation, review and integration.

### Roles

| Role | Who | Responsibilities |
|---|---|---|
| **Project owner** | Human | Answers questions, makes product decisions, approves specs, tries the app |
| **Project manager (PM)** | Main Claude Code session | Interviews the owner, writes specs/UCs/rules/contract and task files, delegates, reviews every branch (tests, lint, build, data-protection scan, screenshots), merges, resolves conflicts, reports |
| **Backend developer** | Sub-agent ([`.claude/agents/backend-developer.md`](.claude/agents/backend-developer.md)) | API, business logic, schema, migrations, tests — strictly to the contract |
| **UI developer** | Sub-agent ([`.claude/agents/ui-developer.md`](.claude/agents/ui-developer.md)) | Screens, components, styling, mocks, tests — strictly to the contract |
| **Integration/test developer** | Sub-agent (backend role) | Playwright end-to-end suite; reports mismatches instead of patching app code |

### The workflow

```mermaid
flowchart LR
    O([Project owner]) <-->|questions & decisions| PM[PM session]
    PM -->|vision, UCs, rules,\ndomain model, design| D[(docs/)]
    PM -->|API contract| C[(api-contract.md)]
    PM -->|task files| T[(docs/tasks)]
    T --> B1[Backend dev\nworktree]
    T --> U1[UI dev\nworktree]
    T --> U2[UI dev\nworktree]
    T --> E1[E2E dev\nworktree]
    B1 & U1 & U2 & E1 -->|branch + report| R{PM review:\ntests · lint · build\ndata scan · screenshots}
    R -->|fix requests| B1 & U1
    R -->|merge| M[(main)]
    M -->|e2e on real stack| R
```

1. **Clarify.** The PM read the spreadsheet the business ran on and interviewed the owner in short rounds of numbered questions — and repeatedly proposed *simplifications* (e.g. no "played" status, one cost list, budget as one number per category) that the owner accepted or rejected item by item.
2. **Specify.** Vision → glossary → domain model → business rules → use cases, each with a status (Draft → Review → **Approved** → Implemented). Nothing is built before approval.
3. **Contract first.** `api-contract.md` defines every endpoint and error code, so UI and backend can be built **in parallel** — the UI against MSW mocks, the backend against tests.
4. **Tasks.** One file per task, tagged `owner: ui` or `owner: backend`, with dependencies and acceptance criteria; committed before delegation so each agent's git worktree sees them.
5. **Delegate in parallel.** Each developer agent works in its **own git worktree** on its own branch. Up to **six agents ran at the same time** (e.g. six screen restyles after a shared design foundation). Shared-file conflicts were avoided by rules like "your feature folder only, one registration line in shared files".
6. **Review & integrate.** For every branch the PM re-ran tests, lint and build, scanned the diff for real names and business figures, looked at headless-browser screenshots in both themes, merged, resolved conflicts, and ran the end-to-end suite on the combined result. Work that fell short was sent back with precise feedback.
7. **Report.** After each step the owner got a short summary plus the decisions that were theirs to make.

### Waves

| Wave | What | Parallel agents |
|---|---|---|
| Specs | Owner interviews, simplification, approval of 19 UCs, API contract | PM |
| 1 Foundation | Backend scaffold, schema, seed, Google auth · UI scaffold, i18n, shell | 2 |
| 2 Gigs | Gig/cost/history/attachment API · all gig screens | 2 |
| 3 Rest | Year/people/tasks/hours/budget API · five UI screens | 6 |
| 4 Integration | Playwright e2e on the real stack · UI integration polish · fixes | 2–3 |
| 5 Design system | Tokens, dark/light, fonts, logo, shared components → six screen restyles | 1 → 6 |
| 6 Inline editing | Shared inline fields → five screens → e2e update | 1 → 5 → 1 |
| 7 Layout v2 | Collapsible icon sidebar, smaller type, spacing → five alignment passes → polish, top-bar controls, e2e | 1 → 5 → 3 |
| 8 Domain change | Technical setup / logistics / house technician: migration with data mapping · UI · e2e | 2 → 1 |

About **45 tasks, 190 commits and 45 reviewed merges** over three days.

### Lessons the process encoded
- **Owner decides, PM proposes.** Every open question got a recommended default; silence never counted as approval for anything destructive.
- **Tests guard the merges, not the agents' word.** The PM re-ran every check itself; e2e failures were analysed per test (outdated test vs. real bug) before anything was changed, and assertions were never loosened just to pass.
- **Parallelism needs boundaries.** Feature folders, one-line shared registrations, separate test databases and ports per agent, and messages to running agents when the shared code moved.
- **Data protection is part of review.** Every diff was scanned; an example seed that happened to contain two real figures was sent back, and branches whose history contained a scrubbed value were squash-merged so it never entered `main`.

---

## Testing

| Suite | Size | What |
|---|---|---|
| Backend | ~290 tests | Every endpoint (success + errors) and business rule against a real PostgreSQL test database, incl. migration data-mapping tests |
| Frontend | ~305 tests | Components, inline-editing behaviour, every screen against MSW mocks, i18n completeness, formatting |
| End-to-end | 136 tests (2 viewports) | Playwright against the real backend, frontend and a fresh database at 375 px and 1280 px: all flows, inline saves surviving reload, Esc/invalid values not saved, no Edit buttons, sidebar/drawer behaviour, no horizontal scroll on any page. 106 run per full pass; 30 are viewport-specific skips or documented `fixme`s |

```bash
cd backend  && npm test && npm run lint
cd frontend && npm test && npm run lint && npm run build
cd e2e      && npm install && npx playwright install chromium && npm run e2e
```

Findings from the e2e suite are tracked in [`e2e/FINDINGS.md`](e2e/FINDINGS.md).

---

## Data protection

Rule **BR-090**, enforced in every review:

- The repository contains **no real names, customer data, business figures (fees, prices, budgets) or secrets** — code and generic specs only.
- Real data lives only locally and is git-ignored: `backend/.env`, `backend/seed/seed.local.json`, uploaded files, the original spreadsheet and design references.
- Business values (default fees, load-in deduction, budget categories, lineup templates, allowed sign-in domain) are **configuration from the local seed / `.env`**, never hard-coded.
- Tests, mocks, the example seed and these screenshots use synthetic data only.

---

## Repository layout

```
.claude/agents/      Role definitions for the developer sub-agents
docs/                Vision, use cases, business rules, domain model, API contract, design, tasks, screenshots
backend/             Fastify + Prisma API, migrations, seed loader, tests
frontend/            React app (src/features/*, shared components, inline fields, mocks, styleguide)
e2e/                 Playwright end-to-end suite against the real stack
docker-compose.yml   PostgreSQL for development and tests
CLAUDE.md            Instructions for the PM and developer agents
```

---

## Open items
- Small accessibility fix: collapsed-sidebar tooltips are read twice by screen readers (e2e F-005).
- Minor alignment: gig price total vs. price field; year-page budget table at ~900 px.
- Deployment is intentionally out of scope for now (local development only).

---

<sub>Built with [Claude Code](https://claude.com/claude-code).</sub>
