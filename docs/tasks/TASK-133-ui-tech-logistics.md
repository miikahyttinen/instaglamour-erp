# TASK-133: Technical setup dropdown, logistics dropdown, house technician switch — UI

- **owner:** ui
- **status:** todo
- **spec:** api-contract.md (GigSummary, GigCreate, GigUpdate, Reference), glossary.md
- **depends on:** none (backend TASK-010 runs in parallel)

## Acceptance criteria
- [ ] Types/enums: `technicalSetup: TechnicalSetup | null`, `logistics: Logistics | null`, `houseTechnician: boolean`; reference has `technicalSetups` and `logistics`.
- [ ] New gig form: Technical setup select (— / House tech / Set A / Set B / Set C), Logistics select (— / Own van / Rental van / Taxi / Other), House technician switch; replaces the checkbox group.
- [ ] Gig page basic info: same three as inline fields (`InlineSelect` ×2 save on change, `InlineSwitch` saves on change), in the FieldList.
- [ ] FI/EN labels: Tekniikka / Technical setup (Talon tekniikka, Setti A, Setti B, Setti C), Logistiikka / Logistics (Oma paku, Vuokrapaku, Taksi, Muu), Talon teknikko / House technician. Remove unused old labels (OWN_PA, VAN, HOUSE_TECHNICIAN as setup).
- [ ] Gig history texts show old → new for the three fields.
- [ ] MSW mocks + mock seed updated; unit tests updated; tests, lint, build pass.
- [ ] Remove `InlineCheckboxGroup` usages if none remain (keep the component). Do not edit `backend/` or `e2e/`.
