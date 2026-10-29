-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('ADMIN', 'AFFILIATE');

-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED', 'REVOKED', 'ENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AffiliateEndCause" AS ENUM ('DISABLED', 'REMOVED', 'UNSHARED', 'ACCESS_REVOKED');

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "affiliateBlockKey" TEXT,
ADD COLUMN     "affiliateInvitesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "affiliateLibrarySectionIds" JSONB,
ADD COLUMN     "affiliatePlexMachineId" TEXT,
ADD COLUMN     "affiliateServerCap" INTEGER DEFAULT 10,
ADD COLUMN     "affiliateTiers" JSONB;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "affiliateUserId" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "joinedUserId" TEXT,
ADD COLUMN     "kind" "InviteKind" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "label" VARCHAR(60);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessEndedAt" TIMESTAMP(3),
ADD COLUMN     "watchHours" DOUBLE PRECISION,
ADD COLUMN     "watchHoursLast30Days" DOUBLE PRECISION,
ADD COLUMN     "watchHoursReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AffiliateApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openUserId" TEXT,
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(500),
    "hoursAtApply" DOUBLE PRECISION NOT NULL,
    "plexEmailShared" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "reason" VARCHAR(500),
    "endedAt" TIMESTAMP(3),
    "endCause" "AffiliateEndCause",
    "inviteOverride" INTEGER,
    "tierIndex" INTEGER,
    "tierRaisedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateBlock" (
    "id" TEXT NOT NULL,
    "plexIdHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "AffiliateBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateApplication_openUserId_key" ON "AffiliateApplication"("openUserId");

-- CreateIndex
CREATE INDEX "AffiliateApplication_status_appliedAt_idx" ON "AffiliateApplication"("status", "appliedAt");

-- CreateIndex
CREATE INDEX "AffiliateApplication_userId_decidedAt_idx" ON "AffiliateApplication"("userId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateBlock_plexIdHash_key" ON "AffiliateBlock"("plexIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_joinedUserId_key" ON "Invite"("joinedUserId");

-- CreateIndex
CREATE INDEX "Invite_kind_affiliateUserId_joinedAt_idx" ON "Invite"("kind", "affiliateUserId", "joinedAt");

-- CreateIndex
CREATE INDEX "Invite_kind_joinedAt_idx" ON "Invite"("kind", "joinedAt");

-- CreateIndex
CREATE INDEX "Invite_kind_expiresAt_idx" ON "Invite"("kind", "expiresAt");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_affiliateUserId_fkey" FOREIGN KEY ("affiliateUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_joinedUserId_fkey" FOREIGN KEY ("joinedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AffiliateApplication" ADD CONSTRAINT "AffiliateApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

