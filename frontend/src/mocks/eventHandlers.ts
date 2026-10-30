// Mock handlers for docs/api-contract.md: Events, Cost lines, Attachments (People: peopleHandlers.ts).
// Business logic lives in eventStore.ts.
import { http, HttpResponse } from 'msw';
import type { CostType, FieldCode, Logistics, TechnicalSetup } from '../api/enums';
import { COST_TYPES, INVOICE_STATUSES, isMusicianRole, LOGISTICS, TECHNICAL_SETUPS } from '../api/enums';
import type {
  CostLine,
  CostLineCreate,
  CostLineUpdate,
  EventCreate,
  EventListResponse,
  EventMoveRequest,
  EventUpdate,
  EventUpdateResponse,
  EventWithWarnings,
  ReasonRequest,
  Warning,
} from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import type { MockEvent, NewEventInput } from './eventStore';
import {
  addAttachment,
  addCostLine,
  createEvent,
  doubleBookingWarnings,
  EVENT_PATCH_FIELDS,
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
  updateEvent,
  yearTotals,
} from './eventStore';
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
function checkEventOptions(
  fields: Fields,
  body: Pick<EventUpdate, 'technicalSetup' | 'logistics' | 'houseTechnician'>,
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
  if (!db.events.clients.some((c) => c.id === value && c.deletedAt === null)) {
    fields.clientId = 'UNKNOWN_REFERENCE';
  }
}

function checkPerson(fields: Fields, value: unknown): void {
  if (value === undefined || value === null) return;
  if (!db.events.people.some((p) => p.id === value)) fields.personId = 'UNKNOWN_REFERENCE';
}

const blankToNull = (v: string | null | undefined): string | null =>
  v === undefined || v === null || v.trim() === '' ? null : v.trim();

const ctx = () => ({
  templates: db.reference.lineupTemplates,
  settings: db.reference.settings,
  partners: db.partners,
});

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Not found');
const eventDeleted = () => errorResponse(409, 'EVENT_DELETED', 'Event is deleted');
const badTransition = () =>
  errorResponse(409, 'INVALID_STATUS_TRANSITION', 'Not possible in this status');

/** 409 COST_LINE_ON_PURCHASE_ORDER (BR-118) with the PO number. */
export const onPurchaseOrder = (number: string) =>
  errorResponse(409, 'COST_LINE_ON_PURCHASE_ORDER', 'Cost line is on a purchase order', undefined, {
    purchaseOrderNumber: number,
  });

/** First line of the event on an OPEN purchase order (blocks cancel / delete, BR-118). */
const openPurchaseOrderOf = (event: MockEvent) =>
  linesOf(db.events, event.id).find((l) => l.purchaseOrder?.status === 'OPEN')?.purchaseOrder;

const findEvent = (id: unknown): MockEvent | undefined => db.events.events.find((g) => g.id === id);
const findLine = (id: unknown): CostLine | undefined =>
  db.events.costLines.find((l) => l.id === id);

