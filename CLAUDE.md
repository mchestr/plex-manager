# Plex Management System - Development Guide

## Project Overview

A Next.js-based Plex management platform that combines server management tools, member onboarding and invites, and Rewind, each member's personal year in review (formerly "Wrapped"). Integrates with Plex, Tautulli and Overseerr, with optional Jellyfin sign-in, Sonarr/Radarr, Stripe subscriptions, Discord and LLM providers.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript 7 (strict mode with exhaustive checks). `tsc` is TypeScript 7 (`@typescript/native`); the `typescript` package is the TypeScript 6 API that typescript-eslint, `next build` and the codemods load
- **Lint**: ESLint 10 (flat config, `eslint.config.mjs`)
- **Database**: Prisma v7 + PostgreSQL (SQLite no longer supported)
- **Auth**: NextAuth.js 4 (Plex PIN sign-in, plus Jellyfin username and password when enabled)
- **State**: TanStack Query (React Query) for client-side data fetching
- **Styling**: Tailwind CSS v4 with utility-first approach; primitives in `components/ui/` are built on Base UI (`@base-ui/react`)
- **Animation**: Motion (`motion/react`)
- **Charts**: Recharts, through `ChartCard`
- **Jobs**: BullMQ on Redis (Rewind generation, Stripe access, watchlist sync, retention)
- **LLM**: Vercel AI SDK (OpenAI, Anthropic, Google and OpenAI-compatible servers)
- **Validation**: Zod schemas for all inputs/responses
- **Testing**: Jest + Testing Library + Playwright (E2E)

## Architecture Principles

### Component Strategy
- **Server Components by default** - Only add `'use client'` when necessary (interactivity, hooks, browser APIs)
- **Server Actions over API routes** - Prefer Server Actions for mutations, use API routes only for webhooks/third-party integrations
- **Colocation** - Keep related files close (components with tests, actions with validators)

### Data Fetching
- **Server Components**: Fetch directly in components (async/await). Read the session with `getServerSession(authOptions)` (`next-auth`, `authOptions` from `@/lib/auth`); admin data comes from the `server-only` loaders in `lib/data/*`, which check `assertAdmin()` themselves
- **Client Components**: Use TanStack Query with proper error/loading states
- **Query keys**: Every TanStack Query key comes from `hooks/query-keys.ts`; first data arrives as Server Component props (seed a query with `initialData`), and a mutation invalidates the key its reader uses
- **Server Actions**: For mutations, form submissions, user-triggered operations
- **Validation**: All inputs validated with Zod before processing
- **Cache Components** (`cacheComponents: true`, P11.19): no segment exports `dynamic`, `revalidate`, `fetchCache` or `runtime`; uncached data renders per request
  - Session: `getSession()` from `@/lib/data/session`, never `getServerSession(authOptions)`; active service rows: `getActiveService(kind)` from `@/lib/data/active-service`. Both are React `cache()`d per request
  - Shared, non-secret data uses `'use cache'` with `cacheTag` and `cacheLife` (`getAppSettings()` tag `app-settings`, plan names), and the actions that change it call `updateTag(tag)`. The cache is per process, so with several `web` containers another container serves a cached value until its `cacheLife` revalidates; data that must show at once on every container (announcements) is read per request. Readers the bot or jobs also call go through `cachedOrDirect` (`@/lib/utils/use-cache`), and a database read calls `notDuringBuild()` first, since the Docker build has no database
  - Never put a row with `ENCRYPTED_FIELDS`, the session or anything viewer-specific inside `'use cache'` (`__tests__/security/use-cache-no-secrets.test.ts`)
  - An action that revalidates already refreshes the page; where the client needs a refresh, the action calls `refresh()` from `next/cache` instead of `router.refresh()`

