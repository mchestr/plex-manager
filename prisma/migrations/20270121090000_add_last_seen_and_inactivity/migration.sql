-- Last seen and the inactivity sweep: each member's last play read from
-- Tautulli, a per-member exclusion, the sweep's settings row and its run
-- history. The audit log gets an index per actor and a per-member index
-- ordered by time for Admin > Audit log and the member Audit tab.

-- DropIndex
DROP INDEX "AuditLog_targetUserId_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "inactivityExcluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "InactivitySettings" (
    "id" TEXT NOT NULL DEFAULT 'inactivity',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "thresholdDays" INTEGER NOT NULL DEFAULT 180,
    "runStartedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "InactivitySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InactivityRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "trigger" TEXT NOT NULL,
    "tautulliUsers" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "qualified" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "blocked" TEXT,
    "error" TEXT,
    "entries" JSONB NOT NULL,

    CONSTRAINT "InactivityRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InactivityRun_startedAt_idx" ON "InactivityRun"("startedAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");
