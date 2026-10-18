# Best Practices, Architecture and Operations

Generated 2026-10-17 · 2 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

Auditors: `best-practices` (framework, architecture, conventions; source IDs FA-xx) and `testing-ops` (testing, CI, operations, performance, robustness; source IDs OPS-xx). Each finding below lists the source IDs it was merged from.

## Executive summary

- **Upgrade Next.js now (BP-01).** The lockfile pins next 16.1.1. The image optimizer is enabled with `hostname: '**'` for both http and https, so anyone can reach an unauthenticated AVIF remote-code-execution path (GHSA-2xp9-vwfh-vxw4) and an SSRF path (GHSA-cjq9-62q9-8jv4) through `/_next/image`. `npm audit --omit=dev` reports 30 advisories (2 critical, 17 high), and CI runs no audit gate. Bumping to next 16.4.2 is S effort.
- **The publish workflow ships unreviewed code (BP-02).** `docker-publish.yml` runs on `workflow_run` for every PR whose Build passes. It checks out the PR head and pushes it to GHCR as `:latest`, `:main` and `:sha-<main sha>`. The container entrypoint runs `prisma migrate deploy` on every boot, so unmerged migrations reach any database that pulls the image.
- **Running the E2E suite locally wipes your database (BP-07).** The specs load `.env` and call `deleteMany()` on users, Rewinds, LLM usage and all service configs, with no check that the database is a test database. The project's `/fix-e2e` agent runs this suite without a permission prompt.
- **With default settings the Discord bot is offline half the time (BP-12).** A 60s poll interval drives renewal of a 30s lease. This regressed in commit 515443f. The bot is up about 60s, then down about 60s, and logs in again roughly 720 times a day.
- **Rewind generation is the main reliability risk for 2026 (BP-22, BP-24, BP-25, BP-26).**
  - The whole pipeline runs inline in a Server Action.
  - Its 2s status polls are themselves Server Actions, so they queue behind the generation call.
  - Rows stuck in "generating" are never recovered.
  - Nothing stops two billed runs at once.
  - There is no retry on 429/5xx.
  - Every generation downloads the whole Plex library, the user's lifetime Tautulli history and every Overseerr request.
  - The playground's statistics builder has already drifted from production.
  - The result is stored as an unvalidated JSON string.
- **Share links can return 404 to everyone during the year-end sharing burst (BP-23).** The share page fetches its own API route from the server. All rate limiters share one in-memory Map keyed only by IP, so every share-page render uses the same 100-requests-per-15-minutes bucket.
- **Data access over-fetches and leaks.** Admin pages load every LLMUsage prompt and response blob just to sum four numbers (BP-28). Invite listings send each redeeming user's `plexAuthToken` to the admin's browser, because the encryption extension does not process included relations (BP-03).
- **The verification net has holes.** Test files are never type-checked: there are 601 hidden errors, and some tests are stale (BP-08). `eslint-config-next` is installed but not wired in; enabling it gives 18 errors (BP-09). Auth, encryption, the queue core and the setup wizard are barely covered (BP-10). E2E runs only against `next dev`, which hides the production-only admin error-screen bug (BP-27).
- **The code has drifted from CLAUDE.md in several places, but the baseline is healthy.**
  - Drift:
    - TanStack Query is used in 1 file, while 28 components fetch through server actions inside `useEffect` (BP-29).
    - 44 of 91 parameterised actions have no Zod validation (BP-04).
    - 16 component files are dead (BP-36).
    - 19 components and 10 action files are over the size limits (BP-30).
  - Healthy: `tsc --noEmit` reports 0 errors, ESLint 0 errors, Next 16 conventions are in place, and multi-step writes use `$transaction`.
- **Operations basics are missing.**
  - A Redis outage at boot hangs the whole site (BP-13).
  - SIGTERM handlers race Next's `process.exit` (BP-15).
  - The runtime image is EOL Node 25 and pulls in devDependencies without a lockfile (BP-16).
  - There is no health endpoint, and request IDs never reach the logs (BP-17).
  - Stripe events are applied without an ordering check (BP-14).

## Severity table

Counts after merging, non-refuted findings only (no finding was refuted outright; see the appendix for ruled-out sub-claims).

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 20 |
| Low | 15 |
| Info | 0 |
| **Total** | **39** |

## Findings

Status key:
- **verified**: the verifier reproduced the claim as stated.
- **confirmed**: the verifier agreed after spot checks.
- **adjusted**: the claim holds, but its severity or details were corrected.
- **disputed**: the reviewers disagree.
- **unverified**: not checked.

Where the verifier and the refutation pass disagreed on severity, both views are summarised.

### 1. Security and supply chain

#### BP-01 Pinned Next.js 16.1.1 plus a wildcard image optimizer exposes an unauthenticated RCE/SSRF path; CI has no security gates

- **Severity:** critical
- **Status:** verified. Both auditors raised it, and it survived refutation. The refutation pass re-framed it around Next.js and the image optimizer rather than general version drift; the non-security drift is split out as BP-38.
- **Source:** FA-18, OPS-07, FA-19 (remotePatterns part)
- **Where:** `package.json:46`, `package.json:47`, `package-lock.json:11030-11031`, `next.config.js:6-17`, `proxy.ts:60-70`, `Dockerfile:12`, `.github/workflows/build.yml`, `.github/workflows/docker-publish.yml:66-70`, `.github/dependabot.yml`
- **Evidence:**
  ```js
  // next.config.js:6-17
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  ```
  - **Audit results.** `npm audit --omit=dev` returns `{"moderate":11,"high":17,"critical":2,"total":30}`, and every advisory has a fix. next 16.1.1 falls inside 37 advisories, whose vulnerable range runs up to 16.3.7. The relevant ones:
    - GHSA-2xp9-vwfh-vxw4, critical: unauthenticated RCE in the Image Optimization API with AVIF. Fixed in 16.3.3.
    - GHSA-cjq9-62q9-8jv4, high: SSRF in Image Optimization. Fixed in 16.3.8.
    - GHSA-9g9p-9gw9-jx7f and GHSA-h64f-5h5j-jqjh: image-optimizer DoS.
    - GHSA-mq59-m269-xvcx: null-origin Server Actions CSRF bypass. Fixed in 16.1.7.
    - Several high-severity RSC and Server Action DoS advisories.
  - **Why the path is reachable.**
    - `images.unoptimized` is not set globally.
    - The proxy matcher excludes `_next/image`.
    - In `node_modules/next/dist/server/image-optimizer.js`, `BYPASS_TYPES` (line 165) does not include AVIF, so an AVIF file reaches `sharp(buffer)` at line 747, where libheif decodes it.
    - The private-IP check at line 792 blocks private IPs only. An attacker host on a public IP passes it.
  - **Other vulnerable production packages:** undici and ws (via discord.js), sharp/libvips, qs (a direct dependency), lodash, postcss and defu. next-auth 4.24.13 has 3 advisories that are fixed in 4.24.15.
  - **What ships.** The Docker `deps` stage runs `npm ci`, so the image ships exactly these versions.
  - **CI gaps.**
    - `build.yml` has only the lint, build, test and e2e jobs. There is no `npm audit`, no CodeQL and no dependency review.
    - `docker-publish.yml` has no image scan, no SBOM and no `platforms:`, so it builds amd64 only.
    - Dependabot is configured but has never produced a next bump.
- **Impact:**
  - On any internet-facing instance, an unauthenticated request to `/_next/image?url=https://evil.example/x.avif&w=640&q=75` can execute code as the `nextjs` user.
  - From there an attacker can read `NEXTAUTH_SECRET`, `DATABASE_URL` and the encryption key, and through the database the encrypted Plex, Tautulli, Overseerr, Stripe and LLM secrets.
  - The same endpoint works as an SSRF probe into internal services (Plex :32400, Tautulli :8181, Redis).
  - Nothing in CI flags this, and every `:latest` image built since the advisories were published carries the vulnerable code.
  - arm64 self-hosters (NAS, Raspberry Pi, Apple Silicon) get no image.
- **Not applicable here:**
  - next-auth's critical email-normalizer advisory and the `getToken` advisory: only CredentialsProvider is used (`lib/auth.ts:6`), and nothing calls `getToken`.
  - Middleware/proxy-bypass advisories: `proxy.ts` only logs and does no auth.
  - The hono, @prisma/dev, mysql2, effect and deepmerge-ts highs: these are Prisma CLI tooling and not reachable at runtime.
  - Open point: it could not be confirmed offline whether the AVIF RCE needs non-default `images.formats`. The SSRF and DoS advisories need nothing beyond the wildcard config.
- **Recommendation:**
  - **Now:**
    - Bump next to 16.4.2 (at least 16.3.8) and next-auth to 4.24.15.
    - Run `npm update` or add overrides for undici, ws, qs and sharp.
    - Until the upgrade ships, set `images.unoptimized: true`. Restricting `remotePatterns` to plex.tv is not enough on its own:
      - The only optimized `next/image` is `components/admin/users/user-table-row.tsx:75`. It renders `user.image`, which can be a Jellyfin avatar hosted on the operator's own server.
      - That host cannot be pinned in the config of a prebuilt image.
      - So either mark that image `unoptimized` or disable optimization globally.
  - **Then add CI gates:**
    - `npm audit --omit=dev --audit-level=high`, or `dependency-review-action`.
    - CodeQL.
    - A Trivy or Grype scan of the built image.
    - Grouped Dependabot PRs.
    - Optionally SBOM and multi-arch builds.
- **Effort:** S for the upgrade and config change; M including the CI gates.

#### BP-02 `docker-publish.yml` publishes images built from unmerged PR heads, including forks, to GHCR as `:latest` / `:main`

- **Severity:** high
- **Status:** verified. The two reviewers disagreed on severity:
  - **Verifier: critical.** It is a supply-chain path to every self-hoster who pulls `:latest`.
  - **Refutation pass: high.**
    - The mechanism was confirmed in the code and against the live registry: the repo is public, and `latest`, `main` and `sha-60e5fc0` share one digest.
    - But the repo documents no GHCR consumers. The README's Docker section does not mention GHCR, and `docker-compose.yml` builds locally.
    - It would become critical if the owner's own deployment, or other users, auto-pull `:latest`.
- **Source:** OPS-01
- **Where:** `.github/workflows/docker-publish.yml:4-7`, `:25-32`, `:39`, `:56-63`, `:69`, `.github/workflows/build.yml:4-7`, `docker-entrypoint.sh:5`, `Dockerfile:75`
- **Evidence:**
  ```yaml
  on:
    workflow_run:
      workflows: ["Build"]
      types: [completed]          # no branches: filter
  ...
  (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success')
  permissions: { contents: read, packages: write }
  ref: ${{ github.event.workflow_run.head_sha || github.ref }}
  push: ${{ github.event_name != 'pull_request' }}
  ```
  - Build runs on every `pull_request`.
  - In a `workflow_run` context, `GITHUB_REF` and `GITHUB_SHA` point at the default branch. docker/metadata-action has no special case for `workflow_run`.
  - So `type=ref,event=branch` resolves to `main`, `type=sha` to the main HEAD sha, and `latest` is enabled because `is_default_branch` is true.
  - `docker-entrypoint.sh:5` runs `npx prisma migrate deploy`.
- **Impact:**
  - Any PR whose Build passes is published under the project's namespace as `:latest`, `:main` and `:sha-<main HEAD>`. That includes owner branches, and fork PRs once a run is approved; GitHub exempts prior contributors from approval by default.
  - Its `org.opencontainers.image.revision` label shows the main sha, so provenance is wrong and sha-tag immutability is broken.
  - A fork can rewrite `build.yml` so that "Build" always succeeds. The default-branch publish job then builds the attacker's Dockerfile with a write token. This is the classic `workflow_run` "pwn request" pattern.
  - Deployments that pull `:latest` apply unmerged, possibly destructive migrations on boot.
  - Every PR also triggers two Docker builds.
- **Recommendation:**
  - Drop `workflow_run`. Publish from `push: branches: [main]` and `tags: v*`, in a job that `needs:` the lint, test and build jobs.
  - Alternatively, gate the job on `github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main'`.
  - Never check out `workflow_run.head_sha` in a job that holds write tokens.
  - Keep the `pull_request` build as a no-push smoke test.
- **Effort:** S

#### BP-03 Invite queries send full User rows, including `plexAuthToken`, to client components; the encryption extension does not process included relations

- **Severity:** medium
- **Status:** adjusted. The leak is real, but the only recipient is an authenticated admin, so it is a least-privilege leak rather than a breach.
- **Source:** FA-04
- **Where:** `actions/invite.ts:458-467`, `actions/invite.ts:483-492`, `components/admin/invites/invites-page-client.tsx:131-133`, `components/admin/invites/invite-details-client.tsx:41`, `lib/prisma.ts:80-111`, `prisma/schema.prisma:21`
- **Evidence:**
  ```ts
  // actions/invite.ts:458-466 (getInvites; getInviteDetails is identical)
  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    include: { usages: { include: { user: true } } },
  })
  ```
  - Both actions are called from `'use client'` components. One of them carries `// @ts-ignore - Prisma types might be slightly off in client` at `invites-page-client.tsx:133`.
  - The extension looks up `ENCRYPTED_FIELDS[model]` for the queried model and decrypts only top-level rows, so nested User rows pass through untouched.
- **Impact:**
  - Every invite listing serialises each redeeming user's Plex account token into the server-action response. It is visible in devtools, HAR files, browser extensions and to any XSS.
  - The token is ciphertext when `ENCRYPTION_KEY` is set and plaintext otherwise.
  - The decrypt gap is also a trap for future code: any encrypted column read through an `include` silently comes back as ciphertext.
  - Checked and clean: `discordConnection: true` in `getUserDetails` is mapped to safe fields (`user-queries.ts:147-156`), and no other `user: true` includes exist.
- **Recommendation:**
  - Use `user: { select: { name: true, email: true, image: true } }` in both queries, then delete the `@ts-ignore` comments.
  - Either make `decryptRow` walk nested results by relation model, or add a test that fails when an encrypted field is read through an include.
- **Effort:** S

#### BP-04 44 of 91 parameterised server actions have no Zod validation, and action return shapes are inconsistent

