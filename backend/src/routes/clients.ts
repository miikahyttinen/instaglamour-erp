/**
 * Clients (docs/api-contract.md "Clients"; UC-027, BR-100, BR-101).
 * A client is a name + notes. Names are unique case-insensitively (trimmed) among non-deleted
 * clients. Deleting is soft and only allowed when no event links to the client.
 * Offers (TASK-016) are counted and listed too, and block deletion like events.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { clientNameTaken, findActiveClient, toClientDto } from '../clients/store.js';
import { todayIso } from '../domain/dates.js';
import type { Client } from '../generated/prisma/client.js';
import { AppError, notFound, parseInput, validationError } from '../http/errors.js';
import { LONG_TEXT_MAX, optionalText, requiredText, SHORT_TEXT_MAX } from '../events/schemas.js';
import { toEventSummaryDto } from '../events/serialize.js';
import { eventSummaryInclude, inTransaction, type Tx } from '../events/store.js';
import { offerInclude, toOfferSummaryDto } from '../offers/store.js';
import { isUniqueViolation } from './budgetCategories.js';

type IdParams = { Params: { id: string } };

const listQuery = z.object({ q: z.string().max(SHORT_TEXT_MAX).optional() });

const createBody = z.object({
  name: requiredText(),
  notes: optionalText(LONG_TEXT_MAX),
});

const updateBody = z.object({
  name: requiredText().optional(),
  notes: optionalText(LONG_TEXT_MAX),
});

const duplicateName = () => validationError({ name: 'DUPLICATE' }, 'Another client already has this name');

/** Runs a write; a unique violation on the active-name index (concurrent request) becomes 400 name: DUPLICATE. */
async function asDuplicateError<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

async function requireActiveClient(db: Tx, id: string): Promise<Client> {
  const client = await findActiveClient(db, id);
  if (!client) throw notFound('Client not found');
  return client;
}

export function clientRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ---------------------------------------------------------------- list
  app.get('/api/clients', async (request) => {
    const { q } = parseInput(listQuery, request.query);
    const search = q?.trim();
    const clients = await db.client.findMany({
      where: { deletedAt: null, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
      include: {
        _count: { select: { events: { where: { deletedAt: null } }, offers: { where: { deletedAt: null } } } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return clients.map((c) => ({ ...toClientDto(c), eventCount: c._count.events, offerCount: c._count.offers }));
  });

  // ---------------------------------------------------------------- create
  app.post('/api/clients', async (request, reply) => {
    const body = parseInput(createBody, request.body);
    const created = await asDuplicateError(() =>
      inTransaction(db, async (tx) => {
        if (await clientNameTaken(tx, body.name, null)) throw duplicateName();
        return tx.client.create({ data: { name: body.name, notes: body.notes ?? null } });
      }),
    );
    return reply.status(201).send(toClientDto(created));
  });

  // ---------------------------------------------------------------- read
  app.get<IdParams>('/api/clients/:id', async (request) => {
    const client = await requireActiveClient(db, request.params.id);
    const events = await db.event.findMany({
      where: { clientId: client.id, deletedAt: null },
      include: eventSummaryInclude,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const offers = await db.offer.findMany({
      where: { clientId: client.id, deletedAt: null },
      include: offerInclude,
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    const today = todayIso();
    return {
      client: toClientDto(client),
      events: events.map((g) => toEventSummaryDto(g, today)),
      offers: offers.map((o) => toOfferSummaryDto(o, today)),
    };
  });

  // ---------------------------------------------------------------- update
  app.patch<IdParams>('/api/clients/:id', async (request) => {
    const body = parseInput(updateBody, request.body);
    const client = await requireActiveClient(db, request.params.id);

    const data: { name?: string; notes?: string | null } = {};
    if (body.name !== undefined && body.name !== client.name) data.name = body.name;
    if (body.notes !== undefined && body.notes !== client.notes) data.notes = body.notes;
    if (Object.keys(data).length === 0) return toClientDto(client); // no-op

    if (data.name !== undefined && (await clientNameTaken(db, data.name, client.id))) throw duplicateName();
    const updated = await asDuplicateError(() => db.client.update({ where: { id: client.id }, data }));
    return toClientDto(updated);
  });

  // ---------------------------------------------------------------- delete (soft, BR-101)
  app.delete<IdParams>('/api/clients/:id', async (request, reply) => {
    const { id } = await requireActiveClient(db, request.params.id);
    await inTransaction(db, async (tx) => {
      // Lock the row and re-check, so two concurrent deletes don't interleave.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"::text FROM "client" WHERE "id" = ${id}::uuid AND "deleted_at" IS NULL FOR UPDATE`;
      if (locked.length === 0) throw notFound('Client not found');
      const client = { id };
      // Deleted events/offers count too: restoring one must never leave it linked to a deleted client.
      const links =
        (await tx.event.count({ where: { clientId: client.id } })) +
        (await tx.offer.count({ where: { clientId: client.id } }));
      if (links > 0) throw new AppError('CLIENT_IN_USE', 'Events or offers link to this client');
      await tx.client.update({ where: { id: client.id }, data: { deletedAt: new Date() } });
    });
    return reply.status(204).send();
  });
}
