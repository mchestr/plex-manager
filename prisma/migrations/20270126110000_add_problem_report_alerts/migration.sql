-- AlterTable
ALTER TABLE "ProblemReport" ADD COLUMN     "alertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "swapsNeedApproval" BOOLEAN NOT NULL DEFAULT false;
