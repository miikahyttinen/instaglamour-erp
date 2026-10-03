/** Database rows → contract JSON shapes (docs/api-contract.md "Shared objects"). */
import { currentYear } from './domain/dates.js';
import type { Partner, Person } from './generated/prisma/client.js';

export interface PartnerDto {
  id: string;
  personId: string;
  name: string;
  email: string;
  language: 'fi' | 'en';
  selectedYear: number;
}

export function toPartnerDto(partner: Partner & { person: Person }, now = new Date()): PartnerDto {
  return {
    id: partner.id,
    personId: partner.personId,
    name: partner.person.name,
    email: partner.email,
    language: partner.language,
    selectedYear: partner.selectedYear ?? currentYear(now),
  };
}

export interface PersonDto {
  id: string;
  name: string;
  active: boolean;
}

export function toPersonDto(person: Person): PersonDto {
  return { id: person.id, name: person.name, active: person.active };
}
