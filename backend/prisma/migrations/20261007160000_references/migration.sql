-- TASK-018: references / testimonials (BR-108). Additive only.
--
-- The settings `offers.references_fi` / `offers.references_en` (free text) are replaced by this
-- table. Their rows are deliberately LEFT IN PLACE (not dropped, not converted): the API no longer
-- reads them, so they are harmless, and free text can't be split into quote/author reliably.
-- Partners re-enter their references in the app; the old text stays in the database until someone
-- removes it by hand.

-- CreateTable
CREATE TABLE "reference" (
    "id" UUID NOT NULL,
    "quote_fi" TEXT NOT NULL,
    "quote_en" TEXT,
    "author" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "image_storage_key" TEXT,
    "image_content_type" TEXT,
    "image_size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_pkey" PRIMARY KEY ("id"),
    -- A photo is either fully described or absent.
    CONSTRAINT "reference_image_all_or_none" CHECK (
        ("image_storage_key" IS NULL AND "image_content_type" IS NULL AND "image_size_bytes" IS NULL)
        OR ("image_storage_key" IS NOT NULL AND "image_content_type" IS NOT NULL AND "image_size_bytes" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "reference_image_storage_key_key" ON "reference"("image_storage_key");

-- CreateIndex
CREATE INDEX "reference_sort_order_idx" ON "reference"("sort_order");
