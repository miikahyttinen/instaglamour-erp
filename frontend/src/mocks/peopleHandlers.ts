// Mock handlers for docs/api-contract.md → People (UC-014). People live in the gig mock store
// (db.gigs.people) so the gig pickers and the people register share one list.
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type {
  Person,
  PersonCostLine,
  PersonCostLinesResponse,
  PersonCreate,
  PersonUpdate,
  PersonWithWarnings,
  Warning,
} from '../api/types';
import { db } from './data';
import { mockId } from './gigStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const NAME_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trimmed name, or the field code when invalid. `undefined` = not sent (PATCH). */
function checkName(value: unknown, required: boolean): { name?: string; error?: FieldCode } {
  if (value === undefined && !required) return {};
  if (typeof value !== 'string') return { error: value == null ? 'REQUIRED' : 'INVALID_VALUE' };
  const name = value.trim();
  if (!name) return { error: 'REQUIRED' };
  if (name.length > NAME_MAX) return { error: 'TOO_LONG' };
  return { name };
}

/** Duplicate = case-insensitive exact name match with another person (warning only). */
function duplicateWarnings(name: string, exceptId?: string): Warning[] {
  const lower = name.toLowerCase();
  const exists = db.gigs.people.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower);
  return exists ? [{ code: 'DUPLICATE_NAME' }] : [];
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

function findPerson(id: unknown): Person | undefined {
  return typeof id === 'string' && UUID_RE.test(id)
    ? db.gigs.people.find((p) => p.id === id)
    : undefined;
}

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Person not found');

export const peopleHandlers = [
  http.get('/api/people', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const active = new URL(request.url).searchParams.get('active') ?? 'true';
    if (!['true', 'false', 'all'].includes(active)) return validationError({ active: 'INVALID_VALUE' });
    const people: Person[] = db.gigs.people
      .filter((p) => active === 'all' || p.active === (active === 'true'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((p) => ({ ...p }));
    return HttpResponse.json(people);
  }),

  http.post('/api/people', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<PersonCreate>(request);
    const { name, error } = checkName(body.name, true);
    if (error || name === undefined) return validationError({ name: error ?? 'REQUIRED' });
    const warnings = duplicateWarnings(name);
    const person: Person = { id: mockId(), name, active: true };
    db.gigs.people.push(person);
    const response: PersonWithWarnings = { person: { ...person }, warnings };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.patch('/api/people/:id', async ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<PersonUpdate>(request);
    const fields: Record<string, FieldCode> = {};
    const { name, error } = checkName(body.name, false);
    if (error) fields.name = error;
    if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'INVALID_VALUE';
    if (Object.keys(fields).length > 0) return validationError(fields);
    const person = findPerson(params.id);
    if (!person) return notFound();
    const warnings = name === undefined ? [] : duplicateWarnings(name, person.id);
    if (name !== undefined) person.name = name;
    if (body.active !== undefined) person.active = body.active;
    const response: PersonWithWarnings = { person: { ...person }, warnings };
    return HttpResponse.json(response);
  }),

  http.get('/api/people/:id/cost-lines', ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const year = new URL(request.url).searchParams.get('year') ?? '';
    if (!/^\d{4}$/.test(year)) return validationError({ year: 'INVALID_VALUE' });
    const person = findPerson(params.id);
    if (!person) return notFound();

    const gigs = db.gigs.gigs
      .filter((g) => g.deletedAt === null && g.startDate.startsWith(`${year}-`))
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    const lines: PersonCostLine[] = [];
    const totals = { budgetedCents: 0, actualCents: 0 };
    for (const gig of gigs) {
      // costLines are kept in creation order.
      for (const line of db.gigs.costLines) {
        if (line.gigId !== gig.id || line.personId !== person.id) continue;
        lines.push({
          costLine: { ...line },
          gigId: gig.id,
          gigStartDate: gig.startDate,
          gigLineupName: gig.lineupName,
          gigVenue: gig.venue,
          gigStatus: gig.status,
        });
        totals.budgetedCents += line.budgetedCents;
        if (line.paidAt !== null) totals.actualCents += line.actualCents ?? 0;
      }
    }
    const response: PersonCostLinesResponse = { lines, totals };
    return HttpResponse.json(response);
  }),
];
