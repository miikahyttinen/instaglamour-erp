-- TASK-044 (owner decision 2026-10-31): "Ready to be invoiced" is set by hand on the gig page.
-- Non-destructive: two nullable columns (existing events = not set) and two new history types.

-- AlterEnum (the new values are not used in this migration, so ADD VALUE is safe inside the transaction)
ALTER TYPE "EventHistoryType" ADD VALUE 'READY_FOR_INVOICE';
ALTER TYPE "EventHistoryType" ADD VALUE 'READY_FOR_INVOICE_CLEARED';

-- AlterTable
ALTER TABLE "event" ADD COLUMN "ready_for_invoice_at" TIMESTAMP(3),
ADD COLUMN "ready_for_invoice_by" UUID;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_ready_for_invoice_by_fkey" FOREIGN KEY ("ready_for_invoice_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
