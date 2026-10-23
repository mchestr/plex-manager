-- AlterTable
ALTER TABLE "Setup" ADD COLUMN     "claimCodeHash" TEXT,
ADD COLUMN     "claimCodeIssuedAt" TIMESTAMP(3),
ADD COLUMN     "claimId" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3);
