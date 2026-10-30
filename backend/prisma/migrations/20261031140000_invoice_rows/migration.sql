-- TASK-046 (owner decision 2026-10-31): invoice rows per event replace the event's invoice status
-- and prepayment (TASK-045). Existing data is converted into rows FIRST (api-contract "Invoice rows"),
-- then the old columns and the InvoiceStatus enum are dropped (the task allows it once converted):
--   prepayment_cents > 0                     -> PAID row "Ennakkomaksu" for the prepayment
--   invoice_status READY / INVOICED / PAID   -> READY / SENT / PAID row "Lasku" for the balance
--                                               (total price - prepayment)
--   invoice_status PREPAYMENT_PAID / NONE    -> nothing more
-- Rows only when the amount > 0. Deleted and cancelled events are converted too.
-- Converted rows: created_by NULL (made by this migration, not by a partner); the balance row keeps
-- the old status's at/by; the prepayment row's status time is the migration time (unknown before).
-- History entries are untouched; the old history types stay.

-- AlterEnum (the new values are not used in this migration, so ADD VALUE is safe inside the transaction)
ALTER TYPE "EventHistoryType" ADD VALUE 'INVOICE_ROW_ADDED';
ALTER TYPE "EventHistoryType" ADD VALUE 'INVOICE_ROW_UPDATED';
ALTER TYPE "EventHistoryType" ADD VALUE 'INVOICE_ROW_REMOVED';

-- CreateEnum
CREATE TYPE "InvoiceRowStatus" AS ENUM ('READY', 'SENT', 'PAID');

-- CreateTable
CREATE TABLE "invoice_row" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "InvoiceRowStatus" NOT NULL DEFAULT 'READY',
    "status_at" TIMESTAMP(3) NOT NULL,
    "status_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "invoice_row_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_row_amount_positive" CHECK ("amount_cents" > 0)
);

-- CreateIndex
CREATE INDEX "invoice_row_event_id_idx" ON "invoice_row"("event_id");

-- AddForeignKey
ALTER TABLE "invoice_row" ADD CONSTRAINT "invoice_row_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_row" ADD CONSTRAINT "invoice_row_status_by_fkey" FOREIGN KEY ("status_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_row" ADD CONSTRAINT "invoice_row_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Convert: prepayment rows first (timestamps in UTC, like Prisma's)
INSERT INTO "invoice_row" ("id", "event_id", "description", "amount_cents", "status", "status_at", "status_by", "created_at", "created_by")
SELECT gen_random_uuid(), "id", 'Ennakkomaksu', "prepayment_cents", 'PAID',
       date_trunc('milliseconds', now() AT TIME ZONE 'UTC'), NULL,
       date_trunc('milliseconds', now() AT TIME ZONE 'UTC'), NULL
FROM "event"
WHERE "prepayment_cents" > 0;

-- Convert: balance rows, 1 ms later so they follow the prepayment row in creation order
INSERT INTO "invoice_row" ("id", "event_id", "description", "amount_cents", "status", "status_at", "status_by", "created_at", "created_by")
SELECT gen_random_uuid(), "id", 'Lasku', "price_cents" + "additional_sales_cents" - "prepayment_cents",
       (CASE "invoice_status" WHEN 'READY' THEN 'READY' WHEN 'INVOICED' THEN 'SENT' ELSE 'PAID' END)::"InvoiceRowStatus",
       COALESCE("invoice_status_at", date_trunc('milliseconds', now() AT TIME ZONE 'UTC')), "invoice_status_by",
       date_trunc('milliseconds', now() AT TIME ZONE 'UTC') + interval '1 millisecond', NULL
FROM "event"
WHERE "invoice_status" IN ('READY', 'INVOICED', 'PAID')
  AND "price_cents" + "additional_sales_cents" - "prepayment_cents" > 0;

-- Drop the converted columns
ALTER TABLE "event" DROP CONSTRAINT "event_invoice_status_by_fkey";
ALTER TABLE "event" DROP CONSTRAINT "event_prepayment_nonneg";
ALTER TABLE "event" DROP COLUMN "invoice_status",
DROP COLUMN "invoice_status_at",
DROP COLUMN "invoice_status_by",
DROP COLUMN "prepayment_cents";

-- DropEnum
DROP TYPE "InvoiceStatus";
