import { describe, expect, it } from 'vitest';
import { budgetAmounts, setBudgetAmounts } from './budgetStore';
import { db, resetMockDb } from './data';

describe('resetMockDb', () => {
  it('resets every feature mock store to its seed', () => {
    const seeded = {
      events: db.events.events.length,
      people: db.events.people.length,
      tasks: db.tasks.tasks.length,
      hours: db.hours.entries.length,
    };
    const category = db.reference.budgetCategories[0]!.id;
    const year = new Date().getFullYear();
    const seededBudget = budgetAmounts(db.budget, year, category);

    db.events.events = [];
    db.events.people = [];
    db.tasks.tasks = [];
    db.hours.entries = [];
    setBudgetAmounts(db.budget, year, category, { budgetExpenseCents: 1000 });

    resetMockDb();
    expect(db.events.events).toHaveLength(seeded.events);
    expect(db.events.people).toHaveLength(seeded.people);
    expect(db.tasks.tasks).toHaveLength(seeded.tasks);
    expect(db.hours.entries).toHaveLength(seeded.hours);
    expect(budgetAmounts(db.budget, year, category)).toEqual(seededBudget);
    expect(seeded.tasks).toBeGreaterThan(0);
    expect(seeded.hours).toBeGreaterThan(0);
  });
});
