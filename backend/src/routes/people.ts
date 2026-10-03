/** People endpoints (docs/api-contract.md "People"; UC-014, BR-024). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { isoFromDate } from '../domain/dates.js';
import { notFound, parseInput } from '../http/errors.js';
import { requiredText, yearString } from '../gigs/schemas.js';
import { compareCostLines, toCostLineDto } from '../gigs/serialize.js';
import { isUuid, yearDateRange } from '../gigs/store.js';
import { toPersonDto } from '../serializers.js';

type IdParams = { Params: { id: string } };

const listQuery = z.object({
  active: z.enum(['true', 'false', 'all'], { message: 'INVALID_VALUE' }).default('true'),
});
const createBody = z.object({ name: requiredText() });
const updateBody = z.object({ name: requiredText().optional(), active: z.boolean().optional() });
const costLinesQuery = z.object({ year: yearString });

type PersonWarning = { code: 'DUPLICATE_NAME' };

export function peopleRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  const requirePerson = async (id: string) => {
    const person = isUuid(id) ? await db.person.findUnique({ where: { id } }) : null;
    if (!person) throw notFound('Person not found');
    return person;
  };

  /** Duplicate = case-insensitive exact name match with another person (warning only). */
  const duplicateWarnings = async (name: string, exceptId?: string): Promise<PersonWarning[]> => {
    const count = await db.person.count({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    });
    return count > 0 ? [{ code: 'DUPLICATE_NAME' }] : [];
  };

  app.get('/api/people', async (request) => {
    const { active } = parseInput(listQuery, request.query);
    const people = await db.person.findMany({
      where: active === 'all' ? {} : { active: active === 'true' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return people.map(toPersonDto);
  });

  app.post('/api/people', async (request, reply) => {
    const { name } = parseInput(createBody, request.body);
    const warnings = await duplicateWarnings(name);
    const person = await db.person.create({ data: { name } });
    return reply.status(201).send({ person: toPersonDto(person), warnings });
  });

  app.patch<IdParams>('/api/people/:id', async (request) => {
    const body = parseInput(updateBody, request.body);
    const person = await requirePerson(request.params.id);
    const warnings = body.name === undefined ? [] : await duplicateWarnings(body.name, person.id);

    const data: { name?: string; active?: boolean } = {};
    if (body.name !== undefined && body.name !== person.name) data.name = body.name;
    if (body.active !== undefined && body.active !== person.active) data.active = body.active;
    const updated = Object.keys(data).length > 0 ? await db.person.update({ where: { id: person.id }, data }) : person;
    return { person: toPersonDto(updated), warnings };
  });

  /** The person's cost lines on non-deleted gigs of the year (UC-014 A2), in gig order. */
  app.get<IdParams>('/api/people/:id/cost-lines', async (request) => {
    const { year } = parseInput(costLinesQuery, request.query);
    const person = await requirePerson(request.params.id);
    const lines = await db.costLine.findMany({
      where: { personId: person.id, gig: { deletedAt: null, startDate: yearDateRange(year) } },
      include: { gig: true },
    });
    lines.sort(
      (a, b) =>
        a.gig.startDate.getTime() - b.gig.startDate.getTime() ||
        a.gig.createdAt.getTime() - b.gig.createdAt.getTime() ||
        (a.gig.id < b.gig.id ? -1 : a.gig.id > b.gig.id ? 1 : 0) ||
        compareCostLines(a, b),
    );

    // Same rules as the gig economics: budgeted = Σ budgeted (BR-001), actual = Σ actual of paid lines (BR-002).
    let budgetedCents = 0;
    let actualCents = 0;
    for (const line of lines) {
      budgetedCents += line.budgetedCents;
      if (line.paidAt !== null) actualCents += line.actualCents ?? 0;
    }

    return {
      lines: lines.map(({ gig, ...line }) => ({
        costLine: toCostLineDto(line),
        gigId: gig.id,
        gigStartDate: isoFromDate(gig.startDate),
        gigLineupName: gig.lineupName,
        gigVenue: gig.venue,
        gigStatus: gig.status,
      })),
      totals: { budgetedCents, actualCents },
    };
  });
}
