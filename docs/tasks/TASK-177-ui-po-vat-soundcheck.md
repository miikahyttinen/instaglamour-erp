# TASK-177: Freelancer PO modal with VAT and sound check (UI)
- **owner:** ui · **status:** done · **spec:** api-contract "Freelancer PO: VAT and sound check" · **parallel:** TASK-050
## Acceptance criteria
- [ ] Freelancer page (`/f/:token`): the fee column header is **"Palkkio alv 0 %" / "Fee excl. VAT"**.
- [ ] "Luo ostotilausnumero" opens a **modal**: question **"Oletko ALV-velvollinen?" / "Are you VAT-registered?"** (Kyllä / Ei, required), and for **each selected gig** a switch **"Olin soundcheckissä" / "I was at the sound check"** (default on). Live preview per row and total: fee alv 0 %, − sound check deduction when off (amount from `FreelancerView.settings`), + ALV 13,5 % when yes (rate from settings), final amount. Confirm → POST with the new body → success as before (new PO shown with its number).
- [ ] PO list on the freelancer page and the partner PO page show the breakdown (base, deduction, VAT, total) and "ALV-velvollinen: Kyllä/Ei".
- [ ] FI/EN texts, keyboard-accessible modal, phone layout (no sideways scroll); MSW mocks per contract; tests; update e2e 20 (allowed) and run it after TASK-050 is on main (I'll tell you); lint, build.
