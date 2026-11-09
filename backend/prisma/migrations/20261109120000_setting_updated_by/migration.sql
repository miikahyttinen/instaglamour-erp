-- TASK-057 (api-contract "Settings: Parameters tab", 2026-11-09): settings edited in the app record
-- who changed them. New nullable column; existing rows keep NULL (= set by seed/import). No data changes.
ALTER TABLE "setting" ADD COLUMN "updated_by" UUID;

ALTER TABLE "setting" ADD CONSTRAINT "setting_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
