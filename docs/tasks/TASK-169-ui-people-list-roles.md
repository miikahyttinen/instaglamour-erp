# TASK-169: People list read-only with name links; role cleanup in UI
- **owner:** ui · **status:** done · **spec:** owner request 2026-10-30; api-contract "Role cleanup" · **parallel:** TASK-041
## Acceptance criteria
- [ ] **Henkilöt list is read-only:** no inline editing (name, active, roles) in the list/table or phone cards. The **name is a link** to the person page (`/people/:id`), keyboard accessible. Editing stays on the person page. Adding a new person on the list page stays.
- [ ] Roles: remove `HORN_1`, `HORN_2`, `TECHNICIAN` from role pickers, filters (Rooli), labels and mocks; `MIX` labelled **"Miksaus" / "Mixing"**. History texts still label old codes ("Horn 1", "Horn 2", "Teknikko") so old entries render.
- [ ] Tests, lint, build; update e2e specs that edit people in the list or use the removed roles (allowed) and run them after TASK-041 is on main (fresh E2E_DB_NAME, free ports); headless check 375/1440.
