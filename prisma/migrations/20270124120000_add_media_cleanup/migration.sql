-- CreateTable
CREATE TABLE "CleanupSettings" (
    "id" TEXT NOT NULL DEFAULT 'cleanup',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedBy" TEXT,
    "holdUntil" TEXT,
    "runClaimAt" TIMESTAMP(3),
    "readClaimAt" TIMESTAMP(3),
    "collectionsClaimAt" TIMESTAMP(3),
    "collectionsDirtyAt" TIMESTAMP(3),
    "options" JSONB NOT NULL DEFAULT '{}',
    "runtime" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CleanupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'dryRun',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "origin" JSONB,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "turnedOnAt" TIMESTAMP(3),
    "lastDryRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CleanupRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupItem" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "ratingKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "seasonNumber" INTEGER,
    "episodeCount" INTEGER,
    "seasonCount" INTEGER,
    "sizeBytes" BIGINT NOT NULL,
    "arr" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "ruleIds" TEXT[],
    "action" TEXT NOT NULL,
    "importListExclusion" BOOLEAN NOT NULL DEFAULT false,
    "needsApproval" BOOLEAN NOT NULL DEFAULT false,
    "heldAt" TIMESTAMP(3),
    "enteredAt" TIMESTAMP(3),
    "leaveOn" TEXT,
    "firstLeaveOn" TEXT,
    "postponedAt" TIMESTAMP(3),
    "postponedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "holdCode" TEXT,
    "deferredAt" TIMESTAMP(3),
    "failCode" TEXT,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "why" JSONB NOT NULL,
    "lastRunId" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleanupItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupOutcome" (
    "id" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "ratingKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "seasonNumber" INTEGER,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" JSONB,
    "ruleIds" TEXT[],
    "action" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "freedBytes" BIGINT NOT NULL DEFAULT 0,
    "alreadyGone" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "enteredAt" TIMESTAMP(3),
    "leaveOn" TEXT,
    "why" JSONB,
    "runId" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleanupOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupProtection" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "seasonNumber" INTEGER,
    "sectionId" TEXT,
    "ratingKey" TEXT,
    "externalIds" JSONB,
    "memberId" TEXT,
    "createdBy" TEXT NOT NULL,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "endedByUserId" TEXT,
    "activeKey" TEXT,
    "restore" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleanupProtection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorId" TEXT,
    "snapshotId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ruleIds" TEXT[],
    "checked" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "joined" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "rescued" INTEGER NOT NULL DEFAULT 0,
    "deleted" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "deferred" INTEGER NOT NULL DEFAULT 0,
    "freedBytes" BIGINT NOT NULL DEFAULT 0,
    "outcome" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "entries" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "CleanupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupSnapshot" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sources" JSONB NOT NULL DEFAULT '[]',
    "facts" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CleanupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanupSnapshotPart" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,

    CONSTRAINT "CleanupSnapshotPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleanupRule_name_key" ON "CleanupRule"("name");

-- CreateIndex
CREATE INDEX "CleanupRule_mode_idx" ON "CleanupRule"("mode");

-- CreateIndex
CREATE UNIQUE INDEX "CleanupItem_itemKey_key" ON "CleanupItem"("itemKey");

-- CreateIndex
CREATE INDEX "CleanupItem_state_leaveOn_idx" ON "CleanupItem"("state", "leaveOn");

-- CreateIndex
CREATE INDEX "CleanupItem_sectionId_state_idx" ON "CleanupItem"("sectionId", "state");

-- CreateIndex
CREATE INDEX "CleanupItem_titleKey_idx" ON "CleanupItem"("titleKey");

-- CreateIndex
CREATE INDEX "CleanupItem_ruleIds_idx" ON "CleanupItem" USING GIN ("ruleIds");

-- CreateIndex
CREATE INDEX "CleanupOutcome_kind_actedAt_idx" ON "CleanupOutcome"("kind", "actedAt");

-- CreateIndex
CREATE INDEX "CleanupOutcome_actedAt_idx" ON "CleanupOutcome"("actedAt");

-- CreateIndex
CREATE INDEX "CleanupOutcome_itemKey_actedAt_idx" ON "CleanupOutcome"("itemKey", "actedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CleanupProtection_activeKey_key" ON "CleanupProtection"("activeKey");

-- CreateIndex
CREATE INDEX "CleanupProtection_memberId_status_idx" ON "CleanupProtection"("memberId", "status");

-- CreateIndex
CREATE INDEX "CleanupProtection_kind_status_idx" ON "CleanupProtection"("kind", "status");

-- CreateIndex
CREATE INDEX "CleanupProtection_itemKey_idx" ON "CleanupProtection"("itemKey");

-- CreateIndex
CREATE INDEX "CleanupProtection_titleKey_idx" ON "CleanupProtection"("titleKey");

-- CreateIndex
CREATE INDEX "CleanupRun_startedAt_idx" ON "CleanupRun"("startedAt");

-- CreateIndex
CREATE INDEX "CleanupRun_kind_startedAt_idx" ON "CleanupRun"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "CleanupSnapshot_status_finishedAt_idx" ON "CleanupSnapshot"("status", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CleanupSnapshotPart_snapshotId_level_key" ON "CleanupSnapshotPart"("snapshotId", "level");

-- AddForeignKey
ALTER TABLE "CleanupProtection" ADD CONSTRAINT "CleanupProtection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanupSnapshotPart" ADD CONSTRAINT "CleanupSnapshotPart_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CleanupSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
