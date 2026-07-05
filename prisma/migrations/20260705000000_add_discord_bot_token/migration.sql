-- AlterTable
ALTER TABLE "DiscordIntegration" ADD COLUMN     "botToken" TEXT,
ADD COLUMN     "supportChannelId" TEXT,
ADD COLUMN     "supportThreadIds" JSONB,
ADD COLUMN     "configVersion" INTEGER NOT NULL DEFAULT 0;
