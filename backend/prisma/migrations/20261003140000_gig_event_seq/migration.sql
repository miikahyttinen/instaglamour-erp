-- History order tie-breaker: events with the same timestamp keep their insertion order.
ALTER TABLE "gig_event" ADD COLUMN "seq" BIGSERIAL NOT NULL;
