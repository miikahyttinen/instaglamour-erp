-- TASK-016: offers (UC-028..UC-031, BR-102..BR-107), offer history, gig.offer_id, partner.phone and
-- text settings. Additive only: no existing data is changed (setting.value_cents only becomes nullable).

-- CreateEnum
CREATE TYPE "OfferSource" AS ENUM ('EMAIL', 'WEBSITE', 'INSTAGRAM', 'OTHER');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('PRIVATE', 'WEDDING', 'CORPORATE');

-- CreateEnum
CREATE TYPE "OfferDisposition" AS ENUM ('PENDING', 'WON', 'CANCELLED', 'NO_RESPONSE', 'LOST_PRICE', 'LOST_COMPETITOR', 'LOST_OTHER', 'NO_CAPACITY');

-- CreateEnum
CREATE TYPE "OfferEventType" AS ENUM ('CREATED', 'UPDATED', 'DISPOSITION_CHANGED', 'CONVERTED', 'LINK_REGENERATED', 'DELETED', 'RESTORED');

-- AlterTable
ALTER TABLE "gig" ADD COLUMN     "offer_id" UUID;

-- AlterTable
ALTER TABLE "partner" ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "setting" ADD COLUMN     "value_text" TEXT,
ALTER COLUMN "value_cents" DROP NOT NULL;

-- CreateTable
CREATE TABLE "offer" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "venue" TEXT NOT NULL,
    "city" TEXT,
    "lineup" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includes_text" TEXT,
    "spotify_url" TEXT,
    "price_cents" INTEGER,
    "seller_id" UUID NOT NULL,
    "show_references" BOOLEAN NOT NULL DEFAULT false,
    "source" "OfferSource",
    "event_type" "EventType",
    "disposition" "OfferDisposition" NOT NULL DEFAULT 'PENDING',
    "share_token" TEXT NOT NULL,
    "share_token_hash" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_event" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "type" "OfferEventType" NOT NULL,
    "partner_id" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB NOT NULL DEFAULT '{}',
    "seq" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_share_token_key" ON "offer"("share_token");

-- CreateIndex
CREATE UNIQUE INDEX "offer_share_token_hash_key" ON "offer"("share_token_hash");

-- CreateIndex
CREATE INDEX "offer_event_date_idx" ON "offer"("event_date");

-- CreateIndex
CREATE INDEX "offer_client_id_idx" ON "offer"("client_id");

-- CreateIndex
CREATE INDEX "offer_event_offer_id_at_idx" ON "offer_event"("offer_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "gig_offer_id_key" ON "gig"("offer_id");

-- AddForeignKey
ALTER TABLE "gig" ADD CONSTRAINT "gig_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_event" ADD CONSTRAINT "offer_event_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_event" ADD CONSTRAINT "offer_event_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Public link tokens are 32 random bytes in base64url (43 chars); refuse anything shorter (BR-104).
ALTER TABLE "offer" ADD CONSTRAINT "offer_share_token_length" CHECK (length("share_token") >= 43);
