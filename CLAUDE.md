# Plex Management System - Development Guide

## Project Overview

A Next.js-based Plex management platform that combines server management tools, user onboarding, and personalized "Wrapped" statistics. Integrates with Plex, Tautulli, Overseerr, and optional Discord/LLM providers.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript (strict mode with exhaustive checks)
- **Database**: Prisma v7 + PostgreSQL (SQLite no longer supported)
- **Auth**: NextAuth.js (Plex PIN-based authentication)
- **State**: TanStack Query (React Query) for client-side data fetching
- **Styling**: Tailwind CSS v4 with utility-first approach
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
├── (app)/              # Authenticated member layout group
│   ├── discord/        # Discord account linking
│   └── wrapped/        # Wrapped viewer
├── (public)/           # Public pages (shared Wrapped links)
├── admin/              # Admin dashboard and management
├── api/                # API routes (webhooks, external integrations)
├── auth/               # Authentication pages
├── invite/             # Invite redemption
├── onboarding/         # User onboarding flow
├── setup/              # Initial setup wizard
└── subscribe/          # Stripe subscription flow

actions/                # Server Actions (mutations, data operations)
components/             # React components
├── admin/             # Admin-specific components
├── dashboard/         # Member home page cards
├── generator/         # Wrapped generating animation
├── onboarding/        # Onboarding components
├── setup/
│   └── setup-wizard/  # Setup wizard steps
├── ui/                # Shared UI primitives
└── wrapped/           # Wrapped display components

hooks/                  # Shared client hooks
lib/                    # Utilities, helpers, business logic
├── connections/       # External API clients (Plex, Tautulli, Overseerr, etc.)
├── design/            # Token mirror of app/globals.css and colour contrast helpers
├── discord/           # Discord bot, commands and linking
├── llm/               # LLM chat client and pricing
├── rewind/            # Rewind 2026: typesetter, format rules, page registry, card fonts
├── security/          # Security utilities (rate limiting, CSRF, audit logging)
├── ui/                # UI helpers: status tones, safe Markdown links, error copy
├── validations/       # Zod schemas for all services
├── wrapped/           # Wrapped generation and statistics
└── utils/             # Shared utilities

evals/                  # Rewind golden fixtures and eval harness (evals/rewind/README.md)
types/                  # TypeScript type definitions (admin.ts, discord.ts, wrapped.ts, ...)
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
Build every action with `publicAction`, `memberAction` or `adminAction` from
`@/lib/actions/define-action`. The helper checks the session, parses the input
with Zod (`VALIDATION` with `fieldErrors`), spends an optional named rate limit,
runs the handler and maps a thrown error to `INTERNAL` without its text. Results
are `ActionResult<T>` (`@/lib/actions/result`):
`{ success: true, data }` or `{ success: false, code, error }`.

```typescript
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

import { memberAction } from '@/lib/actions/define-action'
import { fail, ok } from '@/lib/actions/result'

export const renameThing = memberAction({
  input: z.object({ name: z.string().min(1).max(80) }),
  rateLimit: { name: 'checkout' },           // optional; keyed by user id (public actions: by address)
  fallbackError: 'Could not rename it',      // copy for a thrown error
  handler: async ({ name }, { userId }) => {
    const thing = await prisma.thing.findUnique({ where: { userId } })
    if (!thing) return fail('NOT_FOUND', 'Nothing to rename')

    await prisma.thing.update({ where: { userId }, data: { name } })
    revalidatePath('/path')
    return ok(null)
  },
})
```

- Never return `error.message`; ESLint bans `error instanceof Error ? error.message : ...` in `actions/` and `app/api/`.
- Route handlers validate params with `parseRouteParams` / `parseSearchParams` (`@/lib/actions/route`) and the schemas in `@/lib/validations/params`.
- Admin modules still on `requireAdmin()` move onto `adminAction` in P11.5.

