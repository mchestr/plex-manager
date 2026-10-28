# Changelog

Every notable change to Plex Manager, newest first. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). Each release is published as
the image `ghcr.io/mchestr/plex-manager:<version>`; `:latest` tracks `main`.

Every release has an **Upgrade notes** block, and its first step is always to
take a `pg_dump`: Prisma has no down migrations, so rolling back means
restoring the dump taken before the upgrade and running the previous tag. Read
the upgrade notes of every version you skip. `docs/releasing.md` describes how
a release is cut, and `docs/operations.md` how to back up and restore.

Pull requests add their lines under Unreleased. A pull request that touches
`prisma/migrations/**`, `lib/env.ts`, `docker-entrypoint.sh`, `Dockerfile` or
`deploy/**`, or carries the `breaking` label, must add one (the Changelog
check); the `no-changelog` label skips it.

## [Unreleased]

### Changed

- **Rewind times are implicit:** Rewind no longer prints a time zone. The "Times in America/Chicago, the server's time zone" notes are gone from the bookends, clock, short list and centrefold pages, the desktop Notes, article mode, chart and table captions and the clock and centrefold share cards. Times and days are still counted in the member's Rewind zone (their saved zone, else the server's), and nothing on the page names it.
- **Tables on phones and tablets:** the users list and every other admin table, and the marks list on Account, now lay out by the room the table itself has, not the window's width, so the admin sidebar counts. A narrow table shows each row as a card: the name and its actions on top, then every other column under its own label in two columns (four on a tablet), with nothing hidden or unlabelled. The users list shows cards up to about 1,100 px and its table from there, with the Rewind column from 1,440 px; a long email is cut short in the table and shown in full on the card. While a table shows cards, its toolbar offers Filters (in a sheet) and Sort; beside a table, the filters sit in one row that no longer breaks into a block. The page is laid out before it loads, so a phone no longer shows the desktop table first.

### Fixed

- **Assistant times in your own zone:** the admin assistant now gives times in your browser's time zone, both in its answers and under each message, instead of the server zone (UTC when no server zone is set). A browser zone the app does not know falls back to the server zone. Sonarr, Radarr, Overseerr, background job and library times reach it as local times too, and both assistants (web and Discord) now give plain local times without naming a zone or offset.

## [0.5.0] - 2026-10-27

### Added

- **Request limits on the user page:** the Overview tab of a Plex member shows their request tier, checked live: all-time watch time from Tautulli, the tier it earns, the hours to the next tier, and the quota Overseerr has for them now. A badge says whether the two match, and **Update Overseerr** writes the tier's quota for that one member, with the daily sync on or off. A step that fails is named (such as "Could not reach Overseerr"), and Overseerr admins and user managers, whose quotas Overseerr ignores, are marked **No limits**. See `docs/request-limits.md`.
- **App version in System information:** Admin > Settings, System now shows the running version from `package.json`.

### Changed

- **Admin settings open read-only:** each section of Admin > Settings now shows its saved values as a summary, with its status, Test connection and "Last saved", and an Edit button (Set up, when nothing is saved) opens its form in place. Save returns to the summary; Cancel and Escape ask before discarding unsaved changes, one section is edited at a time, and the browser asks before a tab with unsaved changes closes. The AI features, Stripe Subscriptions and Allow Jellyfin sign-in switches still take effect at once (Allow Jellyfin sign-in moved from the Jellyfin form to its row), and the other on/off settings are checkboxes saved with Save.
- **Rewind time zone:** a member's Rewind now reads their own clock by default. The first time a signed-in member opens the app, their browser's time zone is saved as their time zone (never over one already saved), so the busiest hour, after-dark share and other clock figures are no longer counted in the server zone, or in UTC when no server zone is set. The account page's time zone list now always saves a zone; the "Server time zone" entry is gone. Rewinds already made keep their times until they are made again; an admin can regenerate one from Admin, Rewind.

### Removed

- The member data export: the "Download my data" button on Account, Your data, and `/account/export`.
- Deleting an assistant conversation from Account, Your data, and the conversation list there. Single deletes of marks and watchlist items stay; conversations still age out under retention.

### Fixed

