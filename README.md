# Plex Management System

> **WARNING: This project is a Work In Progress (WIP)**
>
> This project is currently under active development. Features may be incomplete, unstable, or subject to change. Use at your own risk.

**The ultimate companion for your Plex Media Server.**

Plex Management System transforms your Plex experience by combining powerful management tools, community features, and personalized insights into a single platform. It helps users configure their clients for optimal playback, manage media requests, report issues, and celebrate their viewing habits with "Plex Wrapped".

## Screenshots

<div align="center">

<table>
<tr>
<td width="50%">

**Home Dashboard**

![Home Page](docs/images/home.png)

</td>
<td width="50%">

**Wrapped Viewer**

![Wrapped Viewer](docs/images/wrapped-viewer.png)

</td>
</tr>
<tr>
<td width="50%">

**Setup Wizard**

![Setup Wizard](docs/images/setup.png)

</td>
<td width="50%">

**Admin Dashboard**

![Admin Dashboard](docs/images/admin-dashboard.png)

</td>
</tr>
</table>

</div>

---

## Features

### 🚀 Onboarding & Configuration
- **Guided Onboarding** for new users to the server
- **Client Configuration Guides** to ensure Direct Play and best quality
- **Issue Reporting** workflow to streamline support requests
- **Media Request** integration (via Overseerr)
- **Discord Integration** for community engagement and announcements (optional)
- **Service Status** monitoring for all connected platforms

### 📊 Plex Wrapped & Statistics
- **Total watch time** breakdown (movies vs. shows)
- **Top movies and shows** with play counts and ratings
- **Server-wide leaderboards** to see how you rank
- **Visualizations** with animated charts and transitions
- **AI-Powered Insights** for personalized viewing summaries

### 🤝 Share & Discover
- **One-click sharing** of wrapped stats
- **Public share links** for easy social media sharing
- **Analytics tracking** for shared content
- **Responsive design** that works on any device

### 🛠️ Admin Features
- **User management** dashboard with role-based access control
- **Service management** - Monitor and configure Plex, Tautulli, Overseerr, Sonarr, Radarr
- **Announcements system** - Server-wide notifications with markdown support
- **LLM usage tracking** and cost monitoring
- **Share analytics** to see what's popular
- **Audit logging** for security and compliance
- **Centralized configuration** for all integrations
- **Subscription management** - Cancel, comp/grant access, and mark users exempt (when Stripe is enabled)

### 💳 Subscriptions & Access (Optional)
- **Stripe-powered access gating** - Non-members can subscribe to auto-provision Plex access
- **Stripe Checkout & Billing Portal** - No in-app card handling; payment is fully hosted by Stripe
- **Webhook-driven provisioning** - Automatic Plex invite on subscribe and removal on cancellation
- **Off by default** - When disabled, the app behaves exactly as if the feature didn't exist
- See the [Stripe Subscriptions guide](docs/stripe.md) for setup

---

## Quick Start

### Prerequisites

