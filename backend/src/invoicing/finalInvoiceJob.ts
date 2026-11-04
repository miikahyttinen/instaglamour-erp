/**
 * Automatic final invoice ("Loppulasku", api-contract "Invoicing v3", TASK-049).
 *
 * Finds SOLD, non-deleted events whose last day (end date, else start date) ended at least 48 hours ago
 * (Europe/Helsinki, `finalInvoiceDueAt`), with total > 0, uninvoicedCents > 0 and no final invoice yet
 * (`final_invoice_created_at` null). Each gets one NOT_SENT row "Loppulasku" for uninvoicedCents
 * (created/status by nobody), a history entry INVOICE_ROW_ADDED with `details.auto: true` and no
 * partner, and `final_invoice_created_at` — so it happens at most once per event; deleting the row
 * does not bring it back.
 *
 * Concurrency: every event is handled in its own transaction that first locks the event row
 * (SELECT … FOR UPDATE, re-checking status / deleted / final_invoice_created_at) and then re-reads the
 * rows and the price. Two overlapping runs (e.g. two app instances) are therefore serialized per event:
 * the second one waits for the lock, then sees final_invoice_created_at set and skips the event.
 * The invoice row endpoints lock the same event row, so a hand-made row and the automatic one are
 * ordered too.
 */
import type { Db } from '../db.js';
import { dateFromIso, isoFromDate, todayIso } from '../domain/dates.js';
import { FINAL_INVOICE_DESCRIPTION, finalInvoiceDueAt, invoicing } from '../domain/invoicing.js';
import type { Prisma } from '../generated/prisma/client.js';
import { logHistory } from '../events/store.js';

export const FINAL_INVOICE_JOB_INTERVAL_MS = 15 * 60 * 1000;

interface CandidateEvent {
  startDate: Date;
  endDate: Date | null;
  priceCents: number;
  additionalSalesCents: number;
  invoiceRows: { amountCents: number; status: 'NOT_SENT' | 'SENT'; createdAt: Date }[];
}

/** The amount of the final invoice if it is due at `now`, else null. */
function dueAmount(event: CandidateEvent, now: Date): number | null {
  const end = isoFromDate(event.endDate ?? event.startDate);
  if (now.getTime() < finalInvoiceDueAt(end).getTime()) return null;
  const total = event.priceCents + event.additionalSalesCents; // BR-006
  if (total <= 0) return null;
  // played/cancelled don't affect the sums.
  const { uninvoicedCents } = invoicing(total, event.invoiceRows, { played: true, cancelled: false });
  return uninvoicedCents > 0 ? uninvoicedCents : null;
}

const candidateSelect = {
  id: true,
  startDate: true,
  endDate: true,
  priceCents: true,
  additionalSalesCents: true,
  invoiceRows: { select: { amountCents: true, status: true, createdAt: true } },
} as const satisfies Prisma.EventSelect;

/** Create the final invoice of one event if it is still due. Returns true if a row was created. */
async function createFinalInvoice(db: Db, eventId: string, now: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "event"
      WHERE "id" = ${eventId}::uuid AND "status" = 'SOLD' AND "deleted_at" IS NULL
        AND "final_invoice_created_at" IS NULL
      FOR UPDATE`;
    if (locked.length === 0) return false;
    // Re-read under the lock: price and rows may have changed since the candidate query.
    const event = await tx.event.findUnique({ where: { id: eventId }, select: candidateSelect });
    if (!event) return false;
    const amountCents = dueAmount(event, now);
    if (amountCents === null) return false;

    // The new row goes last in creation order.
    const latest = event.invoiceRows.reduce((max, r) => Math.max(max, r.createdAt.getTime()), 0);
    const createdAt = new Date(Math.max(now.getTime(), latest + 1));
    const row = await tx.invoiceRow.create({
      data: {
        eventId,
        description: FINAL_INVOICE_DESCRIPTION,
        amountCents,
        status: 'NOT_SENT',
        statusAt: createdAt,
        statusById: null,
        createdAt,
        createdById: null,
      },
    });
    await logHistory(tx, {
      eventId,
      type: 'INVOICE_ROW_ADDED',
      partnerId: null,
      details: { invoiceRowId: row.id, description: row.description, amountCents: row.amountCents, status: row.status, auto: true },
    });
    // Raw update: marking the event is not an edit, so updated_at stays.
    await tx.$executeRaw`UPDATE "event" SET "final_invoice_created_at" = ${now} WHERE "id" = ${eventId}::uuid`;
    return true;
  });
}

/**
 * One run of the job at `now` (tests pass a fixed clock). Idempotent: running it again (or
 * concurrently) creates nothing more. Returns the ids of the events that got a final invoice.
 */
export async function runFinalInvoiceJob(db: Db, now: Date = new Date()): Promise<string[]> {
  // Cheap pre-filter in the database (started by today in Helsinki); the exact 48 h rule and the
  // amounts are checked in code, and again under the row lock.
  const candidates = await db.event.findMany({
    where: {
      status: 'SOLD',
      deletedAt: null,
      finalInvoiceCreatedAt: null,
      startDate: { lte: dateFromIso(todayIso(now)) },
    },
    select: candidateSelect,
    orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
  });
  const created: string[] = [];
  for (const event of candidates) {
    if (dueAmount(event, now) === null) continue;
    if (await createFinalInvoice(db, event.id, now)) created.push(event.id);
  }
  return created;
}

export interface JobLogger {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * Run the job now and then every `intervalMs` (default 15 min). Runs never overlap within one process;
 * errors are logged and the next run tries again. Returns a function that stops the schedule.
 */
export function startFinalInvoiceJob(
  db: Db,
  log: JobLogger,
  intervalMs: number = FINAL_INVOICE_JOB_INTERVAL_MS,
): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const created = await runFinalInvoiceJob(db);
      if (created.length > 0) log.info({ eventIds: created }, `Final invoice job: created ${created.length} final invoice row(s)`);
    } catch (err) {
      log.error({ err }, 'Final invoice job failed');
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
