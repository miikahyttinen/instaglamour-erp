-- TASK-058 (api-contract "Contract done, follow-up done, My offers", 2026-11-09): two new flags, no data dropped.
-- event.contract_done: default false; existing gigs whose start date is before today (Europe/Helsinki)
-- are marked done, upcoming ones (today or later) stay false.
ALTER TABLE "event" ADD COLUMN "contract_done" BOOLEAN NOT NULL DEFAULT false;

UPDATE "event" SET "contract_done" = true
  WHERE "start_date" < (now() AT TIME ZONE 'Europe/Helsinki')::date;

-- offer.follow_up_done: default false for all offers.
ALTER TABLE "offer" ADD COLUMN "follow_up_done" BOOLEAN NOT NULL DEFAULT false;
