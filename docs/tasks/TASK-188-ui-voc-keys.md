# TASK-188: UI — musician role VOC_KEYS "Vocal & Keys"

- **owner:** ui
- **status:** done
- **spec:** docs/api-contract.md "New musician role "Vocal & Keys" (owner request 2026-11-07)"
- **depends on:** none

## Acceptance criteria
- [ ] `VOC_KEYS` in frontend enums right after `BACKING_VOC`; labels FI "Laulu & koskettimet", EN "Vocal & Keys"; MSW reference includes it in musicianRoles and personRoles.
- [ ] Appears in cost line type selects, lineup editor, person role checkboxes and role filter. Unit tests updated (i18n completeness etc.); tests, lint, build pass.
