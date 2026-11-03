/**
 * Data import from the app (UC-035, BR-120, BR-121): the seed format and the seed loader's rules,
 * plus import-only safety checks. Nothing here touches the filesystem.
 */
import type { ImportRun } from '../generated/prisma/client.js';
import { isAllowedEmail, type AllowedEmailConfig } from '../auth/allowedEmail.js';
import type { SeedSummary } from '../../seed/load.js';

/** BR-121: the largest import file. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** How many runs GET /api/import/runs returns (newest first). */
export const IMPORT_RUNS_LIMIT = 50;

export const IMAGE_NOT_ALLOWED = 'image paths are not allowed in an import';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks that apply to an import but not to the seed command (BR-121), on the raw document so they
 * are reported together with the seed validation errors:
 * - every partner email must be in AUTH_ALLOWED_DOMAIN or AUTH_EXTRA_ALLOWED_EMAILS (a partner can sign in);
 * - no reference may have an `image` (the server never reads files named by an upload).
 */
export function importOnlyErrors(input: unknown, config: AllowedEmailConfig): string[] {
  const allowedDomain = config.authAllowedDomain;
  if (!isRecord(input)) return [];
  const errors: string[] = [];
  if (Array.isArray(input.partners)) {
    input.partners.forEach((p, i) => {
      if (!isRecord(p) || typeof p.email !== 'string') return; // reported by the seed validation
      const email = p.email.trim().toLowerCase();
      if (!email.includes('@')) return; // not an email at all: reported by the seed validation
      if (!isAllowedEmail(config, email)) {
        errors.push(`partners.${i}.email: ${email} is not in the allowed sign-in domain ${allowedDomain}`);
      }
    });
  }
  if (Array.isArray(input.references)) {
    input.references.forEach((r, i) => {
      if (isRecord(r) && 'image' in r) errors.push(`references.${i}.image: ${IMAGE_NOT_ALLOWED}`);
    });
  }
  return errors;
}

export interface ImportRunDto {
  id: string;
  partnerId: string;
  at: string;
  filename: string | null;
  summary: SeedSummary;
}

export function toImportRunDto(run: ImportRun): ImportRunDto {
  return {
    id: run.id,
    partnerId: run.partnerId,
    at: run.at.toISOString(),
    filename: run.filename,
    summary: run.summary as unknown as SeedSummary,
  };
}