### File Organization
```
app/                     # Next.js App Router (pages, layouts, routes)
├── (app)/              # Authenticated member layout group
│   ├── account/        # Account page and Your data (single-item deletes)
│   ├── announcements/  # In-app announcements
│   ├── discord/        # Discord account linking
│   ├── help/           # Help and support
│   ├── membership/     # Stripe membership (when enabled)
│   └── rewind/         # Rewind: /rewind, /rewind/[year] (story), /rewind/[year]/read (article), the scope layout
├── admin/              # Admin pages: overview, users, invites, settings, rewind, queues, LLM usage
├── api/                # API routes (webhooks, health, metrics, admin search, Rewind cards and posters)
├── auth/               # Plex sign-in callback, access denied and auth error pages (sign-in itself is on /)
├── dev/                # Development-only UI sheet
├── invite/             # Invite redemption (Plex and Jellyfin)
├── onboarding/         # Member onboarding flow
├── rewind/s/           # Public Rewind share links (/wrapped/* redirects to /rewind/*)
├── setup/              # First-run setup claim and wizard
└── subscribe/          # Stripe subscription flow

actions/                # Server Actions, built with publicAction/memberAction/adminAction
├── admin/             # Admin actions (users, servers, invites, settings, Rewind season, retention)
└── chatbot/           # Admin assistant chat action
components/             # React components
├── admin/             # Admin-specific components
├── dashboard/         # Member home page cards
├── guides/            # Help and onboarding guides
├── onboarding/        # Onboarding components
├── rewind/            # Rewind scope, story stage, pages, article mode, sharing
├── setup/
│   └── setup-wizard/  # Setup wizard steps
├── shell/             # App, public and admin shells
└── ui/                # Shared UI primitives

hooks/                  # Shared client hooks; query-keys.ts holds every TanStack Query key
lib/                    # Utilities, helpers, business logic
├── actions/           # The action helpers (define-action.ts), ActionResult, route handler helpers
├── brand.ts           # Product strings: serverName(), rewindName(), productName, monogramFor()
├── charts/            # Chart slot map (var(--chart-n)) and generated text summaries for ChartCard
├── chatbot/           # Admin assistant: tools, executors, prompts and the conversation loop (server-only)
├── connections/       # External API clients (Plex, Jellyfin, Tautulli, Overseerr, Sonarr, Radarr)
├── data/              # Server-only admin loaders, each checking assertAdmin() next to its data
├── db/                # Encrypted fields and the ?schema= parameter
├── design/            # Token mirror of app/globals.css and colour contrast helpers
├── discord/           # Discord bot, commands, linking and stat channels (channel-stats/)
├── invites/           # Invite passes and redemption (Plex and Jellyfin)
├── llm/               # LLM facade (generateStructured, chatWithTools), provider registry, model table, usage
├── locks/             # LeaseLock and LeasePoller (database or Redis leases)
├── members/           # Member service rule, access grant/revoke, offboarding, erase and export
├── permissions/       # Roles and permissions: isAdmin superuser, the Support role, hasPermission (docs/roles.md)
├── observability/     # Request id reader, /api/metrics sources and the Prometheus text writer
├── og/                # App icons and the default OG card (next/og)
│   └── fonts/         # Committed IBM Plex subsets for next/og (scripts/build-og-fonts.py)
├── queue/             # BullMQ queues, workers and job processors
├── request-tiers/     # Request-limit tiers from watch time: tiers, matching, the daily sync, member limits (docs/request-limits.md)
├── retention/         # Retention policy and the daily sweep
├── rewind/            # Rewind 2026: typesetter, format rules, page registry, cards, article mode
├── security/          # Security utilities (rate limiting, encryption, audit logging)
├── settings/          # getAppSettings(): server zone, locale and server name; connection health
├── stripe/            # Stripe client, prices, events and subscription sync
├── ui/                # UI helpers: status vocabulary, icon map, poster palette, safe Markdown links, error copy
├── validations/       # Zod schemas for all services
├── watchlist/         # Plex watchlist to Overseerr sync
├── wrapped/           # Rewind generation pipeline: sources, stats, facts, archetypes, copy, season
└── utils/             # Shared utilities

evals/                  # Rewind golden fixtures and eval harness (evals/rewind/README.md)
types/                  # TypeScript type definitions (admin.ts, onboarding.ts, setup.ts, wrapped.ts, ...)
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

import { queryKeys } from '@/hooks/query-keys'

export function ClientComponent({ initial }: { initial: Data }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.watchlistSync(),
    queryFn: async () => { /* ... */ },
    initialData: initial,
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
- Every export of a `'use server'` module is an endpoint, so each is built by the helper (or `formAction`), which brands it; `__tests__/security/use-server-exports.test.ts` fails on a raw export. The admin and users action barrels are gone (ESLint bans them): import from the defining module.
- Server-side reads are loaders, not actions: `lib/data/*` (`import 'server-only'`) start with `assertAdmin()` from `@/lib/admin`, which throws the `PM_FORBIDDEN` / `PM_UNAUTHENTICATED` digests the error boundaries render. A layout is not an authorisation boundary.

### Styling
- **Tailwind utility classes** - No custom CSS unless absolutely necessary
- **Consistent spacing** - Use standard Tailwind scale (4, 6, 8, 12, 16, etc.)
- **Dark theme first** - Primary design uses dark slate backgrounds
- **Responsive** - Mobile-first approach, test all breakpoints
- **Component variants** - Use `clsx`/`tailwind-merge` for conditional classes
- **Design-system check** - `npm run design:report` counts the patterns the design system bans (raw palette colours, gradients, blur, caps eyebrows, infinite motion, arrows and "Wrapped" in copy, and more; rules in `scripts/design-system/rules.mjs`). CI's `design:check` (`--strict`) fails on any count outside `scripts/design-system/allowlist.mjs`, where each exception names its reason and the step that removes it, and on an entry that no longer covers anything

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
  showError(result.error) // const { showError } = useToast()
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
- ESLint's `max-lines` (blank lines and comments skipped, tests excluded) fails a file in `components/` or `actions/` above 300 lines and warns for `lib/` and `hooks/` above 150. Split along responsibilities; a `'use server'` file can export only async functions, so shared helpers move to `lib/`
- Deliberate exceptions carry a file-level `/* eslint max-lines: ["error", N] -- cohesive: <reason> */` and a line here. None today

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
- **Actions**: `Button` (variants `primary`, `secondary`, `outline`, `ghost`, `destructive`, `destructive-solid`, `link`; `loading` and `loadingLabel`), `SubmitButton`, `Toggle`, `SegmentedControl`
- **Forms**: `Input`, `Textarea`, `SecretInput`, `Select` and its parts, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Field`, `FormField`, `Label`, `DateRangeFilter`, `FilterBar`
- **Overlays**: `Dialog`, `AlertDialog`, `ConfirmDialog` (with `useActionDialog`), `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`, `Command`
- **Display**: `Card` (compose `CardHeader`, `CardContent`, `CardFooter`), `Badge`, `StatusBadge`, `StatTile`, `DataTable`, `ChartCard`, `Tabs`, `Stepper`, `Poster`, `Time`, `MarkdownBody`, `Icon`, `PageHeader`, `SettingsSection` (read-only first, with Edit; its view is a `SettingsSummary` from `settings-summary.tsx`), `Wordmark`
- **Feedback**: `Alert`, `useToast`, `Spinner`, `Skeleton`, `EmptyState`, `ErrorState`, `StatusScreen`, `LiveStatus`

