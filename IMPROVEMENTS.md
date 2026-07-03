# Plex Manager - Improvement Ideas

**Project:** [mchestr/plex-manager](https://github.com/mchestr/plex-manager)
**Last Updated:** November 27, 2025

---

## 📋 Workflow Instructions

**This is a living brainstorm document for capturing ideas while away from Claude Code.**

### When Adding Ideas (Mobile/Work):
1. Add items to any section below
2. Be as specific or vague as needed - just capture the thought
3. Don't worry about organization - just get it down

### When Ready to Action (At Home with Claude Code):
1. Review items marked with `[READY]` or move items you want to work on
2. Use the "Create GitHub Issues" section below
3. Ask Claude Code to create GitHub issues for selected items
4. Claude Code can use this document to understand context and create detailed issues

### Converting to GitHub Issues:
- Each item can become an issue with labels based on section (bug, feature, refactor, docs, testing, devops)
- Items with detailed context will generate better issues
- Use the API documentation sections as reference material (not issues)

---

## 🚀 Ready to Action

**Move items here when you're ready to create GitHub issues for them:**

-

---

## 🎯 Quick Capture
*Jot down quick ideas here, then organize them into sections below*

-

---

## 🐛 Bug Fixes

### High Priority

-

### Medium Priority

-

### Low Priority

-

---

## ✨ New Features

### Core Features

-

### Nice to Have

-

---

## 🔧 Refactoring & Technical Debt

### Code Quality

- **Always Use Existing UI Components**
  - **⚠️ DO NOT create new dropdowns, selectors, checkboxes, buttons, etc.**
  - ✅ CORRECT: Import and use components from `components/ui/`
  - ❌ WRONG: Creating custom `<select>`, raw `<input type="checkbox">`, or custom dropdown implementations
  - **Available UI Components** (located in `components/ui/`):
    - Forms/controls: `<Button>` (button.tsx), `<StyledInput>`, `<StyledTextarea>`, `<StyledCheckbox>`, `<StyledDropdown>` (preferred), `<StyledSelect>` (legacy), `<DateRangePicker>`
    - Layout/display: `<Card>` (card.tsx), `<Badge>` (badge.tsx), `<Pagination>`, service icons (service-icons.tsx)
    - Feedback: `<LoadingScreen>`, `<LoadingSpinner>`, `<ErrorState>`, toast (`useToast` in toast.tsx)
  - **Why**: Ensures consistent styling, behavior, and accessibility across the app
  - **When adding new UI**: First check if a component exists in `components/ui/` before creating anything new

- **Theme consistency: finish migrating raw elements to `components/ui/` primitives** _(partially done — audit 2026-07-02)_
  - New shared primitives added: `components/ui/card.tsx` (`<Card>`) and `components/ui/badge.tsx` (`<Badge>`). Adopt them app-wide.
  - Remaining raw `<button>` usages: ~86 files / ~186 occurrences. Migrate to `<Button variant=...>`. Map: gradient primary→`primary`, solid slate cancel→`secondary`, icon-only→`ghost`, red destructive→`danger`. Preserve `data-testid`, icons, `aria-*`, and layout classes (e.g. `flex-1`). Highest count: `components/admin/prompts/prompt-template-editor.tsx`, `components/admin/invites/invites-page-client.tsx` (9 each).
  - Remaining raw `<textarea>`: `prompt-template-editor.tsx:661`, `DiscordIntegrationForm.tsx:239` → `<StyledTextarea>`.
  - Remaining raw checkboxes: `prompt-template-editor.tsx:546`, `invites-page-client.tsx` (519/552/586 — note these color cyan for Plex vs purple for Jellyfin; `StyledCheckbox` hardcodes a cyan→purple gradient, so migrating changes that visual semantics — decide intentionally).
  - Card container `bg-slate-800/50 ... rounded-lg p-6` duplicated ~50 files → migrate to `<Card>`, standardizing padding/radius (one `rounded-xl` case in `invite-details-client.tsx`).
  - Pill/badge markup (drifting `px-2`/`px-2.5`, `py-0.5`/`py-1`) → `<Badge tone=...>`.
  - Extract `<WizardFormActions onBack isPending isSuccess>` from the 7 setup-wizard step forms (Back + Continue buttons duplicated verbatim; note their 3-color `from-cyan-600 via-purple-600 to-pink-600` gradient + purple focus ring + `rounded-md` differ from the `<Button>` primitive — either keep exact classes or add a named variant).
  - Extract a `<ModalShell>` (overlay + backdrop + centered dialog + focus-trap) from `components/admin/shared/confirm-modal.tsx`; reuse in `announcement-form-modal`, `invites-page-client`, `prompt-template-editor`, `playground/preview-modal` (standardize z-index/backdrop opacity).
  - Standardize the "primary" button treatment: 4 divergent styles exist (2-color gradient, solid `bg-cyan-600`, reversed `bg-cyan-700`, 3-color pink gradient). Route through `<Button variant="primary">`.
  - **Requires build + visual verification** — do incrementally, not as a blind sweep.

- **Re-enable ESLint safety rules as warnings** _(audit 2026-07-02)_
  - `eslint.config.mjs` disables `no-explicit-any`, `no-unused-vars`, `prefer-const`, `ban-ts-comment` — contradicts CLAUDE.md's strict/no-`any` stance. Set `no-explicit-any` and `ban-ts-comment` to `"warn"` (the `no-unused-vars` gap is largely covered by tsconfig `noUnusedLocals`/`noUnusedParameters`). ~47 non-test `any` occurrences would surface. Scope the `no-require-imports` override to `lib/utils/logger.ts` only.

- **Encrypt external-service secrets at rest** _(audit 2026-07-02)_
  - Plex/Jellyfin/Tautulli/Overseerr/Sonarr/Radarr/LLM keys + per-user Plex tokens + Discord OAuth tokens are stored as plaintext columns (`prisma/schema.prisma`). Add AES-256-GCM at-rest encryption via a dedicated `ENCRYPTION_KEY` (not reused `NEXTAUTH_SECRET`), wrapping all read/write paths + a re-encrypt migration. Defense-in-depth (admin-only, never returned to clients today).

- **JWT does not re-check `isAdmin` after sign-in** _(audit 2026-07-02)_
  - `lib/auth.ts` jwt callback only sets `token.isAdmin` on initial sign-in; a revoked admin keeps admin for up to the 30-day default token life. Re-query admin status periodically (e.g. on `trigger==='update'` or a staleness window) and set an explicit shorter `session.maxAge`.

- **Remove `NEXT_PUBLIC_ENABLE_TEST_AUTH` from server-side auth gating** _(audit 2026-07-02)_
  - The production hard-guard is now in place (`lib/auth.ts`), but server auth still reads a `NEXT_PUBLIC_` (client-exposed) flag. Longer term, gate the test flow on a non-public var and have the E2E flow set that instead (touches `callback-client.tsx`, `e2e/`, `playwright.config.ts`). Also guard `prisma/seed.ts` so the hardcoded `admin@example.com` isn't created when `NODE_ENV==='production'`.

### Performance

-

### Architecture

- **Component Design Philosophy**
  - **Single Responsibility Principle**: Each component/function should do ONE thing well
  - **File Size Limits**:
    - React components: Max ~200-300 lines (if larger, split into smaller components)
    - Utility modules: Max ~150 lines per file
    - If a file exceeds these limits, it's a signal to refactor
  - **Testability First**:
    - Components should be independently testable
    - Extract business logic into separate testable functions/hooks
    - Avoid mixing concerns (UI + data fetching + business logic in one component)
  - **Composition Over Monoliths**:
    - ✅ GOOD: `<SeriesList>` uses `<SeriesCard>`, `<SeriesFilter>`, `<SeriesPagination>`
    - ❌ BAD: One 500-line `<SeriesPage>` component that does everything
  - **When to Split a Component**:
    - Component has multiple responsibilities
    - Component has conditional rendering with 3+ major branches
    - Testing the component requires mocking many different concerns
    - Component file is hard to navigate/understand at a glance
  - **Extract Patterns**:
    - UI logic → Custom hooks (e.g., `useSeriesFilters`, `usePagination`)
    - API calls → Service modules (e.g., `sonarrService.ts`)
    - Shared UI → Presentational components (e.g., `<Card>`, `<Badge>`)
    - Business logic → Pure functions (easy to test)

- **Refine Claude Code agents/subagents in the project**
  - Remove service-specific agents (e.g., Sonarr-agent, Radarr-agent) - these should just be API docs in CLAUDE.md
  - Focus on general workflow agents that manage complex, multi-step processes
  - **Test Fixer Agent**: Automated test repair workflow
    - Run all unit tests and capture failures
    - Document failing tests in markdown file with error details
    - Fix tests one-by-one iteratively
    - Verify each fix by re-running the specific test
    - Update markdown with results as it progresses
    - Provides clear audit trail of what was fixed
  - **Playwright Test Fixer Agent**: Similar pattern for E2E tests
    - Run Playwright test suite
    - Document failing E2E tests with screenshots/traces
    - Fix tests iteratively with verification
    - Ensures test IDs are used (follows project conventions)
    - Can handle browser-specific issues
  - Benefits: Saves main context window, provides structured approach to test maintenance, self-contained workflows

---

## 📚 Documentation

**NOTE:** The following API documentation sections are reference material already added to `CLAUDE.md` - they do not need to be converted to GitHub issues.

- ✅ **Plex Media Server API Conventions** (already in CLAUDE.md)
  - **Official Documentation**: developer.plex.tv (released Sept 2025 - OpenAPI standard)
  - **Authentication**: X-Plex-Token header or query parameter
  - **Default Port**: 32400
  - **Response Format**: XML by default, JSON available with `Accept: application/json` header
  - **Response Structure**: Root `<MediaContainer>` node with attributes and child nodes
  - **Timestamps**: All timestamps in Epoch time
  - **Common Endpoints**:
    - `/library/sections` - Get all libraries
    - `/status/sessions` - Get active sessions (now playing)
    - `/library/sections/{id}/refresh` - Refresh library
    - `/:/scrobble` - Mark as watched
    - `/:/unscrobble` - Mark as unwatched
    - `/library/sections/{id}/all` - Get all items in library
    - `/search` - Search across libraries
  - **Authentication Location**: Get token from Plex Web (Settings → Account → Authorized Devices)
  - **API Type**: RESTful, roughly follows REST conventions

- ✅ **Overseerr API Conventions** (already in CLAUDE.md)
  - **Official Documentation**: api-docs.overseerr.dev (Swagger/OpenAPI)
  - **Authentication**: Two methods supported:
    - Header: `X-Api-Key: YOUR_API_KEY` (recommended for integrations)
    - Cookie authentication (for web UI logins via `/auth/plex` or `/auth/local`)
  - **Default Port**: 5055
  - **Response Format**: JSON
  - **API Key Location**: Settings → General → API Key
  - **Common Endpoints**:
    - `/api/v1/request` - Submit/manage media requests
    - `/api/v1/search` - Search for movies/TV shows
    - `/api/v1/user` - User management
    - `/api/v1/settings` - Get/update settings
    - `/api/v1/media/{tmdbId}` - Get media status and availability
    - `/api/v1/request/{requestId}/approve` - Approve requests
    - `/api/v1/request/{requestId}/decline` - Decline requests
  - **Integration**: Connects to Plex, Sonarr, and Radarr
  - **Permissions System**: Granular permission control (ADMIN, AUTO_APPROVE, MANAGE_REQUESTS, etc.)
  - **Local API Docs**: Also available at http://localhost:5055/api-docs

- ✅ **Shared *arr API Conventions** (already in CLAUDE.md - applies to Sonarr, Radarr, Lidarr, etc.)
  - **Authentication**: API key can be provided via:
    - Header: `X-Api-Key: YOUR_API_KEY` (recommended)
    - Query parameter: `?apikey=YOUR_API_KEY` (also supported)
    - Example (header): `curl -H "X-Api-Key: YOUR_API_KEY" http://localhost:8989/api/v3/series`
    - Example (query): `curl http://localhost:8989/api/v3/series?apikey=YOUR_API_KEY`
  - **API Key Location**: Settings → General → Security → API Key
  - **Default Ports**: Sonarr (8989), Radarr (7878)
  - **Base URL**: If using reverse proxy, may need URL base (e.g., `/sonarr`)
  - **API Version**: All use v3 API (v2 deprecated, v4 coming)
  - **Common Endpoints**:
    - `/api/v3/series` (Sonarr) or `/api/v3/movie` (Radarr) - Get all items
    - `/api/v3/command` - Trigger actions (RefreshSeries, RescanMovie, etc.)
    - `/api/v3/qualityprofile` - Get quality profiles
    - `/api/v3/rootfolder` - Get root folders
  - **Content-Type**: `application/json` for POST/PUT requests
  - **Error Handling**: Returns standard HTTP status codes
  - **Rate Limiting**: Be mindful of repeated API calls
  - **Security Note**: API keys provide admin access - keep them secret!
  - **⚠️ CRITICAL BUG PREVENTION**: When generating browser URLs to link to media:
    - ✅ CORRECT: Use `titleSlug` field from API response (e.g., `/series/game-of-thrones`)
    - ❌ WRONG: Using `id` field will create broken links
    - Example: `https://sonarr.example.com/series/{titleSlug}` NOT `/series/{id}`

- ✅ **Tautulli API Conventions** (already in CLAUDE.md)
  - **Endpoint Structure**: `http://IP:PORT[/HTTP_ROOT]/api/v2?apikey=$apikey&cmd=$command`
  - **Authentication**: API key in query parameter `?apikey=YOUR_API_KEY`
  - **API Key Location**: Settings → Web Interface → API → Show API Key
  - **Default Port**: 8181
  - **Response Format**: JSON by default, optional `out_type` parameter for XML
  - **Response Structure**: `{"response": {"result": "success", "message": null, "data": [...]}}`
  - **Key Commands**:
    - `get_activity` - Current streaming activity
    - `get_history` - Playback history with filters
    - `get_libraries` - List all libraries
    - `get_users` - List all users
    - `get_metadata` - Detailed media metadata by rating_key
    - `terminate_session` - Stop a streaming session
    - `notify` - Send notifications
  - **Common Parameters**: `user_id`, `rating_key`, `section_id`, `start`, `length`, `order_column`, `order_dir`
  - **Security Note**: API provides full admin access to Tautulli

---

## 🧪 Testing

- ✅ **Playwright Testing Best Practices** (already in CLAUDE.md)
  - **⚠️ ALWAYS use data-testid for selectors** to prevent flaky tests
  - ✅ CORRECT: `await page.getByTestId('submit-button').click()`
  - ❌ WRONG: Using CSS classes, text content, or DOM structure as selectors
  - When writing tests, add `data-testid` attributes to components if they don't exist
  - Test IDs should be descriptive and stable (won't change with styling/content updates)
  - Example: `<button data-testid="sonarr-series-add-button">Add Series</button>`

---

## 🚀 DevOps & Infrastructure

- ✅ **Establish new Claude Code workflow** (implemented)
  - Brainstorm ideas in chat first
  - Create GitHub issue with implementation plan before coding (provides rollback point if things go wrong)

- ✅ **Create custom /commands** in Claude Code (implemented)
  - Store in `.claude/commands/` (project-level) or `~/.claude/commands/` (global/user-level)
  - Just create markdown files - Claude Code auto-discovers them
  - Use `$ARGUMENTS` variable to pass parameters (e.g., `/issue $ARGUMENTS`)
  - Commands checked into git are shared with whole team
  - Examples: `/test`, `/lint`, `/build`, `/review`, `/optimize`
  - Can include frontmatter for metadata (description, allowed-tools, model selection)

- ✅ **Refine CLAUDE.md** (implemented)
  - Keep it concise - it's loaded with every request (costs tokens!)
  - Use bullet points, not paragraphs - you're writing for Claude, not onboarding a junior dev
  - Include: bash commands, code style, repository etiquette, file locations
  - Review and refactor periodically as it can grow stale
  - Can be hierarchical (project root, subdirectories, global `~/.claude/CLAUDE.md`)
  - Use `@path/to/file` syntax to import other files

- ✅ **Use # syntax to add context to CLAUDE.md dynamically** (feature available)
  - Press `#` at start of message to add information to project memory
  - Claude will ask where to save: Project (checked in), Project Local (gitignored), or User (global)
  - Great for capturing decisions/patterns as you discover them

---

## 💡 Ideas to Explore

*Ideas that need more thought or research*

- **Admin UI: Unified Observability Dashboard (High-Level Overview)**
  - Currently have individual dashboards: LLM usage, LLM cost, user management, share analytics
  - **Idea**: Create a high-level admin home/overview dashboard with KPIs and drill-down capabilities
  - **High-Level Dashboard Could Show**:
    - System health at-a-glance (all green? warnings? errors?)
    - Key metrics summary cards:
      - Total users / Active users (last 7/30 days)
      - LLM cost summary (current month vs last month)
      - Discord bot activity (if enabled)
      - Request volume (Overseerr integration)
      - Database size / growth trend
      - Recent errors/warnings count
    - Quick links to detailed dashboards
    - Real-time activity feed (recent user actions, bot commands, errors)
    - Alerts/notifications section (things requiring admin attention)
  - **Drill-Down Pattern**:
    - Click any metric card → navigate to detailed dashboard
    - Existing dashboards become "detail views" accessible from overview
    - Consistent navigation/breadcrumbs
  - **Database Statistics Dashboard** (one of the drill-down views):
    - Database size/growth over time
    - Table sizes and row counts
    - Query performance stats (slowest queries)
    - Index usage and recommendations
    - Connection pool stats / Cache hit rates
    - Storage breakdown (media metadata, user data, logs, etc.)
    - Technical considerations:
      - Performance impact of gathering stats
      - Real-time vs periodic snapshots
      - Database-specific features (Postgres pg_stat_*, MySQL INFORMATION_SCHEMA)
      - Visualization library (charts/graphs)
  - **Benefits**:
    - Single pane of glass for admin health checks
    - Faster issue identification
    - Better understanding of system usage patterns
    - Consistent admin UX across all monitoring features
  - **Questions to Answer**:
    - What are the most important "at-a-glance" metrics?
    - How real-time do these need to be? (SSE? Polling? Static on page load?)
    - What triggers should alert admins to take action?
    - Should this be the admin landing page or separate "monitoring" section?

---

## ✅ Completed

*Move items here once implemented*

### GitHub Issues Created (November 27, 2025)

**Note:** Issues #29-45 were related to the maintenance feature which has been removed in PR #204.

#### Earlier Issues

- **Database Refactoring: Consolidate service-specific tables into generic services table**
  - Created: [Issue #25](https://github.com/mchestr/plex-manager/issues/25)
  - Labels: `enhancement`, `refactor`, `database`
  - Priority: Low (technical debt for future)

- **Discord bot: Add help/command discovery feature**
  - Created: [Issue #26](https://github.com/mchestr/plex-manager/issues/26)
  - Labels: `enhancement`, `discord`
  - Display commands, syntax, permissions, examples

- **Discord bot: Extend audit logging system to track bot commands**
  - Created: [Issue #27](https://github.com/mchestr/plex-manager/issues/27)
  - Labels: `enhancement`, `discord`, `observability`
  - Track: command name, user, timestamp, parameters, success/failure, response time
  - Note: Audit system exists at `lib/security/audit-log.ts` but only logs admin actions

- **Admin UI: Discord integration dashboard**
  - Created: [Issue #28](https://github.com/mchestr/plex-manager/issues/28)
  - Labels: `enhancement`, `admin-ui`, `discord`, `observability`
  - Display bot activity, stats, command usage, active users, metrics
  - Depends on Issue #27

### Documentation & Tooling

- ✅ **Added API documentation to CLAUDE.md**
  - Plex Media Server API conventions
  - Tautulli API conventions
  - Overseerr API conventions
  - Sonarr/Radarr shared *arr API conventions
  - All with authentication patterns, common endpoints, and gotchas

- ✅ **Created custom slash commands in `.claude/commands/`**
  - `/test` - Run tests (unit, E2E, with various modes)
  - `/lint` - Run ESLint with optional auto-fix
  - `/build` - Build the application and check for errors
  - `/review` - Perform comprehensive code review
  - `/create-issues` - Convert improvement ideas to GitHub issues
  - `/fix-tests` - Automated unit test fixer agent
  - `/fix-e2e` - Automated Playwright E2E test fixer agent

- ✅ **Added Component Design Philosophy to CLAUDE.md**
  - Single Responsibility Principle
  - File size limits and when to refactor
  - Testability-first approach
  - Composition over monoliths patterns

- ✅ **Added UI Component Guidelines to CLAUDE.md**
  - Always use existing components from `components/ui/`
  - Don't create custom dropdowns, selectors, etc.

- ✅ **Added Playwright Testing Best Practices to CLAUDE.md**
  - Always use `data-testid` for selectors
  - Avoid flaky tests with stable selectors

---

## 📝 Notes & Context

*Any relevant context, decisions, or links*

- This document serves as a brainstorm/idea capture tool
- Items marked ✅ are already implemented or documented
- Items with GitHub issue links have been converted to actionable tasks
- API documentation sections are reference material (don't need issues)
- Use `/create-issues` command to convert new items to GitHub issues

---

## 🤖 For Claude Code: GitHub Issue Creation

**When asked to create GitHub issues from this document, follow this pattern:**

### Issue Template Format:
```
Title: [Clear, actionable title]

Description:
- Context from this document
- Acceptance criteria
- Reference any API docs or conventions from this file
- Link to relevant sections

Labels: [bug|enhancement|refactor|documentation|testing|devops|discord|admin-ui|database|observability]
```

### Available Labels:
- **bug**: Something isn't working
- **enhancement**: New feature or request
- **documentation**: Improvements or additions to documentation
- **refactor**: Code refactoring and technical debt
- **database**: Database schema and migrations
- **discord**: Discord bot integration
- **admin-ui**: Admin dashboard and UI
- **observability**: Monitoring, logging, and metrics

### Creating Issues:
1. Use the GitHub CLI (`gh issue create`)
2. Include all context from this document in the issue body
3. Reference the specific API documentation sections if relevant
4. Add appropriate labels
5. Create a checklist for multi-step items
6. Link related issues if they depend on each other
7. Update this document to move items to "Completed" section with issue links

### Example Commands:
```bash
# Create a single issue
gh issue create --title "Add feature X" --label "enhancement,discord" --body "..."

# Add labels to existing issue
gh issue edit 25 --add-label "refactor,database"

# Create missing labels
gh label create "refactor" --description "Code refactoring and technical debt" --color "fbca04"
```