- **Severity:** medium
- **Status:** confirmed
- **Source:** FA-09
- **Where:** `actions/discord-activity.ts:43`, `:55`, `actions/invite.ts:394-445`, `actions/playground-wrapped.ts:15-20`, `:33-66`, `actions/prompt-test.ts:27`, `actions/admin/admin-config.ts:194-225`, `lib/plex-auth.ts:71-76`, `app/admin/discord/page.tsx:63`, `actions/setup.ts:49`, `actions/admin/subscriptions.ts:19`
- **Evidence:**
  - Unvalidated actions per file:
    - discord-activity: 14
    - user-queries: 5
    - admin-config, admin/subscriptions and prompts: 3 each
    - admin-llm-history, admin-users, announcements, invite and user-marks: 2 each
    - six more files: 1 each
  - Examples:
    - `createInvite` uses `options` directly. `maxUses: options.maxUses || 1` accepts negative, fractional and huge values.
    - `savePlaygroundWrapped` persists client-supplied `statistics: WrappedStatistics`. It resolves the user with `prisma.user.findFirst({ where: { name: input.userName } })`, but `name` is not unique.
    - `getDiscordActivityLogs` runs `new Date(params.startDate)` on raw input, and the page casts `markType: markType as never`.
    - The client-callable `getPlexAuthToken(pinId: string)` interpolates `` `${PLEX_API_ENDPOINT}/pins/${pinId}` `` (`lib/plex-auth.ts:71-76`). Its caller is `callback-client.tsx:107`.
  - Return shapes in use:
    - non-discriminated `{ success: boolean; error?: string }`
    - discriminated unions in the Stripe actions
    - entity-or-null
    - `[]` on error
    - thrown errors (`requireAdmin` outside the `try`, `completeSetup`)
  - Raw `error.message` is returned at 27 sites by the auditor's count; the verifier counted 45 occurrences under `actions/`, some of them in logging. This includes ZodError JSON from `schema.parse()` in `setup.ts`.
- **Impact:**
  - Types disappear at the RPC boundary. Malformed values reach Prisma, where they surface as generic failures, or get persisted (playground stats).
  - A Rewind can be attached to the wrong user who happens to share a display name.
  - Every caller re-implements result handling, and some surface internal error text to users.
  - Most of the unvalidated actions sit behind `requireAdmin`, which limits exploitability.
- **Recommendation:**
  - Define one result type: `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }`.
  - Add a `defineAction(schema, handler, { auth: 'public' | 'user' | 'admin' })` wrapper, or adopt next-safe-action. It should run safeParse, then the auth check, then the handler, then error mapping.
  - Migrate in this order: `invite.ts`, `playground-wrapped.ts` (resolve the user by id), `prompt-test.ts`, `discord-activity.ts`, `lib/plex-auth.ts`.
  - Never return raw `error.message`.
- **Open lead (unverified):**
  - `getPlexAuthToken` is a public action that reads any Plex PIN using the app-wide `PLEX_CLIENT_IDENTIFIER`.
  - If plex.tv does not also require the PIN code, anyone who obtains or guesses another user's `pinId` could retrieve that user's token.
  - This was not checked and should be confirmed by the security review.
- **Effort:** M

#### BP-05 Header and viewport config gaps: static unsafe CSP, pinch-zoom disabled, one title for every page, no next/font, dead webpack block

- **Severity:** medium
- **Status:** adjusted. The verifier raised it from low, citing the wildcard optimizer (now tracked in BP-01) and a real WCAG 1.4.4 failure.
- **Source:** FA-19 (the request-ID part moved to BP-17)
- **Where:** `next.config.js:40`, `next.config.js:53`, `next.config.js:61-91`, `app/layout.tsx:5-15`
- **Evidence:**
  ```js
  // next.config.js:53
  value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; ..."
  ```
  ```ts
  // app/layout.tsx:5-11
  export const viewport: Viewport = { width: "device-width", initialScale: 1,
    maximumScale: 1, userScalable: false, themeColor: "#0f172a" };
  ```
  - The deprecated `X-XSS-Protection` header is still set (line 40).
  - A webpack externals callback (lines 64-91) duplicates `serverExternalPackages` and never runs while Turbopack is the default.
  - Metadata is exported only by `app/layout.tsx` (`title: "Plex Manager"`) and the share page, so all 32 pages share one title.
  - No `next/font` is loaded anywhere.
- **Impact:**
  - The CSP gives little XSS protection.
  - Disabling pinch-zoom fails WCAG 1.4.4.
  - Every tab and bookmark reads "Plex Manager".
  - The dead webpack block misleads maintainers.
- **Recommendation:**
  - After the Next upgrade (BP-01), move to a nonce-based CSP in `proxy.ts`. Doing it before the upgrade is unsafe: GHSA-ffhc-5mcf-pf4q is an XSS affecting App Router apps that use CSP nonces below 16.2.5.
    - Drop `'unsafe-eval'` in production.
    - Add `frame-ancestors`, `object-src 'none'` and `base-uri`.
    - Remove `X-XSS-Protection`.
  - Remove `maximumScale` and `userScalable`.
  - Delete the webpack block.
  - Add `next/font` and a `title.template`, with per-page metadata.
- **Effort:** S

#### BP-06 `'use server'` is used as a server-only marker and for read helpers; the `server-only` package is never imported

- **Severity:** low
- **Status:** adjusted. The impact is latent: no guard or loader is reachable from the client today.
- **Source:** FA-10
- **Where:** `lib/guards.ts:1`, `:15-20`, `lib/plex-auth.ts:1`, `lib/jellyfin-auth.ts:5`, `actions/discord-activity.ts:43`, `actions/user-queries.ts:31-33`, `actions/chatbot/**`
- **Evidence:**
  - `lib/guards.ts:15-18` says: "NOTE: this file is \"use server\", so every export MUST be a locally-declared async function; a `export { … } from \"@/lib/access\"` re-export is rejected". It then exports `getAccessGateStatus(userId: string)`.
  - `user-queries.ts:31-33`: "This action is exposed as a public endpoint, so the check must live here".
  - There are zero `import 'server-only'` statements. The only matches are comments, in `lib/auth.ts:38` and `lib/guards.ts:13`.
  - `actions/chatbot/` holds 23 non-action modules (tools, executors, prompts) next to the single `'use server'` file, `index.ts`.
- **Impact:**
  - Every export of a `'use server'` module becomes a public POST endpoint as soon as any client module imports it. Guards and loaders are one import away from being unauthenticated RPCs.
  - Authors are forced to re-check auth inside read helpers, and every export must be async.
  - Today `lib/guards.ts` is imported only by a Server Component layout. `lib/plex-auth.ts` is genuinely client-called (see BP-04).
- **Recommendation:**
  - Use `import 'server-only'` for guards, access checks and loaders.
  - Move read functions into `lib/data/*`.
  - Keep `'use server'` for mutations under `actions/`.
  - Move `actions/chatbot/**` internals to `lib/chatbot/`.
  - Move the client-called Plex PIN functions to `actions/plex-auth.ts`, with Zod validation.
- **Effort:** M

### 2. Testing and CI

#### BP-07 E2E specs wipe whichever database `.env` points at; the setup-wizard `deleteMany` has no test-database guard

- **Severity:** high. The rubric counts data loss as critical; this is high because it only happens on a local run, and the data lost is the maintainer's development database rather than end users' production data.
- **Status:** verified. It survived refutation, and the refuter found it more likely than first stated.
- **Source:** OPS-04
- **Where:** `playwright.config.ts:1`, `:50-55`, `:62-65`, `e2e/setup-wizard.spec.ts:40-54`, `e2e/global-setup.ts:26`, `e2e/helpers/prisma.ts:4-11`, `docker-compose.yml:43-52`, `e2e/README.md:199-202`, `:411`, `example.env:5`, `.claude/settings.json`, `.claude/commands/fix-e2e.md:22`
- **Evidence:**
  ```ts
  // e2e/setup-wizard.spec.ts:39-54
  await prisma.lLMUsage.deleteMany();
  await prisma.wrappedShareVisit.deleteMany();
  await prisma.plexWrapped.deleteMany();
  ...
  await prisma.user.deleteMany();
  await prisma.lLMProvider.deleteMany();
  ...
  await prisma.plexServer.deleteMany();
  await prisma.setup.deleteMany();
  ```
  - `playwright.config.ts` begins with `import 'dotenv/config'` and sets `reuseExistingServer: !process.env.CI`.
  - `createE2EPrismaClient` only checks that `DATABASE_URL` is defined.
  - The `setup-wizard` project runs on every plain `npm run test:e2e`.
  - The compose file defines a `db-playwright` service on port 5433, but nothing references it.
  - `example.env:5` points at `localhost:5432/plex_wrapped`. That is the same database the compose `app` service uses.
  - `.claude/settings.json` pre-approves `Bash(npm run test:e2e)`, and `/fix-e2e` starts by running that command.
- **Impact:**
  - Following the documented setup and then running `npm run test:e2e` permanently deletes:
    - all users
    - all Rewind history, which cost LLM credits to generate
    - all LLM usage records and providers
    - every server and API-key configuration
  - `afterAll` only re-seeds the two test users.
  - A Claude agent running `/fix-e2e` during the planned UI refresh can trigger this without a prompt.
  - The seeded admin account (`admin-plex-id`) is only usable through the test-auth path, so it adds little risk.
- **Recommendation:**
  - Require `E2E_DATABASE_URL` (or a `.env.e2e`), defaulting to `db-playwright` on port 5433.
  - Refuse to run unless the database name matches `/test|e2e|playwright/` or `E2E_ALLOW_DESTRUCTIVE=1` is set.
  - Put the guard in `createE2EPrismaClient`, so `global-setup` and every spec inherit it.
- **Effort:** S

#### BP-08 Test files are never type-checked: `tsconfig.test.json` inherits the parent's exclude list, hiding 601 type errors and stale tests

- **Severity:** medium
- **Status:** confirmed. Both auditors found it independently.
- **Source:** OPS-15, FA-11 (test typecheck part), OPS-19 (missing typecheck job)
- **Where:** `tsconfig.json:43-50`, `tsconfig.test.json:1-16`, `jest.config.js:1`, `.github/workflows/build.yml:10`, `__tests__/actions/wrapped-settings.test.ts:476-479`, `__tests__/api/admin-wrapped-by-user-route.test.ts:75`, `__tests__/actions/auth.test.ts:40`
- **Evidence:**
  - `tsconfig.json` excludes `"**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"`. `tsconfig.test.json` has `"extends": "./tsconfig.json"` and overrides `include` but not `exclude`.
  - `npx tsc -p tsconfig.test.json --listFilesOnly` lists only `types/jest-dom.d.ts`, `types/next-auth.d.ts`, `.next/dev/types/routes.d.ts` and `next-env.d.ts`.
  - A scratch config with `exclude` overridden reports 601 errors in 84 test files: TS2339 217, TS6133 81, TS2345 67, TS2540 65, TS2353 62.
  - Stale examples:
    - `wrapped-settings.test.ts` still passes `year: 2024` after migration `20251127010000_remove_wrapped_year_field`.
    - `admin-wrapped-by-user-route.test.ts:75` passes `{ params: { userId } }` to a handler that now awaits a Promise. It passes only because `await` on a non-promise works.
  - Jest uses SWC and does no type checking. No script or CI job runs tsc on the tests.
  - 75 test files hand-roll `jest.mock('@/lib/prisma')`, which accounts for most of the TS2339 errors.
- **Impact:** Tests can pass while calling APIs in shapes the code no longer accepts. The existing `tsconfig.test.json` gives a false sense of safety, which matters before a large refactor.
- **Recommendation:**
  - Add `"exclude": ["node_modules", ".next", "e2e"]` to `tsconfig.test.json`.
  - Introduce a typed Prisma mock helper (`jest-mock-extended` `mockDeep<ExtendedPrismaClient>()`, or `jest.mocked`).
  - Burn the errors down, starting with the TS2353 shape mismatches.
  - Then add a `typecheck` script (`tsc --noEmit && tsc --noEmit -p tsconfig.test.json`) and a CI job for it.
- **Effort:** M

#### BP-09 ESLint omits the Next, react-hooks and jsx-a11y presets, which are installed but not used

- **Severity:** medium
- **Status:** adjusted. The counts were reproduced exactly; two of the claimed runtime effects are not current bugs.
- **Source:** FA-11
- **Where:** `eslint.config.mjs:1-2`, `package.json:76`, `components/ui/styled-checkbox.tsx:13`, `app/admin/users/[userId]/wrapped/page.tsx:27`
- **Evidence:**
  - `eslint.config.mjs` imports only `@eslint/js` and `typescript-eslint`. `eslint-config-next` 16.2.10 is a devDependency at `package.json:76`, and it bundles react-hooks 7, @next/next and jsx-a11y.
  - Adding `eslint-config-next/core-web-vitals` in a scratch config gives 18 errors and 10 warnings:
    - 10 `react-hooks/purity`, e.g. ``const checkboxId = id || `checkbox-${Math.random()...}` ``.
    - 6 `set-state-in-effect`.
    - 2 `static-components`: `AdminHeader` is declared inside the page render.
    - 6 `exhaustive-deps`.
    - 4 `no-img-element`, all in the dead `service-icons.tsx`.
  - `eslint.config.mjs` has no `no-console` rule.
- **Impact:**
  - Hook-dependency bugs ship unnoticed; the per-keystroke refetch in BP-29 is one example.
  - So do render-impure IDs and patterns that block the React Compiler.
  - Today the StyledCheckbox ID causes no hydration mismatch, because every server-rendered usage passes an explicit `id`, but it regenerates on every render.
  - `AdminHeader` lives in an async Server Component, so it causes no remounts.
- **Recommendation:**
  - Spread `eslint-config-next/core-web-vitals` and `/typescript` into the config.
  - Fix the purity and set-state-in-effect errors: use `useId` in StyledCheckbox, and `useState` initializers for random particles. Hoist `AdminHeader`.
  - Add `no-console: warn` scoped to `lib/`, `actions/` and `app/api`, with an override for `lib/utils/logger.ts`.
  - Optionally add `max-lines` (see BP-30).
- **Effort:** S

#### BP-10 Critical modules are barely tested; app/ and hooks/ are excluded from coverage; no thresholds; E2E skips Rewind and production mode

- **Severity:** medium
- **Status:** confirmed. The structure was verified; the exact percentages are the auditor's own run.
- **Source:** OPS-10 (plus the dev-only E2E observation from FA-01)
- **Where:** `jest.config.js:20-26`, `lib/auth.ts:32`, `:41`, `:277`, `:444-460`, `lib/prisma.ts:71`, `:77-117`, `:120`, `lib/plex-auth.ts:1`, `actions/admin/queue.ts`, `actions/admin/admin-servers.ts`, `lib/queue/worker.ts:37`, `playwright.config.ts:44-56`, `:60`, `e2e/user-scenarios.spec.ts:40`, `:118`
- **Evidence:**
  - `collectCoverageFrom: ['components/**', 'lib/**', 'actions/**', ...]` sets no `coverageThreshold` and excludes `app/**` and `hooks/**`. `hooks/` has tests, but they do not count.
  - Statement coverage of key modules:
    - `lib/auth.ts` 26% (branches 24%)
    - `lib/plex-auth.ts` 0%
    - `lib/jellyfin-auth.ts` 13%
    - `lib/prisma.ts` 16%. The `$allOperations` encrypt/decrypt extension is never exercised.
    - `actions/admin/queue.ts` 0%, `admin-servers.ts` 18%, `admin-users.ts` 28%, `admin/watchlist.ts` 0%
    - `import-plex-users.ts` and `playground-wrapped.ts` 0%
    - `lib/queue/{worker,client,connection}` 0%
    - `lib/instrumentation/node.ts` 0%
    - `lib/watchlist/*` 0%
    - `tautulli.ts` and `overseerr.ts` 0%
    - setup wizard 0.95%
  - `lib/prisma.ts:120` builds the client eagerly, and line 71 throws when `DATABASE_URL` is unset. Locally that breaks 5 suites at import time when no `.env` exists.
  - Playwright runs only chromium against `npx next dev`, although CLAUDE.md claims Chrome, Firefox and WebKit. Test auth requires `NODE_ENV !== 'production'`.
  - No spec generates a Rewind. The wrapped specs seed a hand-written legacy blob and assert ``getByText(new RegExp(`${currentYear}`))``.
