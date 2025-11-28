# Plex Management System - Development Guide

## Project Overview

A Next.js-based Plex management platform that combines server management tools, user onboarding, and personalized "Wrapped" statistics. Integrates with Plex, Tautulli, Overseerr, and optional Discord/LLM providers.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode with exhaustive checks)
- **Database**: Prisma v7 + PostgreSQL (SQLite no longer supported)
- **Auth**: NextAuth.js (Plex PIN-based authentication)
- **State**: TanStack Query (React Query) for client-side data fetching
- **Styling**: Tailwind CSS with utility-first approach
- **Animation**: Framer Motion
- **Validation**: Zod schemas for all inputs/responses
- **Testing**: Jest + Testing Library + Playwright (E2E)

## Architecture Principles

### Component Strategy
- **Server Components by default** - Only add `'use client'` when necessary (interactivity, hooks, browser APIs)
- **Server Actions over API routes** - Prefer Server Actions for mutations, use API routes only for webhooks/third-party integrations
- **Colocation** - Keep related files close (components with tests, actions with validators)

### Data Fetching
- **Server Components**: Fetch directly in components (async/await)
- **Client Components**: Use TanStack Query with proper error/loading states
- **Server Actions**: For mutations, form submissions, user-triggered operations
- **Validation**: All inputs validated with Zod before processing

### File Organization
```
app/                     # Next.js App Router (pages, layouts, routes)
├── (app)/              # Authenticated app layout group
├── admin/              # Admin dashboard and management
├── api/                # API routes (webhooks, external integrations)
├── auth/               # Authentication pages
├── onboarding/         # User onboarding flow
├── setup/              # Initial setup wizard
└── wrapped/            # Wrapped viewer and sharing

actions/                # Server Actions (mutations, data operations)
components/             # React components
├── admin/             # Admin-specific components
├── generator/         # Wrapped generation UI
├── onboarding/        # Onboarding components
├── setup-wizard/      # Setup wizard steps
├── ui/                # Shared UI primitives
└── wrapped/           # Wrapped display components

lib/                    # Utilities, helpers, business logic
├── connections/       # External API clients (Plex, Tautulli, Overseerr, etc.)
├── security/          # Security utilities (rate limiting, CSRF, audit logging)
├── validations/       # Zod schemas for all services
├── wrapped/           # Wrapped generation and statistics
└── utils/             # Shared utilities

types/                  # TypeScript type definitions
prisma/                # Database schema and migrations
```

## Code Style & Conventions

### TypeScript
- **Strict mode enabled** with all checks (noUnusedLocals, noUnusedParameters, noImplicitReturns, noFallthroughCasesInSwitch)
- **No explicit any** - Use proper typing or unknown + type guards
- **Path aliases**: Use `@/` for root imports (e.g., `@/lib/utils`, `@/components/ui/button`)

### React Patterns
```typescript
// Server Component (default)
export default async function Page() {
  const data = await fetchData()
  return <ServerComponent data={data} />
}

// Client Component (when needed)
'use client'

import { useQuery } from '@tanstack/react-query'

export function ClientComponent() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['key'],
    queryFn: async () => { /* ... */ }
  })

  if (isLoading) return <Loading />
  if (error) return <Error error={error} />

  return <div>{data}</div>
}
```

### Server Actions
```typescript
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const schema = z.object({
  field: z.string().min(1)
})

export async function myAction(formData: FormData) {
  // 1. Validate input
  const validated = schema.safeParse({
    field: formData.get('field')
  })

  if (!validated.success) {
    return { error: 'Invalid input' }
  }

  // 2. Auth check
  const session = await getServerSession()
  if (!session) {
    return { error: 'Unauthorized' }
  }

  // 3. Perform operation
  await db.update(validated.data)

  // 4. Revalidate cache
  revalidatePath('/path')

  return { success: true }
}
```

### Styling
- **Tailwind utility classes** - No custom CSS unless absolutely necessary
- **Consistent spacing** - Use standard Tailwind scale (4, 6, 8, 12, 16, etc.)
- **Dark theme first** - Primary design uses dark slate backgrounds
- **Responsive** - Mobile-first approach, test all breakpoints
- **Component variants** - Use `clsx`/`tailwind-merge` for conditional classes

