/**
 * Lineups (api-contract "Lineups and settings page", owner decision 2026-11-06):
 * GET/POST /api/lineup-templates, PATCH/DELETE /api/lineup-templates/{id}. Any signed-in partner.
 * Changes never touch existing events (their cost lines were copied when they were created).
 */
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { AppError, notFound, validationError } from '../http/errors.js';
import { inTransaction, isUuid } from '../events/store.js';
import {
  findLineupByName,
  lineupCreateBody,
  lineupInclude,
  lineupPatchBody,
  lockLineupNames,
  parseLineupBody,
  replaceLineupLines,
  toLineupTemplateDto,
} from '../lineups/store.js';
import { isUniqueViolation } from './budgetCategories.js';

type IdParams = { Params: { id: string } };

const duplicateName = () => validationError({ name: 'DUPLICATE' }, 'A lineup with this name already exists');
const lineupNotFound = () => notFound('Lineup not found');

/** Runs a write; a unique violation on the name becomes 400 name: DUPLICATE. */
async function asDuplicateError<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicateName();
    throw err;
  }
}

export function lineupTemplateRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get('/api/lineup-templates', async () => {
    const lineups = await db.lineupTemplate.findMany({
      include: lineupInclude,
      orderBy: [{ active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return lineups.map(toLineupTemplateDto);
  });

  app.post('/api/lineup-templates', async (request, reply) => {
    const body = parseLineupBody(lineupCreateBody, request.body);
    const created = await asDuplicateError(() =>
      inTransaction(db, async (tx) => {
        await lockLineupNames(tx);
        if (await findLineupByName(tx, body.name)) throw duplicateName();
        const lineup = await tx.lineupTemplate.create({ data: { name: body.name, active: true } });
        await replaceLineupLines(tx, lineup.id, body.lines ?? []);
        return tx.lineupTemplate.findUniqueOrThrow({ where: { id: lineup.id }, include: lineupInclude });
      }),
    );
    return reply.status(201).send(toLineupTemplateDto(created));
  });

  app.patch<IdParams>('/api/lineup-templates/:id', async (request) => {
    const { id } = request.params;
    const body = parseLineupBody(lineupPatchBody, request.body);
    if (!isUuid(id)) throw lineupNotFound();
    const updated = await asDuplicateError(() =>
      inTransaction(db, async (tx) => {
        await lockLineupNames(tx);
        const lineup = await tx.lineupTemplate.findUnique({ where: { id } });
        if (!lineup) throw lineupNotFound();
        if (body.name !== undefined && body.name !== lineup.name && (await findLineupByName(tx, body.name, id))) {
          throw duplicateName();
        }
        const data = {
          ...(body.name !== undefined && body.name !== lineup.name && { name: body.name }),
          ...(body.active !== undefined && body.active !== lineup.active && { active: body.active }),
        };
        if (Object.keys(data).length > 0 || body.lines !== undefined) {
          // updatedAt moves also when only the lines change.
          await tx.lineupTemplate.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
        }
        if (body.lines !== undefined) await replaceLineupLines(tx, id, body.lines);
        return tx.lineupTemplate.findUniqueOrThrow({ where: { id }, include: lineupInclude });
      }),
    );
    return toLineupTemplateDto(updated);
  });

  app.delete<IdParams>('/api/lineup-templates/:id', async (request, reply) => {
    const { id } = request.params;
    if (!isUuid(id)) throw lineupNotFound();
    await inTransaction(db, async (tx) => {
      // Row lock: an event being created with this lineup (FK key-share lock) and the delete wait for each other.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id"::text FROM "lineup_template" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) throw lineupNotFound();
      const eventCount = await tx.event.count({ where: { lineupTemplateId: id } });
      if (eventCount > 0) {
        throw new AppError('LINEUP_IN_USE', 'The lineup is used by events; deactivate it instead', undefined, { eventCount });
      }
      await tx.lineupTemplate.delete({ where: { id } });
    });
    return reply.status(204).send();
  });
}
