/** Gig endpoints (docs/api-contract.md "Gigs"; UC-002…UC-004, UC-007, UC-009, UC-010, UC-012, UC-013, UC-025). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { defaultCostLines } from '../domain/costLines.js';
import { dateFromIso, isoFromDate, todayIso } from '../domain/dates.js';
import { isNotFullyStaffed, yearGigSummary } from '../domain/gigEconomics.js';
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
} from '../gigs/schemas.js';
import { compareCostLines, toGigDetailDto, toGigEventDto, toGigSummaryDto } from '../gigs/serialize.js';
import {
  assertNotDeleted,
  doubleBookingWarnings,
  inTransaction,
  isUuid,
  loadYearGigs,
  logEvent,
  requireGigDetail,
} from '../gigs/store.js';
import { findActiveClient } from '../clients/store.js';
import { assertCostLineNotOnPurchaseOrder, assertGigHasNoOpenPurchaseOrder } from '../purchaseOrders/lock.js';
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
});

const gigCreateBody = z.object({
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  lineupTemplateId: z.string().nullable().optional(),
  lineupName: optionalText(),
  venue: requiredText(),
  technicalSetup: technicalSetup.optional(),
  logistics: logistics.optional(),
  houseTechnician: flag.optional(),
  sellerId: z.string().min(1),
  producerId: z.string().min(1),
  priceCents: money,
  additionalSalesCents: money.optional(),
  additionalSalesDescription: optionalText(),
  notes: optionalText(LONG_TEXT_MAX),
  clientId: z.string().nullable().optional(),
});

const gigUpdateBody = z.object({
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

/** Fields of GigUpdate in the order they are logged. */
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

