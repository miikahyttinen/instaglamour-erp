-- TASK-015: clients (UC-027, BR-100, BR-101). Additive only: no existing data is changed.

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- Unique name among non-deleted clients, case-insensitive and trimmed (not expressible in the Prisma schema)
CREATE UNIQUE INDEX "client_active_name_key" ON "client" (lower(btrim("name"))) WHERE "deleted_at" IS NULL;

-- AlterTable: optional client of a gig
ALTER TABLE "gig" ADD COLUMN "client_id" UUID;

-- CreateIndex
CREATE INDEX "gig_client_id_idx" ON "gig"("client_id");

-- AddForeignKey (RESTRICT: clients are only soft-deleted, and only when nothing links to them)
ALTER TABLE "gig" ADD CONSTRAINT "gig_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