- **Impact:**
  - Login, session claims, at-rest encryption, admin credential management and all background-job plumbing can regress without a failing test.
  - Coverage can fall silently.
  - Production-only behaviour, such as BP-27, is invisible to E2E.
  - The flow the owner most wants to rebuild has no end-to-end safety net.
- **Recommendation:**
  - Set per-path thresholds on the security-critical paths (`lib/auth*`, the `lib/prisma.ts` extension, `lib/security`, `actions/admin/**`, `lib/queue/**`) rather than a global number.
  - Make the Prisma client lazy.
  - Include `app/api/**` and `hooks/**` in coverage.
  - Add a mocked-LLM Rewind E2E spec.
  - Add one Playwright project that runs against `next build && next start`.
- **Effort:** L

#### BP-11 CI hygiene: unused services, E2E only against `next dev`, two broken workflows, no concurrency, permissions or timeouts

- **Severity:** low
- **Status:** adjusted. The typecheck gap is counted in BP-08, and Docker builds live in a separate workflow.
- **Source:** OPS-19
- **Where:** `.github/workflows/build.yml:14-27`, `:105-118`, `:194`, `.github/workflows/test-analyze-failure.yml:11`, `:28`, `:58`, `:76`, `:88`, `.github/workflows/claude-issue-triage.yml:28`, `playwright.config.ts:60-63`
- **Evidence:**
  - **build.yml:**
    - The lint and test jobs start `postgres:16` services they never use. The test job needs `DATABASE_URL` only because `lib/prisma.ts` throws at import.
    - Every job repeats checkout, `npm ci` and `prisma generate`.
    - There is no top-level `permissions:`, no `concurrency:` and no `timeout-minutes`.
    - `npx playwright install --with-deps` installs all three browsers, though only chromium projects exist, and the browsers are not cached.
  - **Playwright:** the webServer runs `npx next dev` with `timeout: 30000`.
  - **test-analyze-failure.yml:**
    - It listens to `workflows: ["CI"]`, but the workflow is named "Build", so it never fires.
    - It pins `anthropics/claude-code-action@main`.
    - Its PR-comment step lacks `pull-requests: write`.
    - It interpolates LLM output into shell (`OUTPUT='${{ steps.detect.outputs.structured_output }}'`).
    - `gh workflow run` would fail anyway, because Build has no `workflow_dispatch` trigger.
  - **claude-issue-triage.yml** calls `/label-issue`, but the command file is `.claude/commands/label-issues.md`.
- **Impact:**
  - CI is slower and costlier than it needs to be, and production-mode behaviour is never tested.
  - Dead automation looks like it runs.
  - The broken workflow is a script-injection vector if anyone "fixes" its trigger.
- **Recommendation:**
  - Delete `test-analyze-failure.yml` rather than repairing it.
  - Rename the triage command to `/label-issues`.
  - In `build.yml`:
    - Add `permissions: contents: read`, `concurrency` with `cancel-in-progress`, and `timeout-minutes`.
    - Drop the unused Postgres services.
    - Install only chromium and cache `~/.cache/ms-playwright`.
    - Run E2E against `next build && next start`, with a longer webServer timeout.
  - Add coverage thresholds once a baseline exists.
- **Effort:** M

### 3. Runtime reliability and operations

#### BP-12 With default settings the Discord bot drops offline every minute: the 60s poll interval exceeds the 30s lease

- **Severity:** high
- **Status:** verified. It survived refutation, and the refuter added a multi-pod double-bot variant.
- **Source:** OPS-03
- **Where:** `lib/instrumentation/node.ts:208`, `lib/discord/lock/poller.ts:7`, `:155-157`, `:222-228`, `lib/discord/lock/lease.ts:9`, `:171-191`, `lib/discord/bot.ts:105-112`, `:199-206`, `example.env:42`
- **Evidence:**
  ```ts
  // lib/instrumentation/node.ts:208
  const pollIntervalMs = parseInt(process.env.DISCORD_BOT_POLL_INTERVAL_MS || "60000", 10)
  // lib/discord/lock/lease.ts:9
  export const DEFAULT_LOCK_LEASE_DURATION_MS = 30 * 1000
  // lib/discord/lock/poller.ts:222-227
  const renewed = await this.lock.renew()
  if (!renewed) { this.running = false; await this.callbacks.onLockLost() }
  // lib/discord/lock/lease.ts:175 (inside renew)
  expiresAt: { gt: now }, // Only renew if not expired
  ```
  - Before commit 515443f, `lib/discord/lock.ts` ran a separate `LOCK_RENEWAL_INTERVAL_MS = 10 * 1000` renewal timer. The single-timer refactor tied renewal to the 60s poll.
  - Nothing else calls `.renew(`.
  - The unit tests use their own interval and a mocked lock.
- **Impact:**
  - **Single pod, default config, bot enabled:**
    - t=0: the lock is acquired and the bot logs in.
    - t=30: the lease expires.
    - t=60: renew fails and the bot is destroyed.
    - t=120: the lock is re-acquired and the bot logs in again with a fresh IDENTIFY.
  - The bot is offline about half the time. Slash commands get "application did not respond", and DMs go unanswered.
  - About 720 logins a day is close to Discord's limit of 1,000 IDENTIFY calls per 24h.
  - **Multi-pod:** another pod can acquire the expired lease between t=30 and t=60, so two bots answer the same messages until the first pod's renew fails.
- **Recommendation:**
  - Renew on its own cadence (about lease/3), independent of the acquisition poll.
  - Otherwise reject `pollIntervalMs >= leaseDurationMs / 2` in the `BotLockPoller` constructor.
  - Change the defaults in `node.ts` and `example.env` to 10000.
  - Add a fake-timer test that wires the instrumentation defaults into a real `DistributedLock` and `BotLockPoller`.
- **Effort:** S

#### BP-13 Next.js serves nothing until instrumentation `register()` resolves, so a Redis outage at boot hangs the whole site

- **Severity:** medium
- **Status:** adjusted. The mechanism is real. It bites only under misconfiguration or an outage of an optional dependency, and it heals once Redis returns.
- **Source:** OPS-02
- **Where:** `instrumentation.ts:14`, `lib/instrumentation/node.ts:11-17`, `:53-72`, `:254-256`, `lib/queue/connection.ts:18-23`, `lib/queue/client.ts:117`, `:139`, `lib/discord/bot.ts:112`
- **Evidence:**
  ```ts
  // lib/instrumentation/node.ts:11-17
  export async function startNodeInstrumentation() {
    await startQueueWorker()
    await startDiscordBotPolling()
  }
  // lib/queue/connection.ts:18-23
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  ```
  - `startQueueWorker` awaits `startWorker()`, a DB query, and then `scheduleRepeatingJob(...)` or `removeScheduledJob(...)`.
  - In Next 16, `next-server.js:620-625`, `prepareImpl()` awaits `instrumentation.register()`, and `base-server.js:457`, `handleRequest`, awaits `prepare()`.
  - A scratch probe using the app's ioredis options against an unreachable Redis left `upsertJobScheduler` pending after 8s.
  - The comment at `node.ts:254` says "this doesn't block server startup", but the next line is `await poller.start()`, and that call reaches `client.login()`.
- **Impact:**
  - If Redis is down at boot, or `REDIS_URL` names the wrong host, the entire site, login included, hangs silently. The logs show only "Redis connection error".
  - Discord login adds a few seconds to every boot.
- **Recommendation:**
  - Make `register()` fire-and-forget: `void startBackground().catch(log)`.
  - Put a timeout on scheduler setup, using `Promise.race` or a short readiness ping.
  - Add an `/api/health` liveness route that touches neither Redis nor Discord.
  - Later, consider a separate worker process (BP-19).
- **Effort:** S

#### BP-14 Stripe jobs record events before handling them and apply snapshots in any order; the grant job never re-checks subscription status

- **Severity:** medium
- **Status:** adjusted. The ordering bug is the core issue. The redelivery claims were overstated, and Stripe is opt-in.
- **Source:** OPS-06
- **Where:** `lib/queue/jobs/stripe.ts:218-259`, `:269-280`, `:306-311`, `:339-348`, `:406-450`, `app/api/stripe/webhook/route.ts:81-91`, `lib/queue/worker.ts:30`, `:98`, `lib/queue/client.ts:21-34`
- **Evidence:**
  ```ts
  // lib/queue/jobs/stripe.ts:344-348 (before the handler runs)
  await prisma.stripeEvent.upsert({ where: { id: event.id },
    create: { id: event.id, type: event.type }, update: {} })
  // :308-311 (handlePaymentFailed)
  await prisma.subscription.updateMany({ where: { stripeSubscriptionId },
    data: { status: SubscriptionStatus.PAST_DUE } })
  ```
  - `handleSubscriptionUpdated` writes `status`, `currentPeriodEnd` and `cancelAtPeriodEnd` unconditionally, then enqueues a grant when the status is ACTIVE. `handleSubscriptionDeleted` sets CANCELED.
  - The worker runs with concurrency 5.
  - `stripe.events.retrieve` returns the event-time snapshot, not live state. The comment at line 339, "act on Stripe's current truth", is misleading.
  - `processPlexAccessGrant` invites the user without checking that the subscription is still ACTIVE.
- **Impact:**
  - At the end of dunning, Stripe emits `invoice.payment_failed` and `customer.subscription.deleted` together. If payment_failed's write lands last, the row ends up PAST_DUE. `evaluateRevokeGuard` treats that as protected, so the ex-subscriber keeps Plex access indefinitely.
  - A late `updated(active)` arriving after `deleted` flips the row back to ACTIVE and re-invites the user.
  - A manual resend from the Stripe dashboard is blocked by the StripeEvent check, and also by the BullMQ jobId dedupe for as long as the failed job is kept.
  - Exhausted jobs alert no one, although they can be retried from the admin queue UI (`actions/admin/queue.ts:322`).
- **Recommendation:**
  - Ignore stale events. Either store the last applied `event.created` per subscription, or re-fetch the live subscription with `stripe.subscriptions.retrieve` in the updated, deleted and payment_failed handlers.
  - Never move CANCELED back to PAST_DUE or ACTIVE from an older event.
  - Re-check ACTIVE in the grant processor before inviting.
  - Mark StripeEvent processed only after the handler succeeds, using a `processedAt` column.
  - Alert (admin banner or Discord) when retries are exhausted.
- **Effort:** M

#### BP-15 Three uncoordinated SIGTERM handlers race Next's `process.exit(0)`, cutting off in-flight jobs

- **Severity:** medium
- **Status:** confirmed
- **Source:** OPS-09
- **Where:** `lib/instrumentation/node.ts:89-90`, `:158-159`, `:278-279`, `lib/queue/worker.ts:157`
- **Evidence:**
  - Three separate async `process.on("SIGTERM", shutdown)` handlers are registered. None sets a deadline or calls `prisma.$disconnect()`.
  - Next's `start-server.js:377-379` registers its own cleanup unless `NEXT_MANUAL_SIG_HANDLE` is set. That cleanup awaits `server.close()` and then calls `process.exit(0)` (line 371) without waiting for the app's handlers.
  - `worker.close()` waits for active jobs, and a `WATCHLIST_SYNC_ALL` job can run for minutes.
  - Docker sends SIGKILL after 10s.
- **Impact:**
  - On every deploy or restart, active BullMQ jobs are killed mid-run. They are recovered only through stall detection, which re-runs them.
  - The Discord lease is not released.
  - DB and Redis connections are dropped instead of closed.
  - Inline Rewind generations are killed by the SIGKILL and left in "generating" (BP-22).
- **Recommendation:**
  - Set `NEXT_MANUAL_SIG_HANDLE=true` and use a single coordinator:
    1. Close the HTTP server.
    2. Run `Promise.allSettled([worker.close(), poller.stop(), closeQueue()])` under a deadline shorter than the orchestrator's grace period.
    3. Call `prisma.$disconnect()` and quit Redis.
    4. Exit.
- **Effort:** S

#### BP-16 Runtime image installs the whole dependency tree, devDependencies included and unlocked, runs EOL Node 25, and has no HEALTHCHECK or init process

- **Severity:** medium
- **Status:** confirmed. Minor corrections: Node 25 went EOL on 2026-06-01, the replica migrate "race" is serialized by Prisma's advisory lock, and `docker-compose.yml` is a dev file.
- **Source:** OPS-08
- **Where:** `Dockerfile:1`, `:58-63`, `:75-76`, `docker-entrypoint.sh:5`, `docker-compose.yml:1`, `:20`, `:38`
- **Evidence:**
  ```dockerfile
  FROM node:25.8-alpine AS base
  ...
  COPY --from=builder /app/package.json ./package.json
  RUN ... npm install --no-package-lock "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}" && ...
  ENTRYPOINT ["./docker-entrypoint.sh"]
  CMD ["npm", "run", "start:prod"]
  ```
  - Two scratch reproductions (`is-odd`, `left-pad`) confirmed that `npm install --no-package-lock <pkg>` in a directory with a `package.json` also installs the other devDependencies. So jest, playwright, eslint and the rest are resolved into the image, without the lockfile, at whatever versions are current at build time.
  - `NODE_ENV` is unset.
  - CI uses Node 22, and mise uses `lts`.
  - There is no HEALTHCHECK, and npm is PID 1 with no tini.
  - `docker-compose.yml`:
    - uses the obsolete `version: '3.8'` key
    - sets `NODE_ENV=development` on a production runner build
    - publishes `5432:5432` (postgres/postgres) and `6379:6379` (no auth) on all interfaces
    - uses `depends_on` without `condition: service_healthy`
    - runs postgres:15 while CI uses 16
- **Impact:**
  - The image is larger and less reproducible than it should be, and devDependency CVEs ship to production.
  - Production runs an unsupported Node line that differs from CI.
  - Orchestrators cannot health-check the container.
  - Signal handling depends on npm.
