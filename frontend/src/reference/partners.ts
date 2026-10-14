import type { Id, Partner } from '../api/types';

// Partner pickers (UC-032, BR-111): `/api/reference.partners` lists every partner, including
// removed (inactive) ones, so old gigs, offers, tasks and hours still show their names. New
// choices (seller, producer, task owner, offer seller) offer only active partners.

export interface PartnerOption {
  value: Id;
  label: string;
}

const NO_PARTNERS: Partner[] = [];

/** `active` missing (older backend) counts as active. */
export function isActivePartner(partner: Partner): boolean {
  return partner.active !== false;
}

/** Partners that can be chosen for new records, in reference order. */
export function activePartners(partners: readonly Partner[] | undefined): Partner[] {
  return (partners ?? NO_PARTNERS).filter(isActivePartner);
}

/**
 * Options for a partner select: active partners, plus the record's current partner when it is
 * inactive (shown by name, so the saved value still renders). An id that is not in the
 * reference data at all shows as `unknownLabel`.
 */
export function partnerOptions(
  partners: readonly Partner[] | undefined,
  currentId?: Id | null,
  unknownLabel = '–',
): PartnerOption[] {
  const all = partners ?? NO_PARTNERS;
  const options = activePartners(all).map((p) => ({ value: p.id, label: p.name }));
  if (!currentId || options.some((o) => o.value === currentId)) return options;
  const current = all.find((p) => p.id === currentId);
  return [{ value: currentId, label: current?.name ?? unknownLabel }, ...options];
}
