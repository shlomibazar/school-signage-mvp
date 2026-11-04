-- Screen snapshots ("עדכן צילום"): two optional columns. Additive only: no existing row, layout,
-- content or theme is changed, and existing screens keep NULL until their first capture.
ALTER TABLE "screens" ADD COLUMN "snapshotUrl" TEXT;
ALTER TABLE "screens" ADD COLUMN "snapshotAt" TIMESTAMP(3);
