/**
 * Invoice row endpoints (docs/api-contract.md "Invoice rows", TASK-046). Every mutation returns
 * 200 EventDetail and logs INVOICE_ROW_ADDED / INVOICE_ROW_UPDATED / INVOICE_ROW_REMOVED.
 * Allowed on SOLD and CANCELLED events; a deleted event → 409 EVENT_DELETED.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { todayIso } from '../domain/dates.js';
import { INVOICE_ROW_STATUSES } from '../domain/enums.js';
import type { Event, InvoiceRow, Prisma } from '../generated/prisma/client.js';
import { notFound, parseInput } from '../http/errors.js';
import { MAX_CENTS, requiredText } from '../events/schemas.js';
import { toEventDetailDto } from '../events/serialize.js';
import { assertNotDeleted, inTransaction, isUuid, logHistory, requireEventDetail } from '../events/store.js';

type IdParams = { Params: { id: string } };

/** Integer cents > 0: missing → REQUIRED, anything else (0, negative, fraction, text) → INVALID_VALUE. */
const amountCents = z
  .number()
  .int({ message: 'INVALID_VALUE' })
  .min(1, { message: 'INVALID_VALUE' })
  .max(MAX_CENTS, { message: 'INVALID_VALUE' });

/** READY | SENT | PAID; anything else (incl. null) → INVALID_VALUE. */
const status = z.enum(INVOICE_ROW_STATUSES, { message: 'INVALID_VALUE' });

const createBody = z.object({
  description: requiredText(), // 1–500 after trimming: missing/blank → REQUIRED, longer → TOO_LONG
  amountCents,
  status: status.optional(),
});

const updateBody = z.object({
  description: requiredText().optional(),
  amountCents: amountCents.optional(),
  status: status.optional(),
});

export function invoiceRowRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  const detail = async (eventId: string) => toEventDetailDto(await requireEventDetail(db, eventId), todayIso());

  /** The row and its event; 404 if unknown, 409 if the event is deleted. */
  const requireMutableRow = async (id: string): Promise<InvoiceRow & { event: Event }> => {
    const row = isUuid(id) ? await db.invoiceRow.findUnique({ where: { id }, include: { event: true } }) : null;
    if (!row) throw notFound('Invoice row not found');
    assertNotDeleted(row.event);
    return row;
  };

  // ---------------------------------------------------------------- add
  app.post<IdParams>('/api/events/:id/invoice-rows', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);
    const event = await requireEventDetail(db, request.params.id);
    assertNotDeleted(event);

    // A new row goes last: its creation time is after every existing row of the event.
    const latest = event.invoiceRows.reduce((max, r) => Math.max(max, r.createdAt.getTime()), 0);
    const createdAt = new Date(Math.max(Date.now(), latest + 1));
    const rowStatus = body.status ?? 'READY';
    await inTransaction(db, async (tx) => {
      const row = await tx.invoiceRow.create({
        data: {
          eventId: event.id,
          description: body.description,
          amountCents: body.amountCents,
          status: rowStatus,
          statusAt: createdAt,
          statusById: me.id,
          createdAt,
          createdById: me.id,
        },
      });
      await logHistory(tx, {
        eventId: event.id,
        type: 'INVOICE_ROW_ADDED',
        partnerId: me.id,
        details: { invoiceRowId: row.id, description: row.description, amountCents: row.amountCents, status: row.status },
      });
    });
    return detail(event.id);
  });

  // ---------------------------------------------------------------- edit
  app.patch<IdParams>('/api/invoice-rows/:id', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(updateBody, request.body);
    const row = await requireMutableRow(request.params.id);

    const changes: { field: string; from: unknown; to: unknown }[] = [];
    const data: Prisma.InvoiceRowUpdateInput = {};
    if (body.description !== undefined && body.description !== row.description) {
      changes.push({ field: 'description', from: row.description, to: body.description });
      data.description = body.description;
    }
    if (body.amountCents !== undefined && body.amountCents !== row.amountCents) {
      changes.push({ field: 'amountCents', from: row.amountCents, to: body.amountCents });
      data.amountCents = body.amountCents;
    }
    // Any status → any status; at/by record the last change.
    if (body.status !== undefined && body.status !== row.status) {
      changes.push({ field: 'status', from: row.status, to: body.status });
      data.status = body.status;
      data.statusAt = new Date();
      data.statusBy = { connect: { id: me.id } };
    }

    if (changes.length > 0) {
      await inTransaction(db, async (tx) => {
        const updated = await tx.invoiceRow.update({ where: { id: row.id }, data });
        await logHistory(tx, {
          eventId: row.eventId,
          type: 'INVOICE_ROW_UPDATED',
          partnerId: me.id,
          details: {
            invoiceRowId: row.id,
            description: updated.description,
            changes: changes as Prisma.InputJsonArray,
          },
        });
      });
    }
    return detail(row.eventId);
  });

  // ---------------------------------------------------------------- remove
  app.delete<IdParams>('/api/invoice-rows/:id', async (request) => {
    const me = request.requirePartner();
    const row = await requireMutableRow(request.params.id);
    await inTransaction(db, async (tx) => {
      await tx.invoiceRow.delete({ where: { id: row.id } });
      await logHistory(tx, {
        eventId: row.eventId,
        type: 'INVOICE_ROW_REMOVED',
        partnerId: me.id,
        details: { invoiceRowId: row.id, description: row.description, amountCents: row.amountCents, status: row.status },
      });
    });
    return detail(row.eventId);
  });
}
