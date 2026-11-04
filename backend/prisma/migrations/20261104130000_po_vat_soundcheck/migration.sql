-- TASK-050 (owner request 2026-11-04, api-contract "Freelancer PO: VAT and sound check"):
-- a freelancer PO records whether the freelancer is VAT-liable, and each PO line records the
-- amount breakdown: base (the budgeted fee), sound check flag, deduction (sound check skipped) and VAT.
-- Non-destructive: existing POs become vat_liable = false; existing lines are backfilled with
-- base = amount, soundcheck = true, deduction = 0, vat = 0 (so amount = base - deduction + vat holds).
-- The VAT rate setting (fees.performer_vat_rate_bp) is optional: the code defaults to 1350 when the
-- row is missing, so no setting row is inserted here.

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN "vat_liable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "purchase_order_line" ADD COLUMN "base_cents" INTEGER;
ALTER TABLE "purchase_order_line" ADD COLUMN "soundcheck" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "purchase_order_line" ADD COLUMN "deduction_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_order_line" ADD COLUMN "vat_cents" INTEGER NOT NULL DEFAULT 0;

-- Backfill
UPDATE "purchase_order_line" SET "base_cents" = "amount_cents";

ALTER TABLE "purchase_order_line" ALTER COLUMN "base_cents" SET NOT NULL;
