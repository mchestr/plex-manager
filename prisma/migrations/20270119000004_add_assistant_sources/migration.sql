-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authHeaderName" TEXT,
    "authHeaderSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabledTools" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT 'main',
    "path" TEXT NOT NULL DEFAULT '',
    "token" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpServer_name_key" ON "McpServer"("name");

-- CreateIndex
CREATE INDEX "McpServer_isActive_idx" ON "McpServer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_name_key" ON "KnowledgeSource"("name");

-- CreateIndex
CREATE INDEX "KnowledgeSource_isActive_idx" ON "KnowledgeSource"("isActive");

