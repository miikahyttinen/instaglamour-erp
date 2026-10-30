/** Event endpoints (docs/api-contract.md "Events"; UC-002…UC-004, UC-007, UC-009, UC-010, UC-012, UC-013, UC-025). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { dateFromIso, isoFromDate, todayIso } from '../domain/dates.js';
import { eventEconomics, isNotFullyStaffed, yearEventSummary } from '../domain/eventEconomics.js';
import type { CostType, Prisma } from '../generated/prisma/client.js';
import { AppError, notFound, parseInput, validationError, type FieldCode } from '../http/errors.js';
import {
  flag,
  isoDate,
  logistics,
  LONG_TEXT_MAX,
  money,
  optionalText,
  reasonBody,
  requiredText,
  technicalSetup,
  yearString,
} from '../events/schemas.js';
import { compareCostLines, toEventDetailDto, toEventHistoryEntryDto, toEventSummaryDto } from '../events/serialize.js';
import {
  assertNotDeleted,
  doubleBookingWarnings,
  inTransaction,
  isUuid,
  loadYearEvents,
  logHistory,
  requireEventDetail,
} from '../events/store.js';
import { INVOICE_STATES } from '../domain/enums.js';
import { invoicing } from '../domain/invoicing.js';
import { findActiveClient } from '../clients/store.js';
import { assertCostLineNotOnPurchaseOrder, assertEventHasNoOpenPurchaseOrder } from '../purchaseOrders/lock.js';
import { insertEvent, prepareEventCreate } from '../events/create.js';
import { loadFeeSettings } from './reference.js';

type IdParams = { Params: { id: string } };

const listQuery = z.object({
  year: yearString,
  status: z.enum(['SOLD', 'CANCELLED', 'ALL'], { message: 'INVALID_VALUE' }).default('SOLD'),
  when: z.enum(['all', 'upcoming', 'past'], { message: 'INVALID_VALUE' }).default('all'),
  sellerId: z.string().refine(isUuid, { message: 'INVALID_VALUE' }).optional(),
  producerId: z.string().refine(isUuid, { message: 'INVALID_VALUE' }).optional(),
  notFullyStaffed: z.enum(['true', 'false'], { message: 'INVALID_VALUE' }).optional(),
  q: z.string().max(500).optional(),
  deleted: z.enum(['true', 'false'], { message: 'INVALID_VALUE' }).optional(),
  // Repeatable (`?invoiceState=READY&invoiceState=SENT`): any of the given derived states.
  invoiceState: z
    .union([z.enum(INVOICE_STATES), z.array(z.enum(INVOICE_STATES))], { message: 'INVALID_VALUE' })
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
});

const eventUpdateBody = z.object({
  lineupName: requiredText().optional(),
  venue: requiredText().optional(),
  technicalSetup: technicalSetup.optional(),
  logistics: logistics.optional(),
  houseTechnician: flag.optional(),
  sellerId: z.string().min(1).optional(),
  producerId: z.string().min(1).optional(),
  priceCents: money.optional(),
  additionalSalesCents: money.optional(),
  additionalSalesDescription: optionalText(),
  notes: optionalText(LONG_TEXT_MAX),
  clientId: z.string().nullable().optional(),
});

/** Fields of EventUpdate in the order they are logged. */
const UPDATE_FIELDS = [
  'lineupName',
  'venue',
  'technicalSetup',
  'logistics',
  'houseTechnician',
  'sellerId',
  'producerId',
  'priceCents',
  'additionalSalesCents',
  'additionalSalesDescription',
  'notes',
  'clientId',
] as const;

const moveBody = z.object({
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  reason: optionalText(LONG_TEXT_MAX),
});

