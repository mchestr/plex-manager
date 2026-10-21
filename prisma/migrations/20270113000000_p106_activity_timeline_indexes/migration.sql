-- P10.6: the admin activity timeline reads each source keyset-paged by user and time.

-- CreateIndex
CREATE INDEX "UserMediaMark_userId_markedAt_idx" ON "UserMediaMark"("userId", "markedAt");

-- CreateIndex
CREATE INDEX "DiscordCommandLog_userId_createdAt_idx" ON "DiscordCommandLog"("userId", "createdAt");
