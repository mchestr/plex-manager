-- CreateEnum
CREATE TYPE "ConversationReviewStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "ConversationReviewTrigger" AS ENUM ('manual', 'nightly');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('wrong_fact', 'unsupported_claim', 'missing_capability', 'wrong_tool', 'unneeded_refusal', 'misread_question');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('open', 'fixed', 'wont_fix', 'false_alarm');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('tool_result', 'earlier_message', 'catalog', 'none');

-- CreateEnum
CREATE TYPE "EvidenceCheck" AS ENUM ('verified', 'unverified', 'not_applicable');

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "reviewLockedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ChatConversationMessage" ADD COLUMN     "toolLog" TEXT;

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "judgeMinTurns" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "judgeNightlyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "judgeSampleRate" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "llmDailyCapJudgeUsd" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "LLMUsage" ADD COLUMN     "conversationReviewId" TEXT;

-- CreateTable
CREATE TABLE "ConversationReview" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "ConversationReviewStatus" NOT NULL DEFAULT 'queued',
    "trigger" "ConversationReviewTrigger" NOT NULL,
    "requestedById" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "reviewedThrough" TIMESTAMP(3),
    "summary" TEXT,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "runToken" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ConversationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationFinding" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" "FindingType" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "claim" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "tool" TEXT,
    "evidenceSource" "EvidenceSource" NOT NULL,
    "evidenceCheck" "EvidenceCheck" NOT NULL DEFAULT 'unverified',
    "fingerprint" TEXT NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FindingStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "triagedById" TEXT,
    "triagedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationReview_conversationId_createdAt_idx" ON "ConversationReview"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationReview_status_idx" ON "ConversationReview"("status");

-- CreateIndex
CREATE INDEX "ConversationFinding_status_createdAt_idx" ON "ConversationFinding"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationFinding_type_status_idx" ON "ConversationFinding"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationFinding_conversationId_fingerprint_key" ON "ConversationFinding"("conversationId", "fingerprint");

-- CreateIndex
CREATE INDEX "LLMUsage_conversationReviewId_createdAt_idx" ON "LLMUsage"("conversationReviewId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConversationReview" ADD CONSTRAINT "ConversationReview_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationReview" ADD CONSTRAINT "ConversationReview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFinding" ADD CONSTRAINT "ConversationFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ConversationReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFinding" ADD CONSTRAINT "ConversationFinding_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFinding" ADD CONSTRAINT "ConversationFinding_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationFinding" ADD CONSTRAINT "ConversationFinding_triagedById_fkey" FOREIGN KEY ("triagedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LLMUsage" ADD CONSTRAINT "LLMUsage_conversationReviewId_fkey" FOREIGN KEY ("conversationReviewId") REFERENCES "ConversationReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
