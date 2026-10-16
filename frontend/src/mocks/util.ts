import { HttpResponse } from 'msw';
import type { ErrorCode, FieldCode } from '../api/enums';
import type { ApiErrorBody, Partner } from '../api/types';
import { db } from './data';

/** Error response in the contract's error format. */
export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, FieldCode>,
  details?: Record<string, unknown>,
) {
  const body: ApiErrorBody = {
    error: { code, message, ...(fields ? { fields } : {}), ...(details ? { details } : {}) },
  };
  return HttpResponse.json(body, { status });
}

/** The signed-in partner. A removed (inactive) partner's session no longer works (BR-111). */
export function currentPartner(): Partner | undefined {
  return db.partners.find((p) => p.id === db.sessionPartnerId && p.active);
}

export const unauthenticated = () => errorResponse(401, 'UNAUTHENTICATED', 'No session');

export const validationError = (fields: Record<string, FieldCode>) =>
  errorResponse(400, 'VALIDATION_ERROR', 'Invalid input', fields);
