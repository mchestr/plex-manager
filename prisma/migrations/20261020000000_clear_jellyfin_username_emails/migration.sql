-- Jellyfin sign-in used to store the Jellyfin username as User.email when it
-- looked like an address, and later linked other sign-ins to that row by
-- email (SEC-08). A row with a Jellyfin ID and no Plex ID can only have
-- gained its email that way, so the address is unverified and may belong to
-- someone else. Clear it so it can no longer block or absorb that person's
-- Plex account. This deletes data: take a database dump before deploying.
UPDATE "User"
SET "email" = NULL
WHERE "jellyfinUserId" IS NOT NULL
  AND "plexUserId" IS NULL
  AND "email" IS NOT NULL;
