# Plex Wrapped

> **WARNING: This project is a Work In Progress (WIP)**
>
> This project is currently under active development. Features may be incomplete, unstable, or subject to change. Use at your own risk.

**Your year in movies and shows, beautifully wrapped.**

Plex Wrapped transforms your viewing history into a personalized, shareable year-end summary. Connect your Plex server, Tautulli, and Overseerr to discover your viewing habits, celebrate your favorite content, and share your stats with friends—all powered by AI to make your year feel special.

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

### Comprehensive Statistics
- **Total watch time** breakdown (movies vs. shows)
- **Top movies and shows** with play counts and ratings
- **Server-wide leaderboards** to see how you rank
- **Overseerr integration** for request statistics
- **Visualizations** with animated charts and transitions

### AI-Powered Personalization
- **LLM-generated insights** based on your viewing data
- **Fun facts and comparisons** (e.g., "That's like watching the entire Lord of the Rings trilogy 47 times!")
- **Customizable** with OpenAI support (extensible for other providers)

### Share & Discover
- **One-click sharing** with secure, unguessable tokens
- **Public share links** for easy social media sharing
- **Analytics tracking** for shared wraps
- **Responsive design** that works on any device

### Admin Features
- **User management** dashboard
- **LLM usage tracking** and cost monitoring
- **Share analytics** to see what's popular
- **Regeneration controls** for updating wraps

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **yarn**
- Access to:
  - A **Plex server** (with admin token)
  - **Tautulli** instance (for viewing statistics)
  - **Overseerr** (optional, for request stats)
  - **OpenAI** API key (for AI generation)

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
- `DATABASE_URL` - SQLite database path (default: `file:./dev.db`)
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
- LLM provider (OpenAI)

---

## Development

### Project Structure

```
plex-wrapped/
├── app/                    # Next.js App Router routes
│   ├── admin/              # Admin dashboard pages
│   ├── api/                # API routes
│   ├── auth/               # Authentication pages
│   ├── setup/              # Setup wizard
│   └── wrapped/            # Wrapped viewer pages
├── actions/                 # Server Actions
├── components/             # React components
│   ├── admin/              # Admin-specific components
│   ├── setup-wizard/       # Setup wizard components
│   └── wrapped-sections/   # Wrapped content sections
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and helpers
│   ├── connections/        # Plex/Tautulli/Overseerr clients
│   ├── wrapped/            # Wrapped generation logic
│   └── validations/        # Zod schemas
├── prisma/                 # Prisma schema and migrations
└── types/                  # TypeScript type definitions
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:push` | Push schema changes to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |

### Development Guidelines

#### **Architecture Principles**
- **Server Components by default** - Use Client Components (`'use client'`) only when needed
- **Server Actions** - Prefer Server Actions over API routes for mutations
- **TanStack Query** - Use for all client-side data fetching
- **TypeScript strict mode** - Maintain type safety throughout

#### **Code Style**
- **Tailwind CSS** - Use utility classes over custom CSS
- **Zod** - Validate all user inputs and API responses
- **Error boundaries** - Implement proper error handling and loading states
- **Component organization** - Keep components focused and reusable

#### **Testing**
- **Jest** - Unit and integration tests
- **Testing Library** - Component testing utilities
- **Coverage** - Aim for comprehensive test coverage

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
  - Legacy format (separate protocol/hostname/port) is also supported for backward compatibility

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

4. **`DATABASE_URL`** - Your production database connection string
   - For SQLite: `file:./prisma/production.db`
   - For PostgreSQL: `postgresql://user:password@host:port/database`

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
| **Database** | Prisma + SQLite |
| **Authentication** | NextAuth.js (Plex PIN-based authentication) |
| **Data Fetching** | TanStack Query (React Query) |
| **Styling** | Tailwind CSS |
| **Animations** | Framer Motion |
| **Validation** | Zod |
| **Testing** | Jest + Testing Library |

---

## How It Works

1. **User Authentication** - Sign in with your Plex account using PIN-based authentication
2. **Data Collection** - Fetch viewing statistics from Tautulli and Plex
3. **Statistics Processing** - Aggregate watch time, top content, and leaderboards
4. **AI Generation** - Use LLM to generate personalized insights and fun facts
5. **Wrapped Creation** - Generate shareable year-end summary with animated visualizations
6. **Sharing** - Share your wrapped with secure, unique tokens

---

## Security

- **PIN-based authentication** via Plex
- **Server access verification** - only users with access to your Plex server can sign in
- **Secure token generation** for sharing
- **Admin-only actions** protected by role checks
- **Input validation** with Zod schemas
- **SQL injection protection** via Prisma

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## Acknowledgments

Inspired by Spotify Wrapped. Built for the Plex community.
