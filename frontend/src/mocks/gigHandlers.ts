// Mock handlers for docs/api-contract.md: Gigs, Cost lines, Attachments (People: peopleHandlers.ts).
// Business logic lives in gigStore.ts.
import { http, HttpResponse } from 'msw';
import type { CostType, FieldCode, Logistics, TechnicalSetup } from '../api/enums';
import { COST_TYPES, isMusicianRole, LOGISTICS, TECHNICAL_SETUPS } from '../api/enums';
import type {
  CostLine,
  CostLineCreate,
  CostLineUpdate,
  GigCreate,
  GigListResponse,
  GigMoveRequest,
  GigUpdate,
  GigUpdateResponse,
  GigWithWarnings,
  ReasonRequest,
  Warning,
} from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import type { MockGig } from './gigStore';
import {
  addAttachment,
  addCostLine,
  createGig,
  doubleBookingWarnings,
  GIG_PATCH_FIELDS,
  linesOf,
  logEvent,
  nowTs,
  payCostLine,
  publicAttachment,
  removeCostLine,
  toDetail,
  toSummary,
  unpayCostLine,
  updateCostLine,
  updateGig,
  yearTotals,
} from './gigStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

type Fields = Record<string, FieldCode>;

const MAX_STRING = 500;
const MAX_TEXT = 5000;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function checkMoney(fields: Fields, key: string, value: unknown, required: boolean): void {
  if (value === undefined || value === null) {
    if (required) fields[key] = 'REQUIRED';
    return;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) fields[key] = 'INVALID_VALUE';
  else if (value < 0) fields[key] = 'NEGATIVE_AMOUNT';
}

function checkString(
  fields: Fields,
  key: string,
  value: unknown,
  required: boolean,
  max = MAX_STRING,
): void {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) fields[key] = 'REQUIRED';
    return;
  }
  if (typeof value !== 'string') fields[key] = 'INVALID_VALUE';
  else if (value.length > max) fields[key] = 'TOO_LONG';
}

function checkPartner(fields: Fields, key: string, value: unknown, required: boolean): void {
  if (value === undefined || value === null || value === '') {
    if (required) fields[key] = 'REQUIRED';
    return;
  }
  if (!db.partners.some((p) => p.id === value)) fields[key] = 'UNKNOWN_REFERENCE';
}

/** technicalSetup / logistics: one code of the list or null; houseTechnician: boolean. */
function checkGigOptions(
  fields: Fields,
  body: Pick<GigUpdate, 'technicalSetup' | 'logistics' | 'houseTechnician'>,
): void {
  const checkCode = (key: 'technicalSetup' | 'logistics', codes: readonly unknown[]) => {
    const value = body[key];
    if (value !== undefined && value !== null && !codes.includes(value)) fields[key] = 'INVALID_VALUE';
  };
  checkCode('technicalSetup', TECHNICAL_SETUPS);
  checkCode('logistics', LOGISTICS);
  if (body.houseTechnician !== undefined && typeof body.houseTechnician !== 'boolean') {
    fields.houseTechnician = 'INVALID_VALUE';
  }
}

/** clientId: an active client or null (UC-027); anything else → UNKNOWN_REFERENCE. */
function checkClient(fields: Fields, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!db.gigs.clients.some((c) => c.id === value && c.deletedAt === null)) {
    fields.clientId = 'UNKNOWN_REFERENCE';
  }
}

function checkPerson(fields: Fields, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!db.gigs.people.some((p) => p.id === value)) fields.personId = 'UNKNOWN_REFERENCE';
}

const blankToNull = (v: string | null | undefined): string | null =>
  v === undefined || v === null || v.trim() === '' ? null : v.trim();

const ctx = () => ({
  templates: db.reference.lineupTemplates,
  settings: db.reference.settings,
  partners: db.partners,
});

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Not found');
const gigDeleted = () => errorResponse(409, 'GIG_DELETED', 'Gig is deleted');
const badTransition = () =>
  errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Not possible in this status');

