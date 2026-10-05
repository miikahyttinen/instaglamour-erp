-- TASK-012: budget rows are managed by the partners (UC-020, BR-008, BR-062).
--
-- Mapping of existing budget_category rows:
--   name   = btrim(name_fi)               (one name, shown in both languages)
--   active = false for the FUEL row and every budgeted = false (actuals-only) row; otherwise unchanged
--   code   = kept, now nullable (seed files may still use it as a stable key; rows added in the app have none)
--   name_fi, name_en, budgeted are dropped from budget_category; the original values of every
--   existing row are kept in "budget_category_legacy" so nothing is lost.
-- Active rows must have unique names (case-insensitive, trimmed). If two active rows would end up
-- with the same name, every one but the first (by sort_order, code) gets " (CODE)" appended.
-- budget_year values are not touched; updated_at is not touched (a format change, not an edit).

-- CreateTable: the original values, kept so nothing is lost
CREATE TABLE "budget_category_legacy" (
    "category_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fi" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "budgeted" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL,
    "migrated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_category_legacy_pkey" PRIMARY KEY ("category_id")
);

-- AddForeignKey
ALTER TABLE "budget_category_legacy" ADD CONSTRAINT "budget_category_legacy_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the original values
INSERT INTO "budget_category_legacy" ("category_id", "code", "name_fi", "name_en", "budgeted", "active")
SELECT "id", "code", "name_fi", "name_en", "budgeted", "active" FROM "budget_category";

-- One name, from name_fi
ALTER TABLE "budget_category" ADD COLUMN "name" TEXT;
UPDATE "budget_category" SET "name" = btrim("name_fi");

-- The fuel row and actuals-only rows are removed (soft delete: values kept)
UPDATE "budget_category" SET "active" = false WHERE "budgeted" = false OR "code" = 'FUEL';

-- Make active names unique before the index is created
UPDATE "budget_category" AS c SET "name" = c."name" || ' (' || c."code" || ')'
FROM (
    SELECT "id", row_number() OVER (PARTITION BY lower("name") ORDER BY "sort_order", "code") AS "rn"
    FROM "budget_category" WHERE "active"
) AS d
WHERE c."id" = d."id" AND d."rn" > 1;

-- AlterTable
ALTER TABLE "budget_category" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "budget_category" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "budget_category" DROP COLUMN "name_fi";
ALTER TABLE "budget_category" DROP COLUMN "name_en";
ALTER TABLE "budget_category" DROP COLUMN "budgeted";

-- Unique name among active rows, case-insensitive (not expressible in the Prisma schema)
CREATE UNIQUE INDEX "budget_category_active_name_key" ON "budget_category" (lower(btrim("name"))) WHERE "active";
