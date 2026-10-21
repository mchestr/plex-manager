# Operations: state, backups and upgrades

How to back up, restore and upgrade a Plex Manager install. The commands assume
the bundled `docker-compose.yml` (database `plex_wrapped`, user `postgres`, the
`db` and `app` services); outside compose, use the `DATABASE_URL` variants.

## Contents

- [What holds state](#what-holds-state)
- [Backup](#backup)
- [Restore](#restore)
- [Dump before every migration](#dump-before-every-migration)
- [Applying migrations](#applying-migrations)
- [Migration calendar for the 2026 season](#migration-calendar-for-the-2026-season)
- [Code freeze gate](#code-freeze-gate)
- [Installed with db push](#installed-with-db-push)

## What holds state

| State | Needed for a restore | Why |
| --- | --- | --- |
| PostgreSQL | **Mandatory** | Every user, Rewind, invite, subscription and setting, and every stored service secret: the `ENCRYPTED_FIELDS` in `lib/prisma.ts` (Plex, Tautulli, Overseerr, Sonarr and Radarr keys, LLM keys, Stripe and Discord secrets). |
| `ENCRYPTION_KEY` | **Mandatory when set** | The encrypted fields in a dump cannot be decrypted without it. Keep it in your password manager, never next to the dump. A restore with a different key leaves every service secret unreadable until it is re-entered. |
| `NEXTAUTH_SECRET` | Recommended | Signs sessions. A new value signs everyone out. |
| `PLEX_CLIENT_IDENTIFIER` | Recommended | Identifies this install to Plex. A new value makes every member sign in to Plex again. |
| Redis (AOF) | Optional | Holds the job queue and rate-limit counters. Rewind jobs are idempotent and rescheduled when the worker starts. Stripe resends an event whose webhook did not answer 200, but a Stripe job that was queued and then lost with Redis is not redelivered (the webhook already recorded the event id), so after losing Redis compare subscriptions in Admin with the Stripe dashboard. |
| `REWIND_CACHE_DIR` | Not needed | Rebuildable cache, once a release adds it. |

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

If you are rolling back an upgrade, start the **previous** release: the new one
would apply its migrations again at start. To start any release without
applying migrations, set `SKIP_MIGRATIONS=true`.

## Dump before every migration

**Take a dump before every deploy that carries a migration.** Prisma has no
down migrations, so a dump is the only way back. A release carries a migration
when it adds a folder under `prisma/migrations`; when in doubt, take the dump.

During the 2026 Rewind season, take one at these moments too, whether or not the
release carries a migration:

- before the soft-launch release (2026-11-24);
- before the season-open release (2026-11-30);
- before the final cut (2027-01-01).

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
- on every replica but one, so only one process applies migrations.

Afterwards, `npx prisma migrate status` must report "Database schema is up to
date!".

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

Record the three run ids in
`.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/ship-check.md`.

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
during the freeze. Once the final cut has finished (P9.3), set `CODE_FREEZE`
back to `off`.

## Installed with db push

An install made with `npm run db:push` (now contributor-only) has no migration
history, and `db:deploy` would fail on tables that already exist. Baseline it
once, on the old release before upgrading, after a dump:

1. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   must exit 0 (no difference). If it does not, stop: the database has drifted.
2. `npx prisma migrate resolve --applied <name>` for each folder in
   `prisma/migrations`.
3. Only if Stripe was never enabled, run the grandfather `UPDATE` from
   `20260703000000_add_stripe_subscriptions` through `npx prisma db execute --stdin`
   (see [stripe.md](stripe.md#grandfathering-existing-members)).

The README's [Installed with `db push`?](../README.md#installed-with-db-push)
section has the exact commands. The new release's migrations then apply
normally.
