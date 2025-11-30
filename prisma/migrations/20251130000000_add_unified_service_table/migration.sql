-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('PLEX', 'TAUTULLI', 'OVERSEERR', 'SONARR', 'RADARR', 'LLM_PROVIDER', 'DISCORD');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "publicUrl" TEXT,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_type_isActive_idx" ON "Service"("type", "isActive");

-- CreateIndex
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");

-- AlterTable - Add new foreign key columns to MaintenanceRule
ALTER TABLE "MaintenanceRule" ADD COLUMN "radarrServiceId" TEXT;
ALTER TABLE "MaintenanceRule" ADD COLUMN "sonarrServiceId" TEXT;

-- AddForeignKey
ALTER TABLE "MaintenanceRule" ADD CONSTRAINT "MaintenanceRule_radarrServiceId_fkey" FOREIGN KEY ("radarrServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRule" ADD CONSTRAINT "MaintenanceRule_sonarrServiceId_fkey" FOREIGN KEY ("sonarrServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Data Migration: Migrate existing services to unified Service table
-- ============================================

-- Migrate PlexServer records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'PLEX'::"ServiceType",
    name,
    url,
    "publicUrl",
    jsonb_build_object(
        'token', token,
        'adminPlexUserId', "adminPlexUserId"
    ),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "PlexServer";

-- Migrate Tautulli records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'TAUTULLI'::"ServiceType",
    name,
    url,
    "publicUrl",
    jsonb_build_object('apiKey', "apiKey"),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "Tautulli";

-- Migrate Overseerr records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'OVERSEERR'::"ServiceType",
    name,
    url,
    "publicUrl",
    jsonb_build_object('apiKey', "apiKey"),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "Overseerr";

-- Migrate Sonarr records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'SONARR'::"ServiceType",
    name,
    url,
    "publicUrl",
    jsonb_build_object('apiKey', "apiKey"),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "Sonarr";

-- Migrate Radarr records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'RADARR'::"ServiceType",
    name,
    url,
    "publicUrl",
    jsonb_build_object('apiKey', "apiKey"),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "Radarr";

-- Migrate LLMProvider records
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'LLM_PROVIDER'::"ServiceType",
    CONCAT(provider, ' (', purpose, ')') as name,
    NULL,
    NULL,
    jsonb_build_object(
        'provider', provider,
        'purpose', purpose,
        'apiKey', "apiKey",
        'model', model,
        'temperature', temperature,
        'maxTokens', "maxTokens"
    ),
    "isActive",
    "createdAt",
    "updatedAt"
FROM "LLMProvider";

-- Migrate DiscordIntegration record (singleton with id="discord")
INSERT INTO "Service" ("id", "type", "name", "url", "publicUrl", "config", "isActive", "createdAt", "updatedAt")
SELECT
    id,
    'DISCORD'::"ServiceType",
    "platformName",
    NULL,
    NULL,
    jsonb_build_object(
        'clientId', "clientId",
        'clientSecret', "clientSecret",
        'guildId', "guildId",
        'serverInviteCode', "serverInviteCode",
        'platformName', "platformName",
        'instructions', instructions,
        'isEnabled', "isEnabled",
        'botEnabled', "botEnabled"
    ),
    true, -- Discord doesn't have isActive, always true in Service
    "createdAt",
    "updatedAt"
FROM "DiscordIntegration";

-- ============================================
-- Migrate MaintenanceRule foreign keys to new Service table
-- ============================================

-- Copy sonarrId to sonarrServiceId (they share the same IDs since we preserved them)
UPDATE "MaintenanceRule"
SET "sonarrServiceId" = "sonarrId"
WHERE "sonarrId" IS NOT NULL;

-- Copy radarrId to radarrServiceId (they share the same IDs since we preserved them)
UPDATE "MaintenanceRule"
SET "radarrServiceId" = "radarrId"
WHERE "radarrId" IS NOT NULL;
