-- TASK-023: purchase orders (UC-033, UC-034, BR-113..BR-119). Additive only: no existing data is
-- changed or removed. Every existing person gets a freelancer link token.

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('OPEN', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderEventType" AS ENUM ('CREATED', 'PAID', 'UNPAID', 'CANCELLED');

-- Freelancer link token (BR-113): base64url of a SHA-256 over three gen_random_uuid() values
-- (366 bits from the server's strong random source) = 32 bytes, 43 chars. Built-in functions only
-- (no pgcrypto extension needed). The same expression is the column default, so ADD COLUMN
-- backfills every existing row with its own value (volatile default = evaluated per row) and every
-- new person (app, seed) gets one; the app generates replacements with the Node CSPRNG.
ALTER TABLE "person"
    ADD COLUMN "freelancer_token" TEXT NOT NULL DEFAULT translate(rtrim(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'base64'), '='), '+/', '-_');

-- CreateIndex
CREATE UNIQUE INDEX "person_freelancer_token_key" ON "person"("freelancer_token");

-- Tokens are at least 32 random bytes in base64url (43 chars); refuse anything shorter.
ALTER TABLE "person" ADD CONSTRAINT "person_freelancer_token_length" CHECK (length("freelancer_token") >= 43);

-- Global running number for PO numbers (BR-116): never reused (sequences don't roll back).
CREATE SEQUENCE "purchase_order_seq" AS INTEGER START WITH 1 MINVALUE 1;

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
    "total_cents" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),
    "paid_by" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "cost_line_id" UUID,
    "cost_line_ref" UUID NOT NULL,
    "gig_id" UUID NOT NULL,
    "type" "CostType" NOT NULL,
    "description" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_event" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "type" "PurchaseOrderEventType" NOT NULL,
    "partner_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',
    "seq" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_number_key" ON "purchase_order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_seq_key" ON "purchase_order"("seq");

-- CreateIndex
CREATE INDEX "purchase_order_person_id_idx" ON "purchase_order"("person_id");

-- CreateIndex
CREATE INDEX "purchase_order_created_at_idx" ON "purchase_order"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_purchase_order_id_position_key" ON "purchase_order_line"("purchase_order_id", "position");

-- CreateIndex
CREATE INDEX "purchase_order_line_cost_line_id_idx" ON "purchase_order_line"("cost_line_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_gig_id_idx" ON "purchase_order_line"("gig_id");

-- A cost line is on at most one OPEN/PAID purchase order (BR-114, BR-118). Partial index: not
-- expressible in the Prisma schema. `active` is false exactly when the PO is CANCELLED.
CREATE UNIQUE INDEX "purchase_order_line_active_cost_line_key" ON "purchase_order_line"("cost_line_id") WHERE "active";

-- CreateIndex
CREATE INDEX "purchase_order_event_purchase_order_id_at_idx" ON "purchase_order_event"("purchase_order_id", "at");

-- CreateIndex
CREATE INDEX "purchase_order_event_at_idx" ON "purchase_order_event"("at");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (SET NULL: a cost line may be deleted once its PO is cancelled; cost_line_ref keeps the id)
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_cost_line_id_fkey" FOREIGN KEY ("cost_line_id") REFERENCES "cost_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_gig_id_fkey" FOREIGN KEY ("gig_id") REFERENCES "gig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
