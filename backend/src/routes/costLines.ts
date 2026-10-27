/** Cost line endpoints (docs/api-contract.md "Cost lines"; UC-005, BR-008, BR-020…BR-027). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { todayIso } from '../domain/dates.js';
import { COST_TYPES, DESCRIPTION_REQUIRED_TYPES, isMusicianRole, isPayable } from '../domain/enums.js';
import { switchLoadIn } from '../domain/loadIn.js';
import type { CostLine, Event, Prisma } from '../generated/prisma/client.js';
import { AppError, notFound, parseInput, validationError, type FieldCode } from '../http/errors.js';
import { money, oneOf, optionalText } from '../events/schemas.js';
import { toEventDetailDto } from '../events/serialize.js';
import {
  assertNotDeleted,
  doubleBookingWarnings,
  inTransaction,
  isUuid,
  logHistory,
  requireEventDetail,
  type Warning,
} from '../events/store.js';
import { assertCostLineNotOnPurchaseOrder } from '../purchaseOrders/lock.js';
import { loadFeeSettings } from './reference.js';

type IdParams = { Params: { id: string } };

const createBody = z.object({
  type: oneOf(COST_TYPES),
  personId: z.string().nullable().optional(),
  description: optionalText(),
  budgetedCents: money,
});

const updateBody = z.object({
  personId: z.string().nullable().optional(),
  description: optionalText(),
  budgetedCents: money.optional(),
  joinsLoadIn: z.boolean().optional(),
});

const payBody = z.object({ actualCents: money.optional() });

export function costLineRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  const personExists = async (personId: string) =>
    isUuid(personId) && (await db.person.count({ where: { id: personId } })) > 0;

  /** The line and its event; 404 if unknown, 409 if the event is deleted. */
  const requireMutableLine = async (id: string): Promise<CostLine & { event: Event }> => {
    const line = isUuid(id) ? await db.costLine.findUnique({ where: { id }, include: { event: true } }) : null;
    if (!line) throw notFound('Cost line not found');
    assertNotDeleted(line.event);
    return line;
  };

  const result = async (eventId: string, warnings: Warning[] = []) => ({
    event: toEventDetailDto(await requireEventDetail(db, eventId), todayIso()),
    warnings,
  });

  const warningsFor = (event: Event, line: { type: string; personId: string | null }) =>
    doubleBookingWarnings(db, { eventId: event.id, startDate: event.startDate, endDate: event.endDate, lines: [line] });

  // ---------------------------------------------------------------- add
  app.post<IdParams>('/api/events/:id/cost-lines', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);
    const event = await requireEventDetail(db, request.params.id);
    assertNotDeleted(event);

    const fields: Record<string, FieldCode> = {};
    if (DESCRIPTION_REQUIRED_TYPES.has(body.type) && !body.description) fields.description = 'DESCRIPTION_REQUIRED';
    if (body.personId && !(await personExists(body.personId))) fields.personId = 'UNKNOWN_REFERENCE';
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const personId = body.personId ?? null;
    // A new line goes last: its creation time is after every existing line of the event.
    const latest = event.costLines.reduce((max, l) => Math.max(max, l.createdAt.getTime()), 0);
    const createdAt = new Date(Math.max(Date.now(), latest + 1));
    await inTransaction(db, async (tx) => {
      const line = await tx.costLine.create({
        data: {
          createdAt,
          eventId: event.id,
          type: body.type,
          personId,
          description: body.description ?? null,
          budgetedCents: body.budgetedCents,
          joinsLoadIn: isMusicianRole(body.type) ? true : null,
        },
      });
      await logHistory(tx, {
        eventId: event.id,
        type: 'COST_ADDED',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, personId, budgetedCents: line.budgetedCents },
      });
    });
    return result(event.id, await warningsFor(event, { type: body.type, personId }));
  });

  // ---------------------------------------------------------------- edit
  app.patch<IdParams>('/api/cost-lines/:id', async (request) => {
    const me = request.requirePartner();
    const raw = request.body;
    if (raw !== null && typeof raw === 'object' && 'type' in raw) throw validationError({ type: 'NOT_EDITABLE' });
    const body = parseInput(updateBody, raw);
    const line = await requireMutableLine(request.params.id);

    const fields: Record<string, FieldCode> = {};
    if (body.joinsLoadIn !== undefined && !isMusicianRole(line.type)) fields.joinsLoadIn = 'INVALID_VALUE';
    if (body.personId && !(await personExists(body.personId))) fields.personId = 'UNKNOWN_REFERENCE';
    const description = body.description === undefined ? line.description : body.description;
    if (DESCRIPTION_REQUIRED_TYPES.has(line.type) && !description) fields.description = 'DESCRIPTION_REQUIRED';
    if (Object.keys(fields).length > 0) throw validationError(fields);

    // Budget first, then the load-in switch (BR-026).
    const personId = body.personId === undefined ? line.personId : body.personId;
    let budgetedCents = body.budgetedCents ?? line.budgetedCents;
    let joinsLoadIn = line.joinsLoadIn;
    let loadInDeductionAppliedCents = line.loadInDeductionAppliedCents;
    if (body.joinsLoadIn !== undefined && body.joinsLoadIn !== line.joinsLoadIn) {
      const { loadInDeductionCents } = await loadFeeSettings(db);
      const switched = switchLoadIn(
        { budgetedCents, joinsLoadIn: line.joinsLoadIn ?? true, loadInDeductionAppliedCents },
        body.joinsLoadIn,
        loadInDeductionCents,
      );
      ({ budgetedCents, joinsLoadIn, loadInDeductionAppliedCents } = switched);
    }

    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const track = (field: string, from: unknown, to: unknown) => {
      if (from !== to) changes.push({ field, from, to });
    };
    track('personId', line.personId, personId);
    track('description', line.description, description);
    track('budgetedCents', line.budgetedCents, budgetedCents);
    track('joinsLoadIn', line.joinsLoadIn, joinsLoadIn);

    // BR-118: person, amount and load-in switch are locked while the line is on an OPEN/PAID PO;
    // the description stays editable. Only an actual change counts (sending the same value is fine).
    const lockedChange = changes.some((c) => c.field !== 'description');
    if (changes.length > 0) {
      await inTransaction(db, async (tx) => {
        if (lockedChange) await assertCostLineNotOnPurchaseOrder(tx, line.id);
        await tx.costLine.update({
          where: { id: line.id },
          data: { personId, description, budgetedCents, joinsLoadIn, loadInDeductionAppliedCents },
        });
        await logHistory(tx, {
          eventId: line.eventId,
          type: 'COST_UPDATED',
          partnerId: me.id,
          details: { costLineId: line.id, type: line.type, changes: changes as Prisma.InputJsonArray },
        });
      });
    }

    const warnings = personId !== line.personId ? await warningsFor(line.event, { type: line.type, personId }) : [];
    return result(line.eventId, warnings);
  });

  // ---------------------------------------------------------------- remove
  app.delete<IdParams>('/api/cost-lines/:id', async (request) => {
    const me = request.requirePartner();
    const line = await requireMutableLine(request.params.id);
    await inTransaction(db, async (tx) => {
      await assertCostLineNotOnPurchaseOrder(tx, line.id);
      await tx.costLine.delete({ where: { id: line.id } });
      await logHistory(tx, {
        eventId: line.eventId,
        type: 'COST_REMOVED',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, personId: line.personId, budgetedCents: line.budgetedCents },
      });
    });
    return result(line.eventId);
  });

  // ---------------------------------------------------------------- pay / unpay (BR-025, BR-008)
  app.post<IdParams>('/api/cost-lines/:id/pay', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(payBody, request.body);
    const line = await requireMutableLine(request.params.id);
    if (!isPayable(line.type)) throw new AppError('COST_NOT_PAYABLE', 'FUEL lines are estimates and cannot be paid');

    const actualCents = body.actualCents ?? line.budgetedCents;
    await inTransaction(db, async (tx) => {
      await assertCostLineNotOnPurchaseOrder(tx, line.id);
      await tx.costLine.update({
        where: { id: line.id },
        // Already paid: only the amount changes; the original payment time and partner stay.
        data: line.paidAt ? { actualCents } : { actualCents, paidAt: new Date(), paidById: me.id },
      });
      await logHistory(tx, {
        eventId: line.eventId,
        type: 'COST_PAID',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, actualCents },
      });
    });
    return result(line.eventId);
  });

  app.post<IdParams>('/api/cost-lines/:id/unpay', async (request) => {
    const me = request.requirePartner();
    const line = await requireMutableLine(request.params.id);
    // The lock check runs even when the line is unpaid (a line on an OPEN PO is unpaid): 409, not a no-op.
    await inTransaction(db, async (tx) => {
      await assertCostLineNotOnPurchaseOrder(tx, line.id);
      if (line.paidAt) {
        await tx.costLine.update({ where: { id: line.id }, data: { actualCents: null, paidAt: null, paidById: null } });
        await logHistory(tx, {
          eventId: line.eventId,
          type: 'COST_UNPAID',
          partnerId: me.id,
          details: { costLineId: line.id, type: line.type, previousActualCents: line.actualCents },
        });
      }
    });
    return result(line.eventId);
  });
}
