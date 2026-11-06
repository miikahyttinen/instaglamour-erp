// Mock handlers for docs/api-contract.md → "Lineups and settings page". Lineups live in
// db.reference.lineupTemplates (all of them; the reference endpoint lists the active ones).
// Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import { COST_TYPES, type CostType, type FieldCode } from '../api/enums';
import type { LineupLine, LineupTemplate, LineupTemplateCreate, LineupTemplateUpdate } from '../api/types';
import { db, type MockLineup } from './data';
import { mockId } from './eventStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const NAME_MAX = 500;
const DESCRIPTION_MAX = 500;
const LINES_MAX = 100;

type Fields = Record<string, FieldCode>;

/** Gigs (incl. deleted) linked to the lineup. */
const eventCount = (id: string) => db.events.events.filter((e) => e.lineupTemplateId === id).length;

export function toLineupTemplate(lineup: MockLineup): LineupTemplate {
  return {
    id: lineup.id,
    name: lineup.name,
    active: lineup.active,
    lines: lineup.lines.map((l) => ({ ...l })),
    eventCount: eventCount(lineup.id),
  };
}

/** Active first, then by name. */
export function sortedLineups(): MockLineup[] {
  return [...db.reference.lineupTemplates].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

function checkName(fields: Fields, value: unknown, exceptId?: string): string | undefined {
  if (typeof value !== 'string') {
    fields.name = value == null ? 'REQUIRED' : 'INVALID_VALUE';
    return undefined;
  }
  const name = value.trim();
  if (!name) fields.name = 'REQUIRED';
  else if (name.length > NAME_MAX) fields.name = 'TOO_LONG';
  else if (
    db.reference.lineupTemplates.some((l) => l.id !== exceptId && l.name.toLowerCase() === name.toLowerCase())
  ) {
    fields.name = 'DUPLICATE';
  }
  return name;
}

/**
 * Validates `lines`; field keys are `lines` (not a list / too many) or `lines[i].<field>`
 * (the contract doesn't name the per-line key; the UI shows the first field error either way).
 */
function checkLines(fields: Fields, value: unknown): LineupLine[] | undefined {
  if (!Array.isArray(value) || value.length > LINES_MAX) {
    fields.lines = 'INVALID_VALUE';
    return undefined;
  }
  const lines: LineupLine[] = [];
  value.forEach((raw: unknown, i) => {
    const line = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<LineupLine>;
    const key = (f: string) => `lines[${i}].${f}`;
    if (!(COST_TYPES as readonly string[]).includes(line.type as string)) {
      fields[key('type')] = line.type == null ? 'REQUIRED' : 'INVALID_VALUE';
      return;
    }
    const type = line.type as CostType;
    const description =
      typeof line.description === 'string' && line.description.trim() ? line.description.trim() : null;
    if (line.description != null && typeof line.description !== 'string') fields[key('description')] = 'INVALID_VALUE';
    else if (description && description.length > DESCRIPTION_MAX) fields[key('description')] = 'TOO_LONG';
    else if ((type === 'OTHER' || type === 'OTHER_ROLE') && !description) {
      fields[key('description')] = 'DESCRIPTION_REQUIRED';
    }
    const cents = line.defaultCents;
    if (typeof cents !== 'number' || !Number.isInteger(cents)) fields[key('defaultCents')] = 'INVALID_VALUE';
    else if (cents < 0) fields[key('defaultCents')] = 'NEGATIVE_AMOUNT';
    lines.push({ type, description, defaultCents: cents as number });
  });
  return lines;
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Lineup not found');

export const lineupHandlers = [
  http.get('/api/lineup-templates', () => {
    if (!currentPartner()) return unauthenticated();
    return HttpResponse.json(sortedLineups().map(toLineupTemplate));
  }),

  http.post('/api/lineup-templates', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<LineupTemplateCreate>(request);
    const fields: Fields = {};
    const name = checkName(fields, body.name);
    const lines = body.lines === undefined ? [] : checkLines(fields, body.lines);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const lineup: MockLineup = { id: mockId(), name: name!, active: true, lines: lines ?? [] };
    db.reference.lineupTemplates.push(lineup);
    return HttpResponse.json(toLineupTemplate(lineup), { status: 201 });
  }),

  http.patch('/api/lineup-templates/:id', async ({ request, params }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<LineupTemplateUpdate>(request);
    const fields: Fields = {};
    const name = body.name === undefined ? undefined : checkName(fields, body.name, String(params.id));
    if (body.active !== undefined && typeof body.active !== 'boolean') fields.active = 'INVALID_VALUE';
    const lines = body.lines === undefined ? undefined : checkLines(fields, body.lines);
    if (Object.keys(fields).length > 0) return validationError(fields);
    const lineup = db.reference.lineupTemplates.find((l) => l.id === params.id);
    if (!lineup) return notFound();
    if (name !== undefined) lineup.name = name;
    if (body.active !== undefined) lineup.active = body.active;
    if (lines !== undefined) lineup.lines = lines;
    return HttpResponse.json(toLineupTemplate(lineup));
  }),

  http.delete('/api/lineup-templates/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const index = db.reference.lineupTemplates.findIndex((l) => l.id === params.id);
    if (index < 0) return notFound();
    if (eventCount(String(params.id)) > 0) return errorResponse(409, 'LINEUP_IN_USE', 'Lineup in use');
    db.reference.lineupTemplates.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
