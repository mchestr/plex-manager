# Plex Management System

> **WARNING: This project is a Work In Progress (WIP)**
>
> This project is currently under active development. Features may be incomplete, unstable, or subject to change. Use at your own risk.

**The ultimate companion for your Plex Media Server.**

Plex Management System combines server management tools, member onboarding and invites, and a personal year in review into a single platform. It helps members set up their devices for the best playback, request media and find support, and look back on their year with Rewind (formerly "Plex Wrapped"). Admins manage members, invites, services and an optional Stripe subscription from one place, for Plex and, optionally, Jellyfin.

## Screenshots

<div align="center">

<table>
<tr>
<td width="50%">

**Home Dashboard**

![Home Page](docs/images/home.png)

</td>
<td width="50%">

**Admin Dashboard**

![Admin Dashboard](docs/images/admin-dashboard.png)

</td>
</tr>
<tr>
<td width="50%">

**Setup Wizard**

![Setup Wizard](docs/images/setup.png)

</td>
<td width="50%">

</td>
</tr>
</table>

</div>

---

## Features

### Members
- **Sign in with Plex** (PIN sign-in on plex.tv), or with a **Jellyfin** username and password when an admin turns Jellyfin sign-in on
- **Guided onboarding**: playback settings for each device, how to request titles, and a support link (the Discord server, when configured, and the admin's own instructions)
- **Home page** with Rewind, quick links to the request site and other services, what is new on the server, and in-app announcements
- **Media requests** through the Overseerr request site
- **Account** page: time zone, appearance, Rewind notifications, and **Your data**: delete single marks and watchlist items

### Rewind
Each member's year on the server, as a story of pages (formerly "Plex Wrapped"):
- **A season**: generation opens on 1 December and closes on 31 January by default (both set in Admin, Settings); the admin prepares and opens it from the season console at `/admin/rewind`
- **Built from Tautulli history**: totals, top titles, habits, an archetype, and copy written by the configured AI provider, or template copy without one
- **Article mode**: every Rewind also reads as a short plain article at `/rewind/<year>/read` (each page's headline, a line and at most one small table), which needs no JavaScript and is not indexed by search engines; earlier years open as archive articles
- **Opt-in sharing**: nothing is public until the member makes a link and picks the pages it shows. A link serves a share-safe copy (no other member's name, no server-wide ranking), is signed with the member's name only when they choose, expires at the season close by default, and can be rotated or turned off at any time. Admins can turn public links off for the server
- **Hide titles**: a member can hide titles from their Rewind
- **Playground**: admins try the real pipeline on a member or a golden fixture at `/admin/rewind/playground`; nothing is stored
- See the [Rewind runbook](docs/rewind.md) for the season, its flags and the season close

### Invites
- **Plex and Jellyfin invites** with a code, a use limit, an expiry and the libraries to share; redemption shares the Plex libraries or creates the Jellyfin account

### Watchlist Sync (Optional)
- **Plex watchlist to Overseerr** - Members who turn it on get the titles on their Plex watchlist requested in Overseerr, on the admin's interval or with **Sync Now** (4 an hour)
- **Filed as the member** - Each request is sent as the member's own Overseerr user (`X-Api-User`), so approval follows their Overseerr permissions: auto-approve rules, quotas and the requester shown in Overseerr are theirs, never the admin's
- **Needs an Overseerr account imported from Plex** - A member is matched by their Plex account id, so they must have signed in to Overseerr with Plex once (or been imported from Plex by an admin). Members without a match are skipped, and their card says why
- **Opt-in only** - Nothing syncs for a member who has not turned it on, whoever triggers the sync, nor while the admin has the feature off
- **Admin page** - **Admin → Watchlist sync** holds the on/off switch and the interval, and lists every member's synced titles and how each request went, with search and Status and Type filters
- Without Redis, one process runs the sync on its interval under a database lease, so several containers never sync twice

### Assistants (Optional)
- **Admin assistant** in the admin pages, which can read the server's state through Plex, Tautulli, Overseerr, Sonarr and Radarr tools
- **Discord assistant** (`/assistant` and direct messages to the bot) for linked members
- Every surface that offers an assistant says that server admins can review assistant conversations and names the AI provider that processes them

### Discord (Optional)
- **Linked roles** that follow a member's access and watch hours
- **Slash commands**: `/help`, `/mark`, `/assistant`, `/mystats`, `/mymarks` and `/watching`
- See the [Discord bot guide](docs/discord-bot.md)

### Admin
- **Users**: roles, access, Plex and Jellyfin details, billing, activity, unsharing, disabling and removing a member (with a dry run)
- **Settings** for every service, with connection tests, and **connection health** on the overview
- **Announcements** shown in the app, with Markdown
- **LLM usage and cost** per call and per member, and **share analytics** for Rewind links
- **Queues**, and a privacy section in settings with the retention sweep. Admin and security events are written to an append-only audit table
- **Subscription management** - Cancel, grant access and exempt, and mark users exempt (when Stripe is enabled)

### Stripe Subscriptions (Optional)
- **Stripe-powered access gating** - Non-members can subscribe to get Plex access, or have their Jellyfin account turned on
- **Stripe Checkout & Billing Portal** - No in-app card handling; payment is fully hosted by Stripe
- **Webhook-driven provisioning** - Automatic Plex invite or Jellyfin account on subscribe, and removal on cancellation
- **Off by default** - When disabled, the app behaves exactly as if the feature didn't exist
- See the [Stripe Subscriptions guide](docs/stripe.md) for setup

### Jellyfin
Jellyfin is supported for sign-in, invites, onboarding, admin, Stripe and Discord. What still needs Plex:
- **Rewind** reads Plex history from Tautulli, so a member without a Plex account has no Rewind
- **Watchlist sync** reads the Plex watchlist
- The setup wizard connects Plex; Jellyfin is added afterwards in Admin, Settings

---

## Quick Start

### Prerequisites

- **Node.js** 22 or later (the Docker image ships Node.js 24 LTS)
- **npm**
- **PostgreSQL** database (SQLite is no longer supported as of Prisma v7)
- **Redis**, which Rewind and Stripe subscriptions require (it backs the background job queue)
- Access to:
  - A **Plex server** you own (setup signs in to plex.tv with the owner's account)
  - **Tautulli** (required: Rewind and the statistics read its history)
  - **Overseerr** (optional, for requests and watchlist sync)
  - **Sonarr/Radarr** (optional, for the assistant and Rewind's returning shows)
  - **Jellyfin** (optional, for Jellyfin sign-in and invites)
  - An **AI provider** key (optional): OpenAI, Anthropic, Google or an OpenAI-compatible server, for Rewind copy and the assistants
  - A **Stripe** account (optional, for subscription-based access gating)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/mchestr/plex-manager.git
cd plex-manager
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp example.env .env
```

Edit `.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/plex_manager`)
- `NEXTAUTH_URL` - Your application URL (e.g., `http://localhost:3000` for dev, `https://yourdomain.com` for production)
- `NEXT_PUBLIC_APP_URL` - Optional public URL for share links and images; defaults to `NEXTAUTH_URL` and must have the same origin
- `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `PLEX_CLIENT_IDENTIFIER` - Unique identifier for your app instance (`openssl rand -hex 16`); keep it stable
- `ENCRYPTION_KEYS` - Encrypts the secrets the app stores: `k1:` followed by `openssl rand -base64 32` (required in production)
- `REDIS_URL` - Redis for the job queue and rate limits; Rewind and Stripe need it

4. **Initialize the database**
```bash
npm run db:generate
npm run db:deploy
```
`db:deploy` applies the migrations in `prisma/migrations`, the same command the Docker image runs at start. Upgrades use it too; see [Upgrading](#upgrading).

5. **Start the development server**
```bash
npm run dev
```

6. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)

7. **Claim the server**
Until setup completes, `/setup` asks for a setup code, so nobody else who reaches a fresh install can take it over. Each start prints a new one-time code to the server log; the newest one is valid:
```bash
docker logs <container> | grep 'Setup code'   # or read the `npm run dev` output
```
To choose the code yourself, set `SETUP_TOKEN` (at least 16 characters, e.g. `openssl rand -hex 16`) before starting; it replaces the printed code while it is set. The claim lasts 12 hours in that browser and ends when setup completes.

8. **Connect Plex**
Choose **Connect with Plex** and approve Plex Manager on plex.tv with the account that owns your server. Back in the wizard, pick your server and the address Plex Manager should use (a local one is fastest). Servers shared with that account can't be chosen; only their owner can set them up. If your server doesn't show up, or this browser can't reach plex.tv, open **Enter a token instead** and type the server URL (for example `https://example.com:32400`) and an X-Plex-Token.

9. **Complete the setup wizard**
Plex and Tautulli (URL format: `http://example.com:8181`) are required. Overseerr, Sonarr, Radarr, the two AI providers and Discord are optional: **Skip for now** moves on, and you can set them up later in Admin, Settings. The summary lists what is connected and what was skipped; **Open admin** finishes setup and signs you in with the Plex account you connected.

---

## Development

### Project Structure

```
plex-manager/
├── app/                    # Next.js App Router (pages, layouts, routes)
│   ├── (app)/              # Signed-in member pages: home, account, help, Rewind
│   ├── admin/              # Admin pages
│   ├── api/                # API routes (Stripe webhook, health, metrics, Rewind cards)
│   ├── auth/               # Sign-in callback and error pages
│   ├── invite/             # Invite redemption
│   ├── onboarding/         # Member onboarding
│   ├── rewind/s/           # Public Rewind share links
│   ├── setup/              # Setup claim and first-run wizard
│   └── subscribe/          # Stripe subscription flow
├── actions/                # Server Actions (mutations)
├── components/             # React components
│   ├── admin/              # Admin components
│   ├── dashboard/          # Member home page
│   ├── rewind/             # Rewind story, pages, article mode and sharing
│   ├── setup/              # Setup claim and wizard steps
│   ├── shell/              # App, public and admin shells
│   └── ui/                 # Shared UI primitives
├── lib/                    # Business logic
│   ├── connections/        # Plex, Jellyfin, Tautulli, Overseerr, Sonarr, and Radarr clients
│   ├── data/               # Server-only admin loaders
│   ├── members/            # Member access, removal and export
│   ├── queue/              # BullMQ queues and jobs
│   ├── rewind/             # Rewind presentation: pages, typesetting, cards
│   ├── security/           # Rate limiting, encryption, audit logging
│   ├── stripe/             # Stripe client and subscription sync
│   ├── validations/        # Zod schemas
│   └── wrapped/            # Rewind generation pipeline
├── docs/                   # Operator guides
├── e2e/                    # Playwright end-to-end tests
├── evals/                  # Rewind golden fixtures and eval harness
├── prisma/                 # Database schema and migrations
└── types/                  # TypeScript type definitions
```

CLAUDE.md has the full tree.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production (the standalone server in `.next/standalone`) |
| `npm run start:prod` | Start the standalone production server with `.env` and graceful shutdown |
| `npm run start` | Start the production build with `next start` (no graceful shutdown) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check the app and the tests |
| `npm run knip` | Find unused files, exports and dependencies |
| `npm run design:check` | Check the design-system rules |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run unit tests with coverage and its floors |
| `npm run test:integration` | Run the Postgres and Redis integration suites (needs `TEST_DATABASE_URL` and `TEST_REDIS_URL`) |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run test:e2e:ui` | Run E2E tests in UI mode |
| `npm run env:docs` | Regenerate `docs/environment.md` and `example.env` from `lib/env.ts` |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:deploy` | Apply pending migrations (install and upgrade) |
| `npm run db:push` | Contributor-only: push the schema to a throwaway database while prototyping |
| `npm run db:migrate` | Contributor-only: create a new migration (`prisma migrate dev`) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Deletes all users, Rewinds and service configs, then creates test users. Local or `_test` databases only; needs `E2E_TEST_MODE=true`. Never run it on a host that serves production |
| `npm run register-discord-commands` | Register the Discord slash commands |
| `npm run register-discord-metadata` | Register the Discord linked-role metadata |

The `rewind:*` scripts run the season's operator tasks; the [Rewind runbook](docs/rewind.md) says when to use each.

### Development Guidelines

**📖 For comprehensive development guidelines, see [CLAUDE.md](CLAUDE.md)**

The CLAUDE.md file contains detailed information about:
- Architecture patterns and component design
- Server Actions vs API routes
- Database patterns with Prisma
- Integration guides (Plex, Tautulli, Overseerr, Sonarr/Radarr)
- Security best practices
- Testing strategies
- Code style conventions

#### **Quick Reference**

**Architecture Principles**
- **Server Components by default** - Use Client Components (`'use client'`) only when needed
- **Server Actions** - Prefer Server Actions over API routes for mutations
- **TanStack Query** - Use for all client-side data fetching
- **TypeScript strict mode** - Maintain type safety with exhaustive checks

**Code Style**
- **Tailwind CSS** - Use utility classes over custom CSS
- **Zod** - Validate all user inputs and API responses
- **Error boundaries** - Implement proper error handling and loading states
- **Component organization** - Keep components focused and reusable (max ~200-300 lines)
- **Avoid over-engineering** - Implement exactly what's needed, no premature abstractions

**Testing**
- **Jest** - Unit and integration tests with comprehensive coverage
- **Testing Library** - Component testing utilities
- **Playwright** - E2E testing with authenticated sessions (use `data-testid` selectors)
- See [E2E Testing Guide](e2e/README.md) for authenticated session patterns

**Logging**
- Use the `createLogger` utility from `@/lib/utils/logger`
- See the JSDoc in [`lib/utils/logger.ts`](lib/utils/logger.ts) for log levels, metadata, and best practices

### Database Management

```bash
npm run db:generate   # Generate Prisma Client after schema changes
npm run db:deploy     # Apply pending migrations (install and upgrade)
npm run db:push       # Contributor-only: push the schema to a throwaway database while prototyping
npm run db:migrate    # Contributor-only: create a migration after changing prisma/schema.prisma
npm run db:studio     # Open database GUI
```

**Creating a migration (contributors).** After changing `prisma/schema.prisma`, run `npx prisma migrate dev --create-only --name <descriptive_name>` against a throwaway database whose name ends in `_test`, read the generated `migration.sql`, then apply it with `npm run db:deploy`. Never hand-type a migration timestamp. CI's Schema Drift job runs `node scripts/check-migrations.mjs`, which wants a timestamp later than every earlier folder's, at least two lowercase words in the name (`add_member_export`, not `latest`), and a `migration.sql`; the folders listed in `prisma/migrations/.legacy-names.json` predate the rule.

`20250101000000_init` is a retroactive baseline for installs that predate migrations: a database created with `prisma db push` marks each folder applied with `npx prisma migrate resolve --applied <name>` instead of running it (see [Installed with `db push`?](#installed-with-db-push) and [docs/operations.md](docs/operations.md#installed-with-db-push)).

**Database schema.** `DATABASE_URL` may end in `?schema=<name>` to keep the app's tables in a schema other than `public`. Migrations and the running app both use it. The name must be a letter or `_` followed by letters, digits or `_` (at most 63 characters), or a production server refuses to start.

### Environment Variables

Every variable, with whether production requires it and its default, is in the [environment reference](docs/environment.md), generated from `lib/env.ts` by `npm run env:docs`. Copy `example.env` (generated from the same source) to `.env` to start.

- **Docker Compose (development)**: `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required; `docker compose up` refuses to start without them. `docker-compose.yml` publishes Postgres (5432, 5433) and Redis (6379) on `127.0.0.1` only and builds the app container's `DATABASE_URL` and `REDIS_URL` from the two passwords; use them in your own `.env` URLs as well. A database volume created before this change keeps its old password (`postgres`), so set `POSTGRES_PASSWORD` to that or change it with `ALTER USER`. The compose databases run `postgres:16-alpine` (they were 15): Postgres 16 cannot open a 15 data directory, so dump an existing `db` volume while it still runs 15 (see [docs/operations.md](docs/operations.md#backup)), remove the volume (`docker compose down -v` removes every volume), then start the new one and restore the dump. The app container starts only once `db` and `redis` pass their health checks.
- **Development**: `DEV_*` variables for setup wizard defaults (read only with `NODE_ENV=development` and `DEV_SETUP_PREFILL=true`, until setup is complete)
  - Use URL format: `DEV_PLEX_URL="https://localhost:32400"` (includes protocol and port)

> **Stripe**: There are intentionally **no** `STRIPE_*` environment variables. The secret key, webhook signing secret, and price IDs are stored (encrypted) in the app config and managed entirely from **Admin → Settings → Stripe Subscriptions**. See [docs/stripe.md](docs/stripe.md).

---

## Deployment

Install with the production compose file `deploy/docker-compose.yml` and the guides in `docs/`:

| Guide | What it covers |
|---|---|
| [Deployment](docs/deployment.md) | Docker Compose with the published image, the reverse proxy and `TRUSTED_PROXY_HOPS`, claiming the server, web and worker containers, bare metal, the image and its health check |
| [Environment reference](docs/environment.md) | Every variable, whether production requires it, and its default |
| [Domain move](docs/domain-move.md) | Moving an install to a new host name |
| [Operations](docs/operations.md) | Backups, restores, migrations, encryption keys, request IDs and metrics, member roles and Jellyfin sign-in |
| [Rewind runbook](docs/rewind.md) | The season: flags, opening, monitoring, roll back and the season close |
| [Privacy](docs/privacy.md) | Every table of personal data, member removal, export and retention |
| [Stripe](docs/stripe.md) | Subscriptions, the webhook, and Plex and Jellyfin access |
| [Discord bot](docs/discord-bot.md) | The bot, slash commands and linked roles |
| [Releasing](docs/releasing.md) and [CHANGELOG.md](CHANGELOG.md) | Versions, tags and every release's upgrade notes |

A production server checks the required variables at start and exits with code 1, logging `env.invalid` and the variable's name (never its value), when `NEXTAUTH_SECRET` is missing, shorter than 32 characters, has fewer than 10 distinct characters or is a published placeholder, when `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` is not `https:` (loopback hosts excepted), when `PLEX_CLIENT_IDENTIFIER` is empty, or when there is no usable encryption key. `ALLOW_INSECURE_HTTP=true` lets a LAN-only install run on plain http; it logs a warning at every start, and session cookies are then not Secure, so never set it on an install reachable from the internet.

### Versions and upgrades

- `ghcr.io/mchestr/plex-manager:latest` tracks `main` and changes with every merge. In production, pin a release, for example `:0.3.0`, and move to the next one on purpose.
- [CHANGELOG.md](CHANGELOG.md) lists every release, and each has an **Upgrade notes** block: read the notes of every version between yours and the new one before you pull.
- Rolling back means restoring the dump taken before the upgrade and running the previous tag, because Prisma has no down migrations. A newer image would apply its migrations again at start.
- [docs/releasing.md](docs/releasing.md) describes how releases are cut and what each tag publishes.

### Upgrading

Prisma has no down migrations, so a dump is the only way back from a migration. For every upgrade:

1. **Take a dump**, encrypt it and keep it off the host (see [docs/operations.md](docs/operations.md#backup)):
   ```bash
   docker compose exec -T db pg_dump -U postgres -Fc plex_wrapped > plex-manager-$(date +%F-%H%M).dump
   ```
2. **Read the upgrade notes** in [CHANGELOG.md](CHANGELOG.md) for every version you are moving past, and the [notes kept from earlier releases](#notes-kept-from-earlier-releases) below.
3. **Pull or rebuild**: check out the new release's tag and run `npm ci && npm run build`, or pull the new version's image tag (`:0.3.0`, not `:latest`).
4. **Apply migrations**: run `npm run db:deploy`, or let the container do it at start. The container logs `prisma migrate status` first; start it with `SKIP_MIGRATIONS=true` to apply migrations by hand instead.
5. **Check the app**: sign in, and check that `/api/health` answers 200 with `"database":"ok"` and `"redis":"ok"`; `docker ps` shows the container `(healthy)`.

#### Installed with `db push`?

Earlier instructions installed the schema with `npm run db:push` (now contributor-only), which records no migrations, so `db:deploy` would try to create tables that already exist. Baseline the database once, **on the old release, before upgrading**, after taking a dump:

1. Check that the database matches the old release's schema. This must exit 0 and report no difference:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   ```
   If it reports a difference, stop: the database has drifted, and marking migrations applied would hide that.
2. Mark every folder in `prisma/migrations` as applied:
   ```bash
   for dir in prisma/migrations/*/; do npx prisma migrate resolve --applied "$(basename "$dir")"; done
   ```
3. Only if Stripe subscriptions were **never** enabled, run the exempt-all update from `20260703000000_add_stripe_subscriptions`, which `db push` skipped (see [docs/stripe.md](docs/stripe.md#exempting-existing-members)):
   ```bash
   echo "UPDATE \"User\" SET \"isExempt\" = true;" | npx prisma db execute --stdin
   ```

Then upgrade as above. The new release's migrations, including their data steps, apply normally.

#### Notes kept from earlier releases

These came with the 0.1.0 release ([CHANGELOG.md](CHANGELOG.md)); read them when upgrading from a release before it.

- **Upgrading to a release with `TRUSTED_PROXY_HOPS`**: earlier releases keyed rate limits on the leftmost `X-Forwarded-For` entry, which the client controls; the app now reads the entry the outermost trusted proxy wrote. Check `TRUSTED_PROXY_HOPS` against your proxy chain when you upgrade (see `example.env`). Behind a CDN and a proxy, leaving it at `1` keys every visitor by the CDN's edge address, so visitors who share an edge share the sign-in, invite, share-page and poster limits and get false "Too many attempts" errors.
- **Upgrading to the release that stops email linking**: earlier releases linked a Jellyfin sign-in to any account whose email matched the Jellyfin username, so a Jellyfin user could take over an account, the admin's included, by renaming themselves to its email. The upgrade keeps those links, and the sessions they produced, so every server that allowed Jellyfin sign-in should check them:
  1. Take a database dump before deploying, and store it encrypted. The release runs a migration that clears data and cannot be undone.
  2. Before deploying, list the accounts that hold both a Plex and a Jellyfin ID, and keep the output. Each row is a link an earlier release made by email: either a Jellyfin sign-in onto a Plex account, which the server logs record as "Linked Jellyfin account to existing user" with the Jellyfin username, or a Plex invite redeemed onto a Jellyfin account, which was not logged.
     ```sql
     SELECT id, name, email, "isAdmin", "plexUserId", "jellyfinUserId" FROM "User" WHERE "jellyfinUserId" IS NOT NULL AND "plexUserId" IS NOT NULL;
     ```
  3. For each row whose Jellyfin account you do not recognise as that member's own, remove the link and the email it may have written: `UPDATE "User" SET "jellyfinUserId" = NULL, "email" = NULL WHERE id = '...';`. For each other row whose email is not that member's own address (an earlier release wrote the Jellyfin username there at every Jellyfin sign-in), clear the email only: `UPDATE "User" SET "email" = NULL WHERE id = '...';`. The migration leaves these rows alone, so this review is the only step that removes such an email. The member's Plex email comes back on their next Plex sign-in.
  4. If you removed any link, rotate `NEXTAUTH_SECRET` and restart the app. Everyone has to sign in again, which ends the sessions the Jellyfin user still holds on that account: they last up to 7 days and keep the account's admin rights. Then search the server logs for `ADMIN_PRIVILEGE_GRANTED` and `ADMIN_PRIVILEGE_REVOKED` audit events on those accounts, and review the settings, invites and users changed while the link existed.

  The migration then clears the stored email of every account that has a Jellyfin ID and no Plex ID, because such an email can only have come from a Jellyfin username. Accounts with a Plex ID keep their email unless you cleared it in step 3. An account whose email is cleared finds only the Overseerr requests of an Overseerr user with its Plex ID (none for an account without a Plex ID), cannot start Stripe Checkout, and cannot be invited to Plex by the Stripe grant, until a Plex sign-in stores its Plex email again.
- **Upgrading to the release where the share page reads the database**: a Rewind share link now opens only when its token is exactly 43 URL-safe characters (`A-Z`, `a-z`, `0-9`, `-` and `_`), the shape the app's link generator makes. A link with any other token answers 404 without a database lookup, and nothing is logged. Before deploying, count the shared Rewinds whose token has another shape:
  ```sql
  SELECT count(*) FROM "PlexWrapped" WHERE "shareToken" IS NOT NULL AND "shareToken" !~ '^[A-Za-z0-9_-]{43}$';
  ```
  If the count is not 0, those links stop working after the upgrade. Clear their tokens (`UPDATE "PlexWrapped" SET "shareToken" = NULL WHERE "shareToken" IS NOT NULL AND "shareToken" !~ '^[A-Za-z0-9_-]{43}$';`) and tell the owners to turn sharing on again for a new link, or keep the release back until those links can lapse.


### Docker Deployment

The project includes a `Dockerfile` for containerized deployments, published as `ghcr.io/mchestr/plex-manager`; `deploy/docker-compose.yml` runs it. Publish the app port on loopback or an internal network only, with your reverse proxy in front, because rate limits trust `X-Forwarded-For`. The image, its health check (`/api/health`) and its shutdown behaviour are described in [docs/deployment.md](docs/deployment.md#the-image).

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router) and React 19 |
| **Language** | TypeScript (strict mode) |
| **Database** | Prisma v7 + PostgreSQL |
| **Authentication** | NextAuth.js (Plex PIN sign-in; Jellyfin username and password) |
| **Data Fetching** | Server Components, Server Actions and TanStack Query |
| **Styling** | Tailwind CSS v4 and Base UI primitives |
| **Animations** | Motion |
| **Charts** | Recharts |
| **Validation** | Zod |
| **Job Queue** | BullMQ + Redis |
| **AI** | Vercel AI SDK (OpenAI, Anthropic, Google, OpenAI-compatible) |
| **Payments** | Stripe (optional) |
| **Testing** | Jest + Testing Library + Playwright |

---

## How It Works

1. **Setup** - The server owner claims the install with a one-time code, connects Plex with their plex.tv account, then Tautulli and any optional services
2. **Sign-in** - Members sign in with Plex (or Jellyfin), and only people with access, an invite or, with Stripe on, a subscription get in
3. **Onboarding** - New members are guided through playback settings, requests and support
4. **Home** - Members see Rewind, quick links, what is new and announcements
5. **Rewind** - During the season, each member's year is generated from Tautulli history in the background, and they can read it as a story or an article and share it if they choose

---

## Integrations

### Core Services
- **Plex Media Server** - Primary media server integration (required)
- **Tautulli** - Watch history and statistics (required)

### Optional Services
- **Jellyfin** - Sign-in, invites and Stripe access for Jellyfin members
- **Overseerr** - Media requests and watchlist sync
- **Sonarr** and **Radarr** - Assistant tools; Sonarr also adds returning shows to Rewind
- **Discord** - Linked roles, slash commands and the assistant
- **AI providers** - Rewind copy and the assistants
- **Stripe** - Subscription-based access with auto-provisioned Plex or Jellyfin access (see [docs/stripe.md](docs/stripe.md))
- **Redis** - The BullMQ job queue and shared rate limits; Rewind and Stripe need it

Plex, Tautulli and the optional services are configured in the setup wizard or in Admin, Settings, with connection tests; Jellyfin and Stripe are set up in Admin, Settings.

---

## Security

- **Sign-in through Plex or Jellyfin** - Only a Plex user with access to your server, the holder of a valid invite, or (with Stripe on) a subscriber can become a member; a Jellyfin user signs in only while an admin allows Jellyfin sign-in. Jellyfin accounts are never linked to others by email
- **Sessions that end when access ends** - Unsharing, demotion, disabling, removal and a lapsed subscription end that member's sessions within five minutes
- **Admin checks on every admin action and read** - Admin Server Actions and the server-only admin loaders check the session themselves; a layout is never the only check
- **Input validation** with Zod schemas on every action input, route parameter and external API response
- **SQL injection protection** via Prisma parameterized queries
- **XSS prevention** - React escapes by default; Markdown renders through a sanitising renderer
- **Strict Content Security Policy** - A per-request nonce with `'strict-dynamic'` and no inline or eval scripts; violations are logged through a rate-limited report endpoint, and HSTS is configurable (`docs/operations.md`, "Security headers and CSP")
- **CSRF protection** - Built into Next.js Server Actions
- **Rate limiting** - Redis-backed limits (with an in-process fallback) on sign-in, invite, PIN, share and admin endpoints, keyed by the client IP behind `TRUSTED_PROXY_HOPS` proxies
- **Audit logging** - Admin and security events, including admin reads of member content, go to stdout and an append-only `AuditLog` table
- **Encryption at rest** - Service keys and tokens, member Plex tokens, Discord and Stripe secrets and AI prompt text are AES-256-GCM encrypted under a rotatable keyring (`ENCRYPTION_KEYS`), which production requires; a secret the key cannot read is asked for again instead of breaking the app
- **Signed webhooks** - Stripe webhooks are verified against the raw request body (no admin auth needed)
- **Opt-in sharing** - A Rewind is private until its member makes a link; a link serves a share-safe copy and can be revoked at once
- **Member removal** - Admins can remove a member: their access, sessions, Stripe subscription, Discord grant and stored data go. [docs/privacy.md](docs/privacy.md) lists every table of personal data and what removal does to it
- **Your data** - Members delete single marks and watchlist items from Account, Your data
- **Retention** - A daily sweep deletes content past its window (`docs/privacy.md`, "Retention")

See [CLAUDE.md](CLAUDE.md) for detailed security best practices.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## Acknowledgments

Inspired by Spotify Wrapped. Built for the Plex community.
