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

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**
- **PostgreSQL** database (SQLite is no longer supported as of Prisma v7)
- Access to:
  - A **Plex server** (with admin token)
  - **Tautulli** instance (for viewing statistics)
  - **Overseerr** (optional, for request stats)
  - **Sonarr/Radarr** (optional, for media management features)
  - **OpenAI** API key (optional, for AI insights)

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
npm run db:push
```

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
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Seed database with test data |

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
- See [Logging Guide](docs/logging.md) for details on log levels, metadata, and best practices

### Database Management

```bash
# Generate Prisma Client after schema changes
npm run db:generate

# Push schema changes (development)
npm run db:push

# Create migration (production)
npm run db:migrate

# Open database GUI
npm run db:studio
```

### Environment Variables

See `example.env` for all available configuration options. Key variables:

- **Database**: `DATABASE_URL`
- **Application URLs**: `NEXT_PUBLIC_APP_URL` (preferred, used for public URLs), `NEXTAUTH_URL` (required by NextAuth, should match `NEXT_PUBLIC_APP_URL` in production)
- **Authentication**: `NEXTAUTH_SECRET`, `PLEX_CLIENT_IDENTIFIER`
- **Development**: `DEV_*` variables for setup wizard defaults
  - Use URL format: `DEV_PLEX_URL="https://localhost:32400"` (includes protocol and port)

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

4. **`DATABASE_URL`** - Your production PostgreSQL database connection string
   - Example: `postgresql://user:password@host:port/database`
   - SQLite is no longer supported (Prisma v7 requirement)

### Important Notes

- **No hardcoded localhost**: The application will throw an error in production if neither `NEXT_PUBLIC_APP_URL` nor `NEXTAUTH_URL` is set
- **HTTPS required**: In production, always use HTTPS URLs for both environment variables
- **Domain consistency**: Both URL variables should point to the same domain to avoid authentication issues

### Docker Deployment

The project includes a `Dockerfile` for containerized deployments. When deploying with Docker:

1. Set environment variables in your deployment platform or `.env` file
2. Ensure `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` are set to your production domain
3. The application will fail to start in production mode if these are not configured

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
- **Rate limiting** - Protection for sensitive endpoints
- **Audit logging** - Tracking of admin actions and security events

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
