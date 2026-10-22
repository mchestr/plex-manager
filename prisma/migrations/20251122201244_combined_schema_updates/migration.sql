-- ============================================================================
-- Combined Migration: Schema Updates
-- Combines: add_public_url_fields, add_sonarr_radarr_tables,
--           replace_protocol_hostname_port_with_url, add_purpose_to_llm_provider,
--           drop_default
-- ============================================================================

-- Step 1: Add publicUrl column to existing tables
ALTER TABLE "Overseerr" ADD COLUMN IF NOT EXISTS "publicUrl" TEXT;
ALTER TABLE "PlexServer" ADD COLUMN IF NOT EXISTS "publicUrl" TEXT;
ALTER TABLE "Tautulli" ADD COLUMN IF NOT EXISTS "publicUrl" TEXT;

-- Step 2: Create Sonarr and Radarr tables directly with url (not hostname/port/protocol)
CREATE TABLE IF NOT EXISTS "Sonarr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "Radarr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "Sonarr_isActive_idx" ON "Sonarr"("isActive");
CREATE INDEX IF NOT EXISTS "Radarr_isActive_idx" ON "Radarr"("isActive");

-- Step 3: Convert existing tables from hostname/port/protocol to url
-- PlexServer
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema()
    AND table_name = 'PlexServer'
    AND column_name = 'hostname'
  ) THEN
    -- Add url column with default
    ALTER TABLE "PlexServer" ADD COLUMN IF NOT EXISTS "url" TEXT DEFAULT 'http://localhost';

    -- Migrate existing data
    UPDATE "PlexServer" SET "url" = CASE
      WHEN "protocol" IS NULL OR "hostname" IS NULL THEN 'http://localhost'
      WHEN ("protocol" = 'https' AND "port" = 443) OR ("protocol" = 'http' AND "port" = 80) THEN
        "protocol" || '://' || "hostname"
      ELSE
        "protocol" || '://' || "hostname" || ':' || COALESCE("port"::text, '80')
    END
    WHERE "url" = 'http://localhost' OR "url" IS NULL;

    -- Make url NOT NULL
    ALTER TABLE "PlexServer" ALTER COLUMN "url" SET NOT NULL;

    -- Drop old columns
    ALTER TABLE "PlexServer" DROP COLUMN IF EXISTS "hostname";
    ALTER TABLE "PlexServer" DROP COLUMN IF EXISTS "port";
    ALTER TABLE "PlexServer" DROP COLUMN IF EXISTS "protocol";
  END IF;
END $$;

-- Tautulli
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema()
    AND table_name = 'Tautulli'
    AND column_name = 'hostname'
  ) THEN
    ALTER TABLE "Tautulli" ADD COLUMN IF NOT EXISTS "url" TEXT DEFAULT 'http://localhost';

    UPDATE "Tautulli" SET "url" = CASE
      WHEN "protocol" IS NULL OR "hostname" IS NULL THEN 'http://localhost'
      WHEN ("protocol" = 'https' AND "port" = 443) OR ("protocol" = 'http' AND "port" = 80) THEN
        "protocol" || '://' || "hostname"
      ELSE
        "protocol" || '://' || "hostname" || ':' || COALESCE("port"::text, '80')
    END
    WHERE "url" = 'http://localhost' OR "url" IS NULL;

    ALTER TABLE "Tautulli" ALTER COLUMN "url" SET NOT NULL;

    ALTER TABLE "Tautulli" DROP COLUMN IF EXISTS "hostname";
    ALTER TABLE "Tautulli" DROP COLUMN IF EXISTS "port";
    ALTER TABLE "Tautulli" DROP COLUMN IF EXISTS "protocol";
  END IF;
END $$;

-- Overseerr
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = current_schema()
    AND table_name = 'Overseerr'
    AND column_name = 'hostname'
  ) THEN
    ALTER TABLE "Overseerr" ADD COLUMN IF NOT EXISTS "url" TEXT DEFAULT 'http://localhost';

    UPDATE "Overseerr" SET "url" = CASE
      WHEN "protocol" IS NULL OR "hostname" IS NULL THEN 'http://localhost'
      WHEN ("protocol" = 'https' AND "port" = 443) OR ("protocol" = 'http' AND "port" = 80) THEN
        "protocol" || '://' || "hostname"
      ELSE
        "protocol" || '://' || "hostname" || ':' || COALESCE("port"::text, '80')
    END
    WHERE "url" = 'http://localhost' OR "url" IS NULL;

    ALTER TABLE "Overseerr" ALTER COLUMN "url" SET NOT NULL;

    ALTER TABLE "Overseerr" DROP COLUMN IF EXISTS "hostname";
    ALTER TABLE "Overseerr" DROP COLUMN IF EXISTS "port";
    ALTER TABLE "Overseerr" DROP COLUMN IF EXISTS "protocol";
  END IF;
END $$;

-- Step 4: Add purpose column to LLMProvider
ALTER TABLE "LLMProvider" ADD COLUMN IF NOT EXISTS "purpose" TEXT DEFAULT 'wrapped';

-- Set default purpose for existing providers
UPDATE "LLMProvider" SET "purpose" = 'wrapped' WHERE "purpose" IS NULL;

-- Make purpose required
ALTER TABLE "LLMProvider" ALTER COLUMN "purpose" SET NOT NULL;

-- Make model required (ensure all existing rows have a model before making it NOT NULL)
UPDATE "LLMProvider" SET "model" = 'gpt-4o-mini' WHERE "model" IS NULL;
ALTER TABLE "LLMProvider" ALTER COLUMN "model" SET NOT NULL;

-- Add unique constraint on (purpose, isActive) - only one active provider per purpose
-- First, ensure we don't have multiple active providers with same purpose
UPDATE "LLMProvider" SET "isActive" = false
WHERE "isActive" = true
AND id NOT IN (
  SELECT DISTINCT ON ("purpose") id
  FROM "LLMProvider"
  WHERE "isActive" = true
  ORDER BY "purpose", "updatedAt" DESC
);

-- Add unique constraint (drop if exists first)
DROP INDEX IF EXISTS "LLMProvider_purpose_isActive_key";
CREATE UNIQUE INDEX "LLMProvider_purpose_isActive_key" ON "LLMProvider"("purpose", "isActive") WHERE "isActive" = true;

-- Add index on purpose
CREATE INDEX IF NOT EXISTS "LLMProvider_purpose_idx" ON "LLMProvider"("purpose");

-- Step 5: Drop defaults (no longer needed after migration)
ALTER TABLE "LLMProvider" ALTER COLUMN "purpose" DROP DEFAULT;
ALTER TABLE "Overseerr" ALTER COLUMN "url" DROP DEFAULT;
ALTER TABLE "PlexServer" ALTER COLUMN "url" DROP DEFAULT;
ALTER TABLE "Radarr" ALTER COLUMN "url" DROP DEFAULT;
ALTER TABLE "Sonarr" ALTER COLUMN "url" DROP DEFAULT;
ALTER TABLE "Tautulli" ALTER COLUMN "url" DROP DEFAULT;