- **Node.js** 22 or later (the Docker image ships its own Node.js)
- **npm** or **yarn**
- **PostgreSQL** database (SQLite is no longer supported as of Prisma v7)
- **Redis**, which Rewind and Stripe subscriptions require (it backs the background job queue)
- Access to:
  - A **Plex server** (with admin token)
  - **Tautulli** instance (for viewing statistics)
  - **Overseerr** (optional, for request stats)
  - **Sonarr/Radarr** (optional, for media management features)
  - **OpenAI** API key (optional, for AI insights)
  - A **Stripe** account (optional, for subscription-based access gating)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd plex-wrapped
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
- `NEXT_PUBLIC_APP_URL` - Your public application URL (e.g., `http://localhost:3000` for dev, `https://yourdomain.com` for production)
- `NEXTAUTH_URL` - Your application URL for NextAuth callbacks (should match `NEXT_PUBLIC_APP_URL` in production)
- `NEXTAUTH_SECRET` - Generate with: `openssl rand -base64 32`
- `PLEX_CLIENT_IDENTIFIER` - Unique identifier for your app instance (any string, doesn't need to be a UUID)

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

7. **Complete the setup wizard**
On first launch, you'll be guided through configuring:
- Plex server connection (URL format: `https://example.com:32400`)
- Tautulli integration (URL format: `http://example.com:8181`)
- Overseerr integration (optional, URL format: `http://example.com:5055`)
- LLM provider (optional)

---

## Development

### Project Structure

```
plex-wrapped/
├── app/                    # Next.js App Router (pages, layouts, routes)
│   ├── (app)/              # Authenticated app layout group
│   ├── admin/              # Admin dashboard and management
│   ├── api/                # API routes (webhooks, external integrations)
│   ├── auth/               # Authentication pages
│   ├── onboarding/         # User onboarding flow
│   ├── setup/              # Initial setup wizard
│   └── wrapped/            # Wrapped viewer and sharing
├── actions/                # Server Actions (mutations, data operations)
├── components/             # React components
│   ├── admin/              # Admin-specific components
│   ├── generator/          # Wrapped generation UI
│   ├── onboarding/         # Onboarding components
│   ├── setup-wizard/       # Setup wizard steps
│   ├── ui/                 # Shared UI primitives
│   └── wrapped/            # Wrapped display components
├── lib/                    # Utilities, helpers, business logic
│   ├── connections/        # External API clients (Plex, Tautulli, Overseerr, etc.)
│   ├── security/           # Security utilities (rate limiting, CSRF, audit logging)
│   ├── validations/        # Zod schemas for all services
│   ├── wrapped/            # Wrapped generation and statistics
│   └── utils/              # Shared utilities
├── types/                  # TypeScript type definitions
├── prisma/                 # Database schema and migrations
└── e2e/                    # Playwright end-to-end tests
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit/integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run test:e2e:ui` | Run E2E tests in UI mode |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:deploy` | Apply pending migrations (install and upgrade) |
| `npm run db:push` | Contributor-only: push the schema to a throwaway database while prototyping |
| `npm run db:migrate` | Contributor-only: create a new migration (`prisma migrate dev`) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Deletes all users, Rewinds and service configs, then creates test users. Local or `_test` databases only; needs `E2E_TEST_MODE=true`. Never run it on a host that serves production |

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

### Environment Variables

See `example.env` for all available configuration options. Key variables:

- **Database**: `DATABASE_URL`
- **Application URLs**: `NEXT_PUBLIC_APP_URL` (preferred, used for public URLs), `NEXTAUTH_URL` (required by NextAuth, should match `NEXT_PUBLIC_APP_URL` in production)
- **Authentication**: `NEXTAUTH_SECRET`, `PLEX_CLIENT_IDENTIFIER`
- **Jellyfin**: `JELLYFIN_DEVICE_ID` (optional) — the DeviceId reported to Jellyfin at sign-in. By default it is derived from `PLEX_CLIENT_IDENTIFIER`, so leave it unset unless you want your own value. If neither is set, Jellyfin sign-in uses the fixed `plex-manager-server` and logs `jellyfin.auth.device_id_fallback` at warn.
- **Encryption**: `ENCRYPTION_KEY` (optional but strongly recommended in production) — encrypts external-service secrets/tokens at rest. Use a dedicated value (do **not** reuse `NEXTAUTH_SECRET`); generate with `openssl rand -hex 32`. Rollout is non-destructive; rotating it makes previously-encrypted secrets undecryptable until re-saved.
- **Job Queue**: `REDIS_URL` — enables the Redis-backed BullMQ worker. Rewind and Stripe subscriptions require it; without it, only the watchlist sync keeps running, through PostgreSQL polling.
- **Docker Compose (development)**: `POSTGRES_PASSWORD` and `REDIS_PASSWORD` are required; `docker compose up` refuses to start without them. `docker-compose.yml` publishes Postgres (5432, 5433) and Redis (6379) on `127.0.0.1` only and builds the app container's `DATABASE_URL` and `REDIS_URL` from the two passwords; use them in your own `.env` URLs as well. A database volume created before this change keeps its old password (`postgres`), so set `POSTGRES_PASSWORD` to that or change it with `ALTER USER`.
- **Development**: `DEV_*` variables for setup wizard defaults (read only with `NODE_ENV=development` and `DEV_SETUP_PREFILL=true`, until setup is complete)
  - Use URL format: `DEV_PLEX_URL="https://localhost:32400"` (includes protocol and port)

> **Stripe**: There are intentionally **no** `STRIPE_*` environment variables. The secret key, webhook signing secret, and price IDs are stored (encrypted) in the app config and managed entirely from **Admin → Settings → Stripe Subscriptions**. See [docs/stripe.md](docs/stripe.md).

---

## Deployment

### Production Deployment Requirements

When deploying to production, ensure the following environment variables are set:

1. **`NEXT_PUBLIC_APP_URL`** - Your public-facing domain (e.g., `https://yourdomain.com`)
   - Used for sharing links, OG images, and public URLs
   - Must be accessible from the internet

2. **`NEXTAUTH_URL`** - Your application URL (should match `NEXT_PUBLIC_APP_URL`)
   - Used by NextAuth for OAuth callbacks and session management
   - Must match the domain where your app is accessible

3. **`NEXTAUTH_SECRET`** - A secure random string
   - Generate with: `openssl rand -base64 32`
   - Keep this secret and never commit it to version control

4. **`PLEX_CLIENT_IDENTIFIER`** - A unique, stable identifier for this install
   - Generate with: `openssl rand -hex 16`
   - Keep it unchanged across upgrades: Plex and Jellyfin see it as this app's device id

5. **`DATABASE_URL`** - Your production PostgreSQL database connection string
   - Example: `postgresql://user:password@host:port/database`
   - SQLite is no longer supported (Prisma v7 requirement)

A production server checks these at start and exits with code 1, logging `env.invalid` and the variable's name (never its value), when `NEXTAUTH_SECRET` is missing, shorter than 32 characters, has fewer than 10 distinct characters or is a published placeholder (such as `example.env`'s old value), when `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` is not `https:` (loopback hosts excepted), or when `PLEX_CLIENT_IDENTIFIER` is empty. Two URLs with different origins only log a warning. `ALLOW_INSECURE_HTTP=true` lets a LAN-only install run on plain http; it logs a warning at every start, and session cookies are then not Secure, so never set it on an install reachable from the internet.