function touch(event: MockEvent): void {
  event.updatedAt = nowTs();
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

function withWarnings(event: MockEvent, warnings: Warning[] = []) {
  const body: EventWithWarnings = { event: toDetail(db.events, event), warnings };
  return HttpResponse.json(body);
}

function reasonOf(body: Partial<ReasonRequest>): string | null {
  return typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;
}

/**
 * Validates a EventCreate body (POST /api/events, and POST /api/offers/{id}/convert with a body) and
 * returns the field errors, or the cleaned createEvent input.
 */
export function parseEventCreate(
  body: Partial<EventCreate>,
): { fields: Fields; input: null } | { fields: null; input: NewEventInput } {
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
  checkEventOptions(fields, body);
  checkPartner(fields, 'sellerId', body.sellerId, true);
  checkPartner(fields, 'producerId', body.producerId, true);
  checkMoney(fields, 'priceCents', body.priceCents, true);
  checkMoney(fields, 'additionalSalesCents', body.additionalSalesCents, false);
  checkString(fields, 'additionalSalesDescription', body.additionalSalesDescription, false);
  checkString(fields, 'notes', body.notes, false, MAX_TEXT);
  checkClient(fields, body.clientId);
  if (Object.keys(fields).length > 0) return { fields, input: null };
  return {
    fields: null,
    input: {
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
  };
}

/** createEvent with the mock reference context. */
export const createEventFromInput = (input: NewEventInput, actorId: string) =>
  createEvent(db.events, input, actorId, ctx());

// ---------- Events ----------

export const eventHandlers = [
  http.get('/api/events', ({ request }) => {
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

    const events = db.events.events
      .filter((g) => g.startDate.startsWith(`${year}-`))
      .filter((g) => (deleted ? g.deletedAt !== null : g.deletedAt === null))
      .filter((g) => status === 'ALL' || g.status === status)
      .filter((g) => when === 'all' || (when === 'upcoming' ? g.startDate >= today : g.startDate < today))
      .filter((g) => !sellerId || g.sellerId === sellerId)
      .filter((g) => !producerId || g.producerId === producerId)
      .filter((g) => {
        if (!q) return true;
        const clientName = db.events.clients.find((c) => c.id === g.clientId)?.name ?? '';
        return [g.venue, g.lineupName, g.notes ?? '', clientName].some((text) =>
          text.toLowerCase().includes(q),
        );
      })
      .map((g) => toSummary(db.events, g, today))
      .filter((g) => !notFullyStaffed || g.notFullyStaffed)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    const body: EventListResponse = { events, yearSummary: yearTotals(db.events, year) };
    return HttpResponse.json(body);
  }),

  http.post('/api/events', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const parsed = parseEventCreate(await readJson<EventCreate>(request));
    if (parsed.fields) return validationError(parsed.fields);
    const event = createEventFromInput(parsed.input, me.id);
    return HttpResponse.json(toDetail(db.events, event), { status: 201 });
  }),

  http.get('/api/events/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const event = findEvent(params.id);
    return event ? HttpResponse.json(toDetail(db.events, event)) : notFound();
  }),

  http.patch('/api/events/:id', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (event.deletedAt) return eventDeleted();
    const body = await readJson<EventUpdate & { startDate: unknown; endDate: unknown }>(request);
    const fields: Fields = {};
    if (body.startDate !== undefined) fields.startDate = 'NOT_EDITABLE';
    if (body.endDate !== undefined) fields.endDate = 'NOT_EDITABLE';
    if (body.lineupName !== undefined) checkString(fields, 'lineupName', body.lineupName, true);
    if (body.venue !== undefined) checkString(fields, 'venue', body.venue, true);
    checkEventOptions(fields, body);
    if (body.sellerId !== undefined) checkPartner(fields, 'sellerId', body.sellerId, true);
    if (body.producerId !== undefined) checkPartner(fields, 'producerId', body.producerId, true);
    if (body.priceCents !== undefined) checkMoney(fields, 'priceCents', body.priceCents, true);
    if (body.additionalSalesCents !== undefined) {
      checkMoney(fields, 'additionalSalesCents', body.additionalSalesCents, true);
    }
    checkString(fields, 'additionalSalesDescription', body.additionalSalesDescription, false);
    checkString(fields, 'notes', body.notes, false, MAX_TEXT);
    checkClient(fields, body.clientId);
    if (body.invoiceStatus !== undefined && !(INVOICE_STATUSES as readonly unknown[]).includes(body.invoiceStatus)) {
      fields.invoiceStatus = 'INVALID_VALUE';
    }
    if (
      body.prepaymentCents !== undefined &&
      (typeof body.prepaymentCents !== 'number' || !Number.isInteger(body.prepaymentCents) || body.prepaymentCents < 0)
    ) {
      fields.prepaymentCents = 'INVALID_VALUE';
    }
    if (Object.keys(fields).length > 0) return validationError(fields);

    const patch: Record<string, unknown> = {};
    for (const field of EVENT_PATCH_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      patch[field] =
        field === 'additionalSalesDescription' || field === 'notes'
          ? blankToNull(value as string | null)
          : typeof value === 'string'
            ? value.trim()
            : value;
    }
    const { movedCostLineIds } = updateEvent(db.events, event, patch, db.partners, me.id);
    const response: EventUpdateResponse = { event: toDetail(db.events, event), movedCostLineIds };
    return HttpResponse.json(response);
  }),

  http.post('/api/events/:id/move', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (event.deletedAt) return eventDeleted();
    if (event.status !== 'SOLD') return badTransition();
    const body = await readJson<EventMoveRequest>(request);
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

    const from = { startDate: event.startDate, endDate: event.endDate };
    event.startDate = body.startDate!;
    event.endDate = body.endDate ?? null;
    touch(event);
    logEvent(
      db.events,
      event.id,
      'MOVED',
      me.id,
      { from, to: { startDate: event.startDate, endDate: event.endDate } },
      reasonOf(body),
    );
    const warnings = doubleBookingWarnings(db.events, event, linesOf(db.events, event.id));
    return withWarnings(event, warnings);
  }),

  ...(['cancel', 'uncancel'] as const).map((action) =>
    http.post(`/api/events/:id/${action}`, async ({ params, request }) => {
      const me = currentPartner();
      if (!me) return unauthenticated();
      const event = findEvent(params.id);
      if (!event) return notFound();
      if (event.deletedAt) return eventDeleted();
      const required = action === 'cancel' ? 'SOLD' : 'CANCELLED';
      if (event.status !== required) return badTransition();
      const reason = reasonOf(await readJson<ReasonRequest>(request));
      if (!reason) return validationError({ reason: 'REQUIRED' });
      const openPo = action === 'cancel' ? openPurchaseOrderOf(event) : undefined;
      if (openPo) return onPurchaseOrder(openPo.number);
      event.status = action === 'cancel' ? 'CANCELLED' : 'SOLD';
      touch(event);
      logEvent(db.events, event.id, action === 'cancel' ? 'CANCELLED' : 'UNCANCELLED', me.id, {}, reason);
      return HttpResponse.json(toDetail(db.events, event));
    }),
  ),

  http.post('/api/events/:id/delete', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (event.deletedAt) return eventDeleted();
    const reason = reasonOf(await readJson<ReasonRequest>(request));
    if (!reason) return validationError({ reason: 'REQUIRED' });
    const openPo = openPurchaseOrderOf(event);
    if (openPo) return onPurchaseOrder(openPo.number);
    event.deletedAt = nowTs();
    logEvent(db.events, event.id, 'DELETED', me.id, {}, reason);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/events/:id/restore', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (!event.deletedAt) return badTransition();
    event.deletedAt = null;
    touch(event);
    logEvent(db.events, event.id, 'RESTORED', me.id);
    return HttpResponse.json(toDetail(db.events, event));
  }),

  http.get('/api/events/:id/history', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    if (!findEvent(params.id)) return notFound();
    const entries = db.events.history
      .filter((e) => e.eventId === params.id)
      .sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(entries);
  }),
];