ESLint enforces this: a raw `<button>`, `<input>`, `<select>`, `<textarea>` or inline `<svg>` outside `components/ui/**` is an error (`no-restricted-syntax`, selectors in `eslint/restricted-syntax.mjs`). The allowlist is Rewind art (`components/rewind/**`), the dev sheet (`app/dev/**`), the `next/og` image routes and `app/api/**`. The old adapters (`StyledInput`, `StyledDropdown`, `ModalShell`, `ConfirmModal`, `LoadingSpinner` and the rest) are deleted, and importing one is an error.

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
- **Critical user flows** - Test onboarding, invites, Rewind, admin actions
- **Projects** (`playwright.config.ts`):
  - `chromium` (every functional spec) and `setup-wizard` (the wizard and its axe scan, which reopen setup);
  - `rewind-e2e-chromium`, `rewind-e2e-webkit` and `rewind-e2e-firefox` (`e2e/rewind/*.spec.ts`; Firefox runs the share page and archive specs), and `rewind-a11y-chromium`, `rewind-a11y-webkit` and `rewind-a11y-firefox` (`e2e/a11y/rewind*.a11y.spec.ts`; Firefox only the `@article` tests);
  - `rewind-perf` (`e2e/perf/*.perf.spec.ts`, chromium: the 4x-throttled long-task gate, the 110 KB first-page budget and the admin chart budget);
  - screenshots: `visual-desktop`, `visual-mobile`, `visual-setup-desktop`, `visual-setup-mobile`, the `rewind-visual-*` phone and desktop projects (chromium and webkit), and the light-theme projects (`visual-light-*`, `a11y-light`). See `e2e/visual/README.md`
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
- **Coverage ratchet** - Jest fails below the floors in `jest.coverage-thresholds.json`. After raising coverage, run `npm run test:coverage` then `node scripts/coverage-ratchet.mjs --update`, which only ever raises floors. CI's unit run sets `DATABASE_URL=""`: `prisma` from `@/lib/prisma` builds its client on first use, so a test that imports it without the shared mock fails rather than reaching a database
- **Throwaway Postgres** - For a production-mode E2E run on a fresh database: `docker run --rm -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plex_manager_e2e_test -p 5433:5432 postgres:16`, then point `E2E_DATABASE_URL` at it and run `prisma migrate deploy`

