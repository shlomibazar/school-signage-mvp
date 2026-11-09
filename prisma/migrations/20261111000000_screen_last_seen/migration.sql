-- Last heartbeat of a screen's public display page (server time). Nullable: NULL = never connected.
-- Additive only: no existing row or column changes.
ALTER TABLE "screens" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
