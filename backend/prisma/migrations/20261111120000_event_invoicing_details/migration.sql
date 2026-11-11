-- TASK-059 (api-contract "Invoicing details on the gig", 2026-11-11): free-text invoicing details on a gig.
-- Nullable, no default; no existing data changed.
ALTER TABLE "event" ADD COLUMN "invoicing_details" TEXT;