### CI Checks

`.github/workflows/build.yml` ("Checks") runs the checks that `main` requires: Lint (ESLint and actionlint), Typecheck, Audit (`scripts/audit-gate.mjs`; exceptions in `.github/audit-exceptions.json`, at most 14 days each), Knip, Design System (`design:check` and `design:rewind-motion`), Unit Tests (with coverage floors, then `rewind:fixtures --check`, `rewind:freeze --check` and `env:docs --check`), Integration, Schema Drift (a schema change without its migration fails, and `scripts/check-migrations.mjs` checks migration names), Build, E2E Tests (production build, Postgres and Redis: `chromium` and `setup-wizard`), Rewind E2E Tests (the same, for the Rewind E2E, axe and CSP projects on chromium, webkit and firefox) and Rewind Performance (`rewind-perf`, blocking). Visual Diffs and Rewind Visual Diffs run the screenshot projects and are advisory, not required: a diff leaves a warning and the `visual-diffs` or `rewind-visual-diffs` artifact but does not fail the workflow, and the Visual Baselines workflow (`.github/workflows/visual-baselines.yml`, see `e2e/visual/README.md`) refreshes the baselines. The light-theme projects run only locally. Image Smoke Test runs on pull requests but is not required: it builds the image, starts it on a fresh Postgres and Redis until its `HEALTHCHECK` reports healthy (migrations, `SKIP_MIGRATIONS`, read-only files, tini, `docker stop`) and scans it with Trivy. Shared setup lives in `.github/actions/setup/action.yml`, and every action is pinned by SHA

Other workflows: `freeze-gate.yml` fails a pull request while the `CODE_FREEZE` repository variable is `on`, unless it carries `freeze:data` or `freeze:security` (`docs/operations.md`, "Code freeze gate"); `docker-publish.yml` publishes the image from `main` and `v*` tags.

The Changelog check (`.github/workflows/changelog.yml`) fails a pull request that touches `prisma/migrations/**`, `lib/env.ts`, `docker-entrypoint.sh`, `Dockerfile` or `deploy/**`, or carries the `breaking` label, without a line under Unreleased in `CHANGELOG.md` (put operator steps under "Upgrade notes"); the `no-changelog` label skips it. A `v*` tag publishes the versioned image and, through `.github/workflows/release.yml`, the GitHub Release; see `docs/releasing.md`.

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

See `lib/wrapped/archetypes/scorers.ts` for a reference implementation:
- Module-level JSDoc explaining what the module does and why
- A Scorers section that tables each scorer, its score and its evidence
- Documented special cases (fallbacks and the one after-dark window)

For a lifecycle with two timers and a diagram of each loop, see `lib/locks/lease-poller.ts`.

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

