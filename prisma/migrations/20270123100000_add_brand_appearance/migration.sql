-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "accentColor" TEXT,
ADD COLUMN     "loginSubtitle" TEXT;

-- CreateTable
CREATE TABLE "BrandAsset" (
    "kind" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("kind")
);
