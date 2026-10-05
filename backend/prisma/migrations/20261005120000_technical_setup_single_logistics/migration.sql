-- TASK-010: technical_setup becomes a single nullable value, new logistics and house_technician.
--
-- Mapping of the old multi-select "technical_setup" array (HOUSE_TECH, HOUSE_TECHNICIAN, SET_A, SET_B, SET_C, OWN_PA, VAN):
--   technical_setup  = first of SET_A, SET_B, SET_C, HOUSE_TECH present in the array, else NULL (OWN_PA alone -> NULL)
--   house_technician = array contains HOUSE_TECHNICIAN
--   logistics        = OWN_VAN if the array contains VAN, else NULL
-- The new columns cannot hold every old combination (e.g. OWN_PA, or SET_A together with SET_B), so the
-- original array of every gig that had a non-empty value is kept in "gig_technical_setup_legacy".
-- updated_at is not touched: this is a format change, not an edit.

-- CreateEnum
CREATE TYPE "Logistics" AS ENUM ('OWN_VAN', 'RENTAL_VAN', 'TAXI', 'OTHER');

-- CreateEnum (replaces "TechnicalSetup"; renamed below)
CREATE TYPE "TechnicalSetup_new" AS ENUM ('HOUSE_TECH', 'SET_A', 'SET_B', 'SET_C');

-- AlterTable
ALTER TABLE "gig"
    ADD COLUMN "technical_setup_new" "TechnicalSetup_new",
    ADD COLUMN "logistics" "Logistics",
    ADD COLUMN "house_technician" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: the original values, kept so nothing is lost
CREATE TABLE "gig_technical_setup_legacy" (
    "gig_id" UUID NOT NULL,
    "technical_setup" TEXT[],
    "migrated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gig_technical_setup_legacy_pkey" PRIMARY KEY ("gig_id")
);

-- AddForeignKey
ALTER TABLE "gig_technical_setup_legacy" ADD CONSTRAINT "gig_technical_setup_legacy_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep the original arrays
INSERT INTO "gig_technical_setup_legacy" ("gig_id", "technical_setup")
SELECT "id", "technical_setup"::TEXT[] FROM "gig" WHERE COALESCE(cardinality("technical_setup"), 0) > 0;

-- Data migration
UPDATE "gig" SET
    "technical_setup_new" = CASE
        WHEN 'SET_A' = ANY ("technical_setup") THEN 'SET_A'::"TechnicalSetup_new"
        WHEN 'SET_B' = ANY ("technical_setup") THEN 'SET_B'::"TechnicalSetup_new"
        WHEN 'SET_C' = ANY ("technical_setup") THEN 'SET_C'::"TechnicalSetup_new"
        WHEN 'HOUSE_TECH' = ANY ("technical_setup") THEN 'HOUSE_TECH'::"TechnicalSetup_new"
        ELSE NULL
    END,
    "house_technician" = COALESCE('HOUSE_TECHNICIAN' = ANY ("technical_setup"), false),
    "logistics" = CASE WHEN 'VAN' = ANY ("technical_setup") THEN 'OWN_VAN'::"Logistics" ELSE NULL END;

-- Swap the column and the enum type
ALTER TABLE "gig" DROP COLUMN "technical_setup";
ALTER TABLE "gig" RENAME COLUMN "technical_setup_new" TO "technical_setup";
DROP TYPE "TechnicalSetup";
ALTER TYPE "TechnicalSetup_new" RENAME TO "TechnicalSetup";
