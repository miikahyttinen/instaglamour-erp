// Mock handlers for docs/api-contract.md → Clients (UC-027, BR-100, BR-101). Clients live in the
// gig mock store (db.gigs.clients) so gigs can show the client name and search it.
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type {
  Client,
  ClientCreate,
  ClientDetailResponse,
  ClientListItem,
  ClientUpdate,
} from '../api/types';
import { todayIso } from '../lib/format';
import { db } from './data';
import { mockId, nowTs, toSummary, type MockClient } from './gigStore';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

const NAME_MAX = 500;
const NOTES_MAX = 5000;

const active = () => db.gigs.clients.filter((c) => c.deletedAt === null);
const findActive = (id: unknown) => active().find((c) => c.id === id);
const publicClient = (c: MockClient): Client => ({ id: c.id, name: c.name, notes: c.notes });

const linkedGigs = (id: string) => db.gigs.gigs.filter((g) => g.clientId === id && g.deletedAt === null);
const linkedOffers = (id: string) => db.gigs.offers.filter((o) => o.clientId === id && o.deletedAt === null);

/** Trimmed name or the field code. Unique case-insensitively among active clients (BR-100). */
function checkName(value: unknown, exceptId?: string): { name?: string; error?: FieldCode } {
  if (typeof value !== 'string') return { error: value == null ? 'REQUIRED' : 'INVALID_VALUE' };
  const name = value.trim();
  if (!name) return { error: 'REQUIRED' };
  if (name.length > NAME_MAX) return { error: 'TOO_LONG' };
  const lower = name.toLowerCase();
  if (active().some((c) => c.id !== exceptId && c.name.toLowerCase() === lower)) {
    return { error: 'DUPLICATE' };
  }
  return { name };
}

function checkNotes(value: unknown): { notes?: string | null; error?: FieldCode } {
  if (value === undefined || value === null) return { notes: null };
  if (typeof value !== 'string') return { error: 'INVALID_VALUE' };
  if (value.length > NOTES_MAX) return { error: 'TOO_LONG' };
  return { notes: value.trim() || null };
}

async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Partial<T>) : {};
  } catch {
    return {};
  }
}

const notFound = () => errorResponse(404, 'NOT_FOUND', 'Client not found');

export const clientHandlers = [
  http.get('/api/clients', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();
    const body: ClientListItem[] = active()
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((c) => ({
        ...publicClient(c),
        gigCount: linkedGigs(c.id).length,
        offerCount: linkedOffers(c.id).length,
      }));
    return HttpResponse.json(body);
  }),

  http.post('/api/clients', async ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<ClientCreate>(request);
    const fields: Record<string, FieldCode> = {};
    const name = checkName(body.name);
    const notes = checkNotes(body.notes);
    if (name.error) fields.name = name.error;
    if (notes.error) fields.notes = notes.error;
    if (Object.keys(fields).length > 0) return validationError(fields);
    const client: MockClient = { id: mockId(), name: name.name!, notes: notes.notes ?? null, deletedAt: null };
    db.gigs.clients.push(client);
    return HttpResponse.json(publicClient(client), { status: 201 });
  }),

  http.get('/api/clients/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const client = findActive(params.id);
    if (!client) return notFound();
    const today = todayIso();
    const body: ClientDetailResponse = {
      client: publicClient(client),
      gigs: linkedGigs(client.id)
        .map((g) => toSummary(db.gigs, g, today))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
      offers: linkedOffers(client.id)
        .map((o) => ({ ...o, clientName: client.name }))
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate)),
    };
    return HttpResponse.json(body);
  }),

  http.patch('/api/clients/:id', async ({ params, request }) => {
    if (!currentPartner()) return unauthenticated();
    const body = await readJson<ClientUpdate>(request);
    const fields: Record<string, FieldCode> = {};
    const name = body.name === undefined ? {} : checkName(body.name, String(params.id));
    const notes = body.notes === undefined ? {} : checkNotes(body.notes);
    if (name.error) fields.name = name.error;
    if (notes.error) fields.notes = notes.error;
    if (Object.keys(fields).length > 0) return validationError(fields);
    const client = findActive(params.id);
    if (!client) return notFound();
    if (name.name !== undefined) client.name = name.name;
    if (notes.notes !== undefined) client.notes = notes.notes;
    return HttpResponse.json(publicClient(client));
  }),

  http.delete('/api/clients/:id', ({ params }) => {
    if (!currentPartner()) return unauthenticated();
    const client = findActive(params.id);
    if (!client) return notFound();
    // BR-101: any linking gig (also a deleted one, which could be restored) or offer blocks it.
    const inUse =
      db.gigs.gigs.some((g) => g.clientId === client.id) ||
      db.gigs.offers.some((o) => o.clientId === client.id);
    if (inUse) return errorResponse(409, 'CLIENT_IN_USE', 'Client in use');
    client.deletedAt = nowTs();
    return new HttpResponse(null, { status: 204 });
  }),
];
