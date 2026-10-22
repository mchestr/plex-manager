-- CreateTable
CREATE TABLE "LeaseLock" (
    "name" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRenewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseLock_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "LeaseLock_expiresAt_idx" ON "LeaseLock"("expiresAt");
