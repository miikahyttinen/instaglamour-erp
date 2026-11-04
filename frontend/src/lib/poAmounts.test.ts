import { describe, expect, it } from 'vitest';
import { formatVatRate, poLineAmounts, poLineAmountsFor, soundcheckLockedOff } from './poAmounts';

const settings = { soundcheckDeductionCents: 1500 };

describe('poLineAmounts', () => {
  it('no VAT, at the sound check: amount = fee', () => {
    expect(poLineAmounts(10000, true, 0, settings)).toEqual({ baseCents: 10000, deductionCents: 0, vatCents: 0, amountCents: 10000 });
  });
  it('missed sound check deducts the setting; VAT on the net, rounded to cents', () => {
    expect(poLineAmounts(10000, false, 1350, settings)).toEqual({ baseCents: 10000, deductionCents: 1500, vatCents: 1148, amountCents: 9648 });
  });
  it('deduction never takes the amount below 0', () => {
    expect(poLineAmounts(1000, false, 1350, settings)).toEqual({ baseCents: 1000, deductionCents: 1000, vatCents: 0, amountCents: 0 });
  });
  it('uses the given rate', () => {
    expect(poLineAmounts(10001, true, 2400, { soundcheckDeductionCents: 0 }).amountCents).toBe(12401);
    expect(poLineAmounts(10000, true, 2550, { soundcheckDeductionCents: 0 })).toEqual({ baseCents: 10000, deductionCents: 0, vatCents: 2550, amountCents: 12550 });
  });
  it('formats the rate', () => {
    expect(formatVatRate(1350, 'fi')).toBe('13,5 %');
    expect(formatVatRate(1350, 'en')).toBe('13.5 %');
    expect(formatVatRate(2400, 'fi')).toBe('24 %');
    expect(formatVatRate(2550, 'fi')).toBe('25,5 %');
    expect(formatVatRate(2550, 'en')).toBe('25.5 %');
  });
});

describe('poLineAmountsFor (sound check already set on the gig)', () => {
  const locked = { joinsLoadIn: false, loadInDeductionAppliedCents: 1500 };
  it('joinsLoadIn false: locked off, original fee + the applied deduction once, VAT on the budgeted fee', () => {
    // budgeted 8500 = 10000 − 1500 already deducted on the gig.
    expect(poLineAmountsFor(locked, 8500, true, 1350, settings)).toEqual({
      soundcheck: false,
      baseCents: 10000,
      deductionCents: 1500,
      vatCents: 1148,
      amountCents: 9648,
    });
    // The requested flag never adds a second deduction.
    expect(poLineAmountsFor(locked, 8500, false, 0, settings)).toEqual({
      soundcheck: false,
      baseCents: 10000,
      deductionCents: 1500,
      vatCents: 0,
      amountCents: 8500,
    });
  });
  it('joinsLoadIn false without an applied amount: nothing deducted', () => {
    expect(poLineAmountsFor({ joinsLoadIn: false, loadInDeductionAppliedCents: null }, 8500, true, 0, settings)).toEqual({
      soundcheck: false,
      baseCents: 8500,
      deductionCents: 0,
      vatCents: 0,
      amountCents: 8500,
    });
  });
  it('joinsLoadIn true / null: unchanged rule', () => {
    for (const joinsLoadIn of [true, null]) {
      const line = { joinsLoadIn, loadInDeductionAppliedCents: null };
      expect(soundcheckLockedOff(line)).toBe(false);
      expect(poLineAmountsFor(line, 10000, false, 1350, settings)).toEqual({ soundcheck: false, ...poLineAmounts(10000, false, 1350, settings) });
      expect(poLineAmountsFor(line, 10000, true, 0, settings)).toEqual({ soundcheck: true, ...poLineAmounts(10000, true, 0, settings) });
    }
    expect(soundcheckLockedOff(locked)).toBe(true);
  });
});
