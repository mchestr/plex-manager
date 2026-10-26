-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "discordStatsChannels" JSONB,
ADD COLUMN     "discordStatsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discordStatsIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "discordStatsLastNames" JSONB,
ADD COLUMN     "requestTiers" JSONB,
ADD COLUMN     "requestTiersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestTiersRunHour" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "requestTiersExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RequestTierRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" TEXT NOT NULL,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "entries" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "RequestTierRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestTierRun_startedAt_idx" ON "RequestTierRun"("startedAt");
