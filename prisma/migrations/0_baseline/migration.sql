-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('TEXT', 'IMAGE_GALLERY', 'VIDEO', 'CLOCK', 'DATE', 'WEATHER', 'RSS_FEED', 'TIMETABLE', 'EVENTS', 'BIRTHDAYS', 'ANNOUNCEMENT', 'EMPTY');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "Orientation" AS ENUM ('LANDSCAPE', 'PORTRAIT');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "announcement_screens" (
    "announcementId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "sectionPosition" INTEGER,

    CONSTRAINT "announcement_screens_pkey" PRIMARY KEY ("announcementId","screenId")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'LOW',
    "bgColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" INTEGER[],
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "showTitle" BOOLEAN NOT NULL DEFAULT true,
    "attachmentDisplayMode" TEXT NOT NULL DEFAULT 'slideshow',
    "attachmentSlideSeconds" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL DEFAULT 'TEXT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" INTEGER[],
    "textContent" TEXT,
    "textColor" TEXT,
    "bgColor" TEXT,
    "fontSize" INTEGER,
    "galleryId" TEXT,
    "slideDuration" INTEGER NOT NULL DEFAULT 5,
    "transitionStyle" TEXT NOT NULL DEFAULT 'fade',
    "videoUrl" TEXT,
    "videoLoop" BOOLEAN NOT NULL DEFAULT true,
    "videoMuted" BOOLEAN NOT NULL DEFAULT true,
    "rssUrl" TEXT,
    "rssMaxItems" INTEGER NOT NULL DEFAULT 5,
    "weatherCity" TEXT,
    "weatherUnits" TEXT NOT NULL DEFAULT 'metric',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "galleries" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "galleryId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'info',
    "icon" TEXT NOT NULL DEFAULT '📢',
    "bgColor" TEXT NOT NULL DEFAULT '#1e3a5f',
    "textColor" TEXT NOT NULL DEFAULT '#ffffff',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_themes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a73e8',
    "secondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "backgroundColor" TEXT NOT NULL DEFAULT '#0f0f1a',
    "fontFamily" TEXT NOT NULL DEFAULT 'Heebo',
    "logoUrl" TEXT,
    "borderRadius" INTEGER NOT NULL DEFAULT 8,

    CONSTRAINT "school_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "weatherCity" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'he',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_layouts" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "headerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "headerHeight" INTEGER NOT NULL DEFAULT 80,
    "headerShowLogo" BOOLEAN NOT NULL DEFAULT true,
    "headerShowTitle" BOOLEAN NOT NULL DEFAULT true,
    "headerShowClock" BOOLEAN NOT NULL DEFAULT true,
    "headerShowDate" BOOLEAN NOT NULL DEFAULT true,
    "headerShowHebDate" BOOLEAN NOT NULL DEFAULT true,
    "headerDateType" TEXT NOT NULL DEFAULT 'BOTH',
    "headerShowWeather" BOOLEAN NOT NULL DEFAULT false,
    "headerScrollText" TEXT,
    "headerTitleFontSize" INTEGER NOT NULL DEFAULT 26,
    "headerTitleFontWeight" INTEGER NOT NULL DEFAULT 700,
    "headerShowParasha" BOOLEAN NOT NULL DEFAULT false,
    "mainSections" INTEGER NOT NULL DEFAULT 1,
    "footerEnabled" BOOLEAN NOT NULL DEFAULT true,
    "footerHeight" INTEGER NOT NULL DEFAULT 48,
    "footerTicker" TEXT,
    "footerShowSchoolName" BOOLEAN NOT NULL DEFAULT true,
    "footerShowClock" BOOLEAN NOT NULL DEFAULT false,
    "footerShowBirthdays" BOOLEAN NOT NULL DEFAULT false,
    "footerFeedMode" TEXT NOT NULL DEFAULT 'manual',
    "footerRssUrl" TEXT,
    "footerRssMaxItems" INTEGER NOT NULL DEFAULT 8,
    "footerRssRefreshMinutes" INTEGER NOT NULL DEFAULT 15,
    "footerTickerSpeed" TEXT NOT NULL DEFAULT 'normal',
    "bgColor" TEXT,
    "bgImageUrl" TEXT,
    "fontFamily" TEXT NOT NULL DEFAULT 'Heebo',

    CONSTRAINT "screen_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_sections" (
    "id" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "widthPct" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "screen_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screens" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortCode" TEXT,
    "orientation" "Orientation" NOT NULL DEFAULT 'LANDSCAPE',
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "refreshSecs" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "schoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_themes_schoolId_key" ON "school_themes"("schoolId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "screen_layouts_screenId_key" ON "screen_layouts"("screenId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "screen_sections_screenId_position_key" ON "screen_sections"("screenId" ASC, "position" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "screens_shortCode_key" ON "screens"("shortCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "screens_slug_key" ON "screens"("slug" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email" ASC);

-- AddForeignKey
ALTER TABLE "announcement_screens" ADD CONSTRAINT "announcement_screens_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_screens" ADD CONSTRAINT "announcement_screens_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "screen_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "galleries" ADD CONSTRAINT "galleries_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "galleries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_themes" ADD CONSTRAINT "school_themes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_layouts" ADD CONSTRAINT "screen_layouts_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_sections" ADD CONSTRAINT "screen_sections_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screens" ADD CONSTRAINT "screens_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