### Styling
- **Tailwind utility classes** - No custom CSS unless absolutely necessary
- **Consistent spacing** - Use standard Tailwind scale (4, 6, 8, 12, 16, etc.)
- **Dark theme first** - Primary design uses dark slate backgrounds
- **Responsive** - Mobile-first approach, test all breakpoints
- **Component variants** - Use `clsx`/`tailwind-merge` for conditional classes
- **Design-debt ratchet** - `npm run design:report` counts the patterns the design system bans (raw palette colours, gradients, blur, caps eyebrows, infinite motion, arrows and "Wrapped" in copy, and more; rules in `scripts/design-system/rules.mjs`). CI's `design:check` fails when a file's count in `design-debt.json` rises or a new file counts above zero; run `npm run design:update` when counts fall. After a merge that renames or moves files on `main`, regenerate the baseline with `npm run design:baseline` and review its diff

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
// The action helper returns a coded failure; it never throws
const result = await renameThing({ name })
if (!result.success) {
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

### Prisma Mocks and Factories
- **Typed Prisma mock** - Mock `@/lib/prisma` with the shared helper, never a hand-rolled object of `jest.fn()`s:
  ```typescript
  import { mockReset } from 'jest-mock-extended'
  import { prismaMock } from '@/__tests__/helpers/prisma-mock'
  import { buildUser } from '@/__tests__/helpers/factories'

  jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
  beforeEach(() => mockReset(prismaMock))

  prismaMock.user.findUnique.mockResolvedValue(buildUser({ isAdmin: true }))
  ```
- **Factories** - `__tests__/helpers/factories.ts` builds full rows (`buildUser`, `buildPlexWrapped`, `buildInvite`, `buildLLMUsage`, `buildConfig`) from partial overrides
- **Transactions** - Pass a hand-built `tx` to a `$transaction` callback through `asTransactionClient()` from the same helper
- **No suppressions** - No `@ts-ignore`, `@ts-expect-error` or `as any` in tests; `as unknown as` only inside `__tests__/helpers/`
- **Env** - Change read-only keys with `jest.replaceProperty(process.env, 'NODE_ENV', 'production')`

### E2E Tests (Playwright)
- **Authenticated sessions** - Use setup project for auth state
- **Critical user flows** - Test onboarding, wrapped generation, admin actions
- **Chromium only** - `playwright.config.ts` runs the `chromium` and `setup-wizard` projects, plus the `visual-*` screenshot projects (see `e2e/visual/README.md`)
- **Auth fixtures** - Import `test` and `expect` from `e2e/fixtures/auth.ts` (`adminPage`, `regularUserPage`) or `e2e/fixtures/session.ts` (`signIn`); both mint the NextAuth session cookie, so they work against `next dev` and a production build. There is no test-token login. See `e2e/README.md`
- **Production mode** - `E2E_SERVER=prod` runs `npm run build:e2e` then `next start`; CI runs every project that way (visual specs and `e2e/production.spec.ts` skip without it). `E2E_PREBUILT=1` skips the build when one already exists

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
- Type-check app and tests: `npm run typecheck` (`tsconfig.json`, which also covers `e2e/`, then `tsconfig.test.json` for the Jest files)
- Unused code: `npm run knip` (production mode; it is a CI gate)
- **Integration suites** - A Postgres-backed test is `*.pg.test.ts` and wraps its body in `describePg`; a Redis-backed one is `*.redis.test.ts` with `describeRedis` (both in `test/helpers/integration.ts`). `npm test` leaves them out; `TEST_DATABASE_URL=... TEST_REDIS_URL=redis://localhost:6379/0 npm run test:integration` runs them serially. Locally a missing variable skips them; under `CI` it fails them
- **Coverage ratchet** - Jest fails below the floors in `jest.coverage-thresholds.json`. After raising coverage, run `npm run test:coverage` then `node scripts/coverage-ratchet.mjs --update`, which only ever raises floors
- **Throwaway Postgres** - For a production-mode E2E run on a fresh database: `docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plex_manager_e2e_test -p 5433:5432 postgres:16`, then point `E2E_DATABASE_URL` at it and run `prisma migrate deploy`

### CI Checks

`.github/workflows/build.yml` ("Checks") runs the checks that `main` requires: Lint (ESLint and actionlint), Typecheck, Audit (`scripts/audit-gate.mjs`; exceptions in `.github/audit-exceptions.json`, at most 14 days each), Knip, Design System, Unit Tests (with coverage floors), Integration, Schema Drift (a schema change without its migration fails), Build and E2E Tests (production build, Postgres and Redis). Docker Build runs on pull requests but is not required. Shared setup lives in `.github/actions/setup/action.yml`, and every action is pinned by SHA

## JSDoc Documentation Strategy

### When to Use Comprehensive JSDoc

Use detailed JSDoc documentation for **complex modules** with:
- Algorithmic logic (e.g., rule evaluation, data transformation)
- Non-obvious behavior or edge cases
- External API integrations
- Reusable utilities used across the codebase

### JSDoc Structure for Complex Modules

```typescript
/**
 * Brief one-line description of the module/function.
 *
 * ## Overview Section (for modules)
 *
 * High-level explanation of what this module does and why.
 *
 * ## Algorithm/Process (if applicable)
 *
 * Step-by-step explanation of complex logic using:
 * - Numbered lists for sequential steps
 * - ASCII diagrams for visual concepts
 *
 * ## Special Cases
 *
 * Document edge cases and non-obvious behavior.
 *
 * @param paramName - Description of parameter
 * @returns Description of return value
 *
 * @example
 * ```ts
 * // Working code example that can be tested
 * const result = functionName(input)
 * console.log(result) // Expected output
 * ```
 */
```

### JSDoc Best Practices

- **Test examples**: Add `__tests__/jsdoc-examples.test.ts` beside any module whose JSDoc has an `@example`, so the example is checked
- **Internal functions**: Mark helper functions with `@internal` tag (knip's production mode also skips `@internal` exports that only tests use)
- **Module annotations**: Use `@module` at file level for complex modules
- **ASCII diagrams**: Use for tree structures, state machines, or data flow
- **Avoid redundancy**: Don't document self-explanatory code

### Example: Archetype Scoring Module

See `lib/wrapped/archetype-scoring.ts` for a reference implementation:
- Module-level JSDoc with an Overview section explaining why the module exists
- A Scoring section that lists each scorer and the signal it measures
- Documented special cases (archetypes with no measurable signal score 0)

### Testing JSDoc Examples

Verify documentation examples in a test next to the module:

```typescript
// <module dir>/__tests__/jsdoc-examples.test.ts
describe('JSDoc Documentation Examples', () => {
  it('should match the documented behavior', () => {
    // Copy code from @example block
    const result = documentedFunction(input)
    expect(result).toBe(expectedOutput)
  })
})
```

## Logging

Use the centralized logger utility:

```typescript
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('feature-name')

logger.info('Operation started', { userId, action })
logger.error('Operation failed', { error, context })
logger.warn('Deprecation warning', { feature })
```

See the JSDoc in `lib/utils/logger.ts` for log levels, metadata, and best practices.

## Database

### Prisma Workflow
```bash
# After schema changes
npm run db:generate    # Generate Prisma Client
npm run db:deploy      # Apply pending migrations (install, upgrade, CI)
npm run db:push        # Contributor-only: prototype on a throwaway database
npm run db:migrate     # Contributor-only: create a migration
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

### Recommended Production Variables
```env
# Encrypts stored service secrets at rest (ENCRYPTED_FIELDS in lib/prisma.ts).
# Generate with: openssl rand -hex 32. Use a dedicated value and keep it stable.
ENCRYPTION_KEY=
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
import { getActivePlexServerConfig } from '@/lib/connections/plex-config'
import { getPlexSessions } from '@/lib/connections/plex'

const config = await getActivePlexServerConfig() // null when no server is active
if (!config) return { error: 'No active Plex server configured' }

const sessions = await getPlexSessions(config) // { success, data?, error? }
```

`@/lib/connections/plex` is the one entry point for the Plex functions (sessions,
libraries, users, invitations, search, marking).

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
import { prisma } from '@/lib/prisma'
import { getTautulliHistory } from '@/lib/connections/tautulli'

const server = await prisma.tautulli.findFirst({ where: { isActive: true } })
if (!server) return { error: 'No active Tautulli server configured' }

const config = { name: server.name, url: server.url, apiKey: server.apiKey }
const history = await getTautulliHistory(config, tautulliUserId, 50) // (config, userId?, limit = 20)
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
import { generateStructured } from '@/lib/llm/generate-structured'

// One structured call on the purpose's active LLMProvider row (any provider)
const result = await generateStructured({
  purpose: 'wrapped', schema, system, prompt,
  effort: 'low', cacheKey: 'rewind-v2', signal, attribution: { userId },
})
if (!result.ok) return { error: result.error.message } // TRUNCATED, REFUSAL, SCHEMA, ...
```

- Built on the Vercel AI SDK 7 (exact pins). `getLanguageModel(purpose)` in
  `lib/llm/registry.ts` (server-only) builds the model from the active row.
- `lib/llm/models.ts` is the one table of model prices and capabilities
  (`lookupModel`, `costUsd`); never match model names by prefix.
- Every billed attempt, failed ones included, writes one `LLMUsage` row through
  `recordUsage` (`lib/llm/usage.ts`).
- The chat assistant still uses `callChatLLM` (`lib/llm/chat.ts`, OpenAI only)
  until it moves onto the registry.

### Stripe Subscriptions (Optional)

Optional, admin-controlled subscription gating. When the master toggle
`Config.stripeEnabled` is **off** (the default), the app behaves exactly as it
did before the feature existed — non-members are rejected at login and there is
no `/subscribe` flow. See `docs/stripe.md` for operator setup.

```typescript
import { getStripe } from '@/lib/stripe/client'

// Returns a configured Stripe client, or null when unconfigured — callers
// degrade gracefully (never throw for the "not configured" path).
const stripe = await getStripe()
if (!stripe) return { error: 'Stripe is not configured' }
```

**Official Documentation**: [docs.stripe.com/api](https://docs.stripe.com/api)
(OpenAPI) — SDK reference at [github.com/stripe/stripe-node](https://github.com/stripe/stripe-node).

**API Conventions**:
- **Authentication (server → Stripe)**: secret key (`sk_live_…`/`sk_test_…`),
  stored encrypted in the `Config` singleton and read via `getStripe()`. Never
  hardcode; never send to client components.
- **Authentication (Stripe → app)**: the webhook is authenticated by the Stripe
  **signature** verified against the raw request body (no admin auth).
- **Config**: `stripeEnabled`, `stripeSecretKey` (ENCRYPTED), `stripeWebhookSecret`
  (ENCRYPTED), and `stripePriceIds` (JSON array) live on `Config`. Secrets are
  registered in `ENCRYPTED_FIELDS` (`lib/prisma.ts`).
- **Hosted UI**: no in-app card handling — Checkout (subscribe) and Billing
  Portal (manage/cancel) are Stripe-hosted.
- **API version**: `apiVersion` is intentionally NOT hard-pinned in
  `lib/stripe/client.ts` (target `2026-06-24.dahlia`) to avoid SDK type
  mismatches; verify against the installed SDK — see `docs/stripe.md` open items.

**Key Modules / Endpoints**:
- `lib/stripe/client.ts` — `getStripe(): Promise<Stripe | null>`.
- `lib/stripe/prices.ts` — `getOfferedPrices()` (live price display for `/subscribe`).
- `lib/stripe/events.ts` — `mapStripeStatus`, `getCurrentPeriodEnd` (version-safe).
- `actions/subscription.ts` — `startCheckout(priceId)`, `openBillingPortal()`.
- `actions/admin/subscriptions.ts` — admin cancel/grant/toggle-exempt.
- `app/api/stripe/webhook/route.ts` — **the only** Stripe API route: verifies the
  signature, dedupes on a processed `StripeEvent(event.id)`, enqueues a BullMQ
  job (or retries its failed one), returns 200 (400 on bad signature, never 5xx).
- `lib/queue/jobs/stripe.ts` — BullMQ processors (`STRIPE_WEBHOOK`,
  `PLEX_ACCESS_GRANT`, `PLEX_ACCESS_REVOKE`).

**Handled webhook events**: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
(logged no-op), `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`. Handlers write the live subscription
(`stripe.subscriptions.retrieve`), never an older event over a newer one
(`Subscription.stripeEventAt`, `lib/stripe/subscription-sync.ts`), and a
`StripeEvent` is processed only after its handler succeeds, so a resend
recovers a failed event.

**⚠️ CRITICAL — disabled-state safety**: the webhook still verifies signatures and
records subscription **status** while disabled, but performs **no** Plex
grant/revoke side effects (FR-29). Disabling the toggle never cancels Stripe
subscriptions or removes Plex access (FR-4). Automatic Plex removal never
unshares an admin, an exempt user, a non-Stripe-managed user, or a `PAST_DUE`
subscriber (FR-19, `evaluateRevokeGuard`).

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
- Bot client and event wiring in `lib/discord/bot.ts`
- Slash commands live in `lib/discord/commands/` (`registry.ts` lists them); register them with `npm run register-discord-commands`
- Safety checks in `lib/discord/chat-safety.ts`
- Register linked-role metadata: `npm run register-discord-metadata`
- See `docs/discord-bot.md` for setup

## Deployment Checklist

1. Set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to production domain
2. Generate secure `NEXTAUTH_SECRET`
3. Configure production `DATABASE_URL`
4. Take a backup (`pg_dump -Fc`), then run `npm run db:deploy`; the Docker image runs it at start unless `SKIP_MIGRATIONS=true`. See `docs/operations.md`.
5. Build: `npm run build`
6. Start: `npm run start:prod` (runs the standalone `server.js` that `next build` writes; the Docker image ships it)
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
- Runs on Chromium only
- Use `/fix-e2e` command for automated test repair

**MCP Servers**: `.mcp.json` commits one server, `chrome-devtools` (pinned `chrome-devtools-mcp@1.11.0`, headless), for quick looks at a running page. It needs a local Chrome and does not start without one. E2E tests still use Playwright directly. Servers that need keys (image generation, Figma, Motion+) stay at user scope and are never committed.

### Agent Skills

`.claude/skills/` holds third-party skills vendored at pinned commits, so every session, including cloud sessions, gets the same reviewed copies. Each loads on its own when you work on files matching its `paths:`, or by name:

| Skill | Loads for | Use it for |
|---|---|---|
| `frontend-design` | `app/**`, `components/**` | Visual direction for new or reshaped UI |
| `web-design-guidelines` | `app/**`, `components/**` | UI review against the Web Interface Guidelines (local copy, no fetch) |
| `accessibility-review` | `app/**`, `components/**` | Accessibility audits (it targets WCAG 2.1 AA; the project bar is 2.2 AA) |
| `vercel-react-best-practices` | `app/**`, `components/**`, `hooks/**` | React and Next.js performance |
| `vercel-composition-patterns` | `app/**`, `components/**`, `hooks/**` | Component API design |
| `vercel-react-view-transitions` | `app/**` | React `<ViewTransition>` work |
| `motion` | `components/wrapped/**`, `components/rewind/**`, `lib/rewind/**` | Animation (its `motion/react` imports apply after P2.15) |

- Where a skill's advice conflicts with this file (for example SWR instead of TanStack Query, or throwing from Server Actions), this file wins.
- Shell execution from skills is off (`disableSkillShellExecution` in `.claude/settings.json`).
- `.claude/skills/THIRD_PARTY.md` records each skill's source, SHA or npm version, licence, review and local changes, and the update procedure: review the upstream diff at a new SHA, copy, record. Never run `npx skills add` or `npx skills update` here.
- Any change to `.claude/skills/**` or `.mcp.json` needs a `/security-review` before merge.

## Additional Resources

- E2E Testing: See `e2e/README.md`
- Logging: See the JSDoc in `lib/utils/logger.ts`
- Discord Bot: See `docs/discord-bot.md`
- Stripe Subscriptions: See `docs/stripe.md`
- Operations (backup, restore, upgrades): See `docs/operations.md`
- Performance Testing: See `docs/performance-testing.md`
- Project README: See `README.md`
