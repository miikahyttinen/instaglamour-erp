// Mock handlers for docs/api-contract.md → People (UC-014) and Partner status (UC-032). People
// live in the event mock store (db.events.people) so the event pickers and the people register share
// one list; `person.partner` is derived from db.partners (linked by personId).
import { http, HttpResponse } from 'msw';
import { isMusicianRole, MUSICIAN_ROLES, type FieldCode, type MusicianRole } from '../api/enums';
import type {
  Person,
  PersonCostLine,
  PersonCostLinesResponse,
  PersonCreate,
  PersonPartnerUpdate,
  PersonUpdate,
  PersonWithWarnings,
  Warning,
} from '../api/types';
import { db } from './data';
import { mockId, type MockPerson } from './eventStore';
import { todayIso } from '../lib/format';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const NAME_MAX = 500;
/** AUTH_ALLOWED_DOMAIN of the mock backend (synthetic, BR-090). */
export const MOCK_ALLOWED_DOMAIN = 'example.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
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
  const exists = db.events.people.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower);
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

function partnerOf(personId: string) {
  return db.partners.find((p) => p.personId === personId);
}

/**
 * Distinct played events (SOLD, start date before today, not deleted, all years) where the person
 * has at least one musician-role cost line.
 */
function eventCountOf(personId: string): number {
  const today = todayIso();
  const played = new Set(
    db.events.events
      .filter((g) => g.deletedAt === null && g.status === 'SOLD' && g.startDate < today)
      .map((g) => g.id),
  );
  const eventIds = new Set(
    db.events.costLines
      .filter((l) => l.personId === personId && isMusicianRole(l.type) && played.has(l.eventId))
      .map((l) => l.eventId),
  );
  return eventIds.size;
}

/** `roles` of PATCH: unique musician-role codes, returned in MUSICIAN_ROLES order. */
function checkRoles(value: unknown): { roles?: MusicianRole[]; error?: FieldCode } {
  if (value === undefined) return {};
  if (!Array.isArray(value)) return { error: 'INVALID_VALUE' };
  const codes = value as unknown[];
  const valid = codes.every(
    (c) => typeof c === 'string' && (MUSICIAN_ROLES as readonly string[]).includes(c),
  );
  if (!valid || new Set(codes).size !== codes.length) return { error: 'INVALID_VALUE' };
  return { roles: MUSICIAN_ROLES.filter((r) => codes.includes(r)) };
}

/** API shape: the stored person + its partner status and event count. */
function toPerson(stored: MockPerson): Person {
  const partner = partnerOf(stored.id);
  return {
    ...stored,
    roles: [...stored.roles],
    partner: partner ? { id: partner.id, email: partner.email, active: partner.active } : null,
    eventCount: eventCountOf(stored.id),
  };
}

/** BR-110: required, in the allowed domain, unique among partners (case-insensitive). */
function checkPartnerEmail(value: unknown, personId: string): { email?: string; error?: FieldCode } {
  if (value != null && typeof value !== 'string') return { error: 'INVALID_VALUE' };
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!email) return { error: 'REQUIRED' };
  if (!EMAIL_RE.test(email) || !email.endsWith(`@${MOCK_ALLOWED_DOMAIN}`)) return { error: 'INVALID_VALUE' };
  if (db.partners.some((p) => p.personId !== personId && p.email.toLowerCase() === email)) {
    return { error: 'DUPLICATE' };
  }
  return { email };
}

function findPerson(id: unknown): MockPerson | undefined {
  return typeof id === 'string' && UUID_RE.test(id)
    ? db.events.people.find((p) => p.id === id)
    : undefined;
}

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Person not found');

