# UC-017: Manage tasks

- **Status:** Approved
- **Phase:** 1
- **Primary actor:** Partner
- **Replaces:** the tasks sheet
- **Business rules:** BR-030

## Goal
Share and follow the partners' to-do list.

## Trigger
Something needs to be done.

## Preconditions
- None.

## Main flow
1. Partner opens **Tasks**: open tasks by due date, overdue highlighted (title, owner, due date).
2. Partner adds a task: title, owner (default self), optional due date and description.
3. Partner marks a task done with one tap.

## Alternative flows
- **A1 – Edit / delete / reopen**.
- **A2 – Filter**: my tasks, done tasks.

## Error flows
- **E1 – Missing title** → error.

## Postconditions
- Task saved.

## Acceptance criteria
- [ ] AC-1: Default shows OPEN tasks; overdue highlighted.
- [ ] AC-2: Done sets the completion time; reopen clears it.
- [ ] AC-3: One tap to mark done on a phone.

## Change log
- 2026-10-03 – First version and iterations (PM)
- 2026-10-03 – Simplified MVP (PM)
