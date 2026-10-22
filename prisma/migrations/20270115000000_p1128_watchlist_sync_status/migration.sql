-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WatchlistSyncStatus" ADD VALUE 'SKIPPED_NO_EXTERNAL_ID';
ALTER TYPE "WatchlistSyncStatus" ADD VALUE 'NOT_PERMITTED';

-- AlterTable
ALTER TABLE "WatchlistSyncSettings" ADD COLUMN     "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "watchlistEtag" TEXT;
