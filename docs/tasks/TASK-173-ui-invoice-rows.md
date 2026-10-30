# TASK-173: Invoice rows on the gig page (UI)
- **owner:** ui · **status:** done · **spec:** api-contract "Invoice rows" · **parallel:** TASK-046
## Acceptance criteria
- [ ] Gig page "Laskutus" card (under the price card): a small table of invoice rows — description (inline text), amount (inline money), status (inline select: Valmis laskutukseen / Lähetetty / Maksettu, colour tags light green / amber / dark green), last change who/when, remove (confirm). **"+ Lisää laskurivi / Add invoice row"** form (description, amount, status default Valmis laskutukseen). Below: **Laskutettu** (Σ sent+paid), **Maksettu** (Σ paid), **Saldo / Balance** = total − paid (yellow if < 0). Remove the old status select and Ennakkomaksu field.
- [ ] Keikat list: "Laskutus" column shows the derived `invoiceState` tag (– / Valmis laskutukseen light green / Laskutettu amber / Osittain maksettu blue / Maksettu dark green), sortable in that order and filterable; "Saldo" column = `balanceCents`.
- [ ] History texts for row added/updated/removed; old entries keep their texts.
- [ ] Types, endpoints, MSW mocks per contract; tests; e2e update (allowed) and run gig specs after TASK-046 is on main (I'll tell you; else report pending); lint, build; headless 375/1440 both themes.
