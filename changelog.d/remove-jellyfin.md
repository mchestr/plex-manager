### Upgrade notes

- **Jellyfin removed (breaking):** Plex Manager is now Plex only. Keep the backup you take before the upgrade: the migration `20270123100000_remove_jellyfin` deletes data and cannot be undone. It deletes every Jellyfin invite and its usages, sets the joined-with service of each member who joined with Jellyfin to Plex when they also have a Plex account (else to none), and drops the `JellyfinServer` table, `User.jellyfinUserId`, `Invite.jellyfinLibraryIds` and `Subscription.jellyfinAccessStatus`. A member who has only a Jellyfin account keeps their row, Rewinds and history but can no longer sign in; remove them under **Admin > Members > Users** if they should go. The Jellyfin accounts and libraries on your Jellyfin server are not touched.
- **Variable no longer read:** `JELLYFIN_DEVICE_ID`. Remove it from `.env`.

### Removed

- **Jellyfin:** Jellyfin sign-in, Jellyfin invites, the Jellyfin connection in **Admin > Settings**, turning Jellyfin accounts on and off with a Stripe subscription, member removal disabling Jellyfin accounts, and the Jellyfin instructions in onboarding and the Discord bot.
