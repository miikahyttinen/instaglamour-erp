// Mock handlers for docs/api-contract.md → Hours (UC-018, UC-019).
// Synthetic data only (BR-090).
import { http, HttpResponse } from 'msw';
import type { FieldCode } from '../api/enums';
import type { HourEntry, HourEntryCreate, HoursTotals } from '../api/types';
import { db } from './data';
import { currentPartner, errorResponse, unauthenticated, validationError } from './util';

interface HoursMockState {
  entries: HourEntry[];
  nextId: number;
}

const state: HoursMockState = { entries: [], nextId: 1 };

function makeId(n: number): string {
  return `00000000-0000-4000-8000-${String(900000000000 + n)}`;
}

function seedEntries(): HourEntry[] {
  const year = new Date().getFullYear();
  const [a, b, c] = db.partners;
  const rows: [string | undefined, string, string, number][] = [
    [a?.id, `${year}-01-08`, 'Planning', 2],
    [a?.id, `${year}-01-20`, 'Admin', 1.5],
    [a?.id, `${year}-02-03`, 'Rehearsal', 3],
    [a?.id, `${year}-03-12`, 'Client meeting', 0.75],
    [b?.id, `${year}-01-15`, 'Sound check', 4],
    [b?.id, `${year}-03-01`, 'Planning', 1.25],
    [c?.id, `${year}-02-10`, 'Admin', 2.5],
    [a?.id, `${year - 1}-11-05`, 'Planning', 1],
  ];
  return rows
    .filter((row): row is [string, string, string, number] => Boolean(row[0]))
    .map(([partnerId, date, comment, hours], i) => ({
      id: makeId(i + 1),
      partnerId,
      date,
      comment,
      hours,
    }));
}

/** Resets hour entries to the seed (or to `entries`, for tests). */
export function resetHoursMock(entries?: HourEntry[]): void {
  state.entries = entries ? entries.map((e) => ({ ...e })) : seedEntries();
  state.nextId = state.entries.length + 1;
}

export function hoursMockEntries(): HourEntry[] {
  return state.entries;
}

resetHoursMock();

function parseYear(value: string | null): number | null {
  return value && /^\d{4}$/.test(value) ? Number(value) : null;
}

function validDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validHours(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    value >= 0.25 &&
    value <= 24 &&
    Number.isInteger(value * 4)
  );
}

function validate(body: Partial<HourEntryCreate>, partial: boolean): Record<string, FieldCode> {
  const fields: Record<string, FieldCode> = {};
  if (!partial || body.date !== undefined) {
    if (body.date === undefined || body.date === null || body.date === '') fields.date = 'REQUIRED';
    else if (!validDate(body.date)) fields.date = 'INVALID_DATE';
  }
  if (!partial || body.comment !== undefined) {
    if (typeof body.comment !== 'string' || body.comment.trim() === '') fields.comment = 'REQUIRED';
    else if (body.comment.length > 500) fields.comment = 'TOO_LONG';
  }
  if (!partial || body.hours !== undefined) {
    if (body.hours === undefined || body.hours === null) fields.hours = 'REQUIRED';
    else if (!validHours(body.hours)) fields.hours = 'INVALID_HOURS';
  }
  return fields;
}

function byNewest(a: HourEntry, b: HourEntry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export const hoursHandlers = [
  http.get('/api/hours/totals', ({ request }) => {
    if (!currentPartner()) return unauthenticated();
    const year = parseYear(new URL(request.url).searchParams.get('year'));
    if (year === null) {
      return validationError({ year: 'INVALID_VALUE' });
    }
    const partners = db.partners.map((p) => {
      const months = Array.from({ length: 12 }, () => 0);
      for (const e of state.entries) {
        if (e.partnerId !== p.id || !e.date.startsWith(`${year}-`)) continue;
        const month = Number(e.date.slice(5, 7));
        months[month - 1] = (months[month - 1] ?? 0) + e.hours;
      }
      return { partnerId: p.id, months, total: months.reduce((s, h) => s + h, 0) };
    });
    const body: HoursTotals = {
      year,
      partners,
      grandTotal: partners.reduce((s, p) => s + p.total, 0),
    };
    return HttpResponse.json(body);
  }),

  http.get('/api/hours', ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const params = new URL(request.url).searchParams;
    const year = parseYear(params.get('year'));
    if (year === null) {
      return validationError({ year: 'INVALID_VALUE' });
    }
    const partnerId = params.get('partnerId') || me.id;
    const list = state.entries
      .filter((e) => e.partnerId === partnerId && e.date.startsWith(`${year}-`))
      .sort(byNewest);
    return HttpResponse.json(list);
  }),

  http.post('/api/hours', async ({ request }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = (await request.json()) as Partial<HourEntryCreate>;
    const fields = validate(body, false);
    if (Object.keys(fields).length > 0) {
      return validationError(fields);
    }
    const entry: HourEntry = {
      id: makeId(state.nextId++),
      partnerId: me.id,
      date: body.date!,
      comment: body.comment!.trim(),
      hours: body.hours!,
    };
    state.entries.push(entry);
    return HttpResponse.json(entry, { status: 201 });
  }),

  http.patch('/api/hours/:id', async ({ request, params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const body = (await request.json()) as Partial<HourEntryCreate>;
    const fields = validate(body, true);
    if (Object.keys(fields).length > 0) {
      return validationError(fields);
    }
    const entry = state.entries.find((e) => e.id === params.id);
    if (!entry) return errorResponse(404, 'NOT_FOUND', 'Unknown hour entry');
    if (entry.partnerId !== me.id) return errorResponse(403, 'FORBIDDEN', 'Not own entry');
    if (body.date !== undefined) entry.date = body.date;
    if (body.comment !== undefined) entry.comment = body.comment.trim();
    if (body.hours !== undefined) entry.hours = body.hours;
    return HttpResponse.json(entry);
  }),

  http.delete('/api/hours/:id', ({ params }) => {
    const me = currentPartner();
    if (!me) return unauthenticated();
    const entry = state.entries.find((e) => e.id === params.id);
    if (!entry) return errorResponse(404, 'NOT_FOUND', 'Unknown hour entry');
    if (entry.partnerId !== me.id) return errorResponse(403, 'FORBIDDEN', 'Not own entry');
    state.entries = state.entries.filter((e) => e.id !== entry.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
