-- CreateEnum
CREATE TYPE "DiscordCommandType" AS ENUM ('CHAT', 'MEDIA_MARK', 'CLEAR_CONTEXT', 'SELECTION', 'LINK_REQUEST');

-- CreateEnum
CREATE TYPE "DiscordCommandStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "DiscordCommandLog" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT,
    "userId" TEXT,
    "commandType" "DiscordCommandType" NOT NULL,
    "commandName" TEXT NOT NULL,
    "commandArgs" TEXT,
    "channelId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "guildId" TEXT,
    "status" "DiscordCommandStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "responseTimeMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordCommandLog_discordUserId_idx" ON "DiscordCommandLog"("discordUserId");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_userId_idx" ON "DiscordCommandLog"("userId");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_commandType_idx" ON "DiscordCommandLog"("commandType");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_commandName_idx" ON "DiscordCommandLog"("commandName");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_status_idx" ON "DiscordCommandLog"("status");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_createdAt_idx" ON "DiscordCommandLog"("createdAt");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_channelId_idx" ON "DiscordCommandLog"("channelId");
