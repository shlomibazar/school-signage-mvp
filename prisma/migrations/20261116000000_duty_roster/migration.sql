-- CreateEnum
CREATE TYPE "DutyAccess" AS ENUM ('NONE', 'VIEW', 'EDIT', 'PUBLISH');

-- CreateEnum
CREATE TYPE "DutyDataSource" AS ENUM ('MANUAL', 'SMARTSCHOOL');

-- AlterEnum
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'DUTY_ROSTER' BEFORE 'EMPTY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dutyAccess" "DutyAccess" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "duty_staff" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "personId" TEXT,
    "externalRef" TEXT,
    "source" "DutyDataSource" NOT NULL DEFAULT 'MANUAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxPerDay" INTEGER,
    "maxPerWeek" INTEGER,
    "unavailable" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_locations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "staffNeeded" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_periods" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "schoolDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5]::INTEGER[],
    "maxPerDay" INTEGER,
    "maxPerWeek" INTEGER,
    "allowOverride" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_weeks" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "draftVersion" INTEGER NOT NULL DEFAULT 0,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "overrideReason" TEXT,
    "overrideById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_absences" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "periodId" TEXT,
    "reason" TEXT,
    "source" "DutyDataSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_substitutions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "substituteStaffId" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,

    CONSTRAINT "duty_substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_audit_events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duty_staff_schoolId_active_idx" ON "duty_staff"("schoolId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "duty_staff_schoolId_externalRef_key" ON "duty_staff"("schoolId", "externalRef");

-- CreateIndex
CREATE INDEX "duty_locations_schoolId_active_idx" ON "duty_locations"("schoolId", "active");

-- CreateIndex
CREATE INDEX "duty_periods_schoolId_active_idx" ON "duty_periods"("schoolId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "duty_settings_schoolId_key" ON "duty_settings"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "duty_weeks_schoolId_weekStart_key" ON "duty_weeks"("schoolId", "weekStart");

-- CreateIndex
CREATE INDEX "duty_assignments_schoolId_date_idx" ON "duty_assignments"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "duty_assignments_weekId_date_periodId_locationId_staffId_key" ON "duty_assignments"("weekId", "date", "periodId", "locationId", "staffId");

-- CreateIndex
CREATE INDEX "duty_absences_schoolId_date_idx" ON "duty_absences"("schoolId", "date");

-- CreateIndex
CREATE INDEX "duty_substitutions_schoolId_assignmentId_idx" ON "duty_substitutions"("schoolId", "assignmentId");

-- CreateIndex
CREATE INDEX "duty_audit_events_schoolId_createdAt_idx" ON "duty_audit_events"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "duty_staff" ADD CONSTRAINT "duty_staff_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_locations" ADD CONSTRAINT "duty_locations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_periods" ADD CONSTRAINT "duty_periods_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_settings" ADD CONSTRAINT "duty_settings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_weeks" ADD CONSTRAINT "duty_weeks_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "duty_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "duty_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "duty_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "duty_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_absences" ADD CONSTRAINT "duty_absences_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "duty_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_absences" ADD CONSTRAINT "duty_absences_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "duty_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_substitutions" ADD CONSTRAINT "duty_substitutions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "duty_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_substitutions" ADD CONSTRAINT "duty_substitutions_substituteStaffId_fkey" FOREIGN KEY ("substituteStaffId") REFERENCES "duty_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