const findGig = (id: unknown): MockGig | undefined => db.gigs.gigs.find((g) => g.id === id);
const findLine = (id: unknown): CostLine | undefined =>
  db.gigs.costLines.find((l) => l.id === id);

function touch(gig: MockGig): void {
  gig.updatedAt = nowTs();
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

function withWarnings(gig: MockGig, warnings: Warning[] = []) {
  const body: GigWithWarnings = { gig: toDetail(db.gigs, gig), warnings };
  return HttpResponse.json(body);
}

function reasonOf(body: Partial<ReasonRequest>): string | null {
  return typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;
}

// ---------- Gigs ----------

export const gigHandlers = [
  http.get('/api/gigs', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const year = Number(params.get('year'));
    if (!params.get('year') || !Number.isInteger(year)) return validationError({ year: 'REQUIRED' });
    const status = params.get('status') ?? 'SOLD';
    const when = params.get('when') ?? 'all';
    const sellerId = params.get('sellerId');
    const producerId = params.get('producerId');
    const notFullyStaffed = params.get('notFullyStaffed') === 'true';
    const deleted = params.get('deleted') === 'true';
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const today = todayIso();

    const gigs = db.gigs.gigs
      .filter((g) => g.startDate.startsWith(`${year}-`))
      .filter((g) => (deleted ? g.deletedAt !== null : g.deletedAt === null))
      .filter((g) => status === 'ALL' || g.status === status)
      .filter((g) => when === 'all' || (when === 'upcoming' ? g.startDate >= today : g.startDate < today))
      .filter((g) => !sellerId || g.sellerId === sellerId)
      .filter((g) => !producerId || g.producerId === producerId)
      .filter((g) => {
        if (!q) return true;
        const clientName = db.gigs.clients.find((c) => c.id === g.clientId)?.name ?? '';
        return [g.venue, g.lineupName, g.notes ?? '', clientName].some((text) =>
          text.toLowerCase().includes(q),
        );
      })
      .map((g) => toSummary(db.gigs, g, today))
      .filter((g) => !notFullyStaffed || g.notFullyStaffed)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const body: GigListResponse = { gigs, yearSummary: yearTotals(db.gigs, year) };
    return HttpResponse.json(body);
  }),

  http.post('/api/gigs', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = await readJson<GigCreate>(request);
    const fields: Fields = {};
    if (body.startDate === undefined || body.startDate === null || body.startDate === '') {
      fields.startDate = 'REQUIRED';
    } else if (!isDate(body.startDate)) fields.startDate = 'INVALID_DATE';
    if (body.endDate !== undefined && body.endDate !== null) {
      if (!isDate(body.endDate)) fields.endDate = 'INVALID_DATE';
      else if (isDate(body.startDate) && body.endDate < body.startDate) {
        fields.endDate = 'END_BEFORE_START';
      }
    }
    if (body.lineupTemplateId) {
      if (!db.reference.lineupTemplates.some((t) => t.id === body.lineupTemplateId)) {
        fields.lineupTemplateId = 'UNKNOWN_REFERENCE';
      }
      checkString(fields, 'lineupName', body.lineupName, false);
    } else {
      checkString(fields, 'lineupName', body.lineupName, true);
    }
    checkString(fields, 'venue', body.venue, true);
    checkGigOptions(fields, body);
    checkPartner(fields, 'sellerId', body.sellerId, true);
    checkPartner(fields, 'producerId', body.producerId, true);
    checkMoney(fields, 'priceCents', body.priceCents, true);
    checkMoney(fields, 'additionalSalesCents', body.additionalSalesCents, false);
    checkString(fields, 'additionalSalesDescription', body.additionalSalesDescription, false);
    checkString(fields, 'notes', body.notes, false, MAX_TEXT);
    checkClient(fields, body.clientId);
    if (Object.keys(fields).length > 0) return validationError(fields);

    const gig = createGig(
      db.gigs,
      {
        startDate: body.startDate!,
        endDate: body.endDate ?? null,
        lineupTemplateId: body.lineupTemplateId ?? null,
        lineupName: blankToNull(body.lineupName),
        venue: body.venue!.trim(),
        technicalSetup: (body.technicalSetup ?? null) as TechnicalSetup | null,
        logistics: (body.logistics ?? null) as Logistics | null,
        houseTechnician: body.houseTechnician ?? false,
        sellerId: body.sellerId!,
        producerId: body.producerId!,
        priceCents: body.priceCents!,
        additionalSalesCents: body.additionalSalesCents ?? 0,
        additionalSalesDescription: blankToNull(body.additionalSalesDescription),
        notes: blankToNull(body.notes),
        clientId: body.clientId ?? null,
      },
      me.id,
      ctx(),
    );
    return HttpResponse.json(toDetail(db.gigs, gig), { status: 201 });
  }),

  http.get('/api/gigs/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const gig = findGig(params.id);
    return gig ? HttpResponse.json(toDetail(db.gigs, gig)) : notFound();
  }),

  http.patch('/api/gigs/:id', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (gig.deletedAt) return gigDeleted();
    const body = await readJson<GigUpdate & { startDate: unknown; endDate: unknown }>(request);
    const fields: Fields = {};
    if (body.startDate !== undefined) fields.startDate = 'NOT_EDITABLE';
    if (body.endDate !== undefined) fields.endDate = 'NOT_EDITABLE';
    if (body.lineupName !== undefined) checkString(fields, 'lineupName', body.lineupName, true);
    if (body.venue !== undefined) checkString(fields, 'venue', body.venue, true);
    checkGigOptions(fields, body);
    if (body.sellerId !== undefined) checkPartner(fields, 'sellerId', body.sellerId, true);
    if (body.producerId !== undefined) checkPartner(fields, 'producerId', body.producerId, true);
    if (body.priceCents !== undefined) checkMoney(fields, 'priceCents', body.priceCents, true);
    if (body.additionalSalesCents !== undefined) {
      checkMoney(fields, 'additionalSalesCents', body.additionalSalesCents, true);
    }
    checkString(fields, 'additionalSalesDescription', body.additionalSalesDescription, false);
    checkString(fields, 'notes', body.notes, false, MAX_TEXT);
    checkClient(fields, body.clientId);
    if (Object.keys(fields).length > 0) return validationError(fields);

    const patch: Record<string, unknown> = {};
    for (const field of GIG_PATCH_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      patch[field] =
        field === 'additionalSalesDescription' || field === 'notes'
          ? blankToNull(value as string | null)
          : typeof value === 'string'
            ? value.trim()
            : value;
    }
    const { movedCostLineIds } = updateGig(db.gigs, gig, patch, db.partners, me.id);
    const response: GigUpdateResponse = { gig: toDetail(db.gigs, gig), movedCostLineIds };
    return HttpResponse.json(response);
  }),

  http.post('/api/gigs/:id/move', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (gig.deletedAt) return gigDeleted();
    if (gig.status !== 'SOLD') return badTransition();
    const body = await readJson<GigMoveRequest>(request);
    const fields: Fields = {};
    if (!body.startDate) fields.startDate = 'REQUIRED';
    else if (!isDate(body.startDate)) fields.startDate = 'INVALID_DATE';
    if (body.endDate !== undefined && body.endDate !== null) {
      if (!isDate(body.endDate)) fields.endDate = 'INVALID_DATE';
      else if (isDate(body.startDate) && body.endDate < body.startDate) {
        fields.endDate = 'END_BEFORE_START';
      }
    }
    checkString(fields, 'reason', body.reason, false, MAX_TEXT);
    if (Object.keys(fields).length > 0) return validationError(fields);

    const from = { startDate: gig.startDate, endDate: gig.endDate };
    gig.startDate = body.startDate!;
    gig.endDate = body.endDate ?? null;
    touch(gig);
    logEvent(
      db.gigs,
      gig.id,
      'MOVED',
      me.id,
      { from, to: { startDate: gig.startDate, endDate: gig.endDate } },
      reasonOf(body),
    );
    const warnings = doubleBookingWarnings(db.gigs, gig, linesOf(db.gigs, gig.id));
    return withWarnings(gig, warnings);
  }),

  ...(['cancel', 'uncancel'] as const).map((action) =>
    http.post(`/api/gigs/:id/${action}`, async ({ params, request }) => {
      const me = currentPartner();
      if (!me) return unauthenticated();
      const gig = findGig(params.id);
      if (!gig) return notFound();
      if (gig.deletedAt) return gigDeleted();
      const required = action === 'cancel' ? 'SOLD' : 'CANCELLED';
      if (gig.status !== required) return badTransition();
      const reason = reasonOf(await readJson<ReasonRequest>(request));
      if (!reason) return validationError({ reason: 'REQUIRED' });
      gig.status = action === 'cancel' ? 'CANCELLED' : 'SOLD';
      touch(gig);
      logEvent(db.gigs, gig.id, action === 'cancel' ? 'CANCELLED' : 'UNCANCELLED', me.id, {}, reason);
      return HttpResponse.json(toDetail(db.gigs, gig));
    }),
  ),

  http.post('/api/gigs/:id/delete', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (gig.deletedAt) return gigDeleted();
    const reason = reasonOf(await readJson<ReasonRequest>(request));
    if (!reason) return validationError({ reason: 'REQUIRED' });
    gig.deletedAt = nowTs();
    logEvent(db.gigs, gig.id, 'DELETED', me.id, {}, reason);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/gigs/:id/restore', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (!gig.deletedAt) return badTransition();
    gig.deletedAt = null;
    touch(gig);
    logEvent(db.gigs, gig.id, 'RESTORED', me.id);
    return HttpResponse.json(toDetail(db.gigs, gig));
  }),

  http.get('/api/gigs/:id/history', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    if (!findGig(params.id)) return notFound();
    const events = db.gigs.events
      .filter((e) => e.gigId === params.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(events);
  }),
];

