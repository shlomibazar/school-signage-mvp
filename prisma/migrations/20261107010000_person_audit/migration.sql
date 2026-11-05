-- Audit trail of birthday-person changes (Stage 3). Additive only.

-- CreateEnum
CREATE TYPE "PersonAuditAction" AS ENUM ('CREATED', 'UPDATED', 'ROLE_ADDED', 'ROLE_CHANGED', 'DEACTIVATED', 'REACTIVATED', 'IDENTITY_SET', 'IDENTITY_REPLACED', 'IDENTITY_REMOVED');

-- CreateTable
CREATE TABLE "person_audit_events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "PersonAuditAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_audit_events_schoolId_createdAt_idx" ON "person_audit_events"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "person_audit_events_personId_createdAt_idx" ON "person_audit_events"("personId", "createdAt");

-- AddForeignKey
ALTER TABLE "person_audit_events" ADD CONSTRAINT "person_audit_events_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

