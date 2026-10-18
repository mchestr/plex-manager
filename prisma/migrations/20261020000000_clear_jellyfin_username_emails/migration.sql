-- Jellyfin sign-in used to store the Jellyfin username as User.email when it
-- looked like an address, on every row it matched by Jellyfin ID, rows linked
-- to a Plex account included, and later linked other sign-ins to a row by
-- email (SEC-08). Any Jellyfin user can rename themselves to someone else's
-- address, so the email of any row with a Jellyfin ID may be unverified and
-- someone else's. Clear it so it can no longer block that person's Plex
-- sign-in, absorb their invite or match their Tautulli and Overseerr data.
-- A row with a Plex ID gets its verified Plex email back on its next Plex
-- sign-in. This deletes data: take a database dump before deploying.
UPDATE "User"
SET "email" = NULL
WHERE "jellyfinUserId" IS NOT NULL
  AND "email" IS NOT NULL;
