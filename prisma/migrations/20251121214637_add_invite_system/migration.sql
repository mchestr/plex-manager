-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "librarySectionIds" TEXT,
    "allowDownloads" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "InviteUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteUsage_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "Invite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InviteUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_code_key" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "Invite_code_idx" ON "Invite"("code");

-- CreateIndex
CREATE INDEX "InviteUsage_inviteId_idx" ON "InviteUsage"("inviteId");

-- CreateIndex
CREATE INDEX "InviteUsage_userId_idx" ON "InviteUsage"("userId");

