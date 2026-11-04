# TASK-176: Invoicing v3 (UI)
- **owner:** ui · **status:** todo · **spec:** api-contract "Invoicing v3" · **parallel:** TASK-049
## Acceptance criteria
- [ ] Invoice rows: status select **Lähettämättä / Lähetetty** (Not sent / Sent), default Lähettämättä; colours: Lähettämättä yellow, Lähetetty green. Remove all "paid" UI.
- [ ] Laskutus card figures: **Lähetetty** (sentCents), **Lähettämättä** (notSentCents), **Laskuttamatta** (balanceCents = total − sent). Auto-created "Loppulasku" rows show a small "automaattinen / automatic" hint.
- [ ] Gig state tag (Keikat table, phone rows, gig page Laskutus card): Avoimia laskuja (yellow), Laskutettu (solid dark green), Osittain laskutettu (blue), "–". One Laskutus filter with these values.
- [ ] Types, mocks (derive per contract; mock job not needed), tests, i18n FI/EN; update e2e 18 (allowed) and run it after TASK-049 is on main (I'll tell you); lint, build; headless check 375/1440 both themes.
