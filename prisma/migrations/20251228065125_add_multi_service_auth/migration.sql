/*
  Warnings:

  - You are about to drop the column `onboardingCompleted` on the `User` table. All the data in the column will be lost.

*/

-- Step 1: Add new columns with defaults
ALTER TABLE "User" ADD COLUMN "primaryAuthService" TEXT;
ALTER TABLE "User" ADD COLUMN "onboardingStatus" JSONB DEFAULT '{"plex": false, "jellyfin": false}';

-- Step 2: Backfill primaryAuthService for all existing users
-- All existing users authenticated with Plex, so set to 'plex'
UPDATE "User" SET "primaryAuthService" = 'plex' WHERE "primaryAuthService" IS NULL;

-- Step 3: Backfill onboardingStatus based on old onboardingCompleted value
-- Users who completed onboarding get {"plex": true, "jellyfin": false}
UPDATE "User"
SET "onboardingStatus" = '{"plex": true, "jellyfin": false}'::jsonb
WHERE "onboardingCompleted" = true;

-- Users who haven't completed onboarding keep the default {"plex": false, "jellyfin": false}
-- (Already set by the default value, so no UPDATE needed)

-- Step 4: Drop the old onboardingCompleted column
DROP INDEX IF EXISTS "User_onboardingCompleted_idx";
ALTER TABLE "User" DROP COLUMN "onboardingCompleted";

-- Step 5: Create index on new primaryAuthService field
CREATE INDEX "User_primaryAuthService_idx" ON "User"("primaryAuthService");
