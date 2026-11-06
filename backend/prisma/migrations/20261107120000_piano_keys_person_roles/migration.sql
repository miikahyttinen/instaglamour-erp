-- TASK-052 (owner decision 2026-11-07, api-contract "Piano merged into Keys; custom role is not a
-- person role"): the musician role PIANO is merged into KEYS and removed from "CostType";
-- OTHER_ROLE stays a cost line type but is never a person role.
-- Same approach as 20261030120000_remove_legacy_roles: existing data is converted first, then the
-- enum type is recreated without PIANO.
--   cost lines, purchase order lines (snapshots of cost lines), lineup lines: PIANO -> KEYS
--   person roles: PIANO -> KEYS, OTHER_ROLE removed, de-duplicated, MUSICIAN_ROLES order (= enum order)
-- Stored history details (JSON) keep their old codes. updated_at is not touched: this is a format
-- change, not an edit. Prisma runs this file as one implicit transaction; a value left unconverted
-- makes the casts below fail instead of losing data.

-- Cost lines
UPDATE "cost_line" SET "type" = 'KEYS' WHERE "type" = 'PIANO';

-- Purchase order lines
UPDATE "purchase_order_line" SET "type" = 'KEYS' WHERE "type" = 'PIANO';

-- Lineup lines
UPDATE "lineup_line" SET "type" = 'KEYS' WHERE "type" = 'PIANO';

-- Person roles: convert, drop OTHER_ROLE, de-duplicate, enum order
UPDATE "person" AS p
SET "roles" = (
    SELECT COALESCE(array_agg(DISTINCT c."role" ORDER BY c."role"), ARRAY[]::"CostType"[])
    FROM (
        SELECT CASE r WHEN 'PIANO' THEN 'KEYS'::"CostType" ELSE r END AS "role"
        FROM unnest(p."roles") AS r
        WHERE r <> 'OTHER_ROLE'
    ) AS c
)
WHERE p."roles" && ARRAY['PIANO', 'OTHER_ROLE']::"CostType"[];

-- Recreate the enum without PIANO
CREATE TYPE "CostType_new" AS ENUM ('VOC', 'BACKING_VOC', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'MIX', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ', 'OTHER_ROLE', 'OFFICE', 'SALES', 'PRODUCTION', 'FUEL', 'VEHICLE', 'TRAVEL', 'PARKING', 'ACCOMMODATION', 'FOOD', 'EQUIPMENT_RENTAL', 'ARRANGEMENT', 'LEAD_FEE', 'OTHER');

ALTER TABLE "cost_line" ALTER COLUMN "type" TYPE "CostType_new" USING ("type"::text::"CostType_new");
ALTER TABLE "purchase_order_line" ALTER COLUMN "type" TYPE "CostType_new" USING ("type"::text::"CostType_new");
ALTER TABLE "lineup_line" ALTER COLUMN "type" TYPE "CostType_new" USING ("type"::text::"CostType_new");
ALTER TABLE "person" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "person" ALTER COLUMN "roles" TYPE "CostType_new"[] USING ("roles"::text[]::"CostType_new"[]);

ALTER TYPE "CostType" RENAME TO "CostType_old";
ALTER TYPE "CostType_new" RENAME TO "CostType";
DROP TYPE "CostType_old";

ALTER TABLE "person" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"CostType"[];
