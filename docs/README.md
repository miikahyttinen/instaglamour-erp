# Documentation & specification process

This folder is the single source of truth for what Instaglamour ERP does.
Code implements what is written here — nothing more, nothing less.

## Document map

| Document | Purpose |
|---|---|
| `vision.md` | Why we build this, who uses it, scope and non-goals, phases |
| `glossary.md` | Finnish ⇄ English domain terms. Code and specs use the English term. |
| `domain-model.md` | Entities, fields, relationships, enums |
| `business-rules.md` | Numbered rules `BR-xxx` (calculations, validations, state transitions) |
| `use-cases/` | One file per use case `UC-xxx`. Index in `use-cases/README.md` |
| `specs/` | Feature specs grouping several UCs into a deliverable |
| `api-contract.md` | Endpoints and shapes — written only for Approved UCs |
| `tasks/` | Developer tasks, one per file, `owner: ui` or `owner: backend` |

## Status lifecycle

Every UC, rule set and spec has a status:

```
Draft  ──►  Review  ──►  Approved  ──►  Implemented
  ▲            │
  └────────────┘ (owner requests changes)
```

- **Draft** – PM is writing it. May be incomplete.
- **Review** – PM considers it complete; waiting for the project owner.
- **Approved** – Project owner has accepted it. Only Approved items get API contract entries and tasks.
- **Implemented** – Built, tested and merged.
- **Retired** – Removed from scope; the file stays so the ID is never reused.

Changing an Approved document requires the project owner's OK and a line in that
document's **Change log**.

## IDs and traceability

- Use cases: `UC-001`, business rules: `BR-001`, tasks: `TASK-001`. IDs are never reused.
- Every UC lists the BRs it uses. Every task lists the UCs it implements.
- Every acceptance criterion should map to at least one automated test.

Chain: **UC → BR → API endpoint → TASK → test**.

## Open questions

Unresolved questions are tracked inline in each document under **Open questions**
with an ID `Q-xxx`, and listed centrally in `vision.md`.
