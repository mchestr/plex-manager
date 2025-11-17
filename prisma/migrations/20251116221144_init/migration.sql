-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "plexUserId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlexServer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 32400,
    "protocol" TEXT NOT NULL DEFAULT 'https',
    "token" TEXT NOT NULL,
    "adminPlexUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tautulli" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8181,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Overseerr" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5055,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LLMProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlexWrapped" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "shareToken" TEXT,
    "summary" TEXT,
    "generatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlexWrapped_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WrappedShareVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrappedId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WrappedShareVisit_wrappedId_fkey" FOREIGN KEY ("wrappedId") REFERENCES "PlexWrapped" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LLMUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wrappedId" TEXT,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "cost" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LLMUsage_wrappedId_fkey" FOREIGN KEY ("wrappedId") REFERENCES "PlexWrapped" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LLMUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'config',
    "llmDisabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_plexUserId_key" ON "User"("plexUserId");

-- CreateIndex
CREATE INDEX "User_plexUserId_idx" ON "User"("plexUserId");

-- CreateIndex
CREATE INDEX "User_isAdmin_idx" ON "User"("isAdmin");

-- CreateIndex
CREATE INDEX "PlexServer_isActive_idx" ON "PlexServer"("isActive");

-- CreateIndex
CREATE INDEX "PlexServer_adminPlexUserId_idx" ON "PlexServer"("adminPlexUserId");

-- CreateIndex
CREATE INDEX "Tautulli_isActive_idx" ON "Tautulli"("isActive");

-- CreateIndex
CREATE INDEX "Overseerr_isActive_idx" ON "Overseerr"("isActive");

-- CreateIndex
CREATE INDEX "LLMProvider_isActive_idx" ON "LLMProvider"("isActive");

-- CreateIndex
CREATE INDEX "LLMProvider_provider_idx" ON "LLMProvider"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlexWrapped_shareToken_key" ON "PlexWrapped"("shareToken");

-- CreateIndex
CREATE INDEX "PlexWrapped_userId_idx" ON "PlexWrapped"("userId");

-- CreateIndex
CREATE INDEX "PlexWrapped_year_idx" ON "PlexWrapped"("year");

-- CreateIndex
CREATE INDEX "PlexWrapped_status_idx" ON "PlexWrapped"("status");

-- CreateIndex
CREATE INDEX "PlexWrapped_shareToken_idx" ON "PlexWrapped"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "PlexWrapped_userId_year_key" ON "PlexWrapped"("userId", "year");

-- CreateIndex
CREATE INDEX "WrappedShareVisit_wrappedId_idx" ON "WrappedShareVisit"("wrappedId");

-- CreateIndex
CREATE INDEX "WrappedShareVisit_createdAt_idx" ON "WrappedShareVisit"("createdAt");

-- CreateIndex
CREATE INDEX "LLMUsage_userId_idx" ON "LLMUsage"("userId");

-- CreateIndex
CREATE INDEX "LLMUsage_wrappedId_idx" ON "LLMUsage"("wrappedId");

-- CreateIndex
CREATE INDEX "LLMUsage_provider_idx" ON "LLMUsage"("provider");

-- CreateIndex
CREATE INDEX "LLMUsage_createdAt_idx" ON "LLMUsage"("createdAt");

