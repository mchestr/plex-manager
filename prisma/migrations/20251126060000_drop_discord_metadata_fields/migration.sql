-- Drop unused DiscordIntegration metadata columns now that keys/values are hard-coded in code
ALTER TABLE "DiscordIntegration"
  DROP COLUMN IF EXISTS "metadataKey",
  DROP COLUMN IF EXISTS "metadataValue";


