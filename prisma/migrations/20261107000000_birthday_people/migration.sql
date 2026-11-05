-- Birthday management foundation (Stage 3). Additive only: new enums, tables, indexes and foreign
-- keys; no existing table, column or row is changed.

-- CreateEnum
CREATE TYPE "PersonRoleType" AS ENUM ('STUDENT', 'TEACHER');

-- CreateEnum
CREATE TYPE "PersonGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PersonSourceType" AS ENUM ('MANUAL', 'EXCEL', 'SMARTSCHOOL');

-- CreateEnum
CREATE TYPE "PersonSourceStatus" AS ENUM ('ACTIVE', 'MISSING', 'INACTIVE');

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "gender" "PersonGender",
    "identityKey" TEXT,
    "identityKeyVersion" INTEGER,
    "identityHint" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "dataSource" "PersonSourceType" NOT NULL DEFAULT 'MANUAL',
    "lastSyncedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_roles" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "PersonRoleType" NOT NULL,
    "grade" TEXT,
    "parallel" INTEGER,
    "className" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_sources" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "sourceType" "PersonSourceType" NOT NULL,
    "recordKey" TEXT NOT NULL,
    "status" "PersonSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "people_schoolId_active_idx" ON "people"("schoolId", "active");

-- CreateIndex
CREATE INDEX "people_schoolId_lastName_firstName_idx" ON "people"("schoolId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "people_schoolId_identityKey_key" ON "people"("schoolId", "identityKey");

-- CreateIndex
CREATE INDEX "person_roles_role_grade_idx" ON "person_roles"("role", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "person_roles_personId_role_key" ON "person_roles"("personId", "role");

-- CreateIndex
CREATE INDEX "person_sources_personId_idx" ON "person_sources"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "person_sources_schoolId_sourceType_recordKey_key" ON "person_sources"("schoolId", "sourceType", "recordKey");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_sources" ADD CONSTRAINT "person_sources_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_sources" ADD CONSTRAINT "person_sources_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express.
ALTER TABLE "people" ADD CONSTRAINT "people_identity_key_version_check" CHECK (("identityKey" IS NULL) = ("identityKeyVersion" IS NULL));
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_parallel_check" CHECK ("parallel" IS NULL OR ("parallel" BETWEEN 1 AND 99));
