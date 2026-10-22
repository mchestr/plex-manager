-- Rows whose user is already gone would fail the new constraint: null them first
UPDATE "DiscordCommandLog" SET "userId" = NULL
WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "DiscordCommandLog"."userId");

-- AddForeignKey
ALTER TABLE "DiscordCommandLog" ADD CONSTRAINT "DiscordCommandLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
