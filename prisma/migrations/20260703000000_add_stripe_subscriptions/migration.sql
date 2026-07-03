-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'UNPAID');

-- AlterTable
ALTER TABLE "Config" ADD COLUMN     "stripeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePriceIds" JSONB,
ADD COLUMN     "stripeSecretKey" TEXT,
ADD COLUMN     "stripeWebhookSecret" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "exemptReason" TEXT,
ADD COLUMN     "isExempt" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing users: every pre-existing User row belongs to someone who
-- already had server access (a User row is only created after access is verified),
-- so mark them exempt from the subscription requirement. New users default to
-- isExempt = false (unchanged column default above). Safe on an empty table.
UPDATE "User" SET "isExempt" = true, "exemptReason" = 'grandfathered';

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "priceId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "plexInviteStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");

-- CreateIndex
CREATE INDEX "User_isExempt_idx" ON "User"("isExempt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
