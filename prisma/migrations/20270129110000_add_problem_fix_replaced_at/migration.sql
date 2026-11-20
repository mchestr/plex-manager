-- AlterTable
ALTER TABLE "ProblemFixLedger" ADD COLUMN     "replacedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProblemFixLedger_replacedAt_idx" ON "ProblemFixLedger"("replacedAt");
