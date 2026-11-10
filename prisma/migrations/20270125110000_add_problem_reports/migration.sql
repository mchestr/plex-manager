-- CreateEnum
CREATE TYPE "ProblemReportStatus" AS ENUM ('SENT', 'FIXING', 'FIXED', 'WITH_ADMIN', 'CLOSED');

-- CreateTable
CREATE TABLE "ProblemReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "note" VARCHAR(500),
    "mediaType" "MediaType" NOT NULL,
    "plexRatingKey" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "showTitle" TEXT,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    "activeKey" TEXT,
    "status" "ProblemReportStatus" NOT NULL DEFAULT 'SENT',
    "memberNote" VARCHAR(500),
    "adminNote" VARCHAR(2000),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReportEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemReportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemReportSettings" (
    "id" TEXT NOT NULL DEFAULT 'problem-reports',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ProblemReportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProblemReport_activeKey_key" ON "ProblemReport"("activeKey");

-- CreateIndex
CREATE INDEX "ProblemReport_status_createdAt_idx" ON "ProblemReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_reporterId_createdAt_idx" ON "ProblemReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemReport_titleKey_idx" ON "ProblemReport"("titleKey");

-- CreateIndex
CREATE INDEX "ProblemReportEvent_reportId_createdAt_idx" ON "ProblemReportEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "ProblemReportEvent_actorUserId_idx" ON "ProblemReportEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "ProblemReport" ADD CONSTRAINT "ProblemReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportEvent" ADD CONSTRAINT "ProblemReportEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProblemReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemReportEvent" ADD CONSTRAINT "ProblemReportEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
