/**
 * Who may sign in / be a partner (BR-070, BR-110): an email in AUTH_ALLOWED_DOMAIN (exact domain,
 * no subdomains) or one of the exact addresses in AUTH_EXTRA_ALLOWED_EMAILS. The one shared check
 * for Google sign-in, dev login and partner email validation (PUT /api/people/{id}/partner, import).
 * Being allowed is not enough to sign in: the address must also belong to an active partner.
 */
import type { AppConfig } from '../config.js';

export type AllowedEmailConfig = Pick<AppConfig, 'authAllowedDomain' | 'authExtraAllowedEmails'>;

/** The email's domain is exactly `allowedDomain` (case-insensitive, no subdomains). */
export function isInAllowedDomain(email: string, allowedDomain: string): boolean {
  const allowed = allowedDomain.trim().toLowerCase();
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  return allowed.length > 0 && at > 0 && normalized.slice(at + 1) === allowed;
}

/** The email is listed in AUTH_EXTRA_ALLOWED_EMAILS (exact address, case-insensitive). */
export function isExtraAllowedEmail(config: Pick<AppConfig, 'authExtraAllowedEmails'>, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && config.authExtraAllowedEmails.includes(normalized);
}

export function isAllowedEmail(config: AllowedEmailConfig, email: string): boolean {
  return isInAllowedDomain(email, config.authAllowedDomain) || isExtraAllowedEmail(config, email);
}