- **Recommendation:**
  - Install the Prisma CLI at the lockfile version into an isolated prefix in its own stage, or run migrations as a one-off job.
  - Use node:24 LTS, and align the Node version across Docker, CI and mise.
  - Set `NODE_ENV=production`.
  - Run `node server.js` under tini or `--init`.
  - Add `/api/health` and a HEALTHCHECK.
  - In compose: bind db and redis to 127.0.0.1, use `service_healthy`, and drop the `version` key and the `NODE_ENV` override.
- **Effort:** M

#### BP-17 Observability gaps: request IDs never reach logs, production errors lose stack traces, no health or metrics endpoint, no `onRequestError`

- **Severity:** medium
- **Status:** adjusted. The original recommendation's header-copy code was buggy and has been corrected below.
- **Source:** OPS-16, FA-19 (request-ID part)
- **Where:** `proxy.ts:20-53`, `:24`, `:60-70`, `lib/utils/logger.ts:445`, `:583-587`, `instrumentation.ts:1`, `lib/connections/prometheus.ts:12`
- **Evidence:**
  ```ts
  // proxy.ts:24-27, 46-50
  let userId: string | undefined          // never assigned
  return runWithRequestContext(requestId, userId, () => {
    ...
    const response = NextResponse.next()
    response.headers.set("X-Request-ID", requestId)
  ```
  ```ts
  // lib/utils/logger.ts:583-587
  errorMetadata.err = { message: error.message, name: error.name,
    ...(isDevelopment && { stack: error.stack }) }
  ```
  - The AsyncLocalStorage scope ends when the proxy returns, and the ID is never forwarded as a request header.
  - `runWithRequestContext`, `generateRequestId` and `setRequestUserId` have no other production callers.
  - The matcher comment says API routes are excluded, but the regex `/((?!_next/static|_next/image|favicon.ico|...).*)` does not exclude them. Every request, including RSC prefetches and the Stripe webhook, is logged at info level with its search params.
  - `instrumentation.ts` exports only `register`.
  - None of the 14 `route.ts` files is a health, readiness or metrics route.
  - `prometheus.ts` is an outbound client; the app exports no metrics of its own.
- **Impact:**
  - Failed generations, webhook failures and job errors cannot be correlated across logs or debugged without stack traces.
  - Uptime monitors and orchestrators have nothing to probe.
  - Per-request info logging adds noise and cost.
  - There are no metrics for queue depth, job latency, LLM cost or error rate.
- **Recommendation:**
  ```ts
  const headers = new Headers(request.headers)
  headers.set('x-request-id', requestId)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('X-Request-ID', requestId)
  ```
  - Read `x-request-id` through a small cached `getRequestId()` in actions and route handlers, and pass it into job payloads.
  - Log `stack` and `cause` at error level in production.
  - Export `onRequestError`.
  - Add `/api/health/live` and `/api/health/ready`. The ready check should run DB `SELECT 1` and a Redis ping, both with timeouts.
  - Fix the matcher comment, or exclude the webhook and prefetches.
  - Log successful requests at debug level, with key-based redaction of query params.
- **Effort:** M

#### BP-18 The pg pool uses defaults (max 10, unbounded wait for a connection, no statement timeout) and is shared by web, worker and bot

- **Severity:** low
- **Status:** adjusted. The exhaustion scenario is unlikely, and max=10 is not a regression.
- **Source:** OPS-11
- **Where:** `lib/prisma.ts:73-75`, `lib/queue/worker.ts:30`
- **Evidence:**
  - `new PrismaPg({ connectionString: process.env.DATABASE_URL })` passes no pool options.
  - pg-pool 3.10.1 defaults to `max || 10` (`index.js:89`). With no `connectionTimeoutMillis`, waiters queue with no timeout (`index.js:198-200`).
  - With Prisma 7 driver adapters, the `?connection_limit=` and `pool_timeout` URL parameters are ignored.
- **Impact:**
  - Prisma takes a connection per query, and every interactive `$transaction` is DB-only, so exhaustion needs more than 10 concurrent queries. That is unlikely for a self-hosted community.
  - The real change from Prisma 6 is the loss of the 10s `pool_timeout`. Without it, an exhausted pool hangs instead of failing fast.
  - No query has a ceiling.
- **Recommendation:**
  - Pass the options explicitly: `max: Number(process.env.DB_POOL_MAX ?? 10)`, `connectionTimeoutMillis: 10_000`, `idleTimeoutMillis: 30_000`, `statement_timeout: 30_000`, `application_name: 'plex-manager'`.
  - Document in `example.env` that the URL pool parameters no longer apply.
- **Effort:** S

#### BP-19 Workers, scheduler and Discord bot run inside every web process; two lock implementations and two sync paths

- **Severity:** low
- **Status:** adjusted. "Blocks horizontal scaling" was overstated: both DB leases exist for multi-pod safety, and multiple BullMQ workers are supported. A worker process alone would not offload Rewind, which is not a queue job. The rate-limit store aspects moved to BP-23.
- **Source:** OPS-12
- **Where:** `lib/queue/worker.ts:4`, `lib/instrumentation/node.ts:23-38`, `:100-164`, `lib/watchlist/lock.ts:40-140`, `lib/discord/lock/lease.ts:84-130`
- **Evidence:**
  - `worker.ts:4` says it "Runs within the Next.js server process". Every replica starts a worker unless `ENABLE_QUEUE_WORKER=false`, and `scripts/` holds no worker entrypoint.
  - Without Redis, a second watchlist-sync implementation runs ("Legacy: Polling-based watchlist sync"). It has its own module-global DB lease in `lib/watchlist/lock.ts`, which nearly duplicates `DistributedLock`.
- **Impact:**
  - Web traffic and background jobs share one event loop.
  - Every web deploy restarts the bot and the jobs.
  - Two lock implementations and two sync paths double the maintenance and test surface.
- **Recommendation:**
  - First move Rewind generation into BullMQ (BP-22).
  - Then offer an optional `worker` entrypoint or compose profile.
  - Extract one generic `DistributedLock`, parameterised by lock id and model, and delete the watchlist copy.
  - Consider making Redis required and removing the legacy polling path, since compose already ships Redis.
- **Effort:** M

#### BP-20 Queue jobs lack deduplication, and request-path enqueues can hang on Redis

- **Severity:** low
- **Status:** adjusted. Several impacts were refuted (see the appendix).
- **Source:** OPS-17
- **Where:** `lib/queue/client.ts:81`, `actions/watchlist.ts:198`, `lib/queue/worker.ts:115-124`, `lib/queue/connection.ts:19-23`, `app/api/stripe/webhook/route.ts:93`
- **Evidence:**
  - The default job id is ``sanitizeJobId(options?.jobId ?? `${jobType}:${Date.now()}`)``.
  - `addJob(JOB_TYPES.WATCHLIST_SYNC_USER, { userId: session.user.id, triggeredBy: "manual" ... })` passes no jobId and has no rate limit, so repeated clicks run parallel syncs for one user under concurrency 5.
  - The `failed` handler only logs.
  - `maxRetriesPerRequest: null` together with the default offline queue makes enqueues from server actions block while Redis is down.
- **Impact:**
  - Duplicate concurrent syncs waste work and risk upsert races on `watchlistSyncHistory`. Overseerr double-submits are mitigated by its pre-check and its 409 handling.
  - A Redis blip turns interactive actions into hung requests.
  - Exhausted jobs vanish without notice.
- **Recommendation:**
  - Give manual syncs a deterministic jobId (`watchlist-sync-user-${userId}`) and a per-user `checkRateLimit`.
  - On request paths, enqueue through a connection with `enableOfflineQueue: false`, or wrap the call in a short timeout, and fail fast with a user-facing error.
  - Change the "never 5xx" wording in CLAUDE.md, `docs/stripe.md` and the route so it refers to signature failures only.
  - Optionally surface exhausted jobs in the admin UI.
- **Effort:** M

#### BP-21 Migration hygiene: retroactive init baseline, non-descriptive names, hand-written timestamps, no drift check

- **Severity:** low
- **Status:** adjusted. The inline PK style and the destructive drops are not defects; see the appendix.
- **Source:** OPS-21
- **Where:** `prisma/migrations/20250101000000_init/migration.sql:2`, `prisma/migrations/20251122201244_combined_schema_updates/migration.sql:41-44`, `:73-76`, `prisma/migrations/20251129215232_latest/migration.sql:1`, `.github/workflows/build.yml:88`, `:189`
- **Evidence:**
  - `20250101000000_init` predates every other migration by 11 months and uses `CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, ...`.
  - The next migration is a hand-merged `-- Combined Migration: Schema Updates` with `DO $$ ... IF EXISTS (SELECT FROM information_schema.columns ...)` guards.
  - `20251129215232_latest` creates `DiscordCommandLog`.
  - About 11 migrations carry hand-typed, round-number timestamps, e.g. `20260703000000` and `20260703000001`.
  - CI runs only `npx prisma migrate deploy`, never `migrate diff`.
  - Drift itself was not checked, because no DB credentials were available.
- **Impact:**
  - With hand-authored SQL and timestamps, drift and ordering mistakes are likely, and nothing would detect them.
  - Long-time installs may need `migrate resolve` steps that are not documented.