- **No `console.*`**: ESLint's `no-console` is an error outside `scripts/`, `evals/`, `prisma/seed.ts` and the logger; client code logs through `createLogger` too.
- **Request IDs**: `proxy.ts` forwards an `x-request-id` (a valid incoming one, else a new UUID) and returns it as `X-Request-ID`. Actions built with the action helpers, and route handlers exported through `withRequestContext` (`@/lib/actions/route`), run in a context (`lib/utils/log-context.ts`) that puts `requestId` and `userId` on every log line. Jobs added in a request carry `_meta.requestId` (`traceQueue` in `lib/queue/job-meta.ts`) and the Workers run them in that context. A Server Component that logs passes `{ requestId: await getRequestId() }` (`lib/observability/request-context.ts`).
- **Unhandled errors**: `instrumentation.ts` exports `onRequestError`, which logs `request.unhandled_error` with the digest the error page shows.
- **Metrics**: `/api/metrics` (Prometheus text, behind `METRICS_TOKEN`; 404 without it) reports queue depth, job failures, LLM spend and the process; see `docs/operations.md`.

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

#### Creating a migration
- Create it with `npx prisma migrate dev --create-only --name <descriptive_name>` against a database whose name ends in `_test`, review the generated `migration.sql`, then apply it with `npm run db:deploy`. Never hand-type a timestamp or rename a folder, and never edit a merged migration.
- `node scripts/check-migrations.mjs` (in CI's Schema Drift job) checks every folder not listed in `prisma/migrations/.legacy-names.json`: a 14-digit timestamp later than every earlier folder's and not in the future, at least two lowercase words (`add_member_export`, not `latest` or `fix_changes`), and a `migration.sql`. Never add a folder to that list.
- Schema Drift also runs `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` against a migrated database: a schema change without its migration fails.
- `20250101000000_init` is a retroactive baseline: an install made with `prisma db push` marks every folder applied with `npx prisma migrate resolve --applied <name>` (`docs/operations.md`, "Installed with db push").
- `?schema=` in `DATABASE_URL` applies to migrations and to the app's client alike (`lib/db/schema-param.ts`); production refuses to boot on a name that is not a plain identifier.

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

Every variable is in `envSchema` (`lib/env.ts`), each with `.meta({ description, group, default?, requiredInProduction? })`. `npm run env:docs` writes `docs/environment.md` and the generated block of `example.env` from it; CI runs it with `--check`.

### Required Production Variables
```env
# Application URL (https in production)
NEXTAUTH_URL=https://yourdomain.com           # Auth callbacks and session cookies
NEXT_PUBLIC_APP_URL=https://yourdomain.com    # Optional: share links and OG images; defaults to NEXTAUTH_URL, same origin

# Security
NEXTAUTH_SECRET=                               # Generate with: openssl rand -base64 32
PLEX_CLIENT_IDENTIFIER=                        # Any unique string

# Database (PostgreSQL required for Prisma v7)
DATABASE_URL=postgresql://user:password@localhost:5432/plex_manager

# Encrypts stored secrets at rest (ENCRYPTED_FIELDS, lib/db/encrypted-fields.ts).
# kid:base64 entries of 32 bytes (openssl rand -base64 32); the first is primary.
# Production refuses to boot without a key unless ALLOW_PLAINTEXT_SECRETS=true.
# The legacy single ENCRYPTION_KEY still works. See docs/operations.md, "Encryption keys".
ENCRYPTION_KEYS=k1:
```

`REDIS_URL` is not required to boot, but Rewind, Stripe and the job queue need it. `PROCESS_ROLE` (`web`, `worker` or `all`, default `all`) picks what a container runs; see `docs/operations.md`, "Web and worker containers".

### Development Shortcuts
- Use `DEV_*` variables in `.env` to pre-fill the setup wizard; they are read only with `NODE_ENV=development` and `DEV_SETUP_PREFILL=true`
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

import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
```

Most routes render `ErrorState` or `StatusScreen` from `components/ui/` instead of hand-written markup.

### Form Handling
```typescript
// A form: renameThingForm = formAction(renameThing, { schema, toInput }) (@/lib/actions/form-action);
// idleFormState() comes from @/lib/actions/form-state
const [state, submit] = useActionState(renameThingForm, idleFormState())

<form action={submit}>
  <Input name="name" required />
  <SubmitButton>Save</SubmitButton>
</form>

// Calling an action from a client component
const [isPending, startTransition] = useTransition()

const handleSubmit = (input: { name: string }) => {
  startTransition(async () => {
    const result = await renameThing(input)
    if (!result.success) {
      showError(result.error) // const { showError } = useToast()
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
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { tautulliCommand } from '@/lib/connections/tautulli'

// apiKey is an encrypted field; the Prisma extension decrypts it on read
const tautulli = await prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } })
if (!tautulli) return null

const historySchema = z.looseObject({ data: z.array(z.looseObject({ rating_key: z.coerce.number() })) })
const history = await tautulliCommand(tautulli, 'get_history', { user_id: tautulliUserId, length: 50 }, historySchema)
if (!history.ok) return null // history.code: 'TAUTULLI_ERROR', 'TIMEOUT', 'HTTP', 'INVALID_RESPONSE', ...
```

`tautulliCommand` (`lib/connections/tautulli.ts`) is the one Tautulli client: it
goes through `serviceFetch` (timeouts, safe redirects), unwraps the `response`
envelope, parses `data` with your schema and retries transient failures. Only
the commands in its `TautulliCommand` union can be called; add one there first.
The older `getTautulli*` helpers return `{ success, data?, error? }` for the
admin assistant's tools.

**Official Documentation**: [docs.tautulli.com/extending-tautulli/api-reference](https://docs.tautulli.com/extending-tautulli/api-reference)

**API Conventions**:
- **Endpoint Structure**: `http://IP:PORT[/HTTP_ROOT]/api/v2?apikey=$apikey&cmd=$command`
- **Authentication**: API key in query parameter `?apikey=YOUR_API_KEY`
- **API Key Location**: Settings → Web Interface → API → Show API Key
- **Default Port**: 8181
- **Response Format**: JSON by default, optional `out_type` parameter for XML
- **Response Structure**: `{"response": {"result": "success", "message": null, "data": [...]}}`

**Commands the app calls** (`TautulliCommand`): `get_activity`, `get_children_metadata`,
`get_history`, `get_home_stats`, `get_item_user_stats`, `get_libraries`,
`get_libraries_table`, `get_library_names`, `get_metadata`, `get_server_info`,
`get_tautulli_info`, `get_user_watch_time_stats`, `get_users`

**Common Parameters**: `user_id`, `rating_key`, `section_id`, `start`, `length`, `order_column`, `order_dir`

### Overseerr API
```typescript
import { buildOverseerrUserIndex, findOverseerrUserId, submitOverseerrRequest } from '@/lib/connections/overseerr'

const index = await buildOverseerrUserIndex(config) // { url, apiKey }; cached 10 minutes per server
if (!index.ok) return null
const overseerrUserId = findOverseerrUserId(index.data, user.plexUserId)
if (overseerrUserId === null) return null // the member never signed in to Overseerr with Plex

const result = await submitOverseerrRequest(config, { mediaType: 'tv', mediaId: tmdbId }, { overseerrUserId })
// result.status: 'created' | 'already_requested' | 'already_available' | 'not_permitted' | 'failed'
```

A request is always filed as the member's own Overseerr user (`X-Api-User`
beside the API key), so their permissions, auto-approve rules and quotas apply;
there is no fallback to the API key's admin. A TV request always carries
`seasons` (`"all"` unless a list is given).

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
- The admin playground (`/admin/rewind/playground`) runs `generateUserRewind`
  in dry-run mode through `startRewindDryRun` (`actions/admin/rewind-playground.ts`);
  try models there, never in a copy of the pipeline.
- The admin assistant (`lib/chatbot/`) and the Discord `/assistant` command run
  through `chatWithTools` (`lib/llm/chat.ts`) on the `chat` purpose's row of
  the same registry. Every surface that offers the assistant shows
  `getAssistantDisclosure()` (`lib/llm/assistant-disclosure.ts`): admins can
  review conversations, and the named provider processes them.

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
  registered in `ENCRYPTED_FIELDS` (`lib/db/encrypted-fields.ts`).
- **Settings form**: the keys are `SecretInput`s in the saved state only
  (`getStripeConfig().saved` carries `{ last4 }`, never a key). Both go only to
  Stripe, so a blank field keeps the stored key and never asks for re-entry.
- **Jellyfin members**: a Jellyfin-only member checks out without an email;
  their grant turns the Jellyfin account on and a revoke turns it off (see
  `docs/stripe.md`, "Plex and Jellyfin Members").
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
  job (or retries its failed one), returns 200 (400 on bad signature, never 5xx
  for a bad signature; 503 while the queue is unavailable, so Stripe retries).
- `lib/queue/jobs/stripe.ts` — BullMQ processors (`STRIPE_WEBHOOK`,
  `PLEX_ACCESS_GRANT`, `PLEX_ACCESS_REVOKE`; the access jobs keep their legacy
  names and act on Plex, Jellyfin or both through `grantServiceAccess` /
  `revokeServiceAccess` in `lib/members/access-actions.ts`).

**Handled webhook events**: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
(logged no-op), `customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.payment_failed`. Handlers write the live subscription
(`stripe.subscriptions.retrieve`), never an older event over a newer one
(`Subscription.stripeEventAt`, `lib/stripe/subscription-sync.ts`), and a
`StripeEvent` is processed only after its handler succeeds, so a resend
recovers a failed event.

**⚠️ CRITICAL — disabled-state safety**: the webhook still verifies signatures and
records subscription **status** while disabled, but performs **no** Plex or
Jellyfin grant/revoke side effects (FR-29). Disabling the toggle never cancels
Stripe subscriptions or removes Plex or Jellyfin access (FR-4). Automatic
removal never unshares an admin, an exempt user, a non-Stripe-managed user, or
a `PAST_DUE` subscriber, and never disables a Jellyfin administrator (FR-19,
`evaluateRevokeGuard`). No path invites a username-derived email to Plex.

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
- Slash commands live in `lib/discord/commands/`: `definitions.ts` holds the builders (no Prisma), `registry.ts` pairs each with a lazily loaded handler. Register them with `npm run register-discord-commands` (`-- --dry-run` lists them), or `node scripts/dist/register-discord-commands.cjs` in the image
- The bot starts once Admin, Discord, "Bot enabled" is on and a token exists (`isDiscordBotReady`), with no restart; `ENABLE_DISCORD_BOT=false` opts a process out
- Safety checks in `lib/discord/chat-safety.ts`
- Register linked-role metadata: `npm run register-discord-metadata` (`node scripts/dist/register-discord-metadata.cjs` in the image)
- See `docs/discord-bot.md` for setup

## Deployment Checklist

`docs/deployment.md` is the full guide (compose, reverse proxy, setup claim, bare metal, web and worker containers). In short:

1. Set `NEXTAUTH_URL` (and `NEXT_PUBLIC_APP_URL`, same origin) to the production https domain
2. Generate a secure `NEXTAUTH_SECRET` and `ENCRYPTION_KEYS`, and set `PLEX_CLIENT_IDENTIFIER`
3. Configure production `DATABASE_URL` and `REDIS_URL`
4. Take a backup (`pg_dump -Fc`), then run `npm run db:deploy`; the Docker image runs it at start unless `SKIP_MIGRATIONS=true`. See `docs/operations.md`.
5. Build: `npm run build` (its `postbuild` copies `.next/static` and `public` into `.next/standalone`)
6. Start: `npm run start:prod` (runs `.next/standalone/server.js` with `.env`; the Docker image runs the same server as `node server.js`)
7. Verify environment variables are set (app will fail on startup if missing); `docs/environment.md` lists them, generated by `npm run env:docs`
8. Compose installs use `deploy/docker-compose.yml`; see `docs/deployment.md`, and `docs/domain-move.md` for a new host

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
- `/fix-pr-status-checks` - Fix a pull request's failing status checks
- `/implement-issue` - Fetch a GitHub issue and implement it on a new branch
- `/label-issues` - Apply labels to GitHub issues
- `/sync-main` - Switch to `main` and pull
- `/update-pr` - Rebase a pull request on `main` and address its comments

### Opening Pull Requests

- Security-related fixes (auth, permissions, secrets, encryption, injection, CSP, dependency advisories, anything that would carry `freeze:security`): push the branch, then stop and wait for Mike to ask before opening the PR.
- Everything else: open the PR as soon as the work is done and checks pass locally; no need to ask.

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
- Chromium for most projects; the Rewind projects also run WebKit and Firefox (see E2E Tests above)
- Use `/fix-e2e` command for automated test repair

**MCP Servers**: `.mcp.json` commits one server, `chrome-devtools` (pinned `chrome-devtools-mcp@1.11.0`, headless), for quick looks at a running page. It needs a local Chrome and does not start without one. E2E tests still use Playwright directly. Servers that need keys (image generation, Figma, Motion+) stay at user scope and are never committed.

### Agent Skills

`.claude/skills/` holds third-party skills vendored at pinned commits, so every session, including cloud sessions, gets the same reviewed copies, plus four project-authored skills that describe this codebase's Rewind and visual QA conventions. Each loads on its own when you work on files matching its `paths:`, or by name:

| Skill | Loads for | Use it for |
|---|---|---|
| `frontend-design` | `app/**`, `components/**` | Visual direction for new or reshaped UI |
| `web-design-guidelines` | `app/**`, `components/**` | UI review against the Web Interface Guidelines (local copy, no fetch) |
| `accessibility-review` | `app/**`, `components/**` | Accessibility audits (it targets WCAG 2.1 AA; the project bar is 2.2 AA) |
| `vercel-react-best-practices` | `app/**`, `components/**`, `hooks/**` | React and Next.js performance |
| `vercel-composition-patterns` | `app/**`, `components/**`, `hooks/**` | Component API design |
| `vercel-react-view-transitions` | `app/**` | React `<ViewTransition>` work |
| `motion` | `components/rewind/**`, `lib/rewind/**` | Animation with `motion/react` |
| `rewind-design-system` (project) | `components/rewind/**`, `lib/rewind/**`, `app/(app)/rewind/**`, `app/rewind/**` | The Rewind scope, inks, type, motion and poster rules |
| `rewind-page` (project) | `components/rewind/pages/**`, `lib/rewind/pages/**`, `lib/rewind/registry.ts`, `lib/rewind/page-meta.ts` | Checklist for adding or changing a Rewind page |
| `share-card` (project) | `lib/rewind/cards/**`, `app/api/rewind/card/**` | Satori-safe share cards drawn from the share-safe projection |
| `visual-qa` (project) | `e2e/**` | Running, reading and updating the visual, axe and performance projects |

- Where a skill's advice conflicts with this file (for example SWR instead of TanStack Query, or throwing from Server Actions), this file wins.
- Shell execution from skills is off (`disableSkillShellExecution` in `.claude/settings.json`).
- `.claude/skills/THIRD_PARTY.md` records each skill's source, SHA or npm version, licence, review and local changes, and the update procedure: review the upstream diff at a new SHA, copy, record. Never run `npx skills add` or `npx skills update` here.
- The project-authored skills point at source files and design sections instead of copying values; `scripts/__tests__/project-skills.test.ts` fails when a path, export, npm script or Playwright project they name disappears, so update the skill in the same PR as the code it describes.
- Any change to `.claude/skills/**` or `.mcp.json` needs a `/security-review` before merge.

## Additional Resources

- E2E Testing: See `e2e/README.md`
- Logging: See the JSDoc in `lib/utils/logger.ts`
- Discord Bot: See `docs/discord-bot.md`
- Stripe Subscriptions: See `docs/stripe.md`
- Deployment, environment variables and moving hosts: See `docs/deployment.md`, `docs/environment.md` and `docs/domain-move.md`
- Operations (backup, restore, upgrades, encryption keys, worker containers, metrics): See `docs/operations.md`
- Roles and permissions (Support role, assistant tool gate): See `docs/roles.md`
- Privacy (personal data inventory, member removal, export, retention): See `docs/privacy.md`
- Releases and the changelog: See `docs/releasing.md` and `CHANGELOG.md`
- Rewind season runbook (flags, season open, roll back, season close): See `docs/rewind.md`
- Performance Testing: See `docs/performance-testing.md`
- Project README: See `README.md`
