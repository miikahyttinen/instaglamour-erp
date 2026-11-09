/**
 * Settings parameters (docs/api-contract.md "Settings: Parameters tab", TASK-057).
 *
 * Parameters are defined here, in code: key, type and limits. Only their values live in the
 * `setting` table and are edited in the app. Adding a parameter = one entry in PARAMETERS
 * (+ its UI label); the endpoints list and validate whatever the registry holds.
 * Values never come from code: a parameter without a row has value null.
 */
import { z } from 'zod';
import { SETTING_KEYS } from '../domain/enums.js';
import type { Setting } from '../generated/prisma/client.js';

/** Only MONEY exists now; e.g. PERCENT or TEXT may be added later (with their own column/validation). */
export type ParameterType = 'MONEY';

export interface ParameterDefinition {
  key: string;
  type: ParameterType;
  /** Inclusive limits of the stored value (MONEY: cents). */
  min: number;
  max: number;
}

/** MONEY limits from the contract: cents, ≥ 0, ≤ 100 000 000. */
const MONEY = { type: 'MONEY', min: 0, max: 100_000_000 } as const;

/** The registry, in display order. */
export const PARAMETERS: readonly ParameterDefinition[] = [
  // Subtracted from a musician line when "load-in and sound check" is switched off (BR-026) and
  // in the freelancer PO sound-check question.
  { key: SETTING_KEYS.loadInDeduction, ...MONEY },
];

/** Keys edited in the app: seed/import only create their rows when missing (never overwrite). */
export const PARAMETER_KEYS: ReadonlySet<string> = new Set(PARAMETERS.map((p) => p.key));

export function findParameter(key: string): ParameterDefinition | undefined {
  return PARAMETERS.find((p) => p.key === key);
}

export interface ParameterDto {
  key: string;
  type: ParameterType;
  value: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Body schema for PATCH: `{ value }`. Negative → NEGATIVE_AMOUNT; anything else that is not a
 * whole number within the limits (missing, null, text, fraction, too big) → INVALID_VALUE.
 */
export function valueBodySchema(def: ParameterDefinition) {
  switch (def.type) {
    case 'MONEY':
      return z.object({
        value: z
          .number({ message: 'INVALID_VALUE' })
          .int({ message: 'INVALID_VALUE' })
          .min(def.min, { message: def.min === 0 ? 'NEGATIVE_AMOUNT' : 'INVALID_VALUE' })
          .max(def.max, { message: 'INVALID_VALUE' }),
      });
  }
}

/** The column a parameter type is stored in. */
export function storedValue(def: ParameterDefinition, value: number): Pick<Setting, 'valueCents'> {
  switch (def.type) {
    case 'MONEY':
      return { valueCents: value };
  }
}

export function toParameterDto(def: ParameterDefinition, row: Setting | null): ParameterDto {
  return {
    key: def.key,
    type: def.type,
    value: row ? row.valueCents : null,
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedBy: row?.updatedById ?? null,
  };
}
