-- AlterTable
ALTER TABLE "WatchlistSyncSettings" ADD COLUMN     "totalItemsRequested" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalItemsSynced" INTEGER NOT NULL DEFAULT 0;
