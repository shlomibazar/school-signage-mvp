CREATE TABLE "screen_pairing_codes" (
 "id" TEXT NOT NULL, "screenId" TEXT NOT NULL, "codeHash" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "screen_pairing_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "screen_pairing_codes_codeHash_key" ON "screen_pairing_codes"("codeHash");
CREATE INDEX "screen_pairing_codes_screenId_expiresAt_idx" ON "screen_pairing_codes"("screenId", "expiresAt");
ALTER TABLE "screen_pairing_codes" ADD CONSTRAINT "screen_pairing_codes_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "screens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "pairing_rate_limits" (
 "key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0,
 "windowStart" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "pairing_rate_limits_pkey" PRIMARY KEY ("key")
);
