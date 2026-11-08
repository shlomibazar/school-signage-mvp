-- Footer birthday ticker settings (birthday module). Additive only: new columns with defaults;
-- existing layouts keep their behavior (footerShowBirthdays stays as it was).

-- AlterTable
ALTER TABLE "screen_layouts" ADD COLUMN     "footerBirthdayAudience" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "footerBirthdayGrades" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "footerBirthdayNameFormat" TEXT NOT NULL DEFAULT 'first',
ADD COLUMN     "footerBirthdayPeriod" TEXT NOT NULL DEFAULT 'today';
