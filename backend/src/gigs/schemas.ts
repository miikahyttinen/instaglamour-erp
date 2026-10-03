/** Input field schemas shared by the gig endpoints. Issues map to contract field codes (see http/errors.ts). */
import { z } from 'zod';
import { isIsoDate } from '../domain/dates.js';
import { TECHNICAL_SETUPS } from '../domain/enums.js';
import type { TechnicalSetup } from '../generated/prisma/enums.js';

/** Upper bound for money fields (Postgres int4). */
export const MAX_CENTS = 2_000_000_000;
export const SHORT_TEXT_MAX = 500;
export const LONG_TEXT_MAX = 5000;

/** Integer cents ≥ 0: missing → REQUIRED, negative → NEGATIVE_AMOUNT, non-integer → INVALID_VALUE. */
export const money = z.number().int().min(0).max(MAX_CENTS);

export const isoDate = z.string().refine(isIsoDate, { message: 'INVALID_DATE' });

/** Required, trimmed, non-blank text. */
export const requiredText = (max = SHORT_TEXT_MAX) => z.string().trim().min(1).max(max);

/** Optional nullable text; blank becomes null. */
export const optionalText = (max = SHORT_TEXT_MAX) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const technicalSetupSet: ReadonlySet<string> = new Set(TECHNICAL_SETUPS);

/** Multi-select of TechnicalSetup codes; duplicates removed, order kept. */
export const technicalSetup = z
  .array(z.string(), { message: 'INVALID_VALUE' })
  .refine((values) => values.every((v) => technicalSetupSet.has(v)), { message: 'INVALID_VALUE' })
  .transform((values) => [...new Set(values)] as TechnicalSetup[]);

/** One of a fixed list: missing → REQUIRED, anything else invalid → INVALID_VALUE. */
export const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: (issue) => (issue.input === undefined || issue.input === null ? 'REQUIRED' : 'INVALID_VALUE') });

/** A year in a query or path (`2026`): missing → REQUIRED, anything but four digits → INVALID_VALUE. */
export const yearString = z
  .string()
  .regex(/^\d{4}$/, { message: 'INVALID_VALUE' })
  .transform(Number);

/** A reason for cancel / uncancel / delete (BR-011, BR-018). */
export const reasonBody = z.object({ reason: requiredText(LONG_TEXT_MAX) });
