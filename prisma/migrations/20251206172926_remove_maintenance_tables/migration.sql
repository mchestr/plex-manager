/*
  Warnings:

  - You are about to drop the `MaintenanceCandidate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaintenanceDeletionLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaintenanceRule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MaintenanceScan` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "DiscordCommandType" ADD VALUE 'HELP';

-- DropForeignKey
ALTER TABLE "MaintenanceCandidate" DROP CONSTRAINT "MaintenanceCandidate_scanId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRule" DROP CONSTRAINT "MaintenanceRule_radarrId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceRule" DROP CONSTRAINT "MaintenanceRule_sonarrId_fkey";

-- DropForeignKey
ALTER TABLE "MaintenanceScan" DROP CONSTRAINT "MaintenanceScan_ruleId_fkey";

-- DropTable
DROP TABLE "MaintenanceCandidate";

-- DropTable
DROP TABLE "MaintenanceDeletionLog";

-- DropTable
DROP TABLE "MaintenanceRule";

-- DropTable
DROP TABLE "MaintenanceScan";

-- DropEnum
DROP TYPE "ActionType";

-- DropEnum
DROP TYPE "ReviewStatus";

-- DropEnum
DROP TYPE "ScanStatus";