function throwIfAny(fields: Record<string, FieldCode>): void {
  if (Object.keys(fields).length > 0) throw validationError(fields);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function eventRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Partners by id; ids that are not UUIDs are simply not found. */
  const findPartners = async (ids: readonly string[]) => {
    const valid = ids.filter(isUuid);
    const rows = valid.length ? await db.partner.findMany({ where: { id: { in: valid } } }) : [];
    return new Map(rows.map((p) => [p.id, p]));
  };

  const detail = async (id: string) => toEventDetailDto(await requireEventDetail(db, id), todayIso());

  // ---------------------------------------------------------------- list
  app.get('/api/events', async (request) => {
    const query = parseInput(listQuery, request.query);
    const today = todayIso();
    const events = await loadYearEvents(db, query.year, { includeDeleted: true });
    const yearSummary = yearEventSummary(events.filter((g) => g.deletedAt === null));

    const q = query.q?.trim().toLowerCase();
    const filtered = events.filter((g) => {
      if (query.deleted === 'true' ? g.deletedAt === null : g.deletedAt !== null) return false;
      if (query.status !== 'ALL' && g.status !== query.status) return false;
      const start = isoFromDate(g.startDate);
      if (query.when === 'upcoming' && start < today) return false;
      if (query.when === 'past' && start >= today) return false;
      if (query.sellerId && g.sellerId !== query.sellerId) return false;
      if (query.producerId && g.producerId !== query.producerId) return false;
      if (query.notFullyStaffed === 'true' && !isNotFullyStaffed(g.costLines)) return false;
      if (query.invoiceState && !query.invoiceState.includes(invoicing(eventEconomics(g).totalPriceCents, g.invoiceRows).invoiceState))
        return false;
      if (q && ![g.venue, g.lineupName, g.notes ?? '', g.client?.name ?? ''].some((s) => s.toLowerCase().includes(q)))
        return false;
      return true;
    });

    return { events: filtered.map((g) => toEventSummaryDto(g, today)), yearSummary };
  });

  // ---------------------------------------------------------------- create
  app.post('/api/events', async (request, reply) => {
    const me = request.requirePartner();
    const event = await prepareEventCreate(db, request.body);
    const fees = await loadFeeSettings(db);
    const eventId = await inTransaction(db, (tx) => insertEvent(tx, event, { partnerId: me.id, fees }));

    return reply.status(201).send(await detail(eventId));
  });

  // ---------------------------------------------------------------- read
  app.get<IdParams>('/api/events/:id', async (request) => detail(request.params.id));

  app.get<IdParams>('/api/events/:id/history', async (request) => {
    const { id } = request.params;
    const event = isUuid(id) ? await db.event.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!event) throw notFound('Event not found');
    const entries = await db.eventHistory.findMany({ where: { eventId: id }, orderBy: [{ at: 'desc' }, { seq: 'desc' }] });
    return entries.map(toEventHistoryEntryDto);
  });

  // ---------------------------------------------------------------- update
  app.patch<IdParams>('/api/events/:id', async (request) => {
    const me = request.requirePartner();
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const fields: Record<string, FieldCode> = {};
    // Dates change only via move (UC-004 A1).
    for (const key of ['startDate', 'endDate']) if (typeof raw === 'object' && key in raw) fields[key] = 'NOT_EDITABLE';
    throwIfAny(fields);
    const body = parseInput(eventUpdateBody, raw);

    const event = await requireEventDetail(db, request.params.id);
    assertNotDeleted(event);

    const partners = await findPartners(
      [event.sellerId, event.producerId, body.sellerId, body.producerId].filter((p): p is string => p !== undefined),
    );
    // BR-111: a changed seller/producer must be an active partner; an unchanged one is kept even if removed since.
    const isValidChoice = (id: string, current: string) => id === current || partners.get(id)?.active === true;
    if (body.sellerId !== undefined && !isValidChoice(body.sellerId, event.sellerId)) fields.sellerId = 'UNKNOWN_REFERENCE';
    if (body.producerId !== undefined && !isValidChoice(body.producerId, event.producerId))
      fields.producerId = 'UNKNOWN_REFERENCE';
    if (body.clientId && body.clientId !== event.clientId && !(await findActiveClient(db, body.clientId))) {
      fields.clientId = 'UNKNOWN_REFERENCE';
    }
    throwIfAny(fields);

    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const data: Record<string, unknown> = {};
    for (const field of UPDATE_FIELDS) {
      const next = body[field];
      if (next === undefined) continue;
      const current = event[field];
      if (sameValue(current, next)) continue;
      changes.push({ field, from: current, to: next });
      data[field] = next;
    }

    // BR-027: the old seller's (producer's) unpaid SALES (PRODUCTION) lines move to the new one.
    const moves: { ids: string[]; personId: string }[] = [];
    const roleChanges: [CostType, string, string | undefined][] = [
      ['SALES', event.sellerId, body.sellerId],
      ['PRODUCTION', event.producerId, body.producerId],
    ];
    const orderedLines = [...event.costLines].sort(compareCostLines);
    for (const [type, oldPartnerId, newPartnerId] of roleChanges) {
      if (newPartnerId === undefined || newPartnerId === oldPartnerId) continue;
      const oldPersonId = partners.get(oldPartnerId)?.personId;
      const newPersonId = partners.get(newPartnerId)!.personId;
      const ids = orderedLines
        // BR-118: a line on an OPEN/PAID PO keeps its person.
        .filter(
          (l) =>
            l.type === type &&
            l.paidAt === null &&
            l.personId !== null &&
            l.personId === oldPersonId &&
            l.purchaseOrderLines.length === 0,
        )
        .map((l) => l.id);
      if (ids.length > 0) moves.push({ ids, personId: newPersonId });
    }
    const movedSet = new Set(moves.flatMap((m) => m.ids));
    const movedCostLineIds = orderedLines.filter((l) => movedSet.has(l.id)).map((l) => l.id);

    if (changes.length > 0) {
      await inTransaction(db, async (tx) => {
        await tx.event.update({ where: { id: event.id }, data: data });
        for (const move of moves) {
          // Race guard (BR-118): a line put on a PO since it was read above keeps its person → 409.
          for (const id of move.ids) await assertCostLineNotOnPurchaseOrder(tx, id);
          await tx.costLine.updateMany({ where: { id: { in: move.ids } }, data: { personId: move.personId } });
        }
        await logHistory(tx, {
          eventId: event.id,
          type: 'UPDATED',
          partnerId: me.id,
          details: { changes: changes as Prisma.InputJsonArray, movedCostLineIds },
        });
      });
    }

    return { event: await detail(event.id), movedCostLineIds };
  });

  // ---------------------------------------------------------------- move
  app.post<IdParams>('/api/events/:id/move', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(moveBody, request.body);
    if (body.endDate && body.endDate < body.startDate) throw validationError({ endDate: 'END_BEFORE_START' });

    const event = await requireEventDetail(db, request.params.id);
    assertNotDeleted(event);
    if (event.status !== 'SOLD') throw new AppError('INVALID_STATUS_TRANSITION', 'Only a SOLD event can be moved');

    const from = { startDate: isoFromDate(event.startDate), endDate: event.endDate ? isoFromDate(event.endDate) : null };
    const to = { startDate: body.startDate, endDate: body.endDate ?? null };
    const startDate = dateFromIso(to.startDate);
    const endDate = to.endDate ? dateFromIso(to.endDate) : null;

    if (!sameValue(from, to)) {
      await inTransaction(db, async (tx) => {
        await tx.event.update({ where: { id: event.id }, data: { startDate, endDate } });
        await logHistory(tx, { eventId: event.id, type: 'MOVED', partnerId: me.id, reason: body.reason ?? null, details: { from, to } });
      });
    }

    const warnings = await doubleBookingWarnings(db, {
      eventId: event.id,
      startDate,
      endDate,
      lines: [...event.costLines].sort(compareCostLines),
    });
    return { event: await detail(event.id), warnings };
  });

  // ---------------------------------------------------------------- cancel / uncancel
  const statusChange = (path: string, fromStatus: 'SOLD' | 'CANCELLED', toStatus: 'SOLD' | 'CANCELLED') =>
    app.post<IdParams>(path, async (request) => {
      const me = request.requirePartner();
      const { reason } = parseInput(reasonBody, request.body);
      const event = await requireEventDetail(db, request.params.id);
      assertNotDeleted(event);
      if (event.status !== fromStatus) {
        throw new AppError('INVALID_STATUS_TRANSITION', `Event is ${event.status}, expected ${fromStatus}`);
      }
      await inTransaction(db, async (tx) => {
        // BR-118: no cancelling while a line is on an OPEN PO (uncancel is never blocked).
        if (toStatus === 'CANCELLED') await assertEventHasNoOpenPurchaseOrder(tx, event.id);
        await tx.event.update({ where: { id: event.id }, data: { status: toStatus } });
        await logHistory(tx, {
          eventId: event.id,
          type: toStatus === 'CANCELLED' ? 'CANCELLED' : 'UNCANCELLED',
          partnerId: me.id,
          reason,
        });
      });
      return detail(event.id);
    });

  statusChange('/api/events/:id/cancel', 'SOLD', 'CANCELLED');
  statusChange('/api/events/:id/uncancel', 'CANCELLED', 'SOLD');

  // ---------------------------------------------------------------- delete / restore (soft, BR-018)
  app.post<IdParams>('/api/events/:id/delete', async (request, reply) => {
    const me = request.requirePartner();
    const { reason } = parseInput(reasonBody, request.body);
    const event = await requireEventDetail(db, request.params.id);
    assertNotDeleted(event);
    await inTransaction(db, async (tx) => {
      await assertEventHasNoOpenPurchaseOrder(tx, event.id); // BR-118
      await tx.event.update({ where: { id: event.id }, data: { deletedAt: new Date(), deletedById: me.id } });
      await logHistory(tx, { eventId: event.id, type: 'DELETED', partnerId: me.id, reason });
    });
    return reply.status(204).send();
  });

  app.post<IdParams>('/api/events/:id/restore', async (request) => {
    const me = request.requirePartner();
    const event = await requireEventDetail(db, request.params.id);
    if (!event.deletedAt) throw new AppError('INVALID_STATUS_TRANSITION', 'Event is not deleted');
    await inTransaction(db, async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { deletedAt: null, deletedById: null } });
      await logHistory(tx, { eventId: event.id, type: 'RESTORED', partnerId: me.id });
    });
    return detail(event.id);
  });
}
