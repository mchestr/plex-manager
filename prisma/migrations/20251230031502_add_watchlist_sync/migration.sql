-- CreateEnum
CREATE TYPE "WatchlistSyncStatus" AS ENUM ('SYNCED', 'REQUESTED', 'ALREADY_AVAILABLE', 'ALREADY_REQUESTED', 'FAILED', 'REMOVED_FROM_WATCHLIST');

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "watchlistSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "watchlistSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "plexAuthToken" TEXT;

-- CreateTable
CREATE TABLE "WatchlistSyncSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "itemsSynced" INTEGER NOT NULL DEFAULT 0,
    "itemsRequested" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistSyncSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistSyncHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plexRatingKey" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "tmdbId" INTEGER,
    "tvdbId" INTEGER,
    "imdbId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedAt" TIMESTAMP(3),
    "overseerrRequestId" INTEGER,
    "status" "WatchlistSyncStatus" NOT NULL DEFAULT 'SYNCED',

    CONSTRAINT "WatchlistSyncHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistSyncLock" (
    "id" TEXT NOT NULL DEFAULT 'watchlist-sync',
    "instanceId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistSyncLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistSyncSettings_userId_key" ON "WatchlistSyncSettings"("userId");

-- CreateIndex
CREATE INDEX "WatchlistSyncSettings_syncEnabled_idx" ON "WatchlistSyncSettings"("syncEnabled");

-- CreateIndex
CREATE INDEX "WatchlistSyncHistory_userId_syncedAt_idx" ON "WatchlistSyncHistory"("userId", "syncedAt");

-- CreateIndex
CREATE INDEX "WatchlistSyncHistory_status_idx" ON "WatchlistSyncHistory"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistSyncHistory_userId_plexRatingKey_key" ON "WatchlistSyncHistory"("userId", "plexRatingKey");

-- CreateIndex
CREATE INDEX "WatchlistSyncLock_expiresAt_idx" ON "WatchlistSyncLock"("expiresAt");

-- AddForeignKey
ALTER TABLE "WatchlistSyncSettings" ADD CONSTRAINT "WatchlistSyncSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistSyncHistory" ADD CONSTRAINT "WatchlistSyncHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
