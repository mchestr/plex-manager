-- Rewind 2026 (P2.1, design 7.10). Additive only: every new NOT NULL column has a
-- default, and no row is back-filled (dataVersion is set by v3 writes only, because
-- a ::jsonb cast of PlexWrapped.data fails on a malformed row). The dropped indexes
-- each duplicate a unique index on the same leading column (BP-26).

-- DropIndex
DROP INDEX "DiscordChatSession_discordUserId_idx";

-- DropIndex
DROP INDEX "DiscordConnection_discordUserId_idx";

-- DropIndex
DROP INDEX "DiscordOAuthState_state_idx";

-- DropIndex
DROP INDEX "Invite_code_idx";

-- DropIndex
DROP INDEX "PlexWrapped_shareToken_idx";

-- DropIndex
DROP INDEX "PlexWrapped_userId_idx";

-- DropIndex
DROP INDEX "User_jellyfinUserId_idx";

-- DropIndex
DROP INDEX "User_plexUserId_idx";

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en-US',
ADD COLUMN     "rewindAllowArtOnCards" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rewindAudience" TEXT NOT NULL DEFAULT 'admins',
ADD COLUMN     "rewindAudio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewindDisabledPages" JSONB,
ADD COLUMN     "rewindEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewindExcludedContentRatings" JSONB,
ADD COLUMN     "rewindExcludedSectionIds" JSONB,
ADD COLUMN     "rewindIncludeManagedUsers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewindLlmBudgetUsd" DECIMAL(10,2) NOT NULL DEFAULT 10,
ADD COLUMN     "rewindLlmMode" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "rewindNotifyChannels" JSONB NOT NULL DEFAULT '["discord", "banner"]',
ADD COLUMN     "rewindPublicCounts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rewindPublicLinks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rewindSeasonCloses" TEXT NOT NULL DEFAULT '01-31',
ADD COLUMN     "rewindSeasonOpens" TEXT NOT NULL DEFAULT '12-01',
ADD COLUMN     "rewindSerialKey" TEXT,
ADD COLUMN     "rewindShowServerNameOnCards" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serverName" TEXT,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "LLMProvider" ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "effort" TEXT;

-- AlterTable
ALTER TABLE "LLMUsage" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "factsHash" TEXT,
ADD COLUMN     "generationId" TEXT,
ADD COLUMN     "outcome" TEXT NOT NULL DEFAULT 'ok',
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "reasoningTokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceTier" TEXT;

-- AlterTable
ALTER TABLE "PlexWrapped" ADD COLUMN     "dataThrough" TIMESTAMP(3),
ADD COLUMN     "dataVersion" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "edition" TEXT,
ADD COLUMN     "factsHash" TEXT,
ADD COLUMN     "finalCutAt" TIMESTAMP(3),
ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "RewindGeneration" (
    "id" TEXT NOT NULL,
    "wrappedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "jobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" JSONB,
    "factsHash" TEXT,
    "copySource" TEXT,
    "copyPolicy" TEXT NOT NULL DEFAULT 'default',
    "llmCalls" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4),
    "previousData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewindGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindShare" (
    "id" TEXT NOT NULL,
    "wrappedId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "pages" JSONB NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "includeArt" BOOLEAN NOT NULL DEFAULT false,
    "dailyDetail" BOOLEAN NOT NULL DEFAULT false,
    "cardFacts" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedFromId" TEXT,

    CONSTRAINT "RewindShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindShareVisitDay" (
    "shareId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RewindShareVisitDay_pkey" PRIMARY KEY ("shareId","day")
);

-- CreateTable
CREATE TABLE "RewindPrefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "includeArt" BOOLEAN NOT NULL DEFAULT false,
    "dailyDetail" BOOLEAN NOT NULL DEFAULT false,
    "cardFacts" JSONB,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "exclusionsVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewindPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindExclusion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ratingKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewindExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindServerAggregate" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "dataThrough" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,

    CONSTRAINT "RewindServerAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaMetadataCache" (
    "ratingKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "librarySectionId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3),
    "genres" JSONB NOT NULL,
    "directors" JSONB NOT NULL,
    "actors" JSONB NOT NULL,
    "studio" TEXT,
    "contentRating" TEXT,
    "year" INTEGER,
    "originallyAvailableAt" TIMESTAMP(3),
    "runtimeSec" INTEGER,
    "seasonEpisodeCounts" JSONB,
    "guids" JSONB NOT NULL,
    "videoResolution" TEXT,
    "hdr" BOOLEAN,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaMetadataCache_pkey" PRIMARY KEY ("ratingKey")
);

-- CreateTable
CREATE TABLE "RewindView" (
    "id" TEXT NOT NULL,
    "wrappedId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "furthestPage" INTEGER NOT NULL DEFAULT 0,
    "shareActions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewindView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindEvalRun" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "fixtures" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "costUsd" DECIMAL(10,4) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewindEvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewindBatch" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "batchRef" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RewindBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewindGeneration_userId_year_status_idx" ON "RewindGeneration"("userId", "year", "status");

-- CreateIndex
CREATE INDEX "RewindGeneration_status_startedAt_idx" ON "RewindGeneration"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RewindGeneration_wrappedId_idx" ON "RewindGeneration"("wrappedId");

-- CreateIndex
CREATE UNIQUE INDEX "RewindShare_tokenHash_key" ON "RewindShare"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RewindShare_assetKey_key" ON "RewindShare"("assetKey");

-- CreateIndex
CREATE INDEX "RewindShare_wrappedId_idx" ON "RewindShare"("wrappedId");

-- CreateIndex
CREATE INDEX "RewindShareVisitDay_day_idx" ON "RewindShareVisitDay"("day");

-- CreateIndex
CREATE UNIQUE INDEX "RewindPrefs_userId_year_key" ON "RewindPrefs"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "RewindExclusion_userId_ratingKey_key" ON "RewindExclusion"("userId", "ratingKey");

-- CreateIndex
CREATE UNIQUE INDEX "RewindServerAggregate_year_dataThrough_key" ON "RewindServerAggregate"("year", "dataThrough");

-- CreateIndex
CREATE INDEX "RewindView_createdAt_idx" ON "RewindView"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewindView_wrappedId_sessionKey_key" ON "RewindView"("wrappedId", "sessionKey");

-- CreateIndex
CREATE INDEX "LLMUsage_generationId_idx" ON "LLMUsage"("generationId");

-- AddForeignKey
ALTER TABLE "RewindGeneration" ADD CONSTRAINT "RewindGeneration_wrappedId_fkey" FOREIGN KEY ("wrappedId") REFERENCES "PlexWrapped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindGeneration" ADD CONSTRAINT "RewindGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindShare" ADD CONSTRAINT "RewindShare_wrappedId_fkey" FOREIGN KEY ("wrappedId") REFERENCES "PlexWrapped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindShareVisitDay" ADD CONSTRAINT "RewindShareVisitDay_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "RewindShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindPrefs" ADD CONSTRAINT "RewindPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindExclusion" ADD CONSTRAINT "RewindExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewindView" ADD CONSTRAINT "RewindView_wrappedId_fkey" FOREIGN KEY ("wrappedId") REFERENCES "PlexWrapped"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMUsage" ADD CONSTRAINT "LLMUsage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "RewindGeneration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
