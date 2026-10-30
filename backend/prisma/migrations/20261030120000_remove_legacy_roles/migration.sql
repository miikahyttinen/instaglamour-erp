-- TASK-041 (owner decision 2026-10-30): the musician roles HORN_1, HORN_2 and TECHNICIAN are removed
-- from "CostType". Existing data is converted first, then the enum type is recreated without them.
--
-- Mapping (api-contract "Role cleanup"):
--   HORN_1     -> TRUMPET
--   TECHNICIAN -> MIX
--   HORN_2     -> SAX      if the line's person has SAX but not TROMBONE in roles
--                 TROMBONE otherwise (TROMBONE but not SAX, both, neither, or no person)
-- Converted: cost lines, purchase order lines (a snapshot of a cost line; the person is the PO's
-- person), lineup template roles (no person: HORN_2 -> TROMBONE) and person roles (HORN_2 decided
-- by the person's own roles; de-duplicated and kept in MUSICIAN_ROLES order = enum order).
-- Stored history details (JSON) keep their old codes. updated_at is not touched: this is a format
-- change, not an edit. HORN_2 decisions use the person roles as they were before this migration
-- (lines are converted before person roles).
-- Prisma sends this file as one script, which Postgres runs as one implicit transaction: if any
-- statement fails, nothing changes. A value left unconverted makes the casts below fail instead of
-- losing data.

-- Cost lines
UPDATE "cost_line" AS cl
SET "type" = 'SAX'
FROM "person" AS p
WHERE cl."type" = 'HORN_2'
  AND p."id" = cl."person_id"
  AND 'SAX' = ANY (p."roles")
  AND NOT ('TROMBONE' = ANY (p."roles"));

UPDATE "cost_line"
SET "type" = CASE "type"
        WHEN 'HORN_1' THEN 'TRUMPET'::"CostType"
        WHEN 'HORN_2' THEN 'TROMBONE'::"CostType"
        WHEN 'TECHNICIAN' THEN 'MIX'::"CostType"
    END
WHERE "type" IN ('HORN_1', 'HORN_2', 'TECHNICIAN');

-- Purchase order lines
UPDATE "purchase_order_line" AS pol
SET "type" = 'SAX'
FROM "purchase_order" AS po, "person" AS p
WHERE pol."type" = 'HORN_2'
  AND po."id" = pol."purchase_order_id"
  AND p."id" = po."person_id"
  AND 'SAX' = ANY (p."roles")
  AND NOT ('TROMBONE' = ANY (p."roles"));

UPDATE "purchase_order_line"
SET "type" = CASE "type"
        WHEN 'HORN_1' THEN 'TRUMPET'::"CostType"
        WHEN 'HORN_2' THEN 'TROMBONE'::"CostType"
        WHEN 'TECHNICIAN' THEN 'MIX'::"CostType"
    END
WHERE "type" IN ('HORN_1', 'HORN_2', 'TECHNICIAN');

-- Lineup template roles
UPDATE "template_role"
SET "role" = CASE "role"
        WHEN 'HORN_1' THEN 'TRUMPET'::"CostType"
        WHEN 'HORN_2' THEN 'TROMBONE'::"CostType"
        WHEN 'TECHNICIAN' THEN 'MIX'::"CostType"
    END
WHERE "role" IN ('HORN_1', 'HORN_2', 'TECHNICIAN');

-- Person roles: convert, de-duplicate, enum order
UPDATE "person" AS p
SET "roles" = (
    SELECT COALESCE(array_agg(DISTINCT c."role" ORDER BY c."role"), ARRAY[]::"CostType"[])
    FROM (
        SELECT CASE r
                WHEN 'HORN_1' THEN 'TRUMPET'::"CostType"
                WHEN 'TECHNICIAN' THEN 'MIX'::"CostType"
                WHEN 'HORN_2' THEN
                    CASE WHEN 'SAX' = ANY (p."roles") AND NOT ('TROMBONE' = ANY (p."roles"))
                        THEN 'SAX'::"CostType" ELSE 'TROMBONE'::"CostType" END
                ELSE r
            END AS "role"
        FROM unnest(p."roles") AS r
    ) AS c
)
WHERE p."roles" && ARRAY['HORN_1', 'HORN_2', 'TECHNICIAN']::"CostType"[];

-- Recreate the enum without the removed values
CREATE TYPE "CostType_new" AS ENUM ('VOC', 'BACKING_VOC', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'PIANO', 'MIX', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ', 'OTHER_ROLE', 'OFFICE', 'SALES', 'PRODUCTION', 'FUEL', 'VEHICLE', 'TRAVEL', 'PARKING', 'ACCOMMODATION', 'FOOD', 'EQUIPMENT_RENTAL', 'ARRANGEMENT', 'LEAD_FEE', 'OTHER');

ALTER TABLE "cost_line" ALTER COLUMN "type" TYPE "CostType_new" USING ("type"::text::"CostType_new");
ALTER TABLE "purchase_order_line" ALTER COLUMN "type" TYPE "CostType_new" USING ("type"::text::"CostType_new");
ALTER TABLE "template_role" ALTER COLUMN "role" TYPE "CostType_new" USING ("role"::text::"CostType_new");
ALTER TABLE "person" ALTER COLUMN "roles" DROP DEFAULT;
ALTER TABLE "person" ALTER COLUMN "roles" TYPE "CostType_new"[] USING ("roles"::text[]::"CostType_new"[]);

ALTER TYPE "CostType" RENAME TO "CostType_old";
ALTER TYPE "CostType_new" RENAME TO "CostType";
DROP TYPE "CostType_old";

ALTER TABLE "person" ALTER COLUMN "roles" SET DEFAULT ARRAY[]::"CostType"[];
