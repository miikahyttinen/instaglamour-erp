-- TASK-049 (owner decision 2026-11-04, api-contract "Invoicing v3"): payments are no longer tracked.
-- Invoice row statuses become NOT_SENT / SENT; existing rows are converted, none are deleted:
--   READY -> NOT_SENT;  SENT -> SENT;  PAID -> SENT
-- status_at / status_by stay as they are (the conversion is not a status change made by a partner).
-- History entries are untouched (old details keep their READY/PAID texts).
--
-- The automatic final invoice ("Loppulasku") job marks an event once it has created the row:
-- event.final_invoice_created_at (nullable; null = not created yet). Its history entry has no partner,
-- so event_history.partner_id becomes nullable (only auto entries use null; details.auto = true).

-- Replace the enum (Postgres can't merge two values into one in place)
CREATE TYPE "InvoiceRowStatus_new" AS ENUM ('NOT_SENT', 'SENT');
ALTER TABLE "invoice_row" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "invoice_row" ALTER COLUMN "status" TYPE "InvoiceRowStatus_new"
  USING (CASE "status"::text WHEN 'READY' THEN 'NOT_SENT' ELSE 'SENT' END)::"InvoiceRowStatus_new";
DROP TYPE "InvoiceRowStatus";
ALTER TYPE "InvoiceRowStatus_new" RENAME TO "InvoiceRowStatus";
ALTER TABLE "invoice_row" ALTER COLUMN "status" SET DEFAULT 'NOT_SENT';

-- Rows made by the final invoice job are marked (InvoiceRow.auto); every existing row is a normal one
ALTER TABLE "invoice_row" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;

-- Automatic final invoice: created at most once per event
ALTER TABLE "event" ADD COLUMN "final_invoice_created_at" TIMESTAMP(3);

-- Auto history entries have no partner
ALTER TABLE "event_history" ALTER COLUMN "partner_id" DROP NOT NULL;
