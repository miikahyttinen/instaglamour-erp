-- CreateEnum
CREATE TYPE "Language" AS ENUM ('fi', 'en');

-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('VOC', 'BACKING_VOC', 'BASS', 'GUITAR', 'DRUMS', 'KEYS', 'PIANO', 'MIX', 'HORN_1', 'HORN_2', 'SAX', 'TRUMPET', 'TROMBONE', 'VIOLIN', 'DJ', 'TECHNICIAN', 'OTHER_ROLE', 'OFFICE', 'SALES', 'PRODUCTION', 'FUEL', 'VEHICLE', 'TRAVEL', 'PARKING', 'ACCOMMODATION', 'FOOD', 'EQUIPMENT_RENTAL', 'ARRANGEMENT', 'LEAD_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "TechnicalSetup" AS ENUM ('HOUSE_TECH', 'HOUSE_TECHNICIAN', 'SET_A', 'SET_B', 'SET_C', 'OWN_PA', 'VAN');

-- CreateEnum
CREATE TYPE "GigEventType" AS ENUM ('CREATED', 'UPDATED', 'MOVED', 'CANCELLED', 'UNCANCELLED', 'DELETED', 'RESTORED', 'COST_ADDED', 'COST_UPDATED', 'COST_REMOVED', 'COST_PAID', 'COST_UNPAID', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED');

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "language" "Language" NOT NULL DEFAULT 'fi',
    "selected_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "partner_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lineup_template" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineup_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_role" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "CostType" NOT NULL,
    "default_fee_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gig" (
    "id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "GigStatus" NOT NULL DEFAULT 'SOLD',
    "lineup_template_id" UUID,
    "lineup_name" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "technical_setup" "TechnicalSetup"[] DEFAULT ARRAY[]::"TechnicalSetup"[],
    "seller_id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "additional_sales_cents" INTEGER NOT NULL DEFAULT 0,
    "additional_sales_description" TEXT,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_line" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "type" "CostType" NOT NULL,
    "person_id" UUID,
    "description" TEXT,
    "budgeted_cents" INTEGER NOT NULL,
    "joins_load_in" BOOLEAN,
    "load_in_deduction_applied_cents" INTEGER,
    "actual_cents" INTEGER,
    "paid_at" TIMESTAMP(3),
    "paid_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gig_event" (
    "id" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "type" "GigEventType" NOT NULL,
    "partner_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gig_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE,
    "owner_id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hour_entry" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "comment" TEXT NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hour_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_category" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_fi" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "budgeted" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_year" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "budget_expense_cents" INTEGER NOT NULL DEFAULT 0,
    "budget_income_cents" INTEGER NOT NULL DEFAULT 0,
    "actual_expense_cents" INTEGER NOT NULL DEFAULT 0,
    "actual_income_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_year_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_person_id_key" ON "partner"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_email_key" ON "partner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_partner_id_idx" ON "session"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "lineup_template_name_key" ON "lineup_template"("name");

-- CreateIndex
CREATE UNIQUE INDEX "template_role_template_id_position_key" ON "template_role"("template_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "setting_key_key" ON "setting"("key");

-- CreateIndex
CREATE INDEX "gig_start_date_idx" ON "gig"("start_date");

-- CreateIndex
CREATE INDEX "cost_line_gig_id_idx" ON "cost_line"("gig_id");

-- CreateIndex
CREATE INDEX "cost_line_person_id_idx" ON "cost_line"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_storage_key_key" ON "attachment"("storage_key");

-- CreateIndex
CREATE INDEX "attachment_gig_id_idx" ON "attachment"("gig_id");

-- CreateIndex
CREATE INDEX "gig_event_gig_id_at_idx" ON "gig_event"("gig_id", "at");

-- CreateIndex
CREATE INDEX "task_owner_id_idx" ON "task"("owner_id");

-- CreateIndex
CREATE INDEX "hour_entry_partner_id_date_idx" ON "hour_entry"("partner_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "budget_category_code_key" ON "budget_category"("code");

-- CreateIndex
CREATE INDEX "budget_year_year_idx" ON "budget_year"("year");

-- CreateIndex
CREATE UNIQUE INDEX "budget_year_category_id_year_key" ON "budget_year"("category_id", "year");

-- AddForeignKey
ALTER TABLE "partner" ADD CONSTRAINT "partner_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_role" ADD CONSTRAINT "template_role_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "lineup_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig" ADD CONSTRAINT "gig_lineup_template_id_fkey" FOREIGN KEY ("lineup_template_id") REFERENCES "lineup_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig" ADD CONSTRAINT "gig_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig" ADD CONSTRAINT "gig_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig" ADD CONSTRAINT "gig_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig_event" ADD CONSTRAINT "gig_event_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gig_event" ADD CONSTRAINT "gig_event_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hour_entry" ADD CONSTRAINT "hour_entry_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_year" ADD CONSTRAINT "budget_year_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "budget_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity checks not expressible in the Prisma schema
-- ---------------------------------------------------------------------------

-- Money is never negative
ALTER TABLE "template_role" ADD CONSTRAINT "template_role_default_fee_nonneg" CHECK ("default_fee_cents" >= 0);
ALTER TABLE "setting" ADD CONSTRAINT "setting_value_nonneg" CHECK ("value_cents" >= 0);
ALTER TABLE "gig" ADD CONSTRAINT "gig_price_nonneg" CHECK ("price_cents" >= 0);
ALTER TABLE "gig" ADD CONSTRAINT "gig_additional_sales_nonneg" CHECK ("additional_sales_cents" >= 0);
ALTER TABLE "gig" ADD CONSTRAINT "gig_end_after_start" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_budgeted_nonneg" CHECK ("budgeted_cents" >= 0);
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_actual_nonneg" CHECK ("actual_cents" IS NULL OR "actual_cents" >= 0);
ALTER TABLE "cost_line" ADD CONSTRAINT "cost_line_deduction_nonneg" CHECK ("load_in_deduction_applied_cents" IS NULL OR "load_in_deduction_applied_cents" >= 0);
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_size_nonneg" CHECK ("size_bytes" >= 0);
ALTER TABLE "budget_year" ADD CONSTRAINT "budget_year_amounts_nonneg" CHECK (
  "budget_expense_cents" >= 0 AND "budget_income_cents" >= 0 AND
  "actual_expense_cents" >= 0 AND "actual_income_cents" >= 0
);

-- Hours: 0.25…24 in 0.25 steps (BR-050)
ALTER TABLE "hour_entry" ADD CONSTRAINT "hour_entry_hours_range" CHECK (
  "hours" >= 0.25 AND "hours" <= 24 AND MOD("hours" * 100, 25) = 0
);

-- Selected year is a sane calendar year (null = current year)
ALTER TABLE "partner" ADD CONSTRAINT "partner_selected_year_range" CHECK (
  "selected_year" IS NULL OR ("selected_year" >= 2000 AND "selected_year" <= 2100)
);