```typescript
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Usage
<div className={cn(
  'base-classes',
  variant === 'primary' && 'variant-classes',
  className
)} />
```

### Error Handling
- **Error boundaries** - Wrap async operations, use Next.js error.tsx files
- **Toast notifications** - Use custom `useToast` hook for user feedback
- **Zod validation** - Validate all external data (user input, API responses)
- **Type-safe errors** - Return error objects, don't throw in Server Actions

```typescript
// Good: Return errors
export async function action() {
  try {
    await operation()
    return { success: true }
  } catch (error) {
    return { error: 'Operation failed' }
  }
}

// Component usage
const result = await action()
if (result.error) {
  showToast({ type: 'error', message: result.error })
}
```

### Security Best Practices
- **Input validation** - All user inputs validated with Zod
- **SQL injection protection** - Use Prisma parameterized queries only
- **XSS prevention** - React escapes by default, never use dangerouslySetInnerHTML without sanitization
- **CSRF protection** - Built into Server Actions
- **Rate limiting** - Use `@/lib/security/rate-limit` for sensitive endpoints
- **Auth checks** - Always verify session in Server Actions and API routes
- **Audit logging** - Use `@/lib/security/audit-log` for admin actions

## Component Design Philosophy

### Single Responsibility Principle
- Each component/function should do ONE thing well
- If a component handles multiple concerns, split it into smaller components
- Extract business logic into separate testable functions/hooks

### File Size Limits
- **React components**: Max ~200-300 lines (if larger, split into smaller components)
- **Utility modules**: Max ~150 lines per file
- If a file exceeds these limits, it's a signal to refactor

### Testability First
- Components should be independently testable
- Extract business logic into separate testable functions/hooks
- Avoid mixing concerns (UI + data fetching + business logic in one component)

### Composition Over Monoliths
- ✅ **GOOD**: `<SeriesList>` uses `<SeriesCard>`, `<SeriesFilter>`, `<SeriesPagination>`
- ❌ **BAD**: One 500-line `<SeriesPage>` component that does everything

### When to Split a Component
- Component has multiple responsibilities
- Component has conditional rendering with 3+ major branches
- Testing the component requires mocking many different concerns
- Component file is hard to navigate/understand at a glance

### Extract Patterns
- **UI logic** → Custom hooks (e.g., `useSeriesFilters`, `usePagination`)
- **API calls** → Service modules (e.g., `sonarrService.ts`)
- **Shared UI** → Presentational components (e.g., `<Card>`, `<Badge>`)
- **Business logic** → Pure functions (easy to test)

## UI Component Guidelines

### Always Use Existing UI Components

**⚠️ DO NOT create new dropdowns, selectors, checkboxes, buttons, etc.**

- ✅ **CORRECT**: Import and use components from `components/ui/`
- ❌ **WRONG**: Creating custom `<select>`, raw `<input type="checkbox">`, or custom dropdown implementations

**Why**: Ensures consistent styling, behavior, and accessibility across the app

**Before creating new UI**: Always check if a component exists in `components/ui/` first

### Common UI Components Available

Located in `components/ui/`:
- Form inputs and controls
- Buttons and interactive elements
- Layout components
- Data display components
- Feedback components (toasts, alerts)

Check the directory for the complete list before implementing custom UI elements.

## Testing Strategy

