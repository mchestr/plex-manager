-- CreateTable
CREATE TABLE "DiscordPendingSelection" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "customId" TEXT NOT NULL,
    "markType" "MarkType" NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordPendingSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordPendingSelection_customId_key" ON "DiscordPendingSelection"("customId");

-- CreateIndex
CREATE INDEX "DiscordPendingSelection_discordUserId_channelId_idx" ON "DiscordPendingSelection"("discordUserId", "channelId");

-- CreateIndex
CREATE INDEX "DiscordPendingSelection_expiresAt_idx" ON "DiscordPendingSelection"("expiresAt");
