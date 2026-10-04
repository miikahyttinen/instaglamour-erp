import { describe, expect, it } from 'vitest';
import { varianceClass, varianceTone } from './variance';

describe('varianceTone', () => {
  it('expense: under budget is ok, over budget is danger', () => {
    expect(varianceTone('expense', 100)).toBe('ok');
    expect(varianceTone('expense', -100)).toBe('danger');
  });

  it('income: above budget is ok, below budget is danger', () => {
    expect(varianceTone('income', -100)).toBe('ok');
    expect(varianceTone('income', 100)).toBe('danger');
  });

  it('zero has no colour', () => {
    expect(varianceTone('expense', 0)).toBeUndefined();
    expect(varianceClass('income', 0)).toBe('');
    expect(varianceClass('expense', 100)).toBe('budget-variance-ok');
  });
});
