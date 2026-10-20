-- StripeEvent: an event counts as handled only once processedAt is set, after
-- its handler succeeded (SEC-40). Every existing row was recorded under the old
-- rule, so it keeps its processedAt and gets it as receivedAt too.
ALTER TABLE "StripeEvent" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "StripeEvent" SET "receivedAt" = "processedAt", "attempts" = 1;

-- Without its default, the job's upsert-create leaves processedAt null until the
-- handler has run.
ALTER TABLE "StripeEvent" ALTER COLUMN "processedAt" DROP NOT NULL,
ALTER COLUMN "processedAt" DROP DEFAULT;

-- Subscription: the created time of the newest Stripe event applied to the row,
-- so an older event never overwrites a newer one (SEC-37).
ALTER TABLE "Subscription" ADD COLUMN     "stripeEventAt" TIMESTAMP(3);
