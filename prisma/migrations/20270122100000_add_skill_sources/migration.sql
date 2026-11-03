-- CreateTable
CREATE TABLE "SkillSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT 'main',
    "path" TEXT NOT NULL DEFAULT '',
    "token" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillSource_name_key" ON "SkillSource"("name");

-- CreateIndex
CREATE INDEX "SkillSource_isActive_idx" ON "SkillSource"("isActive");
