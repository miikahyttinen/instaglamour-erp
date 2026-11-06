-- Owner decision 2026-11-06 (api-contract "Lineups and settings page"; BR-020, BR-021 revised):
-- lineups define all default fees of a new event as an ordered list of cost lines of any type.
-- Non-destructive reshape: template_role becomes lineup_line (role -> type, default_fee_cents ->
-- default_cents, new optional description); existing rows and positions are kept.
-- Every existing lineup then gets OFFICE, SALES and PRODUCTION lines after its roles, with the
-- amounts of the old settings fees.office_default / fees.sales_default / fees.production_default
-- read from the database (a missing row counts as 0, as the code did), so new events get the same
-- amounts as before. Finally those three setting rows are deleted (the contract removes them).

-- AlterTable
ALTER TABLE "lineup_template" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Reshape template_role -> lineup_line
ALTER TABLE "template_role" RENAME TO "lineup_line";
ALTER TABLE "lineup_line" RENAME CONSTRAINT "template_role_pkey" TO "lineup_line_pkey";
ALTER TABLE "lineup_line" RENAME CONSTRAINT "template_role_template_id_fkey" TO "lineup_line_template_id_fkey";
ALTER TABLE "lineup_line" RENAME CONSTRAINT "template_role_default_fee_nonneg" TO "lineup_line_default_cents_nonneg";
ALTER INDEX "template_role_template_id_position_key" RENAME TO "lineup_line_template_id_position_key";
ALTER TABLE "lineup_line" RENAME COLUMN "role" TO "type";
ALTER TABLE "lineup_line" RENAME COLUMN "default_fee_cents" TO "default_cents";
ALTER TABLE "lineup_line" ADD COLUMN "description" TEXT;

-- Data: OFFICE, SALES, PRODUCTION after each lineup's existing lines, amounts from the old settings
INSERT INTO "lineup_line" ("id", "template_id", "position", "type", "default_cents", "updated_at")
SELECT
  gen_random_uuid(),
  t."id",
  COALESCE((SELECT max(l."position") FROM "lineup_line" l WHERE l."template_id" = t."id"), -1) + x."offset",
  x."type"::"CostType",
  GREATEST(COALESCE((SELECT s."value_cents" FROM "setting" s WHERE s."key" = x."key"), 0), 0),
  now()
FROM "lineup_template" t
CROSS JOIN (VALUES
  (1, 'OFFICE', 'fees.office_default'),
  (2, 'SALES', 'fees.sales_default'),
  (3, 'PRODUCTION', 'fees.production_default')
) AS x("offset", "type", "key");

-- The three default fee settings are removed
DELETE FROM "setting" WHERE "key" IN ('fees.office_default', 'fees.sales_default', 'fees.production_default');
