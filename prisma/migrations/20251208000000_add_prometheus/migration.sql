-- CreateTable
CREATE TABLE "Prometheus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prometheus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prometheus_isActive_idx" ON "Prometheus"("isActive");
