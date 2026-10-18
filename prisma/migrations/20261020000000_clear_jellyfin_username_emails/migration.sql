-- Jellyfin sign-in used to store the Jellyfin username as User.email when it
-- looked like an address, and later linked other sign-ins to a row by email
-- (SEC-08). Any Jellyfin user can rename themselves to someone else's address,
-- so the email of a Jellyfin-only row may be unverified and someone else's.
-- Clear it so it can no longer block that person's Plex sign-in, absorb their
-- invite or match their Overseerr data.
--
-- Rows that also hold a Plex ID are left alone: their email is usually the
-- verified Plex address, which the Stripe grant and Checkout rely on. An
-- earlier release may still have written a Jellyfin username over it, so the
-- README's upgrade steps have the owner review every Plex+Jellyfin row before
-- deploying and clear any email that is not that member's own.
--
-- This deletes data: take a database dump before deploying.
UPDATE "User"
SET "email" = NULL
WHERE "jellyfinUserId" IS NOT NULL
  AND "plexUserId" IS NULL
  AND "email" IS NOT NULL;