// ---------- Cost lines ----------

function lineWithGig(id: unknown): { line: CostLine; gig: MockGig } | Response {
  const line = findLine(id);
  const gig = line ? findGig(line.gigId) : undefined;
  if (!line || !gig) return notFound();
  if (gig.deletedAt) return gigDeleted();
  return { line, gig };
}

const needsDescription = (type: CostType) => type === 'OTHER' || type === 'OTHER_ROLE';

export const costLineHandlers = [
  http.post('/api/gigs/:id/cost-lines', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (gig.deletedAt) return gigDeleted();
    const body = await readJson<CostLineCreate>(request);
    const fields: Fields = {};
    if (!body.type) fields.type = 'REQUIRED';
    else if (!(COST_TYPES as readonly string[]).includes(body.type)) fields.type = 'INVALID_VALUE';
    checkPerson(fields, body.personId);
    checkString(fields, 'description', body.description, false);
    if (body.type && needsDescription(body.type) && !blankToNull(body.description)) {
      fields.description = 'DESCRIPTION_REQUIRED';
    }
    checkMoney(fields, 'budgetedCents', body.budgetedCents, true);
    if (Object.keys(fields).length > 0) return validationError(fields);

    const line = addCostLine(
      db.gigs,
      gig,
      {
        type: body.type!,
        personId: body.personId ?? null,
        description: blankToNull(body.description),
        budgetedCents: body.budgetedCents!,
      },
      me.id,
    );
    touch(gig);
    return withWarnings(gig, doubleBookingWarnings(db.gigs, gig, [line]));
  }),

  http.patch('/api/cost-lines/:id', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithGig(params.id);
    if (found instanceof Response) return found;
    const { line, gig } = found;
    const body = await readJson<CostLineUpdate & { type: unknown }>(request);
    const fields: Fields = {};
    if (body.type !== undefined) fields.type = 'NOT_EDITABLE';
    checkPerson(fields, body.personId);
    checkString(fields, 'description', body.description, false);
    if (
      body.description !== undefined &&
      needsDescription(line.type) &&
      !blankToNull(body.description)
    ) {
      fields.description = 'DESCRIPTION_REQUIRED';
    }
    if (body.budgetedCents !== undefined) checkMoney(fields, 'budgetedCents', body.budgetedCents, true);
    if (body.joinsLoadIn !== undefined) {
      if (!isMusicianRole(line.type) || typeof body.joinsLoadIn !== 'boolean') {
        fields.joinsLoadIn = 'INVALID_VALUE';
      }
    }
    if (Object.keys(fields).length > 0) return validationError(fields);

    const personChanged = body.personId !== undefined && body.personId !== line.personId;
    updateCostLine(
      db.gigs,
      line,
      {
        personId: body.personId,
        description: body.description === undefined ? undefined : blankToNull(body.description),
        budgetedCents: body.budgetedCents,
        joinsLoadIn: body.joinsLoadIn,
      },
      db.reference.settings.loadInDeductionCents,
      me.id,
    );
    touch(gig);
    const warnings = personChanged ? doubleBookingWarnings(db.gigs, gig, [line]) : [];
    return withWarnings(gig, warnings);
  }),

  http.delete('/api/cost-lines/:id', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithGig(params.id);
    if (found instanceof Response) return found;
    removeCostLine(db.gigs, found.line, me.id);
    touch(found.gig);
    return withWarnings(found.gig);
  }),

  http.post('/api/cost-lines/:id/pay', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithGig(params.id);
    if (found instanceof Response) return found;
    const { line, gig } = found;
    if (line.type === 'FUEL') return errorResponse(409, 'COST_NOT_PAYABLE', 'Fuel is not payable');
    const body = await readJson<{ actualCents: number }>(request);
    const fields: Fields = {};
    checkMoney(fields, 'actualCents', body.actualCents, false);
    if (Object.keys(fields).length > 0) return validationError(fields);
    payCostLine(db.gigs, line, body.actualCents ?? line.budgetedCents, me.id);
    touch(gig);
    return withWarnings(gig);
  }),

  http.post('/api/cost-lines/:id/unpay', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithGig(params.id);
    if (found instanceof Response) return found;
    unpayCostLine(db.gigs, found.line, me.id);
    touch(found.gig);
    return withWarnings(found.gig);
  }),
];

