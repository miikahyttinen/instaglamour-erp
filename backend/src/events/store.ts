/** Event data access shared by the event, cost line and invoice row routes (and the year page). */
import type { Db } from '../db.js';
import { dateFromIso, isoFromDate } from '../domain/dates.js';
import { isMusicianRole, MUSICIAN_ROLES } from '../domain/enums.js';
import { yearEventSummary, type YearEventSummary } from '../domain/eventEconomics.js';
import type { EventHistoryType, Prisma } from '../generated/prisma/client.js';
import { AppError, notFound } from '../http/errors.js';
import { costLinePurchaseOrderInclude, type EventWithDetail, type EventWithLines } from './serialize.js';

export type Tx = Prisma.TransactionClient | Db;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** What EventSummary needs: cost lines (economics), the client name and invoice rows (balance, state). */
export const eventSummaryInclude = {
  costLines: true,
  client: { select: { name: true } },
  invoiceRows: true,
} as const satisfies Prisma.EventInclude;

export const eventDetailInclude = {
  ...eventSummaryInclude,
  costLines: { include: costLinePurchaseOrderInclude },
} as const satisfies Prisma.EventInclude;

export async function loadEventDetail(db: Tx, id: string): Promise<EventWithDetail | null> {
  if (!isUuid(id)) return null;
  return db.event.findUnique({ where: { id }, include: eventDetailInclude });
}

export async function requireEventDetail(db: Tx, id: string): Promise<EventWithDetail> {
  const event = await loadEventDetail(db, id);
  if (!event) throw notFound('Event not found');
  return event;
}

/** Changing a deleted event is not allowed (except restore). */
export function assertNotDeleted(event: { deletedAt: Date | null }): void {
  if (event.deletedAt) throw new AppError('EVENT_DELETED', 'The event is deleted');
}

export interface NewHistoryEntry {
  eventId: string;
  type: EventHistoryType;
  partnerId: string;
  reason?: string | null;
  details?: Prisma.InputJsonObject;
}

/** Append one history entry (BR-015). History is never edited or deleted. */
export async function logHistory(tx: Tx, entry: NewHistoryEntry): Promise<void> {
  await tx.eventHistory.create({
    data: {
      eventId: entry.eventId,
      type: entry.type,
      partnerId: entry.partnerId,
      reason: entry.reason ?? null,
      details: entry.details ?? {},
    },
  });
}

/** Run a mutation and its history entry in one transaction. */
export function inTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

export interface Warning {
  code: 'PERSON_DOUBLE_BOOKED';
  personId: string;
  otherEventId: string;
  otherEventStartDate: string;
  otherEventLineupName: string;
}

/**
 * BR-022: double booking applies to performers only. For each person on one of the given
 * musician-role lines, other non-cancelled, non-deleted events whose date range overlaps
 * `[startDate, endDate ?? startDate]` and where that person has a musician-role line.
 * Internal roles and expenses never trigger or count.
 */
export async function doubleBookingWarnings(
  db: Tx,
  input: {
    eventId: string;
    startDate: Date;
    endDate: Date | null;
    lines: readonly { type: string; personId: string | null }[];
  },
): Promise<Warning[]> {
  const personIds = [
    ...new Set(
      input.lines.filter((l) => isMusicianRole(l.type)).map((l) => l.personId).filter((p): p is string => p !== null),
    ),
  ];
  if (personIds.length === 0) return [];
  const start = input.startDate;
  const end = input.endDate ?? input.startDate;
  const lines = await db.costLine.findMany({
    where: {
      personId: { in: personIds },
      type: { in: [...MUSICIAN_ROLES] },
      eventId: { not: input.eventId },
      event: {
        status: 'SOLD',
        deletedAt: null,
        startDate: { lte: end },
        OR: [{ endDate: null, startDate: { gte: start } }, { endDate: { gte: start } }],
      },
    },
    select: { personId: true, event: { select: { id: true, startDate: true, lineupName: true } } },
  });
  const seen = new Set<string>();
  const warnings: Warning[] = [];
  for (const line of lines) {
    const key = `${line.personId}:${line.event.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      code: 'PERSON_DOUBLE_BOOKED',
      personId: line.personId!,
      otherEventId: line.event.id,
      otherEventStartDate: isoFromDate(line.event.startDate),
      otherEventLineupName: line.event.lineupName,
    });
  }
  const order = new Map(personIds.map((p, i) => [p, i]));
  return warnings.sort(
    (a, b) =>
      order.get(a.personId)! - order.get(b.personId)! ||
      a.otherEventStartDate.localeCompare(b.otherEventStartDate) ||
      a.otherEventId.localeCompare(b.otherEventId),
  );
}

/** Start-date bounds of a year (BR-080). */
export function yearDateRange(year: number): { gte: Date; lte: Date } {
  const pad = String(year).padStart(4, '0');
  return { gte: dateFromIso(`${pad}-01-01`), lte: dateFromIso(`${pad}-12-31`) };
}

/** All events of a year with their cost lines (deleted included unless excluded). */
export function loadYearEvents(db: Tx, year: number, options: { includeDeleted: boolean }): Promise<EventWithLines[]> {
  return db.event.findMany({
    where: { startDate: yearDateRange(year), ...(options.includeDeleted ? {} : { deletedAt: null }) },
    include: eventSummaryInclude,
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** `yearSummary` of `GET /api/events` = `events` of `GET /api/years/{year}` (BR-082). */
export async function loadYearEventSummary(db: Tx, year: number): Promise<YearEventSummary> {
  return yearEventSummary(await loadYearEvents(db, year, { includeDeleted: false }));
}
