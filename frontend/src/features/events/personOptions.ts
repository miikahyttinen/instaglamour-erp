import type { Id, Person } from '../../api/types';

/**
 * Active people, plus the current person even if they don't qualify (existing data stays
 * visible). `partnersOnly` (SALES / PRODUCTION lines): only people linked to an active partner.
 */
export const selectablePeople = (people: Person[] | undefined, value: Id | null, partnersOnly = false) =>
  (people ?? []).filter((p) => p.id === value || (p.active && (!partnersOnly || p.partner?.active === true)));
