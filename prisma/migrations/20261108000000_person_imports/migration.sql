-- Excel import of birthday people (Stage 4). Additive only: a new table, enum and nullable column.

-- CreateEnum
CREATE TYPE "PersonImportStatus" AS ENUM ('PREVIEWED', 'APPLYING', 'APPLIED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "person_sources" ADD COLUMN     "lastImportId" TEXT;

-- CreateTable
CREATE TABLE "person_imports" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "PersonRoleType" NOT NULL,
    "status" "PersonImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rows" JSONB,
    "planHash" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_imports_schoolId_createdAt_idx" ON "person_imports"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "person_imports_schoolId_fileSha256_idx" ON "person_imports"("schoolId", "fileSha256");

-- AddForeignKey
ALTER TABLE "person_imports" ADD CONSTRAINT "person_imports_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