### Important Notes

- **No hardcoded localhost**: The application will throw an error in production if neither `NEXT_PUBLIC_APP_URL` nor `NEXTAUTH_URL` is set
- **HTTPS required**: In production, both URL variables must be HTTPS, or the server refuses to start (see above). Session cookies are Secure, with the `__Secure-` name, exactly when `NEXTAUTH_URL` is https
- **Domain consistency**: Both URL variables should point to the same domain to avoid authentication issues
- **Reverse proxy and rate limits**: Rate limits key on the client IP (IPv6 clients by their /64), read from `X-Forwarded-For`. Run the app behind a reverse proxy that adds the client address to `X-Forwarded-For` (Traefik and Caddy do by default, nginx with `proxy_add_x_forwarded_for`), and set `TRUSTED_PROXY_HOPS` to the number of proxies that append to it: `1` (the default) for one proxy. Keep the app port off the public internet so every request passes through the proxy; a client that reaches the app directly can choose its own address. Set `REDIS_URL` so limits hold across processes and restarts. The server logs a warning once if `TRUSTED_PROXY_HOPS` is invalid or no client address can be found, because such requests share one bucket.
- **CDN in front of the proxy** (`TRUSTED_PROXY_HOPS=2`): this is only correct when the inner proxy keeps the CDN's `X-Forwarded-For` and appends to it. Traefik and Caddy drop an incoming `X-Forwarded-For` from senders they do not trust, so add the CDN's address ranges to Traefik's `forwardedHeaders.trustedIPs` or Caddy's `trusted_proxies`; otherwise the header has a single entry and every visitor is keyed by a CDN edge address. Let the origin accept traffic only from the CDN (a firewall rule on the CDN's published ranges, or a tunnel), because a request sent straight to the proxy can choose the entry the app reads.
- **Upgrading to a release with `TRUSTED_PROXY_HOPS`**: earlier releases keyed rate limits on the leftmost `X-Forwarded-For` entry, which the client controls; the app now reads the entry the outermost trusted proxy wrote. Check `TRUSTED_PROXY_HOPS` against your proxy chain when you upgrade (see `example.env`). Behind a CDN and a proxy, leaving it at `1` keys every visitor by the CDN's edge address, so visitors who share an edge share the sign-in, invite, share-page and poster limits and get false "Too many attempts" errors.
- **Jellyfin sign-in limits**: the app allows 10 Jellyfin sign-in attempts per 15 minutes from one client address and 5 failed attempts per 15 minutes for one username. Jellyfin's own lockout still applies, and the app's limits do not prevent it: by default Jellyfin disables a user after 3 failed sign-ins (5 for administrators), configurable per user as "Failed login tries before user is locked out". Anyone who knows a username can still lock that account through the sign-in page; the app's limits only slow password guessing. An administrator re-enables a locked user in the Jellyfin dashboard.
- **Jellyfin sign-in on Jellyfin 12**: the app identifies itself in the `Authorization` header, which Jellyfin 12.0 and later require (they ignore the legacy `X-Emby-Authorization` header unless legacy authorization is turned on), and it retries once with the legacy header only if the server answers 400. Each sign-in's Jellyfin session is logged out straight away, because the app keeps only the Jellyfin user ID; a logout that fails or takes longer than 3 seconds is logged as `jellyfin.auth.logout_failed` at warn and leaves that session on the server. Earlier releases left one session per member on the Jellyfin server, listed under the client "Plex Wrapped" and the device ID `plex-wrapped-server` (or your `JELLYFIN_DEVICE_ID`); a Jellyfin administrator can delete them in Dashboard → Devices.
- **Jellyfin accounts are never linked by email**: a Jellyfin sign-in matches only the Jellyfin user ID, and the Jellyfin username is never stored as an email address, because any Jellyfin user can rename themselves to someone else's address. A new member who signs in with both Plex and Jellyfin gets two separate accounts. A Plex sign-in or Plex invite whose email another account already holds still goes ahead, without storing the email. "Allow Jellyfin sign-in" in Admin → Settings turns the Jellyfin provider off, not just the button on the login page; members already signed in with Jellyfin stay signed in until their session expires (at most 7 days).
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

### Upgrading

Prisma has no down migrations, so a dump is the only way back from a migration. For every upgrade:

1. **Take a dump**, encrypt it and keep it off the host (see [docs/operations.md](docs/operations.md#backup)):
   ```bash
   docker compose exec -T db pg_dump -U postgres -Fc plex_wrapped > plex-manager-$(date +%F-%H%M).dump
   ```
2. **Read the release notes** for every version you are moving past, including the "Upgrading to the release…" notes above.
3. **Pull or rebuild**: pull the new release and run `npm ci && npm run build`, or pull or rebuild the Docker image.
4. **Apply migrations**: run `npm run db:deploy`, or let the container do it at start. The container logs `prisma migrate status` first; start it with `SKIP_MIGRATIONS=true` to apply migrations by hand instead.
5. **Check the app**: sign in, and once a release adds `/api/health`, check that it reports healthy.

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
3. Only if Stripe subscriptions were **never** enabled, run the grandfather update from `20260703000000_add_stripe_subscriptions`, which `db push` skipped (see [docs/stripe.md](docs/stripe.md#grandfathering-existing-members)):
   ```bash
   echo "UPDATE \"User\" SET \"isExempt\" = true, \"exemptReason\" = 'grandfathered';" | npx prisma db execute --stdin
   ```

Then upgrade as above. The new release's migrations, including their data steps, apply normally.

### Docker Deployment

The project includes a `Dockerfile` for containerized deployments. When deploying with Docker:

1. Set environment variables in your deployment platform or `.env` file
2. Ensure `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` are set to your production domain
3. The application will fail to start in production mode if these are not configured
4. Publish the app port on loopback or an internal network only, with your reverse proxy in front: `127.0.0.1:3000:3000` under compose `ports:`, `-p 127.0.0.1:3000:3000` with `docker run`, or no published port when the proxy shares a Docker network with the app. Rate limits trust `X-Forwarded-For` (see "Reverse proxy and rate limits" above), so a client that reaches the app port directly gets a fresh limit on every request.
5. The image installs no native toolchain (`python3`, `make`, `g++`). `zlib-sync`, which compresses the Discord gateway, is an optional dependency that is skipped without one, so the Discord bot connects uncompressed. See [docs/discord-bot.md](docs/discord-bot.md).
6. At every start the container logs `prisma migrate status`, then runs `prisma migrate deploy` (what `npm run db:deploy` runs). With `SKIP_MIGRATIONS=true` it logs `SKIP_MIGRATIONS=true: not applying migrations` and starts without applying them. Take a dump before starting a release that carries a migration; see [docs/operations.md](docs/operations.md).

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 14+ (App Router) |
| **Language** | TypeScript (strict mode) |
| **Database** | Prisma v7 + PostgreSQL |
| **Authentication** | NextAuth.js (Plex PIN-based authentication) |
| **Data Fetching** | TanStack Query (React Query) |
| **Styling** | Tailwind CSS |
| **Animations** | Framer Motion |
| **Validation** | Zod |
| **Job Queue** | BullMQ + Redis (optional) |
| **Payments** | Stripe (optional) |
| **Testing** | Jest + Testing Library + Playwright |

---

## How It Works

1. **User Authentication** - Sign in with your Plex account using PIN-based authentication
2. **Onboarding** - New users are guided through server configuration and features
3. **Data Collection** - Fetch viewing statistics from Tautulli and Plex
4. **Dashboard** - View server info, request media, and explore content
5. **Plex Wrapped** - Generate shareable year-end summaries (optional)

---

## Integrations

The platform integrates with multiple services to provide a comprehensive Plex management experience:

### Core Services
- **Plex Media Server** - Primary media server integration (required)
- **Tautulli** - Watch history and statistics tracking (required for Wrapped features)

### Optional Services
- **Overseerr** - Media request management and availability tracking
- **Sonarr** - TV series management and monitoring
- **Radarr** - Movie management and monitoring
- **Discord** - Bot integration for server announcements and community features
- **OpenAI/LLM Providers** - AI-powered insights for Wrapped summaries
- **Stripe** - Subscription-based access gating with auto-provisioned Plex access (see [docs/stripe.md](docs/stripe.md))
- **Redis** - Backing store for the BullMQ background job queue

All integrations are configured through the setup wizard or admin panel, with validation and connection testing built-in.

---

## Security

- **PIN-based authentication** via Plex
- **Server access verification** - Only users with access to your Plex server can sign in
- **Secure token generation** for sharing features
- **Admin-only actions** protected by role checks
- **Input validation** with Zod schemas on all user inputs and API responses
- **SQL injection protection** via Prisma parameterized queries
- **XSS prevention** - React escapes by default, no unsafe HTML rendering
- **CSRF protection** - Built into Next.js Server Actions
- **Rate limiting** - Redis-backed limits on sign-in, invite, PIN, share and admin endpoints, keyed by the client IP behind `TRUSTED_PROXY_HOPS` proxies
- **Audit logging** - Tracking of admin actions and security events
- **Encryption at rest** - External-service API keys/tokens are AES-256-GCM encrypted when `ENCRYPTION_KEY` is set
- **Signed webhooks** - Stripe webhooks are verified against the raw request body (no admin auth needed)

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
