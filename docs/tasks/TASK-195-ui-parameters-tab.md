# TASK-195: Settings — Parameters tab

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "Settings: Parameters tab (owner request 2026-11-09)"
- **depends on:** none (MSW mocks)

## Acceptance criteria
- [ ] Third tab "Parametrit / Parameters" in Asetukset (`/settings/parameters`) after Kokoonpanot and Tietojen tuonti (or before import — keep import last).
- [ ] Lists parameters from `GET /api/settings/parameters` in order: label + help text from i18n keyed by parameter key (`fees.load_in_deduction` → FI "Soundcheck-vähennys", help "Vähennetään muusikon palkkiosta, kun Roudaus ja soundcheck on pois päältä, ja freelancerin ostotilauksella. Ei muuta jo tehtyjä rivejä."; EN "Sound check deduction", "Subtracted from a musician's fee when load-in & sound check is off, and on freelancer purchase orders. Doesn't change existing lines."); unknown keys fall back to the key text.
- [ ] Inline money field (same InlineMoney pattern as elsewhere): Enter/blur saves via PATCH, Esc reverts, inline errors; shows "Muutettu <date time> · <partner>" when set.
- [ ] After save, reference data is refreshed so the gig page and new cost lines use the new value.
- [ ] Mobile-friendly. MSW mocks; unit tests; e2e spec (change value, see it persist, a later load-in switch-off on a new line uses it) — may need TASK-057; say if not run. Tests, lint, build pass.
