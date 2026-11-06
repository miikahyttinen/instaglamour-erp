import { isMusicianRole, isPartnerOnlyType, type CostType, type MusicianRole } from '../../api/enums';
import type { Id, Person } from '../../api/types';

/** Line type whose picker lists only people with that role (every musician role but OTHER_ROLE). */
export const roleFilterOf = (type: CostType | '' | null | undefined): MusicianRole | null =>
  type && isMusicianRole(type) && type !== 'OTHER_ROLE' ? type : null;

/**
 * People offered on a cost line of `type` (TASK-185): active people, narrowed by the type —
 * SALES / PRODUCTION: only people linked to an active partner; a musician role other than
 * OTHER_ROLE: only people whose `roles` include it; anything else (OTHER_ROLE, other internal
 * roles, expenses, no type yet): everyone. The current person (`value`) is always kept, even if
 * they don't qualify (existing data stays visible).
 */
export const selectablePeople = (
  people: Person[] | undefined,
  value: Id | null,
  type: CostType | '' | null = null,
) => {
  const partnersOnly = !!type && isPartnerOnlyType(type);
  const role = roleFilterOf(type);
  return (people ?? []).filter(
    (p) =>
      p.id === value ||
      (p.active && (!partnersOnly || p.partner?.active === true) && (role === null || p.roles.includes(role))),
  );
};