### Unit/Integration Tests (Jest + Testing Library)
- **Comprehensive coverage** - Test all states (loading, error, success, edge cases)
- **Mock external dependencies** - Mock Next.js components, API calls, toast notifications
- **Accessibility** - Test semantic HTML, ARIA attributes, keyboard navigation
- **User interactions** - Use `@testing-library/user-event` for realistic interactions

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('Component', () => {
  it('should handle user interaction', async () => {
    const user = userEvent.setup()
    const mockFn = jest.fn()

    render(<Component onAction={mockFn} />)

    await user.click(screen.getByRole('button'))

    expect(mockFn).toHaveBeenCalledTimes(1)
  })
})
```

### E2E Tests (Playwright)
- **Authenticated sessions** - Use setup project for auth state
- **Critical user flows** - Test onboarding, wrapped generation, admin actions
- **Cross-browser** - Test Chrome, Firefox, Safari (webkit)
- See `e2e/README.md` for authenticated session patterns

**⚠️ CRITICAL - Playwright Best Practices**:
- **ALWAYS use `data-testid` for selectors** to prevent flaky tests
- ✅ **CORRECT**: `await page.getByTestId('submit-button').click()`
- ❌ **WRONG**: Using CSS classes, text content, or DOM structure as selectors
- When writing tests, add `data-testid` attributes to components if they don't exist
- Test IDs should be descriptive and stable (won't change with styling/content updates)
- Example: `<button data-testid="sonarr-series-add-button">Add Series</button>`

### Test Organization
- Component tests in `__tests__/` directories alongside components
- E2E tests in `e2e/` directory
- Run tests: `npm test` (unit), `npm run test:e2e` (E2E)

## Logging

Use the centralized logger utility:

```typescript
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('feature-name')

logger.info('Operation started', { userId, action })
logger.error('Operation failed', { error, context })
logger.warn('Deprecation warning', { feature })
```

See `docs/logging.md` for log levels, metadata, and best practices.

## Database

### Prisma Workflow
```bash
# After schema changes
npm run db:generate    # Generate Prisma Client
npm run db:push        # Push to dev database (development)
npm run db:migrate     # Create migration (production)
npm run db:studio      # Open database GUI
```

### Prisma Patterns
- **Always use Prisma Client** - Never write raw SQL
- **Type safety** - Leverage generated types
- **Transactions** - Use `$transaction` for multi-step operations
- **Relations** - Use `include` sparingly, prefer separate queries for large datasets
- **Import from generated client** - Use `@/lib/generated/prisma/client` for imports:
  ```typescript
  import { PrismaClient, Prisma } from '@/lib/generated/prisma/client'
  ```

## Environment Variables

### Required Production Variables
```env
# Application URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com    # Public-facing URL
NEXTAUTH_URL=https://yourdomain.com           # Auth callbacks (should match above)

# Security
NEXTAUTH_SECRET=                               # Generate with: openssl rand -base64 32
PLEX_CLIENT_IDENTIFIER=                        # Any unique string

# Database (PostgreSQL required for Prisma v7)
DATABASE_URL=postgresql://user:password@localhost:5432/plex_manager
```

### Development Shortcuts
- Use `DEV_*` variables in `.env` to pre-fill setup wizard
- Format: `DEV_PLEX_URL="https://localhost:32400"` (include protocol + port)
- See `example.env` for all available options

## Common Patterns

### Loading States
```typescript
// App Router - loading.tsx
export default function Loading() {
  return <Skeleton />
}

// Client Component - Suspense
<Suspense fallback={<Skeleton />}>
  <AsyncComponent />
</Suspense>
```

### Error States
```typescript
// App Router - error.tsx
'use client'

