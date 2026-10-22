-- P10.2: the LLM usage list groups before paginating. A row's group is its
-- chat conversation, or the row alone (backfilled with its id; new rows get a UUID).
ALTER TABLE "LLMUsage" ADD COLUMN "groupKey" TEXT;

UPDATE "LLMUsage" SET "groupKey" = COALESCE("chatConversationId", "id");

ALTER TABLE "LLMUsage" ALTER COLUMN "groupKey" SET NOT NULL;

-- CreateIndex
CREATE INDEX "LLMUsage_groupKey_createdAt_idx" ON "LLMUsage"("groupKey", "createdAt");
