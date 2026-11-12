-- TASK-060: reference photo bytes are stored in the database (survive redeploys, included in DB
-- backups). Additive only: no data is dropped. Existing photos keep their image_storage_key until
-- the backend's startup move (src/references/moveImagesToDb.ts) copies the file into image_data and
-- clears the key; files on disk are never deleted.

-- AlterTable
ALTER TABLE "reference" ADD COLUMN "image_data" BYTEA;

-- A photo is fully described (type, size, upload time) and lives in exactly one place: the file
-- (image_storage_key, before the move) or the database (image_data). Without a photo all are null.
ALTER TABLE "reference" DROP CONSTRAINT "reference_image_all_or_none";
ALTER TABLE "reference" ADD CONSTRAINT "reference_image_all_or_none" CHECK (
    ("image_storage_key" IS NULL AND "image_data" IS NULL AND "image_content_type" IS NULL
        AND "image_size_bytes" IS NULL AND "image_uploaded_at" IS NULL)
    OR (num_nonnulls("image_storage_key", "image_data") = 1 AND "image_content_type" IS NOT NULL
        AND "image_size_bytes" IS NOT NULL AND "image_uploaded_at" IS NOT NULL)
);
