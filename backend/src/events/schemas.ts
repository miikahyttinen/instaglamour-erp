/** Input field schemas shared by the gig endpoints. Issues map to contract field codes (see http/errors.ts). */
import { z } from 'zod';
import { isIsoDate } from '../domain/dates.js';
import { LOGISTICS, TECHNICAL_SETUPS } from '../domain/enums.js';

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

/** Single TechnicalSetup code or null (= not set); anything else → INVALID_VALUE. */
export const technicalSetup = z.enum(TECHNICAL_SETUPS, { message: 'INVALID_VALUE' }).nullable();

/** Single Logistics code or null (= not set); anything else → INVALID_VALUE. */
export const logistics = z.enum(LOGISTICS, { message: 'INVALID_VALUE' }).nullable();

/** A boolean flag; null or any non-boolean → INVALID_VALUE (omit the field to keep / default it). */
export const flag = z.boolean({ message: 'INVALID_VALUE' });

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
