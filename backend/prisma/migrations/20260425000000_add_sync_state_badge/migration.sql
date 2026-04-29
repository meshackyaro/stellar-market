-- AlterEnum: add BADGE_AWARDED to NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BADGE_AWARDED';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BadgeTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: SyncState (singleton row for event-stream cursor)
CREATE TABLE IF NOT EXISTS "SyncState" (
    "id"                TEXT NOT NULL DEFAULT 'default',
    "lastIndexedLedger" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Badge
CREATE TABLE IF NOT EXISTS "Badge" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "tier"          "BadgeTier" NOT NULL,
    "awardedLedger" INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Badge_userId_tier_key" ON "Badge"("userId", "tier");
CREATE INDEX IF NOT EXISTS "Badge_userId_idx" ON "Badge"("userId");

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
