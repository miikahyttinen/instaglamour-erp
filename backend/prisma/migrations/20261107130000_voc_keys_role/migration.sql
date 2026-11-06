-- TASK-054 (api-contract "New musician role "Vocal & Keys"", 2026-11-07): new musician role
-- VOC_KEYS, placed right after BACKING_VOC so the enum order (= MUSICIAN_ROLES order, which person
-- roles are sorted by) stays in sync. Adds the enum value only; no data changes.
ALTER TYPE "CostType" ADD VALUE 'VOC_KEYS' AFTER 'BACKING_VOC';
