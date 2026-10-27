/** Database rows → contract JSON shapes (docs/api-contract.md "Shared objects"). */
import { currentYear } from './domain/dates.js';
import { normalizeRoles, type MusicianRole } from './domain/enums.js';
import type { Partner, Person } from './generated/prisma/client.js';

export interface PartnerDto {
  id: string;
  personId: string;
  name: string;
  email: string;
  language: 'fi' | 'en';
  selectedYear: number;
  active: boolean;
}

export function toPartnerDto(partner: Partner & { person: Person }, now = new Date()): PartnerDto {
  return {
    id: partner.id,
    personId: partner.personId,
    name: partner.person.name,
    email: partner.email,
    language: partner.language,
    selectedYear: partner.selectedYear ?? currentYear(now),
    active: partner.active,
  };
}

type PersonPartner = { id: string; email: string; active: boolean };

export interface PersonDto {
  id: string;
  name: string;
  active: boolean;
  /** UC-032: null = never a partner. */
  partner: PersonPartner | null;
  /** TASK-027: roles the person can play, unique, in MUSICIAN_ROLES order. */
  roles: MusicianRole[];
  /** TASK-027: played SOLD non-deleted events with a musician-role line for the person (all years). */
  eventCount: number;
}

/** Prisma `include` that loads what `toPersonDto` needs (plus `eventCount`, see src/people/store.ts). */
export const personInclude = { partner: { select: { id: true, email: true, active: true } } } as const;

export type PersonWithPartner = Person & { partner: PersonPartner | null };

export function toPersonDto(person: PersonWithPartner, eventCount: number): PersonDto {
  const { partner } = person;
  return {
    id: person.id,
    name: person.name,
    active: person.active,
    partner: partner ? { id: partner.id, email: partner.email, active: partner.active } : null,
    roles: normalizeRoles(person.roles),
    eventCount,
  };
}