- **Member home on phones:** the home page no longer scrolls sideways. The "New on" poster row's hidden "(opens Plex)" labels escaped the row and widened the page by the row's full length (about 1,950 px at every width, desktop included). Long words (an email-style username in the greeting, a long server name, an announcement title or a URL) now wrap inside their card. The request-limits table keeps "200 h" and "/ 7 d" together and spaces its columns, the help card's links grow to fit a wrapped label, the top bar's links no longer wrap at tablet widths, and the loading skeleton uses the page's own layout, so nothing jumps sideways when the page loads.
- **Tab bars:** the tab row on the user page and in the AI settings no longer shows a vertical scrollbar where scrollbars are always drawn (Windows, Linux), and the active tab's underline shows at its full 2px.
- **Admin link for Support users:** the member app's top bar, account menu and mobile menu now show the Admin link to Support users, not only to admins, so they can reach the trimmed admin area and the assistant without typing the URL.

### Upgrade notes

- Take a `pg_dump -Fc` before you start the new release. This release adds no migrations and no environment variables.
- **Rewind time zone:** members' existing Rewinds keep their server-zone times. To recount one in the member's own zone, wait until they have signed in once (their browser zone is saved then) and regenerate it from Admin, Rewind.

## [0.4.0] - 2026-10-26

### Added

- **Admin assistant:** read-only tools over the app's own data (`get_app_invites`, `get_app_member`, `get_app_failed_jobs`), MCP servers an admin registers in Settings, Assistant sources (Streamable HTTP, an encrypted auth header, a switch per tool; a tool is off until switched on), and GitHub-backed knowledge bases the assistant searches and cites (`search_knowledge_base`, `read_knowledge_doc`). None of these are available in Discord. See `docs/assistant.md`.

### Changed

- **Billing statuses:** members who do not pay now read as one state, **Exempt**, in the Users table, the user's Billing tab and `/membership`; admins and the owner read **Not required**. "Comp" and "Grandfathered" are gone from the UI and docs, and "Grant comp access" is now "Grant access and exempt". `User.exemptReason` is now `User.exemptNote`, an optional free-text note shown under the badge. Access rules are unchanged.

### Fixed

- **404 status after a deploy:** a share link that shares nothing, an invalid Rewind year and a membership page the member lacks now answer 404 from the first request after a new build. Before, they showed the right page with status 200 until an admin saved a setting. The postbuild step (`scripts/build/prerender-status.mjs`) drops the 200 that `next build` stores with each prerendered page, which overrode the 404 proxy.ts sets.

### Upgrade notes