// ---------- Cost lines ----------

function lineWithEvent(id: unknown): { line: CostLine; event: MockEvent } | Response {
  const line = findLine(id);
  const event = line ? findEvent(line.eventId) : undefined;
  if (!line || !event) return notFound();
  if (event.deletedAt) return eventDeleted();
  return { line, event };
}

const needsDescription = (type: CostType) => type === 'OTHER' || type === 'OTHER_ROLE';

export const costLineHandlers = [
  http.post('/api/events/:id/cost-lines', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (event.deletedAt) return eventDeleted();
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
      db.events,
      event,
      {
        type: body.type!,
        personId: body.personId ?? null,
        description: blankToNull(body.description),
        budgetedCents: body.budgetedCents!,
      },
      me.id,
    );
    touch(event);
    return withWarnings(event, doubleBookingWarnings(db.events, event, [line]));
  }),

  http.patch('/api/cost-lines/:id', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithEvent(params.id);
    if (found instanceof Response) return found;
    const { line, event } = found;
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
    const locked =
      body.personId !== undefined || body.budgetedCents !== undefined || body.joinsLoadIn !== undefined;
    if (line.purchaseOrder && locked) return onPurchaseOrder(line.purchaseOrder.number);

    const personChanged = body.personId !== undefined && body.personId !== line.personId;
    updateCostLine(
      db.events,
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
    touch(event);
    const warnings = personChanged ? doubleBookingWarnings(db.events, event, [line]) : [];
    return withWarnings(event, warnings);
  }),

  http.delete('/api/cost-lines/:id', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithEvent(params.id);
    if (found instanceof Response) return found;
    if (found.line.purchaseOrder) return onPurchaseOrder(found.line.purchaseOrder.number);
    removeCostLine(db.events, found.line, me.id);
    touch(found.event);
    return withWarnings(found.event);
  }),

  http.post('/api/cost-lines/:id/pay', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithEvent(params.id);
    if (found instanceof Response) return found;
    const { line, event } = found;
    if (line.type === 'FUEL') return errorResponse(409, 'COST_NOT_PAYABLE', 'Fuel is not payable');
    const body = await readJson<{ actualCents: number }>(request);
    const fields: Fields = {};
    checkMoney(fields, 'actualCents', body.actualCents, false);
    if (Object.keys(fields).length > 0) return validationError(fields);
    if (line.purchaseOrder) return onPurchaseOrder(line.purchaseOrder.number);
    payCostLine(db.events, line, body.actualCents ?? line.budgetedCents, me.id);
    touch(event);
    return withWarnings(event);
  }),

  http.post('/api/cost-lines/:id/unpay', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const found = lineWithEvent(params.id);
    if (found instanceof Response) return found;
    if (found.line.purchaseOrder) return onPurchaseOrder(found.line.purchaseOrder.number);
    unpayCostLine(db.events, found.line, me.id);
    touch(found.event);
    return withWarnings(found.event);
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
  http.post('/api/events/:id/attachments', async ({ params, request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const event = findEvent(params.id);
    if (!event) return notFound();
    if (event.deletedAt) return eventDeleted();
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
      db.events,
      event,
      { filename: file.name || 'file', contentType, content: file },
      me.id,
    );
    touch(event);
    return HttpResponse.json(publicAttachment(attachment), { status: 201 });
  }),

  http.get('/api/attachments/:id/download', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const attachment = db.events.attachments.find((a) => a.id === params.id && a.deletedAt === null);
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
    const attachment = db.events.attachments.find((a) => a.id === params.id && a.deletedAt === null);
    if (!attachment) return notFound();
    const event = findEvent(attachment.eventId);
    if (event?.deletedAt) return eventDeleted();
    attachment.deletedAt = nowTs();
    logEvent(db.events, attachment.eventId, 'ATTACHMENT_REMOVED', me.id, {
      attachmentId: attachment.id,
      filename: attachment.filename,
    });
    return new HttpResponse(null, { status: 204 });
  }),
];
