-- CreateEnum
CREATE TYPE "DutyStaffKind" AS ENUM ('REGULAR', 'MANUAL', 'TEMPORARY');

-- AlterTable
ALTER TABLE "duty_staff" ADD COLUMN     "kind" "DutyStaffKind" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "validFrom" DATE,
ADD COLUMN     "validUntil" DATE;

