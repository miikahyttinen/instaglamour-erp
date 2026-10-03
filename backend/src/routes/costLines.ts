/** Cost line endpoints (docs/api-contract.md "Cost lines"; UC-005, BR-008, BR-020…BR-027). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { todayIso } from '../domain/dates.js';
import { COST_TYPES, DESCRIPTION_REQUIRED_TYPES, isMusicianRole, isPayable } from '../domain/enums.js';
import { switchLoadIn } from '../domain/loadIn.js';
import type { CostLine, Gig, Prisma } from '../generated/prisma/client.js';
import { AppError, notFound, parseInput, validationError, type FieldCode } from '../http/errors.js';
import { money, oneOf, optionalText } from '../gigs/schemas.js';
import { toGigDetailDto } from '../gigs/serialize.js';
import {
  assertNotDeleted,
  doubleBookingWarnings,
  inTransaction,
  isUuid,
  logEvent,
  requireGigDetail,
  type Warning,
} from '../gigs/store.js';
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

  /** The line and its gig; 404 if unknown, 409 if the gig is deleted. */
  const requireMutableLine = async (id: string): Promise<CostLine & { gig: Gig }> => {
    const line = isUuid(id) ? await db.costLine.findUnique({ where: { id }, include: { gig: true } }) : null;
    if (!line) throw notFound('Cost line not found');
    assertNotDeleted(line.gig);
    return line;
  };

  const result = async (gigId: string, warnings: Warning[] = []) => ({
    gig: toGigDetailDto(await requireGigDetail(db, gigId), todayIso()),
    warnings,
  });

  const warningsFor = (gig: Gig, personId: string | null) =>
    doubleBookingWarnings(db, { gigId: gig.id, startDate: gig.startDate, endDate: gig.endDate, personIds: [personId] });

  // ---------------------------------------------------------------- add
  app.post<IdParams>('/api/gigs/:id/cost-lines', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);
    const gig = await requireGigDetail(db, request.params.id);
    assertNotDeleted(gig);

    const fields: Record<string, FieldCode> = {};
    if (DESCRIPTION_REQUIRED_TYPES.has(body.type) && !body.description) fields.description = 'DESCRIPTION_REQUIRED';
    if (body.personId && !(await personExists(body.personId))) fields.personId = 'UNKNOWN_REFERENCE';
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const personId = body.personId ?? null;
    await inTransaction(db, async (tx) => {
      const line = await tx.costLine.create({
        data: {
          gigId: gig.id,
          type: body.type,
          personId,
          description: body.description ?? null,
          budgetedCents: body.budgetedCents,
          joinsLoadIn: isMusicianRole(body.type) ? true : null,
        },
      });
      await logEvent(tx, {
        gigId: gig.id,
        type: 'COST_ADDED',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, personId, budgetedCents: line.budgetedCents },
      });
    });
    return result(gig.id, await warningsFor(gig, personId));
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

    if (changes.length > 0) {
      await inTransaction(db, async (tx) => {
        await tx.costLine.update({
          where: { id: line.id },
          data: { personId, description, budgetedCents, joinsLoadIn, loadInDeductionAppliedCents },
        });
        await logEvent(tx, {
          gigId: line.gigId,
          type: 'COST_UPDATED',
          partnerId: me.id,
          details: { costLineId: line.id, type: line.type, changes: changes as Prisma.InputJsonArray },
        });
      });
    }

    const warnings = personId !== line.personId ? await warningsFor(line.gig, personId) : [];
    return result(line.gigId, warnings);
  });

  // ---------------------------------------------------------------- remove
  app.delete<IdParams>('/api/cost-lines/:id', async (request) => {
    const me = request.requirePartner();
    const line = await requireMutableLine(request.params.id);
    await inTransaction(db, async (tx) => {
      await tx.costLine.delete({ where: { id: line.id } });
      await logEvent(tx, {
        gigId: line.gigId,
        type: 'COST_REMOVED',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, personId: line.personId, budgetedCents: line.budgetedCents },
      });
    });
    return result(line.gigId);
  });

  // ---------------------------------------------------------------- pay / unpay (BR-025, BR-008)
  app.post<IdParams>('/api/cost-lines/:id/pay', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(payBody, request.body);
    const line = await requireMutableLine(request.params.id);
    if (!isPayable(line.type)) throw new AppError('COST_NOT_PAYABLE', 'FUEL lines are estimates and cannot be paid');

    const actualCents = body.actualCents ?? line.budgetedCents;
    await inTransaction(db, async (tx) => {
      await tx.costLine.update({
        where: { id: line.id },
        // Already paid: only the amount changes; the original payment time and partner stay.
        data: line.paidAt ? { actualCents } : { actualCents, paidAt: new Date(), paidById: me.id },
      });
      await logEvent(tx, {
        gigId: line.gigId,
        type: 'COST_PAID',
        partnerId: me.id,
        details: { costLineId: line.id, type: line.type, actualCents },
      });
    });
    return result(line.gigId);
  });

  app.post<IdParams>('/api/cost-lines/:id/unpay', async (request) => {
    const me = request.requirePartner();
    const line = await requireMutableLine(request.params.id);
    if (line.paidAt) {
      await inTransaction(db, async (tx) => {
        await tx.costLine.update({ where: { id: line.id }, data: { actualCents: null, paidAt: null, paidById: null } });
        await logEvent(tx, {
          gigId: line.gigId,
          type: 'COST_UNPAID',
          partnerId: me.id,
          details: { costLineId: line.id, type: line.type, previousActualCents: line.actualCents },
        });
      });
    }
    return result(line.gigId);
  });
}
