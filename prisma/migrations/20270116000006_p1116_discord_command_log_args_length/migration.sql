-- AlterTable
ALTER TABLE "DiscordCommandLog" ADD COLUMN     "argsLength" INTEGER;

-- GAP-32: the command log keeps only the length of what a member typed to the
-- assistant. Existing CHAT rows keep the length of their stored text (capped at
-- 500 characters when it was written) and lose the text itself.
UPDATE "DiscordCommandLog"
SET "argsLength" = char_length("commandArgs"), "commandArgs" = NULL
WHERE "commandType" = 'CHAT' AND "commandArgs" IS NOT NULL;
