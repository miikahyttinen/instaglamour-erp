/** Pure event rules: economics (BR-001…BR-006), played (BR-010), staffing (BR-023), year sums (BR-082), load-in (BR-026). */
import { describe, expect, it } from 'vitest';
import { eventEconomics, isNotFullyStaffed, isPlayed, marginPct, yearEventSummary } from '../src/domain/eventEconomics.js';
import { switchLoadIn } from '../src/domain/loadIn.js';

const line = (budgetedCents: number, paid?: number) => ({
  type: 'VOC',
  personId: null,
  budgetedCents,
  actualCents: paid ?? null,
  paidAt: paid === undefined ? null : new Date(),
});

describe('eventEconomics', () => {
  it('computes total price, budgeted/actual costs and margins', () => {
    const e = eventEconomics({
      priceCents: 100000,
      additionalSalesCents: 20000,
      costLines: [line(30000), line(20000, 10000), line(10000)],
    });
    expect(e).toEqual({
      totalPriceCents: 120000, // BR-006
      budgetedCostsCents: 60000, // BR-001
      actualCostsCents: 10000, // BR-002: paid lines only
      marginBudgetCents: 60000,
      marginActualCents: 110000,
      marginBudgetPct: 50,
      marginActualPct: 91.7,
    });
  });

  it('ignores actual amounts of unpaid lines', () => {
    const unpaidWithAmount = { ...line(10000), actualCents: 10000 };
    expect(eventEconomics({ priceCents: 0, additionalSalesCents: 0, costLines: [unpaidWithAmount] }).actualCostsCents).toBe(0);
  });

  it('has null percentages when total price is 0 (BR-004)', () => {
    const e = eventEconomics({ priceCents: 0, additionalSalesCents: 0, costLines: [line(10000)] });
    expect(e.marginBudgetPct).toBeNull();
    expect(e.marginActualPct).toBeNull();
    expect(e.marginBudgetCents).toBe(-10000);
  });
});

describe('marginPct', () => {
  it('rounds to 1 decimal', () => {
    expect(marginPct(10000, 30000)).toBe(33.3);
    expect(marginPct(20000, 30000)).toBe(66.7);
    expect(marginPct(-10000, 30000)).toBe(-33.3);
    expect(marginPct(0, 10000)).toBe(0);
    expect(Object.is(marginPct(-1, 1_000_000), -0)).toBe(false);
  });
});

describe('isPlayed / isNotFullyStaffed', () => {
  it('played = SOLD and start date before today', () => {
    expect(isPlayed('SOLD', '2026-06-14', '2026-06-15')).toBe(true);
    expect(isPlayed('SOLD', '2026-06-15', '2026-06-15')).toBe(false);
    expect(isPlayed('CANCELLED', '2026-06-14', '2026-06-15')).toBe(false);
  });

  it('not fully staffed = a musician-role line without a person', () => {
    expect(isNotFullyStaffed([{ type: 'VOC', personId: null }])).toBe(true);
    expect(isNotFullyStaffed([{ type: 'VOC', personId: 'x' }, { type: 'OFFICE', personId: null }])).toBe(false);
    expect(isNotFullyStaffed([{ type: 'FUEL', personId: null }])).toBe(false);
    expect(isNotFullyStaffed([])).toBe(false);
  });
});

describe('yearEventSummary (BR-082)', () => {
  it('counts SOLD and CANCELLED separately and sums both', () => {
    const s = yearEventSummary([
      { status: 'SOLD', priceCents: 100000, additionalSalesCents: 0, costLines: [line(30000, 30000)] },
      { status: 'CANCELLED', priceCents: 20000, additionalSalesCents: 10000, costLines: [line(20000)] },
    ]);
    expect(s).toEqual({
      eventCount: 1,
      cancelledCount: 1,
      soldEventsSumCents: 130000,
      budgetedCostsCents: 50000,
      actualCostsCents: 30000,
      marginBudgetCents: 80000,
      marginActualCents: 100000,
    });
  });
});

describe('switchLoadIn (BR-026)', () => {
  const on = { budgetedCents: 30000, joinsLoadIn: true, loadInDeductionAppliedCents: null };

  it('off deducts the setting and remembers the amount', () => {
    expect(switchLoadIn(on, false, 10000)).toEqual({ budgetedCents: 20000, joinsLoadIn: false, loadInDeductionAppliedCents: 10000 });
  });

  it('never goes below 0 and remembers only what was deducted', () => {
    const small = { budgetedCents: 10000, joinsLoadIn: true, loadInDeductionAppliedCents: null };
    expect(switchLoadIn(small, false, 20000)).toEqual({ budgetedCents: 0, joinsLoadIn: false, loadInDeductionAppliedCents: 10000 });
  });

  it('on restores the remembered amount even if the setting changed', () => {
    const off = switchLoadIn(on, false, 10000);
    expect(switchLoadIn(off, true, 1000)).toEqual(on);
  });

  it('same value is a no-op', () => {
    expect(switchLoadIn(on, true, 10000)).toBe(on);
    const off = switchLoadIn(on, false, 10000);
    expect(switchLoadIn(off, false, 10000)).toBe(off);
  });
});
