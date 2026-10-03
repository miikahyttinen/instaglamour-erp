/** Hours endpoints (docs/api-contract.md "Hours"; UC-018, UC-019; BR-050, BR-051, BR-083). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { dateFromIso, isoFromDate } from '../domain/dates.js';
import { forbidden, notFound, parseInput } from '../http/errors.js';
import { isoDate, requiredText, yearString } from '../gigs/schemas.js';
import { isUuid, yearDateRange } from '../gigs/store.js';
import { isValidHours, loadHoursTotals, toHourEntryDto } from '../hours/store.js';

type IdParams = { Params: { id: string } };

/** Missing → REQUIRED; not a number, out of range or not a 0.25 step → INVALID_HOURS. */
const hours = z
  .number({ error: (issue) => (issue.input === undefined || issue.input === null ? 'REQUIRED' : 'INVALID_HOURS') })
  .refine(isValidHours, { message: 'INVALID_HOURS' });

const listQuery = z.object({
  year: yearString,
  partnerId: z.string().refine(isUuid, { message: 'INVALID_VALUE' }).optional(),
});

const totalsQuery = z.object({ year: yearString });

const createBody = z.object({ date: isoDate, comment: requiredText(), hours });

const updateBody = z.object({ date: isoDate.optional(), comment: requiredText().optional(), hours: hours.optional() });

export function hourRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** The entry if it exists (404) and belongs to me (403, BR-051). */
  const requireOwnEntry = async (id: string, partnerId: string) => {
    const entry = isUuid(id) ? await db.hourEntry.findUnique({ where: { id } }) : null;
    if (!entry) throw notFound('Hour entry not found');
    if (entry.partnerId !== partnerId) throw forbidden("Only the partner's own hour entries can be changed");
    return entry;
  };

  app.get('/api/hours', async (request) => {
    const me = request.requirePartner();
    const query = parseInput(listQuery, request.query);
    const entries = await db.hourEntry.findMany({
      where: { partnerId: query.partnerId ?? me.id, date: yearDateRange(query.year) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    return entries.map(toHourEntryDto);
  });

  app.get('/api/hours/totals', async (request) => {
    const { year } = parseInput(totalsQuery, request.query);
    return loadHoursTotals(db, year);
  });

  app.post('/api/hours', async (request, reply) => {
    const me = request.requirePartner();
    const body = parseInput(createBody, request.body);
    const entry = await db.hourEntry.create({
      data: { partnerId: me.id, date: dateFromIso(body.date), comment: body.comment, hours: body.hours },
    });
    return reply.status(201).send(toHourEntryDto(entry));
  });

  app.patch<IdParams>('/api/hours/:id', async (request) => {
    const me = request.requirePartner();
    const body = parseInput(updateBody, request.body);
    const entry = await requireOwnEntry(request.params.id, me.id);
    const current = toHourEntryDto(entry);

    const data: { date?: Date; comment?: string; hours?: number } = {};
    if (body.date !== undefined && body.date !== isoFromDate(entry.date)) data.date = dateFromIso(body.date);
    if (body.comment !== undefined && body.comment !== current.comment) data.comment = body.comment;
    if (body.hours !== undefined && body.hours !== current.hours) data.hours = body.hours;
    if (Object.keys(data).length === 0) return current; // no-op

    return toHourEntryDto(await db.hourEntry.update({ where: { id: entry.id }, data }));
  });

  app.delete<IdParams>('/api/hours/:id', async (request, reply) => {
    const me = request.requirePartner();
    const entry = await requireOwnEntry(request.params.id, me.id);
    await db.hourEntry.delete({ where: { id: entry.id } });
    return reply.status(204).send();
  });
}
