-- TASK-018 (contract update): Reference.imageVersion = upload time of the current photo, so photo
-- URLs can carry `?v=` and replaced photos are never served from a cache. Additive only.

-- AlterTable
ALTER TABLE "reference" ADD COLUMN "image_uploaded_at" TIMESTAMP(3);

-- Existing photos get their row's last change time as version.
UPDATE "reference" SET "image_uploaded_at" = "updated_at" WHERE "image_storage_key" IS NOT NULL;

-- The photo columns (now four) are still either all set or all null.
ALTER TABLE "reference" DROP CONSTRAINT "reference_image_all_or_none";
ALTER TABLE "reference" ADD CONSTRAINT "reference_image_all_or_none" CHECK (
    ("image_storage_key" IS NULL AND "image_content_type" IS NULL AND "image_size_bytes" IS NULL AND "image_uploaded_at" IS NULL)
    OR ("image_storage_key" IS NOT NULL AND "image_content_type" IS NOT NULL AND "image_size_bytes" IS NOT NULL AND "image_uploaded_at" IS NOT NULL)
);
