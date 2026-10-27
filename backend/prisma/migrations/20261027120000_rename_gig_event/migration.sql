-- TASK-032 (SaaS phase 1): rename Gig -> Event. Renames only: no table is dropped or recreated,
-- every row, default, sequence value, FK and check constraint is kept; two stored JSON keys that
-- the API returns are renamed at the end (values unchanged). Object names follow
-- Prisma's naming convention for the new model names so `prisma migrate diff` shows no drift.

-- Enums
ALTER TYPE "GigStatus" RENAME TO "EventStatus";
ALTER TYPE "GigEventType" RENAME TO "EventHistoryType";

-- Tables
ALTER TABLE "gig" RENAME TO "event";
ALTER TABLE "gig_event" RENAME TO "event_history";
ALTER TABLE "gig_technical_setup_legacy" RENAME TO "event_technical_setup_legacy";

-- gig_id -> event_id
ALTER TABLE "cost_line" RENAME COLUMN "gig_id" TO "event_id";
ALTER TABLE "attachment" RENAME COLUMN "gig_id" TO "event_id";
ALTER TABLE "event_history" RENAME COLUMN "gig_id" TO "event_id";
ALTER TABLE "event_technical_setup_legacy" RENAME COLUMN "gig_id" TO "event_id";
ALTER TABLE "purchase_order_line" RENAME COLUMN "gig_id" TO "event_id";

-- History seq sequence (the column default refers to it by OID, so it keeps working)
ALTER SEQUENCE "gig_event_seq_seq" RENAME TO "event_history_seq_seq";

-- Constraints (renaming a PK constraint also renames its index)
ALTER TABLE "event" RENAME CONSTRAINT "gig_pkey" TO "event_pkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_lineup_template_id_fkey" TO "event_lineup_template_id_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_seller_id_fkey" TO "event_seller_id_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_producer_id_fkey" TO "event_producer_id_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_deleted_by_fkey" TO "event_deleted_by_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_client_id_fkey" TO "event_client_id_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_offer_id_fkey" TO "event_offer_id_fkey";
ALTER TABLE "event" RENAME CONSTRAINT "gig_price_nonneg" TO "event_price_nonneg";
ALTER TABLE "event" RENAME CONSTRAINT "gig_additional_sales_nonneg" TO "event_additional_sales_nonneg";
ALTER TABLE "event" RENAME CONSTRAINT "gig_end_after_start" TO "event_end_after_start";
ALTER TABLE "event_history" RENAME CONSTRAINT "gig_event_pkey" TO "event_history_pkey";
ALTER TABLE "event_history" RENAME CONSTRAINT "gig_event_gig_id_fkey" TO "event_history_event_id_fkey";
ALTER TABLE "event_history" RENAME CONSTRAINT "gig_event_partner_id_fkey" TO "event_history_partner_id_fkey";
ALTER TABLE "event_technical_setup_legacy" RENAME CONSTRAINT "gig_technical_setup_legacy_pkey" TO "event_technical_setup_legacy_pkey";
ALTER TABLE "event_technical_setup_legacy" RENAME CONSTRAINT "gig_technical_setup_legacy_gig_id_fkey" TO "event_technical_setup_legacy_event_id_fkey";
ALTER TABLE "cost_line" RENAME CONSTRAINT "cost_line_gig_id_fkey" TO "cost_line_event_id_fkey";
ALTER TABLE "attachment" RENAME CONSTRAINT "attachment_gig_id_fkey" TO "attachment_event_id_fkey";
ALTER TABLE "purchase_order_line" RENAME CONSTRAINT "purchase_order_line_gig_id_fkey" TO "purchase_order_line_event_id_fkey";

-- Plain indexes
ALTER INDEX "gig_start_date_idx" RENAME TO "event_start_date_idx";
ALTER INDEX "gig_client_id_idx" RENAME TO "event_client_id_idx";
ALTER INDEX "gig_offer_id_key" RENAME TO "event_offer_id_key";
ALTER INDEX "gig_event_gig_id_at_idx" RENAME TO "event_history_event_id_at_idx";
ALTER INDEX "cost_line_gig_id_idx" RENAME TO "cost_line_event_id_idx";
ALTER INDEX "attachment_gig_id_idx" RENAME TO "attachment_event_id_idx";
ALTER INDEX "purchase_order_line_gig_id_idx" RENAME TO "purchase_order_line_event_id_idx";

-- Stored JSON that the API returns as-is: rename the keys too (values unchanged)
-- Offer history: CONVERTED details {gigId} -> {eventId}
UPDATE "offer_event" SET "details" = ("details" - 'gigId') || jsonb_build_object('eventId', "details"->'gigId') WHERE "details" ? 'gigId';
-- Import log: ImportSummary.gigs -> ImportSummary.events
UPDATE "import_run" SET "summary" = ("summary" - 'gigs') || jsonb_build_object('events', "summary"->'gigs') WHERE "summary" ? 'gigs';