- Take a `pg_dump -Fc` before you start the new release, and check afterwards that `npx prisma migrate status` reports the schema is up to date. This release adds seven migrations: `20270117000001_p1111_subscription_jellyfin_access`, `20270117000004_p1114_retention_run`, `20270117000009_p1132_setup_claim`, `20270117000010_p1024_setup_step_ids`, `20270118000002_p111_encryption_canary` and `20270118000003_p113_drop_legacy_lock_tables` and `20270119000002_add_request_tiers_and_channel_stats`.
- **Exempt note migration:** `20270119000001_rename_exempt_reason_to_note` renames `User.exemptReason` to `exemptNote`, clears the `comp` and `grandfathered` values, and turns `invite` into `Joined by invite`. Who is exempt does not change.
- Adds the migration `20270119000004_add_assistant_sources` (the `McpServer` and `KnowledgeSource` tables). Run `npx prisma migrate status` after the upgrade.
- **Discord stat channels and request limits:** both are off after the upgrade. They replace the Windmill flows `f/mflix/discord_channel_status` and `f/mflix/sync_overseerr_quotas_from_tautulli_watchtime`. In Admin > Settings, turn on "Discord channel stats" (paste each channel's ID) and "Request limits", press "Update now" and "Run now" to check the result, then disable both Windmill schedules so the two do not fight over the channel names and quotas. Members with an Overseerr quota you set by hand: turn on "Set request limits by hand" on their user page before the first run, since the sync overwrites every other matched member's quota. Both jobs need Redis and a worker. See `docs/request-limits.md`.
- Take a `pg_dump -Fc` before you start the new release, and check afterwards that `npx prisma migrate status` reports the schema is up to date. This release adds seven migrations: `20270117000001_p1111_subscription_jellyfin_access`, `20270117000004_p1114_retention_run`, `20270117000009_p1132_setup_claim`, `20270117000010_p1024_setup_step_ids`, `20270118000002_p111_encryption_canary` and `20270118000003_p113_drop_legacy_lock_tables` and `20270119000003_add_user_role`. An install that already applied it under its first name, `20270119000002_add_user_role`, applies the renamed one as a no-op.
- **Light theme migration:** `20270119000005_drop_light_theme_flag` drops `Config.lightThemeEnabled`. Every signed-in user can now pick Dark or Light; Dark stays the default until they choose.
- Take a `pg_dump -Fc` before you start the new release, and check afterwards that `npx prisma migrate status` reports the schema is up to date. This release adds nine migrations: `20270117000001_p1111_subscription_jellyfin_access`, `20270117000004_p1114_retention_run`, `20270117000009_p1132_setup_claim`, `20270117000010_p1024_setup_step_ids`, `20270118000002_p111_encryption_canary` and `20270118000003_p113_drop_legacy_lock_tables`, `20270119000001_rename_exempt_reason_to_note`, `20270119000002_add_request_tiers_and_channel_stats`, `20270119000003_add_user_role` and `20270119000006_drop_prometheus_status`. An install that already applied it under its first name, `20270119000002_add_user_role`, applies the renamed one as a no-op.
- **Setup claim:** an install whose first-run setup is still unfinished must enter the one-time setup code to continue. Find it with `docker logs <container> | grep 'Setup code'`, or set `SETUP_TOKEN` to at least 16 characters; production refuses to start with a shorter one. Finished installs are unaffected.
- **Retention:** the first daily retention sweep deletes data past its window, including audit rows older than 400 days and Discord command logs older than 90 days. To keep more, set the `RETENTION_*_DAYS` variables (`docs/privacy.md`) before you deploy.
- **Stripe:** turning Stripe on now asks for confirmation when there are Jellyfin-only members who are not exempt.
- **Setup steps:** an unfinished setup resumes on the matching step.
- **Prometheus status removed:** the stored Prometheus status config (the `Prometheus` table, with its URL and query) is dropped and cannot be exported or restored except from your `pg_dump`, and the home page no longer shows the uptime strip or an outage notice. A setup that stopped on the Prometheus step resumes on the summary. Remove any `DEV_PROMETHEUS_*` variables from your `.env`; nothing reads them. The `/api/metrics` exporter and `METRICS_TOKEN` are unchanged.
- **Duplicate service rows:** reads of a service's active row now take the most recently updated one. Before you deploy, run `npm run services:rows-audit`; where a service lists a "read after this release" row that differs from the "read today" one, run `services:rows-apply` (after a dump) soon after the deploy to keep the row you want.
- **Deploy outside the Rewind season.** The encryption keyring and the worker role change how stored secrets are read and where the Rewind queues run, so deploy this release before the season opens on 2026-12-01 or after it closes on 2027-01-31, not while it is live.
- **Encryption keys (breaking):** a production server now refuses to start without a key for the secrets it stores. Before you pull this release, set `ENCRYPTION_KEYS="k1:$(openssl rand -base64 32)"` (a comma-separated `kid:base64` keyring; the first entry encrypts new writes). An install that already sets only `ENCRYPTION_KEY` keeps working and writes `enc:v2:legacy:` values; to move to a keyring, add `ENCRYPTION_KEYS` beside it, run Admin > Settings > Security > "Encrypt stored secrets", then remove `ENCRYPTION_KEY`. `ALLOW_PLAINTEXT_SECRETS=true` is the unsafe escape hatch: it starts without a key, stores secrets as plain text and warns at every boot. A boot check stops the server with `crypto.key_mismatch` when the key does not match the database, so a restore under the wrong key never serves. Keep every key in your password manager, never beside a dump; rotation and lost-key recovery are in `docs/operations.md` ("Encryption keys"). After the first boot with Redis the app re-encrypts stored plaintext in the background.
- **Worker role:** every running container must be on a 0.3.0 (P11.2 lease lock) or later release before you deploy this one, because its migration drops the `DiscordBotLock` and `WatchlistSyncLock` tables that older releases still use. `PROCESS_ROLE` (`web`, `worker` or `all`, default `all`) now picks what a container runs: one `all` container behaves as before; `web` serves requests only; `worker` runs the queues, schedulers and Discord bot and answers 404 for everything but `/api/health` and `/api/metrics`. Any other value stops a production boot. `docs/examples/docker-compose.workers.yml` runs web containers and one worker. While Redis is down, request-path enqueues fail fast with "the queue is unavailable" and the Stripe webhook answers `503`, so Stripe retries.
- **HSTS:** releases before this one sent `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every response. It is now one year with neither flag by default; browsers that saw the old header keep it until it expires. If your domain is on the preload list or your subdomains rely on it, set `HSTS_INCLUDE_SUBDOMAINS=true` and `HSTS_PRELOAD=true` (and `HSTS_MAX_AGE=63072000`) before you deploy.
- **Bare metal:** `npm run start:prod` now runs the standalone server (`node --env-file-if-exists=.env .next/standalone/server.js`, Node.js 22.9 or later); `npm run build` copies `.next/static` and `public` beside it. `example.env` is regenerated from `lib/env.ts`, so compare your `.env` with it, and every variable is listed in `docs/environment.md`. Discord account-linking links no longer fall back to `localhost` outside development: set `NEXTAUTH_URL` (or `DISCORD_PORTAL_URL`).

### Added

- Discord bot login safety: backoff between failed logins (30 s up to 30 min), no retries after a rejected token or disallowed intents (Admin, Settings, Discord shows "Login rejected"), a cap of 100 logins per rolling 24 hours, a destroyed client after every failed login, a kept gateway session across one failed lease renewal or a settings save that left the token alone, and `plex_manager_discord_*` metrics. If Discord reset your bot token, paste a new one in Admin, Settings, Discord (`docs/discord-bot.md`).
- Discord stat channels: a BullMQ job (every 10 minutes or more) that renames voice channels with live Tautulli numbers (server status, streams, transcodes, bandwidth, movies, shows, episodes). Channels and name formats are set in Admin > Settings; a channel is renamed only when its name changes, and Discord's `429` is left for the next run.
- Request limits: a daily BullMQ job that sets each member's Overseerr request quota from their all-time Tautulli watch time, with editable tiers, a per-member exclusion for quotas set by hand, a stored last run in Admin > Settings, and every Overseerr user paged (not only the first 100). Members see their tier, requests left, the hours to the next tier and the tier table on the home page and in Discord `/mystats`.

- A built-in **Support** role (`docs/roles.md`): an admin gives a user the role from the users list, and they get a trimmed admin area with the assistant's read-only tools and the users list, with no settings, connections, secrets, billing or member actions. Permissions are a typed list (`lib/permissions`), `isAdmin` stays the superuser, and `permissionAction` and `assertPermission` guard actions and loaders. Assigning or removing the role is audited (`USER_ROLE_CHANGED`), and so is every assistant tool call a Support user makes or is refused (`ASSISTANT_TOOL_CALLED`, `ASSISTANT_TOOL_DENIED`).

- Production deployment: `deploy/docker-compose.yml` for the published image, `docs/deployment.md` (compose, Caddy and nginx, the setup claim, bare metal, web and worker containers), `docs/domain-move.md`, and `docs/environment.md`, generated with `example.env` from `lib/env.ts` by `npm run env:docs` and checked in CI.
- At-rest encryption keyring: `ENCRYPTION_KEYS` with key ids and rotation, a boot check against the database, a background and on-demand re-encryption (Admin > Settings > Security), and settings that ask you to re-enter a secret the current keys cannot read instead of failing.
- `PROCESS_ROLE=web|worker|all` to run the job queue, schedulers and Discord bot in a separate worker container.
- Releases: this changelog, a release workflow that publishes the GitHub Release from a version's section when its `v*` tag is pushed, `scripts/release/prepare.mjs` to cut a release, and the Changelog check on pull requests.
- Member data export at `/account/export` (at most 3 a day; no tokens, hashes or Stripe ids), and item-level deletes of marks, watchlist history and assistant conversations from the new "Your data" section on `/account`.
- A daily retention sweep, with per-table `RETENTION_*_DAYS` overrides and an audited "Run now" in the new Privacy section of admin settings.
- Stripe for Jellyfin-only members: checkout without an email, and a subscription turns the member's Jellyfin account on and a cancellation turns it off.
- Discord replies for Jellyfin-only members. `/mystats` and the linked-role hours are computed from stored data.
- One active row per service: "Check service rows" (Admin > Settings > Security) and `npm run services:rows-audit` list any service with more than one active row, with each row's host, dates, connection result and the row the app reads today; `npm run services:rows-apply -- --dump <file> --keep <Table>=<id>` (or the same check after you confirm a dump) keeps the chosen row and deactivates the rest, audited. Every read of a service's active row is now ordered by its last update.

### Changed

- Every signed-in user can pick the Dark or Light theme under Appearance, with no admin setting to turn on first. Dark stays the default until the choice is saved. The "Light theme for members" switch in Admin > Settings is gone, and its `Config.lightThemeEnabled` column is dropped by the `20270119000005_drop_light_theme_flag` migration.
- The setup wizard is rebuilt: string step ids, "Skip for now" on optional steps, "Connect with Plex" instead of pasting a token, one service form, and a summary step that signs the owner in. Setup and admin settings save through the same flow.
- The assistants use the member's or the server's time zone and the app locale, and `<html lang>` follows the configured locale.
- The package is named `plex-manager`, to match the repository and the image.
- One lease lock (database or Redis) runs the Discord bot, watchlist sync, Rewind generation and member access changes; every job type has a deduplication or deterministic id, and a job that exhausts its retries logs `queue.job_exhausted`.
- The Discord bot starts within one poll (10 s) of "Bot enabled" being turned on with a token saved, with no restart, and `/admin/discord` says "Turned off", "Waiting for a bot token" or "Online". `ENABLE_DISCORD_BOT=false` still opts a process out. Slash commands register from the image with `docker compose exec app node scripts/dist/register-discord-commands.cjs` (or `register-discord-metadata.cjs`), and the script falls back to the token and client ID saved in admin settings.

### Removed

- The Prometheus status integration: its setup step, its Admin > Settings > Other integrations entry, the stored config, the home page's 7-day uptime strip and the outage notice it drove. The app's own `/api/metrics` exporter is unchanged.

### Security

- Every assistant tool declares the permission it needs. The tool list sent to the model and each call are checked against the caller's permissions, so a hallucinated or injected tool name is refused before any service is called. Tool output for a role below admin has credentials and personal contact details removed, and a tool error returns a fixed line instead of the upstream text. A Support user has a lower hourly message limit and counts against the member spend cap, not the admin one.
- Stored secrets, member Plex tokens and AI prompt and reply text are encrypted by default; production refuses to start without a key unless `ALLOW_PLAINTEXT_SECRETS=true`.
- First-run setup needs a claim: the one-time setup code from the container log, or `SETUP_TOKEN`. A wrong code is limited to 5 a minute, and after setup every setup action is admin-only.
- The automatic Stripe revoke never removes a member whose Jellyfin admin status is "admin" or "unknown".
- A strict Content Security Policy: a per-request nonce with `'strict-dynamic'`, no inline or eval scripts, and violations logged through the rate-limited `/api/csp-report`. `CSP_REPORT_ONLY=true` sends it report-only while you investigate a violation.
- `X-XSS-Protection` and `X-DNS-Prefetch-Control` are gone and `Referrer-Policy` is `strict-origin-when-cross-origin`. HSTS is sent only when `NEXTAUTH_URL` is https, for `HSTS_MAX_AGE` (default one year), with `includeSubDomains` and `preload` only when `HSTS_INCLUDE_SUBDOMAINS` or `HSTS_PRELOAD` is true.

## [0.3.0] - 2026-10-23

Phase 11 wave 2 of the 2026 refresh (#387).

### Upgrade notes

- Take a `pg_dump -Fc` before you start the new release, and check afterwards that `npx prisma migrate status` reports the schema is up to date. This release adds four migrations: `20270116000000_p1110_primary_auth_service_enum`, `20270116000002_p112_lease_lock`, `20270116000003_p1113_discord_command_log_user_fk` and `20270116000006_p1116_discord_command_log_args_length`.
- **`User.primaryAuthService`** becomes an enum. It is backfilled, and any value other than `plex` or `jellyfin` becomes NULL.
- **Discord command log:** assistant text already stored there is replaced by its length.
- **Watchlist sync:** members who were unshared or revoked have it turned off. Their Plex token comes back at their next sign-in, but they must turn sync on again.
- **New optional variables:** `METRICS_TOKEN` (without it, `/api/metrics` answers 404) and `BUILD_COMMIT` (a Docker build argument the image sets).
- After deploying, run `npm run register-discord-commands`: the `/assistant ask` description changed.
- **Contributors:** the merged migration `20251122201244_combined_schema_updates` was edited to check `current_schema()`. On an existing development database, `migrate dev` reports it as modified; to avoid a reset, run `UPDATE "_prisma_migrations" SET checksum='af13d7e87e9a3687266696b8daa07909e189c98a5fe6b548cf5f098680e8a83a' WHERE migration_name='20251122201244_combined_schema_updates';`.

### Added

- Member offboarding: an admin can erase a member from the user detail page's danger zone. `docs/privacy.md` lists the personal data the app stores.
- Jellyfin member parity in admin: a Service column on the users table, Jellyfin access on the user detail page, and one home quick link per linked service.
- Observability: a request id on every route handler and queued job, and `/api/metrics` with queue gauges and LLM spend behind `METRICS_TOKEN`.
- A shared lease lock and poller, which now run the Discord bot and watchlist sync. Without Redis, watchlist sync follows the admin setting without a restart.
- `?schema=` in `DATABASE_URL` is honoured by the app and the seed.

### Changed

- One disclosure names the active chat provider, in Discord, `/help`, the sign-in screen and `/account`.
- Unsharing, the Stripe revoke and Discord unlink clear the related tokens, grants and chat sessions.

### Security

- The Discord command log keeps only the length of what a member types to the assistant. Unsharing and member import are audited, and admin reads of a member's content are audited at most once an hour.

## [0.2.0] - 2026-10-22

The 2026 refresh from Phase 1 to Phase 11 wave 1, by milestone: baselines and CI gates, the safe upgrade path, security and reliability hardening, Rewind 2026 (data layer, story player, pages, sharing, season tooling, freeze and final cut), the app, public and admin shells, and the UI refresh on the design system (#334 to #386).

### Upgrade notes

- Take a `pg_dump -Fc` before you start the new release, and keep it off the host. This release carries many migrations, among them one that adds `AuditLog`, one that versions sessions and the Rewind v3 tables. Check afterwards that `npx prisma migrate status` reports the schema is up to date.
- **Migrations:** `npm run db:deploy` (`prisma migrate deploy`) is the only install and upgrade command; `db:push` and `db:migrate` are contributor-only. The image logs `prisma migrate status` and then applies migrations at every start; set `SKIP_MIGRATIONS=true` to apply them by hand. An install whose schema was created with `db push` must be baselined on the old release first (README, "Installed with `db push`?").
- **Boot refusal:** a production server now exits with code 1, logging `env.invalid` and the variable's name, when `NEXTAUTH_SECRET` is missing, shorter than 32 characters, has fewer than 10 distinct characters or is a published placeholder; when `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` is not `https:` (loopback excepted; `ALLOW_INSECURE_HTTP=true` for a LAN-only install); or when `PLEX_CLIENT_IDENTIFIER` is empty. Check these before you pull.
- **Compose:** `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required, Postgres and Redis publish on `127.0.0.1` only, and the database moves from Postgres 15 to 16. Postgres 16 cannot open a 15 data directory: dump the `db` volume while it still runs 15, remove the volume, start the new one and restore the dump. A volume created before this change keeps its old password (`postgres`).
- **Image:** Node.js 24 under `tini` as the unprivileged `nextjs` user, with read-only app files. The one writable path is `/app/.next/cache` (Next's cache and Rewind's posters, cards and fonts); mount a volume there to keep it. The `HEALTHCHECK` calls `/api/health?probe=live`, and `GET /api/health` checks the database and Redis.
- **Sessions:** a disabled, unshared or demoted user loses access within five minutes, and turning Discord on needs a restart before the daily role reconcile starts.
- **Rewind:** v2 share links open the paper article, and the v2 viewer is gone. `chart.js` and `react-chartjs-2` are removed.

### Added

- Rewind 2026: stats engine v3, facts and archetypes on golden fixtures, generation as a queued job, the story player and its pages, share-safe cards and links with a public share page, the admin season console, dry runs, the eval results page, feature flags for the P1 story features, the freeze lock, the season open and the final cut (`docs/rewind.md`).
- The app, public and admin shells, the admin Overview, analytics on Recharts, the queues page with live status, the command menu (Ctrl or Cmd K), help, announcements and membership pages, and a light theme behind a setting.
- `/api/health`, the image smoke test, and backup, restore and upgrade docs in `docs/operations.md`.
- Daily LLM quotas and spend caps for the assistant and Discord.
- Watchlist sync pages the whole watchlist, resolves TMDB and TVDB ids and files TV requests for every season.

### Changed

- Every admin and member page is rebuilt on the design system's tokens and `components/ui` primitives.
- Every server action runs through the action helper, which checks the session, validates the input and never returns error text.
- Plex imports count managed users and pending invites separately, and a pending invite counts as no access.

### Security

- Entitlement is enforced in actions, routes and the proxy; sessions end when access ends; the Plex PIN and the Discord OAuth state are bound to the browser that started them.
- Stripe events are processed in order and once each; unsharing removes only this server's share; Jellyfin invites cannot be redeemed for Plex.
- Stored secrets are resent only to their saved origin, admin changes are written to the audit log, and secrets are redacted from logs.

### Removed

- The v2 Rewind viewer and the old UI adapters (`StyledInput`, `StyledTextarea`, `StyledDropdown`, `LoadingSpinner`, `ConfirmModal`).

## [0.1.0] - 2026-10-18

The Phase 0 safety fixes of the 2026 refresh (#321) and the 2026-07 Discord enhancements.

### Upgrade notes

- Take an encrypted `pg_dump` before you start the new release: a migration clears the stored emails of Jellyfin-only members and cannot be undone. Before deploying, list the accounts that hold both a Plex and a Jellyfin id and review them (README, "Upgrading to the release that stops email linking").
- **Proxies:** with more than one proxy in front of the app, set `TRUSTED_PROXY_HOPS` (default 1). `docker-compose.yml` publishes the app on `127.0.0.1:3000` only.
- **Test and dev settings:** test tokens need `E2E_TEST_MODE=true` and the setup prefill needs `DEV_SETUP_PREFILL`; never set either on a public host. E2E refuses a database whose name does not end in `_test`.
- **Sharing:** share links are opt-in. After deploying, run `npm run rewind:strip-leaderboards` as a dry run, then with `--apply`, then once more to confirm zero changes. A share token that is not 43 URL-safe characters stops resolving.
- **Discord:** the `!`-prefix commands are replaced by slash commands, with no grace period. Apply the migrations (then `npm run db:migrate`; now `npm run db:deploy`), run `npm run register-discord-commands`, and turn off the Message Content privileged intent in the Discord Developer Portal. The bot token and channel ids can move to Admin → Settings → Discord; the environment variables remain a fallback.

### Added

- Discord slash commands: `/help`, `/mark`, `/assistant ask`, `/assistant reset`, and the personal `/mystats`, `/mymarks` and `/watching`. The assistant runs in DMs, and the media picker is a select menu.

### Changed

- The Overseerr request status mapping is corrected, the Rewind year comes from the data, and members without Plex history get an explanation.

### Security

- Next.js 16.4.2, React 19.3.1 and next-auth 4.24.15, with the image optimizer off and no `unsafe-eval` in the production CSP; no production `npm audit` advisories.
- Images publish only from `main` and `v*` tags, with every action pinned by SHA.
- No account linking by email; the Jellyfin sign-in toggle is enforced; share routes serve a share-safe projection; a failed Tautulli match no longer shows emails; a Redis-backed rate limiter keys on the trusted proxy hop; generation is single-flight and rate-limited; the poster proxy checks access; `plexAuthToken` no longer reaches the admin browser.
- The Discord bot no longer uses the Message Content intent, keeps its token encrypted in the database, and scrubs personal fields before the LLM.

[unreleased]: https://github.com/mchestr/plex-manager/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.5.0
[0.4.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.4.0
[0.3.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.3.0
[0.2.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.2.0
[0.1.0]: https://github.com/mchestr/plex-manager/releases/tag/v0.1.0
