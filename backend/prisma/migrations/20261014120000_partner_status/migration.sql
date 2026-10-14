-- TASK-020: partner status managed in the app (UC-032, BR-110..112). Additive only: existing
-- partners become active; no data is removed. Fails (instead of guessing) if two existing partners
-- share an email case-insensitively — fix those rows by hand first.

-- AlterTable
ALTER TABLE "partner"
    ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "granted_by" UUID,
    ADD COLUMN "granted_at" TIMESTAMP(3),
    ADD COLUMN "revoked_by" UUID,
    ADD COLUMN "revoked_at" TIMESTAMP(3);

-- Email unique among all partners (active or not), case-insensitive (not expressible in the Prisma schema)
CREATE UNIQUE INDEX "partner_email_lower_key" ON "partner" (lower("email"));

-- AddForeignKey (who granted / revoked; SET NULL so the audit link never blocks anything)
ALTER TABLE "partner" ADD CONSTRAINT "partner_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "partner" ADD CONSTRAINT "partner_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
