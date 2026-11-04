-- Owner request 2026-11-04 (api-contract "Freelancer PO: VAT rate choice"): a freelancer PO stores the
-- chosen VAT rate in basis points (0 = not VAT-liable) instead of only a yes/no flag.
-- Non-destructive: vat_liable is kept (the code keeps it = vat_rate_bp > 0). Existing POs with
-- vat_liable = true were created with the single rate setting fees.performer_vat_rate_bp (default 1350
-- when the row is missing) → that rate, all others → 0. Line amounts are unchanged.
-- The new setting fees.performer_vat_rates_bp is optional (code default / fallback to the old
-- fees.performer_vat_rate_bp), so no setting row is inserted or removed here.

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN "vat_rate_bp" INTEGER NOT NULL DEFAULT 0;

-- Backfill
UPDATE "purchase_order"
SET "vat_rate_bp" = COALESCE(
  (SELECT "value_cents" FROM "setting" WHERE "key" = 'fees.performer_vat_rate_bp' AND "value_cents" > 0),
  1350
)
WHERE "vat_liable" = true;
