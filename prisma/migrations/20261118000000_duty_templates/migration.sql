-- CreateEnum
CREATE TYPE "DutyScheduleMode" AS ENUM ('WEEKLY', 'RECURRING', 'HYBRID');

-- CreateEnum
CREATE TYPE "DutyDayKind" AS ENUM ('HOLIDAY', 'NO_SCHOOL', 'SPECIAL');

-- AlterTable
ALTER TABLE "duty_settings" ADD COLUMN     "scheduleMode" "DutyScheduleMode" NOT NULL DEFAULT 'WEEKLY';

-- AlterTable
ALTER TABLE "duty_weeks" ADD COLUMN     "useTemplate" BOOLEAN;

-- AlterTable
ALTER TABLE "duty_assignments" ADD COLUMN     "overrideOfEntryId" TEXT;

-- AlterTable
ALTER TABLE "duty_substitutions" ADD COLUMN     "occurrenceKey" TEXT,
ALTER COLUMN "assignmentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "duty_templates" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_template_entries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "periodId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_template_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_template_skips" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_template_skips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_calendar_days" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "DutyDayKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duty_calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duty_templates_schoolId_effectiveFrom_idx" ON "duty_templates"("schoolId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "duty_template_entries_schoolId_idx" ON "duty_template_entries"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "duty_template_entries_templateId_weekday_periodId_locationI_key" ON "duty_template_entries"("templateId", "weekday", "periodId", "locationId", "staffId");

-- CreateIndex
CREATE INDEX "duty_template_skips_schoolId_date_idx" ON "duty_template_skips"("schoolId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "duty_template_skips_entryId_date_key" ON "duty_template_skips"("entryId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "duty_calendar_days_schoolId_date_key" ON "duty_calendar_days"("schoolId", "date");

-- CreateIndex
CREATE INDEX "duty_substitutions_schoolId_occurrenceKey_idx" ON "duty_substitutions"("schoolId", "occurrenceKey");

-- AddForeignKey
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_overrideOfEntryId_fkey" FOREIGN KEY ("overrideOfEntryId") REFERENCES "duty_template_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_templates" ADD CONSTRAINT "duty_templates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_template_entries" ADD CONSTRAINT "duty_template_entries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "duty_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_template_skips" ADD CONSTRAINT "duty_template_skips_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "duty_template_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_calendar_days" ADD CONSTRAINT "duty_calendar_days_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing substitutions refer to their week assignment.
UPDATE "duty_substitutions" SET "occurrenceKey" = "assignmentId" WHERE "occurrenceKey" IS NULL;