export const peopleHandlers = [
  http.get('/api/people', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const active = params.get('active') ?? 'true';
    if (!['true', 'false', 'all'].includes(active)) return validationError({ active: 'INVALID_VALUE' });
    const partner = params.get('partner');
    if (partner !== null && !['true', 'false'].includes(partner)) {
      return validationError({ partner: 'INVALID_VALUE' });
    }
    const role = params.get('role');
    if (role !== null && !(MUSICIAN_ROLES as readonly string[]).includes(role)) {
      return validationError({ role: 'INVALID_VALUE' });
    }
    const people: Person[] = db.events.people
      .filter((p) => active === 'all' || p.active === (active === 'true'))
      .map(toPerson)
      .filter((p) => partner === null || (p.partner?.active === true) === (partner === 'true'))
      .filter((p) => role === null || (p.roles as string[]).includes(role))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return HttpResponse.json(people);
  }),

  http.post('/api/people', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<PersonCreate>(request);
    const { name, error } = checkName(body.name, true);
    if (error || name === undefined) return validationError({ name: error ?? 'REQUIRED' });
    const warnings = duplicateWarnings(name);
    const person: MockPerson = { id: mockId(), name, active: true, roles: [] };
    db.events.people.push(person);
    const response: PersonWithWarnings = { person: toPerson(person), warnings };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.patch('/api/people/:id', async ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<PersonUpdate>(request);
    const fields: Record<string, FieldCode> = {};
    const { name, error } = checkName(body.name, false);
    if (error) fields.name = error;
    if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'INVALID_VALUE';
    const { roles, error: rolesError } = checkRoles(body.roles);
    if (rolesError) fields.roles = rolesError;
    if (Object.keys(fields).length > 0) return validationError(fields);
    const person = findPerson(params.id);
    if (!person) return notFound();
    const warnings = name === undefined ? [] : duplicateWarnings(name, person.id);
    if (name !== undefined) {
      person.name = name;
      // Partner.name comes from the linked Person.
      const partner = partnerOf(person.id);
      if (partner) partner.name = name;
    }
    if (body.active !== undefined) person.active = body.active;
    if (roles !== undefined) person.roles = roles;
    const response: PersonWithWarnings = { person: toPerson(person), warnings };
    return HttpResponse.json(response);
  }),

  // UC-032 / BR-110: make (or re-activate) a partner, or change its email.
  http.put('/api/people/:id/partner', async ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<PersonPartnerUpdate>(request);
    const person = findPerson(params.id);
    const { email, error } = checkPartnerEmail(body.email, person?.id ?? '');
    if (error || email === undefined) return validationError({ email: error ?? 'REQUIRED' });
    if (!person) return notFound();
    const partner = partnerOf(person.id);
    if (partner) {
      partner.email = email;
      partner.active = true;
    } else {
      db.partners.push({
        id: mockId(),
        personId: person.id,
        name: person.name,
        email,
        language: 'fi',
        selectedYear: new Date().getFullYear(),
        active: true,
      });
    }
    return HttpResponse.json(toPerson(person));
  }),

  // BR-111 / BR-112: deactivate; the partner's mock session stops working (currentPartner()).
  http.delete('/api/people/:id/partner', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const person = findPerson(params.id);
    const partner = person && partnerOf(person.id);
    if (!person || !partner?.active) return notFound();
    if (partner.id === me.id) return errorResponse(409, 'CANNOT_REMOVE_SELF', 'Cannot remove own partner status');
    if (db.partners.filter((p) => p.active).length <= 1) {
      return errorResponse(409, 'LAST_PARTNER', 'Cannot remove the last partner');
    }
    partner.active = false;
    return HttpResponse.json(toPerson(person));
  }),

  http.get('/api/people/:id/cost-lines', ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const year = new URL(request.url).searchParams.get('year') ?? '';
    if (!/^\d{4}$/.test(year)) return validationError({ year: 'INVALID_VALUE' });
    const person = findPerson(params.id);
    if (!person) return notFound();

    const events = db.events.events
      .filter((g) => g.deletedAt === null && g.startDate.startsWith(`${year}-`))
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.createdAt.localeCompare(b.createdAt) ||
          a.id.localeCompare(b.id),
      );
    const lines: PersonCostLine[] = [];
    const totals = { budgetedCents: 0, actualCents: 0 };
    for (const event of events) {
      // costLines are kept in creation order.
      for (const line of db.events.costLines) {
        if (line.eventId !== event.id || line.personId !== person.id) continue;
        lines.push({
          costLine: { ...line },
          eventId: event.id,
          eventStartDate: event.startDate,
          eventLineupName: event.lineupName,
          eventVenue: event.venue,
          eventStatus: event.status,
        });
        totals.budgetedCents += line.budgetedCents;
        if (line.paidAt !== null) totals.actualCents += line.actualCents ?? 0;
      }
    }
    const response: PersonCostLinesResponse = { lines, totals };
    return HttpResponse.json(response);
  }),
];
