-- Remove Jellyfin support.
--
-- Data steps run first, while the old enum values still exist:
--   1. Jellyfin invites can no longer be redeemed, so they go (their usages cascade);
--   2. a member who joined with Jellyfin is 'plex' when they also have a Plex
--      account, else NULL (a Jellyfin-only row stays, with no service, and can
--      no longer sign in);
--   3. the "jellyfin" key leaves every onboarding status.
-- Then the Jellyfin table, columns and enum values are dropped.

DELETE FROM "Invite" WHERE "serverType" = 'JELLYFIN';

UPDATE "User" SET "primaryAuthService" = CASE WHEN "plexUserId" IS NOT NULL THEN 'plex'::"AuthService" ELSE NULL END
WHERE "primaryAuthService" = 'jellyfin';

UPDATE "User" SET "onboardingStatus" = ("onboardingStatus"::jsonb - 'jellyfin')
WHERE "onboardingStatus" IS NOT NULL AND jsonb_typeof("onboardingStatus"::jsonb) = 'object' AND ("onboardingStatus"::jsonb ? 'jellyfin');

-- DropTable
DROP TABLE "JellyfinServer";

-- AlterTable
ALTER TABLE "Invite" DROP COLUMN "jellyfinLibraryIds";

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "jellyfinAccessStatus";

-- DropIndex
DROP INDEX IF EXISTS "User_jellyfinUserId_key";
DROP INDEX IF EXISTS "User_jellyfinUserId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "jellyfinUserId",
ALTER COLUMN "onboardingStatus" SET DEFAULT '{"plex": false}';

-- AlterEnum
ALTER TYPE "AuthService" RENAME TO "AuthService_old";
CREATE TYPE "AuthService" AS ENUM ('plex');
ALTER TABLE "User" ALTER COLUMN "primaryAuthService" TYPE "AuthService" USING ("primaryAuthService"::text::"AuthService");
DROP TYPE "AuthService_old";

-- AlterEnum
ALTER TYPE "ServerType" RENAME TO "ServerType_old";
CREATE TYPE "ServerType" AS ENUM ('PLEX');
ALTER TABLE "Invite" ALTER COLUMN "serverType" DROP DEFAULT;
ALTER TABLE "Invite" ALTER COLUMN "serverType" TYPE "ServerType" USING ("serverType"::text::"ServerType");
ALTER TABLE "Invite" ALTER COLUMN "serverType" SET DEFAULT 'PLEX';
DROP TYPE "ServerType_old";
