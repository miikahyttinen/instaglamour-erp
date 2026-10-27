/**
 * BR-118 lock: while a cost line is on an OPEN or PAID purchase order its person, amount, load-in
 * switch and paid state can't change and it can't be deleted; an event can't be cancelled or deleted
 * while it has lines on an OPEN purchase order. Violations → 409 COST_LINE_ON_PURCHASE_ORDER with
 * `details.purchaseOrderNumber`.
 *
 * Race safety: the checks run inside the mutating transaction after taking a row lock — the cost
 * line (FOR UPDATE) or the event (FOR UPDATE). Creating a PO locks the same cost line rows FOR UPDATE
 * and their events FOR SHARE before checking eligibility (purchaseOrders/store.ts), so a PO creation
 * and a concurrent change of the same line / event are strictly ordered and the later one sees the
 * earlier one's result.
 */
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../http/errors.js';

type Tx = Prisma.TransactionClient;

export function costLineOnPurchaseOrder(purchaseOrderNumber: string): AppError {
  return new AppError(
    'COST_LINE_ON_PURCHASE_ORDER',
    `The cost line is on purchase order ${purchaseOrderNumber}`,
    undefined,
    { purchaseOrderNumber },
  );
}

/** Lock the cost line row and refuse if it is on an OPEN/PAID purchase order. */
export async function assertCostLineNotOnPurchaseOrder(tx: Tx, costLineId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "cost_line" WHERE "id" = ${costLineId}::uuid FOR UPDATE`;
  const line = await tx.purchaseOrderLine.findFirst({
    where: { costLineId, active: true },
    select: { purchaseOrder: { select: { number: true } } },
  });
  if (line) throw costLineOnPurchaseOrder(line.purchaseOrder.number);
}

/** Lock the event row and refuse if any of its lines is on an OPEN purchase order. */
export async function assertEventHasNoOpenPurchaseOrder(tx: Tx, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
  const line = await tx.purchaseOrderLine.findFirst({
    where: { eventId, active: true, purchaseOrder: { status: 'OPEN' } },
    select: { purchaseOrder: { select: { number: true } } },
    orderBy: { purchaseOrder: { seq: 'asc' } },
  });
  if (line) throw costLineOnPurchaseOrder(line.purchaseOrder.number);
}
