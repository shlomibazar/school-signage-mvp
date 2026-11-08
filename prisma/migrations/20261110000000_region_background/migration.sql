-- Per-region background settings (theme default when NULL). Additive only.

-- AlterTable
ALTER TABLE "screen_sections" ADD COLUMN     "background" JSONB;
