-- SchoolScreen: per-screen operating hours, compatible with existing `screens` table.
CREATE TABLE IF NOT EXISTS "ScreenOperatingSchedule" (
  "screenId" TEXT PRIMARY KEY REFERENCES "screens"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "startTime" TEXT NOT NULL DEFAULT '07:00',
  "endTime" TEXT NOT NULL DEFAULT '19:00',
  "days" INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4]::INTEGER[],
  "standbyMode" TEXT NOT NULL DEFAULT 'logo',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
