/** Request parsing shared by the freelancer-link and the partner PO creation endpoints. */
import { isUuid } from '../events/store.js';
import { validationError } from '../http/errors.js';

export const MAX_PO_LINES = 200;

/** `{ costLineIds: [uuid…] }`, 1…200 unique ids; missing → REQUIRED, anything else → INVALID_VALUE. */
export function parseCostLineIds(body: unknown): string[] {
  const value = body !== null && typeof body === 'object' ? (body as Record<string, unknown>).costLineIds : undefined;
  if (value === undefined || value === null) throw validationError({ costLineIds: 'REQUIRED' });
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_PO_LINES ||
    !value.every(isUuid) ||
    new Set(value.map((v) => v.toLowerCase())).size !== value.length
  ) {
    throw validationError({ costLineIds: 'INVALID_VALUE' });
  }
  return value.map((v) => v.toLowerCase());
}

/** One requested line on a freelancer PO (TASK-050). */
export interface PoLineRequest {
  costLineId: string;
  soundcheck: boolean;
}

const isLineRequest = (l: unknown): l is PoLineRequest =>
  l !== null &&
  typeof l === 'object' &&
  isUuid((l as Record<string, unknown>).costLineId) &&
  typeof (l as Record<string, unknown>).soundcheck === 'boolean';

/**
 * Freelancer-link body (api-contract "Freelancer PO: VAT and sound check"):
 * `{ vatLiable: boolean, lines: [{ costLineId, soundcheck: boolean }] }` (1…200 unique cost lines).
 * The legacy `{ costLineIds }` (without `vatLiable` and `lines`) is still accepted as
 * `vatLiable: false` with every line `soundcheck: true`.
 * Errors: missing → REQUIRED, anything else invalid → INVALID_VALUE (both fields reported together).
 */
export function parseFreelancerPoBody(body: unknown): { vatLiable: boolean; lines: PoLineRequest[] } {
  const obj = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (obj.costLineIds !== undefined && obj.vatLiable === undefined && obj.lines === undefined) {
    return { vatLiable: false, lines: parseCostLineIds(obj).map((costLineId) => ({ costLineId, soundcheck: true })) };
  }

  const fields: Record<string, 'REQUIRED' | 'INVALID_VALUE'> = {};
  const { vatLiable, lines } = obj;
  if (vatLiable === undefined || vatLiable === null) fields.vatLiable = 'REQUIRED';
  else if (typeof vatLiable !== 'boolean') fields.vatLiable = 'INVALID_VALUE';

  let parsed: PoLineRequest[] = [];
  if (lines === undefined || lines === null) {
    fields.lines = 'REQUIRED';
  } else if (
    Array.isArray(lines) &&
    lines.length >= 1 &&
    lines.length <= MAX_PO_LINES &&
    lines.every(isLineRequest)
  ) {
    parsed = lines.map((l) => ({ costLineId: l.costLineId.toLowerCase(), soundcheck: l.soundcheck }));
    if (new Set(parsed.map((l) => l.costLineId)).size !== parsed.length) fields.lines = 'INVALID_VALUE';
  } else {
    fields.lines = 'INVALID_VALUE';
  }
  if (Object.keys(fields).length > 0) throw validationError(fields);
  return { vatLiable: vatLiable === true, lines: parsed };
}
