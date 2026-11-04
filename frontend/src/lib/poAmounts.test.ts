import { describe, expect, it } from 'vitest';
import { formatVatRate, poLineAmounts } from './poAmounts';

const settings = { soundcheckDeductionCents: 1500, vatRateBp: 1350 };

describe('poLineAmounts', () => {
  it('no VAT, at the sound check: amount = fee', () => {
    expect(poLineAmounts(10000, true, false, settings)).toEqual({ baseCents: 10000, deductionCents: 0, vatCents: 0, amountCents: 10000 });
  });
  it('missed sound check deducts the setting; VAT on the net, rounded to cents', () => {
    expect(poLineAmounts(10000, false, true, settings)).toEqual({ baseCents: 10000, deductionCents: 1500, vatCents: 1148, amountCents: 9648 });
  });
  it('deduction never takes the amount below 0', () => {
    expect(poLineAmounts(1000, false, true, settings)).toEqual({ baseCents: 1000, deductionCents: 1000, vatCents: 0, amountCents: 0 });
  });
  it('uses the given rate', () => {
    expect(poLineAmounts(10001, true, true, { soundcheckDeductionCents: 0, vatRateBp: 2400 }).amountCents).toBe(12401);
  });
  it('formats the rate', () => {
    expect(formatVatRate(1350, 'fi')).toBe('13,5 %');
    expect(formatVatRate(1350, 'en')).toBe('13.5 %');
    expect(formatVatRate(2400, 'fi')).toBe('24 %');
  });
});
