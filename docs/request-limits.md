# Discord stat channels and request limits

Two jobs that used to run in Windmill now run on the BullMQ queue. Both are off
until an admin turns them on in Admin > Settings, both need Redis and a worker
(`PROCESS_ROLE=worker` or `all`), and both leave a trail in Admin > Queues.

## Discord stat channels

Renames Discord voice channels with live numbers from Tautulli. It replaces the
Windmill flow `f/mflix/discord_channel_status`.

| Channel | Default name | Source |
|---|---|---|
| Status | `<server name> Status (🟢)` | `get_activity` and `get_libraries` |
| Streams | `Current Streams: N` | `stream_count` |
| Transcodes | `Current Transcodes: N` | `stream_count_transcode` |
| Bandwidth | `Bandwidth: N.N Mbps` | `total_bandwidth / 1000` |
| Movies | `Movies: N` | `count` of `movie` libraries |
| TV shows | `TV Shows: N` | `count` of `show` libraries |
| Episodes | `Episodes: N` | `child_count` of `show` libraries |

- **Status:** both Tautulli calls succeed, 🟢 Online; one, 🟡 Degraded; none, 🔴 Offline.
- **Channels:** paste each channel's ID in Admin > Settings > Discord channel stats (Edit, then Save changes). A stat with no ID is left alone. The bot needs the Manage Channels permission on those channels.
- **Name formats:** `{value}` is the number (an emoji for status) and `{server}` is the server name from the brand settings.
- **Failures:** a failed `get_activity` skips the three activity channels, a failed `get_libraries` skips the three library channels, and a failed rename never stops the next channel.
- **Rate limit:** Discord allows two renames per channel in ten minutes, so the interval is ten minutes or more. A channel is renamed only when its name changed since the last successful rename, and a `429` is left for the next run (a global `429` ends the run).

## Request limits

Sets each member's Overseerr request quota from their all-time Tautulli watch
time, once a day at the hour chosen in the settings (server time zone). It
replaces `f/mflix/sync_overseerr_quotas_from_tautulli_watchtime`.

A tier applies when the member has watched *more than* its hours:

| Tier | Watch time | Movies | Shows | Per |
|---|---|---|---|---|
| 1 | any | 2 | 1 | 7 days |
| 2 | more than 24 h | 4 | 2 | 7 days |
| 3 | more than 50 h | 6 | 3 | 7 days |
| 4 | more than 100 h | 10 | 5 | 7 days |
| 5 | more than 200 h | unlimited (`0`) | unlimited (`0`) | 7 days |

- **Matching:** an Overseerr user's `plexId` is the Tautulli `user_id`. Overseerr users without a Plex id are skipped. Every Overseerr user is read (100 per page), not only the first page.
- **Writes:** `POST /user/{id}/settings/main` runs only when the tier's quota differs from the quota Overseerr has. A limit of 0 is unlimited whatever the period.
- **Excluded members:** turn on "Set request limits by hand" on a member's admin page to keep a quota you set yourself.
- **Last run:** each run is stored (member, hours, tier, old and new quota); the settings page shows the latest, and the newest 30 runs are kept.
- **Members:** the home page shows the tier, the requests used and left (`GET /user/{id}/quota`), the hours to the next tier with a progress bar and the tier table. Discord `/mystats` adds the same figures.

## Moving off Windmill

1. Turn on both jobs (Edit each section, tick its checkbox, Save changes), then press "Update now" and "Run now".
2. Check the channel names and the last run.
3. Disable the two Windmill schedules.
