-- Remove the legacy Messages module (replaced by Announcements; no code reads or writes it).
-- Safety: refuse to drop the table if it still holds any row. The check runs inside the same
-- migration transaction, so the table is only dropped if it is empty at that moment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "messages") THEN
    RAISE EXCEPTION 'Refusing to drop "messages": the table is not empty. Export or remove the rows deliberately first.';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_schoolId_fkey";

-- DropTable
DROP TABLE "messages";
