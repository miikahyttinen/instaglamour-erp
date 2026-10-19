# TASK-154: Data import page
- **owner:** ui · **status:** todo · **spec:** UC-035, api-contract "Data import" · **depends on:** none · **parallel:** TASK-026
## Acceptance criteria
- [ ] Nav item **Tietojen tuonti / Data import** (icon `Upload`), last item in the left menu; route `/import`.
- [ ] Page: file chooser (`.json`, also drag & drop), shows file name and size; > 10 MB rejected client-side with a message. Read file as text, parse JSON client-side (parse error → message), send as body with `filename`.
- [ ] **Tarkista / Check** → dry run → table per data type (FI/EN labels): Luodaan / Päivitetään / Ohitetaan. **Tuo / Import** enabled only after a successful check of the currently chosen file; confirm dialog ("Tuonti lisää puuttuvat tiedot. Olemassa olevia tietoja ei muuteta eikä poisteta.") → result table + success message; invalidate all queries afterwards (everything may have changed).
- [ ] Validation errors: list every `details.errors` item (scrollable, monospace), nothing imported.
- [ ] **Tuontihistoria / Import history** table: time, partner, file name, totals (created/updated/skipped summed) with details on expand.
- [ ] MSW mock for both endpoints (synthetic), tests (check, import, errors, too large, history, nav order incl. `AppShell.test` and e2e nav tests if they assert the full menu), lint, build; full-width layout, no sideways scroll; README.
