> Part of the [implementation plan](../../plan.md): the index, timeline, milestones and progress checklist live there. This phase is done.

## Phase 0: Safety fixes on the current code

**Goal.** Close every critical and high security or data-exposure problem that is small on today's code. Put stop-gaps on the v2 Rewind before any rebuild starts: no rosters in shared or stored data, guarded generation, and the right year.

**Window.** 2026-10-19 to 2026-10-27. The phase ends at the milestone "Phase 0 safety fixes shipped" on Friday 2026-10-23. Three small steps that the milestone does not need, P0.15, P0.16 and P0.17, run in the week of 2026-10-26.

**Tracks.** Three lanes, at most two open PRs each (see "How to use this plan"):
- **Hardening lane:** the security, ops and platform steps P0.1 to P0.7, P0.10, P0.16 and P0.18, plus P4.1 on 2026-10-23.
- **Rewind lane:** P0.8, P0.19, P0.20, P0.9 and P0.11 to P0.15 and P0.17, plus P2.1 and P2.3 from 2026-10-22.
- **UI lane:** P1.1, then P1.6, P1.7 and P1.8. P1.1 and P1.6 open the longest dependency chain to the season, so they never wait for a Phase 0 step other than P0.1.

**Day-0 rules (Monday 2026-10-19, before any other PR is opened).**
1. **Stop publishing PR code.** Until P0.3 merges, main's `docker-publish.yml` runs on `workflow_run` of any workflow named "Build" and pushes that run's PR code as `:latest` and `:main` (SEC-02). A `workflow_run` workflow always runs from main's copy, so editing it in a PR cannot stop this. Instead, the P0.3 PR renames the CI workflow in `build.yml` to "Checks" (not "Build", and not "CI", which main's old `test-analyze-failure.yml` matches): pull-request runs use the PR's copy of `build.yml`, so main's trigger never matches and no disable is needed. P0.3 merges before any other PR, because a PR branched from an older main still carries the "Build" name. After it merges, the next push to main publishes from the new push trigger.
2. **Guard the databases before any E2E run.** P0.4 merges second, before any step runs `npm run test:e2e`, the seed or a Postgres-backed Jest test. P0.1 and P0.5 rebase on P0.4 before their E2E runs. Until then, and always afterwards, agents run E2E only with an `E2E_DATABASE_URL` whose database name ends in `_test` (for example `plex_manager_test` on `docker compose up -d db-playwright`), never with a `.env` that points at a real database.
3. **Back up before every migration.** From the first deploy that carries a migration (P0.5's email clean-up on 2026-10-21) until P1.10's documented path replaces this rule, the owner takes a dump before deploying:

   ```bash
   docker compose exec -T db pg_dump -U postgres -Fc plex_wrapped > plex-manager-$(date +%F-%H%M).dump
   ```

   or `pg_dump -Fc "$DATABASE_URL" -f plex-manager-$(date +%F-%H%M).dump` outside compose. The dump holds every member's data, the encrypted secrets and, until P0.20 runs, the stored rosters: encrypt it (`age` or `gpg --symmetric`), keep it off the host, and delete it after 30 days. Every step that adds a migration lists "Dump taken before deploy; `prisma migrate status` clean" in its Done-when.

**What must ship for the 2026-10-23 milestone.** The critical and high fixes P0.1, P0.3 to P0.8, P0.19, P0.20, P0.10 to P0.12 and P0.14, plus P0.13's model swap before the 2026-10-23 retirement. P0.2, P0.9 (which P0.20 needs), P0.13's remaining stop-gaps and P0.18 are planned in the same week but may slip a day. P0.15, P0.16 and P0.17 run on 2026-10-26 and 2026-10-27. P1.1 and P1.6 are protected: if the week overruns, the hardening and Rewind lanes give up a step before the UI lane does.

**Ordering that matters.**
- `actions/wrapped-generation.ts` is edited by six steps. Merge them in this order and rebase each on the last: P0.9 (error code), P0.13 (`memberName()` and the prompt name), P0.8 (no stored roster), P0.19 (no token minting), P0.12 (claim, limits, year), P0.17 (eligibility gate).
- The Jellyfin provider in `lib/auth.ts` is edited by P0.5, then P0.6, then P0.10 (the per-username limit), and the test-token block by P0.4.
- P0.4's `assertTestDatabaseUrl()` is reused by the Postgres-backed tests in P0.20 and P0.12; P1.5 moves both onto its `describePg` helper. P0.9's stored error format is reused by step 3 of P0.20's script.
- P0.10 lands before P0.11 and P0.12. Until it lands, P0.19's share-link actions use today's `checkRateLimit` and switch to `consume()` in P0.10's PR.
- P0.20's script runs against production only after the release that carries P0.8 and P0.19 is deployed (see its operator path).

### Step P0.1: Upgrade Next.js, React and next-auth; close the image optimizer

- **Track:** security. **Lane:** hardening. **Effort:** M. **Window:** 2026-10-20 to 2026-10-21. **Depends on:** none.
- **Findings addressed:** SEC-01, BP-01, SEC-07, SEC-53, BP-05

**Objective.** Move to a Next.js release that is not under the 38 open advisories, and switch off the anonymous image optimizer that makes the RCE, SSRF and disk-fill advisories reachable. The same PR removes the dead build config and the unused auth packages.

**Guidance.**
- Run `npx @next/codemod@16.4.2 upgrade 16.4.2`, with the codemod pinned to the target version, and review its diff. Then set:
  - `next` `^16.4.2` and `eslint-config-next` at the same version;
  - `react` and `react-dom` `19.3.1`, with the matching `@types/react` and `@types/react-dom` 19.x;
  - `next-auth` `4.24.15`, which fixes the three advisories in SEC-07.
- Refresh the lockfile with `npm install`. Use `npm ls next react react-dom next-auth sharp` to confirm that Next pulled in the patched `sharp`, which carries the libvips, libheif and librsvg fixes in SEC-01.
- In `next.config.js`:
  - Replace the `images` block with `images: { unoptimized: true }`, deleting both `**` wildcards in `remotePatterns`. Six of the eight `next/image` call sites already pass `unoptimized`. The other two, the avatars in `components/admin/users/user-table-row.tsx:75` and `components/admin/invites/invite-details-client.tsx:273`, become unoptimized globally. Never set `dangerouslyAllowLocalIP`.
  - Build `script-src` from the Next phase that `next.config.js` receives, so that `'unsafe-eval'` appears only under `PHASE_DEVELOPMENT_SERVER` (`next dev`), where React Refresh needs it. E2E still runs on `next dev` until P1.5. (As merged: keyed to the phase rather than `NODE_ENV`, so a build or `next start` with a stray `NODE_ENV=development` never gets `'unsafe-eval'`.)
  - Add `object-src 'none'; base-uri 'self'; frame-ancestors 'self'` and `poweredByHeader: false`. These are the zero-risk parts of SEC-53. Leave out `form-action`, because a Server Action that redirects to Stripe Checkout would be blocked. The nonce CSP, HSTS and the deprecated headers stay with P11.20.
  - Delete the `webpack` callback (lines 61-91) and the empty `turbopack: {}`. `serverExternalPackages` already externalises discord.js, `zlib-sync` and the ws native helpers under Turbopack.
- Remove `@next-auth/prisma-adapter`. It is never imported, and `lib/auth.ts:20` says it is incompatible with CredentialsProvider.
- Replace `ts-node` with an exact-pinned `tsx` 4.x:
  - In `prisma.config.ts`, set the seed to `tsx prisma/seed.ts`.
  - Delete the stale `prisma.seed` block from `package.json`. Prisma 7 reads `prisma.config.ts`.
  - Point the two `register-discord-*` scripts at `tsx --tsconfig tsconfig.scripts.json scripts/<name>.ts`. tsx resolves `paths` itself, so `-r tsconfig-paths/register` goes.
  - Drop the `#!/usr/bin/env ts-node` shebangs in `scripts/`.
- Pitfalls:
  - Zod 4 probes `new Function` once. Without `'unsafe-eval'` it falls back silently, but browsers may log one CSP violation. If the console is noisy, `z.config({ jitless: true })` in `lib/providers.tsx` silences it.
  - The `next/og` and Satori versions change. `app/api/wrapped/og-image/route.tsx` must still render, and P2.14 re-measures the Rewind cards.
  - The auth-library migration is out of scope; it stays the 2027 spike in P11.23.

**Tests.**
- `npm run build`, `npm test` and `npm run test:e2e` pass. Paste the summaries into the PR.
- New `__tests__/config/next-config.test.ts`, which calls the `next.config.js` function with the production-server and development-server phases, asserts:
  - `images.unoptimized === true`, and no `remotePatterns`, `webpack` or `turbopack` key;
  - `poweredByHeader === false`;
  - the production-phase CSP has no `'unsafe-eval'` and includes `object-src 'none'`, while the development-server CSP keeps `'unsafe-eval'`.
- New `e2e/security-headers.spec.ts` uses `request.get('/_next/image?url=https%3A%2F%2Fexample.com%2Fa.png&w=64&q=75')` and expects a 4xx status. It is an API request, so it needs no selectors.
- `__tests__/api/wrapped-og-image-route.test.ts` still passes on the new `next/og`.

**Integration.**
- The committed lockfile feeds the Docker `deps` stage (`npm ci`), so the next image ships the patched versions.
- P0.2 builds on this lockfile, P1.3 wires the ESLint presets onto the matching `eslint-config-next`, and P2.14 re-measures the cards.

**Demo.**
- Run `npm run build && npm run start`.
- `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/_next/image?url=https%3A%2F%2Fexample.com%2Fx.avif&w=640&q=75'` prints a 4xx code.
- `curl -sI http://localhost:3000/` shows a CSP without `'unsafe-eval'` and no `X-Powered-By`.
- Plex and Jellyfin sign-in both work on the production build.

**Done when.**
- [ ] `next` is 16.4.2 or later, `eslint-config-next` matches it, `react` and `react-dom` are 19.3.1, and `next-auth` is 4.24.15.
- [ ] `@next-auth/prisma-adapter` and `ts-node` are gone, `tsx` is pinned, and the seed and both register scripts run under tsx.
- [ ] `npm audit --omit=dev` lists no `next`, `next-auth` or `sharp` advisory.
- [ ] `images.unoptimized` is true, no `remotePatterns` remain, and the `webpack` and `turbopack` keys are deleted.
- [ ] The production CSP has no `'unsafe-eval'`, and development keeps it.
- [ ] Build, Jest and E2E are green, and `/_next/image` refuses an external URL.

### Step P0.2: Clear the remaining production advisories

- **Track:** security. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** P0.1.
- **Findings addressed:** SEC-06

**Objective.** Update the remaining vulnerable production packages, so that `npm audit --omit=dev` reports no high or critical advisory and the critical ones are no longer hidden among the rest. The Discord bot and the queues must keep working.

**Guidance.**
- Start from P0.1's lockfile. Update within the current majors:
  - `discord.js` to the latest 14.x (14.27 or later). Its `@discordjs/rest` and `@discordjs/ws` pull in patched `undici` and `ws`.
  - `bullmq` to the latest 5.x, which brings a patched `uuid`.
  - `prisma`, `@prisma/client` and `@prisma/adapter-pg` to the same latest 7.x. Then run `npm run db:generate`; the generated client in `lib/generated/prisma` is not committed.
- Run `npm ls undici ws uuid lodash`. If a vulnerable copy remains under a parent that pins it (next-auth's `uuid` is the likely one), add an `overrides` entry with the patched version. List each override and its advisory ID in the PR description, because `package.json` cannot hold comments.
- Run `npm audit fix` for non-breaking fixes only, never `--force`. Semver-major fixes in the dev tree (`micromatch`, `braces`, `fast-glob` through `eslint-config-next`) are out of scope; `--omit=dev` excludes them.
- `qs` is used for a single `qs.stringify` call, in `createPlexAuthUrl` (`lib/plex-auth.ts:137`). Replace it with `URLSearchParams`, using the bracketed key `context[device][product]`, and remove `qs` and `@types/qs`. Both libraries percent-encode the brackets, so the URL stays byte-identical; the test below proves it.
- Pitfall: `--omit=dev` does not cover the Prisma CLI that the Dockerfile runner stage installs from `devDependencies` (SEC-03). Updating it to the latest 7.x minimises its `@prisma/dev` chain, and P4.17 pins and hardens it.

**Tests.**
- `npm test` passes. Check these suites in particular:
  - `__tests__/lib/queue/*.test.ts` (the job registry, the Stripe processor, Plex access grant and revoke);
  - `lib/discord/**/__tests__`, including `bot-intents.test.ts`, and `lib/discord/lock/__tests__`.
- New `__tests__/lib/plex-auth-url.test.ts` asserts that `createPlexAuthUrl(123, 'ABCD', 'INVITE1')` equals a snapshot captured with `qs` before the change.
- Bot smoke test, run by hand in a dev guild with a dev bot token:
  - the bot logs in once, `/mystats` replies, and a DM gets a reply;
  - `npm run register-discord-commands` succeeds.
- Queue smoke test, with `REDIS_URL` set: trigger a watchlist sync from the admin queues page and watch the job complete.

**Integration.**
- P1.5 turns this check into a required CI gate (`npm audit --omit=dev --audit-level=high`) and adds Renovate or Dependabot.
- There is no schema change. `npm run build` already runs `prisma generate`.

**Demo.** `npm audit --omit=dev` prints 0 high and 0 critical. The dev bot is online and answers a slash command, and a queue job completes.

**Done when.**
- [ ] `npm audit --omit=dev --audit-level=high` exits 0, and its output is in the PR.
- [ ] discord.js, bullmq and the Prisma packages are on their latest in-major versions, and every override is listed with its advisory.
- [ ] `qs` and `@types/qs` are removed, and the Plex auth URL test passes unchanged.
- [ ] Jest is green, and the bot and queue smoke tests are recorded.

### Step P0.3: Stop publishing unmerged pull-request code to GHCR

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-19 to 2026-10-19. **Depends on:** none.
- **Findings addressed:** BP-02, SEC-02, SEC-05

**Objective.** Publish images only from trusted refs, with least-privilege tokens and immutable action references. Remove the dormant injection, and stop untrusted issue text from driving an agent that holds write tools.

**Guidance.**
- Rewrite `.github/workflows/docker-publish.yml`:
  - Trigger on `on: push: { branches: [main], tags: ['v*'] }` only, removing `workflow_run`, `pull_request` and `workflow_dispatch`.
  - Set top-level `permissions: {}`.
  - The single job gets `if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')` and `permissions: { contents: read, packages: write }`.
  - Delete the `ref: ${{ github.event.workflow_run.head_sha || github.ref }}` checkout input, so that `actions/checkout` builds the pushed `github.sha`.
  - Keep the metadata-action tags. `{{is_default_branch}}`, and with it `latest`, is now true only for pushes to main.
- Move the no-push smoke build into `.github/workflows/build.yml` as a `docker-build` job:
  - it runs on `pull_request` with `permissions: contents: read`;
  - `docker/build-push-action` gets `push: false` and `cache-from: type=gha`, with no `cache-to`.
- Add top-level `permissions: contents: read` to `build.yml`.
- Pin every third-party action to a full 40-character commit SHA with a `# vX.Y.Z` comment:
  - `docker/setup-buildx-action`, `docker/login-action`, `docker/metadata-action` and `docker/build-push-action`;
  - `anthropics/claude-code-action` in all three Claude workflows.

  Resolve annotated tags to commits, for example with `gh api repos/docker/login-action/git/ref/tags/v4` followed by `gh api .../git/tags/<sha>`. The existing github-actions entry in `.github/dependabot.yml` keeps the SHA pins current.
- Delete `.github/workflows/test-analyze-failure.yml`. It holds `actions: write`, uses `claude-code-action@main`, and pastes `head_branch` and the model output into shell. It is dormant only because no workflow is named "CI".
- Fix `.github/workflows/claude-issue-triage.yml`:
  - Remove `allowed_non_write_users: "*"`.
  - Add `if: contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.issue.author_association)`.
  - Fix the prompt to `/label-issues REPO: ... ISSUE_NUMBER: ...`; the command file is `label-issues.md`.
  - Pass `claude_args: --allowedTools "Bash(gh label list:*),Bash(gh issue view:*),Bash(gh issue edit:*),Bash(gh search:*)"`, which matches the frontmatter of `.claude/commands/label-issues.md`.
- `claude-duplicate-review.yml` already runs only for users with write access, because it does not set `allowed_non_write_users`. It only needs the SHA pin.
- Pitfall: with `workflow_run` gone, publishing no longer waits for Build. Main must be protected so that only commits that passed Build land there. P1.5 makes those checks required; until then, check the branch protection by hand.
- GHCR's current `latest`, `main` and `sha-60e5fc0` share a digest built from a PR head (BP-02). The first push to main after merge republishes them. Delete the suspect package version in the GHCR UI.

**Tests.**
- `actionlint` passes on every workflow.
- A shell check in the PR, `grep -nE 'uses: (docker|anthropics)/' .github/workflows/*.yml | grep -vE '@[0-9a-f]{40}'`, prints nothing.

**Integration.**
- P1.5 adds the workflow concurrency limits, timeouts and required checks.
- P11.25 builds the versioned release flow on the `v*` tag trigger.

**Demo.**
- Open a PR from a fork, or from a branch with a trivial change. Build passes, including `docker-build`, and no "Docker Build and Publish" run appears. The GHCR version list is unchanged.
- Push to main. One publish run produces `main`, `latest` and `sha-<that sha>`, and the image's `org.opencontainers.image.revision` label equals the pushed SHA.

**Done when.**
- [ ] `docker-publish.yml` runs only on pushes to main and `v*` tags, and never checks out `workflow_run.head_sha`.
- [ ] `build.yml` has top-level read-only permissions and a no-push `docker-build` job for pull requests.
- [ ] Every third-party action is pinned by SHA.
- [ ] `test-analyze-failure.yml` is deleted, and issue triage runs only for trusted authors with the label tools.
- [ ] The fork-PR demo and the main-push demo are recorded in the PR.

### Step P0.4: Guard E2E and the seed against non-test databases

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-19 to 2026-10-19. **Depends on:** none.
- **Findings addressed:** BP-07, SEC-15

**Objective.** Make it impossible for the E2E suite, the setup-wizard spec or the seed to wipe any database other than the dedicated test database. Test-only login and the dev prefill must need an explicit flag, not only `NODE_ENV`.

**Guidance.**
- New `lib/security/test-mode.ts`, a plain module that the Jest, Playwright and seed code paths can all import:
  - `assertTestDatabaseUrl(url: string | undefined): string` parses the URL with `new URL()` and requires a `postgres:` or `postgresql:` protocol. It takes the database name from the decoded `pathname` without the leading slash, and requires it to end in `_test`. On failure it throws an error that shows the URL with the password masked.
  - `isE2ETestMode()` returns `process.env.NODE_ENV !== 'production' && process.env.E2E_TEST_MODE === 'true'`.
- `playwright.config.ts`, after `import 'dotenv/config'`:
  - Call `assertTestDatabaseUrl(process.env.E2E_DATABASE_URL)`, then set `process.env.DATABASE_URL = process.env.E2E_DATABASE_URL`, so that global setup, the helpers and the specs all see the test database.
  - In `webServer.env`, pass `DATABASE_URL` explicitly and replace `ENABLE_TEST_AUTH` with `E2E_TEST_MODE: 'true'`.
  - Set `reuseExistingServer: process.env.E2E_REUSE_SERVER === '1'`, because a running `npm run dev` points at the dev database.
  - Default `E2E_PORT` to 3100.
- Add the guard at every entry point, so each one refuses on its own:
  - `createE2EPrismaClient()` (`e2e/helpers/prisma.ts`) calls `assertTestDatabaseUrl(process.env.DATABASE_URL)` and checks that it equals `E2E_DATABASE_URL`. `e2e/global-setup.ts`, `e2e/fixtures/auth.ts` and every spec inherit the check.
  - `e2e/setup-wizard.spec.ts` asserts again in `beforeAll`, before the `deleteMany` block at lines 40-54.
- Test-token login (`lib/auth.ts:40-43`): set `isTestMode = isE2ETestMode()`. This drops the "NODE_ENV is test" path and `ENABLE_TEST_AUTH`. Log one `logger.warn('E2E test login is enabled')` when the flag is on. `NEXT_PUBLIC_ENABLE_TEST_AUTH` stays for the client callback (`app/auth/callback/plex/callback-client.tsx:36`); the server refuses test tokens without `E2E_TEST_MODE` anyway.
- `getDevDefaults` (`actions/dev-defaults.ts:104-123`) returns values only when `NODE_ENV === 'development'`, the explicit flag is set and `Setup.isComplete` is false. Otherwise it returns `emptyDefaults`.
- `prisma/seed.ts`:
  - Refuse unless `isE2ETestMode()` is true and either the database name ends in `_test` or the host is local (`localhost`, `127.0.0.1`, `::1`, `db` or `db-playwright`).
  - Print the target host and database before any `deleteMany`.
  - Remove the `SKIP_SEED` block, and remove `SKIP_SEED=true` from the `db:migrate` script; Prisma 7 no longer seeds on `migrate dev`.
- Configuration and docs:
  - `docker-compose.yml` `db-playwright`: `POSTGRES_DB=plex_manager_test`.
  - `example.env`: add `E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/plex_manager_test?schema=public"` and a commented, test-only `E2E_TEST_MODE`, and remove the `ENABLE_TEST_AUTH` text.
  - `build.yml`: rename `test_db` to `plex_manager_test` in all three jobs. The e2e job sets `E2E_DATABASE_URL` and `E2E_TEST_MODE` and drops `ENABLE_TEST_AUTH`.
  - `e2e/README.md` and `.claude/commands/fix-e2e.md` start with `docker compose up -d db-playwright` and `DATABASE_URL=$E2E_DATABASE_URL npx prisma migrate deploy`.

**Tests.**
- New `__tests__/lib/security/test-mode.test.ts`:
  - `assertTestDatabaseUrl` accepts `.../plex_manager_test` and `.../plex_manager_test?schema=public`.
  - It rejects `plex_wrapped`, `test_db`, `plex_test_backup`, an undefined URL and a `mysql:` URL.
  - `isE2ETestMode()` is false with `NODE_ENV=production` and the flag set, and false with `NODE_ENV=test` and no flag.
- `__tests__/lib/auth-access-relaxation.test.ts` moves to the new flag. New cases check that `TEST_ADMIN_TOKEN` is rejected when `NODE_ENV` is test and the flag is unset.
- `__tests__/actions/dev-defaults.test.ts` adds two cases: empty without the flag, and empty once setup is complete.

**Integration.**
- P0.20 and P0.12 use `assertTestDatabaseUrl` to gate their Postgres-backed Jest tests, until P1.5's `describePg` helper takes over.
- P1.5 runs production-mode E2E on a throwaway Postgres whose name ends in `_test`.
- P1.6's seed helpers go through `createE2EPrismaClient`.

**Demo.**
- With the dev `.env` (`DATABASE_URL` pointing at `plex_wrapped`, no `E2E_DATABASE_URL`), `npm run test:e2e` stops before global setup with the guard's message. `SELECT count(*) FROM "User"` on the dev database is unchanged.
- With `db-playwright` running and `E2E_DATABASE_URL` set, the suite runs.

**Done when.**
- [ ] Playwright, `createE2EPrismaClient` and the setup-wizard spec each refuse a database whose name does not end in `_test`.
- [ ] Test-token login needs `E2E_TEST_MODE=true` outside production; `NODE_ENV=test` alone no longer enables it.
- [ ] `getDevDefaults` and the seed need the explicit flag, and the seed prints its target and refuses non-local, non-test databases.
- [ ] CI, compose, `example.env` and the E2E docs use `plex_manager_test`.
- [ ] The guard's unit tests pass, and the abort demo is recorded.

### Step P0.5: Remove email-based account linking

- **Track:** security. **Lane:** hardening. **Effort:** M. **Window:** 2026-10-20 to 2026-10-21. **Depends on:** none.
- **Findings addressed:** SEC-08, SEC-14

**Objective.** Close the account-takeover path in which a Jellyfin user renames themselves to the owner's email and signs in as the admin, and its pre-claim variant. Make the "disable Jellyfin login" toggle actually disable the provider.

**Guidance.**
- Jellyfin `authorize` in `lib/auth.ts` (lines 277-420):
  - Load the active `JellyfinServer`. If `enabledForLogin` is false, log `jellyfin.login.disabled` and return null before contacting Jellyfin (SEC-14).
  - Look the user up only by `jellyfinUserId`. Delete the `emailSchema`, `normalizedEmail` and `userByEmail` block (lines 324-348), and with it the link that carried `isAdmin: isAdmin || userByEmail.isAdmin`.
  - Create new rows with `email: null`. Only `name`, `jellyfinUserId`, `isAdmin` (from `isJellyfinAdmin`), `primaryAuthService: 'jellyfin'` and `onboardingStatus` are written.
  - In the existing-row update (line 394), delete the `email:` line; only `name` and `isAdmin` are written. Role persistence and the failed-owner-lookup demotion stay with P4.7 (GAP-26).
  - Remove the `z` import if it becomes unused.
- `actions/invite.ts`:
  - `findOrCreateUser` (Plex invite redemption) matches only by `plexUserId`; delete the `userByEmail` merge (lines 315-325). If the create hits a unique-email conflict (Prisma `P2002` on `email`), retry once with `email: null` and `logger.warn('invite.email_conflict', { existingUserId, plexUserId })`. That way a pre-claimed row can neither absorb the victim's Plex identity nor block them.
  - `processJellyfinInvite` (line 784) replaces its ad-hoc length checks with `jellyfinInviteCredentialsSchema` in `lib/validations/jellyfin.ts`. The username is `z.string().trim().regex(/^[A-Za-z0-9._-]{3,32}$/)`, which allows no `@` and no spaces, and the password is `z.string().min(8).max(256)`. Validation runs before `validateAndUseInvite`, so a rejected name consumes no invite.
- Data fix, migration `prisma/migrations/20261020000000_clear_jellyfin_username_emails/migration.sql`: `UPDATE "User" SET "email" = NULL WHERE "jellyfinUserId" IS NOT NULL AND "plexUserId" IS NULL AND "email" IS NOT NULL;`. Those emails can only have come from Jellyfin usernames, so this removes any pre-claimed email.
- Before deploying, take a dump (the Phase 0 day-0 rule 3; the migration clears data and cannot be undone), then run `SELECT id, name, email, "isAdmin" FROM "User" WHERE "jellyfinUserId" IS NOT NULL AND "plexUserId" IS NOT NULL;` and hand the rows to the owner. These are links the old code made by email. The owner unlinks any unrecognised row by hand (`UPDATE "User" SET "jellyfinUserId" = NULL, "email" = NULL WHERE id = ...`). The old Jellyfin sign-in also wrote the Jellyfin username over `email` on linked rows, so the owner clears the email of any other linked row whose address is not that member's own (`UPDATE "User" SET "email" = NULL WHERE id = ...`). The migration deliberately leaves linked rows alone, because their email is usually the verified Plex address the Stripe grant and Checkout use; this review is what removes a Jellyfin-written email from them.
- UI copy: the `JellyfinLoginToggle` label (`components/admin/settings/JellyfinLoginToggle.tsx`) and the `toggleJellyfinLogin` docstring (`actions/admin/admin-servers.ts:634`) now say "Allow Jellyfin sign-in".
- Pitfalls:
  - The invite flow creates the Jellyfin account before the app row. With linking only by `jellyfinUserId`, an early sign-in creates the row that `findOrCreateJellyfinUser` later finds, so the race is harmless. The compensation gap is P4.12.
  - The Stripe grant job (`lib/queue/jobs/stripe.ts:431`) now throws "has no email" for Jellyfin-only subscribers instead of inviting a username-derived address to Plex. That is the safe failure; P11.11 makes it act on the Jellyfin account.
  - A Plex sign-in or invite that hits the unique-email conflict stores no email, so that member would also pay and never be granted. `startCheckout` therefore refuses a row with no email and tells the member to sign in with Plex again (`actions/subscription.ts`). P11.11 replaces the refusal with a grant that does not need an email.

**Tests.**
- New `__tests__/lib/auth-jellyfin-linking.test.ts` resolves the provider by `options.name === 'Jellyfin'`, as in `auth-access-relaxation.test.ts`, and mocks `@/lib/jellyfin-auth`:
  - **Rename attack.** The Jellyfin user is `{ id: 'jf-mallory', username: 'owner@example.com' }`, and the admin row has that email. The result is a new non-admin user, `user.findUnique` is never called with `{ email }`, and `user.update` never touches the admin row.
  - **Pre-claim.** The username is `victim@example.com` and no row exists. The created row has `email: null`.
  - An existing Jellyfin row whose username contains `@`: the update data has no `email` key.
  - `enabledForLogin` false: the result is null and `authenticateJellyfin` is not called.
- `actions/__tests__/invite.test.ts` covers the pre-claim variant end to end:
  - a Plex invite for `victim@example.com`, while a Jellyfin row holds that email, creates a separate row;
  - an email conflict retries with `email: null`;
  - the invite usernames `a@b.com`, `ab`, `has space` and a 33-character name are rejected without consuming the invite, and `jane.doe-2` is accepted.

**Integration.**
- `e2e/jellyfin-invite.spec.ts` uses a username that passes the new schema.
- The migration runs on deploy through `docker-entrypoint.sh` (`prisma migrate deploy`).
- P0.6 continues in the same provider block. Release notes say that Jellyfin-only members' stored emails were cleared.

**Demo.**
- In a dev Jellyfin, rename a user to the admin's Plex email and sign in through the app. The session is a new non-admin member, and `SELECT "jellyfinUserId", "isAdmin" FROM "User" WHERE email = '<owner email>'` is unchanged.
- Turn Jellyfin sign-in off. A direct POST to `/api/auth/callback/jellyfin` fails.

**Done when.**
- [ ] The Jellyfin provider never looks up by email, never carries `isAdmin` across a link and never writes `User.email`.
- [ ] `findOrCreateUser` no longer merges by email.
- [ ] Jellyfin invite usernames are Zod-validated, with no `@` allowed.
- [ ] `enabledForLogin` is enforced in `authorize`.
- [ ] The email-clearing migration has shipped, and the owner has reviewed the linked-rows list.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] The rename and pre-claim tests pass.

### Step P0.6: Jellyfin 12 sign-in header and server-only Jellyfin helpers

- **Track:** security. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** none.
- **Findings addressed:** GAP-01, SEC-35

**Objective.** Restore Jellyfin password sign-in on Jellyfin 12.0, which ignores the legacy `X-Emby-Authorization` header by default. Remove the unauthenticated SSRF primitive in the Jellyfin helpers that take a caller-supplied URL and key.

**Guidance.**
- `lib/connections/jellyfin-core.ts`:
  - `getJellyfinAuthHeaders()` returns `Authorization: MediaBrowser Client="Plex Manager", Device="Server", DeviceId="<id>", Version="<version>"`, each value `encodeURIComponent`-encoded inside quotes, as `@jellyfin/sdk` does.
  - `DeviceId` is `process.env.JELLYFIN_DEVICE_ID`, or else a stable per-install ID: `plex-manager-` plus the first 16 hex characters of the SHA-256 of `getClientIdentifier()` (`lib/connections/plex-core.ts:98`).
  - `Version` is the `package.json` version.
  - Add `getLegacyJellyfinAuthHeaders()`, which sends the same values as `X-Emby-Authorization`.
- `authenticateJellyfinUser` (`lib/connections/jellyfin-users.ts:272`):
  - Send the `Authorization` header first. Only on a 400, retry once with the legacy header, and log `jellyfin.auth.legacy_header_fallback` at warn.
  - Map 401 to "Invalid username or password" and any other failure to "Jellyfin rejected the sign-in request", never the raw `statusText`.
  - After success, make a best-effort `POST /Sessions/Logout` with `Token="<AccessToken>"` added to the header, a 3 s timeout and errors ignored. The app discards the token, so it should not keep a live session (GAP-01).
- `lib/jellyfin-auth.ts`:
  - Remove `"use server"` and add `import "server-only"`. Add the `server-only` package, and map it in `jest.config.js` `moduleNameMapper` to an empty `__mocks__/server-only.ts`.
  - The new signatures are `authenticateJellyfin(username, password)` and `isJellyfinAdmin(jellyfinUserId)`. Both read the active `JellyfinServer` themselves; the encryption extension decrypts `apiKey` on the top-level read.
  - Export `getJellyfinLoginServer()`, which returns the active server only when `enabledForLogin` is true. `lib/auth.ts` uses it in place of its own `findFirst`, which keeps P0.5's toggle check in one place.
- Audit the other `"use server"` modules named in SEC-35. `lib/plex-auth.ts` takes a PIN ID or token but no URL (P4.8 hardens it), and `lib/guards.ts` takes no URL. Record the result in the PR.

**Tests.**
- `lib/connections/__tests__/jellyfin-users.test.ts`:
  - the first request's `Authorization` header matches `^MediaBrowser Client="Plex%20Manager", Device="Server", DeviceId="[^"]+", Version="\d+\.\d+\.\d+"$`, and it carries no `X-Emby-Authorization`;
  - a 400 triggers exactly one retry, which carries only the legacy header, while a 401 is not retried;
  - no returned error contains `statusText`;
  - the logout call carries `Token="..."`.
- New `__tests__/lib/server-action-surface.test.ts` uses the TypeScript compiler API (`typescript` is a devDependency) to parse every file under `actions/` and `lib/` that starts with the `"use server"` directive. It asserts:
  - `lib/jellyfin-auth.ts` and `lib/connections/**` have no directive;
  - no exported function outside `actions/admin/**` and `actions/setup*.ts` has a parameter named `url`, `baseUrl` or `serverUrl`, or typed with a `url` or `apiKey` property.

  The two allow-listed paths are admin- or setup-gated, and P11.32 and P4.6 tighten them.
- `__tests__/lib/auth-jellyfin-linking.test.ts` (P0.5) moves to the new signatures.

**Integration.**
- `lib/auth.ts` calls the new helpers without a config argument.
- `docs/` and `example.env` document `JELLYFIN_DEVICE_ID` as optional.
- P0.10 adds the per-username limit in the same `authorize`. P2.3's shared HTTP client later absorbs the timeout and redirect rules.

**Demo.** Sign in with a Jellyfin password against a Jellyfin 12.x test server and against a 10.11 server. Both succeed, and the 12.x server's dashboard shows no lingering "Plex Manager" session afterwards. `grep -n "use server" lib/jellyfin-auth.ts` prints nothing.

**Done when.**
- [ ] Jellyfin sign-in sends `Authorization: MediaBrowser ...` and falls back to the legacy header only after a 400.
- [ ] Error strings never expose upstream status text, and the token is logged out after sign-in.
- [ ] `lib/jellyfin-auth.ts` is `server-only` and reads the stored config, and no exported action outside the admin and setup allow-list takes a target URL.
- [ ] The header-shape and action-surface tests pass, and sign-in works on Jellyfin 12.

### Step P0.7: Keep the Discord bot lease alive

- **Track:** platform. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-23 to 2026-10-23. **Depends on:** none.
- **Findings addressed:** BP-12

**Objective.** Stop the bot from dropping offline every minute. Renewal of the 30 s lease must not depend on the 60 s acquisition poll.

**Guidance.**
- `lib/discord/lock/lease.ts`: add `getLeaseDurationMs()` to `DistributedLock`.
- `lib/discord/lock/poller.ts`:
  - Add a renewal timer. Its interval is `options.renewIntervalMs ?? Math.floor(lock.getLeaseDurationMs() / 3)`, which is 10 s for the default 30 s lease.
  - Start the timer as soon as `running` becomes true, in `start()` after the immediate acquire and in the acquire branch of `tick()`, and before `await this.callbacks.onLockAcquired()`, because the bot login can take seconds.
  - Each renewal is guarded by a `renewing` flag that skips overlapping runs. It calls `this.lock.renew()`. On false it clears the timer, sets `running = false` and awaits `onLockLost()` once.
  - Remove `this.lock.renew()` from `tick()`. The poll keeps acquisition, the enabled check and the config-version bounce.
  - Clear the renewal timer on every path that ends `running`: disable, a failed bounce, a lost renewal and `stop()`. Keep it running through the config bounce, so the lease cannot lapse during the re-login.
  - The constructor throws when the renewal interval is at least half the lease. This is BP-12's guard, so that a later change cannot reopen the gap.
- Change the default in `lib/instrumentation/node.ts:208` from `"60000"` to `"10000"`. This aligns it with `DEFAULT_POLL_INTERVAL_MS` in `poller.ts`, and the mismatch between the two is how the gap appeared. Update the comment in `example.env:42`.
- Pitfall: the watchlist-sync lock is a copy of this code (DUP-07). Check it for the same gap and record the result. Consolidation is P11.2.

**Tests.**
- `lib/discord/lock/__tests__/poller.test.ts` (fake timers; mock lock with `getLeaseDurationMs` returning 30 000; `pollIntervalMs` 60 000):
  - `renew` runs at 10 s, 20 s, 30 s and onwards, and the gap between renewals never exceeds 10 s over one simulated hour;
  - a false renewal fires `onLockLost` exactly once and stops the timer;
  - disabling the bot clears the timer, and `stop()` clears both timers;
  - renewal continues during a config bounce;
  - the constructor throws for `renewIntervalMs: 15_000`.
- New lock-integration test in the same directory. It uses a real `DistributedLock` with the injected in-memory store pattern from `lease.test.ts` and a fake clock. With the `node.ts` defaults, after 60 simulated minutes the lease never expired and `onLockAcquired` fired once.

**Integration.**
- `lib/instrumentation/node.ts` keeps constructing the poller; no other caller changes.
- `docs/discord-bot.md` documents the poll interval and the lease.
- P4.2 later wires the coordinated SIGTERM shutdown, and P11.7 adds starting the bot without a restart.

**Demo.** Run the bot for one hour in a dev guild. The log shows a single "Discord bot initialized successfully", and `SELECT "lastRenewedAt", "expiresAt" FROM "DiscordBotLock"` advances every 10 s. A slash command at minute 59 is answered.

**Done when.**
- [ ] Renewal runs on its own timer at a third of the lease, independent of the poll.
- [ ] The constructor rejects a renewal interval of half the lease or more, and the default poll is 10 s.
- [ ] The fake-timer and lock-integration tests pass.
- [ ] The one-hour demo shows a single login.

### Step P0.8: Share-safe v2 projection and share routes; stored Rewinds keep no roster

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-10-20 to 2026-10-21. **Depends on:** none.
- **Findings addressed:** RWP-01, SEC-16, GAP-37

**Objective.** Serve public share responses through an allow-list projection, so no other member's name or watch time leaves the server, and stop writing rosters and reversible visitor pseudonyms. P0.19 makes sharing opt-in, and P0.20 cleans the rows already stored.

**Guidance.**
- **Generation** (`actions/wrapped-generation.ts`). The prompt keeps the in-memory `leaderboards`, but `assembleWrappedData` (`lib/wrapped/assemble-wrapped.ts`) persists `statistics` from an explicit key list without `leaderboards`; `percentile` stays. The stored `userName` is `memberName(user) ?? 'Viewer'`, using P0.13's helper, and the bulk error list (line 449) and `actions/playground-wrapped.ts` use `user.name || user.id`. Token minting is P0.19's change to the same file.
- **Projection**, in new `lib/wrapped/data/share-safe-v2.ts`. `ShareSafeRewindV2` is a strict Zod schema, built field by field with no spreads: `{ year, ownerName, summary, archetypeName, totals: { minutes, movies, shows, episodes }, months: [{ month, minutes }], topMovies, topShows }`. Each top list holds at most 5 entries of `{ title, year?, minutes, plays, episodes?, ratingKey? }`. `ownerName` is `memberName(user) ?? 'Someone'`. `toShareSafeV2(row, owner)` reads v1 and v2 rows and ends with `.parse()`, so an unexpected key fails.
- **Callers.** The share API (`app/api/wrapped/share/[token]/route.ts`) returns `{ success, wrapped: projection }`, with no `id` or `data`. The share page passes the projection to `WrappedShareSummary`, whose props become `ShareSafeRewindV2`. `app/api/wrapped/og-image/route.tsx` reads `ownerName`, `archetypeName` and `totals`. Each caller selects only `user: { select: { name: true } }`. The API and OG responses send `X-Robots-Tag: noindex`, and the page metadata sets `robots: { index: false, follow: false }`.
- **Visits.** The API route writes `{ wrappedId }` only. Delete `getHashedIP` and `lib/security/ip-hash.ts`, and their re-export in `lib/security/index.ts` if P1.1 has not already removed that barrel.

**Tests.**
- `lib/wrapped/data/__tests__/share-safe-v2.test.ts` is the key-snapshot test. It projects the fixtures in `lib/wrapped/__tests__/fixtures.ts`, plus one with leaderboards and an email `userName`. It fails on any key path matching `/leaderboard|email|userId|plexUserId|tautulli|serverStats|totalServerRequests/i` and on any string containing the fixture email, and checks that the strict schema rejects an extra key.
- `__tests__/api/wrapped-share-route.test.ts` and `__tests__/security/wrapped-sharing.test.ts`: the response has no `data` or `id` and carries noindex, and the visit is created with `{ wrappedId }` only.
- `__tests__/api/wrapped-og-image-route.test.ts`: a null name renders "Someone".
- `__tests__/actions/wrapped-generation-action.test.ts`: the persisted JSON has no `leaderboards`, and an email-like name is stored as "Viewer".

**Integration.**
- The admin Shares visit counts are kept: P0.20 scrubs the legacy visits' IP hash, user agent and referer instead of deleting the rows (as merged), and new visits record only the Rewind id.
- P0.11 builds `getShareSafeRewind` on this projection. P2.1 and P5.10 reuse the key-snapshot test, P7.5 serves the surviving v2 tokens, and P11.18 drops them at season close.

**Demo.**
- `curl /api/wrapped/share/<token> | jq '[paths | map(tostring) | join(".")]'` lists only allow-listed keys, and the page source has no "leaderboard".
- A new generation's stored JSON has no `leaderboards` key.

**Done when.**
- [ ] The share API, the share page and the OG route serve only the projection and send noindex, and the key-snapshot test passes.
- [ ] Generation stores no roster and no email as a name.
- [ ] New visits store only the wrapped id, and the IP pseudonym helper is deleted.
- [ ] The v2 viewer and the share page still render.

### Step P0.19: Opt-in v2 share links; only one action sets a token

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** P0.8.
- **Findings addressed:** SEC-16

**Objective.** Make sharing something a member turns on. Generation and the admin playground stop minting share tokens, and one action becomes the only code path that sets `PlexWrapped.shareToken`.

**Guidance.**
- **Generation** (`actions/wrapped-generation.ts`, after P0.8 in the Phase 0 merge order). Delete both token-minting sites, the upsert at lines 134-159 and step 6 at line 322, so generation never writes `shareToken`.
- **Playground.** `savePlaygroundWrapped` (`actions/playground-wrapped.ts:104`, with the upsert at 107-133) stops calling `generateShareToken()`. Its create omits `shareToken`, and its update leaves the field out, so an existing value is preserved and no new one is created. Without this, an admin's playground save would mint a token behind a member's row after P0.20 has revoked the old ones. P8.8 deletes the action.
- **Opt-in sharing**, in new `actions/wrapped-share-link.ts`. `enableWrappedShareLink({ year })` mints `generateShareToken()` only when no token exists, and returns the URL. `disableWrappedShareLink({ year })` sets the token to null. Each action has Zod input, a session check and an own-completed-row check, a limit of 10 per hour (`rw:share-actions:<userId>`) and an audit entry; add `SHARE_LINK_CREATED` and `SHARE_LINK_REVOKED` to `AuditEventType`.
- **Controls.** New `components/wrapped/wrapped-share-controls.tsx`, rendered by `wrapped-viewer-navigation.tsx`, shows either "Create share link" (`data-testid="wrapped-share-create"`) or the existing `WrappedShareButton` plus "Stop sharing" (`wrapped-share-stop`). Owners of surviving tokens get "Stop sharing" too (`design/rewind-2026-design.md` 6.2).

**Tests.**
- `__tests__/actions/wrapped-generation-action.test.ts`: generation never sets `shareToken`, on the create and the update path.
- `actions/__tests__/playground-wrapped.test.ts`: a save on a row without a token leaves `shareToken` null, and a save on a row with a token keeps it unchanged.
- New `actions/__tests__/wrapped-share-link.test.ts`: enable is idempotent, works only on the member's own completed row and is rate-limited; disable nulls the token.
- New `__tests__/config/share-token-writers.test.ts` scans `app`, `actions`, `lib` and `components` (tests excluded). `generateShareToken(` appears only in `actions/wrapped-share-link.ts`, and a `shareToken:` key inside a Prisma `data` payload appears only there and in P0.20's `lib/wrapped/maintenance/strip-rosters.ts`, both of which may write `null`.

**Integration.** P0.10 moves the share actions onto `consume()`. P7.5's owner banner keeps `disableWrappedShareLink` for surviving v2 tokens until P11.18. P7.13 removes the last caller of `enableWrappedShareLink` and deletes it, and the grep test then asserts that no code sets a non-null `shareToken` at all.

**Demo.** A member creates a link, opens it in a private window, and stops it; the link then returns 404. An admin playground save on that member's row creates no token.

**Done when.**
- [ ] No code path except `enableWrappedShareLink` sets `shareToken`, and the grep test enforces it.
- [ ] Generation and `savePlaygroundWrapped` mint no token and keep any existing one.
- [ ] Members can create and stop a link, and owners of surviving tokens can stop theirs.

### Step P0.20: Strip stored rosters, Rewind LLM text and legacy visits

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-10-21 to 2026-10-22. **Depends on:** P0.9.
- **Findings addressed:** RWP-01, GAP-37

**Objective.** Remove every other member's name and watch time from the rows already stored, null the pre-v3 Rewind LLM text that holds rosters, revoke unvisited v2 tokens and scrub the reversible visitor pseudonyms, with a script that is safe to run twice.

**Guidance.**
- **Script.** The pure transforms and the runner live in `lib/wrapped/maintenance/strip-rosters.ts`. The CLI is `scripts/rewind-strip-leaderboards.ts`, run as `npm run rewind:strip-leaderboards` (tsx, `tsconfig.scripts.json`). It is a dry run unless `--apply` is passed, and prints scanned and changed counts per step (`design/rewind-2026-design.md` 6.1):
  1. **Stored data.** Process `PlexWrapped` rows in id-cursor batches of 200. Delete `statistics.leaderboards`, replace a `userName` that is the owner's email or contains `@`, and replace the owner's email in every string value and in the `summary` column. Write only rows that changed, and count unparsable rows.
  2. **LLM text.** Set `prompt` and `response` to null on `LLMUsage` rows with no `chatConversationId`: the Rewind runs, the playground and the prompt tests. Assistant rows keep their text until P11.14. Migration `20261021000000_llmusage_text_nullable` drops NOT NULL on both columns. Make the readers null-safe: `app/admin/llm-usage/[usageId]/page.tsx`, `components/admin/llm-usage/conversation-usage-row.tsx`, `app/api/admin/wrapped/[wrappedId]/versions/route.ts`, and `actions/admin/admin-llm-history.ts`, which shows "Text removed in the October 2026 privacy clean-up".
  3. **Errors.** Any `error` containing "Available users" becomes P0.9's `{"code":"TAUTULLI_USER_NOT_FOUND"}`.
  4. **Tokens.** Legacy visit rows are those with `ipAddress`, `userAgent` or `referer` set, which is every row written before P0.8. While any legacy rows exist, set `shareToken` to null on Rewinds that have no recorded visit and were last written before `--opt-in-since` (when the P0.19 release went live), so a link a member turned on after that is kept even before its first visit.
  5. **Visits.** Clear `ipAddress`, `userAgent` and `referer` on the legacy visit rows and keep the rows (as merged; the plan first said delete them). That meets GAP-37, keeps the admin visit counts, and lets a later run still see those links as visited. Steps 4 and 5 share one `$transaction`, with step 4 first, and run before steps 1 and 3, whose writes would move `updatedAt` past the cutoff. New visits carry none of those fields, so a second run reports 0 for both, which makes the script idempotent without a marker.
- **Operator path** (an owner calendar item on 2026-10-23).
  - Run it only after the release that carries P0.8 and P0.19 is deployed. Before that, the old code keeps writing leaderboards and legacy visit rows and keeps minting tokens, so step 4 would revoke tokens again on every later run.
  - Run `--apply` soon after that release, with its go-live time as `--opt-in-since`, before admins regenerate Rewinds. Nothing records which tokens a member turned on, so step 4 keeps an auto-minted, never-visited token on any row written after that time: an admin regeneration, a failed-row retry through the claim, or a playground save. Before `--apply`, list such rows (`SELECT id, "userId", year, "updatedAt" FROM "PlexWrapped" WHERE "shareToken" IS NOT NULL AND "updatedAt" >= '<opt-in-since>' AND NOT EXISTS (SELECT 1 FROM "WrappedShareVisit" v WHERE v."wrappedId" = "PlexWrapped".id);`) and compare them with the `SHARE_LINK_CREATED` audit lines in the server logs; null any token without one by hand. A `shareTokenCreatedAt` that only `enableWrappedShareLink` sets would close this, and is not built.
  - Run two dry runs a few minutes apart. The counts must be stable, which shows that no running code still writes rosters, legacy visits or tokens.
  - Take the dump (Phase 0 day-0 rule 3). It holds the rosters being purged, so it is encrypted, kept off the host and deleted after 30 days.
  - Run from a checkout, or from the Dockerfile `dev` target, against the production `DATABASE_URL`; the runtime image has no `scripts/` and no tsx. Paste the dry-run counts into the PR, run `--apply`, then run once more to show zeros.

**Tests.**
- `lib/wrapped/maintenance/__tests__/strip-rosters.test.ts` covers the pure transforms.
- New `scripts/__tests__/rewind-strip-leaderboards.pg.test.ts` (`@jest-environment node`) runs only when `TEST_DATABASE_URL` passes `assertTestDatabaseUrl` (P0.4); P1.5's integration job sets it and makes the test fail rather than skip when it is missing in CI. It seeds v1 and v2 rows, chat and non-chat LLMUsage rows, an "Available users" error, and two tokens of which one has a visit. It checks that the dry run reports counts and changes nothing, then runs `--apply` twice and checks that the second run reports zeros and leaves the rows byte-identical.

**Integration.**
- Add the npm script. The `llmusage_text_nullable` migration runs on deploy.
- P2.1's parser leaves this script's transform as the one loose parse. P9.1 reruns the dry run weekly in December.

**Demo.** Run a dry run on a copy of production, then `--apply`, then a second run that prints zeros. The admin LLM history shows the clean-up notice on a stripped row.

**Done when.**
- [ ] The script is a dry run by default and reports counts per step, and the Postgres test proves a second run is a no-op.
- [ ] It ran in production after the P0.8 and P0.19 release, with stable dry-run counts recorded in the PR.
- [ ] No stored row has leaderboards or an email as a name, pre-v3 Rewind LLMUsage text is null, and no "Available users" error remains.
- [ ] Unvisited v2 tokens on Rewinds last written before `--opt-in-since` are revoked, any later auto-minted token was checked by hand, and legacy visits are scrubbed of IP hash, user agent and referer and kept.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P0.9: Typed error when the Tautulli match fails

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-19 to 2026-10-19. **Depends on:** none.
- **Findings addressed:** RWP-02, SEC-17, DUP-01

**Objective.** Replace the error string that lists every Tautulli username and email with a typed code. Use one shared lookup that matches on identifiers instead of email.

**Guidance.**
- In `lib/connections/tautulli.ts`, next to the existing `getTautulliUsers`:
  - `matchTautulliUser(users, identity: { plexUserId: string })` is pure. It matches `String(u.user_id) === plexUserId` only, because Tautulli's `user_id` is the plex.tv account ID. It never matches on username, email or `friendly_name` (as merged: the planned case-insensitive `plexUsername` fallback was dropped, because a username can be a stale row after a rename or someone else's, and matching it would hand that person's watch history to the member).
  - `findTautulliUser(config, identity)` returns `{ ok: true, user } | { ok: false, code: 'TAUTULLI_USER_NOT_FOUND' | 'TAUTULLI_ERROR' }`. It parses the `get_users` rows with a small Zod schema (`user_id` number, `username` optional). On a miss it logs `logger.warn('Tautulli user not found', { plexUserId, candidates: users.length })`, a count only.
- `fetchTautulliStatistics` (`lib/wrapped/tautulli-user-statistics.ts:25`):
  - The new signature is `(config, identity, year)`.
  - Delete the email and `friendly_name` matching (lines 75-101) and the "Available users" string (103-112).
  - On a miss, return `{ success: false, code, error: memberErrorCopy(code) }`.
  - Update its callers: `actions/wrapped-generation.ts:177`, `app/api/admin/playground/statistics/route.ts:86`, `lib/discord/commands/mystats.ts:148` and `lib/discord/role-metadata.ts:124`.
- `getUserFirstWatchDate` (`actions/user-queries.ts:527`) and the chatbot executor (`actions/chatbot/executors/tautulli.ts:54`) use the shared matcher, which removes the third copy.
- New `lib/wrapped/generation-errors.ts` holds:
  - `RewindErrorCode`, with `'TAUTULLI_USER_NOT_FOUND'` and `'GENERATION_FAILED'`;
  - `toStoredError(code)`, which writes `{"code":"..."}` to `PlexWrapped.error`;
  - `readStoredError(error)`, which reads legacy free text as `GENERATION_FAILED`;
  - `memberErrorCopy(code)`. For `TAUTULLI_USER_NOT_FOUND` the copy is "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list."
- Wiring:
  - `generatePlexWrapped` stores `toStoredError(code)` when `tautulliStats.code` is set, and returns `{ success: false, code, error: memberErrorCopy(code) }`. Other failures keep their message in the logs.
  - Member surfaces render copy from `readStoredError()`: the failed state of `app/(app)/wrapped/page.tsx:75` and the poll toast of `components/dashboard/wrapped-card.tsx:118`.
  - The admin view `app/admin/users/[userId]/wrapped/page.tsx:145` shows the code plus the admin-only hint "Plex user <plexUserId> is not in Tautulli's user list. Refresh users in Tautulli."

**Tests.**
- New `__tests__/lib/connections/tautulli-user-match.test.ts`:
  - matches by `user_id` only, and a row whose username equals the member's never matches;
  - never matches when only another member's email or `friendly_name` equals the identity;
  - returns null on a miss.
- New `lib/wrapped/__tests__/tautulli-user-statistics.test.ts` takes a three-member roster fixture with usernames and emails. On a miss, `JSON.stringify(result)` contains none of the roster's usernames or emails.
- `__tests__/actions/wrapped-generation-action.test.ts`: on a miss, the `PlexWrapped.error` write is `{"code":"TAUTULLI_USER_NOT_FOUND"}`, the returned error is the member copy, and neither contains roster strings.
- `__tests__/actions/user-queries.test.ts` moves `getUserFirstWatchDate` to identity matching.

**Integration.**
- P0.20's script step 3 writes this format, and P0.17 reuses `findTautulliUser`.
- P2.3 folds the lookup into the single Tautulli client, P2.17 moves the code to `RewindGeneration.error`, and P3.8 generalises the copy map into `lib/ui/error-copy.ts`.

**Demo.** Generate for a test member whose Plex ID is missing from Tautulli. The toast shows the copy, `SELECT error FROM "PlexWrapped"` shows the code, the server log shows a candidate count only, and the admin page shows the hint.

**Done when.**
- [ ] One shared matcher serves the stats, first-watch, chatbot and Discord paths, and the email and `friendly_name` matching is gone.
- [ ] A miss stores `{ code: 'TAUTULLI_USER_NOT_FOUND' }`, members see fixed copy, and admins see the hint.
- [ ] Tests assert that no other member's username or email appears in any output.

### Step P0.10: Redis-backed rate limiter with namespaced keys and trusted proxy hops

- **Track:** security. **Lane:** hardening. **Effort:** M. **Window:** 2026-10-21 to 2026-10-22. **Depends on:** none.
- **Findings addressed:** SEC-25, BP-23, SEC-24

**Objective.** Replace the single in-memory, unnamespaced, spoofable limiter with one that holds across processes, keeps features apart and finds the real client IP. Then put limits on the unauthenticated sign-in and invite paths.

**Guidance.**
- Add an exact-pinned `rate-limiter-flexible` and rewrite `lib/security/rate-limit.ts` (`server-only`):
  - **Limits.** A `LIMITS` table maps each name to `{ points, duration }`, and the name doubles as the key prefix. Existing limits keep their numbers: `share` 100/15 min, `poster` 500/15 min, `admin` 50/15 min, `checkout`, `portal` and `discord-link`. New: `auth:plex` 20/15 min per IP, `auth:jellyfin:ip` 10/15 min, `auth:jellyfin:user` 5/15 min per lowercased username, `invite:validate` 20/15 min, `invite:redeem` 10/15 min, `plex:pin:create` 30/10 min and `plex:pin:poll` 300/10 min. Rewind names start with `rw:`, as in `design/rewind-2026-design.md` 9.4.
  - **Store.** With `REDIS_URL` set, each name gets a `RateLimiterRedis` with `keyPrefix: name` and an `insuranceLimiter: new RateLimiterMemory({ ...sameLimits, keyPrefix: name })`. They share a dedicated ioredis client, `new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true })`; do not reuse the BullMQ connection in `lib/queue/connection.ts`, whose `maxRetriesPerRequest: null` would hang requests while Redis is down. Without `REDIS_URL`, `RateLimiterMemory` uses the same prefixes, so the keys are identical either way.
  - **API.** `consume(name, subject)` returns `{ ok: true } | { ok: false; retryAfterSec }`, and `reward(name, subject)` refunds a point. `limitRequest(name, request)` returns `NextResponse | null`, a 429 with `Retry-After`, keyed by `clientIp(request.headers)`. `actionClientIp()` reads `await headers()` for Server Actions.
  - **`clientIp(headers)`.** Split `X-Forwarded-For` on commas, trim and drop empty entries. With `N = TRUSTED_PROXY_HOPS` (an integer, default 1) and at least N entries, return `entries[entries.length - N]`, the address the outermost trusted proxy saw. Entries to its left are client-supplied and ignored. Otherwise fall back to `x-real-ip`, then `"unknown"`.
    - Document a worked example in the JSDoc: a client sends `6.6.6.6`, Traefik appends `203.0.113.7`, and with hops 1 the result is `203.0.113.7`. `N = 0` is best-effort for installs with no proxy.
- **Apply the limits:**
  - `app/api/auth/[...nextauth]/route.ts` wraps POST. `/api/auth/callback/plex` maps to `auth:plex` and `/api/auth/callback/jellyfin` to `auth:jellyfin:ip`. When limited, it returns status 429 with the JSON `{ url: "<NEXTAUTH_URL>/api/auth/error?error=RateLimited" }`. next-auth's client `signIn()` parses `data.url` and throws on a body without one.
  - The Jellyfin `authorize` calls `consume('auth:jellyfin:user', username.toLowerCase())` before contacting Jellyfin, and throws `Error('RATE_LIMITED')`, re-thrown like `NO_SERVER_CONFIGURED`.
  - In `actions/invite.ts`, `validateInvite` uses `invite:validate`, and `processInvite` and `processJellyfinInvite` use `invite:redeem`, all keyed by IP. They return `{ success: false, code: 'RATE_LIMITED', error }`.
  - `lib/plex-auth.ts` `createPlexPin` and `getPlexAuthToken` return typed `RATE_LIMITED` results, and `components/auth/plex-sign-in-button.tsx` and `callback-client.tsx` show the copy.
- **Migrate the callers.** The share, OG, poster and admin routes move to `limitRequest()`, and the `checkRateLimit` callers (`app/(app)/discord/connect/route.ts`, `actions/subscription.ts`) move to `await consume()`. The Stripe webhook drops its pre-signature IP limiter, because spoofed Stripe IPs could otherwise get real deliveries rejected with 429, and the signature is the gate. Delete the `Map`, the `setInterval` sweep and the `rateLimit()` factory.
- Docs: `example.env` gets `TRUSTED_PROXY_HOPS=1` with an explanation, and the README's deployment section gets a reverse-proxy note. Raw IPs live only in Redis keys, and P4.16 masks them in logs.

**Tests.**
- New `__tests__/lib/security/client-ip.test.ts` covers hops 0, 1 and 2, spoofed leftmost values that land in one bucket, a short header falling back to `x-real-ip`, and garbage entries.
- `__tests__/lib/security/rate-limit.test.ts` (rewritten): the memory store is used when `REDIS_URL` is unset; 100 `share` hits leave `admin` untouched; the 429 has the right shape and `Retry-After`, and `reward` refunds; a stub Redis client whose commands reject falls back to the insurance store without throwing.
- New `__tests__/lib/security/rate-limit.redis.test.ts` runs when `TEST_REDIS_URL` is set. Two limiter instances share counts, and keys appear as `share:<ip>`. The CI unit job gains a Redis service.
- New `__tests__/api/nextauth-route-rate-limit.test.ts`: the 11th Jellyfin callback from one IP returns 429 with `error=RateLimited` in `url` while another IP passes, and the per-username limit holds across IPs.
- `actions/__tests__/invite.test.ts` covers the rate-limited branches. The route tests that mock `posterRateLimiter` and friends now mock `limitRequest`.

**Integration.**
- P0.11, P0.12, P4.8 and P4.20 add their own limit names.
- This builds the planned answer to the open decision "Rate limits without Redis", which is the in-process fallback. If the owner chooses to require Redis instead, `consume()` refuses when `REDIS_URL` is unset, and the rest of the step is unchanged.

**Demo.**
- Through the proxy, two curl loops with different spoofed leftmost XFF values drain one bucket.
- Opening a Rewind and then the admin console no longer returns 429s.
- The 6th wrong Jellyfin password for one username returns "Too many attempts".
- Two app processes on one Redis share counts.

**Done when.**
- [ ] The limiter runs on `rate-limiter-flexible`, with Redis and an in-process insurance store using the same keys.
- [ ] Keys are namespaced, and the client IP comes from `TRUSTED_PROXY_HOPS`.
- [ ] Both NextAuth credential callbacks, the Jellyfin username, invite validation and redemption, and PIN create and poll are limited.
- [ ] Every old caller is migrated, the `Map` is gone, and the webhook has no IP limit.
- [ ] The spoofing, isolation and two-store tests pass, and the docs are updated.

### Step P0.11: Share page reads the database directly

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-23 to 2026-10-23. **Depends on:** P0.8, P0.10.
- **Findings addressed:** RWP-09, SEC-26, RWV-05, BP-23

**Objective.** Stop the share page from fetching its own API, which puts every visitor in one rate-limit bucket, counts each view twice, and turns a 429 into a 404. Read the row once per request through the projection (FR-49).

**Guidance.**
- New `lib/wrapped/data/get-share-safe.ts` (`server-only`) exports `getShareSafeRewind = cache(async (token: string) => ...)`. React `cache()` makes `generateMetadata` and the page share one lookup per request. It:
  - validates the token with `z.string().regex(/^[A-Za-z0-9_-]{43}$/)`, since `generateShareToken` produces 32 bytes in base64url, and returns null without a DB call for anything else;
  - runs `findUnique({ where: { shareToken }, select: { id, year, status, summary, archetype, data, user: { select: { name: true } } } })`;
  - returns null unless the status is `completed`;
  - returns `{ wrappedId, share: toShareSafeV2(...) }`. `wrappedId` stays on the server.
- Move the page to `app/(public)/wrapped/share/[token]/page.tsx`. The URL is unchanged, and the page is now outside the `(app)` guards, so signed-in friends with unfinished onboarding or a lapsed subscription are no longer redirected (RWV-05).
  - Delete the old file and its `getBaseUrl()` self-fetch.
  - Wrap the content in `<main>`, which `app/(app)/wrapped/layout.tsx` used to provide.
- In the page body only, not in `generateMetadata`:
  - `consume('rw:share-page', clientIp(await headers()))` at 60 per minute per IP (`design/rewind-2026-design.md` 9.4). When limited, render "This page is busy. Try again in a minute." (`data-testid="wrapped-share-busy"`), never a 404.
  - Record the visit with `after(() => prisma.wrappedShareVisit.create({ data: { wrappedId } }))` from `next/server`. That is one row per view, with no IP, user agent or referer.
- A null result calls `notFound()`. `generateMetadata` returns a neutral title for null and `robots: { index: false, follow: false }` always.
- The API route and the OG route also call `getShareSafeRewind`. The API route stops recording visits, so a page view counts exactly once. Both keep their IP-keyed `share` limit through `limitRequest()`.
- Add `data-testid="wrapped-share-summary"` to the root of `WrappedShareSummary`.

**Tests.**
- New `lib/wrapped/data/__tests__/get-share-safe.test.ts`:
  - a malformed token returns null with no Prisma call;
  - an unknown token, a `generating` row and a revoked (null) token all return null;
  - a valid token returns the projection.
- New `__tests__/app/share-page.test.tsx` renders the server component with mocked `headers()`, `after()` (run at once) and `notFound`:
  - IP A's 61st view renders the busy state while IP B still renders;
  - each render creates exactly one visit;
  - an unknown token calls `notFound`.
- `e2e/public-flows.spec.ts` seeds a completed row with a token through `createE2EPrismaClient`:
  - the share page renders (`wrapped-share-summary`) for a logged-out visitor and for a signed-in member with onboarding incomplete;
  - a bad token's `page.goto` response has status 404.

**Integration.**
- Uses P0.8's projection and P0.10's limiter.
- P5.1 later redirects `/wrapped/share/:token` to `/rewind/s/:token`, and P7.5 replaces this page with the v3 share page that also serves surviving v2 tokens.

**Demo.**
- 200 page loads from four client IPs through the proxy all render, and `SELECT count(*) FROM "WrappedShareVisit"` rises by exactly 200.
- A revoked token shows the 404 page.
- The page still renders when the container cannot reach its own public URL.

**Done when.**
- [ ] No server-side self-fetch remains, and `getShareSafeRewind` with `cache()` serves the metadata, the page, the API and the OG route.
- [ ] Visitors are limited by their own IP and see a busy state instead of a 404.
- [ ] Each view records exactly one visit, with no personal fields.
- [ ] Unknown or revoked tokens return 404, and the page sits outside the `(app)` guards.
- [ ] The unit, page and E2E tests pass.

### Step P0.12: Generation guardrails on the v2 action

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-23 to 2026-10-23. **Depends on:** P0.10.
- **Findings addressed:** SEC-22, RWP-12

**Objective.** Stop members from starting unbounded, concurrent, paid generations for any year. Allow one run at a time per member and year, cap how often members can run, restrict the year, and check entitlement.

**Guidance.** In `generatePlexWrapped` (`actions/wrapped-generation.ts:35`):
- Remove the `year = new Date().getFullYear()` default; every caller passes the season year.
- Run the checks in this order:
  1. Session, then `getWrappedSettings()` for `wrappedEnabled` and `wrappedYear`. P0.14 makes `wrappedYear` season-aware.
  2. Zod: `z.object({ userId: userIdSchema, year: z.literal(wrappedYear) })`, with the message "Rewind is only available for <year>".
  3. The user exists, and ownership: non-admins act only on their own row.
  4. When Stripe is on, `getAccessGateStatus(userId)` from `lib/access.ts`; a refusal returns `{ code: 'NOT_ENTITLED' }`. Admins pass, because `isAccessAllowed` treats them as entitled.
  5. The existing rule that only admins regenerate a completed row.
  6. For non-admins, `consume('rw:gen:burst', userId)` at 1 per 600 s and `consume('rw:gen:daily', userId)` at 3 per 86 400 s, added to `LIMITS` (`design/rewind-2026-design.md` 9.3, 9.4). A refusal returns `{ code: 'RATE_LIMITED', retryAfterSec }`.
  7. The claim.
- **Single-flight claim.**
  - Make sure the row exists with `createMany({ data: [{ userId, year, status: 'pending', data: '{}' }], skipDuplicates: true })`.
  - Then `claimedAt = new Date()` and `updateMany({ where: { userId, year, OR: [{ status: { not: 'generating' } }, { updatedAt: { lt: <claimedAt minus 15 min> } }] }, data: { status: 'generating', error: null, updatedAt: claimedAt } })`.
  - A count of 0 returns `{ code: 'ALREADY_GENERATING' }` and refunds the points with `reward()`.
- **Compare-and-set writes.** The completed write and both failure writes use `updateMany({ where: { id, status: 'generating', updatedAt: claimedAt } })`. A count of 0 means a stale takeover happened: log it and discard this run's result instead of overwriting the newer run.
  - This relies on Prisma writing an explicitly passed `@updatedAt` value, and on nothing else updating the row mid-run, which is true today.
- Map the codes to copy in `components/dashboard/wrapped-card.tsx` and `components/admin/users/regenerate-wrapped-button.tsx`, for example "Your Rewind is already being made" and "You can try again in N minutes".
- Pitfall: generation still runs inside the request, and P2.17 moves it to BullMQ with `RewindGeneration` rows and the per-member lock. The 15-minute stale window matches `REWIND_STALE_SWEEP`.

**Tests.**
- In `__tests__/actions/wrapped-generation-action.test.ts`, `__tests__/security/user-wrapped-generation.test.ts` and `__tests__/security/wrapped-regeneration.test.ts`:
  - **Out of range.** A member asking for 2025, 2027 or 2100 gets a validation error, with no Prisma write and no LLM call.
  - **Parallel.** `Promise.all` over five calls, with `updateMany` resolving count 1 and then 0, makes exactly one LLM call; the others return `ALREADY_GENERATING` and their points are refunded.
  - **Stale.** A `generating` row whose `updatedAt` is 16 minutes old is reclaimed.
  - **Rate limit.** A second run within 10 minutes is refused, as is a fourth run in one day. Admins are exempt.
  - **Entitlement.** With Stripe on and the member not entitled, the result is `NOT_ENTITLED` with no claim. With Stripe off, the run is allowed.
  - **Compare-and-set.** A final write that matches 0 rows leaves the row untouched.
- New `actions/__tests__/wrapped-generation-claim.pg.test.ts`, gated like P0.20's Postgres test, fires ten concurrent claims at a real Postgres and checks that exactly one wins.

**Integration.**
- Uses P0.10's limiter and the season year from `getWrappedSettings()`.
- P0.17 adds its eligibility gate before step 6. P2.17 replaces the claim with the queue, and P4.5 extends entitlement to the other paid paths.

**Demo.**
- Two tabs click Generate at the same moment. One run starts, and the other tab shows "already being made".
- A direct action call with year 2027 is refused, and a fourth run in a day is refused.

**Done when.**
- [ ] The year is restricted by Zod to the configured season year.
- [ ] One run per member and year, with a 15-minute stale takeover and compare-and-set final writes.
- [ ] Members are limited to 1 run per 10 minutes and 3 per day through the new limiter, and admins are exempt.
- [ ] Entitlement is checked when Stripe is on.
- [ ] The parallel and out-of-range tests pass.

### Step P0.13: LLM stop-gaps for current models

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-20 to 2026-10-20. **Depends on:** none.
- **Findings addressed:** RWP-15, RWP-22, DUP-04, SEC-44

**Objective.** Keep v2 generation and the assistant working on current OpenAI models with one shared parameter module instead of two copies that disagree. Make the cost records honest, and stop sending a member's email to the model.

**Guidance.**
- New `lib/llm/openai-params.ts` (about 120 lines):
  - `openAIModelCaps(model)` lowercases the ID and strips an `openai/` prefix and any `-YYYY-MM-DD` suffix. Reasoning models, matching `/^(gpt-5|gpt-6|o\d)/`, get `tokenParam: 'max_completion_tokens'` and `acceptsTemperature: false`. `structuredOutputs` covers `/^(gpt-4o|gpt-4\.1|gpt-5|gpt-6|o3|o4)/`. `chatTools` is `'responses-only'` for `gpt-6-astra` and `gpt-6.1-sol`, `'reasoning-none'` for `gpt-6-sol` and `gpt-6-luna`, and `'yes'` for everything else.
  - `buildOpenAIParams(model, { temperature, maxTokens, hasTools })` returns the request fields.
  - `DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini'`. It is current, it is not on any retirement list, and the existing Chat Completions code already handles its structured outputs and tools.
  - The GPT-6 tool rules come from search snippets (`research/llm-and-generative-models-2026.md` section 7, Step 0). Verify them against the API before merging.
- `lib/wrapped/api-calls.ts` and `lib/llm/chat.ts` delete both copies of `requiresMaxCompletionTokens` and `supportsStructuredOutputs`, and build the request fields from `buildOpenAIParams`. `callChatLLM` returns a clear error, without calling the API, when a `responses-only` model gets tools: "This model needs the Responses API for tools; choose gpt-6-sol, gpt-6-luna or a GPT-5 model for the assistant." It sends `reasoning_effort: 'none'` with tools on `reasoning-none` models.
- `lib/llm/pricing.ts`:
  - Add `gpt-6-astra` ($10 in, $50 out, $1 cached), `gpt-6.1-sol` ($2, $10, $0.10), `gpt-6-sol` ($2, $10, $0.20) and `gpt-6-luna` ($0.10, $0.50, $0.01), as of 2026-10-17. `calculateCost(model, promptTokens, completionTokens, cachedTokens = 0)` prices cached tokens at `cachedInput`.
  - An unknown or missing model costs 0 and triggers `logger.warn('Unknown model price', { model })` from `createLogger('LLM_PRICING')`, replacing `console.warn`.
  - The callers (`api-calls.ts`, `actions/chatbot/conversation.ts`, `actions/prompt-test.ts`) pass `usage.prompt_tokens_details?.cached_tokens ?? 0`.
- Record the model the API reports: `responseData.model ?? config.model`. Delete the `|| "gpt-4"` fallbacks in `lib/wrapped/llm.ts:134` and `actions/prompt-test.ts`.
- `actions/setup.ts:448` defaults to `DEFAULT_OPENAI_MODEL`. The test-mode model list in `lib/connections/openai.ts:71` becomes `gpt-5.4-mini`, `gpt-6-sol` and `gpt-6-luna`.
- Names. New `lib/wrapped/member-name.ts` exports `memberName(user)`: the trimmed name, or null when it is empty or contains `@`. `generateWrappedWithLLM` (`lib/wrapped/llm.ts:18`) takes `promptName` and `displayName` separately. The prompt and the mock get `memberName(user) ?? 'there'`, and `assembleWrappedData` stores `displayName`, which P0.8 sets.
- **Retirement check, due 2026-10-22.** Run `SELECT purpose, provider, model, "isActive" FROM "LLMProvider";` on production. The 2026-10-23 shutdown list is `gpt-4`/`gpt-4-0613`, `gpt-4-turbo`, `gpt-4.1-nano`, `o1` and `o4-mini`, with `gpt-3.5-turbo` and `o3-mini` per secondary sources, plus `gpt-image-1` for images. If an active model is on it, switch it in admin settings and run one test generation. Record the result in the milestone PR.
- Out of scope: the provider select, effort control and model-list filter (P2.11, P2.12). `LLMProviderForm` still submits a temperature, which is now ignored where it is not accepted.

**Tests.**
- New `__tests__/lib/llm/openai-params.test.ts` is a table over `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, `o4-mini`, `o3`, `gpt-5.4-mini`, `gpt-5.5`, `gpt-4.1-mini`, `gpt-4o` and `openai/gpt-6-sol-2026-09-22`. For each it checks the token parameter, temperature, structured outputs and the tool rule.
- `__tests__/lib/wrapped-api-calls.test.ts`: for `gpt-6.1-sol` with temperature 0.8 and `maxTokens` 6000, the body has `max_completion_tokens: 6000` and `json_schema` and no `temperature`, while `gpt-4o` keeps both `temperature` and `max_tokens`.
- `__tests__/actions/chatbot.test.ts`: tools on `gpt-6.1-sol` return the error with no fetch, and `gpt-6-luna` with tools sends `reasoning_effort: 'none'`.
- `__tests__/lib/wrapped-pricing.test.ts`: the GPT-6 prices, the cached-token maths, and an unknown model costing 0 with a warning.
- `__tests__/actions/wrapped-generation-action.test.ts`: the prompt input never contains the email, and a null name becomes "there".

**Integration.**
- Both OpenAI clients import the module.
- P2.11 replaces it with `lib/llm/models.ts` and deletes `pricing.ts`, carrying over the GPT-6 table and these tests. P2.12 updates the form.
- The retirement check is part of the 2026-10-24 milestone.

**Demo.**
- Point the Rewind provider at `gpt-6-luna` and generate for a test member. It succeeds, and the `LLMUsage` row shows the served model and a non-GPT-4 cost.
- The assistant on `gpt-5.4-mini` answers a tool question.

**Done when.**
- [ ] `lib/llm/openai-params.ts` is shared by both clients, and the duplicate checks are deleted.
- [ ] No `temperature` is sent to `gpt-5`, `gpt-6` or o-series models, and the GPT-6 and o4 rules are covered by tests.
- [ ] The GPT-6 prices are added, unknown models cost 0 with a warning, and cached tokens are priced.
- [ ] Setup defaults to a current model, and no `gpt-4` fallback remains.
- [ ] The member's name, or "there", is sent instead of an email.
- [ ] The retirement check is recorded before 2026-10-23.

### Step P0.14: Resolve the Rewind year from data, not the calendar

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-21 to 2026-10-21. **Depends on:** none.
- **Findings addressed:** RWP-04, RWV-02, UI-02

**Objective.** End the January loop in which the card says the 2026 Rewind is ready and `/wrapped` says no 2027 Rewind exists. Members can open any of their past years.

**Guidance.**
- New `lib/wrapped/season.ts` (`server-only`):
  - `getSeasonYear(now = new Date())` returns the year of `Config.wrappedGenerationStartDate` when it is set. Otherwise it returns the calendar year, minus one in January, because the season closes on 31 January (`design/rewind-2026-design.md` 7.7).
  - `getLatestCompletedRewindYear(userId)` runs `findFirst({ where: { userId, status: 'completed' }, orderBy: { year: 'desc' }, select: { year: true } })`.
  - `getWrappedSettings()` (`actions/admin/admin-config.ts:73-77`) returns `wrappedYear: await getSeasonYear()`, so the card, admin and P0.12 all agree.
  - Server-zone handling and month-day season dates come in P2.2. Until then a start date saved in an earlier year still wins; document that in the settings form help text.
- `app/(app)/wrapped/page.tsx` becomes a resolver. It calls `redirect('/wrapped/' + year)`, where `year` is `getLatestCompletedRewindYear()` or else `getSeasonYear()`.
- New `app/(app)/wrapped/[year]/page.tsx`:
  - It parses the parameter with `z.coerce.number().int().min(2010).max(2100)` and calls `notFound()` when that fails.
  - It loads `getUserPlexWrapped(session.user.id, year)`; the ownership check is already inside.
  - It renders a new server component, `components/wrapped/wrapped-year-view.tsx`, extracted from today's completed, generating, failed and none branches with `year` in place of `currentYear`.
  - The empty state for a past year reads "You don't have a Rewind for <year>." and links to the latest year.
  - A small "Your Rewinds" link row (`data-testid="wrapped-year-links"`) lists the member's completed years.
  - The static `share` segment from P0.11 does not collide with `[year]`.
- `components/dashboard/wrapped-card.tsx` links to and pushes `/wrapped/<wrappedYear>` (lines 114 and 272) instead of `/wrapped`. `WrappedPageClient` takes the year from the route.
- Admin:
  - `RegenerateWrappedButton` drops its calendar default and requires `year`.
  - `app/admin/users/page.tsx:10` and `app/admin/users/[userId]/page.tsx:34` use `getSeasonYear()` and pass it down to `user-actions-menu.tsx:156`.
  - `getUserPlexWrapped` (`actions/user-queries.ts:28`) loses its calendar default, so `year` is required.

**Tests.**
- New `__tests__/lib/wrapped/season.test.ts`, using `jest.useFakeTimers().setSystemTime`:
  - on 2027-01-02, a start date of 2026-12-01 gives 2026, and no window gives 2026;
  - on 2026-10-18, no window gives 2026;
  - a stale 2025-11-20 start date gives 2025, which documents the P2.2 limitation.
- Page tests:
  - `/wrapped` redirects to 2026 when a completed 2026 row exists and 2027 has none;
  - `[year]` with `abc` calls `notFound`;
  - another member's year is not returned.
- New `e2e/rewind-year.spec.ts`:
  - Seed completed 2025 and 2026 rows for the regular user, none for 2027, and `Config.wrappedGenerationStartDate = 2026-12-01`.
  - Call `page.clock.setFixedTime(new Date('2027-01-02T12:00:00Z'))` and sign in.
  - `/wrapped` lands on `/wrapped/2026` with `getByTestId('wrapped-viewer')` visible; add the test ID to the viewer root if it is missing.
  - `/wrapped/2025` opens; `/wrapped/2019` shows `no-wrapped-found` with a link to the latest year; and `/wrapped/1999`, outside the accepted 2010-2100 range, answers 404 with `wrapped-year-not-found` (as merged; the status comes from `proxy.ts`, because `app/loading.tsx` streams every page).
  - With no window and only a completed 2025 row, `/wrapped` lands on `/wrapped/2025` while the server's calendar year is 2026, which a redirect to the calendar year would fail (added in Phase 0's review).
  - Pitfall: `page.clock` moves only the browser clock. The server picks the year from data, which is what the test proves, and the Jest test covers the server's January fallback.

**Integration.**
- P0.12 reads the season year through `getWrappedSettings()`.
- P5.1 adds `/rewind` and `/rewind/[year]` and redirects `/wrapped/*`, P2.2 replaces the date columns, and P6.9's `RewindCard` reuses `getLatestCompletedRewindYear`.

**Demo.** Run the E2E spec. With a completed 2026 row, `/wrapped` opens `/wrapped/2026`, and the card's View link goes to the same URL.

**Done when.**
- [ ] `/wrapped` opens the member's latest completed year, or the season year when none exists.
- [ ] `/wrapped/[year]` opens any of the member's past years, and an invalid year returns 404.
- [ ] The dashboard card, admin Regenerate and the admin user pages use the configured season year, and no calendar default remains in these paths.
- [ ] The Jest season tests and the 2027-01-02 E2E test pass.

### Step P0.15: Correct the Overseerr request status mapping

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-26 to 2026-10-26. **Depends on:** none.
- **Findings addressed:** RWP-06

**Objective.** Count Overseerr requests the way the API defines them, find the member beyond the first 10 Overseerr users, and stop crediting other people's requests to the member.

**Guidance.**
- `lib/wrapped/overseerr-statistics.ts`:
  - The new signature is `fetchOverseerrStatistics(config, identity: { plexUserId: string | null; email: string | null }, year)`. Update `actions/wrapped-generation.ts:229` and `app/api/admin/playground/statistics/route.ts:140`.
  - Validate at the boundary with Zod schemas in `lib/validations/overseerr.ts`, all `.passthrough()`:
    - user pages: `pageInfo { pages, page, results }`, then `results[{ id, email?, plexId?: number | null }]`;
    - request pages: `results[{ id, status: 1-5, type: 'movie' | 'tv', createdAt, requestedBy: { id } | null, media: { status, tmdbId? } }]`.
  - Find the user by paging `/api/v1/user?take=100&skip=<n>` until `pageInfo.page >= pageInfo.pages`, capped at 50 pages. Match `plexId === Number(plexUserId)` first, then email in any case. Overseerr's `plexId` is a number, while `User.plexUserId` is a string.
  - Delete the email fallback at lines 123-126, which credited every request with no requester to the member. An unmatched member gets zeros.
  - Server-wide request paging stays (`take=100&skip=…&sort=added&filter=all`) and stops when a page has fewer than `take` results. Per-member `requestedBy` paging is P2.4.
  - Add the enums `MediaRequestStatus { PENDING = 1, APPROVED, DECLINED, FAILED, COMPLETED }` and `MediaStatus { …, PARTIALLY_AVAILABLE = 4, AVAILABLE = 5 }`. Then:
    - `pendingRequests` counts status 1, and `approvedRequests` counts 2 or 5;
    - declined (3) and failed (4) count as neither approved nor available;
    - the new optional `availableRequests` counts `media.status === 5`, or 4 for `type === 'tv'`;
    - values above 5 (Seerr's 6, blocklisted, and 7, deleted) count as not available.
  - Delete the `req.media.genres` loop, because that field does not exist; return `topRequestedGenres: []` until P2.4 adds the genre lookup. The v2 "Favored Genres" block already hides when the list is empty.
- Add `availableRequests?: number` to `OverseerrStatisticsData` (`lib/wrapped/statistics-types.ts:82`) and to `WrappedStatistics.overseerrStats` (`types/wrapped.ts:100`).
- The UTC year window stays until P2.2 and P2.4.

**Tests.**
- New `lib/wrapped/__tests__/overseerr-statistics.test.ts` uses fixtures in `lib/wrapped/__tests__/fixtures/overseerr-users-p1.json`, `-p2.json` and `overseerr-requests.json`. They carry the real field names: `pageInfo`, `results`, `requestedBy.id`, `media.status` and `type`.
  - The member is found on page 2 of `/user`, and the fetch URLs carry `take=100&skip=100`.
  - Statuses 1 to 5 give pending 1 and approved 2. Declined and failed are excluded, TV with media status 4 counts as available while a movie with 4 does not, and media statuses 6 and 7 are not available.
  - An unmatched member gets zeros, and requests with no requester are not credited.
  - A response missing `results` fails validation and returns `success: false`.

**Integration.**
- The v2 Overseerr section (`components/wrapped/wrapped-sections/cinematic/overseerr-stats-section.tsx:104`) now shows a correct `approvedRequests`.
- P2.4's `sources/overseerr-requests.ts` replaces this module, and P7.2's Requests page uses the same mapping (`design/rewind-2026-design.md` 7.2).

**Demo.** Take a test member with one pending, one approved, one declined and one completed-and-available request. The playground statistics route reports pending 1, approved 2 and available 1, and these match the Overseerr UI.

**Done when.**
- [ ] Request statuses use the enums, approved is 2 or 5, and declined and failed are excluded.
- [ ] Availability comes from `media.status`.
- [ ] `/user` is paged with `take` and `skip`, the match is by `plexId` then email, and the loose fallback is gone.
- [ ] Zod validates the responses, and the fixture tests with real field names pass.

### Step P0.16: Poster proxy: private caching, access check, fast 404

- **Track:** security. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-26 to 2026-10-26. **Depends on:** none.
- **Findings addressed:** SEC-21

**Objective.** Stop shared caches from serving session-gated posters to anonymous requests, and stop any session from fetching any library item. Fail fast, so that slides fall back to text at once.

**Guidance.** In `app/api/wrapped/poster/[ratingKey]/route.ts`:
- **Caching.**
  - Session responses send `Cache-Control: private, max-age=86400`.
  - Share-token responses keep `public, max-age=86400` and add `X-Robots-Tag: noindex`.
  - 404s send `private, max-age=60`.
- **Session access.** A session is allowed when one of these holds:
  1. The viewer is an admin, or is the owner (`user.plexUserId === plexServer.adminPlexUserId`).
  2. The `ratingKey` is among the `topMovies` or `topShows` of the viewer's own `PlexWrapped` rows: one query, with the set cached per user for 10 minutes. This covers every v2 viewer request without contacting Plex.
  3. The item's library section is shared with the viewer (`design/ui-design-system.md` 3.11; `design/rewind-2026-design.md` 5.8).

  Anything else returns 404, not 403, so the route is not an existence oracle.
- For check 3, new `lib/connections/plex-shared-sections.ts`:
  - `getSharedSectionKeys(server, plexUserId)` calls `GET https://plex.tv/api/servers/<machineIdentifier>/shared_servers` with the owner token. The machine identifier comes from the existing `getPlexServerIdentity`. It parses the XML with `fast-xml-parser`, finds the `SharedServer` whose `userID` matches, and collects `Section[shared="1"].key`. `allLibraries="1"` returns `'all'`. The result is cached for 10 minutes.
  - `getItemSectionKey(server, ratingKey)` calls `GET <server.url>/library/metadata/<ratingKey>` with `Accept: application/json` and reads `MediaContainer.librarySectionID`. The result is cached for 24 hours.
  - Both responses are Zod-validated. If plex.tv is unreachable, the check denies: other keys get 404, while the viewer's own keys still load.
- **Fast 404.**
  - The upstream timeout drops from 10 s to 3 s.
  - Timeouts, network errors and a Plex 404 all return 404, never 500.
  - An in-process negative cache, five minutes per `ratingKey`, answers repeat misses without contacting Plex.
  - Cache each share token's allowed key set for five minutes too, so a share view no longer runs `JSON.parse` on the whole row for each poster.
- `components/wrapped/cinematic/poster-image.tsx` already hides the image on error, so the slide degrades to text with no client change.

**Tests.**
- `__tests__/api/wrapped-poster-route.test.ts`:
  - an admin session gets 200 with `private`;
  - a member gets 200 for an own-Rewind key, 200 for a key in a shared section and 404 for a key in an unshared section;
  - when plex.tv fails, a non-own key gets 404;
  - a valid share token gets `public` with noindex, and an invalid token is refused;
  - a fetch rejecting with an `AbortError` gives 404, not 500;
  - a second miss for the same key makes no fetch.
- New `lib/connections/__tests__/plex-shared-sections.test.ts` parses a recorded `shared_servers` XML fixture with two users, mixed `shared` flags and an `allLibraries` user.

**Integration.**
- Uses P0.10's `poster` limit.
- P2.6's `MediaMetadataCache.librarySectionId` replaces the item lookup, the Rewind poster route in P5.x carries these rules over (`design/rewind-2026-design.md` 5.8), and P10.12's "New on" row depends on check 3.

**Demo.**
- In devtools, an own poster shows `cache-control: private`.
- As a member restricted to some libraries, a poster key from an unshared library returns 404.
- With Plex stopped, poster requests return 404 within 3 s and the slide shows text only.

**Done when.**
- [ ] Session responses are private, and only share-token responses are public, with noindex.
- [ ] Sessions reach only their own Rewind keys or shared sections, while the owner and admins see everything.
- [ ] Plex failures and unknown keys return 404 within 3 s, with a negative cache.
- [ ] Route tests cover every case.

### Step P0.17: Explain Rewind to members without Plex history

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-10-27 to 2026-10-27. **Depends on:** none.
- **Findings addressed:** RWP-08

**Objective.** Members who cannot have a Rewind see an explanation instead of a Generate button that always fails and leaves a failed row behind (FR-48).

**Guidance.**
- New `lib/wrapped/eligibility.ts` (`server-only`) exports `getRewindEligibility(user: { id, plexUserId, name })`, which returns `{ eligible: true } | { eligible: false; reason: 'NO_PLEX_IDENTITY' | 'NO_TAUTULLI_MATCH' }`:
  - no `plexUserId` returns `NO_PLEX_IDENTITY` without a network call;
  - otherwise it calls P0.9's `findTautulliUser` with `{ plexUserId }` (user_id only, as merged), and a miss returns `NO_TAUTULLI_MATCH`;
  - a Tautulli error or a missing Tautulli config fails open as eligible, and generation then reports its own error;
  - results are cached per user for 10 minutes in process.

  Eligibility is keyed on `plexUserId`, never `primaryAuthService`, so a Jellyfin sign-in with a linked Plex identity is eligible (`design/rewind-2026-design.md` FR-48).
- Home page (`app/(app)/page.tsx`):
  - Compute eligibility next to the existing `getUserFirstWatchDate` call. Both go through the same lookup, so Tautulli's `get_users` runs once per render.
  - Pass `rewindEligibility` through `UserDashboard` (`components/dashboard/user-dashboard.tsx:97`) to `WrappedCard`.
- `components/dashboard/wrapped-card.tsx`: after the disabled check and before the six-month check, an ineligible member gets a card (`data-testid="wrapped-card-not-eligible"`). It shows the heading "Rewind <year>" and the exact FR-48 copy, "Rewind needs Plex watch history. Jellyfin support is planned.", with no Generate or View action.
- `generatePlexWrapped` runs the same check after ownership and before P0.12's rate-limit consumption and claim. It returns `{ success: false, code: 'REWIND_NOT_ELIGIBLE', error: <FR-48 copy> }`, and no row is created or flipped to `generating`; today it is (`actions/wrapped-generation.ts:139-175`).

**Tests.**
- New `__tests__/lib/wrapped/eligibility.test.ts`:
  - no `plexUserId` returns `NO_PLEX_IDENTITY` with no fetch;
  - a match is eligible, and a miss returns `NO_TAUTULLI_MATCH`;
  - a Tautulli error is eligible;
  - a Jellyfin-primary user with a `plexUserId` is eligible;
  - a second call within 10 minutes makes no fetch.
- New `components/dashboard/__tests__/wrapped-card.test.tsx`:
  - an ineligible member sees the copy, and no button named "Generate" exists;
  - an eligible member sees the Generate button.
- `__tests__/actions/wrapped-generation-action.test.ts`: a Jellyfin-only user gets `REWIND_NOT_ELIGIBLE`, and neither `createMany` nor `updateMany` is called on `plexWrapped`.

**Integration.**
- Reuses P0.9's lookup and sits before P0.12's limits.
- P6.9's `RewindCard` keeps this as its not-eligible state, P2.4 introduces `WatchHistorySource` for a later Jellyfin source, and P11.10 covers Jellyfin parity.

**Demo.** Sign in as a Jellyfin-only member. The card shows the explanation with no button. A direct action call returns `REWIND_NOT_ELIGIBLE` and creates no `PlexWrapped` row.

**Done when.**
- [ ] Eligibility is decided on the server from `plexUserId` and the Tautulli match.
- [ ] Ineligible members see the FR-48 copy and no generate action.
- [ ] The action refuses ineligible members before writing any row.
- [ ] The eligibility, component and action tests pass.

### Step P0.18: Stop sending plexAuthToken to the admin browser

- **Track:** security. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** none.
- **Findings addressed:** SEC-18, BP-03

**Objective.** The invite pages receive only public user fields, so no invitee's plex.tv account token reaches a client component or a server-action response.

**Guidance.**
- New `lib/dto/user.ts`, importing `Prisma` from `@/lib/generated/prisma/client`:
  - `publicUserSelect = { id: true, name: true, email: true, image: true } satisfies Prisma.UserSelect`;
  - `type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>`;
  - `type InviteWithUsages = Prisma.InviteGetPayload<{ include: { usages: { include: { user: { select: typeof publicUserSelect } } } } }>`.

  A `"use server"` file may export only async functions, so these cannot live in `actions/invite.ts`.
- `actions/invite.ts`:
  - `getInvites` (line 454) and `getInviteDetails` (line 479) use `usages: { include: { user: { select: publicUserSelect } } }`, with `orderBy` kept on the details query.
  - Annotate their return types with `InviteWithUsages`.
- Remove the `@ts-ignore` comments at `components/admin/invites/invites-page-client.tsx:133` and `invite-details-client.tsx:43`, and type the component state with the DTO. Those files read only `name`, `email` and `image` (`invite-details-client.tsx:272-283`).
- Run `grep -rn "user: true" actions app lib` and check the other includes of secret-bearing models. BP-03 found none; record the result in the PR.
- Add a sentence to the `ENCRYPTED_FIELDS` doc comment in `lib/prisma.ts`: nested relation reads are neither decrypted nor filtered, so they must select explicit fields.
- Pitfall: Prisma's global `omit` for `ENCRYPTED_FIELDS` would break the watchlist and Stripe jobs, which read `plexAuthToken`. It is left to P11.1, together with nested decryption.

**Tests.**
- New `__tests__/utils/assert-no-secret-keys.ts` walks any value and fails on keys matching `/token|apikey|secret|password/i`; `shareToken` and `nextToken` are allow-listed.
- `actions/__tests__/invite.test.ts`:
  - assert that `findMany` and `findUnique` receive `select: publicUserSelect` for `usages.user`;
  - with a fake that applies the select to a row that includes `plexAuthToken`, the serialised results of `getInvites` and `getInviteDetails` pass `assertNoSecretKeys` and do not contain the string `plexAuthToken`.
- `components/__tests__/invites-page-client.test.tsx`: the props and state rendered from a mocked `getInvites` pass `assertNoSecretKeys`.

**Integration.**
- The DTO and the helper are reused by P4.3's action-helper tests and P10.1's invite pages.
- P11.1 covers nested decryption, or a global `omit`.

**Demo.** Open `/admin/invites` and an invite's detail page. In devtools, search the server-action responses for `plexAuthToken`; nothing is found, and each usage shows only name, email and image.

**Done when.**
- [ ] Both invite queries select explicit public user fields through the DTO.
- [ ] The `@ts-ignore` comments are gone, and the components are typed with the DTO.
- [ ] A test asserts that the serialised results and props contain no token field.
- [ ] The devtools check is recorded in the PR.