export function gigRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Partners by id; ids that are not UUIDs are simply not found. */
  const findPartners = async (ids: readonly string[]) => {
    const valid = ids.filter(isUuid);
    const rows = valid.length ? await db.partner.findMany({ where: { id: { in: valid } } }) : [];
    return new Map(rows.map((p) => [p.id, p]));
  };

  const detail = async (id: string) => toGigDetailDto(await requireGigDetail(db, id), todayIso());

  // ---------------------------------------------------------------- list
  app.get('/api/gigs', async (request) => {
    const query = parseInput(listQuery, request.query);
    const today = todayIso();
    const gigs = await loadYearGigs(db, query.year, { includeDeleted: true });
    const yearSummary = yearGigSummary(gigs.filter((g) => g.deletedAt === null));

    const q = query.q?.trim().toLowerCase();
    const filtered = gigs.filter((g) => {
      if (query.deleted === 'true' ? g.deletedAt === null : g.deletedAt !== null) return false;
      if (query.status !== 'ALL' && g.status !== query.status) return false;
      const start = isoFromDate(g.startDate);
      if (query.when === 'upcoming' && start < today) return false;
      if (query.when === 'past' && start >= today) return false;
      if (query.sellerId && g.sellerId !== query.sellerId) return false;
      if (query.producerId && g.producerId !== query.producerId) return false;
      if (query.notFullyStaffed === 'true' && !isNotFullyStaffed(g.costLines)) return false;
      if (q && ![g.venue, g.lineupName, g.notes ?? '', g.client?.name ?? ''].some((s) => s.toLowerCase().includes(q)))
        return false;
      return true;
    });

    return { gigs: filtered.map((g) => toGigSummaryDto(g, today)), yearSummary };
  });

  // ---------------------------------------------------------------- create
  app.post('/api/gigs', async (request, reply) => {
    const me = request.requirePartner();
    const body = parseInput(gigCreateBody, request.body);

    const fields: Record<string, FieldCode> = {};
    if (body.endDate && body.endDate < body.startDate) fields.endDate = 'END_BEFORE_START';

    let template: Prisma.LineupTemplateGetPayload<{ include: { roles: true } }> | null = null;
    if (body.lineupTemplateId) {
      template = isUuid(body.lineupTemplateId)
        ? await db.lineupTemplate.findUnique({
            where: { id: body.lineupTemplateId },
            include: { roles: { orderBy: { position: 'asc' } } },
          })
        : null;
      if (!template) fields.lineupTemplateId = 'UNKNOWN_REFERENCE';
    } else if (!body.lineupName) {
      fields.lineupName = 'REQUIRED';
    }

    const partners = await findPartners([body.sellerId, body.producerId]);
    const seller = partners.get(body.sellerId);
    const producer = partners.get(body.producerId);
    // BR-111: new seller/producer choices must be active partners.
    if (!seller?.active) fields.sellerId = 'UNKNOWN_REFERENCE';
    if (!producer?.active) fields.producerId = 'UNKNOWN_REFERENCE';
    if (body.clientId && !(await findActiveClient(db, body.clientId))) fields.clientId = 'UNKNOWN_REFERENCE';
    throwIfAny(fields);

    const fees = await loadFeeSettings(db);
    const lines = defaultCostLines({
      templateRoles: template?.roles ?? [],
      sellerPersonId: seller!.personId,
      producerPersonId: producer!.personId,
      fees,
    });

    const gigId = await inTransaction(db, async (tx) => {
      const createdBase = Date.now();
      const gig = await tx.gig.create({
        data: {
          startDate: dateFromIso(body.startDate),
          endDate: body.endDate ? dateFromIso(body.endDate) : null,
          lineupTemplateId: template?.id ?? null,
          lineupName: body.lineupName ?? template!.name,
          venue: body.venue,
          technicalSetup: body.technicalSetup ?? null,
          logistics: body.logistics ?? null,
          houseTechnician: body.houseTechnician ?? false,
          sellerId: body.sellerId,
          producerId: body.producerId,
          priceCents: body.priceCents,
          additionalSalesCents: body.additionalSalesCents ?? 0,
          additionalSalesDescription: body.additionalSalesDescription ?? null,
          notes: body.notes ?? null,
          clientId: body.clientId ?? null,
          // Explicit, increasing creation times keep the lines in creation order (contract).
          costLines: { createMany: { data: lines.map((l, i) => ({ ...l, createdAt: new Date(createdBase + i) })) } },
        },
      });
      await logEvent(tx, { gigId: gig.id, type: 'CREATED', partnerId: me.id });
      return gig.id;
    });

    return reply.status(201).send(await detail(gigId));
  });

  // ---------------------------------------------------------------- read
  app.get<IdParams>('/api/gigs/:id', async (request) => detail(request.params.id));

  app.get<IdParams>('/api/gigs/:id/history', async (request) => {
    const { id } = request.params;
    const gig = isUuid(id) ? await db.gig.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!gig) throw notFound('Gig not found');
    const events = await db.gigEvent.findMany({ where: { gigId: id }, orderBy: [{ at: 'desc' }, { seq: 'desc' }] });
    return events.map(toGigEventDto);
  });

  // ---------------------------------------------------------------- update
  app.patch<IdParams>('/api/gigs/:id', async (request) => {
    const me = request.requirePartner();
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const fields: Record<string, FieldCode> = {};
    // Dates change only via move (UC-004 A1).
    for (const key of ['startDate', 'endDate']) if (typeof raw === 'object' && key in raw) fields[key] = 'NOT_EDITABLE';
    throwIfAny(fields);
    const body = parseInput(gigUpdateBody, raw);

    const gig = await requireGigDetail(db, request.params.id);
    assertNotDeleted(gig);

    const partners = await findPartners(
      [gig.sellerId, gig.producerId, body.sellerId, body.producerId].filter((p): p is string => p !== undefined),
    );
    // BR-111: a changed seller/producer must be an active partner; an unchanged one is kept even if removed since.
    const isValidChoice = (id: string, current: string) => id === current || partners.get(id)?.active === true;
    if (body.sellerId !== undefined && !isValidChoice(body.sellerId, gig.sellerId)) fields.sellerId = 'UNKNOWN_REFERENCE';
    if (body.producerId !== undefined && !isValidChoice(body.producerId, gig.producerId))
      fields.producerId = 'UNKNOWN_REFERENCE';
    if (body.clientId && body.clientId !== gig.clientId && !(await findActiveClient(db, body.clientId))) {
      fields.clientId = 'UNKNOWN_REFERENCE';
    }
    throwIfAny(fields);

    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const data: Record<string, unknown> = {};
    for (const field of UPDATE_FIELDS) {
      const next = body[field];
      if (next === undefined) continue;
      const current = gig[field];
      if (sameValue(current, next)) continue;
      changes.push({ field, from: current, to: next });
      data[field] = next;
    }

    // BR-027: the old seller's (producer's) unpaid SALES (PRODUCTION) lines move to the new one.
    const moves: { ids: string[]; personId: string }[] = [];
    const roleChanges: [CostType, string, string | undefined][] = [
      ['SALES', gig.sellerId, body.sellerId],
      ['PRODUCTION', gig.producerId, body.producerId],
    ];
    const orderedLines = [...gig.costLines].sort(compareCostLines);
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
        await tx.gig.update({ where: { id: gig.id }, data: data });
        for (const move of moves) {
          // Race guard (BR-118): a line put on a PO since it was read above keeps its person → 409.
          for (const id of move.ids) await assertCostLineNotOnPurchaseOrder(tx, id);
          await tx.costLine.updateMany({ where: { id: { in: move.ids } }, data: { personId: move.personId } });
        }
        await logEvent(tx, {
          gigId: gig.id,
          type: 'UPDATED',
          partnerId: me.id,
          details: { changes: changes as Prisma.InputJsonArray, movedCostLineIds },
        });
      });
    }

    return { gig: await detail(gig.id), movedCostLineIds };
  });

  // ---------------------------------------------------------------- move
  app.post<IdParams>('/api/gigs/:id/move', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(moveBody, request.body);
    if (body.endDate && body.endDate < body.startDate) throw validationError({ endDate: 'END_BEFORE_START' });

    const gig = await requireGigDetail(db, request.params.id);
    assertNotDeleted(gig);
    if (gig.status !== 'SOLD') throw new AppError('INVALID_STATUS_TRANSITION', 'Only a SOLD gig can be moved');

    const from = { startDate: isoFromDate(gig.startDate), endDate: gig.endDate ? isoFromDate(gig.endDate) : null };
    const to = { startDate: body.startDate, endDate: body.endDate ?? null };
    const startDate = dateFromIso(to.startDate);
    const endDate = to.endDate ? dateFromIso(to.endDate) : null;

    if (!sameValue(from, to)) {
      await inTransaction(db, async (tx) => {
        await tx.gig.update({ where: { id: gig.id }, data: { startDate, endDate } });
        await logEvent(tx, { gigId: gig.id, type: 'MOVED', partnerId: me.id, reason: body.reason ?? null, details: { from, to } });
      });
    }

    const warnings = await doubleBookingWarnings(db, {
      gigId: gig.id,
      startDate,
      endDate,
      lines: [...gig.costLines].sort(compareCostLines),
    });
    return { gig: await detail(gig.id), warnings };
  });

  // ---------------------------------------------------------------- cancel / uncancel
  const statusChange = (path: string, fromStatus: 'SOLD' | 'CANCELLED', toStatus: 'SOLD' | 'CANCELLED') =>
    app.post<IdParams>(path, async (request) => {
      const me = request.requirePartner();
      const { reason } = parseInput(reasonBody, request.body);
      const gig = await requireGigDetail(db, request.params.id);
      assertNotDeleted(gig);
      if (gig.status !== fromStatus) {
        throw new AppError('INVALID_STATUS_TRANSITION', `Gig is ${gig.status}, expected ${fromStatus}`);
      }
      await inTransaction(db, async (tx) => {
        // BR-118: no cancelling while a line is on an OPEN PO (uncancel is never blocked).
        if (toStatus === 'CANCELLED') await assertGigHasNoOpenPurchaseOrder(tx, gig.id);
        await tx.gig.update({ where: { id: gig.id }, data: { status: toStatus } });
        await logEvent(tx, {
          gigId: gig.id,
          type: toStatus === 'CANCELLED' ? 'CANCELLED' : 'UNCANCELLED',
          partnerId: me.id,
          reason,
        });
      });
      return detail(gig.id);
    });

  statusChange('/api/gigs/:id/cancel', 'SOLD', 'CANCELLED');
  statusChange('/api/gigs/:id/uncancel', 'CANCELLED', 'SOLD');

  // ---------------------------------------------------------------- delete / restore (soft, BR-018)
  app.post<IdParams>('/api/gigs/:id/delete', async (request, reply) => {
    const me = request.requirePartner();
    const { reason } = parseInput(reasonBody, request.body);
    const gig = await requireGigDetail(db, request.params.id);
    assertNotDeleted(gig);
    await inTransaction(db, async (tx) => {
      await assertGigHasNoOpenPurchaseOrder(tx, gig.id); // BR-118
      await tx.gig.update({ where: { id: gig.id }, data: { deletedAt: new Date(), deletedById: me.id } });
      await logEvent(tx, { gigId: gig.id, type: 'DELETED', partnerId: me.id, reason });
    });
    return reply.status(204).send();
  });

  app.post<IdParams>('/api/gigs/:id/restore', async (request) => {
    const me = request.requirePartner();
    const gig = await requireGigDetail(db, request.params.id);
    if (!gig.deletedAt) throw new AppError('INVALID_STATUS_TRANSITION', 'Gig is not deleted');
    await inTransaction(db, async (tx) => {
      await tx.gig.update({ where: { id: gig.id }, data: { deletedAt: null, deletedById: null } });
      await logEvent(tx, { gigId: gig.id, type: 'RESTORED', partnerId: me.id });
    });
    return detail(gig.id);
  });
}
