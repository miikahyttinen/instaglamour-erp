-- TASK-026: data import log (UC-035, BR-121). Additive only: a new table, no existing data changed.

-- CreateTable
CREATE TABLE "import_run" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT,
    "summary" JSONB NOT NULL,

    CONSTRAINT "import_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_run_at_idx" ON "import_run"("at");

-- AddForeignKey
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
