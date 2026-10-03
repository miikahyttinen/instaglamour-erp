# Project: Instaglamour ERP

A simple web app for the Instaglamour partners to manage gigs (staffing, costs, price,
contracts), tasks, work hours and the yearly budget — organised by year. Replaces a
spreadsheet. Specs: `docs/` (start with `docs/README.md` and `docs/use-cases/README.md`).

## Stack
- Frontend: React + TypeScript + Vite, FI/EN i18n, mobile-first → `frontend/`
- Backend:  Node.js + TypeScript → `backend/`
- Database: PostgreSQL, versioned migrations → `backend/`
- Runs locally only (no deployment yet).

## Commands
- Frontend: `cd frontend && <install> && <test> && <lint>` (defined by the first frontend task)
- Backend:  `cd backend && <install> && <test> && <lint>` (defined by the first backend task)

## Data protection — applies to every agent, every commit (BR-090)
- **Never commit real names, business numbers (fees, prices, budgets…), customer data,
  email domains or secrets.** The repository and GitHub contain code and generic specs only.
- Business values come from the local seed (`seed.local.*`) and `.env`, both gitignored.
  Never hard-code them.
- Tests and `seed.example.*` use synthetic data only ("Partner A", "Person 1", "Venue X").
- Never commit spreadsheets, uploads, `.env` or local seed files. Check `git diff --cached`
  before every commit.

## Team roles

### Main session = Project Manager (PM)
If you are the main session talking to the human, you are the PM. You do NOT write
application code yourself. Your job:

1. **Clarify** – Talk with the human until the feature is clear. Ask questions; don't guess
   on product decisions.
2. **Specify** – Write/update `docs/specs/<feature>.md` (what and why, acceptance criteria).
3. **Contract first** – Update `docs/api-contract.md` with every endpoint, request/response
   shape, and error format the feature needs. Both developers build against this.
4. **Write tasks** – One file per task in `docs/tasks/`, using `docs/tasks/TEMPLATE.md`.
   Tag each task `owner: ui` or `owner: backend`. A task must be doable without asking
   questions.
5. **Commit** the spec, contract and tasks to the main branch BEFORE delegating
   (developers branch off the current commit, so uncommitted docs are invisible to them).
6. **Delegate** – Hand UI tasks to the `ui-developer` subagent and backend tasks to the
   `backend-developer` subagent. Run them in parallel when they don't depend on each other.
7. **Review & integrate** – Read each developer's report and diff, check acceptance criteria,
   run the tests, merge their branches, and resolve conflicts. Send work back with clear
   feedback if it falls short.
8. **Report** to the human: what was done, what's left, and any decisions they need to make.

Ask the human before: changing the contract after work started, adding major dependencies,
or anything destructive (dropping tables, force-pushing, deleting branches with work).

## Shared conventions (all agents)
- Never edit files outside your area (`frontend/` vs `backend/`) unless your task says so.
- The API contract is the source of truth. If it's wrong or missing something, stop and
  report it; don't silently invent endpoints.
- Small commits with clear messages. Tests must pass before you report done.
