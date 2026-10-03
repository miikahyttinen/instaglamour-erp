import { http, HttpResponse } from 'msw';
import type { ErrorCode, FieldCode } from '../api/enums';
import { LANGUAGES } from '../api/enums';
import type { ApiErrorBody, DevLoginRequest, Partner, ReferenceData, UpdateMeRequest } from '../api/types';
import { db, setMockSession } from './data';

// Mock handlers for the contract sections built so far: Auth & me, Reference data.
// Later tasks add their own handler arrays here.

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, FieldCode>,
) {
  const body: ApiErrorBody = { error: { code, message, ...(fields ? { fields } : {}) } };
  return HttpResponse.json(body, { status });
}

export function currentPartner(): Partner | undefined {
  return db.partners.find((p) => p.id === db.sessionPartnerId);
}

const unauthenticated = () => errorResponse(401, 'UNAUTHENTICATED', 'No session');

export const authHandlers = [
  http.post('/api/auth/dev-login', async ({ request }) => {
    const body = (await request.json()) as Partial<DevLoginRequest>;
    const email = body.email?.trim().toLowerCase();
    if (!email) return errorResponse(400, 'VALIDATION_ERROR', 'Email required', { email: 'REQUIRED' });
    const partner = db.partners.find((p) => p.email.toLowerCase() === email);
    if (!partner) return errorResponse(403, 'FORBIDDEN', 'Not a partner');
    setMockSession(partner.id);
    return HttpResponse.json(partner);
  }),

  http.post('/api/auth/logout', () => {
    setMockSession(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/me', () => {
    const me = currentPartner();
    return me ? HttpResponse.json(me) : unauthenticated();
  }),

  http.patch('/api/me', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = (await request.json()) as UpdateMeRequest;
    const fields: Record<string, FieldCode> = {};
    if (body.language !== undefined && !(LANGUAGES as readonly string[]).includes(body.language)) {
      fields.language = 'INVALID_VALUE';
    }
    if (body.selectedYear !== undefined && !Number.isInteger(body.selectedYear)) {
      fields.selectedYear = 'INVALID_VALUE';
    }
    if (Object.keys(fields).length > 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Invalid input', fields);
    }
    if (body.language !== undefined) me.language = body.language;
    if (body.selectedYear !== undefined) me.selectedYear = body.selectedYear;
    return HttpResponse.json(me);
  }),
];

export const referenceHandlers = [
  http.get('/api/reference', () => {
    if (!currentPartner()) return unauthenticated();
    const body: ReferenceData = { partners: db.partners, ...db.reference };
    return HttpResponse.json(body);
  }),
];

export const handlers = [...authHandlers, ...referenceHandlers];