// ---------- Attachments ----------

function detectType(file: File): string | null {
  if (ALLOWED_TYPES[file.type]) return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return file.type === '' || file.type === 'application/octet-stream' ? (byExt[ext] ?? null) : null;
}

export const attachmentHandlers = [
  http.post('/api/gigs/:id/attachments', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const gig = findGig(params.id);
    if (!gig) return notFound();
    if (gig.deletedAt) return gigDeleted();
    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get('file');
    } catch {
      file = null;
    }
    if (!file || typeof file === 'string') return validationError({ file: 'REQUIRED' });
    if (file.size > MAX_UPLOAD_BYTES) return errorResponse(413, 'FILE_TOO_LARGE', 'Too large');
    const contentType = detectType(file);
    if (!contentType) return errorResponse(415, 'UNSUPPORTED_FILE_TYPE', 'Unsupported type');
    const attachment = addAttachment(
      db.gigs,
      gig,
      { filename: file.name || 'file', contentType, content: file },
      me.id,
    );
    touch(gig);
    return HttpResponse.json(publicAttachment(attachment), { status: 201 });
  }),

  http.get('/api/attachments/:id/download', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const attachment = db.gigs.attachments.find((a) => a.id === params.id && a.deletedAt === null);
    if (!attachment) return notFound();
    const inline = attachment.contentType !== ALLOWED_TYPES_DOCX;
    return new HttpResponse(attachment.content, {
      headers: {
        'Content-Type': attachment.contentType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${attachment.filename}"`,
      },
    });
  }),

  http.delete('/api/attachments/:id', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const attachment = db.gigs.attachments.find((a) => a.id === params.id && a.deletedAt === null);
    if (!attachment) return notFound();
    const gig = findGig(attachment.gigId);
    if (gig?.deletedAt) return gigDeleted();
    attachment.deletedAt = nowTs();
    logEvent(db.gigs, attachment.gigId, 'ATTACHMENT_REMOVED', me.id, {
      attachmentId: attachment.id,
      filename: attachment.filename,
    });
    return new HttpResponse(null, { status: 204 });
  }),
];
