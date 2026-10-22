-- P11.10 (GAP-24): every member row records its service, as an enum.
--
-- The data step runs first, while the column is still TEXT:
--   1. a Jellyfin-only row is 'jellyfin';
--   2. a Plex row is 'plex' unless it also has a Jellyfin ID and already says
--      which service it joined with (a later sign-in never flips the value);
--   3. any other value, such as a stray 'plex' on a row with no Plex ID or a
--      typo, becomes NULL, so the type change below cannot fail.
-- The column then changes type in place, keeping User_primaryAuthService_idx.

UPDATE "User" SET "primaryAuthService" = 'jellyfin'
WHERE "jellyfinUserId" IS NOT NULL AND "plexUserId" IS NULL;

UPDATE "User" SET "primaryAuthService" = 'plex'
WHERE "plexUserId" IS NOT NULL AND ("primaryAuthService" IS NULL OR "jellyfinUserId" IS NULL);

UPDATE "User" SET "primaryAuthService" = NULL
WHERE "primaryAuthService" IS NOT NULL AND "primaryAuthService" NOT IN ('plex', 'jellyfin');

-- CreateEnum
CREATE TYPE "AuthService" AS ENUM ('plex', 'jellyfin');

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "primaryAuthService" TYPE "AuthService" USING "primaryAuthService"::"AuthService";
