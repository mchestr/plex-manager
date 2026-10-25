# Deployment

How to run Plex Manager in production: with Docker Compose and the published
image (recommended), behind a reverse proxy, or on bare metal. Every variable is
in [the environment reference](environment.md). Backups and upgrades are in
[operations](operations.md); moving to another host name is in
[domain move](domain-move.md).

## Contents

- [What you need](#what-you-need)
- [Install with Docker Compose](#install-with-docker-compose)
- [Reverse proxy](#reverse-proxy)
- [Claim the server](#claim-the-server)
- [Web and worker containers](#web-and-worker-containers)
- [Bare metal](#bare-metal)
- [The image](#the-image)
- [After the install](#after-the-install)

## What you need

- A host with Docker Engine and the Compose plugin (or Node.js 22.9 or later
  for [bare metal](#bare-metal); the image runs Node.js 24).
- A host name, such as `plex.example.com`, pointing at the host, and a reverse
  proxy that terminates TLS. A production server refuses to start unless its
  URLs are https (see `ALLOW_INSECURE_HTTP` for a LAN-only install).
- A Plex server. Jellyfin, Tautulli, Overseerr, Discord, Stripe and an LLM
  provider are optional and configured in the setup wizard or later in Admin →
  Settings.

## Install with Docker Compose

`deploy/docker-compose.yml` runs three services: `app` (the published image
`ghcr.io/mchestr/plex-manager`), `db` (`postgres:16-alpine`) and `redis`
(`redis:7-alpine` with a password and append-only persistence). Postgres and
Redis publish no ports; the app listens on `127.0.0.1:3000` for the reverse
proxy. Every app setting comes from `.env`, and nothing in the compose file
overrides it.

1. Make a folder and fetch the compose file and the example environment:
   ```bash
   mkdir -p /opt/plex-manager && cd /opt/plex-manager
   curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/mchestr/plex-manager/main/deploy/docker-compose.yml
   curl -fsSLo .env https://raw.githubusercontent.com/mchestr/plex-manager/main/example.env
   chmod 600 .env
   ```
2. Edit `.env`:
   ```env
   POSTGRES_PASSWORD="<openssl rand -hex 16>"
   REDIS_PASSWORD="<openssl rand -hex 16>"
   PLEX_MANAGER_VERSION="0.2.0"   # a published release; leave unset for latest, which tracks main

   NEXTAUTH_URL="https://plex.example.com"
   NEXT_PUBLIC_APP_URL="https://plex.example.com"
   NEXTAUTH_SECRET="<openssl rand -base64 32>"
   PLEX_CLIENT_IDENTIFIER="<openssl rand -hex 16>"
   ENCRYPTION_KEYS="k1:<openssl rand -base64 32>"

   # db and redis are the compose service names
   DATABASE_URL="postgresql://postgres:<POSTGRES_PASSWORD>@db:5432/plex_wrapped?schema=public"
   REDIS_URL="redis://:<REDIS_PASSWORD>@redis:6379"
   ```
   Delete or comment out the development lines you do not need: the `DEV_*`
   block and `E2E_DATABASE_URL` are for development and tests only.
   `ENCRYPTION_KEYS` encrypts the secrets the app stores, and a production
   server refuses to start without it. Keep it in your password manager, never
   beside a database dump; generating, rotating and losing a key are in
   [operations](operations.md#encryption-keys).
3. Start it:
   ```bash
   docker compose pull
   docker compose up -d
   docker compose ps   # app shows (healthy) within about a minute
   ```
   At every start the container logs `prisma migrate status`, applies pending
   migrations, then starts the server. Take a dump before starting a release
   that carries a migration ([operations](operations.md#dump-before-every-migration)).

**Versions.** Pushing a `v*` tag publishes the image as `X.Y.Z` and `X.Y`;
`latest` and `main` track the `main` branch. Pin a release with
`PLEX_MANAGER_VERSION` in production, and read the release notes before you
change it ([releasing](releasing.md) explains the tags and the changelog's
upgrade notes). Prisma has no down migrations, so rolling back means restoring the
dump taken before the upgrade and running the previous tag.

**Data.** The `db-data` volume is the only state to back up
([operations](operations.md#backup)). `redis-data` holds the job queue and
rate-limit counts, and `app-cache` holds Next's and Rewind's caches; both can
be rebuilt.

## Reverse proxy

The app trusts `X-Forwarded-For` for rate limits, so every request must pass
through a proxy that appends the client address to it, and the app port must
stay off the network (the compose file binds it to `127.0.0.1`).
`TRUSTED_PROXY_HOPS` is the number of proxies that append to the header,
counted from the app:

- `1` (the default): one proxy, such as Caddy, nginx or Traefik, in front of the app.
- `2`: a CDN or tunnel (Cloudflare) in front of that proxy. The inner proxy must
  trust the CDN's address ranges (Caddy `trusted_proxies`, Traefik
  `forwardedHeaders.trustedIPs`, nginx `set_real_ip_from`) or it drops the CDN's
  header and every visitor is keyed by a CDN edge address. Let the origin accept
  traffic only from the CDN.
- `0`: no proxy. Best-effort only, because clients can then choose their key.

A wrong value lets clients pick their own rate-limit address, or puts many
visitors in one bucket. The server logs a warning once when the value is invalid
or no client address can be found.

### Caddy

Caddy gets a certificate on its own and sets `X-Forwarded-For`,
`X-Forwarded-Proto` and `X-Forwarded-Host` by default:

```caddyfile
plex.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

With `TRUSTED_PROXY_HOPS=1` (the default) nothing else is needed.

### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name plex.example.com;

    ssl_certificate     /etc/letsencrypt/live/plex.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/plex.example.com/privkey.pem;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 80;
    server_name plex.example.com;
    return 301 https://$host$request_uri;
}
```

`$proxy_add_x_forwarded_for` appends the client address to any header the
client sent, which is what `TRUSTED_PROXY_HOPS=1` expects. Never set the header
to `$remote_addr` behind a CDN: that discards the CDN's entry.

## Claim the server

Until the setup wizard finishes, only a browser that entered the setup code can
run it, so nobody else who finds the site first can take it over. While setup is
incomplete, every start prints a new one-time code (the newest one is valid):

```bash
docker compose logs app | grep 'Setup code'
# app-1  | Setup code: K7QM-4WZD-P2HX
```

Open `https://plex.example.com/setup`, enter the code, and follow the wizard: it
connects your Plex server and the optional services, and the Plex server owner
becomes the admin. Jellyfin is added afterwards in Admin → Settings. To use a
fixed value instead of the printed code, set `SETUP_TOKEN` (at least 16
characters, `openssl rand -hex 16`) in `.env` and restart; it stays valid while
it is set, so remove it once setup is done.

## Web and worker containers

The compose file above runs one container with `PROCESS_ROLE=all` (the
default): it serves the site and runs the job queue, the schedulers and the
Discord bot. To scale the site, run `web` containers and one `worker` from the
same image, as in
[`examples/docker-compose.workers.yml`](examples/docker-compose.workers.yml).
A worker serves only `/api/health` and `/api/metrics`, and without a `worker`
or `all` container no jobs run. The roles and their trade-offs are in
[operations](operations.md#web-and-worker-containers).

## Bare metal

Without Docker, run the app with Node.js 22.9 or later against your own
PostgreSQL 16 and (recommended) Redis 7:

```bash
git clone https://github.com/mchestr/plex-manager.git && cd plex-manager
git checkout v0.2.0              # a published release tag, or stay on main
cp example.env .env && chmod 600 .env
# Edit .env: the same variables as above, with DATABASE_URL and REDIS_URL
# pointing at your own Postgres and Redis.
npm ci
npm run build                    # with the final NEXT_PUBLIC_APP_URL in .env
npm run db:deploy                # take a dump first on an existing install
npm run start:prod
```

- Set `NEXT_PUBLIC_APP_URL` before `npm run build`: Next inlines `NEXT_PUBLIC_*`
  values into the build, so changing it later needs a rebuild
  ([domain move](domain-move.md)).
- `npm run build` writes the standalone server to `.next/standalone`, and its
  `postbuild` step copies `.next/static` and `public` beside it.
  `npm run start:prod` runs that server with `.env` loaded and
  `NEXT_MANUAL_SIG_HANDLE=true`, so on SIGTERM the app drains its jobs and the
  Discord bot before exiting. It listens on `PORT` (default 3000) on every
  interface (`HOSTNAME`, default `0.0.0.0`); set `HOSTNAME=127.0.0.1` when the
  proxy runs on the same host.
- `npm run start` (`next start`) also serves the build, without the graceful
  shutdown.
- Run it under a service manager (systemd, pm2) that restarts it, and send
  SIGTERM to stop it.
- After every upgrade: dump, `git checkout` the new tag, `npm ci`,
  `npm run build`, `npm run db:deploy`, restart.

## The image

- It runs Node.js 24 LTS under `tini` as the unprivileged `nextjs` user. The
  app files are owned by root and cannot be rewritten at run time; the one
  writable path is `/app/.next/cache`, where Next's own cache and Rewind's
  (`REWIND_CACHE_DIR=/app/.next/cache/rewind`: posters, cards, fonts) live.
  The compose file mounts the `app-cache` volume there; it can always be
  rebuilt.
- Migrations run through a Prisma CLI pinned with its own lockfile in
  `docker/prisma-cli/` (a test keeps its versions equal to the root lockfile).
  With `SKIP_MIGRATIONS=true` the container logs
  `SKIP_MIGRATIONS=true: not applying migrations` and starts without applying
  them.
- The site starts serving without waiting for Redis or Discord. The queue
  worker retries Redis with backoff for about two minutes and then stays off
  (logging `queue.redis_unreachable`) until the next restart.
- On `docker stop` (SIGTERM) the app drains running jobs, stops the Discord bot
  and releases its lock, closes its connections, and exits with 0, or with 1
  if that takes longer than `SHUTDOWN_GRACE_MS` (default 8000 ms, below
  Docker's 10 s stop timeout). The image and `npm run start:prod` set
  `NEXT_MANUAL_SIG_HANDLE=true` so the app handles the signal instead of Next;
  in-flight requests finish inside the same grace window because the process
  exits last.
- The image installs no native toolchain. `zlib-sync`, which compresses the
  Discord gateway, is an optional dependency that is skipped without one, so
  the Discord bot connects uncompressed ([Discord bot](discord-bot.md)).
- `GET /api/health` checks the database and, when `REDIS_URL` is set, Redis,
  each within 2 seconds. It answers `200` with
  `{"status":"ok","checks":{"database":"ok","redis":"ok"}}`, or `503` with
  `"status":"fail"` and the failed check (`redis` is `not_configured` without
  `REDIS_URL`, which does not fail it). It needs no sign-in and carries no
  hostnames or error text. `GET /api/health?probe=live` answers `200` without
  touching either; the image's `HEALTHCHECK` uses it, so a Redis outage, which
  the site survives, never gets the container restarted.

## After the install

- **Health.** `GET /api/health` checks the database and Redis and answers 503
  when either fails; point monitoring at it. The image's health check uses
  `/api/health?probe=live`, which never touches either.
- **Metrics.** Set `METRICS_TOKEN` to serve Prometheus metrics at `/api/metrics`
  ([operations](operations.md#request-ids-and-metrics)).
- **Discord.** Register the slash commands and linked-role metadata from a
  checkout with `npm run register-discord-commands` and
  `npm run register-discord-metadata`; see [the Discord bot guide](discord-bot.md).
- **Stripe.** Register the webhook at `https://plex.example.com/api/stripe/webhook`;
  see [Stripe](stripe.md).
- **Backups.** Schedule `pg_dump` ([operations](operations.md#backup)) and back up
  `.env` separately, never beside the dump: `ENCRYPTION_KEYS` (or `ENCRYPTION_KEY`) and
  `NEXTAUTH_SECRET` cannot be recovered from the dump, and a restore under a
  different key stops the app at boot ([encryption keys](operations.md#encryption-keys)).
