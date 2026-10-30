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
  { ...base, type: 'ATTACHMENT_REMOVED', details: { attachmentId: 'a', filename: 'contract.pdf' } },
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
      'Kulurivi lisätty | Basso · Person 1 · 100,00 €',
      'Kuluriviä muutettu | Basso: Budjetti: 100,00 € → 90,00 €; Roudaus ja soundcheck: kyllä → ei; Henkilö: – → Person 1',
      'Kulurivi poistettu | Polttoaine · – · 100,00 €',
      'Merkitty maksetuksi | Basso: 100,00 €',
      'Maksumerkintä poistettu | Basso: aiemmin maksettu 100,00 €',
      'Liite lisätty | contract.pdf',
      'Liite poistettu | contract.pdf',
    ]);
  });

  it('describes entries in English', () => {
    const en = describeAll('en');
    expect(en[1]).toBe(
      'Details changed | Price: €1,000.00 → €2,000.00 | Seller: Partner A → Partner B | Technical setup: – → Set A | Logistics: Own van → Rental van | House technician: no → yes | Notes: – → Note | Sales / Production lines moved: 1',
    );
    expect(en[2]).toBe('Moved | 1 Jun 2030 → 1 Jul 2030–2 Jul 2030 | Reason: Venue asked');
    expect(en[8]).toBe(
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

  it('filters by category', () => {
    const types = (filter: Parameters<typeof matchesFilter>[1]) =>
      entries.filter((e) => matchesFilter(e, filter)).map((e) => e.type);
    expect(types('status')).toEqual(['CREATED', 'MOVED', 'CANCELLED', 'UNCANCELLED', 'DELETED', 'RESTORED']);
    expect(types('details')).toEqual(['UPDATED']);
    expect(types('attachments')).toEqual(['ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED']);
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
