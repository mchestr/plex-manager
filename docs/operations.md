# Operations: state, backups and upgrades

How to back up, restore and upgrade a Plex Manager install. The commands assume
the bundled `docker-compose.yml` (database `plex_wrapped`, user `postgres`, the
`db` and `app` services); outside compose, use the `DATABASE_URL` variants.
The production compose file `deploy/docker-compose.yml` uses the same names.
Installing is in [deployment](deployment.md), every variable is in the
[environment reference](environment.md), and moving to a new host name is in
[domain move](domain-move.md).

## Contents

- [What holds state](#what-holds-state)
- [Backup](#backup)
- [Restore](#restore)
- [Dump before every migration](#dump-before-every-migration)
- [Applying migrations](#applying-migrations)
- [Web and worker containers](#web-and-worker-containers)
- [Migration calendar for the 2026 season](#migration-calendar-for-the-2026-season)
- [Code freeze gate](#code-freeze-gate)
- [Installed with db push](#installed-with-db-push)
- [Request IDs and metrics](#request-ids-and-metrics)
- [Security headers and CSP](#security-headers-and-csp)
- [Locale](#locale)
- [Encryption keys](#encryption-keys)
- [Members, roles and Jellyfin](#members-roles-and-jellyfin)

## What holds state

| State | Needed for a restore | Why |
| --- | --- | --- |
| PostgreSQL | **Mandatory** | Every user, Rewind, invite, subscription and setting, and every stored service secret: the `ENCRYPTED_FIELDS` in `lib/prisma.ts` (Plex, Tautulli, Overseerr, Sonarr and Radarr keys, LLM keys, Stripe and Discord secrets). |
| `ENCRYPTION_KEYS` (or `ENCRYPTION_KEY`) | **Mandatory** | The encrypted fields in a dump cannot be decrypted without the keys they were written with. Keep them in your password manager, never next to the dump. A restore with a different key stops the app at boot (`crypto.key_mismatch`); see [Encryption keys](#encryption-keys). |
| `NEXTAUTH_SECRET` | Recommended | Signs sessions. A new value signs everyone out. |
| `PLEX_CLIENT_IDENTIFIER` | Recommended | Identifies this install to Plex. A new value makes every member sign in to Plex again. |
| Redis (AOF) | Optional | Holds the job queue and rate-limit counters. Rewind jobs are idempotent and rescheduled when the worker starts. Stripe resends an event whose webhook did not answer 200, but a Stripe job that was queued and then lost with Redis is not redelivered (the webhook already recorded the event id), so after losing Redis compare subscriptions in Admin with the Stripe dashboard. |
| `REWIND_CACHE_DIR` | Not needed | Rebuildable cache of Rewind posters, cards and fonts. |

Keep a copy of your `.env` (or your platform's environment settings) with the
secrets above, stored like the dump.

## Backup

```bash
docker compose exec -T db pg_dump -U postgres -Fc plex_wrapped > plex-manager-$(date +%F-%H%M).dump
```

Outside compose:

```bash
pg_dump -Fc "$DATABASE_URL" -f plex-manager-$(date +%F-%H%M).dump
```

`pg_dump` rejects Prisma's `?schema=public` suffix ("invalid URI query
parameter"); drop it from the URL you pass.

A dump holds every member's data and the encrypted secrets, so:

- **Encrypt it** straight away, then delete the plain file:
  `age -p -o plex-manager-….dump.age plex-manager-….dump` or
  `gpg --symmetric --cipher-algo AES256 plex-manager-….dump`.
- **Keep it off the host**: a disk failure or a compromised host must not take
  the backup with it.
- **Delete it after 30 days.**

## Restore

Restoring replaces the database with the dump, including Prisma's
`_prisma_migrations` table, so `prisma migrate status` afterwards shows the
state at dump time. Decrypt the dump first (`age -d` or `gpg -d`).

```bash
docker compose stop app
docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists --create --no-owner < plex-manager-….dump
docker compose start app
```

`--create` drops the `plex_wrapped` database and recreates it from the dump
(`-d postgres` is only the database `pg_restore` connects to first). Without
it, `--clean` drops only the objects the dump contains, so a table or type that
a later migration created would survive the restore and make that migration
fail when it is applied again. Dropping the database fails while anything is
connected to it, so stop every process that uses it first (the app, and any
worker or replica).

Outside compose, with the app stopped, connect to any other database on the
server: `pg_restore -d postgresql://user:password@host:5432/postgres --clean --if-exists --create --no-owner plex-manager-….dump`.

If you are rolling back an upgrade, start the **previous** release's image tag
(`CHANGELOG.md` lists them; see `docs/releasing.md`): the new one would apply
its migrations again at start. To start any release without
applying migrations, set `SKIP_MIGRATIONS=true`.

## Dump before every migration

**Take a dump before every deploy that carries a migration.** Prisma has no
down migrations, so a dump is the only way back. A release carries a migration
when it adds a folder under `prisma/migrations`; when in doubt, take the dump.

During the 2026 Rewind season, take one at these moments too, whether or not the
release carries a migration:

- before the soft-launch release (2026-11-24);
- before the season-open release (2026-11-30).

## Applying migrations

`npm run db:deploy` (`prisma migrate deploy`) applies pending migrations. It is
the only migration command for an install or upgrade; `db:push` and
`db:migrate` are contributor-only (prototyping on a throwaway database, and
creating a migration).

The Docker image applies migrations at every start:

1. It logs `prisma migrate status`, which lists pending migrations. A failing
   status check never stops the start.
2. It runs `prisma migrate deploy`. A failing migration stops the start.
3. With `SKIP_MIGRATIONS=true` it logs
   `SKIP_MIGRATIONS=true: not applying migrations` and skips step 2.

Use `SKIP_MIGRATIONS=true`:

- to apply migrations by hand after a backup, before the new release serves
  traffic: with the app stopped, run
  `docker compose run --rm -e SKIP_MIGRATIONS=true app npx prisma migrate deploy`
  (the entrypoint skips its own deploy and runs the command you give it), or
  `npm run db:deploy` outside Docker; then start the app;
- on every replica but one, so only one process applies migrations. The
  [web and worker example](examples/docker-compose.workers.yml) does this: its
  one `worker` container applies them and the `web` containers skip them.

Afterwards, `npx prisma migrate status` must report "Database schema is up to
date!".

## Web and worker containers

`PROCESS_ROLE` picks what a container runs. Every role runs the same image
and `server.js`.

| Role | Serves | Runs |
|---|---|---|
| `all` (default) | every page and route | the queue Workers, the schedulers, the Discord bot and, without Redis, the database-lease watchlist and retention polling |
| `web` | every page and route | nothing in the background but the first-run setup code |
| `worker` | only `/api/health` and `/api/metrics` (everything else is 404) | what `all` runs |

One `all` container is the simple install. To scale the site, run web
containers and one worker, as in
[`examples/docker-compose.workers.yml`](examples/docker-compose.workers.yml):
the worker applies the migrations and the web containers start with
`SKIP_MIGRATIONS=true`. `/api/health` names each container's role. Without a
worker or `all` container nothing processes jobs: Stripe events, watchlist
syncs and Rewind generations wait in Redis.

Requests never wait on Redis for more than about two seconds: while it is
down, enqueues answer "the queue is unavailable" and the Stripe webhook
answers `503`, so Stripe retries the delivery.

## Migration calendar for the 2026 season

The last pre-season migration ships in the 2026-11-24 soft-launch release. No
migration merges or deploys from 2026-11-25 to 2027-01-02 except a named freeze
exception, and that one follows this page: take a dump, then deploy with
`SKIP_MIGRATIONS=true` on all replicas but one.

## Code freeze gate

`.github/workflows/freeze-gate.yml` runs the "Freeze gate" check on every pull
request to `main`. While the repository variable `CODE_FREEZE` is `on`, the
check fails unless the pull request is labelled `freeze:data` or
`freeze:security`, or changes only files under `.agents/planning/`. While the
variable is `off` or unset, it passes. It reads the labels and the changed files
when it runs, so adding a label re-runs it, and a re-run judges the pull request
as it is now.

Set it up once, before the freeze (an owner with admin rights to the repository):

```bash
gh variable set CODE_FREEZE --body off
gh label create freeze:data --description "Data fix allowed during the code freeze"
gh label create freeze:security --description "Security fix allowed during the code freeze"
```

After the check has passed on `main`, add "Freeze gate" to the required checks
of the `main` branch rule, next to Build.

Test it before 2026-12-10. Set `CODE_FREEZE` to `on` for ten minutes, open three
throwaway pull requests, then set it back to `off` and close them unmerged:

| Pull request | Expected |
| --- | --- |
| A one-line change outside `.agents/planning/`, no label | Fails, naming both labels |
| The same change, labelled `freeze:data` | Passes |
| A change only under `.agents/planning/`, no label | Passes |

Record the three run ids in `ship-check.md`.

At 00:00 server time on 2026-12-14, set `CODE_FREEZE` to `on`. Changing the
variable does not re-run the checks of pull requests that are already open, so
re-run the gate on each of them:

```bash
for branch in $(gh pr list --base main --state open --json headRefName --jq '.[].headRefName'); do
  run=$(gh run list --workflow freeze-gate.yml --branch "$branch" --limit 1 --json databaseId --jq '.[0].databaseId')
  [ -n "$run" ] && gh run rerun "$run"
done
```

Pull requests from forks may not see repository variables, and then the gate
reads `CODE_FREEZE` as unset and passes; review any fork pull request by hand
during the freeze. At the season close (2027-01-31), set `CODE_FREEZE` back
to `off`.

## Installed with db push

An install made with `npm run db:push` (now contributor-only) has no migration
history, and `db:deploy` would fail on tables that already exist. Baseline it
once, on the old release before upgrading, after a dump:

1. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   must exit 0 (no difference). If it does not, stop: the database has drifted.
2. `npx prisma migrate resolve --applied <name>` for each folder in
   `prisma/migrations`.
3. Only if Stripe was never enabled, run the exempt-all `UPDATE` from
   `20260703000000_add_stripe_subscriptions` through `npx prisma db execute --stdin`
   (see [stripe.md](stripe.md#exempting-existing-members)).

The README's [Installed with `db push`?](../README.md#installed-with-db-push)
section has the exact commands. The new release's migrations then apply
normally.

## Request IDs and metrics

**Request IDs.** Every request gets an id: the `X-Request-ID` your reverse
proxy sends, when it is 8 to 64 letters, digits, `.`, `_` or `-`, otherwise a
new UUID. The response carries it back as `X-Request-ID`, and every log line
of the request carries it as `requestId`: the proxy, Server Actions, route
handlers and the jobs they queue (a job's lines carry the id of the request
that queued it; a scheduled job runs as `job:<id>`). An error page's digest
matches the `request.unhandled_error` line, which also carries the id:

```bash
docker compose logs app | grep '"requestId":"<id from X-Request-ID>"'
docker compose logs app | grep '"digest":"<digest from the error page>"'
```

**Metrics.** Set `METRICS_TOKEN` (`openssl rand -hex 32`) to turn on
`/api/metrics`, which serves the Prometheus text format to a scraper that
sends `Authorization: Bearer <token>`. Without the variable the route answers
404. It reports:

| Metric | Labels | What |
|---|---|---|
| `plex_manager_queue_jobs` | `queue`, `state` | Jobs in `plex-wrapped`, `rewind-batch`, `rewind-gen` and `rewind-aux` by state (the counts the admin queues page shows) |
| `plex_manager_job_failures_total` | `queue`, `job` | Failed job attempts, retries included, counted in Redis (`pm:metrics:job_failures`) |
| `plex_manager_llm_spend_usd` | `purpose` (`wrapped`, `chat`), `period` (`day`, `month`) | LLM spend since midnight, and since the 1st, in the server time zone (cached 60 s) |
| `plex_manager_discord_gateway_logins_total`, `_logins_24h`, `_disconnects_total`, `_last_close_code`, `plex_manager_discord_bot_healthy` | | Discord gateway logins (total and rolling 24 h; Discord resets the token near 1000), disconnects, the latest close code, and 0 while the bot is blocked (see `docs/discord-bot.md`) |
| `plex_manager_scrape_error` | `source` | 1 when a source failed or took over 2 s this scrape |
| `plex_manager_build_info` | `version`, `commit` | The running build (`BUILD_COMMIT`) |
| `process_resident_memory_bytes` | | Resident memory |
| `plex_manager_event_loop_delay_p99_seconds` | | p99 event-loop delay since the previous scrape |

A Prometheus scrape job:

```yaml
scrape_configs:
  - job_name: plex-manager
    scrape_interval: 30s
    metrics_path: /api/metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/plex-manager-token
    static_configs:
      - targets: ["plex-manager.example.com:443"]
    scheme: https
```

Three alerts worth having (set the spend threshold to a thirtieth of your
monthly LLM budget, here USD 30 a month):

```yaml
groups:
  - name: plex-manager
    rules:
      - alert: JobFailuresRising
        expr: sum by (queue, job) (increase(plex_manager_job_failures_total[30m])) > 5
      - alert: QueueBacklog
        expr: sum by (queue) (plex_manager_queue_jobs{state="waiting"}) > 100
        for: 15m
      - alert: LlmSpendHigh
        expr: sum(plex_manager_llm_spend_usd{period="day"}) > 1

## Security headers and CSP

Every page and route response carries a strict Content Security Policy with a
fresh nonce per request (`lib/security/csp.ts`): scripts run only when they
carry the nonce or were loaded by one that does (`'strict-dynamic'`), and there
is no `'unsafe-inline'` or `'unsafe-eval'` for scripts. Images may come from
the app, Plex (`plex.tv`) and Discord avatars; forms may post to the app and
redirect to Stripe Checkout and the billing portal. Over https the policy also
upgrades insecure requests.

**Violation reports.** Browsers report blocked content to `/api/csp-report`
(`report-uri`, and `report-to` through `Reporting-Endpoints`). The route
stores nothing: each violation is one `csp.violation` warning with the
directive, the blocked origin and the document path, with share and invite
tokens masked. It reads at most 8 KB and takes 60 reports a minute per
address.

```bash
docker compose logs app | grep csp.violation
```

A violation from normal browsing is a bug in the app or the policy. While you
investigate one, `CSP_REPORT_ONLY=true` sends the policy as
`Content-Security-Policy-Report-Only`: violations are still reported, but
nothing is blocked. Unset it again once it is fixed.

**HSTS.** `Strict-Transport-Security` goes out only when `NEXTAUTH_URL` is
https, with `max-age` from `HSTS_MAX_AGE` (default 31536000, one year).
`HSTS_INCLUDE_SUBDOMAINS=true` adds `includeSubDomains`, and
`HSTS_PRELOAD=true` adds `preload`; set them only when every subdomain serves
https, because browsers keep both for the whole `max-age`. These are read at
start, so a restart applies a change. If your reverse proxy already sends
HSTS, keep one of the two.

The other headers are fixed in `next.config.js`: `X-Frame-Options: SAMEORIGIN`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` (`no-referrer` on share pages) and a
`Permissions-Policy` that turns off the camera, microphone and location. There
is no `X-Powered-By`.

## Locale

Admin settings hold two values that shape how the app writes dates and numbers:

- **Time zone** (`Config.timezone`, else the `TZ` variable, else UTC): the
  server zone. Day boundaries and admin timestamps use it.
  A member who sets their own zone gets it for Rewind and the Discord
  assistant, which states the local time and gives every date in that zone, so
  "yesterday" means the member's yesterday. The admin assistant does the same
  in the browser's zone, in its answers and under each message, and falls back
  to the server zone when the browser's is not one the app knows.
- **Locale** (`Config.locale`, a BCP 47 tag such as `en-GB`; default `en-US`):
  number and date formats ("1 December" against "December 1") and the page's
  `<html lang>`. A value `Intl` rejects falls back to `en-US`.

The locale does not translate the copy: every string stays in English.
Translation is out of scope for now, so there is no i18n library, no string
extraction and no `Accept-Language` negotiation; every visitor gets the one
configured locale.

## Encryption keys

Service keys and tokens, member Plex tokens, the Discord and Stripe secrets,
the Rewind serial key and AI prompt and reply text (`ENCRYPTED_FIELDS` in
`lib/db/encrypted-fields.ts`) are encrypted with AES-256-GCM before they reach
the database. A production server refuses to start without a key
(`env.invalid ENCRYPTION_KEY`) unless `ALLOW_PLAINTEXT_SECRETS=true`, which
stores secrets as plain text and logs a warning at every boot.

### Generate a key

```bash
echo "ENCRYPTION_KEYS=k1:$(openssl rand -base64 32)"
```

`ENCRYPTION_KEYS` is a comma-separated keyring of `kid:base64` entries, each 32
bytes. The first entry encrypts every new write (`enc:v2:<kid>:…`); the others
only read. A kid is 1 to 32 letters, digits, `_` or `-`, and `legacy` is
reserved. An entry that is not 32 bytes stops a production boot
(`ENCRYPTION_KEYS weak`).

The older single `ENCRYPTION_KEY` (any string of at least 32 characters, never
`NEXTAUTH_SECRET`) keeps working: it reads the `enc:v1:` values it wrote, and
while `ENCRYPTION_KEYS` is unset it encrypts new writes as `enc:v2:legacy:`.

At boot the app checks a known value (`Config.encryptionCanary`) against the
key. When it does not decrypt, the log shows `crypto.key_mismatch` with its kid
and code (never a value) and the process exits with 1, so a wrong key never
starts serving. A database that does not answer within 5 seconds is retried in
the background instead.

### Encrypt what is stored

Values written before a key was set, and values under an older kid, are
rewritten under the primary key by the re-encryption job:

- with Redis, boot queues `SECRETS_REENCRYPT` once per primary kid and field
  list (`Config.encryptionFieldsHash` records the last finished run);
- with or without Redis, Settings > Security > **Encrypt stored secrets**
  counts first (a dry run), then rewrites after you confirm. The run is
  audited as `SECRETS_REENCRYPTED`.

Both are idempotent: a second run changes nothing.

### Move from ENCRYPTION_KEY to a keyring

1. Take a dump.
2. Add `ENCRYPTION_KEYS=k1:<new key>` and keep `ENCRYPTION_KEY` set. Restart.
3. Run **Encrypt stored secrets** (or let the boot job finish) until Security
   shows every value under `k1`.
4. Remove `ENCRYPTION_KEY` and restart.

### Rotate

1. Take a dump.
2. Put the new kid first and keep the old one: `ENCRYPTION_KEYS=k2:<new>,k1:<old>`. Restart.
3. Run **Encrypt stored secrets**. It also moves the boot canary to `k2`.
4. Remove `k1:<old>` and restart. Removing it before step 3 finishes stops the
   next boot with `crypto.key_mismatch` (the canary is still under `k1`).

### Lost key

A value no configured key can read is never fatal at run time: it reads as
empty, `crypto.decrypt_failed` is logged once per field and kid, the settings
page asks for that secret again ("The stored key can't be read with the
current encryption key. Enter it again."), and Security lists every unreadable
field. To recover:

- **Set the right key**, if you still have it anywhere (an older `.env`, the
  password manager). Nothing else is needed.
- **Or enter the secrets again.** Clear `Config.encryptionCanary`
  (`UPDATE "Config" SET "encryptionCanary" = NULL;`) so the next boot writes a
  new one under the current key, then re-enter each service key in Settings.
  Member Plex tokens refresh at each member's next sign-in; Discord links must
  be linked again; the Stripe keys and the Discord client secret and bot token
  are entered again in their sections. AI prompt text that cannot be read stays
  unreadable until retention clears it.

## Members, roles and Jellyfin

- **Admin roles**: roles set in Admin → Users stick. A sign-in only ever
  promotes: the Plex server owner is always an admin, and so is a Jellyfin
  administrator, because Jellyfin has no owner. A sign-in never demotes anyone,
  so app admins demote members in the UI, and a Jellyfin lookup that fails (a
  timeout or a server error) keeps the stored role. The Plex server owner and
  the last admin cannot be demoted.
- **Unsharing removes one server's share only**: Unshare in Admin → Users, and
  the Stripe access removal, delete the member's share of the configured Plex
  server and nothing else. The member stays your plex.tv friend and keeps any
  other servers you share with them; remove those in Plex itself. A share that
  is already gone counts as success ("already removed"), so a retry or a second
  click settles. Managed Plex Home users have no share to remove and report
  "already removed".
- **Ending sessions**: unsharing a member, demoting an admin, disabling an
  account (Admin → Users → a user → Disable account), removing a member and the
  Stripe access removal end that user's sessions within five minutes, when the
  session next checks the database. A disabled user cannot sign in with Plex or
  Jellyfin until an admin enables the account again. Removing a member is in
  [privacy](privacy.md#removing-a-member).
- **Jellyfin accounts are never linked by email**: a Jellyfin sign-in matches
  only the Jellyfin user ID, and the Jellyfin username is never stored as an
  email address, because any Jellyfin user can rename themselves to someone
  else's address. A new member who signs in with both Plex and Jellyfin gets
  two separate accounts. A Plex sign-in or Plex invite whose email another
  account already holds still goes ahead, without storing the email. "Allow
  Jellyfin sign-in" (the switch in the Jellyfin row of Admin → Settings →
  Other integrations, which takes effect at once) turns the Jellyfin provider off, not
  just the button on the sign-in page; members already signed in with Jellyfin
  stay signed in until their session expires (at most 7 days).
- **Jellyfin sign-in limits**: the app allows 10 Jellyfin sign-in attempts per
  15 minutes from one client address and 5 failed attempts per 15 minutes for
  one username. Jellyfin's own lockout still applies, and the app's limits do
  not prevent it: by default Jellyfin disables a user after 3 failed sign-ins
  (5 for administrators), configurable per user as "Failed login tries before
  user is locked out". Anyone who knows a username can still lock that account
  through the sign-in page; the app's limits only slow password guessing. An
  administrator re-enables a locked user in the Jellyfin dashboard.
- **Jellyfin 12**: the app identifies itself in the `Authorization` header,
  which Jellyfin 12.0 and later require (they ignore the legacy
  `X-Emby-Authorization` header unless legacy authorization is turned on), and
  it retries once with the legacy header only if the server answers 400. Each
  sign-in's Jellyfin session is logged out straight away, because the app
  keeps only the Jellyfin user ID; a logout that fails or takes longer than 3
  seconds is logged as `jellyfin.auth.logout_failed` at warn and leaves that
  session on the server. Earlier releases left one session per member on the
  Jellyfin server, listed under the client "Plex Wrapped" and the device ID
  `plex-wrapped-server` (or your `JELLYFIN_DEVICE_ID`); a Jellyfin
  administrator can delete them in Dashboard → Devices.
