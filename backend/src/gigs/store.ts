/** Gig data access shared by the gig, cost line and attachment routes (and the year page). */
import type { Db } from '../db.js';
import { dateFromIso, isoFromDate } from '../domain/dates.js';
import { isMusicianRole, MUSICIAN_ROLES } from '../domain/enums.js';
import { yearGigSummary, type YearGigSummary } from '../domain/gigEconomics.js';
import type { GigEventType, Prisma } from '../generated/prisma/client.js';
import { AppError, notFound } from '../http/errors.js';
import { costLinePurchaseOrderInclude, type GigWithDetail, type GigWithLines } from './serialize.js';

export type Tx = Prisma.TransactionClient | Db;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** What GigSummary needs: cost lines (economics) and the client name. */
export const gigSummaryInclude = {
  costLines: true,
  client: { select: { name: true } },
} as const satisfies Prisma.GigInclude;

export const gigDetailInclude = {
  ...gigSummaryInclude,
  costLines: { include: costLinePurchaseOrderInclude },
  attachments: { where: { deletedAt: null } },
} as const satisfies Prisma.GigInclude;

export async function loadGigDetail(db: Tx, id: string): Promise<GigWithDetail | null> {
  if (!isUuid(id)) return null;
  return db.gig.findUnique({ where: { id }, include: gigDetailInclude });
}

export async function requireGigDetail(db: Tx, id: string): Promise<GigWithDetail> {
  const gig = await loadGigDetail(db, id);
  if (!gig) throw notFound('Gig not found');
  return gig;
}

/** Changing a deleted gig is not allowed (except restore). */
export function assertNotDeleted(gig: { deletedAt: Date | null }): void {
  if (gig.deletedAt) throw new AppError('GIG_DELETED', 'The gig is deleted');
}

export interface NewEvent {
  gigId: string;
  type: GigEventType;
  partnerId: string;
  reason?: string | null;
  details?: Prisma.InputJsonObject;
}

/** Append one history event (BR-015). History is never edited or deleted. */
export async function logEvent(tx: Tx, event: NewEvent): Promise<void> {
  await tx.gigEvent.create({
    data: {
      gigId: event.gigId,
      type: event.type,
      partnerId: event.partnerId,
      reason: event.reason ?? null,
      details: event.details ?? {},
    },
  });
}

/** Run a mutation and its event in one transaction. */
export function inTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

export interface Warning {
  code: 'PERSON_DOUBLE_BOOKED';
  personId: string;
  otherGigId: string;
  otherGigStartDate: string;
  otherGigLineupName: string;
}

/**
 * BR-022: double booking applies to performers only. For each person on one of the given
 * musician-role lines, other non-cancelled, non-deleted gigs whose date range overlaps
 * `[startDate, endDate ?? startDate]` and where that person has a musician-role line.
 * Internal roles and expenses never trigger or count.
 */
export async function doubleBookingWarnings(
  db: Tx,
  input: {
    gigId: string;
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
      gigId: { not: input.gigId },
      gig: {
        status: 'SOLD',
        deletedAt: null,
        startDate: { lte: end },
        OR: [{ endDate: null, startDate: { gte: start } }, { endDate: { gte: start } }],
      },
    },
    select: { personId: true, gig: { select: { id: true, startDate: true, lineupName: true } } },
  });
  const seen = new Set<string>();
  const warnings: Warning[] = [];
  for (const line of lines) {
    const key = `${line.personId}:${line.gig.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      code: 'PERSON_DOUBLE_BOOKED',
      personId: line.personId!,
      otherGigId: line.gig.id,
      otherGigStartDate: isoFromDate(line.gig.startDate),
      otherGigLineupName: line.gig.lineupName,
    });
  }
  const order = new Map(personIds.map((p, i) => [p, i]));
  return warnings.sort(
    (a, b) =>
      order.get(a.personId)! - order.get(b.personId)! ||
      a.otherGigStartDate.localeCompare(b.otherGigStartDate) ||
      a.otherGigId.localeCompare(b.otherGigId),
  );
}

/** Start-date bounds of a year (BR-080). */
export function yearDateRange(year: number): { gte: Date; lte: Date } {
  const pad = String(year).padStart(4, '0');
  return { gte: dateFromIso(`${pad}-01-01`), lte: dateFromIso(`${pad}-12-31`) };
}

/** All gigs of a year with their cost lines (deleted included unless excluded). */
export function loadYearGigs(db: Tx, year: number, options: { includeDeleted: boolean }): Promise<GigWithLines[]> {
  return db.gig.findMany({
    where: { startDate: yearDateRange(year), ...(options.includeDeleted ? {} : { deletedAt: null }) },
    include: gigSummaryInclude,
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** `yearSummary` of `GET /api/gigs` = `gigs` of `GET /api/years/{year}` (BR-082). */
export async function loadYearGigSummary(db: Tx, year: number): Promise<YearGigSummary> {
  return yearGigSummary(await loadYearGigs(db, year, { includeDeleted: false }));
}
