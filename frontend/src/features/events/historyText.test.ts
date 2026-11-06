import { describe, expect, it } from 'vitest';
import { EVENT_HISTORY_TYPES } from '../../api/enums';
import type { EventHistoryEntry, Partner, Person } from '../../api/types';
import i18n from '../../i18n';
import { describeEntry, matchesFilter } from './historyText';

const partners = [
  { id: 'pa', personId: 'p-a', name: 'Partner A' },
  { id: 'pb', personId: 'p-b', name: 'Partner B' },
] as Partner[];
const people: Person[] = [{ id: 'p1', name: 'Person 1', active: true, partner: null, roles: [], eventCount: 0 }];
const ctx = { partners, people };

const base = { id: 'e', eventId: 'g', partnerId: 'pa', at: '2030-06-01T10:00:00.000Z', reason: null };
const entries: EventHistoryEntry[] = [
  { ...base, type: 'CREATED', details: {} },
  {
    ...base,
    type: 'UPDATED',
    details: {
      changes: [
        { field: 'priceCents', from: 100000, to: 200000 },
        { field: 'sellerId', from: 'pa', to: 'pb' },
        { field: 'technicalSetup', from: null, to: 'SET_A' },
        { field: 'logistics', from: 'OWN_VAN', to: 'RENTAL_VAN' },
        { field: 'houseTechnician', from: false, to: true },
        { field: 'notes', from: null, to: 'Note' },
      ],
      movedCostLineIds: ['l1'],
    },
  },
  {
    ...base,
    type: 'MOVED',
    reason: 'Venue asked',
    details: {
      from: { startDate: '2030-06-01', endDate: null },
      to: { startDate: '2030-07-01', endDate: '2030-07-02' },
    },
  },
  { ...base, type: 'CANCELLED', reason: 'Called off', details: {} },
  { ...base, type: 'UNCANCELLED', reason: 'Back on', details: {} },
  { ...base, type: 'DELETED', reason: 'Duplicate', details: {} },
  { ...base, type: 'RESTORED', details: {} },
  { ...base, type: 'READY_FOR_INVOICE', details: {} },
  { ...base, type: 'READY_FOR_INVOICE_CLEARED', details: {} },
  { ...base, type: 'COST_ADDED', details: { costLineId: 'l', type: 'BASS', personId: 'p1', budgetedCents: 10000 } },
  {
    ...base,
    type: 'COST_UPDATED',
    details: {
      costLineId: 'l',
      type: 'BASS',
      changes: [
        { field: 'budgetedCents', from: 10000, to: 10000 - 1000 },
        { field: 'joinsLoadIn', from: true, to: false },
        { field: 'personId', from: null, to: 'p1' },
      ],
    },
  },
  { ...base, type: 'COST_REMOVED', details: { costLineId: 'l', type: 'FUEL', personId: null, budgetedCents: 10000 } },
  { ...base, type: 'COST_PAID', details: { costLineId: 'l', type: 'BASS', actualCents: 10000 } },
  { ...base, type: 'COST_UNPAID', details: { costLineId: 'l', type: 'BASS', previousActualCents: 10000 } },
  { ...base, type: 'ATTACHMENT_ADDED', details: { attachmentId: 'a', filename: 'contract.pdf' } },
  { ...base, type: 'ATTACHMENT_REMOVED', details: { attachmentId: 'a', filename: 'contract.pdf' } },  { ...base, type: 'INVOICE_ROW_ADDED', details: { invoiceRowId: 'r', description: 'Invoice', amountCents: 10000, status: 'READY' } },
  {
    ...base,
    type: 'INVOICE_ROW_UPDATED',
    details: { invoiceRowId: 'r', description: 'Invoice', changes: [{ field: 'status', from: 'READY', to: 'SENT' }] },
  },
  { ...base, type: 'INVOICE_ROW_REMOVED', details: { invoiceRowId: 'r', description: 'Invoice', amountCents: 10000, status: 'SENT' } },
];

