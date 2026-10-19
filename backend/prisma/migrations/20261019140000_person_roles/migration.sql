-- TASK-027: Person.roles (the roles a person can play). Additive only; no data is removed.
-- Values are musician-role codes (VOC … OTHER_ROLE), validated in the app.

-- AlterTable
ALTER TABLE "person" ADD COLUMN "roles" "CostType"[] DEFAULT ARRAY[]::"CostType"[];

-- Backfill: distinct musician-role types of the person's cost lines on non-deleted gigs (any status,
-- any year). The enum order of these values equals MUSICIAN_ROLES, so ORDER BY gives the app order.
UPDATE "person" AS p
SET "roles" = r."roles"
FROM (
    SELECT cl."person_id", array_agg(DISTINCT cl."type" ORDER BY cl."type") AS "roles"
    FROM "cost_line" AS cl
    JOIN "gig" AS g ON g."id" = cl."gig_id"
    WHERE cl."person_id" IS NOT NULL
      AND g."deleted_at" IS NULL
      AND cl."type" IN ('VOC', 'BACKING_VOC', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'PIANO', 'MIX', 'HORN_1', 'HORN_2', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ', 'TECHNICIAN', 'OTHER_ROLE')
    GROUP BY cl."person_id"
) AS r
WHERE p."id" = r."person_id";
