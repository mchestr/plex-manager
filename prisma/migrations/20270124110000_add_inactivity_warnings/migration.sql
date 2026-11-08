-- AlterTable
ALTER TABLE "InactivityRun" ADD COLUMN     "newestPlayAt" TIMESTAMP(3),
ADD COLUMN     "warned" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InactivitySettings" ADD COLUMN     "warningDays" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
ADD COLUMN     "warningsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inactivityEmailsOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InactivityNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleAt" TIMESTAMP(3) NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "removeAfter" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runId" TEXT,
    "zone" TEXT NOT NULL,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InactivityNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InactivityNotice_status_updatedAt_idx" ON "InactivityNotice"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "InactivityNotice_createdAt_idx" ON "InactivityNotice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InactivityNotice_userId_cycleAt_removeAfter_leadDays_key" ON "InactivityNotice"("userId", "cycleAt", "removeAfter", "leadDays");

-- AddForeignKey
ALTER TABLE "InactivityNotice" ADD CONSTRAINT "InactivityNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
