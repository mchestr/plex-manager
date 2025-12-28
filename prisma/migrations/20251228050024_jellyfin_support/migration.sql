/*
  Warnings:

  - A unique constraint covering the columns `[jellyfinUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('PLEX', 'JELLYFIN');

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "jellyfinLibraryIds" TEXT,
ADD COLUMN     "serverType" "ServerType" NOT NULL DEFAULT 'PLEX';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jellyfinUserId" TEXT;

-- CreateTable
CREATE TABLE "JellyfinServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "adminUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JellyfinServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JellyfinServer_isActive_idx" ON "JellyfinServer"("isActive");

-- CreateIndex
CREATE INDEX "JellyfinServer_adminUserId_idx" ON "JellyfinServer"("adminUserId");

-- CreateIndex
CREATE INDEX "Invite_serverType_idx" ON "Invite"("serverType");

-- CreateIndex
CREATE UNIQUE INDEX "User_jellyfinUserId_key" ON "User"("jellyfinUserId");

-- CreateIndex
CREATE INDEX "User_jellyfinUserId_idx" ON "User"("jellyfinUserId");
