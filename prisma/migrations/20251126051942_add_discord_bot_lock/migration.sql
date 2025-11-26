-- CreateTable
CREATE TABLE "DiscordBotLock" (
    "id" TEXT NOT NULL DEFAULT 'discord-bot',
    "instanceId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordBotLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordBotLock_expiresAt_idx" ON "DiscordBotLock"("expiresAt");