const describeAll = (lang: 'fi' | 'en') =>
  entries.map((e) => {
    const { title, lines } = describeEntry(i18n.getFixedT(lang), lang, e, ctx);
    return [title, ...lines].join(' | ').replace(/\s/g, ' ');
  });

describe('history descriptions (UC-013)', () => {
  it('covers every entry type', () => {
    expect(new Set(entries.map((e) => e.type))).toEqual(new Set(EVENT_HISTORY_TYPES));
  });

  it('describes every entry in Finnish with old → new values', () => {
    expect(describeAll('fi')).toEqual([
      'Keikka luotu',
      'Tietoja muutettu | Hinta: 1 000,00 € → 2 000,00 € | Myyjä: Partner A → Partner B | Tekniikka: – → Setti A | Logistiikka: Oma paku → Vuokrapaku | Talon teknikko: ei → kyllä | Muistiinpanot: – → Note | Siirrettyjä Myynti- / Tuotanto-rivejä: 1',
      'Siirretty | 1.6.2030 → 1.7.2030–2.7.2030 | Syy: Venue asked',
      'Peruttu | Syy: Called off',
      'Palautettu myydyksi | Syy: Back on',
      'Poistettu | Syy: Duplicate',
      'Palautettu poistosta',
      'Merkitty valmiiksi laskutukseen',
      'Valmis laskutukseen -merkintä peruttu',
      'Kulurivi lisätty | Basso · Person 1 · 100,00 €',
      'Kuluriviä muutettu | Basso: Budjetti: 100,00 € → 90,00 €; Roudaus ja soundcheck: kyllä → ei; Henkilö: – → Person 1',
      'Kulurivi poistettu | Polttoaine · – · 100,00 €',
      'Merkitty maksetuksi | Basso: 100,00 €',
      'Maksumerkintä poistettu | Basso: aiemmin maksettu 100,00 €',
      'Liite lisätty | contract.pdf',
      'Liite poistettu | contract.pdf',
      'Laskurivi lisätty | Invoice · 100,00 € · Valmis laskutukseen',
      'Laskuriviä muutettu | Invoice: Tila: Valmis laskutukseen → Lähetetty',
      'Laskurivi poistettu | Invoice · 100,00 € · Lähetetty',
    ]);
  });

  it('describes entries in English', () => {
    const en = describeAll('en');
    expect(en[1]).toBe(
      'Details changed | Price: €1,000.00 → €2,000.00 | Seller: Partner A → Partner B | Technical setup: – → Set A | Logistics: Own van → Rental van | House technician: no → yes | Notes: – → Note | Sales / Production lines moved: 1',
    );
    expect(en[2]).toBe('Moved | 1 Jun 2030 → 1 Jul 2030–2 Jul 2030 | Reason: Venue asked');
    expect(en[7]).toBe('Marked ready to be invoiced');
    expect(en[8]).toBe('Ready to be invoiced undone');
    expect(en[10]).toBe(
      'Cost line changed | Bass: Budget: €100.00 → €90.00; Load-in & soundcheck: yes → no; Person: – → Person 1',
    );
  });

  it('still shows older multi-choice technical setup entries', () => {
    const legacy: EventHistoryEntry = {
      ...base,
      type: 'UPDATED',
      details: {
        changes: [
          { field: 'technicalSetup', from: [], to: ['HOUSE_TECH', 'VAN'] },
          { field: 'technicalSetup', from: ['OWN_PA', 'HOUSE_TECHNICIAN'], to: 'SET_B' },
          { field: 'technicalSetup', from: ['SET_A'], to: null },
          { field: 'technicalSetup', from: 'SET_C', to: [] },
        ],
        movedCostLineIds: [],
      },
    };
    expect(describeEntry(i18n.getFixedT('fi'), 'fi', legacy, ctx).lines).toEqual([
      'Tekniikka: – → Talon tekniikka, Pakettiauto',
      'Tekniikka: Oma PA, Talon teknikko → Setti B',
      'Tekniikka: Setti A → –',
      'Tekniikka: Setti C → –',
    ]);
    expect(describeEntry(i18n.getFixedT('en'), 'en', legacy, ctx).lines[1]).toBe(
      'Technical setup: Own PA, House technician → Set B',
    );
  });

  it('still labels removed roles (HORN_1, HORN_2, TECHNICIAN) in old entries (Role cleanup)', () => {
    const added: EventHistoryEntry = {
      ...base,
      type: 'COST_ADDED',
      details: { costLineId: 'l', type: 'HORN_1', personId: 'p1', budgetedCents: 10000 },
    };
    const updated: EventHistoryEntry = {
      ...base,
      type: 'COST_UPDATED',
      details: { costLineId: 'l', type: 'TECHNICIAN', changes: [{ field: 'personId', from: null, to: 'p1' }] },
    };
    const removed: EventHistoryEntry = {
      ...base,
      type: 'COST_REMOVED',
      details: { costLineId: 'l', type: 'HORN_2', personId: null, budgetedCents: 0 },
    };
    const fi = (e: EventHistoryEntry) => describeEntry(i18n.getFixedT('fi'), 'fi', e, ctx).lines[0];
    const en = (e: EventHistoryEntry) => describeEntry(i18n.getFixedT('en'), 'en', e, ctx).lines[0];
    expect(fi(added)).toMatch(/^Puhallin 1 · Person 1 · /);
    expect(fi(updated)).toMatch(/^Teknikko: /);
    expect(fi(removed)).toMatch(/^Puhallin 2 · – · /);
    expect(en(added)).toMatch(/^Horn 1 · /);
    expect(en(updated)).toMatch(/^Technician: /);
    expect(en(removed)).toMatch(/^Horn 2 · /);
  });

  it('still labels PIANO (merged into KEYS) as "Piano" in old entries (TASK-187)', () => {
    const added: EventHistoryEntry = {
      ...base,
      type: 'COST_ADDED',
      details: { costLineId: 'l', type: 'PIANO', personId: 'p1', budgetedCents: 10000 },
    };
    expect(describeEntry(i18n.getFixedT('fi'), 'fi', added, ctx).lines[0]).toMatch(/^Piano · Person 1 · /);
    expect(describeEntry(i18n.getFixedT('en'), 'en', added, ctx).lines[0]).toMatch(/^Piano · /);
  });

  it('old entries keep their invoice status and prepayment texts (TASK-172)', () => {
    const entry: EventHistoryEntry = {
      ...base,
      type: 'UPDATED',
      details: {
        changes: [
          { field: 'invoiceStatus', from: 'NONE', to: 'READY' },
          { field: 'invoiceStatus', from: 'INVOICED', to: 'PAID' },
          { field: 'prepaymentCents', from: 0, to: 50000 },
        ],
        movedCostLineIds: [],
      },
    };
    const lines = (lang: 'fi' | 'en') =>
      describeEntry(i18n.getFixedT(lang), lang, entry, ctx).lines.map((l) => l.replace(/\s/g, ' '));
    expect(lines('fi')).toEqual([
      'Laskutus: – → Valmis laskutukseen',
      'Laskutus: Laskutettu → Maksettu',
      'Ennakkomaksu: 0,00 € → 500,00 €',
    ]);
    expect(lines('en')).toEqual([
      'Invoicing: – → Ready to be invoiced',
      'Invoicing: Invoiced → Invoice paid',
      'Prepayment: €0.00 → €500.00',
    ]);
  });

  it('describes invoice row added / updated / removed (TASK-173)', () => {
    const row = { invoiceRowId: 'r1', description: 'Prepayment', amountCents: 50000, status: 'READY' as const };
    const list: EventHistoryEntry[] = [
      { ...base, type: 'INVOICE_ROW_ADDED', details: row },
      {
        ...base,
        type: 'INVOICE_ROW_UPDATED',
        details: {
          ...row,
          status: 'PAID',
          changes: [
            { field: 'status', from: 'SENT', to: 'PAID' },
            { field: 'amountCents', from: 50000, to: 60000 },
          ],
        },
      },
      { ...base, type: 'INVOICE_ROW_REMOVED', details: { ...row, status: 'SENT' } },
      // Missing snapshot fields degrade gracefully.
      { ...base, type: 'INVOICE_ROW_REMOVED', details: {} },
      // Invoicing v3: current statuses; the automatic final invoice is marked.
      {
        ...base,
        partnerId: null,
        type: 'INVOICE_ROW_ADDED',
        details: { invoiceRowId: 'r2', description: 'Loppulasku', amountCents: 70000, status: 'NOT_SENT', auto: true },
      },
    ];
    const describe = (lang: 'fi' | 'en') =>
      list.map((e) => {
        const d = describeEntry(i18n.getFixedT(lang), lang, e, ctx);
        return [d.title, ...d.lines.map((l) => l.replace(/\s/g, ' '))];
      });
    expect(describe('fi')).toEqual([
      ['Laskurivi lisätty', 'Prepayment · 500,00 € · Valmis laskutukseen'],
      ['Laskuriviä muutettu', 'Prepayment: Tila: Lähetetty → Maksettu; Summa: 500,00 € → 600,00 €'],
      ['Laskurivi poistettu', 'Prepayment · 500,00 € · Lähetetty'],
      ['Laskurivi poistettu'],
      ['Laskurivi lisätty', 'Loppulasku · 700,00 € · Lähettämättä', 'Luotu automaattisesti'],
    ]);
    expect(describe('en')[1]).toEqual([
      'Invoice row changed',
      'Prepayment: Status: Sent → Paid; Amount: €500.00 → €600.00',
    ]);
    expect(describe('en')[4]).toEqual(['Invoice row added', 'Loppulasku · €700.00 · Not sent', 'Created automatically']);
    expect(list.every((e) => matchesFilter(e, 'details'))).toBe(true);
  });

  it('filters by category', () => {
    const types = (filter: Parameters<typeof matchesFilter>[1]) =>
      entries.filter((e) => matchesFilter(e, filter)).map((e) => e.type);
    expect(types('status')).toEqual([
      'CREATED',
      'MOVED',
      'CANCELLED',
      'UNCANCELLED',
      'DELETED',
      'RESTORED',
      'READY_FOR_INVOICE',
      'READY_FOR_INVOICE_CLEARED',
    ]);
    expect(types('details')).toEqual([
      'UPDATED',
      'ATTACHMENT_ADDED',
      'ATTACHMENT_REMOVED',
      'INVOICE_ROW_ADDED',
      'INVOICE_ROW_UPDATED',
      'INVOICE_ROW_REMOVED',
    ]);
    expect(types('all')).toHaveLength(entries.length);
  });

  it('names the purchase order of a payment made through one (UC-034)', () => {
    const paid: EventHistoryEntry = {
      ...base,
      type: 'COST_PAID',
      details: { costLineId: 'l', type: 'VOC', actualCents: 10000, purchaseOrderNumber: 'PERSON-1-0001' },
    };
    expect(describeEntry(i18n.getFixedT('fi'), 'fi', paid, ctx).lines[1]).toBe('Ostotilaus PERSON-1-0001');
    const unpaid: EventHistoryEntry = {
      ...base,
      type: 'COST_UNPAID',
      details: { costLineId: 'l', type: 'VOC', previousActualCents: 10000, purchaseOrderNumber: 'PERSON-1-0001' },
    };
    expect(describeEntry(i18n.getFixedT('en'), 'en', unpaid, ctx).lines[1]).toBe('Purchase order PERSON-1-0001');
  });
});
