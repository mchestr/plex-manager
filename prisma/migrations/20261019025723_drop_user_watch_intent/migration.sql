/*
  Warnings:

  - You are about to drop the `UserWatchIntent` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable (also drops its foreign key to "User")
DROP TABLE "UserWatchIntent";

-- DropEnum
DROP TYPE "IntentType";
