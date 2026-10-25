-- Billing statuses collapse into one "Exempt" state. The reason column becomes
-- a free-text note that carries no behavior; who is exempt ("isExempt") is not
-- touched.
ALTER TABLE "User" RENAME COLUMN "exemptReason" TO "exemptNote";

-- "comp" and "grandfathered" say nothing the admin can use, so they go.
-- "invite" becomes a readable note. Any other value was typed by an admin and stays.
UPDATE "User" SET "exemptNote" = NULL WHERE "exemptNote" IN ('comp', 'grandfathered');
UPDATE "User" SET "exemptNote" = 'Joined by invite' WHERE "exemptNote" = 'invite';
