-- TASK-045 (owner decision 2026-10-31): invoice status, prepayment and balance replace the
-- "Ready to be invoiced" flag of TASK-044. The flag is copied into invoice_status = READY (same
-- at/by) BEFORE its two columns are dropped (the task allows dropping them once copied).
-- History entries READY_FOR_INVOICE[_CLEARED] stay; their enum values are kept.

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('NONE', 'READY', 'PREPAYMENT_PAID', 'INVOICED', 'PAID');

-- AlterTable
ALTER TABLE "event" ADD COLUMN "invoice_status" "InvoiceStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "invoice_status_at" TIMESTAMP(3),
ADD COLUMN "invoice_status_by" UUID,
ADD COLUMN "prepayment_cents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "event" ADD CONSTRAINT "event_prepayment_nonneg" CHECK ("prepayment_cents" >= 0);

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_invoice_status_by_fkey" FOREIGN KEY ("invoice_status_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy the ready flag (deleted and cancelled events too)
UPDATE "event"
SET "invoice_status" = 'READY',
    "invoice_status_at" = "ready_for_invoice_at",
    "invoice_status_by" = "ready_for_invoice_by"
WHERE "ready_for_invoice_at" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "event" DROP CONSTRAINT "event_ready_for_invoice_by_fkey";

-- AlterTable
ALTER TABLE "event" DROP COLUMN "ready_for_invoice_at",
DROP COLUMN "ready_for_invoice_by";
