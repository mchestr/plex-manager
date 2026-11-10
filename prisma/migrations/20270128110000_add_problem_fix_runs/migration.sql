-- AlterTable
ALTER TABLE "ProblemReport" ADD COLUMN     "action" TEXT,
ADD COLUMN     "runToken" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProblemReportSettings" ADD COLUMN     "breakerTrippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProblemFixLedger" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reporterId" TEXT,
    "actorUserId" TEXT,
    "reportId" TEXT,
    "outcome" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ProblemFixLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProblemFixLedger_target_startedAt_idx" ON "ProblemFixLedger"("target", "startedAt");

-- CreateIndex
CREATE INDEX "ProblemFixLedger_reporterId_startedAt_idx" ON "ProblemFixLedger"("reporterId", "startedAt");

-- CreateIndex
CREATE INDEX "ProblemFixLedger_startedAt_idx" ON "ProblemFixLedger"("startedAt");

-- AddForeignKey
ALTER TABLE "ProblemFixLedger" ADD CONSTRAINT "ProblemFixLedger_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemFixLedger" ADD CONSTRAINT "ProblemFixLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemFixLedger" ADD CONSTRAINT "ProblemFixLedger_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
