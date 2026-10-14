// Partner status helpers (UC-032, BR-110).
import type { FieldCode } from '../../api/enums';
import type { Person } from '../../api/types';
import { allowedEmailDomain } from '../../config';

export const EMAIL_MAX = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the person is an active partner (UC-032). */
export function isPartner(person: Pick<Person, 'partner'>): boolean {
  return person.partner?.active === true;
}

/**
 * Client-side email check (the server decides, BR-110): looks like an email and, when the domain
 * is configured (`VITE_AUTH_ALLOWED_DOMAIN`), is in that domain.
 */
export function checkPartnerEmail(email: string, domain = allowedEmailDomain()): FieldCode | null {
  if (!email) return 'REQUIRED';
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return 'INVALID_VALUE';
  if (domain && !email.toLowerCase().endsWith(`@${domain}`)) return 'INVALID_VALUE';
  return null;
}

