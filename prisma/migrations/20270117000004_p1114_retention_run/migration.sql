-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "lastRetentionRunAt" TIMESTAMP(3),
ADD COLUMN     "lastRetentionSummary" JSONB;
