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
