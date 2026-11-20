-- CreateEnum
CREATE TYPE "ProblemAutomaticMode" AS ENUM ('OFF', 'DRY_RUN', 'ON');

-- AlterTable
ALTER TABLE "ProblemFixLedger" ADD COLUMN     "titleKey" TEXT;

-- Rows recorded before this migration take their report's title, so the title limits count them
UPDATE "ProblemFixLedger" AS ledger
SET "titleKey" = report."titleKey"
FROM "ProblemReport" AS report
WHERE ledger."reportId" = report."id" AND ledger."titleKey" IS NULL;

-- AlterTable
ALTER TABLE "ProblemReportSettings" ADD COLUMN     "automatic" "ProblemAutomaticMode" NOT NULL DEFAULT 'OFF',
ADD COLUMN     "automaticSince" TIMESTAMP(3),
ADD COLUMN     "dailySwapCap" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "titleCooldownDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "weeklySwaps" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE INDEX "ProblemFixLedger_titleKey_startedAt_idx" ON "ProblemFixLedger"("titleKey", "startedAt");