- **Recommendation:**
  - Add a CI drift step to the existing Postgres job, e.g. `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, with a shadow DB in `prisma.config.ts`. Verify the flags against the installed CLI.
  - Generate future migrations with `prisma migrate dev --create-only` and give them descriptive names.
  - Optionally add a README note on the init baseline and `prisma migrate resolve --applied`.
- **Effort:** S

### 4. Rewind pipeline

#### BP-22 Rewind generation runs synchronously in a Server Action; polls queue behind it; no queue, stuck-job recovery, concurrency guard or provider retry

- **Severity:** medium
- **Status:** verified. Both auditors raised it, and the reviewers disagreed on severity:
  - **Verifiers: high.** This is the flagship feature and the core reliability risk for a heavier 2026 Rewind running slower reasoning models.
  - **Refutation passes: medium.**
    - It works for most users today.
    - A proxy timeout does not strand the row: the action keeps running and writes "completed" or "failed".
    - The admin user-detail page always offers Regenerate.
    - The bulk path is dead code.
    - Same-tab double-clicks are serialized.
- **Source:** FA-05, OPS-05
- **Where:** `actions/wrapped-generation.ts:36-394`, `:107-117`, `:138-159`, `:306`, `:401-454`, `lib/queue/types.ts:14-20`, `lib/wrapped/api-calls.ts:18-22`, `:147-174`, `:190-217`, `lib/wrapped/llm.ts:112-114`, `actions/user-queries.ts:48-64`, `components/dashboard/wrapped-card.tsx:100-149`, `components/wrapped/wrapped-page-client.tsx:21-51`, `components/wrapped/wrapped-home-button.tsx:63`, `hooks/use-wrapped-polling.ts:27-51`, `app/admin/users/[userId]/page.tsx:245`
- **Evidence:**
  ```ts
  // actions/wrapped-generation.ts:113-117
  } else {
    // Generating status - allow user to retry their own, or admin for any user
    if (!isOwnWrapped && !isAdmin) { return { success: false, ... } }
  }
  // :305-306
  // 5. Generate wrapped content using LLM
  const llmResult = await generateWrappedWithLLM(
  ```
  - **Inside the request:** the action upserts `status: "generating"`, then runs the Tautulli, Plex, Overseerr and leaderboard fetches and the LLM call before writing "completed" or "failed".
  - **Queue and timeouts:**
    - `JOB_TYPES` has only watchlist, Stripe and Plex-access jobs.
    - The LLM timeout defaults to 5 minutes.
    - `callOpenAI` makes one attempt, with no retry on 429/5xx.
  - **Unrecorded spend:** truncation and validation failures return no `tokenUsage`, and `llm.ts:112-114` returns before `LLMUsage` is written.
  - **Polling:**
    - Next's `app-router-instance.js:46-140` serializes client Server Actions through `actionQueue.pending`.
    - So the 2s `setInterval` polls of `getUserPlexWrapped`, which are themselves actions, queue behind the generate call and then fire in a burst.
    - Each poll returns the full PlexWrapped row, including `data`.
    - The polling code is copied in four places.
  - **No recovery:** nothing reaps stale "generating" rows, and the schema has no started-at column.
  - **Bulk:** `generateAllPlexWrapped` loops sequentially in one request, but its only caller, `UserManagement`, is not rendered anywhere.
- **Impact:**
  - **Behind a 60s nginx or 100s Cloudflare timeout:** the user sees a spurious "Failed to generate" toast while the work continues. The queued polls then fire, and the user eventually lands on `/wrapped`.
  - **Duplicate billed runs:** a retry click, a second tab or a direct POST while the row is "generating" starts a second full billed run, and the later one overwrites the first.
  - **Restart mid-run:** a deploy, OOM or SIGKILL leaves the row "generating" forever. The dashboard and `/wrapped` show the animation and poll every 2s, with no retry or cancel. Only an admin who opens `/admin/users/[userId]` can recover it.
  - **Transient failures:** a 429 fails the Rewind outright.
  - **Cost reporting:** dashboards under-report spend on failed calls.
- **Recommendation:**
  - Add a `REWIND_GENERATE` BullMQ job; the worker and Redis already exist.
  - The action validates input, then claims the row atomically with `updateMany({ where: { id, status: { notIn: ['queued','generating'] } }, data: { status: 'queued' } })`. It enqueues with jobId `rewind-${userId}-${year}`, using backoff and `UnrecoverableError` for configuration errors, and returns immediately.
  - Bulk runs fan out one job per user, limited by worker concurrency. Keep a DB-backed fallback for installs without Redis.
  - Add `generationStartedAt` and a sweeper that fails stale rows.
  - Retry 429/5xx and honour `Retry-After`. Record token usage on every completed HTTP call.
  - Replace the four polling copies with one `useWrappedStatus` TanStack Query hook:
    - It reads a status-only GET route or query that selects `status`, `error` and `updatedAt`.
    - It uses `refetchInterval` with backoff and a maximum duration, and offers a retry button.
  - Move post-completion work (revalidation, share-card pre-render) into the job or `after()`.
- **Effort:** M

#### BP-23 The public share page fetches its own API route, and every rate limiter shares one IP-keyed Map, so share links can 404 under load

- **Severity:** medium
- **Status:** verified. The reviewers disagreed on severity:
  - **Verifier: high.** It assumed that in the default compose setup every request keys to `"unknown"`.
  - **Refutation pass: medium.**
    - Next 16.1.1 sets `req.headers['x-forwarded-for'] ??= socket.remoteAddress` (`base-server.js:554`), so `"unknown"` is effectively unreachable.
    - Browser traffic keys to each visitor's own IP, so it drains the share bucket only when it shares the server's IP.
    - Failure needs more than about 100 share renders per 15 minutes across the instance, and it recovers when the window resets.
- **Source:** FA-02, OPS-12 (rate-limit store)
- **Where:** `app/(app)/wrapped/share/[token]/page.tsx:10-29`, `:41-42`, `:99-106`, `app/api/wrapped/share/[token]/route.ts:17-21`, `:56-66`, `app/api/wrapped/og-image/route.tsx:36-39`, `lib/security/rate-limit.ts:14-25`, `:37-43`, `:52-69`, `:127-142`, `app/(app)/layout.tsx:47-49`
- **Evidence:**
  ```ts
  // page.tsx:10-28
  const response = await fetch(`${baseUrl}/api/wrapped/share/${token}`, { cache: "no-store" })
  if (!response.ok) { if (response.status === 404) return null
    throw new Error(`Failed to fetch shared wrapped: ${response.statusText}`) }
  ... } catch (error) { console.error(...); return null }
  // lib/security/rate-limit.ts:14-15, 39-42
  // In-memory store (for production, use Redis)
  const rateLimitStore = new Map<string, RateLimitEntry>()
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  ```
  - The page calls `notFound()` when the result is null.
  - The share (100), poster (500), admin (50), auth (10) and Stripe-webhook limiters all read and increment the same un-namespaced per-key counter. The OG image route uses `shareRateLimiter` too.
  - Next memoizes the identical GET across `generateMetadata` and the page, so each view costs about one limiter hit.
  - The route records visit analytics from the self-fetch, so every `WrappedShareVisit` stores the server's IP hash, Node's user agent and no referer.
  - The store is per-process and swept only every 5 minutes, and rotating `X-Forwarded-For` values grow it without bound.
- **Impact:**
  - The self-fetch always carries the app server's IP, so all share-page renders on the instance share one 100-requests-per-15-minutes bucket.
  - Real visitors plus link-preview crawlers, such as Mastodon fan-out, can exceed that during the late-December sharing burst. Every share link then 404s for the rest of the window, with "Share Not Found" metadata that crawlers may cache.
  - Because the store is not namespaced, a user whose browser shares one IP key across limiters gets 429s from `/api/admin/*` after opening 3-5 Rewinds, at 10-20 poster requests each. That applies to a household behind one NAT, or a proxy that does not set `X-Forwarded-For`.
  - Signed-in members who have not finished onboarding, or who are gated by a subscription, are redirected away from public share links by the guarded `(app)` layout. Anonymous visitors pass.
- **Recommendation:**
  - Extract a server-only `getSharedWrappedByToken(token)`, e.g. in `lib/data/share.ts`, wrapped in React `cache()`. Call it from both `generateMetadata` and the page.
  - Record the visit with `after()`, using the real request headers.
  - Keep the API route only if an external consumer needs it.
  - Namespace limiter keys as `${limiterName}:${ip}` and back them with Redis, which is already a dependency.
  - Cap the Map size meanwhile, and document the trusted-proxy requirement.
  - Move `wrapped/share/[token]` into an unguarded route group, e.g. `app/(public)/`.
- **Effort:** S

#### BP-24 Rewind data collection downloads the whole Plex library, the user's lifetime Tautulli history and every Overseerr request for each user, with no effective timeouts

- **Severity:** medium
- **Status:** confirmed. The verifier found the Overseerr misattribution worse than reported.
- **Source:** OPS-13
- **Where:** `lib/wrapped/server-statistics.ts:72-127`, `lib/wrapped/tautulli-user-statistics.ts:136-197`, `lib/wrapped/overseerr-statistics.ts:31`, `:66-98`, `:121-126`, `lib/utils/fetch-with-timeout.ts:39-47`, `actions/wrapped-generation.ts:195-210`
- **Evidence:**
  - **Plex:** for every section the code fetches ``${baseUrl}/library/sections/${sectionKey}/all?X-Plex-Token=${token}&includeGuids=1``, plus `&type=4` for all episodes. Both requests are unpaginated, and the code sums `Part.size` for storage. This runs on every user's generation and is never cached.
  - **Tautulli:** a loop marked `// Fetch watch history WITHOUT date filters` pages `get_history&user_id=...&length=1000` over the user's whole lifetime, then filters by year in memory.
  - **Overseerr:**
    - `/request?take=100&skip=...&filter=all` pages through every user's requests.
    - `/user` is called with no take/skip. Overseerr pages by default (10 upstream), so on larger servers the id lookup misses most users.
    - The fallback `return !reqEmail || reqEmail.toLowerCase() === userEmail.toLowerCase()` then counts requests with no email as the user's. This becomes the common path, not an edge case.
  - **Timeouts:**
    - About 50-62 bare `fetch()` calls lack an AbortSignal, e.g. 13 in `tautulli.ts`, 9 in `overseerr.ts` and 7 in `discord/api`. undici's 300s defaults apply to them.
    - `fetchWithTimeout` clears its timer in `finally` once headers arrive, so slow bodies are unbounded.
- **Impact:**
  - Generation time and memory scale with library size times user count. A 30k-episode library means tens of MB of JSON parsed per user on the web event loop.
  - A hung upstream stalls a generation for up to 5 minutes per call.
  - Overseerr stats are misattributed on servers with more Overseerr users than fit on one page.
  - Plex tokens and Tautulli API keys sit in URLs, where proxies and logs capture them.
- **Recommendation:**
  - Compute server-wide stats (library size, storage) once per run, or cache them, rather than per user.
  - Filter Tautulli history by date range at the API.
  - Look up the Overseerr user by plexId or email through a paged `/user?take=...`, or a map built once per run, and remove the `!reqEmail` fallback.
  - Pass `AbortSignal.timeout(ms)` to every fetch, and keep the signal active through `.json()`.
  - Move tokens to headers where the API supports it.
- **Effort:** M

#### BP-25 Rewind statistics assembly is copy-pasted, and the playground copy has drifted from production

- **Severity:** medium
- **Status:** confirmed
- **Source:** FA-07
- **Where:** `actions/wrapped-generation.ts:163-305`, `:293-302`, `app/api/admin/playground/statistics/route.ts:50-57`, `:73-208`, `lib/wrapped/prompt-template.ts:29-88`
- **Evidence:**
  - Both files run the same sequence: find the active Tautulli, `fetchTautulliStatistics`, then Plex, then Overseerr, then `Promise.all([fetchTopContentLeaderboards(...), fetchWatchTimeLeaderboard(...)])`, then build `const statistics: WrappedStatistics = {...}`.
  - The generator adds `derived: tautulliStatsData.derived,` and `percentile: computePercentile(`. The playground object at lines 192-206 has neither.
  - `prompt-template.ts` fills `{{longestStreak}}`, `{{peakHour}}`, `{{peakDayOfWeek}}`, `{{derivedStatsSection}}` and `{{percentileSection}}` from exactly those fields.
  - The playground route also resolves the user with `findFirst` on a non-unique name or email.
- **Impact:**
  - Admins tune prompt templates against statistics without the derived metrics and percentile, so previews and cost estimates differ from production.
  - Every new Rewind stat must be added in two places, which is a direct tax on the 2026 redesign.
- **Recommendation:**
  - Extract a server-only `buildWrappedStatistics({ userId, year })` in `lib/wrapped/` that returns a Result.
  - Use it from the generation job (BP-22), the playground and tests.
  - Add a test asserting that both callers produce identical statistics for the same fixture.
  - Resolve playground users by id.
- **Effort:** S

#### BP-26 Rewind data is stored as an untyped JSON string with a free-text status and no validation on read; redundant indexes; import N+1

- **Severity:** medium
- **Status:** adjusted. There are no status typos today, the blob is written after Zod validation, and the import N+1 is negligible. The real risk is v1/v2/v3 shape drift.
- **Source:** FA-17
- **Where:** `prisma/schema.prisma:176`, `:178`, `:42-43`, `:189-193`, `:321`, `:338`, `:353`, `:413`, `types/wrapped.ts:221-222`, `app/api/wrapped/poster/[ratingKey]/route.ts:36`, `app/(app)/wrapped/page.tsx:27`, `app/api/wrapped/og-image/route.tsx:74`, `app/api/wrapped/share/[token]/route.ts:74`, `actions/admin/admin-llm-history.ts:36`, `:74`, `:190`, `components/wrapped/wrapped-viewer.tsx:23`, `components/admin/prompts/prompt-template-editor.tsx:249`, `actions/import-plex-users.ts:59-83`
- **Evidence:**
  ```prisma
  data        String              // JSON string containing wrapped data
  status      String @default("pending") // "pending", "generating", "completed", "failed"
  ```
  - `version?: number // undefined = v1 (pre-2026 revamp)`.
  - 11 sites run `JSON.parse(wrapped.data)`, often cast `as WrappedData`, with no schema. One of them is a try/catch IIFE inside JSX.
  - Zod is applied only to the raw LLM output (`parse-llm-output.ts:47`).
  - 8 indexes duplicate a `@unique` or a composite-unique prefix:
    - User `plexUserId` and `jellyfinUserId`
    - PlexWrapped `userId` and `shareToken`
    - DiscordConnection `discordUserId`
    - DiscordChatSession `discordUserId`
    - DiscordOAuthState `state`
    - Invite `code`
  - The import does `for (const plexUser of plexUsers) { await prisma.user.findUnique(...); await prisma.user.create(...) }`.
- **Impact:**
  - Shape mismatches between Rewind versions fail at render time, handled by ad-hoc try/catch blocks. A 2026 v3 format makes this worse.
  - Prisma cannot filter inside the data, which rules out cross-user Rewind queries. Raw SQL could cast to jsonb, but CLAUDE.md forbids raw SQL.
  - Redundant indexes add write cost for no read benefit.
- **Recommendation:**
  - Migrate `PlexWrapped.data` to `Json` (jsonb) with `ALTER COLUMN data TYPE jsonb USING data::jsonb`, and add an explicit `schemaVersion`. Update all writers and the 11 readers in the same change.
  - Make `status` a `WrappedStatus` enum, adding `queued` for BP-22.
  - Route every read through one Zod-validated `parseStoredWrapped(row)` with v1→v2→v3 upgraders.
  - Drop the 8 redundant indexes.
  - For the import, pre-fetch existing users with one `findMany` on `plexUserId in [...]`. Keep per-user creates so email collisions are still reported; `createMany({ skipDuplicates: true })` would skip them silently.
- **Effort:** M

### 5. Architecture, data access and performance

#### BP-27 Admin auth error screens match on `error.name` / `error.message`, which production builds strip

- **Severity:** medium
- **Status:** adjusted. The mechanism is accurate, but access is still denied, so the impact is UX rather than a correctness failure for most users.
- **Source:** FA-01
- **Where:** `lib/admin.ts:30-42`, `app/admin/layout.tsx:12`, `app/error.tsx:14-31`, `app/admin/error.tsx:21-37`, `components/ui/error-state.tsx:47`, `playwright.config.ts:60`, `actions/invite.ts:455`, `actions/user-queries.ts:256`
- **Evidence:**
  ```ts
  // lib/admin.ts:30-42
  if (!session) { throw new UnauthenticatedError("UNAUTHENTICATED") }
  if (!session.user.isAdmin) { throw new UnauthorizedAdminError("UNAUTHORIZED") }
  // app/error.tsx:15-18
  const isUnauthenticated = error.name === "UnauthenticatedError" ||
    error.message === "UNAUTHENTICATED" || error.message.includes("Authentication required")
  ```
  - React's production Flight client turns Server Component errors into a plain `Error`. Its message is "An error occurred in the Server Components render. The specific message is omitted in production builds..." (`react-server-dom-webpack-client.browser.production.js:1578-1580`). Neither branch matches.
  - The throw happens in `app/admin/layout.tsx`. A segment's `error.tsx` does not wrap its own layout, so `app/error.tsx` catches it and renders `ErrorState` with that generic text.
  - `proxy.ts` has no auth gate.
  - Playwright uses `npx next dev`, which keeps the original messages, so `e2e/admin-protection.spec.ts` passes.
- **Impact:**
  - In production, unauthenticated and non-admin visitors to `/admin/*` never see the dedicated screens (`data-testid unauthorized-error-page`). They get the generic "Something went wrong" page with React's "omitted in production builds" sentence, and a "Try again" button that throws again.
  - Admin server actions that call `requireAdmin()` before their `try`, such as `getInvites` and `unshareUserLibrary`, surface the same text in toasts when the session expires.
- **Recommendation:**
  - In `app/admin/layout.tsx`, check `getServerSession` without throwing, and render `<UnauthenticatedError/>` or `<UnauthorizedError/>` directly, or `redirect()`. `unauthorized()` and `forbidden()` still need `experimental.authInterrupts` in Next 16.1.1.
  - Make admin actions return `{ success: false, error: 'Unauthorized' }` instead of throwing.
  - Add a production-mode Playwright project (BP-10).
- **Effort:** M

#### BP-28 LLM usage totals load every LLMUsage row, including full prompt and response text, on the admin landing, LLM-usage and cost-analysis pages

- **Severity:** medium
- **Status:** adjusted. Both auditors found it. It rises toward high on deployments that use the chatbot heavily.
- **Source:** FA-03, OPS-14
- **Where:** `actions/user-queries.ts:102`, `:211-215`, `:229-230`, `:330-356`, `lib/utils.ts:139-167`, `lib/wrapped/usage.ts:60-74`, `app/admin/page.tsx:6`, `app/admin/llm-usage/page.tsx:18-20`, `app/admin/cost-analysis/page.tsx:22`, `prisma/schema.prisma:236-237`, `actions/chatbot/conversation.ts:86-92`
- **Evidence:**
  ```ts
  // actions/user-queries.ts:339-349 (fetchUsersWithWrappedData)
  include: {
    plexWrapped: { where: { year: year }, take: 1, include: { llmUsage: true } },
    llmUsage: true, // Include ALL LLM usage records for this user
  ```
  - LLMUsage stores `prompt String` and `response String`.
  - The rows feed only `aggregateLlmUsage`, which sums `totalTokens`, `promptTokens`, `completionTokens` and `cost` and returns the last record's provider and model. With no `orderBy`, that record is effectively arbitrary.
  - The `plexWrapped` include also pulls the full `data` JSON for every user.
  - `getUserDetails` uses `llmUsage: true` as well.
  - `lib/wrapped/usage.ts` runs `findMany` over the whole table, all time on the LLM-usage page, and reduces in JS.
  - `/admin` redirects to `/admin/users`, which runs this query.
  - The chatbot writes `JSON.stringify(currentMessages)`, the whole conversation, on every tool-loop iteration.
- **Impact:**
  - Each admin page load pulls every stored prompt and response from Postgres into Node memory to sum four integers. Wrapped-linked rows are loaded twice.
  - Growth is unbounded and driven mostly by the chatbot. A richer, multi-pass 2026 Rewind adds more.
- **Recommendation:**
  - Use `prisma.lLMUsage.groupBy({ by: ['userId'], _sum: { totalTokens, promptTokens, completionTokens, cost }, _count: true })` for lifetime totals, and a second groupBy filtered by current-year `wrappedId`s.
  - Fetch the latest provider and model with `findMany({ distinct: ['userId'], orderBy: { createdAt: 'desc' }, select: { userId, provider, model } })`, or drop them.
  - Select only `status` and `generatedAt` from `plexWrapped`.
  - In `lib/wrapped/usage.ts`, group by provider, model and user, and use date-bucketed aggregates.
  - Where rows are needed, `select` the numeric columns only.
  - Paginate the users list.
- **Effort:** S

#### BP-29 Client components load data with `useEffect` plus server actions or fetch, instead of server props or TanStack Query

- **Severity:** medium
- **Status:** confirmed. Minor correction: `getDevDefaults` is called in 9 files, not 10.
- **Source:** FA-08
- **Where:** `app/admin/invites/page.tsx:5`, `components/admin/invites/invites-page-client.tsx:62-77`, `components/dashboard/wrapped-card.tsx:66-97`, `components/setup/setup-wizard/tautulli-form.tsx:34-36`, `components/admin/settings/LLMProviderForm.tsx:45-78`, `:207`, `lib/security/rate-limit.ts:139-142`, `lib/providers.tsx:8-19`, `components/admin/users/user-activity-timeline.tsx:207`
- **Evidence:**
  - 50 client files use `useEffect`. 28 of them call server actions inside effects, and 6 call `fetch()`.
  - Only `user-activity-timeline.tsx` uses `useQuery`, although `lib/providers.tsx` configures a QueryClient.
  - `app/admin/invites/page.tsx` renders an empty `<InvitesPageClient />`, which then runs `useEffect(() => { loadInvites() }, [])` plus a `getJellyfinLibraries()` probe.
  - `wrapped-card.tsx` calls `getWrappedSettings().then(...)` and only then `getUserPlexWrapped`, a waterfall.
  - 9 files call `getDevDefaults()`, each in its own mount effect.
  - `LLMProviderForm.tsx` fetches `/api/admin/models` in an effect that depends on `formData.model`, and the custom-model input sets `model` on every keystroke.
- **Impact:**
  - Pages render empty shells, then load data in waterfalls, with no caching, deduplication or retry.
  - Read actions serialize behind any pending action.
  - Typing about 50 characters into the custom model field exhausts the shared admin limit (`max: 50` per 15 minutes). That locks the admin out of all admin API routes for 15 minutes.
- **Recommendation:**
  - Fetch in Server Components and pass the data as props: invites, libraries, wrapped settings and status, and dev defaults (load these once in `app/setup/page.tsx`).
  - Where client refetching is needed, use feature-scoped TanStack hooks (`useInvites`, `useWrappedStatus`) seeded with `initialData`.
  - Fetch models once per edit session.
  - Enable the react-hooks lint rules (BP-09) to prevent regressions.
- **Effort:** L

#### BP-30 Files well over the CLAUDE.md size limits mix several responsibilities

- **Severity:** medium
- **Status:** confirmed
- **Source:** FA-15
- **Where:** `components/admin/prompts/prompt-template-editor.tsx`, `components/admin/invites/invites-page-client.tsx`, `actions/invite.ts`, `actions/user-queries.ts`, `lib/queue/jobs/stripe.ts`, `lib/utils/logger.ts` (full lists under Metrics)
- **Evidence:**
  - 19 components exceed 300 lines; the largest is `prompt-template-editor.tsx` at 853.
  - 10 action files exceed 300 lines; the largest is `actions/invite.ts` at 937.
  - 56 of 131-132 lib/hooks modules exceed 150 lines; the largest is `lib/queue/jobs/stripe.ts` at 672.
  - `invites-page-client.tsx` (644 lines) holds the list, the create modal, the library pickers and three loaders.
- **Impact:** Mixing list, form, modal, loading and business logic is what drives the `useEffect`-fetch pattern (BP-29), and it makes isolated testing hard. CLAUDE.md explicitly asks for these files to be split.
- **Recommendation:**
  - Split files as they are touched:
    - invites → `InviteList`, `CreateInviteModal` and server-provided libraries
    - prompt editor → editor, preview and variable panels
    - `actions/invite.ts` → `invite-admin.ts` (CRUD) and `invite-redeem.ts`, with helpers in `lib/invites/`
  - Add ESLint `max-lines` as a warning (300 for components).
  - Cohesive modules such as the logger and the Stripe jobs can stay large deliberately.
- **Effort:** L

#### BP-31 Next 16 caching and rendering features are unused: blanket force-dynamic, no per-request memoization, redundant refreshes

- **Severity:** low
- **Status:** adjusted. "Every navigation recomputes everything" is wrong because of partial rendering. The proposed parallel guards were rejected. This is modernization debt.
- **Source:** FA-12
- **Where:** `next.config.js:2`, `app/(app)/layout.tsx:13`, `:47-50`, `app/(app)/page.tsx:27`, `app/admin/layout.tsx:12-14`, `app/admin/llm-usage/page.tsx:18-20`, `actions/prometheus-status.ts:174`, `components/admin/settings/LLMProviderForm.tsx:112`, `actions/admin/admin-llm-providers.ts:107`, `lib/auth.ts:483-488`
- **Evidence:**
  - Zero uses of `'use cache'`, cacheTag/cacheLife, revalidateTag/updateTag, `after()`, `connection()` or React `cache()`.
  - One deprecated `unstable_cache`.
  - force-dynamic in 40 page/route files plus the `(app)` layout.
  - 46 `getServerSession(authOptions)` call sites and 69 inline `findFirst({ where: { isActive: true } })` lookups, none memoized.
  - The `(app)` layout awaits `ensureSetupComplete`, `ensureOnboardingComplete`, `ensureSubscriptionOrAccess` and `getBannerFlags` in turn, and the home page adds a 4th session call. Once `checkedAt` is more than 5 minutes old, the jwt callback re-queries the DB, and an RSC cannot persist the refreshed cookie.
  - The admin layout calls `getAdminSettings()` (12 parallel queries plus decrypts) only to compute `hasChatLLM`.
  - 22 client files call `router.refresh()` after actions that already `revalidatePath`.
- **Impact:**
  - There is redundant session and config work on hard loads and segment entry.
  - Mutations cost two round trips.
  - Blanket force-dynamic blocks a later Cache Components adoption.
- **Recommendation:**
  - **Now (S/M):**
    - Add `lib/data/session.ts` and `lib/data/config.ts` wrapped in React `cache()`.
    - Keep the guards sequential, because redirect order matters, but have them share the cached session.
    - Compute `hasChatLLM` with a cheap exists query.
    - Run the llm-usage page's queries with `Promise.all`.
    - Drop the redundant `router.refresh()` calls.
  - **Later (L), after the upgrade in BP-01:**
    - Remove force-dynamic.
    - Evaluate `cacheComponents` with `'use cache'` and `cacheTag`/`updateTag`. GHSA-mg66-mrh9-m8jx is a Cache Components DoS below 16.2.5.
    - Replace `unstable_cache`.
    - Wrap slow sections in Suspense.
- **Effort:** L

#### BP-32 `'use client'` is overused and the React 19 form APIs are not adopted

- **Severity:** low
- **Status:** adjusted. The 93% ratio is not evidence of misuse by itself: only 7 small leaves are clearly unnecessary. forwardRef appears in 8 files, not 9.
- **Source:** FA-13
- **Where:** `components/admin/discord/discord-activity-table.tsx:1`, `discord-bot-status.tsx:1`, `discord-active-users.tsx:1`, `components/admin/queues/queue-status.tsx:1`, `queue-stats.tsx:1`, `scheduler-info.tsx:1`, `components/subscription/subscription-banners.tsx:1`, `actions/discord-activity.ts:62-68`, `app/invite/[code]/page.tsx:25-48`, `app/invite/layout.tsx`, `components/ui/button.tsx:1`
- **Evidence:**
  - 197 files are `'use client'`, including 186 of the 201 component `.tsx` files.
  - The 7 listed leaves have no hooks, handlers or motion, and only Server Component pages render them.
  - Dates are hand-serialized across the boundary (`startedAt: log.startedAt.toISOString()`).
  - `app/invite/[code]/page.tsx` is a client page that calls `validateInvite` and `getServerName` in `useEffect`.
  - Zero uses of `useActionState`, `useOptimistic`, `useFormStatus` or `<form action=`. Instead there are 21 `onSubmit` + `preventDefault` handlers and 42 hand-rolled loading booleans.
- **Impact:**
  - There is some avoidable bundle and serialization cost.
  - The externally shared invite page renders a spinner first.
  - Hand-rolled form state duplicates React 19 primitives.
- **Recommendation:**
  - Remove `'use client'` from the 7 leaves.
  - Convert the invite page to an async Server Component with `generateMetadata`. `app/invite/layout.tsx` could already export metadata today.
  - Adopt `<form action>` with `useActionState`/`useFormStatus` as forms are refreshed. A dedicated migration is not needed.
- **Effort:** M

#### BP-33 Live internal admin reads go through API routes, against CLAUDE.md

- **Severity:** low
- **Status:** adjusted. This is cleanup debt; every route is admin-gated and rate-limited. The 4 dead routes are counted in BP-36.
- **Source:** FA-06
- **Where:** `app/api/admin/models/route.ts:25`, `app/api/admin/plex/users/route.ts:10`, `app/api/admin/playground/statistics/route.ts:17`, `app/api/admin/wrapped/[wrappedId]/versions/route.ts:25`, `components/admin/playground/wrapped-playground.tsx:76`, `:98`, `:129`, `components/admin/settings/LLMProviderForm.tsx:50`, `components/admin/wrapped/historical-wrapped-selector-header.tsx:35`
- **Evidence:**
  - `models/route.ts` returns `Object.keys(MODEL_PRICING).sort()`, although `wrapped-playground.tsx` already imports `estimateCost` from `@/lib/llm/pricing`.
  - `versions/route.ts` only wraps the server action `getHistoricalWrappedVersions(wrappedId)`.
  - The sonarr and radarr routes claim to exist for "HTTP caching and conditional requests", yet they set force-dynamic and send no Cache-Control or ETag.
  - Each route repeats about 40 lines of rate-limit, `requireAdminAPI` and error boilerplate.
- **Impact:**
  - Duplicated boilerplate.
  - Client `useEffect` fetches sit behind the shared admin limiter (see BP-23 and BP-29).
- **Recommendation:**
  - Pass models, configured model, Plex users and versions as props from the server pages.
  - Fold playground statistics into the shared builder (BP-25).
- **Effort:** S

#### BP-34 Client bundles: framer-motion imported in full in 57 files, chart.js imported statically in 14, no bundle budget

- **Severity:** low
- **Status:** adjusted. Unmeasured, and chart.js is genuinely needed by 5 Rewind sections. Fold this into the Rewind rebuild.
- **Source:** OPS-18
- **Where:** `components/wrapped/wrapped-charts.tsx:3`, `:17`, `components/admin/discord/discord-trend-chart.tsx:15`, `jest.setup.js:13-14`, `next.config.js:5`
- **Evidence:**
  - 57 non-test files run `import { motion } from "framer-motion"`, and none uses `LazyMotion` or `m`.
  - 14 files import chart.js, and each calls `ChartJS.register(...)` separately.
  - `wrapped-charts` is pulled into 5 Rewind sections: fun-facts, movies-breakdown, overseerr-stats, total-watch-time and server-stats.
  - There are only 2 `next/dynamic` usages, in chat-window and announcements-card.
  - There is no `@next/bundle-analyzer` and no size budget.
  - `jest.setup.js` mocks framer-motion globally, so animation code paths are never exercised.
- **Impact:**
  - The Rewind viewer ships the full motion runtime plus chart.js, even for slides with no chart. That hurts first load on phones.
  - The canvas charts also cannot render inside `next/og` share images.
- **Recommendation:**
  - Measure with the bundle analyzer first.
  - Use `LazyMotion features={domAnimation}` with `m.*` in the viewer (roughly 20-30 KB gzipped saved).
  - Centralise chart registration.
  - Load chart-bearing slides with `next/dynamic`, or render server-side SVG charts that also work in `next/og`.
  - Add a size budget once a baseline exists.
  - Replace the global motion mock where animation logic matters.
- **Effort:** M

#### BP-35 No `not-found.tsx` or `global-error.tsx`; invalid share links get the unbranded default 404

- **Severity:** low
- **Status:** adjusted. The impact is cosmetic: the default 404 renders inside the root layout, and `app/error.tsx` is already branded.
- **Source:** FA-14
- **Where:** `app/(app)/wrapped/share/[token]/page.tsx:99`, `:105`, `app/admin/users/[userId]/page.tsx:21`, `app/admin/prompts/[promptId]/page.tsx:17`, `app/admin/llm-usage/[usageId]/page.tsx:14`, `app/layout.tsx:30`, `app/subscribe/page.tsx:1`
- **Evidence:**
  - `find app -name not-found.tsx -o -name global-error.tsx -o -name forbidden.tsx -o -name unauthorized.tsx` returns nothing.
  - `notFound()` is called at 6 sites.
  - These segments fall back to the root boundaries: `app/(app)` (home), `app/(app)/discord/link`, `app/auth/denied`, `app/subscribe` and `app/subscribe/success`.
- **Impact:**
  - An expired or invalid Rewind share link, the page outsiders see most, shows an unbranded 404 with no way back.
  - Errors in the root layout or Providers show the bare framework error page.
- **Recommendation:**
  - Add a branded `app/not-found.tsx`, plus a share-specific one ("This Rewind link isn't available") with a home link.
  - Add `app/global-error.tsx`, which must render its own `<html><body>`.
- **Effort:** S

### 6. Maintenance and hygiene

#### BP-36 16 unused component files (2,058 lines), a dead polling hook and 4 dead API routes

- **Severity:** low
- **Status:** confirmed
- **Source:** FA-16, FA-06 (dead routes)
- **Where:**
  - `components/admin/wrapped/historical-wrapped-selector.tsx`
  - `components/admin/wrapped/historical-versions-inline.tsx`
  - `components/generator/wrapped-generator.tsx`
  - `hooks/use-wrapped-polling.ts`
  - `components/wrapped/user-wrapped-viewer.tsx`
  - `components/wrapped/wrapped-home-button.tsx`
  - `components/admin/users/user-management.tsx`
  - `app/api/admin/sonarr/route.ts:7`
  - `app/api/admin/radarr/route.ts:7`
  - `app/api/admin/wrapped/by-user/[userId]/route.ts:7`
  - `app/api/admin/wrapped/[wrappedId]/user/route.ts:9`
- **Evidence:**
  - None of these is imported outside `__tests__`. The full list with line counts is under Metrics.
  - `hooks/use-wrapped-polling.ts` (53 lines) is used only by the dead `wrapped-generator.tsx`.
  - `wrapped/by-user` and `wrapped/[id]/user` are fetched only by the dead `historical-versions-inline.tsx`.
  - sonarr and radarr have no callers anywhere, e2e included.
  - The only hit for sign-out-button is a `data-testid` string.
- **Impact:**
  - Parallel dead implementations (two history selectors, three polling loops, two viewers) make it unclear which one is canonical for the Rewind refresh.
  - They keep tests alive for code that never ships and inflate lint debt: `user-wrapped-viewer` has 3 `any`, and `wrapped-generator` has `useState<any>`.
- **Recommendation:**
  - Delete the files, their tests and the four routes.
  - Add `npx knip` (or ts-prune) to CI.
- **Effort:** S

#### BP-37 The logger is 663 lines and about half unused; the Discord bot runs a second, unsanitized winston logger; 53 console.* calls bypass both

- **Severity:** low
- **Status:** confirmed
- **Source:** OPS-20, FA-11 (console part)
- **Where:** `lib/utils/logger.ts:61-66`, `:237-375`, `:377`, `:445`, `:606-662`, `lib/discord/bot.ts:47-75`, `lib/wrapped/server-statistics.ts:80`, `:82`, `:129`, `:133`, `lib/llm/pricing.ts:99`, `:118`
- **Evidence:**
  - Exports with no production callers: `getBaseLogger`, `sanitizeForLogging`, `.child()`, `.time()` and `.timeSync()`.
  - The request-context helpers are used only in `proxy.ts`, where they are ineffective (BP-17).
  - About 140 lines are a dev pretty-printer built on `let chalk: any = null` / `chalk = require("chalk")`. chalk is undeclared and absent from production installs, but the require sits in a try/catch with a JSON fallback.
  - The logger has a `// @ts-ignore` at line 377, and the client and server branches duplicate the context-merge logic four times.
  - `bot.ts` builds its own `winston.createLogger` with no `sanitizeValue`.
  - 53 `console.*` calls (45 client, 8 server) bypass structured logging, e.g. ``console.warn(`[STATISTICS] Failed to fetch items...`)``. Client calls fall back to console anyway, so only the server-side ones lose redaction.
- **Impact:**
  - The module suggests features, such as request tracing, that do not work.
  - Discord metadata and server console output skip redaction and structured JSON.
- **Recommendation:**
  - Shrink `logger.ts` to a thin pino (or winston) wrapper of about 150 lines: JSON in production, pino-pretty as a devDependency, a list of redact paths, and the ALS request id wired as in BP-17.
  - Have `DiscordBot` take a `createLogger('discord-bot')` instance.
  - Add `no-console` (BP-09) and migrate the server-side calls.
- **Effort:** S

#### BP-38 Non-security dependency drift: motion is two majors behind, TypeScript 7 and ESLint 10 are available, plus an unused and an undeclared dependency

- **Severity:** low. The refutation pass split this out of BP-01 and rated it low/info maintainability.
- **Status:** verified
- **Source:** FA-18 (non-security part)
- **Where:** `package.json:33`, `:43`, `:75`, `:83`, `lib/auth.ts:20`, `lib/utils/logger.ts:64-69`
- **Evidence:**
  - Installed vs latest:
    - framer-motion 12.42.2 vs 14.3.0. framer-motion is published in lockstep with motion, so renaming to `motion/react` is optional. 57 files import it.
    - typescript 5.9.3 vs 7.0.2.
    - eslint 9.39.2 vs 10.13.0.
    - chart.js 4.5.1 is current, but canvas-only.
  - `@next-auth/prisma-adapter` is declared, yet `lib/auth.ts:20` says "PrismaAdapter is not compatible with CredentialsProvider".
  - chalk is required by the logger but undeclared. `npm ls chalk --omit=dev` is empty.
  - next-auth v5 is still `5.0.0-beta.32`.
- **Impact:**
  - Two majors of motion drift make the UI refresh harder.
  - The unused adapter is noise.
  - Losing chalk is harmless, thanks to the fallback.
  - The 46 manual session calls are not caused by NextAuth v4. v5's `auth()` cannot set cookies from an RSC either, and a cached `getSession()` facade fixes them today.
- **Recommendation:**
  - As part of the UI refresh, move to motion 14 (or `motion/react`).
  - Trial TypeScript 7 in CI.
  - Remove `@next-auth/prisma-adapter`.
  - Declare chalk or drop it (BP-37).
  - Put auth behind one cached `getSession()` before considering an auth-library change.
  - Prefer SVG charts that render in Server Components and `next/og` (BP-34).
- **Effort:** M

#### BP-39 Performance tooling and CLAUDE.md references point at deleted modules

- **Severity:** low. The verifier raised it from info, because it sends contributors and coding agents to files that don't exist.
- **Status:** adjusted
- **Source:** OPS-22
- **Where:** `docs/performance-testing.md:5-25`, `CLAUDE.md:335`, `CLAUDE.md:343`, `CLAUDE.md:354`, CLAUDE.md "Additional Resources"
- **Evidence:**
  - `docs/performance-testing.md` documents `npx tsx scripts/performance/profile-maintenance-query.ts --seed`. `scripts/` holds only `register-discord-commands.ts` and `register-discord-metadata.ts`, and the maintenance tables were dropped in `20251206172926_remove_maintenance_tables`.
  - CLAUDE.md cites `lib/maintenance/rule-evaluator.ts` and `lib/maintenance/__tests__/jsdoc-examples.test.ts` as reference implementations. `lib/maintenance/` does not exist.
- **Impact:** No working performance tooling exists, and agents following CLAUDE.md look for missing modules.
- **Recommendation:**
  - Delete `docs/performance-testing.md` and its link, or rewrite it around current hotspots (BP-24, BP-28).
  - Repoint the CLAUDE.md JSDoc references at `lib/wrapped/archetype-scoring.ts` or `lib/discord/lock/poller.ts`.
  - Either add a matching JSDoc-example test, or drop the claim that examples are test-verified.
- **Effort:** S

## Strengths to preserve

- **The type check is clean.** `npx tsc --noEmit -p tsconfig.json` exits 0 with `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` and `noFallthroughCasesInSwitch` enabled (`tsconfig.json:9-14`).
- **Lint is clean.** ESLint reports 0 errors and 46 warnings across 482 files. App code has no `eslint-disable` comments and no `@ts-expect-error`.
- **The Next 16 migration basics are done.**
  - params/searchParams are awaited as Promises, e.g. `app/admin/users/[userId]/page.tsx:13-14`.
  - Middleware is renamed to `proxy.ts`.
  - Turbopack is the default.
  - `serverExternalPackages` covers discord.js.
  - Output is standalone.
- **The Prisma setup is sound.**
  - The client is a `globalThis` singleton with `@prisma/adapter-pg`, and one query extension handles at-rest encryption (`lib/prisma.ts:23-115`).
  - There are 32 `$transaction` call sites. The only multi-model write without one is `lib/discord/services.ts:244`.
  - There is no raw SQL.
- **N+1 is already avoided where it matters.** The admin users list batch-loads subscriptions (`actions/user-queries.ts:203-204`, `fetchSubscriptionMap`).
- **Good patterns to copy:**
  - Stripe actions return discriminated unions (`actions/subscription.ts:24-26`, `actions/admin/subscriptions.ts:19`).
  - Queue admin actions validate `input: unknown` with Zod (`actions/admin/queue.ts:237-410`).
  - `getAdminSettings` strips secrets into `has*` booleans before anything reaches the client (`actions/admin/admin-settings.ts:37-101`).
- **Most top-level segments have boundaries.** root, admin, setup, onboarding, `invite/[code]`, `auth/callback/plex` and `(app)/wrapped` each have `error.tsx` and `loading.tsx`.
- **The logger redacts.** It works on server and client and redacts sensitive keys and URL params in production (`lib/utils/logger.ts:103-192`).
- **The unit suite is large and fast.** 3,533 tests in 218 suites run in about 42s. Coverage is high in:
  - lib/security (89%)
  - lib/stripe (92%)
  - lib/wrapped (83%)
  - lib/discord/audit/metrics (99%)
  - lib/discord/routing (93%)
  - components/generator (93%)
- **CI covers the main stages.**
  - Lint runs on every PR.
  - A production build runs after `prisma migrate deploy` against a real Postgres 16.
  - Unit tests upload a coverage artifact.
  - Playwright E2E runs on every PR.
  - npm and buildx caching are enabled.
- **The Dockerfile is multi-stage** (deps, builder, runner), uses standalone output and runs as non-root uid 1001.
- **The queue has sane defaults.**
  - BullMQ jobs default to 3 attempts with exponential backoff and bounded `removeOnComplete`/`removeOnFail`.
  - The Stripe webhook verifies the signature on the raw body and dedupes with `jobId = event.id`.
  - `sanitizeJobId` handles BullMQ's colon restriction.
- **The Discord bot's DB lease is well built.** It is a single-holder lease with an overlapping-tick guard and a config-version bounce for token rotation. It is injectable and unit-tested; only its default interval is wrong (BP-12).
- **LLM output is schema-enforced.** It uses `json_schema` strict where supported, is always Zod-validated, and has truncation detection and a configurable timeout.
- **Migrations that remove columns backfill first**, e.g. multi-service auth and `url` replacing host/port/protocol.
- **E2E has a good base.** It has authenticated-session fixtures, axe accessibility checks and mostly `data-testid` selectors (98 `getByTestId` vs 25 `getByText`).
- **Dependabot is configured** for npm, docker and github-actions.

## Metrics and inventories

### Baseline quality

| Check | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 0 errors |
| ESLint, repo config | 0 errors, 46 warnings across 482 files (42 `no-explicit-any`, 4 `ban-ts-comment`). Top files: `lib/wrapped/overseerr-statistics.ts` 7, `lib/utils/media-matching.ts` 6, `actions/chatbot/executors/sonarr.ts` 4, `actions/chatbot/executors/tautulli.ts` 4 |
| ESLint + `eslint-config-next/core-web-vitals` (scratch) | 18 errors, 10 warnings: 10 `react-hooks/purity`, 6 `set-state-in-effect`, 2 `static-components`, 6 `exhaustive-deps`, 4 `@next/next/no-img-element` (all in dead `service-icons.tsx`) |
| Type escapes | 42 `any`, 7 `as unknown as`, 4 `@ts-ignore`, 0 `@ts-expect-error`, 0 `eslint-disable`, 1 `as never` |
| `console.*` outside the logger | 53 (45 client components, 8 server-side) |
| Test typecheck | `tsconfig.test.json` checks 0 test files (lists 4 `.d.ts`). A real check gives 601 errors in 84 files: TS2339 217, TS6133 81, TS2345 67, TS2540 65, TS2353 62 |
| Jest (`--coverage --silent --maxWorkers=2`, no `DATABASE_URL`) | 218 suites (213 pass, 5 fail), 3,533 tests (3,532 pass), 41.5s. The 5 failures (wrapped-api-calls, security/admin-pages, config-encryption, admin, queue/job-registry) pass 55/55 with a dummy URL |
| Coverage (all files) | Stmts 53.41%, Branch 45.10%, Funcs 51.11%, Lines 53.66%. `app/**` and `hooks/**` excluded; no `coverageThreshold` |
| `npm audit` (full tree) | 75: 2 critical, 56 high, 15 moderate, 2 low |
| `npm audit --omit=dev` | 30: 2 critical, 17 high, 11 moderate; all fixable. next has 37 advisories (vulnerable up to 16.3.7) |

### Coverage by directory (statements)

| Directory | Stmts % | Notes |
|---|---|---|
| actions | 62.4 | |
| actions/admin | 40.2 | admin-servers 18, admin-users 28, queue 0, watchlist 0 |
| actions/chatbot/executors | 38.2 | |
| lib | 36.7 | auth.ts 26, plex-auth.ts 0, jellyfin-auth.ts 13, prisma.ts 16 |
| lib/queue | 1.8 | worker, client, connection all 0 |
| lib/queue/jobs | 79.1 | |
| lib/instrumentation | 0 | |
| lib/watchlist | 0 | |
| lib/llm | 21.7 | |
| lib/connections | 49.0 | tautulli 0, overseerr 0, sonarr 2, radarr 2 |
| lib/utils | 51.5 | |
| lib/security | 89.1 | |
| lib/stripe | 92.3 | |
| lib/wrapped | 82.9 | api-calls.ts shows 0 only because its suite needs `DATABASE_URL` |
| lib/discord | 56.0 (top level) | subdirectories 78-100 |
| components/admin/settings | 18.8 | |
| components/admin/discord, queues, llm-usage, announcements | 0 | |
| components/dashboard | 0 | |
| components/watchlist | 0 | |
| components/setup/setup-wizard | 0.95 | |
| components/auth | 23.4 | |
| components/wrapped | 76.3 | wrapped-sections/cinematic 57.4 |
| components/generator | 93.1 | |
| components/ui | 77.4 | |

### Framework and React adoption

| Item | Count |
|---|---|
| `'use client'` files | 197. That is 186 of 201 component `.tsx` files (93%), and 196-197 of 258-259 non-test `.tsx` files (about 76%). 7 presentational leaves need no client boundary |
| Client files using `useEffect` | 50. 28 call server actions in effects, 6 call `fetch()` |
| TanStack `useQuery` users | 1 file (`user-activity-timeline.tsx`) |
| React 19 APIs | 0 `useActionState`, 0 `useOptimistic`, 0 `useFormStatus`, 0 `use()`, 0 `<form action>`. 47 `useTransition`, 42 hand-rolled loading booleans, 21 `onSubmit` handlers, 8-9 `forwardRef` (8 files in components/ui) |
| Caching | 66 `revalidatePath`; 0 `revalidateTag`/`updateTag`, 0 `'use cache'`, 1 `unstable_cache`, 0 `after()`, 0 `connection()`, 0 React `cache()` |
| force-dynamic | 41 of 47 page/route files by the auditor's count (verifier: 40 page/route files plus the `(app)` layout) |
| Per-request repetition | 46 `getServerSession` call sites, 69 inline `findFirst({ isActive: true })` lookups, 22 client files calling `router.refresh()` (25 calls) |
| next.config.js | no `cacheComponents`, `typedRoutes` or `reactCompiler` |
| Rendering assets | `next/image` in 7 files, mostly `unoptimized` (only `user-table-row.tsx:75` is optimized); 4 raw `<img>`, all in an unused file; 0 `next/font`; 2 `next/dynamic`; Suspense in 3 pages, only around `useSearchParams` filters |
| Motion and charts | 57 files import framer-motion with 0 LazyMotion; 14 files import chart.js, each calling `ChartJS.register` |
| Raw `fetch()` without AbortSignal | about 50 (auditor) to 62 (verifier). tautulli.ts 13, overseerr 9, discord/api 7; only about 14 modules use `fetchWithTimeout` |

### Server actions, routes and boundaries

| Item | Count |
|---|---|
| Exported functions in `'use server'` files | 129. 91 take parameters, and 44 of those have no Zod schema |
| Sites returning raw `error.message` | 27 (auditor). The verifier counted 45 occurrences under `actions/`, some in logging |
| Route handlers | 14-15. 8 are internal admin reads under `app/api/admin`, 4 of those dead (sonarr, radarr, wrapped/by-user, wrapped/[id]/user) |
| Pages | 32, only 2 export metadata |
| Boundaries | 7 `error.tsx`, 7 `loading.tsx`, 0 `not-found.tsx`, 0 `global-error.tsx`; `notFound()` at 6 sites |
| `getDevDefaults()` callers | 9 files (8 setup forms plus `setup-wizard.tsx`) |
| `actions/chatbot` | 24 non-test `.ts` files, 23 of them non-action modules |

### File sizes over CLAUDE.md limits

| Group | Files |
|---|---|
| Components over 300 lines (19) | prompt-template-editor.tsx 853, invites-page-client.tsx 644, wrapped-charts.tsx 464, app/admin/settings/page.tsx 448, test-configuration.tsx 430, app/admin/users/[userId]/page.tsx 419, llm-provider-form.tsx (setup) 405, wrapped-playground.tsx 394, wrapped-card.tsx 386, sync-settings-card.tsx 374, app/admin/discord/page.tsx 358, app/admin/llm-usage/page.tsx 353, admin-nav.tsx 346, DiscordIntegrationForm.tsx 339, discord-marked-media.tsx 327, admin-footer-client.tsx 324, wrapped-transition.tsx 320, invite-details-client.tsx 308, LLMProviderForm.tsx 305 |
| Action files over 300 lines (10) | invite.ts 937, user-queries.ts 712, admin-servers.ts 684, admin/queue.ts 653, setup.ts 584, discord-activity.ts 527, admin-config.ts 519, wrapped-generation.ts 471, auth.ts 349, announcements.ts 318 |
| lib/hooks modules over 150 lines | 56 of 131-132. Largest: lib/queue/jobs/stripe.ts 672, lib/utils/logger.ts 663, lib/auth.ts 513, lib/discord/integration.ts 443, lib/wrapped/tautulli-user-statistics.ts 411 |

### Prisma and migrations

| Item | Value |
|---|---|
| `$transaction` sites | 32; raw SQL 0 |
| Direct await-in-loop N+1 | 1 (`actions/import-plex-users.ts:59-83`) |
| Indexes duplicating unique constraints | 8 (schema lines 42, 43, 190, 193, 321, 338, 353, 413) |
| `JSON.parse(wrapped.data)` sites with no schema | 11 |
| Migrations | 33; about 10-11 with hand-written round-number timestamps; one named `latest`; retroactive `20250101000000_init` baseline; no CI drift check |
| pg pool | max 10 (pg-pool default), no `connectionTimeoutMillis`, no `statement_timeout` |
| Test mocks | 75 test files hand-roll `jest.mock('@/lib/prisma')` |

### Dead code inventory (no importers outside `__tests__`)

| File | Lines |
|---|---|
| components/shared/admin-footer.tsx | 38 |
| components/admin/shared/sign-out-button | 22 |
| components/admin/users/user-management | 97 (only caller of `generateAllPlexWrapped`) |
| components/admin/wrapped/historical-versions-inline | 144 |
| components/admin/wrapped/historical-wrapped-selector | 203 |
| components/admin/settings/llm-settings | 134 |
| components/admin/llm-usage/scrollspy-nav | 135 |
| components/admin/playground/cost-display | 78 |
| components/discord/link-panel | 217 |
| components/ui/styled-select | 91 |
| components/ui/service-icons | 44 |
| components/watchlist/sync-history-table | 187 |
| components/generator/wrapped-generator | 141 (only user of `hooks/use-wrapped-polling.ts`, 53 lines) |
| components/wrapped/user-wrapped-viewer | 208 |
| components/wrapped/wrapped-home-button | 262 |
| components/dashboard/plex-link-card | 57 |
| **Total** | **2,058** plus 4 dead API routes |

### Dependencies (installed vs npm latest, 2026-10-17)

| Package | Installed | Latest | Note |
|---|---|---|---|
| next | 16.1.1 | 16.4.2 | security-critical (BP-01); `package.json:46` |
| next-auth | 4.24.13 | 4.24.15; v5 is 5.0.0-beta.32 | 3 advisories fixed in 4.24.15; `package.json:47` |
| framer-motion | 12.42.2 | 14.3.0 (motion 14.3.0) | `package.json:43` |
| typescript | 5.9.3 | 7.0.2 | `package.json:83` |
| eslint | 9.39.2 | 10.13.0 | `package.json:75` |
| eslint-config-next | 16.2.10 | n/a | installed, not wired in; `package.json:76` |
| chart.js | 4.5.1 | 4.5.1 | current; canvas-only |
| @next-auth/prisma-adapter | ^1.0.7 | n/a | declared, unused; `package.json:33` |
| chalk | 4.1.2 (transitive, dev only) | n/a | required by logger, undeclared |

Other vulnerable production packages: undici and ws (via discord.js), sharp/libvips, qs (direct), lodash, postcss, defu. Dev and CLI only: hono, @prisma/dev, mysql2, effect, deepmerge-ts.

### CI, E2E and runtime inventory

| Item | Value |
|---|---|
| Workflows | `build.yml` (lint, build, test, e2e); `docker-publish.yml` (workflow_run + PR + tags; amd64 only, no scan, no SBOM); `test-analyze-failure.yml` (never fires); `claude-issue-triage.yml` (wrong command name) |
| Missing CI gates | typecheck, coverage threshold, `npm audit`, CodeQL, dependency review, image scan, migration drift, concurrency, permissions, timeouts |
| E2E | 13 specs, chromium only, against `next dev`; no spec generates a Rewind |
| Node versions | Docker `node:25.8-alpine` (EOL 2026-06-01), CI Node 22, mise `lts` |
| Runtime processes in the web container | Next server, BullMQ worker (concurrency 5), Discord bot lease poller, legacy watchlist poller when Redis is absent |
| SIGTERM handlers | 3 app handlers plus Next's own; no coordinator |
| Health or metrics endpoints | none |

### Scratch verifications

Saved under `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/testing-ops/`.

- `redis-probe/probe.js`: with the app's ioredis options and Redis unreachable, `upsertJobScheduler` was still pending after 8s.
- `npm-sim`: `npm install --no-package-lock <pkg>`, run in a directory with a `package.json`, also installed the devDependency. The verifier reproduced this with a second package.
- The scratch ESLint config with `core-web-vitals` was reproduced by the verifier with identical counts.
- The scratch tsconfig with the test `exclude` overridden produced the 601 errors.

## Appendix: Investigated and ruled out

No finding was refuted outright. Each sub-claim below was checked and ruled out or corrected; the parent finding stands in its adjusted form.

- **BP-01 / BP-38: NextAuth v4 causes the 46 manual session calls.** Ruled out. Auth.js v5's `auth()` cannot set cookies from an RSC either; a cached `getSession()` fixes this on v4.
- **BP-01: next-auth's critical email-normalizer and `getToken` advisories apply.** Ruled out. Only CredentialsProvider is used, and nothing calls `getToken`.
- **BP-01: middleware/proxy-bypass advisories undermine auth redirects in `proxy.ts`.** Ruled out. `proxy.ts` only logs and has no auth gate.
- **BP-01: the hono, @prisma/dev, mysql2, effect and deepmerge-ts highs are runtime-reachable.** Ruled out. They are Prisma CLI tooling.
- **BP-01: the critical next advisory is the remotePatterns DoS.** Corrected. That DoS is moderate; the critical one is the AVIF RCE (GHSA-2xp9-vwfh-vxw4).
- **BP-01: "add Dependabot".** Redundant. `.github/dependabot.yml` already exists; the real gap is that nothing blocks on audit.
- **BP-38: a missing chalk breaks production logging.** Ruled out. The require is in a try/catch with a `JSON.stringify` fallback.
- **BP-38: the package.json line references in FA-18.** Corrected. Lines 42/44/31/88 pointed at the wrong packages or a nonexistent line; the correct lines are listed in BP-38 and the Metrics table.
- **BP-02: every self-hoster auto-pulls `:latest`.** Speculative. The repo documents no GHCR consumers.
- **BP-03: `discordConnection: true` in `getUserDetails` leaks secrets.** Ruled out. It is mapped to safe fields (`user-queries.ts:147-156`), and no other `user: true` includes exist.
- **BP-07: the seeded admin account is a meaningful security risk.** Ruled out. It is only usable through the test-auth path, which is disabled in production.
- **BP-09: the StyledCheckbox `Math.random` id causes a hydration mismatch today.** Ruled out. All server-rendered usages pass an explicit `id`.
- **BP-09: `AdminHeader` declared in render is a runtime bug.** Ruled out. It lives in an async Server Component, so nothing remounts.
- **BP-08 / FA-11: adding `tsc -p tsconfig.test.json` to CI fixes test typechecking.** Ruled out as stated. That config checks zero test files until `exclude` is overridden.
- **BP-10: 5 suites fail locally.** Narrowed. This happens only when no `.env` exists, because next/jest loads `.env`.
- **BP-11: reuse the Docker image in E2E.** Not applicable. Docker builds live in a separate workflow.
- **BP-13: DB slowness and Discord login at boot are new outage sources.** Ruled out. Every page needs the DB anyway, and Discord login adds seconds.
- **BP-13: the Redis options are at `connection.ts:245`.** Corrected to lines 18-23; the file has 107 lines.
- **BP-14: Stripe's automatic redelivery is dropped.** Ruled out. Stripe redelivers only on non-2xx, and the route returns 200 after enqueuing. Exhausted jobs can be retried from the admin queue UI.
- **BP-15: an inline Rewind generation is killed by Next's `process.exit`.** Corrected. `server.close()` waits for in-flight HTTP requests; Docker's SIGKILL is what kills it.
- **BP-16: replicas race destructively on migrate.** Ruled out. Prisma's advisory lock serializes `migrate deploy`.
- **BP-16: the compose file's exposed Postgres and Redis are a production exposure.** Narrowed. It is a dev compose file (`container_name plex-wrapped-dev`).
- **BP-17: the original header-forwarding recommendation.** Corrected. Spreading a `Headers` object yields `{}` and would drop all request headers.
- **BP-18: long Tautulli or LLM calls hold pool connections.** Ruled out. Prisma takes a connection per query, and every transaction body is DB-only.
- **BP-18: max=10 is a regression from Prisma 6.** Ruled out. Prisma 6's default on 4 CPUs was 9; nothing in the repo set `connection_limit`.
- **BP-19: in-process workers block horizontal scaling.** Ruled out. Both leases exist for multi-pod safety, BullMQ supports multiple workers, the scheduler uses a fixed id, and migrate takes an advisory lock.
- **BP-19: a dedicated worker would offload Rewind CPU.** Ruled out. Rewind is not a queue job today.
- **BP-20: a `WATCHLIST_SYNC_ALL` retry repeats every user.** Ruled out. `syncAllEnabledUsers` catches per-user and top-level errors, never throws, and filters by `lastSyncAt`.
- **BP-20: duplicate syncs double-submit Overseerr requests.** Mitigated. `requestMedia` pre-checks pending/processing status and treats 409/"already" as `already_requested`.
- **BP-20: the webhook's 500 when the queue is unavailable is a bug.** Ruled out. Stripe retries, the `jobId = event.id` dedupe holds, and the route already returns 503 when Stripe is unconfigured. Only the docs wording is wrong.
- **BP-20: retrying "No active Plex server configured" is a defect.** Ruled out. It is retried intentionally, per the code comment.
- **BP-21: the inline `PRIMARY KEY` in the init migration causes drift.** Ruled out. Postgres names it `<Table>_pkey`, the same as Prisma.
- **BP-21: the destructive drops are hygiene defects.** Ruled out. They are Prisma-generated with drop warnings, remove a deliberately deleted feature, and backfill first.
- **BP-22: a reverse-proxy timeout strands rows in "generating".** Ruled out. The action keeps running and writes "completed" or "failed"; only a restart or crash strands a row.
- **BP-22: stuck rows can never be recovered.** Ruled out. The admin user-detail page always renders Regenerate.
- **BP-22: bulk generation fails for year-end runs today.** Ruled out. `generateAllPlexWrapped`'s only caller, `UserManagement`, is not rendered.
- **BP-22: same-tab double-clicks start duplicate runs.** Ruled out. The UI swaps views and same-tab actions are serialized; only multi-tab or direct-POST races remain.
- **BP-23: all traffic keys to `"unknown"` in the default compose setup.** Ruled out. Next sets `x-forwarded-for` from the socket address (`base-server.js:554`).
- **BP-23: the `(app)` guard redirects anonymous share visitors.** Ruled out. Anonymous visitors pass; only signed-in members with incomplete onboarding or no subscription are redirected.
- **BP-23: each view costs two limiter hits (metadata plus page).** Ruled out. Next dedupes the identical GET.
- **BP-26: status typos exist today.** Ruled out. Writers use only "generating", "completed" and "failed".
- **BP-26: malformed blobs are likely.** Ruled out. The app writes them after Zod validation; the risk is version drift.
- **BP-26: Postgres cannot query the data.** Corrected. A `::jsonb` cast works; Prisma filtering is what is blocked.
- **BP-26: the import N+1 is significant.** Ruled out. It is a rare admin action over a small list.
- **BP-26: `createMany({ skipDuplicates })` is a drop-in fix.** Ruled out. It would silently skip email collisions.
- **BP-28: all rows load twice.** Narrowed. Only wrapped-linked rows do; chatbot rows (`wrappedId` null) load once.
- **BP-28: groupBy alone replaces the query.** Corrected. It cannot return the last provider and model, which are arbitrary today anyway.
- **BP-31: every navigation recomputes everything.** Ruled out. Partial rendering skips shared layouts on soft navigation, `getAdminSettings` runs in one `Promise.all`, and Prometheus status is cached for 5 minutes.
- **BP-31: run the layout guards in parallel.** Rejected. The redirects are order-dependent; memoize them with React `cache()` instead.
- **BP-32: 93% client components is evidence of misuse.** Ruled out. Most use hooks or motion; only 7 small leaves are unnecessary.
- **BP-32: the invite page cannot export metadata.** Ruled out. `app/invite/layout.tsx` is a Server Component and can.
- **BP-33 / BP-36: the dead admin routes add meaningful attack surface.** Ruled out. They are admin-gated and rate-limited.
- **BP-34: bundle impact is measured.** Not measured. No production build was in scope, and chart.js must load for 5 Rewind sections.
- **BP-35: subscribe and `(app)` errors fall through to a generic, unstyled screen.** Ruled out. `app/error.tsx` renders the styled `ErrorState`.