export default function Error({ error, reset }: {
  error: Error
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Form Handling
```typescript
// With Server Actions
<form action={serverAction}>
  <input name="field" required />
  <button type="submit">Submit</button>
</form>

// With client-side validation
const [isPending, startTransition] = useTransition()

const handleSubmit = (formData: FormData) => {
  startTransition(async () => {
    const result = await serverAction(formData)
    if (result.error) {
      showToast({ type: 'error', message: result.error })
    }
  })
}
```

## Integration Patterns

### Plex API
```typescript
import { getPlexClient } from '@/lib/connections/plex'

const client = await getPlexClient()
const library = await client.getLibrary()
```

**Official Documentation**: [developer.plex.tv](https://developer.plex.tv) (OpenAPI standard)

**API Conventions**:
- **Authentication**: `X-Plex-Token` header or query parameter
- **Default Port**: 32400
- **Response Format**: XML by default, JSON with `Accept: application/json` header
- **Response Structure**: Root `<MediaContainer>` node with attributes and child nodes
- **Timestamps**: All timestamps in Epoch time
- **API Type**: RESTful

**Common Endpoints**:
- `/library/sections` - Get all libraries
- `/status/sessions` - Get active sessions (now playing)
- `/library/sections/{id}/refresh` - Refresh library
- `/:/scrobble` - Mark as watched
- `/:/unscrobble` - Mark as unwatched
- `/library/sections/{id}/all` - Get all items in library
- `/search` - Search across libraries

### Tautulli API
```typescript
import { getTautulliClient } from '@/lib/connections/tautulli'

const client = await getTautulliClient()
const history = await client.getHistory()
```

**Official Documentation**: [docs.tautulli.com/extending-tautulli/api-reference](https://docs.tautulli.com/extending-tautulli/api-reference)

**API Conventions**:
- **Endpoint Structure**: `http://IP:PORT[/HTTP_ROOT]/api/v2?apikey=$apikey&cmd=$command`
- **Authentication**: API key in query parameter `?apikey=YOUR_API_KEY`
- **API Key Location**: Settings → Web Interface → API → Show API Key
- **Default Port**: 8181
- **Response Format**: JSON by default, optional `out_type` parameter for XML
- **Response Structure**: `{"response": {"result": "success", "message": null, "data": [...]}}`

**Key Commands**:
- `get_activity` - Current streaming activity
- `get_history` - Playback history with filters
- `get_libraries` - List all libraries
- `get_users` - List all users
- `get_metadata` - Detailed media metadata by rating_key
- `terminate_session` - Stop a streaming session
- `notify` - Send notifications

**Common Parameters**: `user_id`, `rating_key`, `section_id`, `start`, `length`, `order_column`, `order_dir`

### Overseerr API

**Official Documentation**: [api-docs.overseerr.dev](https://api-docs.overseerr.dev) (Swagger/OpenAPI)

**API Conventions**:
- **Authentication**: Two methods supported:
  - Header: `X-Api-Key: YOUR_API_KEY` (recommended for integrations)
  - Cookie authentication (for web UI logins via `/auth/plex` or `/auth/local`)
- **API Key Location**: Settings → General → API Key
- **Default Port**: 5055
- **Response Format**: JSON
- **Local API Docs**: Also available at `http://localhost:5055/api-docs`

**Common Endpoints**:
- `/api/v1/request` - Submit/manage media requests
- `/api/v1/search` - Search for movies/TV shows
- `/api/v1/user` - User management
- `/api/v1/settings` - Get/update settings
- `/api/v1/media/{tmdbId}` - Get media status and availability
- `/api/v1/request/{requestId}/approve` - Approve requests
- `/api/v1/request/{requestId}/decline` - Decline requests

**Integration**: Connects to Plex, Sonarr, and Radarr
**Permissions System**: Granular permission control (ADMIN, AUTO_APPROVE, MANAGE_REQUESTS, etc.)

### Sonarr/Radarr API

**Official Documentation**:
- Sonarr: [sonarr.tv/docs/api](https://sonarr.tv/docs/api)
- Radarr: [radarr.video/docs/api](https://radarr.video/docs/api)

**API Conventions** (applies to both):
- **Authentication**: API key can be provided via:
  - Header: `X-Api-Key: YOUR_API_KEY` (recommended)
  - Query parameter: `?apikey=YOUR_API_KEY` (also supported)
- **API Key Location**: Settings → General → Security → API Key
- **Default Ports**: Sonarr (8989), Radarr (7878)
- **Base URL**: If using reverse proxy, may need URL base (e.g., `/sonarr`)
- **API Version**: All use v3 API (v2 deprecated, v4 coming)
- **Content-Type**: `application/json` for POST/PUT requests
- **Error Handling**: Returns standard HTTP status codes

**Common Endpoints**:
- `/api/v3/series` (Sonarr) or `/api/v3/movie` (Radarr) - Get all items
- `/api/v3/command` - Trigger actions (RefreshSeries, RescanMovie, etc.)
- `/api/v3/qualityprofile` - Get quality profiles
- `/api/v3/rootfolder` - Get root folders

**⚠️ CRITICAL**: When generating browser URLs to link to media:
- ✅ **CORRECT**: Use `titleSlug` field from API response (e.g., `/series/game-of-thrones`)
- ❌ **WRONG**: Using `id` field will create broken links
- Example: `https://sonarr.example.com/series/{titleSlug}` NOT `/series/{id}`

**Security Note**: API keys provide admin access - keep them secret!

### LLM Provider
```typescript
import { getLLMProvider } from '@/lib/connections/llm-provider'

const provider = await getLLMProvider()
const response = await provider.chat({ messages })
```

## Avoid Over-Engineering

- **Don't add features not requested** - Implement exactly what's asked
- **No premature abstractions** - Three uses before extracting
- **Trust internal code** - No defensive checks for internal functions
- **Validate at boundaries** - User input and external APIs only
- **Delete unused code** - No `_unused` variables or backwards-compatibility hacks
- **Comments when necessary** - Write self-documenting code, add comments only for non-obvious logic

## Key Don'ts

- Don't use API routes for internal mutations (use Server Actions)
- Don't mark components as `'use client'` unless they need interactivity
- Don't write custom CSS when Tailwind utilities exist
- Don't validate internal function arguments (trust TypeScript)
- Don't create abstractions for single-use code
- Don't add error handling for impossible states
- Don't use `any` type (use `unknown` + type guards)
- Don't commit `.env` files or secrets
- Don't skip Zod validation on user inputs or external API responses

## Discord Integration (Optional)

If Discord features are enabled:
- Bot commands in `lib/discord/bot.ts`
- Safety checks in `lib/discord/chat-safety.ts`
- Register metadata: `npm run register-discord-metadata`
- See `docs/discord-bot.md` for setup

## Deployment Checklist

1. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to production domain
2. Generate secure `NEXTAUTH_SECRET`
3. Configure production `DATABASE_URL`
4. Run database migrations: `npm run db:migrate`
5. Build: `npm run build`
6. Start: `npm run start:prod` (uses server.js)
7. Verify environment variables are set (app will fail on startup if missing)

## Claude Code Workflow Patterns

### Custom Slash Commands

The project includes custom slash commands in `.claude/commands/`:
- `/test` - Run tests (unit, E2E, with various modes)
- `/lint` - Run ESLint with optional auto-fix
- `/build` - Build the application and check for errors
- `/review` - Perform comprehensive code review
- `/create-issues` - Convert improvement ideas to GitHub issues
- `/fix-tests` - Automated unit test fixer agent
- `/fix-e2e` - Automated Playwright E2E test fixer agent

### Agent Patterns

**DO NOT create service-specific agents** (e.g., Sonarr-agent, Radarr-agent). Instead:
- Use API documentation in this file (see Integration Patterns section)
- Reference official API docs when working with external services

**DO use workflow agents** for complex, multi-step processes:

#### Test Fixer Agent (`/fix-tests`)
- Runs all unit tests and captures failures
- Fixes tests one-by-one iteratively
- Verifies each fix by re-running specific test
- Maintains todo list with progress tracking
- Provides clear audit trail of changes
- Best for: Batch fixing tests after refactoring

#### Playwright Test Fixer Agent (`/fix-e2e`)
- Runs E2E suite and captures failures with screenshots
- Fixes tests following project conventions (data-testid selectors)
- Updates components to add missing test IDs
- Handles browser-specific issues
- Verifies fixes don't introduce regressions
- Best for: Maintaining E2E test suite health

### Browser Automation & Testing

**Playwright** is used for all E2E testing and browser automation:
- Configured in project (see `npm run test:e2e` scripts)
- Tests located in `e2e/` directory
- Supports Chrome, Firefox, and Safari (webkit)
- Use `/fix-e2e` command for automated test repair

**MCP Servers**: Not currently used. The project uses direct Playwright integration instead of MCP browser automation servers.

## Additional Resources

- E2E Testing: See `e2e/README.md`
- Logging: See `docs/logging.md`
- Discord Bot: See `docs/discord-bot.md`
- Project README: See `README.md`
