import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import { LANGUAGES } from '../api/enums';
import type { DevLoginRequest, ReferenceData, UpdateMeRequest } from '../api/types';
import { db, setMockSession } from './data';
import { attachmentHandlers, costLineHandlers, gigHandlers, peopleHandlers } from './gigHandlers';
import { currentPartner, errorResponse, unauthenticated } from './util';
import { yearHandlers } from './yearHandlers';

// Mock handlers per contract section. Each section has a handler array included in
// `handlers`. Gigs, cost lines, attachments and people live in gigHandlers.ts.

export { currentPartner, errorResponse };

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

export const handlers = [
  ...authHandlers,
  ...referenceHandlers,
  ...gigHandlers,
  ...costLineHandlers,
  ...attachmentHandlers,
  ...peopleHandlers,
  ...yearHandlers,
];
