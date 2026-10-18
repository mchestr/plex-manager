# Issues Backlog: Audit Remediation, UI Refresh and Rewind 2026

This backlog was generated on 2026-10-18 from [`implementation/plan.md`](plan.md), with one item per plan step: 181 items. It is the tracking document that `/create-issues` reads. The plan stays authoritative. If a step changes there, update its item here before creating the issue.

**How to use it with `/create-issues --all`.**

1. Create the labels the repository does not have yet (one time):

   ```bash
   gh label create devops --color 5319E7 --description "CI, Docker, releases and operations"
   gh label create ops --color 0E8A16 --description "Plan track: operations and tooling"
   gh label create platform --color 006B75 --description "Plan track: integrations and platform"
   gh label create rewind --color D93F0B --description "Plan track: Rewind (formerly Wrapped)"
   gh label create ui --color 1D76DB --description "Plan track: UI refresh and design system"
   gh label create admin --color C5DEF5 --description "Admin pages, actions and tooling"
   gh label create jellyfin --color AA5CC3 --description "Jellyfin sign-in and member parity"
   gh label create stripe --color 635BFF --description "Stripe subscriptions"
   gh label create privacy --color B60205 --description "Member data exposure, retention and disclosure"
   gh label create accessibility --color FBCA04 --description "WCAG, keyboard, screen reader and motion"
   gh label create llm --color 0052CC --description "LLM providers, prompts, cost and quotas"
   ```

   These items also use the existing labels `bug`, `database`, `dependencies`, `discord`, `documentation`, `enhancement`, `github-actions`, `observability`, `performance`, `refactor`, `security`, `testing`.
2. Run `/create-issues --all` and give it this file's path, `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/issues-backlog.md`. It creates an issue for every item marked `[READY]` without prompting. An item is `[READY]` when its start date is within two weeks. Today that is the 48 items whose window starts by 2026-10-30, ten working days from Monday 2026-10-19.
3. Each Friday, add `[READY]` to the items whose start date falls within the next two weeks, and run `--all` again. Phases overlap, so go by each item's Window line, not by phase. Alternatively, run `/create-issues <section or keyword>`, for example `/create-issues P2.`, to choose items interactively.
4. Build each issue from its item:
   - **Title:** the heading without `[READY]`, for example "P0.1: Upgrade Next.js, React and next-auth; close the image optimizer".
   - **Labels:** the item's Labels line. The first label comes from the section and the second is the plan track. Add the lane from the Window line as a label too (`lane:rewind`, `lane:ui`, `lane:hardening`, and in January `lane:admin`, `lane:member`, `lane:security-ops`, `lane:platform`), so each lane can be filtered and its two-open-PR limit checked.
   - **Body:** the context, the findings, the acceptance criteria as a checklist, the phase and window, and the plan link. Relative links do not resolve in an issue, so resolve them against `https://github.com/mchestr/plex-manager/blob/main/.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/`.
   - **Depends on:** link each step id to its issue, found in the Completed section. A step without an issue yet stays as its id. The list matches the step's "Depends on" line in the plan; a dependency may merge on the morning of the item's first day.
5. After creating each issue, the command moves the item to the Completed section with `Created: Issue #N` and the link, so the backlog maps each step to its issue. This file's heading for that section is plain `## Completed`, with no emoji.

**Classification.** Security and correctness fixes are Bug Fixes, and Rewind and UI work is New Features unless it is pure refactoring. Season operations (the soft launch, season open, monitoring and the final cut) are DevOps & Infrastructure, and verification passes are Testing. Within a section, items follow plan order. Read the phase header in the plan before starting a step, because it gives the merge order for files that several steps edit.

| Section | Items |
|---|---|
| Bug Fixes (`bug`) | 53 |
| New Features (`enhancement`) | 79 |
| Refactoring & Technical Debt (`refactor`) | 19 |
| Documentation (`documentation`) | 4 |
| Testing (`testing`) | 12 |
| DevOps & Infrastructure (`devops`) | 14 |
| **Total** | **181** (48 marked `[READY]`) |

## Bug Fixes

### [READY] P0.1: Upgrade Next.js, React and next-auth; close the image optimizer

- **Labels:** bug, security, dependencies
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-20 to 2026-10-21 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - SEC-01 (critical): Next.js 16.1.1 is 38 advisories behind, and wildcard `images.remotePatterns` exposes the image optimizer to anonymous callers ([security-audit.md](../research/security-audit.md))
  - BP-01 (critical): Pinned Next.js 16.1.1 plus a wildcard image optimizer exposes an unauthenticated RCE/SSRF path; CI has no security gates ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-07 (low): next-auth v4 is in maintenance; unused `@next-auth/prisma-adapter`; ts-node is stale ([security-audit.md](../research/security-audit.md))
  - SEC-53 (low): The CSP offers almost no XSS protection; some security headers are deprecated or overly broad ([security-audit.md](../research/security-audit.md))
  - BP-05 (medium): Header and viewport config gaps: static unsafe CSP, pinch-zoom disabled, one title for every page, no next/font, dead webpack block ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P0.1 in plan.md](plan.md#step-p01-upgrade-nextjs-react-and-next-auth-close-the-image-optimizer)

**Context.** Move to a Next.js release that is not under the 38 open advisories, and switch off the anonymous image optimizer that makes the RCE, SSRF and disk-fill advisories reachable. The same PR removes the dead build config and the unused auth packages.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `next` is 16.4.2 or later, `eslint-config-next` matches it, `react` and `react-dom` are 19.3.1, and `next-auth` is 4.24.15.
- [ ] `@next-auth/prisma-adapter` and `ts-node` are gone, `tsx` is pinned, and the seed and both register scripts run under tsx.
- [ ] `npm audit --omit=dev` lists no `next`, `next-auth` or `sharp` advisory.
- [ ] `images.unoptimized` is true, no `remotePatterns` remain, and the `webpack` and `turbopack` keys are deleted.
- [ ] The production CSP has no `'unsafe-eval'`, and development keeps it.
- [ ] Build, Jest and E2E are green, and `/_next/image` refuses an external URL.

### [READY] P0.2: Clear the remaining production advisories

- **Labels:** bug, security, dependencies
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-22 to 2026-10-22 (track security, hardening lane, effort S)
- **Depends on:** P0.1
- **Findings addressed:**
  - SEC-06 (low): Remaining production advisories (discord.js/undici/ws, bullmq/uuid, qs, Prisma toolchain) ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.2 in plan.md](plan.md#step-p02-clear-the-remaining-production-advisories)

**Context.** Update the remaining vulnerable production packages, so that `npm audit --omit=dev` reports no high or critical advisory and the critical ones are no longer hidden among the rest. The Discord bot and the queues must keep working.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `npm audit --omit=dev --audit-level=high` exits 0, and its output is in the PR.
- [ ] discord.js, bullmq and the Prisma packages are on their latest in-major versions, and every override is listed with its advisory.
- [ ] `qs` and `@types/qs` are removed, and the Plex auth URL test passes unchanged.
- [ ] Jest is green, and the bot and queue smoke tests are recorded.

### [READY] P0.3: Stop publishing unmerged pull-request code to GHCR

- **Labels:** bug, ops, security, github-actions
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-19 to 2026-10-19 (track ops, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - BP-02 (high): `docker-publish.yml` publishes images built from unmerged PR heads, including forks, to GHCR as `:latest` / `:main` ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-02 (high): Docker publish workflow builds and pushes untrusted PR code as `:latest` and `:main` ([security-audit.md](../research/security-audit.md))
  - SEC-05 (low): CI hardening gaps: a dormant script injection, mutable action tags, and an issue-triage agent driven by untrusted text ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.3 in plan.md](plan.md#step-p03-stop-publishing-unmerged-pull-request-code-to-ghcr)

**Context.** Publish images only from trusted refs, with least-privilege tokens and immutable action references. Remove the dormant injection, and stop untrusted issue text from driving an agent that holds write tools.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `docker-publish.yml` runs only on pushes to main and `v*` tags, and never checks out `workflow_run.head_sha`.
- [ ] `build.yml` has top-level read-only permissions and a no-push `docker-build` job for pull requests.
- [ ] Every third-party action is pinned by SHA.
- [ ] `test-analyze-failure.yml` is deleted, and issue triage runs only for trusted authors with the label tools.
- [ ] The fork-PR demo and the main-push demo are recorded in the PR.

### [READY] P0.4: Guard E2E and the seed against non-test databases

- **Labels:** bug, ops, security, testing, database
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-19 to 2026-10-19 (track ops, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - BP-07 (high): E2E specs wipe whichever database `.env` points at; the setup-wizard `deleteMany` has no test-database guard ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-15 (low): Development and test paths are gated only by `NODE_ENV` (test-token login, `getDevDefaults`, destructive seed) ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.4 in plan.md](plan.md#step-p04-guard-e2e-and-the-seed-against-non-test-databases)

**Context.** Make it impossible for the E2E suite, the setup-wizard spec or the seed to wipe any database other than the dedicated test database. Test-only login and the dev prefill must need an explicit flag, not only `NODE_ENV`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Playwright, `createE2EPrismaClient` and the setup-wizard spec each refuse a database whose name does not end in `_test`.
- [ ] Test-token login needs `E2E_TEST_MODE=true` outside production; `NODE_ENV=test` alone no longer enables it.
- [ ] `getDevDefaults` and the seed need the explicit flag, and the seed prints its target and refuses non-local, non-test databases.
- [ ] CI, compose, `example.env` and the E2E docs use `plex_manager_test`.
- [ ] The guard's unit tests pass, and the abort demo is recorded.

### [READY] P0.5: Remove email-based account linking

- **Labels:** bug, security, jellyfin
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-20 to 2026-10-21 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - SEC-08 (high): Email-based account linking on unverified identifiers enables account takeover, including the admin ([security-audit.md](../research/security-audit.md))
  - SEC-14 (low): The "disable Jellyfin login" toggle only hides the button; the credentials provider still accepts Jellyfin logins ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.5 in plan.md](plan.md#step-p05-remove-email-based-account-linking)

**Context.** Close the account-takeover path in which a Jellyfin user renames themselves to the owner's email and signs in as the admin, and its pre-claim variant. Make the "disable Jellyfin login" toggle actually disable the provider.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Jellyfin provider never looks up by email, never carries `isAdmin` across a link and never writes `User.email`.
- [ ] `findOrCreateUser` no longer merges by email.
- [ ] Jellyfin invite usernames are Zod-validated, with no `@` allowed.
- [ ] `enabledForLogin` is enforced in `authorize`.
- [ ] The email-clearing migration has shipped, and the owner has reviewed the linked-rows list.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] The rename and pre-claim tests pass.

### [READY] P0.6: Jellyfin 12 sign-in header and server-only Jellyfin helpers

- **Labels:** bug, security, jellyfin
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-22 to 2026-10-22 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - GAP-01 (high): Jellyfin password login sends only the legacy `X-Emby-Authorization` header, which Jellyfin 12.0 ignores by default, so every Jellyfin sign-in fails ([additional-findings.md](../research/additional-findings.md))
  - SEC-35 (medium): Unauthenticated SSRF via `'use server'` Jellyfin helpers that take the target URL and key from the caller ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.6 in plan.md](plan.md#step-p06-jellyfin-12-sign-in-header-and-server-only-jellyfin-helpers)

**Context.** Restore Jellyfin password sign-in on Jellyfin 12.0, which ignores the legacy `X-Emby-Authorization` header by default. Remove the unauthenticated SSRF primitive in the Jellyfin helpers that take a caller-supplied URL and key.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Jellyfin sign-in sends `Authorization: MediaBrowser ...` and falls back to the legacy header only after a 400.
- [ ] Error strings never expose upstream status text, and the token is logged out after sign-in.
- [ ] `lib/jellyfin-auth.ts` is `server-only` and reads the stored config, and no exported action outside the admin and setup allow-list takes a target URL.
- [ ] The header-shape and action-surface tests pass, and sign-in works on Jellyfin 12.

### [READY] P0.7: Keep the Discord bot lease alive

- **Labels:** bug, platform, discord
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-23 to 2026-10-23 (track platform, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - BP-12 (high): With default settings the Discord bot drops offline every minute: the 60s poll interval exceeds the 30s lease ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P0.7 in plan.md](plan.md#step-p07-keep-the-discord-bot-lease-alive)

**Context.** Stop the bot from dropping offline every minute. Renewal of the 30 s lease must not depend on the 60 s acquisition poll.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Renewal runs on its own timer at a third of the lease, independent of the poll.
- [ ] The constructor rejects a renewal interval of half the lease or more, and the default poll is 10 s.
- [ ] The fake-timer and lock-integration tests pass.
- [ ] The one-hour demo shows a single login.

### [READY] P0.8: Share-safe v2 projection and share routes; stored Rewinds keep no roster

- **Labels:** bug, rewind, security, privacy
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-20 to 2026-10-21 (track rewind, Rewind lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - RWP-01 (high): Stored and publicly shared Rewind JSON exposes every server user's name and watch time ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-16 (high): Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked ([security-audit.md](../research/security-audit.md))
  - GAP-37 (low): Share-visit analytics store a permanent, reversible IP pseudonym plus user agent and referer, and no code reads them ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P0.8 in plan.md](plan.md#step-p08-share-safe-v2-projection-and-share-routes-stored-rewinds-keep-no-roster)

**Context.** Serve public share responses through an allow-list projection, so no other member's name or watch time leaves the server, and stop writing rosters and reversible visitor pseudonyms. P0.19 makes sharing opt-in, and P0.20 cleans the rows already stored.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The share API, the share page and the OG route serve only the projection and send noindex, and the key-snapshot test passes.
- [ ] Generation stores no roster and no email as a name.
- [ ] New visits store only the wrapped id, and the IP pseudonym helper is deleted.
- [ ] The v2 viewer and the share page still render.

### [READY] P0.19: Opt-in v2 share links; only one action sets a token

- **Labels:** bug, rewind, security, privacy
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-22 to 2026-10-22 (track rewind, Rewind lane, effort S)
- **Depends on:** P0.8
- **Findings addressed:**
  - SEC-16 (high): Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.19 in plan.md](plan.md#step-p019-opt-in-v2-share-links-only-one-action-sets-a-token)

**Context.** Make sharing something a member turns on. Generation and the admin playground stop minting share tokens, and one action becomes the only code path that sets `PlexWrapped.shareToken`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No code path except `enableWrappedShareLink` sets `shareToken`, and the grep test enforces it.
- [ ] Generation and `savePlaygroundWrapped` mint no token and keep any existing one.
- [ ] Members can create and stop a link, and owners of surviving tokens can stop theirs.

### [READY] P0.20: Strip stored rosters, Rewind LLM text and legacy visits

- **Labels:** bug, rewind, security, privacy, database
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-21 to 2026-10-22 (track rewind, Rewind lane, effort M)
- **Depends on:** P0.9
- **Findings addressed:**
  - RWP-01 (high): Stored and publicly shared Rewind JSON exposes every server user's name and watch time ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - GAP-37 (low): Share-visit analytics store a permanent, reversible IP pseudonym plus user agent and referer, and no code reads them ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P0.20 in plan.md](plan.md#step-p020-strip-stored-rosters-rewind-llm-text-and-legacy-visits)

**Context.** Remove every other member's name and watch time from the rows already stored, null the pre-v3 Rewind LLM text that holds rosters, revoke unvisited v2 tokens and delete the reversible visitor pseudonyms, with a script that is safe to run twice. It runs against production only after the release that carries P0.8 and P0.19 is live, with a dump taken first and the dry-run counts recorded in the PR.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The script is a dry run by default and reports counts per step, and the Postgres test proves a second run is a no-op.
- [ ] It ran in production after the P0.8 and P0.19 release, with stable dry-run counts recorded in the PR.
- [ ] No stored row has leaderboards or an email as a name, pre-v3 Rewind LLMUsage text is null, and no "Available users" error remains.
- [ ] Unvisited v2 tokens are revoked, and legacy visit rows are deleted.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### [READY] P0.9: Typed error when the Tautulli match fails

- **Labels:** bug, rewind, security, privacy
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-19 to 2026-10-19 (track rewind, Rewind lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - RWP-02 (medium): A failed Tautulli user match shows the end user every Tautulli username and email, and the message is stored ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-17 (medium): The "User not found in Tautulli" error returns every server user's username and email to the caller ([security-audit.md](../research/security-audit.md))
  - DUP-01 (medium): Duplicated Tautulli user lookup puts every user's username and email into an error string shown to the end user ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P0.9 in plan.md](plan.md#step-p09-typed-error-when-the-tautulli-match-fails)

**Context.** Replace the error string that lists every Tautulli username and email with a typed code. Use one shared lookup that matches on identifiers instead of email.

**Acceptance criteria** (the step's "Done when" list):

- [ ] One shared matcher serves the stats, first-watch, chatbot and Discord paths, and the email and `friendly_name` matching is gone.
- [ ] A miss stores `{ code: 'TAUTULLI_USER_NOT_FOUND' }`, members see fixed copy, and admins see the hint.
- [ ] Tests assert that no other member's username or email appears in any output.

### [READY] P0.10: Redis-backed rate limiter with namespaced keys and trusted proxy hops

- **Labels:** bug, security
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-21 to 2026-10-22 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - SEC-25 (medium): The rate limiter is one in-memory Map keyed only by the spoofable leftmost `X-Forwarded-For` and shared by every limiter ([security-audit.md](../research/security-audit.md))
  - BP-23 (medium): The public share page fetches its own API route, and every rate limiter shares one IP-keyed Map, so share links can 404 under load ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-24 (medium): No rate limiting on sensitive unauthenticated endpoints (Jellyfin password login, invite validation and redemption, Plex PIN actions) ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.10 in plan.md](plan.md#step-p010-redis-backed-rate-limiter-with-namespaced-keys-and-trusted-proxy-hops)

**Context.** Replace the single in-memory, unnamespaced, spoofable limiter with one that holds across processes, keeps features apart and finds the real client IP. Then put limits on the unauthenticated sign-in and invite paths.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The limiter runs on `rate-limiter-flexible`, with Redis and an in-process insurance store using the same keys.
- [ ] Keys are namespaced, and the client IP comes from `TRUSTED_PROXY_HOPS`.
- [ ] Both NextAuth credential callbacks, the Jellyfin username, invite validation and redemption, and PIN create and poll are limited.
- [ ] Every old caller is migrated, the `Map` is gone, and the webhook has no IP limit.
- [ ] The spoofing, isolation and two-store tests pass, and the docs are updated.

### [READY] P0.11: Share page reads the database directly

- **Labels:** bug, rewind, security, performance
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-23 to 2026-10-23 (track rewind, Rewind lane, effort S)
- **Depends on:** P0.8, P0.10
- **Findings addressed:**
  - RWP-09 (medium): The share page fetches its own API server-side, so all visitors share one rate-limit bucket and analytics record the server instead of the visitor ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-26 (medium): The share page fetches its own API during server rendering, so all public viewers share one rate-limit bucket ([security-audit.md](../research/security-audit.md))
  - RWV-05 (high): Public share page: off-brand static summary inside the auth-guarded group, the page fetches its own API so visits are counted twice, one shared rate-limit bucket turns every share link into a 404, and an email can appear publicly ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - BP-23 (medium): The public share page fetches its own API route, and every rate limiter shares one IP-keyed Map, so share links can 404 under load ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P0.11 in plan.md](plan.md#step-p011-share-page-reads-the-database-directly)

**Context.** Stop the share page from fetching its own API, which puts every visitor in one rate-limit bucket, counts each view twice, and turns a 429 into a 404. Read the row once per request through the projection (FR-49).

**Acceptance criteria** (the step's "Done when" list):

- [ ] No server-side self-fetch remains, and `getShareSafeRewind` with `cache()` serves the metadata, the page, the API and the OG route.
- [ ] Visitors are limited by their own IP and see a busy state instead of a 404.
- [ ] Each view records exactly one visit, with no personal fields.
- [ ] Unknown or revoked tokens return 404, and the page sits outside the `(app)` guards.
- [ ] The unit, page and E2E tests pass.

### [READY] P0.12: Generation guardrails on the v2 action

- **Labels:** bug, rewind, security, llm
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-23 to 2026-10-23 (track rewind, Rewind lane, effort S)
- **Depends on:** P0.10
- **Findings addressed:**
  - SEC-22 (high): Any user can trigger unbounded, concurrent Rewind LLM generations (any year 2010-2100, re-triggered while "generating", no rate limit or entitlement check) ([security-audit.md](../research/security-audit.md))
  - RWP-12 (medium): No rate limit or single-flight on generation ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P0.12 in plan.md](plan.md#step-p012-generation-guardrails-on-the-v2-action)

**Context.** Stop members from starting unbounded, concurrent, paid generations for any year. Allow one run at a time per member and year, cap how often members can run, restrict the year, and check entitlement.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The year is restricted by Zod to the configured season year.
- [ ] One run per member and year, with a 15-minute stale takeover and compare-and-set final writes.
- [ ] Members are limited to 1 run per 10 minutes and 3 per day through the new limiter, and admins are exempt.
- [ ] Entitlement is checked when Stripe is on.
- [ ] The parallel and out-of-range tests pass.

### [READY] P0.13: LLM stop-gaps for current models

- **Labels:** bug, rewind, llm, privacy
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-20 to 2026-10-20 (track rewind, Rewind lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - RWP-15 (medium): The LLM integration is OpenAI-only raw fetch with brittle model-name checks, defaults that conflict with GPT-5, and no retry or deterministic fallback ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-22 (low): Cost tracking misses billed failures and over-reports unknown models at GPT-4 prices ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - DUP-04 (medium): Two hand-written OpenAI chat clients with copy-pasted, disagreeing model-capability checks ([code-duplication.md](../research/code-duplication.md))
  - SEC-44 (medium): Two duplicated, hand-rolled OpenAI clients detect model capabilities by name prefix, which is brittle for newer models and OpenAI-only ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.13 in plan.md](plan.md#step-p013-llm-stop-gaps-for-current-models)

**Context.** Keep v2 generation and the assistant working on current OpenAI models with one shared parameter module instead of two copies that disagree. Make the cost records honest, and stop sending a member's email to the model.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/llm/openai-params.ts` is shared by both clients, and the duplicate checks are deleted.
- [ ] No `temperature` is sent to `gpt-5`, `gpt-6` or o-series models, and the GPT-6 and o4 rules are covered by tests.
- [ ] The GPT-6 prices are added, unknown models cost 0 with a warning, and cached tokens are priced.
- [ ] Setup defaults to a current model, and no `gpt-4` fallback remains.
- [ ] The member's name, or "there", is sent instead of an email.
- [ ] The retirement check is recorded before 2026-10-23.

### [READY] P0.14: Resolve the Rewind year from data, not the calendar

- **Labels:** bug, rewind
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-21 to 2026-10-21 (track rewind, Rewind lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - RWP-04 (high): Year rollover is broken: the viewer always loads the calendar year while generation uses the configured wrappedYear ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWV-02 (high): `/wrapped` always uses the calendar year: from 1 Jan 2027 the 2026 Rewind says "No Wrapped Found", and past years cannot be viewed ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-02 (high): Rewind entry breaks across the year boundary; no archive of past years and no exit from the viewer ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P0.14 in plan.md](plan.md#step-p014-resolve-the-rewind-year-from-data-not-the-calendar)

**Context.** End the January loop in which the card says the 2026 Rewind is ready and `/wrapped` says no 2027 Rewind exists. Members can open any of their past years.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/wrapped` opens the member's latest completed year, or the season year when none exists.
- [ ] `/wrapped/[year]` opens any of the member's past years, and an invalid year returns 404.
- [ ] The dashboard card, admin Regenerate and the admin user pages use the configured season year, and no calendar default remains in these paths.
- [ ] The Jest season tests and the 2027-01-02 E2E test pass.

### [READY] P0.15: Correct the Overseerr request status mapping

- **Labels:** bug, rewind
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-26 to 2026-10-26 (track rewind, Rewind lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - RWP-06 (medium): Overseerr stats misread the API ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P0.15 in plan.md](plan.md#step-p015-correct-the-overseerr-request-status-mapping)

**Context.** The Rewind's Overseerr statistics misread the API today (RWP-06). Count Overseerr requests the way the API defines them, find the member beyond the first 10 Overseerr users, and stop crediting other people's requests to the member.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Request statuses use the enums, approved is 2 or 5, and declined and failed are excluded.
- [ ] Availability comes from `media.status`.
- [ ] `/user` is paged with `take` and `skip`, the match is by `plexId` then email, and the loose fallback is gone.
- [ ] Zod validates the responses, and the fixture tests with real field names pass.

### [READY] P0.16: Poster proxy: private caching, access check, fast 404

- **Labels:** bug, security, rewind
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-26 to 2026-10-26 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - SEC-21 (low): Poster proxy marks session-gated responses `public` and lets any session fetch any library item ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P0.16 in plan.md](plan.md#step-p016-poster-proxy-private-caching-access-check-fast-404)

**Context.** Stop shared caches from serving session-gated posters to anonymous requests, and stop any session from fetching any library item. Fail fast, so that slides fall back to text at once.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Session responses are private, and only share-token responses are public, with noindex.
- [ ] Sessions reach only their own Rewind keys or shared sections, while the owner and admins see everything.
- [ ] Plex failures and unknown keys return 404 within 3 s, with a negative cache.
- [ ] Route tests cover every case.

### [READY] P0.17: Explain Rewind to members without Plex history

- **Labels:** bug, rewind, jellyfin
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-27 to 2026-10-27 (track rewind, Rewind lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - RWP-08 (medium): Jellyfin users are offered a Rewind that always fails ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P0.17 in plan.md](plan.md#step-p017-explain-rewind-to-members-without-plex-history)

**Context.** Jellyfin users and other members without Plex history are offered a Rewind that always fails (RWP-08). Members who cannot have a Rewind see an explanation instead of a Generate button that always fails and leaves a failed row behind (FR-48).

**Acceptance criteria** (the step's "Done when" list):

- [ ] Eligibility is decided on the server from `plexUserId` and the Tautulli match.
- [ ] Ineligible members see the FR-48 copy and no generate action.
- [ ] The action refuses ineligible members before writing any row.
- [ ] The eligibility, component and action tests pass.

### [READY] P0.18: Stop sending plexAuthToken to the admin browser

- **Labels:** bug, security, admin, privacy
- **Phase:** [P0: Safety fixes on the current code](plan.md#phase-0-safety-fixes-on-the-current-code), 2026-10-19 to 2026-10-27
- **Window:** 2026-10-22 to 2026-10-22 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - SEC-18 (medium): Admin invite actions return full User rows, including `plexAuthToken`, to the browser ([security-audit.md](../research/security-audit.md))
  - BP-03 (medium): Invite queries send full User rows, including `plexAuthToken`, to client components; the encryption extension does not process included relations ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P0.18 in plan.md](plan.md#step-p018-stop-sending-plexauthtoken-to-the-admin-browser)

**Context.** Admin invite actions and queries return full User rows, `plexAuthToken` included, to the browser (SEC-18, BP-03). The invite pages receive only public user fields, so no invitee's plex.tv account token reaches a client component or a server-action response.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Both invite queries select explicit public user fields through the DTO.
- [ ] The `@ts-ignore` comments are gone, and the components are typed with the DTO.
- [ ] A test asserts that the serialised results and props contain no token field.
- [ ] The devtools check is recorded in the PR.

### [READY] P3.8: Safe Markdown, safe links and error copy

- **Labels:** bug, ui, security
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-10-29 to 2026-10-29 (track ui, UI lane, effort S)
- **Depends on:** P3.1
- **Findings addressed:**
  - SEC-42 (medium): The admin chatbot is exposed to indirect prompt injection from user-controlled tool data, and renders model markdown images that can exfiltrate data ([security-audit.md](../research/security-audit.md))
  - SEC-57 (low): The public URL schema accepts any URL scheme for links shown to users ([security-audit.md](../research/security-audit.md))
  - SEC-20 (low): Raw internal error messages are returned to clients, including from the unauthenticated `checkServerAccess` ([security-audit.md](../research/security-audit.md))
  - UI-25 (medium): Announcements: Markdown lists lose their bullets, the list is clipped in a hidden scroll box, "NEW" is permanent, and the admin list shows raw Markdown with no preview ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.8 in plan.md](plan.md#step-p38-safe-markdown-safe-links-and-error-copy)

**Context.** Render announcements and assistant answers through one `MarkdownBody` that allows no images and no raw HTML and keeps real list styles. Links render through `SafeLink`, which allows only http and https and shows where they go. User-facing error text comes from one code-to-copy map, never from `error.message`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] MarkdownBody, SafeLink, `safeHref` and `error-copy.ts` exist with unit tests.
- [ ] Announcements and the assistant render through MarkdownBody, and lists have bullets.
- [ ] No member or admin surface renders `error.message` through ErrorState.
- [ ] The three admin-set public links pass through `safeHref`.

### [READY] P4.1: Validate the environment at boot

- **Labels:** bug, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-10-23 to 2026-10-23 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - SEC-09 (medium): No startup env validation; the placeholder `NEXTAUTH_SECRET` is accepted, which lets anyone mint admin cookies ([security-audit.md](../research/security-audit.md))
  - GAP-18 (low): The env reference is incomplete and partly wrong: 12 app variables are missing from example.env, and the README production list omits the required `PLEX_CLIENT_IDENTIFIER` ([additional-findings.md](../research/additional-findings.md))
  - SEC-04 (medium): docker-compose publishes Postgres (default password) and Redis (no auth) on all interfaces ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.1 in plan.md](plan.md#step-p41-validate-the-environment-at-boot)

**Context.** Refuse to start a production server whose session secret anyone can look up, whose cookies would silently lose the Secure flag, or that would only fail at the first Plex login. Document every variable the code reads. Stop the development compose file from publishing an open Postgres and Redis on every interface, because P0.10 keeps the limiter's state in that Redis from 2026-10-21 (SEC-04).

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/env.ts` describes every variable the code reads, and the coverage test passes.
- [ ] Production refuses to boot with a placeholder or CI secret, with a non-https public URL (without the explicit opt-out), or without `PLEX_CLIENT_IDENTIFIER`.
- [ ] `useSecureCookies` is set explicitly.
- [ ] `example.env` ships an empty secret and lists the missing variables, and the README lists `PLEX_CLIENT_IDENTIFIER`.
- [ ] Compose binds Postgres and Redis to localhost and requires both passwords.

### [READY] P4.2: Boot and shutdown resilience

- **Labels:** bug, ops
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-10-27 to 2026-10-28 (track ops, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - BP-13 (medium): Next.js serves nothing until instrumentation `register()` resolves, so a Redis outage at boot hangs the whole site ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-15 (medium): Three uncoordinated SIGTERM handlers race Next's `process.exit(0)`, cutting off in-flight jobs ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-18 (low): The pg pool uses defaults (max 10, unbounded wait for a connection, no statement timeout) and is shared by web, worker and bot ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P4.2 in plan.md](plan.md#step-p42-boot-and-shutdown-resilience)

**Context.** The site serves requests even when Redis is down at boot. A restart drains running jobs and releases the Discord lease before the process exits, and database waits and queries have explicit limits.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `register()` returns at once, whatever Redis or Discord do.
- [ ] One coordinator handles SIGTERM and SIGINT, drains the workers and the bot under a deadline, and exports `shutdownSignal`.
- [ ] The pg pool has an explicit size, connection wait and statement timeout per role.
- [ ] The Redis-down and SIGTERM tests pass.

### [READY] P4.3: One action helper for auth, Zod and result shape

- **Labels:** bug, security, refactor
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-10-30 to 2026-11-02 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - DUP-06 (medium): Server-action auth, try/catch and result-shape boilerplate repeated about 130 times with three result shapes and throw-based guards ([code-duplication.md](../research/code-duplication.md))
  - BP-04 (medium): 44 of 91 parameterised server actions have no Zod validation, and action return shapes are inconsistent ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-19 (low): Public and low-privilege server actions leak small amounts of data or accept unbounded parameters ([security-audit.md](../research/security-audit.md))
  - SEC-20 (low): Raw internal error messages are returned to clients, including from the unauthenticated `checkServerAccess` ([security-audit.md](../research/security-audit.md))
  - SEC-56 (low): Invites, route handlers and public actions skip Zod validation, against the CLAUDE.md rule, and interpolate parameters unencoded ([security-audit.md](../research/security-audit.md))
  - SEC-57 (low): The public URL schema accepts any URL scheme for links shown to users ([security-audit.md](../research/security-audit.md))
  - BP-27 (medium): Admin auth error screens match on `error.name` / `error.message`, which production builds strip ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P4.3 in plan.md](plan.md#step-p43-one-action-helper-for-auth-zod-and-result-shape)

**Context.** Replace the copied auth, try/catch and result boilerplate with one wrapper that validates with Zod, guards without throwing and never returns internal error text. Move every public and member action, the invite actions and the route handlers onto it, and make the admin gate work in production builds.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `defineAction` and `ActionResult` exist with tests, and every public and member action, the invite actions and `server-info` use them.
- [ ] The route handlers validate their parameters with the shared schemas, and the public URL schema accepts only http and https.
- [ ] No migrated module returns `error.message`, and the lint rule enforces it.
- [ ] The admin gate works in a production build without matching error names or messages.

### P4.5: Enforce entitlement beyond the layout

- **Labels:** bug, security, stripe
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-04 to 2026-11-05 (track security, hardening lane, effort M)
- **Depends on:** P4.3
- **Findings addressed:**
  - SEC-28 (medium): Subscription entitlement is enforced only in the `(app)` layout; server actions, route handlers and jobs don't check it ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.5 in plan.md](plan.md#step-p45-enforce-entitlement-beyond-the-layout)

**Context.** With Stripe on, every server action, route handler and job that costs money or grants access checks entitlement itself, instead of trusting the `(app)` layout. Lapsed members keep the read-only Rewind access that FR-51 promises.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `getAccessLevel` returns `full`, `lapsed` or `none`, and the action helper and route helper enforce `full` and `read`.
- [ ] The watchlist, Discord, poster and generation paths and the watchlist jobs check entitlement, with Stripe on and off.
- [ ] Lapsed members reach only the read-only Rewind routes, on full loads and on client-side navigation, and the matrix is in `docs/stripe.md`.

### P4.6: Never send a stored secret to a new address; audit config changes

- **Labels:** bug, security, admin
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-05 to 2026-11-06 (track security, hardening lane, effort M)
- **Depends on:** P4.3
- **Findings addressed:**
  - SEC-31 (medium): "Leave blank to keep the current secret", combined with the connection test, sends stored tokens and API keys to a newly entered URL ([security-audit.md](../research/security-audit.md))
  - SEC-55 (low): Credential and config changes are not audit-logged; the audit log goes to stdout only ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.6 in plan.md](plan.md#step-p46-never-send-a-stored-secret-to-a-new-address-audit-config-changes)

**Context.** A blank secret field reuses the stored secret only for the address it was saved with, so no admin session can redirect the owner's tokens to a listener. Every credential and configuration change leaves a redacted audit record in the database as well as in stdout.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A blank secret is reused only for the same origin, in settings, connection tests and setup.
- [ ] `AuditLog` exists, and every audit event is written to the database as well as stdout.
- [ ] Every credential, settings, setup and template mutation emits `CONFIG_CHANGED` with a redacted diff.
- [ ] Prompt activation is atomic.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P4.7: Sessions end when access ends; role changes stick

- **Labels:** bug, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-09 to 2026-11-10 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - SEC-10 (medium): Sessions survive Plex unsharing and access removal; the JWT refresh only re-reads `isAdmin` ([security-audit.md](../research/security-audit.md))
  - SEC-12 (medium): Admin role changes made in the UI do not stick; every login recomputes and overwrites `isAdmin` ([security-audit.md](../research/security-audit.md))
  - GAP-26 (low): Jellyfin admin detection: the server-owner check is dead code, and a failed lookup at login demotes the admin and writes a false audit entry ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P4.7 in plan.md](plan.md#step-p47-sessions-end-when-access-ends-role-changes-stick)

**Context.** A member who is unshared, demoted, disabled or revoked loses their session within minutes, and a session whose user row is gone ends. Admin roles set in the UI survive the next login, and a failed Jellyfin lookup no longer demotes anyone.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The JWT refresh checks `sessionVersion` and `disabledAt`, and a mismatch, a disabled user or a missing row ends the session.
- [ ] Unshare, demotion, disable and the Stripe revoke bump the version.
- [ ] Login only promotes, so roles set in the UI persist, and the owner and the last admin cannot be demoted.
- [ ] A failed Jellyfin lookup changes nothing and writes no audit event.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P4.8: Bind the Plex PIN to the browser

- **Labels:** bug, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-11 to 2026-11-12 (track security, hardening lane, effort M)
- **Depends on:** P0.10
- **Findings addressed:**
  - SEC-11 (medium): The public Plex PIN-polling action returns account tokens for any PIN ID; one client identifier is shared app-wide; the PIN is not bound to the browser ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.8 in plan.md](plan.md#step-p48-bind-the-plex-pin-to-the-browser)

**Context.** Only the browser that started a Plex sign-in can finish it, and the plex.tv account token never reaches client JavaScript. Each browser presents its own Plex client identifier, and the poll is rate-limited.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The PIN id lives only in a signed httpOnly cookie, bound to the browser that created it.
- [ ] No action returns the account token, and the server completes sign-in and invite redemption.
- [ ] Each browser has its own client identifier, and PIN creation and polling are rate-limited.

### P4.9: Discord OAuth redirect and state binding

- **Labels:** bug, security, discord
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-23 to 2026-11-23 (track security, hardening lane, effort S)
- **Depends on:** P4.8
- **Findings addressed:**
  - SEC-13 (low): Discord OAuth callback has an open redirect through backslash paths; the state is not bound to the browser session ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.9 in plan.md](plan.md#step-p49-discord-oauth-redirect-and-state-binding)

**Context.** After Discord linking, the app only ever redirects to its own allow-listed pages. A Discord authorization started by one browser and account cannot be completed by another.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Redirect paths are normalised and allow-listed, and every known bypass string falls back.
- [ ] The state is bound to the session by a signed cookie, checked against the session user and consumed atomically.
- [ ] The callback sends only fixed codes.

### P4.10: Stripe event ordering, idempotency and live re-checks

- **Labels:** bug, security, stripe
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-16 to 2026-11-19 (track security, hardening lane, effort L)
- **Depends on:** P4.5
- **Findings addressed:**
  - SEC-37 (medium): Stripe handlers apply stale event snapshots unconditionally on a 5-way concurrent worker; out-of-order events can bring a canceled subscription back ([security-audit.md](../research/security-audit.md))
  - SEC-38 (medium): `PLEX_ACCESS_REVOKE` and `GRANT` jobs act without re-validating live subscription state ([security-audit.md](../research/security-audit.md))
  - SEC-39 (medium): `startCheckout` lets an already-subscribed user create a second subscription and a new Stripe customer ([security-audit.md](../research/security-audit.md))
  - SEC-40 (medium): A Stripe event is recorded as seen before processing succeeds, so events that failed cannot be recovered with Stripe's resend ([security-audit.md](../research/security-audit.md))
  - SEC-41 (low): `checkout.session.completed` trusts `client_reference_id` and hard-codes ACTIVE without checking mode, payment status or price ([security-audit.md](../research/security-audit.md))
  - BP-14 (medium): Stripe jobs record events before handling them and apply snapshots in any order; the grant job never re-checks subscription status ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - GAP-15 (low): Stripe can be enabled without Redis: the documented prerequisite is not checked, so webhooks return 500 and comp grants half-apply ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P4.10 in plan.md](plan.md#step-p410-stripe-event-ordering-idempotency-and-live-re-checks)

**Context.** Reordered, resent and failed Stripe events can no longer revive a canceled subscription, unshare a paying member or get lost. Checkout cannot double-charge a member, and Stripe cannot be enabled without the queue it needs.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A `StripeEvent` is marked processed only after its handler succeeds, and a resend recovers a failed event.
- [ ] Subscription writes use live state and never apply an older event over a newer one.
- [ ] The grant and revoke jobs re-check live state before acting.
- [ ] Checkout refuses an existing subscription and reuses the customer, and `checkout.session.completed` checks mode, payment status, price and owner.
- [ ] Stripe cannot be enabled without Redis, and the out-of-order and resent-event tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P4.11: Unshare only this server, idempotently

- **Labels:** bug, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-12-02 to 2026-12-02 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - GAP-04 (medium): Unshare calls plex.tv's remove-friend endpoint, which is not limited to the configured server and is not idempotent ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P4.11 in plan.md](plan.md#step-p411-unshare-only-this-server-idempotently)

**Context.** Removing a member removes only their share of the configured server, never the plex.tv friendship or the owner's other servers. A share that is already gone counts as success, so retries and reruns settle.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Unshare deletes only the configured server's share, found by machine identifier and share id.
- [ ] An already removed share returns success, and authentication failures are not retried.
- [ ] The recorded-response tests pass.

### [READY] P4.12: Jellyfin invites: no Plex redemption, complete compensation

- **Labels:** bug, security, jellyfin
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-10-28 to 2026-10-28 (track security, hardening lane, effort S)
- **Depends on:** P0.5
- **Findings addressed:**
  - SEC-29 (medium): Jellyfin invite codes can be redeemed through the Plex flow, which shares every Plex library and grants a permanent Stripe exemption ([security-audit.md](../research/security-audit.md))
  - GAP-28 (low): Jellyfin invite compensation is incomplete: a failed DB write leaves a working Jellyfin account with library access and a restored, reusable invite ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P4.12 in plan.md](plan.md#step-p412-jellyfin-invites-no-plex-redemption-complete-compensation)

**Context.** A Jellyfin invite code can no longer be redeemed through the Plex flow for every Plex library and a permanent Stripe exemption. A failed Jellyfin redemption never leaves a working account behind a reusable invite.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Plex flow rejects Jellyfin codes before consuming them, so they give no library share and no exemption.
- [ ] Jellyfin accounts stay disabled until the database write succeeds.
- [ ] A failed write disables or deletes the account and restores the invite, all or nothing, with an audit entry when it cannot.

### P4.13: Watchlist requests filed as the member

- **Labels:** bug, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-12-02 to 2026-12-03 (track security, hardening lane, effort M)
- **Depends on:** P2.3
- **Findings addressed:**
  - SEC-27 (medium): Watchlist sync files Overseerr requests as the admin (admin API key, no `X-Api-User`), so every user's requests are auto-approved ([security-audit.md](../research/security-audit.md))
  - GAP-39 (info): Admin-triggered per-user watchlist sync ignores the member's opt-in ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P4.13 in plan.md](plan.md#step-p413-watchlist-requests-filed-as-the-member)

**Context.** Watchlist sync files each Overseerr request as the member's own Overseerr user, so approval rules, quotas and attribution apply, and members without a matched Overseerr user are skipped. No sync runs for a member who has not opted in.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every Overseerr request carries `X-Api-User` for the member's matched user, with no admin fallback.
- [ ] Unmatched, disabled, not-opted-in and not-entitled members are skipped with a typed reason, whatever the trigger.
- [ ] Triggers are deduplicated and rate-limited, and the totals use atomic increments.

### P4.15: Harden the admin assistant

- **Labels:** bug, security, llm, admin
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-06 to 2026-11-06 (track security, hardening lane, effort S)
- **Depends on:** P3.8, P2.12
- **Findings addressed:**
  - SEC-42 (medium): The admin chatbot is exposed to indirect prompt injection from user-controlled tool data, and renders model markdown images that can exfiltrate data ([security-audit.md](../research/security-audit.md))
  - SEC-45 (low): `chatWithAdminBot` accepts an unvalidated client message history (including `system` roles) and an unowned `conversationId`; LLMUsage re-stores the full context on every loop ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.15 in plan.md](plan.md#step-p415-harden-the-admin-assistant)

**Context.** Text that members control can reach the admin assistant's model only as labelled, untrusted data, and the model's answers can never load an image. The action accepts only a bounded user and assistant history for the caller's own conversation, and usage records stop re-storing the whole context on every loop.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Tool results reach the model wrapped as untrusted data, without emails, and model output renders without images.
- [ ] The message history is validated (user and assistant roles only, bounded), and `conversationId` ownership is checked.
- [ ] Each `LLMUsage` row stores only its own call's new content, and the injection fixtures pass.

### P4.16: Redact secrets and identifiers from logs

- **Labels:** bug, security, observability, privacy
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-18 to 2026-11-19 (track security, hardening lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - SEC-54 (low): Logs capture share tokens, OAuth codes, PIN IDs, invite codes and raw client IPs; `Error` metadata is logged as `{}` ([security-audit.md](../research/security-audit.md))
  - BP-37 (low): The logger is 663 lines and about half unused; the Discord bot runs a second, unsanitized winston logger; 53 console.* calls bypass both ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P4.16 in plan.md](plan.md#step-p416-redact-secrets-and-identifiers-from-logs)

**Context.** No log line carries a share token, card asset key, OAuth code or state, PIN id, invite code or full client IP, and Errors in metadata keep their name, message and stack. The Discord bot logs through the same sanitiser. This lands before the 2026-11-27 soft launch.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Share tokens, `/rewind/s/*` and card asset paths, OAuth codes and states, PIN ids, invite codes and client IPs are masked, including inside message strings.
- [ ] Error metadata is serialised with its stack.
- [ ] The Discord bot uses the shared sanitising logger.
- [ ] The redaction-list tests pass.

### P4.18: Discord role metadata follows access; marking acts as the member

- **Labels:** bug, security, discord
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-23 to 2026-11-24 (track security, hardening lane, effort M)
- **Depends on:** P4.7
- **Findings addressed:**
  - SEC-47 (medium): Discord linked-role metadata is synced only at link time or on manual resync, so subscriber roles persist after access is revoked ([security-audit.md](../research/security-audit.md))
  - SEC-48 (medium): "Mark finished" (Discord `/mark` and the chatbot tool) scrobbles on the server owner's Plex account, not the member's ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.18 in plan.md](plan.md#step-p418-discord-role-metadata-follows-access-marking-acts-as-the-member)

**Context.** A member's Discord linked role follows their real access within minutes of an unshare, revoke or subscription change, with a daily reconcile as the safety net. "Mark finished" updates the member's own Plex watch status, never the owner's.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A deduplicated job re-syncs linked-role metadata on unshare, revoke, grant, exemption and subscription changes, and a daily reconcile catches stale rows.
- [ ] No email is pushed to Discord.
- [ ] `/mark` and the chatbot tool scrobble with the member's own token, and refuse the scrobble with a clear message when there is none.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P4.19: Discord privacy firewall fails closed

- **Labels:** bug, security, discord, privacy
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-20 to 2026-11-20 (track security, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:**
  - SEC-50 (low): The Discord privacy firewall fails open: unscoped Tautulli activity fallback, and executor exceptions bypass `scrubForDiscord` ([security-audit.md](../research/security-audit.md))
  - SEC-51 (low): Assistant replies are sent to Discord without truncating to the 2000-character limit ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.19 in plan.md](plan.md#step-p419-discord-privacy-firewall-fails-closed)

**Context.** In the Discord context, a tool shows a member only their own sessions, or nothing, and no error text escapes the scrubber. No assistant reply is lost to Discord's 2,000-character limit.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The unscoped activity fallback is gone, and unmapped callers get an empty session list.
- [ ] Executor exceptions and error JSON pass through `scrubForDiscord` in the Discord context.
- [ ] Replies are split or truncated at 2,000 characters on both paths.

### P4.20: LLM quotas and spend caps for the assistant and Discord

- **Labels:** bug, security, llm, discord
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-18 to 2026-11-19 (track security, hardening lane, effort M)
- **Depends on:** P0.10, P2.11
- **Findings addressed:**
  - SEC-23 (medium): No per-user rate limits, quotas or spend cap on LLM and expensive Discord surfaces; failed LLM calls are not recorded ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P4.20 in plan.md](plan.md#step-p420-llm-quotas-and-spend-caps-for-the-assistant-and-discord)

**Context.** No member or admin can run up unbounded LLM spend or upstream load through the assistant or the paid Discord commands. A daily cap per user and for the server stops the loop before the next call, and failed but billed calls show up in usage.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The admin assistant, the Discord DM assistant, `/assistant ask`, `/mystats` and resync have per-user Redis limits.
- [ ] Daily per-user and server spend caps are checked before every LLM call, and fail closed.
- [ ] Failed but billed calls are recorded through `lib/llm/usage.ts`.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P10.24: Setup wizard model: string step ids and Skip

- **Labels:** bug, ui, database
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-26 to 2027-01-28 (track ui, member lane, effort M)
- **Depends on:** P11.32, P11.31
- **Findings addressed:**
  - UI-03 (high): The setup wizard requires every optional integration to pass a live connection test, with no skip ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - DUP-05 (medium): Setup-wizard saves duplicate the admin server-update logic but never deactivate old rows, so Back + re-save leaves two active configs ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P10.24 in plan.md](plan.md#step-p1024-setup-wizard-model-string-step-ids-and-skip)

**Context.** Give setup string step ids with `group` and `optional`, migrate `Setup.currentStep` to `currentStepId`, fix the step-10 write and add Skip for now on optional steps. Setup and admin saves share one service-save helper that deactivates earlier rows, so going Back and saving again never leaves two active configs. The rows that are already duplicated are cleaned up by P11.31 first, through a reviewed audit rather than inside this migration.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Steps have string ids with `group` and `optional`, and the migration maps every stored number.
- [ ] The step-10 write is gone, and optional steps can be skipped through a claim-gated action.
- [ ] Setup and admin saves share `saveActiveService`, and Back and re-save leaves one active row.
- [ ] Action, migration and helper tests pass, and the migration touches no service row.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.1: Encryption-key safety and at-rest encryption by default

- **Labels:** bug, security, database
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-01 to 2027-02-03 (track security, security and ops lane, effort M)
- **Depends on:** P4.1
- **Findings addressed:**
  - SEC-32 (medium): A lost or rotated `ENCRYPTION_KEY` locks everyone out with no recovery path ([security-audit.md](../research/security-audit.md))
  - SEC-33 (low): At-rest encryption is opt-in, silently off by default, and key handling is not hardened ([security-audit.md](../research/security-audit.md))
  - SEC-34 (low): Bearer tokens and PII stored in plaintext beyond ENCRYPTED_FIELDS, with no retention policy ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.1 in plan.md](plan.md#step-p111-encryption-key-safety-and-at-rest-encryption-by-default)

**Context.** A missing, wrong or rotated key no longer takes the app down: unreadable secrets become "enter it again" prompts, a boot check catches a mismatched key, and a keyring makes rotation routine. Production encrypts secrets by default, a data migration encrypts the plaintext values already stored, and nested reads decrypt like top-level ones.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Decryption never throws in the extension; an unreadable field is null and shown as "enter it again" in settings.
- [ ] `ENCRYPTION_KEYS` with kids, `enc:v2:` writes, tag-length checks and an idempotent re-encryption job and action exist.
- [ ] Production refuses to boot without a strong key unless `ALLOW_PLAINTEXT_SECRETS` is set, and the canary catches a mismatched key.
- [ ] Nested includes and nested writes are decrypted and encrypted, and `LLMUsage` text is encrypted.
- [ ] The lost-key and rotation runbook is in `docs/operations.md`.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] An install with only `ENCRYPTION_KEY` set writes `enc:v2:legacy:` values in production, and the upgrade note explains the move to `ENCRYPTION_KEYS`.

### P11.2: Watchlist lock and fallback polling

- **Labels:** bug, platform, refactor
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-07 to 2027-01-11 (track platform, platform lane, effort M)
- **Depends on:** P11.28
- **Findings addressed:**
  - DUP-07 (medium): Watchlist distributed lock is a 395-line module-global copy of DistributedLock, and its no-Redis fallback runs sync only once ([code-duplication.md](../research/code-duplication.md))
  - SEC-52 (low): The watchlist sync lock is a near-verbatim copy of the old Discord lease lock instead of reusing `DistributedLock` / `BotLockPoller` ([security-audit.md](../research/security-audit.md))
  - SEC-49 (medium): Legacy (no-Redis) watchlist polling never starts if sync is disabled at boot, and once initialised never syncs again ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.2 in plan.md](plan.md#step-p112-watchlist-lock-and-fallback-polling)

**Context.** The Discord bot and watchlist sync share one lease lock and one poller, and the 395-line copy in `lib/watchlist/lock.ts` is deleted. Watchlist sync runs on its interval whether it was enabled at boot or later, with or without Redis.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/locks/` holds the one lease lock and poller, used by the Discord bot and watchlist sync, and `lib/watchlist/lock.ts` is deleted.
- [ ] Without Redis, sync starts when enabled after boot and repeats on the configured interval.
- [ ] With Redis, saving the settings creates, updates or removes the scheduler.
- [ ] The fake-timer tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.7: Discord bot lifecycle and command registration

- **Labels:** bug, platform, discord
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-04 to 2027-02-04 (track platform, platform lane, effort S)
- **Depends on:** P4.2
- **Findings addressed:**
  - GAP-12 (medium): The Discord bot never starts if it is disabled or unconfigured at boot, so every fresh install needs a restart; the docs contradict the `ENABLE_DISCORD_BOT` default ([additional-findings.md](../research/additional-findings.md))
  - GAP-13 (medium): Discord slash-command registration crashes as documented and cannot be run from the image ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.7 in plan.md](plan.md#step-p117-discord-bot-lifecycle-and-command-registration)

**Context.** The bot starts within one poll of being enabled and given a token, without a restart. The docs match the `ENABLE_DISCORD_BOT` default. Slash-command registration loads its environment before anything touches Prisma, falls back to the token stored in the database, and runs from the published image.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The poller always runs unless opted out, and the bot starts once it is enabled and has a token.
- [ ] The docs and `example.env` match the default and describe the admin switch.
- [ ] The registration script loads its environment first, falls back to the database token, and runs from the image.
- [ ] The fake-timer and script tests pass.

### P11.8: Plex API contract fixes

- **Labels:** bug, platform
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-11 to 2027-01-13 (track platform, platform lane, effort M)
- **Depends on:** P2.3
- **Findings addressed:**
  - GAP-05 (low): Temporary Plex failures are shown to members as permanent verdicts ("Access Denied", subscriber role removed, "Plex token expired") ([additional-findings.md](../research/additional-findings.md))
  - GAP-06 (low): getAllPlexServerUsers treats the owner's whole plex.tv friend list as this server's users; managed users are dropped and pending shares count as access ([additional-findings.md](../research/additional-findings.md))
  - GAP-08 (low): The server owner's own streams never match Discord `/watching` or the chatbot session scope, because PMS reports the owner as user id 1 ([additional-findings.md](../research/additional-findings.md))
  - GAP-10 (info): PMS reads use legacy routes, an undocumented `limit` parameter and GET for scrobble ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.8 in plan.md](plan.md#step-p118-plex-api-contract-fixes)

**Context.** A temporary Plex failure reads as "temporarily unavailable", never as a verdict, and never removes a role. Server users come from this server's shares, managed users are kept, and pending shares are labelled. The owner's own streams match, and PMS reads use container paging and a PUT scrobble. Contract tests run on recorded responses.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Access checks return granted, denied or unknown, and an unknown result never denies a sign-in as a verdict or removes a role.
- [ ] Server users come from this server's shares, managed users are kept, and pending shares are labelled and refused.
- [ ] The owner's sessions match, and PMS reads use container paging and the PUT scrobble.
- [ ] The recorded-response contract tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.9: Chatbot tool and Prometheus client fixes

- **Labels:** bug, platform, llm
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-14 to 2027-01-14 (track platform, platform lane, effort S)
- **Depends on:** P2.3
- **Findings addressed:**
  - GAP-07 (low): The *arr and Overseerr chatbot tools send filter parameters the APIs ignore, omit `includeSeries`, and read only the first page ([additional-findings.md](../research/additional-findings.md))
  - GAP-09 (low): The Prometheus client drops the documented JSON error body on 4xx/5xx and reports only the HTTP status text ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.9 in plan.md](plan.md#step-p119-chatbot-tool-and-prometheus-client-fixes)

**Context.** The Sonarr, Radarr and Overseerr tools ask the APIs for what they actually support, filter in code where an endpoint cannot, include series and movie titles, and page through results. The Prometheus client reports Prometheus's own error message.

**Acceptance criteria** (the step's "Done when" list):

- [ ] History calls use the per-series and per-movie routes, and list calls include series and movie data and page with a cap.
- [ ] Endpoints that cannot filter are filtered in code, and Overseerr users are paged.
- [ ] Prometheus errors show `errorType: error`, and 503 is treated as retryable.
- [ ] The fixture tests pass.

### P11.10: Jellyfin member parity: service, admin visibility and tests

- **Labels:** bug, platform, jellyfin, admin
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-14 to 2027-01-18 (track platform, platform lane, effort M)
- **Depends on:** P4.7
- **Findings addressed:**
  - GAP-24 (medium): `primaryAuthService` is never written correctly, so invite-created Jellyfin members get the Plex onboarding and a plex.tv tile, while email-linked Plex members flip to Jellyfin ([additional-findings.md](../research/additional-findings.md))
  - GAP-27 (low): Admins cannot tell which service a member uses, and no in-app action removes Jellyfin access ([additional-findings.md](../research/additional-findings.md))
  - GAP-30 (info): No tests cover Jellyfin sign-in, onboarding service selection, Discord, Stripe or admin behaviour for Jellyfin members ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.10 in plan.md](plan.md#step-p1110-jellyfin-member-parity-service-admin-visibility-and-tests)

**Context.** Every member row records the service the member uses, written at invite, sign-in and import and backfilled once, and onboarding and the home tiles follow it. Admins see each member's service and can turn a member's Jellyfin access off and on. Tests and seed data cover Jellyfin members end to end.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `primaryAuthService` is written on every create path, backfilled, and stored as an enum.
- [ ] Onboarding and the home tiles follow the member's service.
- [ ] Admins see each member's service and Jellyfin status, and can turn Jellyfin access off and on with an audit entry.
- [ ] The seed, the mock Jellyfin server and the sign-in, onboarding and admin tests exist and pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.11: Stripe for Jellyfin-only members

- **Labels:** bug, platform, stripe, jellyfin
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-21 to 2027-01-25 (track platform, platform lane, effort M)
- **Depends on:** P4.10, P11.10
- **Findings addressed:**
  - GAP-23 (medium): Stripe gating applies to Jellyfin-only members, but grant and revoke only act on Plex: paying sends a Plex invite to the username-derived email, and the paywall never controls Jellyfin access ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.11 in plan.md](plan.md#step-p1111-stripe-for-jellyfin-only-members)

**Context.** Paying, cancelling and comp grants act on the service the member actually uses: they enable or disable the Jellyfin account, or add or remove the Plex share. Nothing ever invites a username-derived email to Plex.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Grant and revoke act on Plex, Jellyfin or both, following the member's linked services.
- [ ] No path invites a username-derived email; members without a usable identity are skipped with a code.
- [ ] A Jellyfin administrator is never disabled, and the existing guards still hold.
- [ ] Copy, admin dialogs and `docs/stripe.md` describe the per-service behaviour, and the tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.12: Discord for Jellyfin members; stats from stored facts

- **Labels:** bug, platform, discord, jellyfin
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-25 to 2027-01-27 (track platform, platform lane, effort M)
- **Depends on:** P11.10
- **Findings addressed:**
  - GAP-25 (medium): Discord identity is plexUserId only, so `/mystats`, `/watching`, linked roles and the assistant go silently empty for Jellyfin members ([additional-findings.md](../research/additional-findings.md))
  - RWP-17 (medium): No caching of server-wide data ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P11.12 in plan.md](plan.md#step-p1112-discord-for-jellyfin-members-stats-from-stored-facts)

**Context.** Discord recognises Jellyfin members, and every command either works for them or says plainly why it cannot. `/mystats` and the linked-role hours read stored v3 Rewind facts or a bounded window of history instead of scanning a member's whole Tautulli history. This is the part of RWP-17 that Rewind deferred to January (`design/rewind-2026-design.md` 13.5).

**Acceptance criteria** (the step's "Done when" list):

- [ ] Discord identity carries Jellyfin, and every command or tool gives Jellyfin-only members a real answer or an explicit reason.
- [ ] `is_subscribed` follows access on each service.
- [ ] `/mystats` and the role hours read stored v3 facts or at most 20 pages of history for the member's year.
- [ ] `fetchTautulliStatistics` and the Discord-only v2 modules are deleted.

### P11.16: Disclosures and the admin audit trail

- **Labels:** bug, security, privacy, admin, discord
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-11 to 2027-01-13 (track security, security and ops lane, effort M)
- **Depends on:** P4.6
- **Findings addressed:**
  - GAP-32 (low): Every DM to the Discord assistant is copied into the command log and listed to admins, and members are never told admins can read their assistant conversations ([additional-findings.md](../research/additional-findings.md))
  - GAP-33 (low): Five admin actions that change or create member data emit no audit event, and admin reads of member content leave no trace ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.16 in plan.md](plan.md#step-p1116-disclosures-and-the-admin-audit-trail)

**Context.** The command log keeps only the metadata of what members type to the assistant. Members are told, where they use it, that server admins can review assistant conversations. Admin writes that change member data, and admin reads of member content, leave audit entries.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No DM or assistant question text is stored in `DiscordCommandLog`, including existing rows.
- [ ] The disclosure appears in the first reply of each session, in `/help`, at sign-in and on the help and account pages.
- [ ] The remaining member-data writes and the admin reads of member content emit audit events, with reads deduplicated per hour.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.17: Locale follow-ups

- **Labels:** bug, platform, discord
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-28 to 2027-01-28 (track platform, platform lane, effort S)
- **Depends on:** P3.10
- **Findings addressed:**
  - GAP-44 (low): The Discord assistant emits server-locale UTC dates and gets no timezone context, unlike `/mymarks` ([additional-findings.md](../research/additional-findings.md))
  - GAP-47 (info): i18n readiness: hard-coded `<html lang="en">`, no i18n layer and roughly 1,000 hard-coded UI strings ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.17 in plan.md](plan.md#step-p1117-locale-follow-ups)

**Context.** The Discord assistant knows the member's time zone and formats every date it is shown through `lib/utils/format.ts`, so "yesterday" means the member's yesterday. `<html lang>` follows `Config.locale`. A full i18n layer stays out of scope, because translation is a non-goal for 2026.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Discord assistant's prompt and tool results carry the member's zone, formatted through `lib/utils/format.ts`.
- [ ] Admin chatbot timestamps carry the server zone's offset.
- [ ] `<html lang>` follows `Config.locale`, and axe passes.
- [ ] The i18n non-goal is recorded.

### P11.20: Strict CSP

- **Labels:** bug, security
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-22 to 2027-02-24 (track security, platform lane, effort M)
- **Depends on:** P11.19
- **Findings addressed:**
  - SEC-53 (low): The CSP offers almost no XSS protection; some security headers are deprecated or overly broad ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.20 in plan.md](plan.md#step-p1120-strict-csp)

**Context.** Ship a strict Content Security Policy, nonce-based or built on `experimental.sri` as decided with P11.19's measurements, and tidy the deprecated and overly broad headers. An E2E run proves there are no violations on any route.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A strict CSP is enforced in production, with the nonce-or-SRI decision recorded.
- [ ] Violations are reported to a rate-limited endpoint, and the report-only week found none on supported routes.
- [ ] The deprecated and overly broad headers are gone, and HSTS is configurable.
- [ ] The CSP E2E passes on three browsers.

### P11.28: Watchlist sync resolves IDs and files valid TV requests

- **Labels:** bug, platform
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-04 to 2027-01-06 (track platform, platform lane, effort M)
- **Depends on:** P4.13
- **Findings addressed:**
  - GAP-02 (high): Watchlist sync expects external IDs in a listing that does not carry them and reads only one unpaged response, so it most likely requests nothing while reporting success ([additional-findings.md](../research/additional-findings.md))
  - GAP-03 (medium): Overseerr TV requests omit `seasons`, which makes Overseerr throw a 500; 202 and 403 replies are misclassified, and 4K status is never checked ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.28 in plan.md](plan.md#step-p1128-watchlist-sync-resolves-ids-and-files-valid-tv-requests)

**Context.** Watchlist sync reads the whole watchlist, looks up each item's TMDB and TVDB IDs, and files TV requests that Overseerr accepts. Each reply is classified correctly, and the card reports skipped items honestly. It lands after P4.13, so working requests never go out under the admin key.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The whole watchlist is paged, and TMDB and TVDB IDs come from per-item metadata, cached per item.
- [ ] TV requests send seasons, and 202, 403, 409 and 4K status are handled correctly.
- [ ] The card reports requested, available, already requested, skipped and refused items.
- [ ] The recorded-response contract tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.31: One active row per service: audit, then a reviewed apply

- **Labels:** bug, platform, database
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-19 to 2027-01-21 (track platform, platform lane, effort M)
- **Depends on:** P9.3
- **Findings addressed:**
  - DUP-05 (medium): Setup-wizard saves duplicate the admin server-update logic but never deactivate old rows, so Back + re-save leaves two active configs ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P11.31 in plan.md](plan.md#step-p1131-one-active-row-per-service-audit-then-a-reviewed-apply)

**Context.** Leave exactly one active row per service without silently switching the config the app uses today. A dry-run audit lists the duplicates, a reviewed apply keeps the right row and records the rest, and every active read gains a deterministic order. This was the destructive half of the former P6.14's migration; it runs after the final cut, behind the owner's confirmation.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The audit lists every duplicate active row with its connection result and today's choice, and the owner confirmed the keeps.
- [ ] The apply left one active row per service, recorded the deactivated ids, and is idempotent.
- [ ] Every active read of the seven models has a deterministic order, enforced by a test.
- [ ] Dump taken before the apply.

### P11.32: Claim the server before first-run setup

- **Labels:** bug, security
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-19 to 2027-01-21 (track security, security and ops lane, effort M)
- **Depends on:** P4.3
- **Findings addressed:**
  - SEC-30 (medium): Setup wizard actions are unauthenticated until setup completes, so a fresh install exposed to the internet can be hijacked ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.32 in plan.md](plan.md#step-p1132-claim-the-server-before-first-run-setup)

**Context.** Until setup completes, only the person who can read the container log, or who set `SETUP_TOKEN`, can call a setup action. A fresh install exposed to the internet can then no longer be taken over between container start and the end of the wizard. This was P4.4; it moved to January because it protects only fresh installs and P10.24 and P10.25 build the wizard on it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every setup action, `fetchLLMModels` and `getDevDefaults` require a claim before completion and an admin after it.
- [ ] The setup code is printed once per boot, stored only as a hash, compared in constant time, rate-limited and single-use, and `SETUP_TOKEN` overrides it.
- [ ] Today's wizard shows the claim screen, and the E2E spec claims before it continues.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

## New Features

### [READY] P2.1: Rewind 2026 schema migration and versioned stored-data parser

- **Labels:** enhancement, rewind, database
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-22 to 2026-10-23 (track rewind, Rewind lane, effort M)
- **Depends on:** P0.8, P0.20
- **Findings addressed:**
  - BP-26 (medium): Rewind data is stored as an untyped JSON string with a free-text status and no validation on read; redundant indexes; import N+1 ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - DUP-10 (medium): WrappedData has no runtime schema: 12 unchecked JSON.parse sites and types declared three times ([code-duplication.md](../research/code-duplication.md))
  - RWP-21 (low): The viewer data contract is untyped and unvalidated ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.1 in plan.md](plan.md#step-p21-rewind-2026-schema-migration-and-versioned-stored-data-parser)

**Context.** Land every schema change Rewind 2026 needs in one reviewed migration. Route every read of stored Rewind data through one versioned, Zod-validated parser, so that no v1, v2 or v3 row can crash a page or drift silently.

**Acceptance criteria** (the step's "Done when" list):

- [ ] One `rewind_2026` migration adds every model and field in design 7.10 and drops the 8 redundant indexes, and the drift check is clean.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] No unchecked `JSON.parse` of `PlexWrapped.data` remains outside `parse-stored.ts` and the strip transform.
- [ ] `status` is read through the Zod enum, and the v1, v2 and v3 fixture tests pass.
- [ ] The admin history viewer works for v2 rows, and the `WrappedData` types are declared once.

### [READY] P2.2: Server and member time zones and the zone-aware year window

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-26 to 2026-10-27 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.1
- **Findings addressed:**
  - RWP-03 (high): Hour, day, month and year bucketing ignores the viewer's timezone; the year window is UTC while the buckets use server-local time ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - GAP-40 (medium): Admin-entered wall-clock values are converted to instants in the wrong timezone: announcement expiry and the Rewind generation window ([additional-findings.md](../research/additional-findings.md))
  - GAP-43 (low): No timezone policy: server-rendered admin timestamps show unlabelled container time (UTC in Docker), client-rendered ones show browser time, and the same page mixes both ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P2.2 in plan.md](plan.md#step-p22-server-and-member-time-zones-and-the-zone-aware-year-window)

**Context.** One time-zone policy for the app and for Rewind. The server zone is `Config.timezone`, then a valid `TZ`, then UTC. Rewind buckets every play by its wall-clock parts in the member's zone, and admin-entered dates and times mean what the admin typed.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `serverZone()` resolves `Config.timezone`, then a valid `TZ`, then UTC, and the setting stores canonical IANA names.
- [ ] Rewind buckets come only from `Intl` date parts, and the four-zone, DST and 31 December tests pass under both process zones.
- [ ] Season dates are month-day values evaluated in the server zone, and the legacy dates are migrated with the same result under any session time zone.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] Announcement expiry and the season form round-trip what the admin typed.

### [READY] P2.4: Rewind sources with Zod and PlayEvent

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-28 to 2026-10-29 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.2, P2.3
- **Findings addressed:**
  - RWP-05 (medium): Tautulli leaderboard calls use parameters and fields the API does not have ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-06 (medium): Overseerr stats misread the API ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-07 (medium): Stat definitions are inconsistent and lossy ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-20 (medium): The pipeline is duplicated and has drifted, upstream responses are unvalidated, and there are four polling implementations including dead components ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - BP-24 (medium): Rewind data collection downloads the whole Plex library, the user's lifetime Tautulli history and every Overseerr request for each user, with no effective timeouts ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P2.4 in plan.md](plan.md#step-p24-rewind-sources-with-zod-and-playevent)

**Context.** Today the Rewind data calls use parameters the APIs do not have, skip validation, and download each member's lifetime history and the whole library (RWP-05, RWP-20, BP-24). Read each member's year from Tautulli, Overseerr and Plex once, correctly and with validation, and give the stats engine `PlayEvent[]` instead of raw rows.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `tautulli-history.ts` reads with `after` and `before` in the Rewind zone and `grouping=1`, and pages until `recordsFiltered` is reached.
- [ ] Overseerr requests are paged by `requestedBy`, statuses are mapped, genres come by `tmdbId`, and users are matched by `plexId`.
- [ ] Every response is validated in `sources/schemas.ts`, and the private fields never get past the parser.
- [ ] One watched rule is exported, and no source calls `get_item_user_stats` or `get_home_stats`.
- [ ] Excluded library sections are dropped in `toPlayEvent()`, and `LibraryItem` carries the content rating and section that P2.6's rating exclusions use.
- [ ] The fixture tests use real field names and pass.

### [READY] P2.5: Rewind queues, locks, semaphore and fail-fast Redis

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-29 to 2026-10-30 (track rewind, Rewind lane, effort M)
- **Depends on:** P4.2
- **Findings addressed:**
  - BP-20 (low): Queue jobs lack deduplication, and request-path enqueues can hang on Redis ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-22 (medium): Rewind generation runs synchronously in a Server Action; polls queue behind it; no queue, stuck-job recovery, concurrency guard or provider retry ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P2.5 in plan.md](plan.md#step-p25-rewind-queues-locks-semaphore-and-fail-fast-redis)

**Context.** Give Rewind its own queues and the Redis primitives every later job uses: a per-member lock, a cross-process semaphore for upstream calls, and a request-path client that fails fast with the FR-50 message when Redis is missing or down. P2.17 builds the generation job on top.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The three Rewind queues and their Workers start with the worker, and drain on shutdown.
- [ ] The per-member lock and the semaphore work across processes, with owner-only release, and their Redis tests pass in CI.
- [ ] Request paths fail fast with the FR-50 codes when Redis is missing or down.

### P2.17: Generation becomes a job: processor, actions and status hook

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-02 to 2026-11-03 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.5, P2.1, P0.12, P4.2
- **Findings addressed:**
  - RWP-11 (medium): Generation runs synchronously in one server action ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-43 (medium): The Rewind generation pipeline runs synchronously in a server action, has no repair or retry on schema failure, and fails the whole Rewind on one bad LLM response ([security-audit.md](../research/security-audit.md))
  - RWP-14 (medium): Regeneration is not atomic and real versioning is missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - BP-22 (medium): Rewind generation runs synchronously in a Server Action; polls queue behind it; no queue, stuck-job recovery, concurrency guard or provider retry ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - RWP-20 (medium): The pipeline is duplicated and has drifted, upstream responses are unvalidated, and there are four polling implementations including dead components ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.17 in plan.md](plan.md#step-p217-generation-becomes-a-job-processor-actions-and-status-hook)

**Context.** Generation stops running inside a request. It becomes a deduplicated, locked and time-limited job on P2.5's queues. A regeneration never hides the current Rewind, and the member UI polls one light status query.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Generation is a `REWIND_GENERATE_USER` job with deduplication, P2.5's per-member lock and an enforced time limit.
- [ ] A `RewindGeneration` row records every attempt, and the final write is atomic and keeps `previousData`.
- [ ] `REWIND_STALE_SWEEP` recovers each lost run once.
- [ ] One status hook replaces the polling loops, and no poll carries `data`.

### P2.6: Server-wide history pass and metadata cache

- **Labels:** enhancement, rewind, performance
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-02 to 2026-11-03 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.4, P2.5
- **Findings addressed:**
  - RWP-17 (medium): No caching of server-wide data ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-18 (medium): Rich data the pipeline already downloads is discarded, so two archetypes can never win and key "better stats" are missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - BP-24 (medium): Rewind data collection downloads the whole Plex library, the user's lifetime Tautulli history and every Overseerr request for each user, with no effective timeouts ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P2.6 in plan.md](plan.md#step-p26-server-wide-history-pass-and-metadata-cache)

**Context.** Read server-wide data once per batch instead of once per member. One paged history pass feeds the percentile, the viewer ranks and the community facts, and one shared metadata cache feeds genres, people and request matching.

**Acceptance criteria** (the step's "Done when" list):

- [ ] One paged server-wide `get_history` pass per batch fills `RewindServerAggregate`, and community facts need 3 or more contributors.
- [ ] `REWIND_METADATA_WARM` fills the cache for the titles that cover 95% of each member's minutes, at concurrency 4 with 10 s timeouts.
- [ ] Member reads go through the per-batch event cache, with a per-member fallback.
- [ ] Content-rating exclusions apply to every title, fail closed on an unknown rating, and keep the title in totals.
- [ ] The fixture tests pass, and the v3 path makes no per-member Plex library scan.

### [READY] P2.7: Stats modules, part 1

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-30 to 2026-11-02 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.4
- **Findings addressed:**
  - RWP-07 (medium): Stat definitions are inconsistent and lossy ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-03 (high): Hour, day, month and year bucketing ignores the viewer's timezone; the year window is UTC while the buckets use server-local time ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.7 in plan.md](plan.md#step-p27-stats-modules-part-1)

**Context.** Stat definitions are inconsistent today, and the hour, day and month buckets ignore the viewer's time zone (RWP-07, RWP-03). Pure, tested modules for the volume and habit facts, computed on `PlayEvent[]` in the member's zone, so that every number on pages 02, 03, 09, 10, 11 and 12 has a single definition.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Totals, sessions, time, calendar, bookends, race and milestones are pure modules over `PlayEvent[]`.
- [ ] Titles are keyed by `rating_key` and `grandparent_rating_key`, minutes are floored once, and the watched rule comes from P2.4.
- [ ] Every bucket uses the member's zone, and the zone and DST tests pass.
- [ ] Each module is at most about 150 lines and has its own Jest file.

### P2.8: Stats modules, part 2

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-03 to 2026-11-04 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.6, P2.7
- **Findings addressed:**
  - RWP-18 (medium): Rich data the pipeline already downloads is discarded, so two archetypes can never win and key "better stats" are missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-06 (medium): Overseerr stats misread the API ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.8 in plan.md](plan.md#step-p28-stats-modules-part-2)

**Context.** Pure modules for the facts that need metadata, requests or other members. They read the cache and the aggregate through injected lookups, so they can be tested without Prisma.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Taste, people, devices, requests, community and next-year are pure modules that read the cache and the aggregate through injected lookups.
- [ ] Request outcomes are joined through cached guids, and the status mapping matches design 7.2.
- [ ] Community facts and viewer ranks follow the contributor rules.
- [ ] No module can read player names or IP addresses, and every module has tests.

### P2.9: Fact catalogue, build-facts and archetype scorers v3

- **Labels:** enhancement, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-04 to 2026-11-05 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.7, P2.8
- **Findings addressed:**
  - RWP-18 (medium): Rich data the pipeline already downloads is discarded, so two archetypes can never win and key "better stats" are missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-16 (low): LLM-written text and leftover LLM-computed fields are never checked against the stats ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.9 in plan.md](plan.md#step-p29-fact-catalogue-build-facts-and-archetype-scorers-v3)

**Context.** Turn the stats into the frozen fact sheet that pages, cards and the LLM read, and pick the archetype in code with real scorers for all twelve. The member's archetype, its evidence and the server's rarity count then always agree.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `catalogue.ts`, `build-facts.ts` and `fact-sheet.ts` exist, `FactId` is a closed union, and `factsHash` is stable.
- [ ] All twelve archetypes have real scorers that return evidence fact ids, with volume gates, the fixed tie-break and rarity.
- [ ] The aggregate's `archetypeCounts` and `medians` come from the same scorers, and the consistency test passes for every fixture.
- [ ] The four LLM-computed fields are gone from the v2 schema, the prompt and the v3 contract.

### [READY] P2.11: Provider-agnostic AI facade

- **Labels:** enhancement, rewind, llm
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-26 to 2026-10-27 (track rewind, Rewind lane, effort M)
- **Depends on:** P0.13, P2.1
- **Findings addressed:**
  - RWP-15 (medium): The LLM integration is OpenAI-only raw fetch with brittle model-name checks, defaults that conflict with GPT-5, and no retry or deterministic fallback ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-22 (low): Cost tracking misses billed failures and over-reports unknown models at GPT-4 prices ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-44 (medium): Two duplicated, hand-rolled OpenAI clients detect model capabilities by name prefix, which is brittle for newer models and OpenAI-only ([security-audit.md](../research/security-audit.md))
  - DUP-04 (medium): Two hand-written OpenAI chat clients with copy-pasted, disagreeing model-capability checks ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P2.11 in plan.md](plan.md#step-p211-provider-agnostic-ai-facade)

**Context.** One path for every structured LLM call, whatever the provider: model facts in one table, typed finish reasons, retries, and a usage row for every billed attempt. v2 generation moves onto it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The AI SDK 7 packages are pinned to exact versions, and `engines.node` is `>=22`.
- [ ] `models.ts`, `registry.ts`, `generate-structured.ts` and `usage.ts` exist, with tests on mocked providers.
- [ ] `lib/llm/pricing.ts`, `lib/wrapped/api-calls.ts` and every model-name prefix check are deleted.
- [ ] Billed failures are recorded with cached and reasoning tokens, and unknown models cost 0 with a warning.
- [ ] v2 generation runs on the facade.

### [READY] P2.12: LLM provider settings and the admin assistant on the registry

- **Labels:** enhancement, rewind, llm, admin
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-29 to 2026-10-30 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.11
- **Findings addressed:**
  - DUP-04 (medium): Two hand-written OpenAI chat clients with copy-pasted, disagreeing model-capability checks ([code-duplication.md](../research/code-duplication.md))
  - SEC-44 (medium): Two duplicated, hand-rolled OpenAI clients detect model capabilities by name prefix, which is brittle for newer models and OpenAI-only ([security-audit.md](../research/security-audit.md))
  - RWP-15 (medium): The LLM integration is OpenAI-only raw fetch with brittle model-name checks, defaults that conflict with GPT-5, and no retry or deterministic fallback ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.12 in plan.md](plan.md#step-p212-llm-provider-settings-and-the-admin-assistant-on-the-registry)

**Context.** Admins can choose OpenAI, Anthropic, Google or an OpenAI-compatible server, and the settings shown are the ones each model really supports. The admin assistant and Discord DMs run on the same registry, so no provider row can break them.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The form has a provider select, base-URL presets, effort where the model supports it, models from `models.list`, and each model's price and retirement date.
- [ ] Base URLs are validated and admin-only, and a stored key is never sent to a new origin.
- [ ] The admin assistant and Discord DMs run on the registry, and a non-OpenAI row cannot break them.
- [ ] `lib/connections/openai.ts`, the models API route and `openai-params.ts` are gone, and the component and action tests pass.

### [READY] P2.13: Fonts, typesetting, Rewind format and the registry skeleton

- **Labels:** enhancement, rewind, ui
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-29 to 2026-11-03 (track rewind, Rewind lane, effort L)
- **Depends on:** P3.10
- **Findings addressed:**
  - RWV-08 (medium): No web fonts loaded: the display serif and sans fall back to system fonts, and share images use a different face ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-01 (high): MarqueeText letter-splitting hides the archetype name and breaks every slide title mid-word ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-20 (medium): Typography: no loaded fonts, an OS-dependent serif for Rewind, 15 different h1 styles, and sub-12px text ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P2.13 in plan.md](plan.md#step-p213-fonts-typesetting-rewind-format-and-the-registry-skeleton)

**Context.** Rewind loads no web fonts today, and its per-letter MarqueeText hides the archetype name and breaks titles mid-word (RWV-08, RWV-01, UI-20). Build Rewind's typographic base: subset, renamed OFL fonts for pages and cards; a typesetter that fits text from built metrics and never breaks a word; Rewind's number rules; and the page registry that later Rewind steps fill in.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The font build reproduces the files from pinned sources, with OFL licences and renamed families, within the NFR-5 budget.
- [ ] `fit-lines` reproduces the mockup fits, never breaks a word, applies the one-step spread rule and passes the 200-title fixture.
- [ ] `lib/rewind/format.ts` adds the non-breaking space and plural rules on top of `lib/utils/format.ts`.
- [ ] The registry lists all 18 pages, with `spot`, `table` and `select` stubs.
- [ ] The v2 marquee no longer splits words.

### [READY] P3.1: Semantic tokens and the Rewind scope contract

- **Labels:** enhancement, ui
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-10-26 to 2026-10-27 (track ui, UI lane, effort M)
- **Depends on:** P1.6, P1.7, P1.8
- **Findings addressed:**
  - UI-18 (medium): No theme foundation: no semantic tokens, no body canvas, no dark color-scheme, and `<body>` is the scroll container ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.1 in plan.md](plan.md#step-p31-semantic-tokens-and-the-rewind-scope-contract)

**Context.** Replace today's `app/globals.css`, which holds six animation tokens and six cinematic colours, with the token file of `design/ui-design-system.md` 4.1. It carries the light and dark sets, the unlayered Rewind ink contract (4.4, Rewind 5.2 and 5.3), the Tailwind mapping, the type steps, and a base layer with the reduced-motion clamp. The v2 viewer keeps rendering through temporary aliases, and every screenshot diff is reviewed.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `app/globals.css` matches 4.1 and 4.4 section by section, with the Rewind block between the markers.
- [ ] The height rule, the cinematic colours and the decorative loops are gone, and the aliases are marked for deletion in P11.29.
- [ ] `globals-css.test.ts`, `cn.test.ts` and `theme-contract.spec.ts` pass.
- [ ] The baselines are regenerated with every diff explained, and the axe and design-debt baselines are lowered where counts fell.

### P3.2: Fonts and root layout

- **Labels:** enhancement, ui, accessibility
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-11-04 to 2026-11-05 (track ui, UI lane, effort M)
- **Depends on:** P3.1, P4.1
- **Findings addressed:**
  - UI-11 (medium): Pinch-zoom is disabled on every page (WCAG 1.4.4 Resize Text) ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-20 (medium): Typography: no loaded fonts, an OS-dependent serif for Rewind, 15 different h1 styles, and sub-12px text ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-10 (high): Status messages, focus and landmark semantics are missing: silent toasts, focus loss in wizards, no `aria-current`, no `<main>` or skip link, skipped heading levels ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-05 (medium): Header and viewport config gaps: static unsafe CSP, pinch-zoom disabled, one title for every page, no next/font, dead webpack block ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - RWV-09 (high): Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-07 (medium): Status and error query params from Discord and NextAuth are silently dropped ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.2 in plan.md](plan.md#step-p32-fonts-and-root-layout)

**Context.** Load IBM Plex through `next/font`, and make the root layout correct for every page: zoom allowed, a skip link to one `<main id="main">` per route, a token canvas, real titles, an announced toast region, and status codes in the URL turned into toasts. Enable `typedRoutes`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Plex Sans and Plex Mono load through `next/font` on every page.
- [ ] No route has zoom locks, and every route has one `main#main` reached by the skip link.
- [ ] Toasts sit in a "Notifications" region and are announced.
- [ ] `FlashFromQuery` handles every code in `flash-codes.ts`, and never renders query text.
- [ ] `typedRoutes` is on, and typecheck passes with generated route types.
- [ ] The axe and visual baselines are updated.

### [READY] P3.3: Token mirror module and contrast tests

- **Labels:** enhancement, ui, accessibility
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-10-28 to 2026-10-28 (track ui, UI lane, effort S)
- **Depends on:** P3.1
- **Findings addressed:**
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.3 in plan.md](plan.md#step-p33-token-mirror-module-and-contrast-tests)

**Context.** Mirror the CSS tokens in one TypeScript module for Satori, Chart.js and Rewind (`design/ui-design-system.md` 4.3). Prove in Jest that the two stay in sync, and that every text pair passes WCAG: 4.5:1 in both app themes and 7:1 on every Rewind ink.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/design/tokens.ts` holds `themes`, `rewindInks`, `archetypeInks` and `inkProps`, and `lib/design/color.ts` holds the colour maths.
- [ ] The sync, hex, app-contrast, Rewind-contrast, closing-set and chart checks pass.
- [ ] The recipe test and `expectNoDarkInsideLight` exist for later steps.
- [ ] The knip entry is recorded with its removal step.

### [READY] P3.4: Base primitives on Base UI behind adapters

- **Labels:** enhancement, ui
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-10-27 to 2026-10-30 (track ui, UI lane, effort L)
- **Depends on:** P3.1
- **Findings addressed:**
  - UI-17 (high): The shared primitives exist but are bypassed at scale, partly because they lack features ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-27 (low): Primitive quality gaps: a white focus halo, `focus:` instead of `focus-visible:`, template-string classes, a deprecated export, and 9 of 18 primitives untested ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-44 (low): One full-screen loading screen for every admin route, brand-text spinners elsewhere, and no skeleton primitive ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - DUP-14 (medium): UI primitives exist but are rarely adopted: 108-115 hand-copied panels, 32-34 inline spinners, 243 inline SVGs, duplicated filters, charts, modals and status panels ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P3.4 in plan.md](plan.md#step-p34-base-primitives-on-base-ui-behind-adapters)

**Context.** Add `components.json` and generate the shadcn Base UI Button, Card, Badge and StatusBadge, Alert, Spinner and Skeleton, restyled to the 5.4 recipes. Today's exports stay as `@deprecated` adapters (9.4), so the 41 Button importers and the other call sites keep compiling. Lint starts warning on raw elements.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `components.json` exists, and the six primitives follow the 5.4 recipes on Base UI.
- [ ] The adapters keep every old prop, and every existing `data-testid` survives.
- [ ] Each primitive has a component test with axe, and the moved tests pass.
- [ ] The raw-element ESLint warnings are on, and `/dev/ui` has its visual baseline.

### P3.5: Form primitives and the Field pattern

- **Labels:** enhancement, ui, accessibility
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-11-03 to 2026-11-04 (track ui, UI lane, effort M)
- **Depends on:** P3.4
- **Findings addressed:**
  - UI-13 (medium): Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-14 (medium): The dropdown and menu layer is ad hoc: no listbox semantics, no arrow keys or Escape, inline rendering trapped by stacking contexts, no z-index scale ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-27 (low): Primitive quality gaps: a white focus halo, `focus:` instead of `focus-visible:`, template-string classes, a deprecated export, and 9 of 18 primitives untested ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.5 in plan.md](plan.md#step-p35-form-primitives-and-the-field-pattern)

**Context.** Add Input, Textarea, Label, Field, Checkbox, Switch and Select on Base UI. Field wires the label, the description and the error to the control (UI-13), and Select brings listbox semantics, a portal and typeahead (UI-14). StyledInput, StyledTextarea, StyledCheckbox and StyledDropdown stay as adapters.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The seven primitives, `FormField` and `PortalContainer` exist and follow 5.4.
- [ ] The four adapters keep their props, test ids and hidden input.
- [ ] Labelling and keyboard tests pass with axe, and the moved tests pass.
- [ ] The four date inputs are labelled, and their axe entries are gone.

### P3.6: Overlay and feedback primitives

- **Labels:** enhancement, ui, accessibility
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-11-02 to 2026-11-03 (track ui, UI lane, effort M)
- **Depends on:** P3.4
- **Findings addressed:**
  - UI-10 (high): Status messages, focus and landmark semantics are missing: silent toasts, focus loss in wizards, no `aria-current`, no `<main>` or skip link, skipped heading levels ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-14 (medium): The dropdown and menu layer is ad hoc: no listbox semantics, no arrow keys or Escape, inline rendering trapped by stacking contexts, no z-index scale ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-42 (medium): Action, confirm and toast patterns are re-implemented per button; the confirm dialog has no pending state, and toasts appear under the modal backdrop ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.6 in plan.md](plan.md#step-p36-overlay-and-feedback-primitives)

**Context.** Add Dialog, AlertDialog, ConfirmDialog with a pending state, `useActionDialog`, DropdownMenu, Popover and Tooltip, and a Base UI Toast behind the unchanged `useToast` facade. Toasts become live regions, errors persist, toasts with actions never auto-dismiss, and toasts render above dialogs (UI-10, UI-42). ModalShell and ConfirmModal stay as adapters.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The seven primitives and `useActionDialog` follow 5.4 and 5.5.
- [ ] Toasts keep the facade, announce through live regions, persist for errors and actions, and render above dialogs.
- [ ] The ModalShell and ConfirmModal adapters keep their props, and ConfirmModal callers get a pending state.
- [ ] Every primitive has tests, and the E2E toast helper uses test ids.

### P3.7: Rewind-ready primitives

- **Labels:** enhancement, ui, rewind
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-11-04 to 2026-11-05 (track ui, UI lane, effort M)
- **Depends on:** P3.4, P3.6
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P3.7 in plan.md](plan.md#step-p37-rewind-ready-primitives)

**Context.** Add Sheet (right or bottom, with an optional grabber), Toggle, Slider (with `aria-valuetext`) and SegmentedControl, plus the Rewind-only Button entries `ink`, `ink-outline`, `pill` and `icon-pill`, which lint restricts to `components/rewind/**`. Draw all of them in both themes and in ink, and merge by 2026-11-08 so the Rewind story work (P5.1, P5.2) can start.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Sheet, Toggle, Slider and SegmentedControl follow 5.4, with tests.
- [ ] The four Button entries exist, and lint rejects them outside `components/rewind/**`.
- [ ] `/dev/ui` draws every primitive in dark, light and three inks, with visual and axe coverage.
- [ ] Everything is merged by 2026-11-08.

### P3.9: Status vocabulary, icons, brand and chart theme

- **Labels:** enhancement, ui
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-11-04 to 2026-11-05 (track ui, UI lane, effort M)
- **Depends on:** P3.3, P2.1
- **Findings addressed:**
  - UI-26 (low): The icon system is inline SVG copy-paste; lucide-react is installed but used once; `service-icons.tsx` is dead and points at missing files ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-39 (medium): Branding, page titles and social metadata are inconsistent or missing; "Rewind" appears nowhere ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-24 (medium): Charts: 14 files each register Chart.js and hard-code their own theme; no accessible names, repeated tick labels, invented curves, UTC date shifts and an inflated cost projection ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P3.9 in plan.md](plan.md#step-p39-status-vocabulary-icons-brand-and-chart-theme)

**Context.** Give the app one status vocabulary, one icon map, one brand module, one chart theme and real app icons, a manifest and a default OG image. Each module is used by at least one production caller, and CLAUDE.md's file tree lists the new folders.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `status.ts`, `icons.ts`, `poster-palette.ts`, `brand.ts` and `charts/theme.ts` exist with tests, and each has a production importer.
- [ ] The icons, manifest and default OG image render offline from committed fonts within the 300 KB budget.
- [ ] Hard-coded product names use `lib/brand.ts`.
- [ ] CLAUDE.md's tree lists the new folders.

### P5.1: Rewind routes, layout and redirects

- **Labels:** enhancement, rewind
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-09 to 2026-11-09 (track rewind, Rewind lane, effort S)
- **Depends on:** P3.1, P3.7, P2.13, P0.14
- **Findings addressed:**
  - RWP-04 (high): Year rollover is broken: the viewer always loads the calendar year while generation uses the configured wrappedYear ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWV-02 (high): `/wrapped` always uses the calendar year: from 1 Jan 2027 the 2026 Rewind says "No Wrapped Found", and past years cannot be viewed ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-02 (high): Rewind entry breaks across the year boundary; no archive of past years and no exit from the viewer ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-39 (medium): Branding, page titles and social metadata are inconsistent or missing; "Rewind" appears nowhere ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P5.1 in plan.md](plan.md#step-p51-rewind-routes-layout-and-redirects)

**Context.** Move Rewind to `/rewind` and `/rewind/[year]`. The year comes from the member's data, so January opens last year's issue, and one scope root carries the Rewind fonts, the paper popup portal and a close control. Old `/wrapped` links, share links included, keep working through permanent redirects.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/rewind` opens the latest completed year, `/rewind/[year]` opens any of the member's years, and every other state shows a status panel.
- [ ] The layout is the scope root, with the Rewind fonts, the paper portal and a safe close control.
- [ ] Both permanent redirects resolve in order, and `/rewind/s/:token` serves surviving share links.
- [ ] Titles read "{server name} Rewind {year}", and no in-app link points at `/wrapped`.
- [ ] The unit tests and the January-routing E2E pass.

### P5.2: Story stage and player

- **Labels:** enhancement, rewind
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-09 to 2026-11-12 (track rewind, Rewind lane, effort L)
- **Depends on:** P3.7, P2.13
- **Findings addressed:**
  - RWV-03 (high): Not a story player: no keyboard, tap, swipe or pause; autoplay stops at the first tap; progress bar hidden under the letterbox; 8s intro cannot be skipped ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-04 (high): Slides are not built for a 9:16 phone stage: they overflow the viewport, scroll sideways and truncate titles ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-09 (high): Rewind viewer: no pause or keyboard shortcuts, prohibited ARIA on slide titles, mid-word title breaks on mobile, unskippable intro ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - RWV-13 (low): Performance: 20 Hz React re-render of the whole slide during autoplay, width-animated progress, chart.js shipped to v2, full-size posters for thumbnails ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.2 in plan.md](plan.md#step-p52-story-stage-and-player)

**Context.** Build a real story player on a fixed 9:16 artboard, with tap, swipe, hold and keyboard input, autoplay that survives manual navigation, and a visible Pause. Its progress costs zero React renders per frame.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `fit-stage` returns the expected chrome and scale for every listed viewport, and the story never scrolls.
- [ ] The reducer implements every state and transition in design 14.3, and autoplay survives manual turns.
- [ ] Taps, swipes, hold, the Pause long-press and the stage-scoped keyboard map all work, and each gesture has a button equivalent.
- [ ] Progress is CSS-driven with zero React renders per frame, and Settings, Pause and Close are `ink-outline icon-pill` Buttons with their test ids.
- [ ] The Rewind motion check enforces NFR-6 in CI, with a test per rule.

### P5.3: Story sheets and accessibility semantics

- **Labels:** enhancement, rewind, accessibility
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-13 to 2026-11-16 (track rewind, UI lane, effort M)
- **Depends on:** P5.2
- **Findings addressed:**
  - RWV-09 (high): Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-09 (high): Rewind viewer: no pause or keyboard shortcuts, prohibited ARIA on slide titles, mid-word title breaks on mobile, unskippable intro ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P5.3 in plan.md](plan.md#step-p53-story-sheets-and-accessibility-semantics)

**Context.** Add the Settings and Table sheets, the per-device preferences, and the semantics a screen reader and a keyboard need. Each page is announced exactly once, motion follows the member's setting, and small or zoomed screens are offered article mode.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Settings and Table sheets work from their buttons and keys, and the preferences live in `localStorage` with safe defaults.
- [ ] The stage is a labelled region, each page is a labelled article with a real `h2`, and no generic span carries `aria-label`.
- [ ] User turns move focus to the heading, automatic turns are announced once through the polite live region, and focus on a control pauses autoplay.
- [ ] Rewind's own reduced-motion rule keeps the 120 ms crossfades and the dwell timing.
- [ ] Article mode is offered below the 0.8 scale floor and at 130% text size.

### P5.5: Registry and the front pages

- **Labels:** enhancement, rewind
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-12 to 2026-11-13 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.2, P2.9, P2.16
- **Findings addressed:**
  - RWV-07 (high): Five visual identities in one Rewind journey; the cinematic theme stops at the slide edges ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-10 (medium): Copy and pacing: the eyebrow repeats the title, narratives repeat the number, the finale credits box is empty, reveals are too slow for tapping ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-11 (medium): Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-12 (medium): No slide registry: two duplicated theme trees, two switch dispatchers, copy split between lib and components, stored data never validated, dead files ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.5 in plan.md](plan.md#step-p55-registry-and-the-front-pages)

**Context.** Make the registry the single owner of what a page is: its data, schema, summary, ink, table and share facts. Build the three front pages on it. Pages that have no data omit themselves, and the folio and progress renumber.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every registry entry declares `select`, `schema`, `srSummary`, `spot`, `table` where it applies, and `share.facts`.
- [ ] `selectPages` omits null and disabled pages, renumbers the folio and progress, and drops stored pages that fail validation.
- [ ] Pages 01, 02 and 03 match the design on the heavy, median and light fixtures, with the soundtrack from `lib/rewind/viz`, the cut choice and the data-window line.
- [ ] No page shows an eyebrow, a zero count or a hard-coded colour, and the component and visual tests pass.

### P5.6: Features pages: Guess, Top shows, Top films

- **Labels:** enhancement, rewind
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-16 to 2026-11-17 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.5
- **Findings addressed:**
  - RWV-11 (medium): Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-04 (high): Slides are not built for a 9:16 phone stage: they overflow the viewport, scroll sideways and truncate titles ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.6 in plan.md](plan.md#step-p56-features-pages-guess-top-shows-top-films)

**Context.** Build the quiz and the two top lists, with long titles intact, full-colour No. 1 posters and title cards that never collapse. Add the poster primitive and the Rewind poster route they need.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The quiz is a radiogroup that holds autoplay, and it is omitted with fewer than 3 candidates or a gap of 2% or less.
- [ ] The match cut runs in a stage-level layer, and reduced motion skips it.
- [ ] Top shows and Top films match the design, with full-colour No. 1 posters, duotone rows and title-card fallbacks that keep their size.
- [ ] The Rewind poster route serves sized and toned WebP from a disk cache under P0.16's access rules.
- [ ] Tests and baselines pass for pages 04 to 06.

### P5.7: Habits and centrefold: Clock, Calendar, Centrefold, Back cover

- **Labels:** enhancement, rewind
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-13 to 2026-11-16 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.5
- **Findings addressed:**
  - RWV-01 (high): MarqueeText letter-splitting hides the archetype name and breaks every slide title mid-word ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-07 (high): Five visual identities in one Rewind journey; the cinematic theme stops at the slide edges ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-10 (medium): Copy and pacing: the eyebrow repeats the title, narratives repeat the number, the finale credits box is empty, reveals are too slow for tapping ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.7 in plan.md](plan.md#step-p57-habits-and-centrefold-clock-calendar-centrefold-back-cover)

**Context.** Build pages 09, 10, 16 and 18, from the evidence clock to the identity reveal and the clean exit. The archetype name never breaks inside a word, and the back cover shows the whole year at rest, with sharing and a way out.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Pages 09, 10, 16 and 18 match the design, with the evidence clock, the calendar strip and the billing block.
- [ ] The archetype name is fitted without mid-word breaks, and the E2E check passes on chromium and webkit.
- [ ] "Why this?", the AI disclosure and the privacy line are present.
- [ ] Done, Read again and Contents work.
- [ ] Tests and baselines pass for all four pages.

### P5.8: Copy slots, templates, grounding and token rendering

- **Labels:** enhancement, rewind, llm
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-06 to 2026-11-09 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.9
- **Findings addressed:**
  - RWP-16 (low): LLM-written text and leftover LLM-computed fields are never checked against the stats ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - SEC-46 (low): Prompt placeholder substitution interprets `$` patterns in user and media strings ([security-audit.md](../research/security-audit.md))
  - RWV-10 (medium): Copy and pacing: the eyebrow repeats the title, narratives repeat the number, the finale credits box is empty, reveals are too slow for tapping ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.8 in plan.md](plan.md#step-p58-copy-slots-templates-grounding-and-token-rendering)

**Context.** Make every word on a page either a deterministic template or model text that has passed a mechanical check against the facts. Numbers and titles enter text only through tokens, which are inserted literally whatever characters they contain.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `slots.ts` declares every slot with its limits, allowed facts, identity facts and bands, and `slotDependencyHash` is stable.
- [ ] Templates exist for every headline and slot, with variants and window wording keyed on `window.finalCut`.
- [ ] All eight grounding rules have passing and failing fixtures, including the "Most of it after dark" line.
- [ ] `render-copy` inserts titles containing `$` patterns literally, and the v2 prompt substitution uses a replacer function.

### P5.9: The v3 pipeline end to end

- **Labels:** enhancement, rewind, llm
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-09 to 2026-11-12 (track rewind, Rewind lane, effort L)
- **Depends on:** P5.8, P2.17, P2.6, P2.11, P4.5
- **Findings addressed:**
  - SEC-43 (medium): The Rewind generation pipeline runs synchronously in a server action, has no repair or retry on schema failure, and fails the whole Rewind on one bad LLM response ([security-audit.md](../research/security-audit.md))
  - RWP-13 (low): The prompt template is read through an unauthenticated exported server action, so the lib layer depends on a "use server" module ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-19 (low): Users with little or no viewing still trigger a full paid generation of empty slides ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWP-14 (medium): Regeneration is not atomic and real versioning is missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - DUP-02 (medium): Wrapped statistics pipeline copied into the playground route and already drifted (missing derived and percentile data that v2 needs) ([code-duplication.md](../research/code-duplication.md))
  - BP-25 (medium): Rewind statistics assembly is copy-pasted, and the playground copy has drifted from production ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P5.9 in plan.md](plan.md#step-p59-the-v3-pipeline-end-to-end)

**Context.** One function generates a member's v3 Rewind for the job, the playground and the tests. A model failure never fails a Rewind, light viewers cost nothing, and an unchanged input never pays twice.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `generateUserRewind` runs in persist and dry-run modes, and the job uses it.
- [ ] Eligibility covers Redis, the audience, the Plex identity, managed accounts and entitlement, each with a typed skip reason.
- [ ] The pocket and postcard editions make zero LLM calls, and unchanged inputs make none.
- [ ] One repair call is followed by a per-slot template fallback, and no model failure fails a generation.
- [ ] The prompt is frozen in code as `rewind-2026.1`, and the style guide is read through a server-only function, with no unauthenticated action left.
- [ ] The final write is one atomic transaction, and the golden snapshot tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P5.10: Share-safe projection v3 and card routes

- **Labels:** enhancement, rewind, security, privacy
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-12 to 2026-11-13 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.14, P5.9
- **Findings addressed:**
  - SEC-16 (high): Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked ([security-audit.md](../research/security-audit.md))
  - RWP-01 (high): Stored and publicly shared Rewind JSON exposes every server user's name and watch time ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWV-06 (medium): Sharing is a single text-only card: no per-slide cards, no native share sheet, default font, unused summary ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.10 in plan.md](plan.md#step-p510-share-safe-projection-v3-and-card-routes)

**Context.** Every card, whether rendered for the owner or for a share link, comes from one strict allow-list projection of only the published pages. Cards render through `next/og` with the Rewind fonts, behind authorisation, a cache and Redis limits.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `toShareSafe` is a strict, field-by-field allow-list, with percentages, weekly bins and hidden titles dropped at projection time.
- [ ] The owner and asset-key card routes render through `next/og` with the card fonts, authorise first, and send noindex.
- [ ] The Satori lint rule and the tree test guard `lib/rewind/cards/**`.
- [ ] Cards are cached on disk by the projected input and `CARD_VERSION`, and the Redis limits apply only to cache misses.
- [ ] The key-snapshot, property and owner-versus-link pixel tests pass.

### P5.11: Share sheet, core cards and opt-in public links

- **Labels:** enhancement, rewind, privacy
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-17 to 2026-11-18 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.10, P3.7, P4.3
- **Findings addressed:**
  - RWV-06 (medium): Sharing is a single text-only card: no per-slide cards, no native share sheet, default font, unused summary ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - SEC-16 (high): Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked ([security-audit.md](../research/security-audit.md))
  - GAP-37 (low): Share-visit analytics store a permanent, reversible IP pseudonym plus user agent and referer, and no code reads them ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P5.11 in plan.md](plan.md#step-p511-share-sheet-core-cards-and-opt-in-public-links)

**Context.** A member can share any core page as a 9:16 image through the native share sheet, or save it. A public link is created only on purpose, shows exactly what it will publish, and can be changed, rotated or stopped at any time. Visits are counted without keeping anything about the visitor.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The share sheet offers a live preview, Share image with a prefetched File, Save image, and Copy link or Create a public link, plus the sign, artwork and daily-detail switches.
- [ ] The six core cards render from the projection, and unsigned cards never name the member.
- [ ] Enable, update, rotate and disable store hashed tokens and asset keys, expire at season close, write audit entries and allow 10 actions per hour.
- [ ] `RewindShareVisitDay` counts once per visitor per day through a daily rotating HMAC key, and the database stores nothing about visitors.
- [ ] The E2E test covers create, rotate and revoke.

### P5.12: Article mode

- **Labels:** enhancement, rewind, accessibility
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-17 to 2026-11-18 (track rewind, UI lane, effort M)
- **Depends on:** P5.7
- **Findings addressed:**
  - RWV-09 (high): Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - UI-09 (high): Rewind viewer: no pause or keyboard shortcuts, prohibited ARIA on slide titles, mid-word title breaks on mobile, unskippable intro ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P5.12 in plan.md](plan.md#step-p512-article-mode)

**Context.** `/rewind/[year]/read` presents the whole issue as one semantic document. It needs no JavaScript, prints cleanly, and is the conforming alternative for small screens, large text and assistive technology. The same renderer will carry the archive years.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/rewind/[year]/read` renders every selected page as one semantic document, with headings and tables, and needs no JavaScript.
- [ ] The print stylesheet produces clean paper pages, and the article reflows to 320 px.
- [ ] The renderer and its block contract are ready for the legacy adapter, with a contract test.
- [ ] axe reports 0 violations on chromium, webkit and firefox.

### P6.1: AdminShell, navigation config and route builders

- **Labels:** enhancement, ui, admin
- **Phase:** [P6: Shells and the member pages Rewind needs](plan.md#phase-6-shells-and-the-member-pages-rewind-needs), 2026-11-06 to 2026-12-04
- **Window:** 2026-12-03 to 2026-12-04 (track ui, UI lane, effort M)
- **Depends on:** P3.4, P3.6, P3.7, P3.9
- **Findings addressed:**
  - UI-04 (high): The admin assistant cannot be closed on mobile, runs off-screen, and the floating button covers primary actions ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-32 (low): Admin navigation config is hard-coded with pasted icons, grouping is odd, there is no command palette, and the copy still says "Wrapped" ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-06 (medium): Broken admin deep links: links drop the year or the user, the admin lands on the full-screen user-facing generation screen, and the nav loses its active state ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-21 (medium): No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-19 (medium): Six different error and status screen designs, dead ends, and an admin auth gate that relies on error names production strips ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P6.1 in plan.md](plan.md#step-p61-adminshell-navigation-config-and-route-builders)

**Context.** Replace `admin-nav.tsx`, its pasted SVGs and the floating chatbot with one AdminShell built from `lib/admin/nav.ts`. The shell has a sidebar, a mobile top bar and tab bar, and the assistant as a closable right Sheet. Every admin link goes through `lib/admin/routes.ts`, which always passes the year. It lands in the ship window, after the season console, and nothing before the season depends on it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/admin/nav.ts`, `nav-counts.ts` and `routes.ts` exist with tests, and the UI-06 links use the builders.
- [ ] The sidebar, rail, top bar and tab bar match 6.2 at every breakpoint, with `aria-current` and the test ids above.
- [ ] The assistant is a closable Sheet, gated on `llmDisabled`, and hidden on immersive routes; nothing floats over content.
- [ ] The admin gate uses no error names, and the old nav files are deleted.

### P6.3: AppShell and PublicShell

- **Labels:** enhancement, ui
- **Phase:** [P6: Shells and the member pages Rewind needs](plan.md#phase-6-shells-and-the-member-pages-rewind-needs), 2026-11-06 to 2026-12-04
- **Window:** 2026-11-06 to 2026-11-09 (track ui, UI lane, effort M)
- **Depends on:** P3.4, P3.6, P3.9
- **Findings addressed:**
  - UI-30 (medium): No member app shell: home, Rewind, Discord, membership and account are connected by no navigation ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P6.3 in plan.md](plan.md#step-p63-appshell-and-publicshell)

**Context.** Give member pages one top bar with nav, an account menu and a single notice slot, and give auth, invite and subscribe one PublicShell. The `(app)` layout keeps sending gated members to `/subscribe`, and that page now has a Sign out escape.

**Acceptance criteria** (the step's "Done when" list):

- [ ] AppShell has the top bar, the account menu, the mobile Sheet and one notice slot, with `aria-current`.
- [ ] PublicShell wraps auth, invite and subscribe, with a Sign out escape when signed in.
- [ ] The `(app)` layout gates as before, with no nested `main`s or gradient wrappers.
- [ ] The visual baselines are updated with reviewed diffs.

### P6.5: Admin composites

- **Labels:** enhancement, ui, admin
- **Phase:** [P6: Shells and the member pages Rewind needs](plan.md#phase-6-shells-and-the-member-pages-rewind-needs), 2026-11-06 to 2026-12-04
- **Window:** 2026-11-06 to 2026-11-09 (track ui, UI lane, effort M)
- **Depends on:** P3.5, P3.6, P3.9
- **Findings addressed:**
  - UI-21 (medium): No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-22 (medium): Surfaces, stat tiles, badges and empty states are hand-copied (95 admin panel copies), and KPI tiles stack one per row on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-13 (medium): Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P6.5 in plan.md](plan.md#step-p65-admin-composites)

**Context.** Add the admin composites of 5.5: PageHeader, StatTile and StatGrid, a URL-driven DataTable, FilterBar with FilterSelect and DateRangeFilter, and EmptyState. Each has component tests and a panel on `/dev/ui`, so P10.18, P7.8 and P10 build pages from parts rather than copies.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The five composites follow 5.5, each with component tests and axe.
- [ ] DataTable's sorting and pagination live in the URL, the first cell is a link, row actions work on mobile, and headers have `scope`.
- [ ] FilterBar defaults to All and shows active chips; DateRangeFilter reads the server zone.
- [ ] `/dev/ui` shows every composite and has a visual baseline.

### P6.9: Home RewindCard

- **Labels:** enhancement, ui, rewind
- **Phase:** [P6: Shells and the member pages Rewind needs](plan.md#phase-6-shells-and-the-member-pages-rewind-needs), 2026-11-06 to 2026-12-04
- **Window:** 2026-11-17 to 2026-11-18 (track ui, UI lane, effort M)
- **Depends on:** P3.1, P3.7, P6.3, P2.17, P5.5
- **Findings addressed:**
  - UI-02 (high): Rewind entry breaks across the year boundary; no archive of past years and no exit from the viewer ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - RWV-07 (high): Five visual identities in one Rewind journey; the cinematic theme stops at the slide edges ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWP-08 (medium): Jellyfin users are offered a Rewind that always fails ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P6.9 in plan.md](plan.md#step-p69-home-rewindcard)

**Context.** Replace `wrapped-card.tsx` with `components/dashboard/rewind-card.tsx`: an app Card whose in-scope field strip prints the member's soundtrack, resolved on the server into one of the eight 5.5 states, with past years as an archive. It merges by 2026-11-20, when its before-season state starts (Rewind 4.4).

**Acceptance criteria** (the step's "Done when" list):

- [ ] All eight states resolve on the server from data, with tests, and none offers a generate action.
- [ ] The strip prints the soundtrack in the archetype ink, and the meta line comes from the registry.
- [ ] Share links to `?sheet=share`, and the archive lists past years.
- [ ] The view transition runs on chromium and webkit, and the card is merged by 2026-11-20.

### P6.11: Account page and Discord link page

- **Labels:** enhancement, ui, discord
- **Phase:** [P6: Shells and the member pages Rewind needs](plan.md#phase-6-shells-and-the-member-pages-rewind-needs), 2026-11-06 to 2026-12-04
- **Window:** 2026-11-17 to 2026-11-18 (track ui, UI lane, effort M)
- **Depends on:** P6.3, P3.5, P2.1
- **Findings addressed:**
  - UI-01 (high): Discord account linking cannot be reached from any user-facing UI ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-07 (medium): Status and error query params from Discord and NextAuth are silently dropped ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-30 (medium): No member app shell: home, Rewind, Discord, membership and account are connected by no navigation ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P6.11 in plan.md](plan.md#step-p611-account-page-and-discord-link-page)

**Context.** Add `/account` with Discord, Rewind notifications, time zone and a reserved Appearance section. Turn `/discord/link` into the 6.6 checklist, reachable from the account menu, home and onboarding, with every Discord result arriving as a short code that `FlashFromQuery` shows on the page the member came from.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/account` stores `RewindPrefs.notify` and `User.timezone` through Zod-validated member actions.
- [ ] `/discord/link` is the checklist with one primary action, linked from the account menu and home.
- [ ] Every Discord redirect lands on the safe origin page with a code, and `FlashFromQuery` shows it.
- [ ] The E2E and visual checks pass.

### P7.1: Pages: Taste, People, The race, Records

- **Labels:** enhancement, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-16 to 2026-11-17 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.5
- **Findings addressed:**
  - RWV-11 (medium): Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWP-18 (medium): Rich data the pipeline already downloads is discarded, so two archetypes can never win and key "better stats" are missing ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P7.1 in plan.md](plan.md#step-p71-pages-taste-people-the-race-records)

**Context.** Build pages 07 Taste, 08 People, 11 The race and 12 Records on the registry, each with a deterministic srSummary, a Table where the page has one, and an omission rule, so a member with thin data never sees an empty page. The race plays once and then holds its final standings.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Pages 07, 08, 11 and 12 render from the registry with schemas, srSummaries and omission rules, and Taste and The race have Table builders.
- [ ] The race autoplays once with zero React commits during the run, then holds a static final frame, which reduced motion shows at once.
- [ ] No page shows a zero count, a wrong plural or a split word on any of the 20 fixtures.
- [ ] The select, component and visual tests pass, and the golden recordings cover the new decks.

### P7.2: Pages: Setup, Requests, Standing, Next year

- **Labels:** enhancement, rewind, privacy
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-17 to 2026-11-18 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.5
- **Findings addressed:**
  - RWP-06 (medium): Overseerr stats misread the API ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWV-11 (medium): Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.2 in plan.md](plan.md#step-p72-pages-setup-requests-standing-next-year)

**Context.** Build pages 13 Setup, 14 Requests, 15 Standing and 17 Next year: the server act and the look ahead. Other members appear only as anonymous aggregates with 3 or more contributors, and no public surface carries a player name, an IP or a request title.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Pages 13, 14, 15 and 17 render with schemas, srSummaries and their omission rules.
- [ ] Setup is template-only with no path to player names, and Requests counts through cached guids with the corrected statuses.
- [ ] Standing's percentile comes from the server-wide pass, community facts need 3 or more contributors, and counts stay in-app.
- [ ] Next year's parts can be cut on their own, and Setup and Next year offer no card.
- [ ] The select, component and visual tests pass on all fixtures.

### P7.3: Pocket edition, Short list and postcard

- **Labels:** enhancement, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-23 to 2026-11-23 (track rewind, Rewind lane, effort S)
- **Depends on:** P5.9, P5.7
- **Findings addressed:**
  - RWP-19 (low): Users with little or no viewing still trigger a full paid generation of empty slides ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - RWV-11 (medium): Robustness: thin section filter, zero-value slides still shown, hardcoded plurals, posters collapse, duplicate keys, ref mutation during render ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.3 in plan.md](plan.md#step-p73-pocket-edition-short-list-and-postcard)

**Context.** Light viewers get a six-page pocket edition and very light viewers a one-page postcard, both template-only, and any member can pick the pocket cut on a full issue's cover. Late joiners are told their first Rewind arrives next year, and none of these paths runs a paid generation (RWP-19).

**Acceptance criteria** (the step's "Done when" list):

- [ ] The pocket edition has six pages, including the merged Short list with its `tz.note`, and the postcard lists community titles without names.
- [ ] The cover's cut choice switches between the editions and renumbers every folio.
- [ ] Late joiners are skipped with `JOINED_LATE` and see the next-year message.
- [ ] No pocket, postcard or late-joiner path makes an LLM call, and the tests pass.

### P7.4: Desktop spread and Notes

- **Labels:** enhancement, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-23 to 2026-11-24 (track rewind, UI lane, effort M)
- **Depends on:** P5.7
- **Findings addressed:**
  - RWV-04 (high): Slides are not built for a 9:16 phone stage: they overflow the viewport, scroll sideways and truncate titles ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.4 in plan.md](plan.md#step-p74-desktop-spread-and-notes)

**Context.** On desktop every page becomes a magazine spread, with act tabs, grouped progress, a contents rail, labelled previous and next buttons, the framed artboard and a Notes column that extends the page. The same page slots and player drive it, so the phone story and the spread cannot drift apart.

**Acceptance criteria** (the step's "Done when" list):

- [ ] At 1024 px and wider (aspect 4:3 or wider), every page is a spread with act tabs, the contents rail, labelled previous and next buttons and the framed artboard.
- [ ] Notes hold the P0 Notes for Top shows, the calendar and the centrefold, and the srSummary on every other page.
- [ ] The switch is CSS only, with no layout shift and no horizontal scroll.
- [ ] Visual tests pass at 1440x900 and 1366x768 on chromium and webkit.

### P7.5: Public share page and OG card

- **Labels:** enhancement, rewind, privacy
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-20 to 2026-11-23 (track rewind, UI lane, effort M)
- **Depends on:** P5.11
- **Findings addressed:**
  - RWV-05 (high): Public share page: off-brand static summary inside the auth-guarded group, the page fetches its own API so visits are counted twice, one shared rate-limit bucket turns every share link into a 404, and an email can appear publicly ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - SEC-16 (high): Public Rewind share links expose other users' viewing data and server stats; sharing is automatic and can never be revoked ([security-audit.md](../research/security-audit.md))
  - BP-35 (low): No `not-found.tsx` or `global-error.tsx`; invalid share links get the unbranded default 404 ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-39 (medium): Branding, page titles and social metadata are inconsistent or missing; "Rewind" appears nowhere ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P7.5 in plan.md](plan.md#step-p75-public-share-page-and-og-card)

**Context.** Replace the moved v2 share page with the Rewind share page. It is in the Rewind theme, outside the authenticated layout, and shows only the published cards, with an owner banner, branded 404, 503 and 429 states, and an OG card built from the first published page. Surviving v2 tokens still open through the v2 projection until the season closes.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/rewind/s/[token]` renders outside `(app)`, in the Rewind theme, and shows only the published cards.
- [ ] noindex is set in headers and metadata, and the owner banner offers Change cards, Rotate link and Stop sharing.
- [ ] Unknown, revoked, rotated and expired tokens get the branded 404, rate-limited visitors get 429, and database failures get 503 with `Retry-After`.
- [ ] Surviving v2 tokens render through the v2 projection until the season closes.
- [ ] The 1200x630 OG card comes from the first published page, and the page-05-only contract test passes.

### P7.6: Remaining cards

- **Labels:** enhancement, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-12-03 to 2026-12-04 (track rewind, UI lane, effort M)
- **Depends on:** P5.11, P7.1, P7.2
- **Findings addressed:**
  - RWV-06 (medium): Sharing is a single text-only card: no per-slide cards, no native share sheet, default font, unused summary ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.6 in plan.md](plan.md#step-p76-remaining-cards)

**Context.** Give every eligible page its own 9:16 card (FR-18, RWV-06), make `eligibleCards()` list them under the current options, and print titles outside the Rewind font subset in Noto. This lands in the ship window, by 2026-12-04; until then non-core pages offer Copy link only, which Appendix C decision 29 records.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every eligible page except Setup and Next year has a card, and `eligibleCards()` returns 15 for the mock member with Daily detail off.
- [ ] Safe-mode titles render in Noto subsets on cards, and the standalone build ships the fonts.
- [ ] Pixelmatch baselines pass for the owner and link renders.

### P7.7: Hide and unhide a title

- **Labels:** enhancement, rewind, privacy
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-16 to 2026-11-17 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.10, P5.9
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.7 in plan.md](plan.md#step-p77-hide-and-unhide-a-title)

**Context.** A member can hide a title from their Rewind and bring it back (FR-7). A hidden title leaves every public card, the share page and the OG card at once, and every in-app list after a regeneration with no LLM call, while still counting toward the totals.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `hideRewindTitle` and `unhideRewindTitle` validate with Zod, check ownership, allow 20 per day, and write `RewindExclusion` rows with an `exclusionsVersion` bump.
- [ ] Each change enqueues a no-LLM regeneration that is exempt from the generation limit and waits out a held lock.
- [ ] The title leaves public cards and the share page at once, and in-app lists after the regeneration, while still counting toward totals.
- [ ] The E2E test passes.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P7.8: Season dashboard and bulk generation

- **Labels:** enhancement, rewind, admin
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-10 to 2026-11-13 (track rewind, Rewind lane, effort L)
- **Depends on:** P2.17, P2.6, P6.5
- **Findings addressed:**
  - UI-29 (medium): No admin overview or Rewind generation console; bulk generation is unreachable, and stuck jobs can't be retried from the list ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-22 (medium): Rewind generation runs synchronously in a Server Action; polls queue behind it; no queue, stuck-job recovery, concurrency guard or provider retry ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-28 (medium): LLM usage totals load every LLMUsage row, including full prompt and response text, on the admin landing, LLM-usage and cost-analysis pages ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P7.8 in plan.md](plan.md#step-p78-season-dashboard-and-bulk-generation)

**Context.** Give the admin one console for the season at `/admin/rewind`: preflight checks, four bulk actions with cost estimates, live progress and per-member state. Bulk generation becomes a BullMQ fan-out, and cost totals come from aggregate queries instead of every `LLMUsage` row. The season-open generation audience (formerly one of P8.2's two code changes) lands here, and from 2026-11-20 the owner uses the console to generate the admins' issues on production data, so the soft launch signs off issues that have already been through real runs.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin/rewind` shows the preflight rows, the StatGrid, live progress and the per-member DataTable.
- [ ] Prepare season, Generate all, Retry failed and Run final cut each show a cost estimate and write an audit entry, and the fan-out skips queued and running members.
- [ ] `REWIND_SEASON_PREPARE` is scheduled for 00:15 on 1 December in the westernmost zone with audience `all`, the buttons use the configured audience, and the season budget cap is shown and enforced.
- [ ] Admin-audience generation has run on production data from 2026-11-20.
- [ ] Cost totals come from aggregate queries, and no admin page loads `LLMUsage` prompt or response text.

### P7.9: Admin preview, roll back and audited reads

- **Labels:** enhancement, rewind, admin
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-16 to 2026-11-16 (track rewind, Rewind lane, effort S)
- **Depends on:** P7.8
- **Findings addressed:**
  - UI-06 (medium): Broken admin deep links: links drop the year or the user, the admin lands on the full-screen user-facing generation screen, and the nav loses its active state ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-29 (medium): No admin overview or Rewind generation console; bulk generation is unreachable, and stuck jobs can't be retried from the list ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-33 (low): Five admin actions that change or create member data emit no audit event, and admin reads of member content leave no trace ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P7.9 in plan.md](plan.md#step-p79-admin-preview-roll-back-and-audited-reads)

**Context.** Admins preview any member's Rewind inside the admin shell, with the year always in the URL, a clear "viewing as an admin" banner and an audit entry for each read. Roll back restores the previous Rewind in one audited transaction.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin/users/[userId]/rewind/[year]` renders inside the admin shell with the Rewind fonts and the banner, and writes an audit read entry.
- [ ] The old `[userId]/wrapped` route redirects with the year, and every admin link passes the year.
- [ ] Roll back restores `previousData` in one audited transaction, and can be undone.
- [ ] The tests pass.

### P7.10: Dry runs and preview mode

- **Labels:** enhancement, rewind, admin, llm
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-12 to 2026-11-13 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.9, P2.10
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.10 in plan.md](plan.md#step-p710-dry-runs-and-preview-mode)

**Context.** Run the production pipeline in dry-run mode, as a job, on a member or a golden fixture, and let an admin open the result as a story and as cards without writing anything. P7.11's gallery is built on this, and P8.8 builds the playground's panes on it in the ship window.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `REWIND_DRY_RUN` runs `generateUserRewind` in dry-run mode on a member or a fixture, rate-limited, with an estimate first, and writes no Rewind rows.
- [ ] Admins open a dry run through `?preview=` and the preview card route, and members cannot.

### P7.11: Gallery of the review fixtures

- **Labels:** enhancement, rewind, admin
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-19 to 2026-11-20 (track rewind, Rewind lane, effort M)
- **Depends on:** P7.10, P5.11
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.11 in plan.md](plan.md#step-p711-gallery-of-the-review-fixtures)

**Context.** Give the pre-freeze review one place to see every selected page and card of the five review fixtures, rendered through the real routes, both in the admin and as a headless batch. The soft launch needs only the core pages here; the other pages and cards appear as they merge. The eval results page moved to January (P11.30).

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin/rewind/gallery` renders every page and card of the five review fixtures through the real routes, using the selected model's recordings.
- [ ] `npm run rewind:gallery` produces the same set headless, with a contact sheet, both locally and from the manual workflow.
- [ ] The tests pass, and Gallery appears in the admin nav.

### P7.12: Rewind settings section and feature flags

- **Labels:** enhancement, rewind, admin
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-10 to 2026-11-11 (track rewind, UI lane, effort M)
- **Depends on:** P2.2, P3.5
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.12 in plan.md](plan.md#step-p712-rewind-settings-section-and-feature-flags)

**Context.** One Rewind section in settings holds every admin-facing flag of design 13.2, validated, audit-logged and checked against Redis and Tautulli. The soft launch, the season open and the cut list then need no deploy.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Rewind section in the Features group covers the season dates, audience, LLM mode and budget, public links and counts, server name and artwork on cards, excluded libraries and ratings, managed accounts, disabled pages and notification channels.
- [ ] Every field is Zod-validated, and every save writes an audit entry with a diff.
- [ ] `llmDisabled` forces template copy everywhere.
- [ ] The tests pass, and the old wrapped settings form is gone.

### P7.13: Legacy archive articles

- **Labels:** enhancement, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-12-03 to 2026-12-04 (track rewind, UI lane, effort M)
- **Depends on:** P5.12, P5.1
- **Findings addressed:**
  - RWV-07 (high): Five visual identities in one Rewind journey; the cinematic theme stops at the slide edges ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.13 in plan.md](plan.md#step-p713-legacy-archive-articles)

**Context.** Stored 2025 and earlier Rewinds open as archive articles in the Rewind theme, through the article renderer, so no member route renders the legacy viewer any more. It lands in the ship window (2026-12-02 to 12-04); until then those years render through P0.14's `WrappedYearView` (P5.1), which is FR-1's fallback and Appendix C decision 29. Deleting the legacy viewer itself moved to January (P11.29), because nothing in the season needs it gone.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `legacy-article.ts` renders stored v1 and v2 years as archive articles in the Rewind theme, on the member, article and admin routes.
- [ ] No member or admin Rewind route imports `components/wrapped`, and no `/rewind` route loads chart.js.
- [ ] No member-facing surface says "Wrapped".
- [ ] The tests on stored fixtures pass.

### P7.14: Ready notifications and view tracking

- **Labels:** enhancement, rewind, discord
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-19 to 2026-11-20 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.9, P6.9
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.14 in plan.md](plan.md#step-p714-ready-notifications-and-view-tracking)

**Context.** Tell each member once that their Rewind is ready, by Discord DM in waking hours and on the dashboard, and record views for the success measures without storing anything about the viewer. The season-open fan-out on the audience switch (formerly one of P8.2's two code changes) lands here, so the soft-launch deploy carries it. Each send is claimed once per member, waits for 09:00 to 20:00 in the member's zone, and respects the member's notification preference.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `REWIND_NOTIFY` sends one Discord DM between 09:00 and 20:00 in the member's zone, and `notifiedAt` prevents duplicates.
- [ ] Switching the audience to `all` fans out one season notification per completed member, and completions outside the live audience enqueue none.
- [ ] The home card's ready state and the AppShell notice use the same unread rule.
- [ ] `notifyWhenRewindReady` turns notifications on, and `/account` can turn them off.
- [ ] `recordRewindView` upserts `RewindView` rows with no viewer data, and previews write none.
- [ ] The tests pass.
- [ ] If this step adds the `RewindView` unique index: dump taken before deploy; `prisma migrate status` clean.

### P8.3: P1 story features

- **Labels:** enhancement, rewind
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-02 to 2026-12-03 (track rewind, Rewind lane, effort M)
- **Depends on:** P7.1, P5.3
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.3 in plan.md](plan.md#step-p83-p1-story-features)

**Context.** Add four P1 interactions on the season's stored data, each behind its own default-off flag: the race scrubber and replay (FR-8), the "Pick a day" sheet, the roving-focus calendar grid where cells are 24 px or more (FR-9), and a first tap that completes a running count-up (FR-15). These are P1 requirements of the Rewind design, and the per-feature flags let any of them be turned off without a deploy.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The race scrubber (Slider with month `aria-valuetext`) and Replay work by touch, mouse and keyboard, and pause autoplay while in use.
- [ ] "Pick a day" opens a bottom sheet with a month selector and 44 px day rows.
- [ ] The desktop Notes and article calendars are a grid with roving focus, and remain a table without JavaScript.
- [ ] The first tap completes a running count-up or stretch, and the second advances.
- [ ] Each feature has its own flag, off on a fresh `Config` until its `+key` is set, and the unit, E2E, visual, axe and perf checks pass.

### P8.4: P1 comparison, Edit card, Save all and remaining Notes

- **Labels:** enhancement, rewind
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-04 to 2026-12-09 (track rewind, Rewind lane, effort L, 2 PRs)
- **Depends on:** P7.4, P7.6
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.4 in plan.md](plan.md#step-p84-p1-comparison-edit-card-save-all-and-remaining-notes)

**Context.** Add "Compare with 2025" on page 02 (FR-11, G8), Edit card on the centrefold and back-cover posters (FR-23, moved here from P7.6), "Save all {n} cards" as one ZIP built in the browser (FR-24), and Notes for the seven core pages that still show only their summary (FR-17), each behind a default-off flag. Two PRs: the comparison and the Notes first, then Edit card and Save all. These are P1 requirements of the Rewind design, and the per-feature flags let any of them be turned off without a deploy.

**Acceptance criteria** (the step's "Done when" list):

- [ ] "Compare with 2025" is a Toggle with `aria-pressed`, draws mirrored 7-day averages on one scale, and is hidden without 2025 data.
- [ ] Edit card offers the three-stat allow-list on the centrefold and back cover, saved in the prefs and on links.
- [ ] "Save all {n} cards" builds the ZIP in the browser with fflate, and its count comes from `eligibleCards()`.
- [ ] The seven remaining core pages have Notes, and the Guess Notes never spoil the quiz.
- [ ] Each feature has its own default-off flag, and the unit, E2E, visual and budget checks pass.

### P8.5: Validator and final-cut job

- **Labels:** enhancement, rewind, llm
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-02 to 2026-12-07 (track rewind, Rewind lane, effort L, 2 PRs)
- **Depends on:** P5.9, P7.8
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.5 in plan.md](plan.md#step-p85-validator-and-final-cut-job)

**Context.** On 1 January every issue is regenerated with the full year almost for free. Facts, pages and cards are recomputed, and the LLM is called only for slots whose identity facts changed or whose bands were crossed. The wording switches to "Final cut", and December's readers are told their issue now includes December. A read-only validator, the first of the step's two PRs, checks every stored 2026 Rewind: it runs against production on 2026-12-02, after the season generation, and again in every dry run and after the final cut.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `REWIND_FINAL_CUT` recomputes the full-year aggregate and fans out `final-cut` jobs, scheduled for 1 January 00:30 in the westernmost zone.
- [ ] Only slots with a changed identity fact, a crossed band or a newly selected page call the LLM, and fewer than 30% of the fixtures re-call.
- [ ] Every later 2026 regeneration keeps the full-year window, and the template wording reads "Final cut".
- [ ] The final-cut notification reaches December's readers once, from 2 January.
- [ ] `scripts/rewind-validate.ts` and `lib/wrapped/maintenance/validate-year.ts` are merged with their tests, and the validator reported zero failures against production on 2026-12-02.
- [ ] The fixture dry-run tests pass, and the dry-run and bulk roll-back scripts exist.

### P8.8: Playground on the production pipeline (P1)

- **Labels:** enhancement, rewind, admin, llm
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-08 to 2026-12-09 (track rewind, UI lane, effort M)
- **Depends on:** P7.10, P6.1
- **Findings addressed:**
  - DUP-02 (medium): Wrapped statistics pipeline copied into the playground route and already drifted (missing derived and percentile data that v2 needs) ([code-duplication.md](../research/code-duplication.md))
  - BP-25 (medium): Rewind statistics assembly is copy-pasted, and the playground copy has drifted from production ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - RWP-20 (medium): The pipeline is duplicated and has drifted, upstream responses are unvalidated, and there are four polling implementations including dead components ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
  - UI-43 (medium): Oversized client components (prompt editor 853 lines, invites 644, playground 394 + 430) mix UI, state machines and duplicated business logic ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-33 (low): Live internal admin reads go through API routes, against CLAUDE.md ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P8.8 in plan.md](plan.md#step-p88-playground-on-the-production-pipeline-p1)

**Context.** The playground runs the production pipeline, not a copy of it: P7.10's dry runs on a member or a golden fixture, with the whole trail and a live story preview. The copied statistics route, the v2 playground client and their API routes are deleted. FR-42 is a P1 requirement, so this is the first plan-level cut (P7 header): if it is not merged by the 2026-12-10 feature freeze, it moves to January and the v2 playground stays, minting no tokens since P0.19.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin/rewind/playground` runs `generateUserRewind` in dry-run mode on a member or a fixture, with model, prompt-version and style-guide inputs.
- [ ] It shows the facts, the page selection, the raw output, the grounding trail and the cost, and previews through `?preview=`.
- [ ] A paid run shows its estimate first, and P7.10's limit of 10 dry runs per 10 minutes applies.
- [ ] The copied statistics route, the v2 playground client and their API routes are deleted, and `/admin/playground` redirects.

### P10.1: Invites list and detail pages

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-21 to 2027-01-25 (track ui, admin lane, effort M)
- **Depends on:** P6.5, P10.18
- **Findings addressed:**
  - UI-41 (medium): Pages load data client-side in `useEffect`, as sequential waterfalls, instead of server props or TanStack Query ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-43 (medium): Oversized client components (prompt editor 853 lines, invites 644, playground 394 + 430) mix UI, state machines and duplicated business logic ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-21 (medium): No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-28 (low): Money and dates are formatted ad hoc: four currency precisions and more than six date formats ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-29 (medium): Client components load data with `useEffect` plus server actions or fetch, instead of server props or TanStack Query ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-30 (medium): Files well over the CLAUDE.md size limits mix several responsibilities ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P10.1 in plan.md](plan.md#step-p101-invites-list-and-detail-pages)

**Context.** `/admin/invites` and `/admin/invites/[inviteId]` load on the server and render on the admin composites, with the users page (P10.18) as the reference. The 644-line `invites-page-client.tsx` and the 308-line `invite-details-client.tsx` are replaced by small components and a clipboard hook.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Both routes load on the server, with no `useEffect` data loading and no `@ts-ignore` in the invite components.
- [ ] Create and delete run through `actions/admin/invites.ts` with Zod and `revalidatePath`, and errors show inside the dialog.
- [ ] One LibraryPicker serves Plex and Jellyfin, and no invite component is over 200 lines.
- [ ] Both pages meet the 9.5 definition of done: PageHeader, DataTable, FilterBar, EmptyState kinds, `lib/utils/format.ts` and test ids.
- [ ] Jest, E2E, axe and the updated visual baselines pass.

### P10.2: Analytics pages: shares, LLM usage and cost

- **Labels:** enhancement, ui, admin, llm
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-25 to 2027-01-27 (track ui, admin lane, effort M)
- **Depends on:** P6.5, P3.10
- **Findings addressed:**
  - UI-24 (medium): Charts: 14 files each register Chart.js and hard-code their own theme; no accessible names, repeated tick labels, invented curves, UTC date shifts and an inflated cost projection ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-42 (low): Analytics day windows: the share chart never zero-fills today, the cost "Period" header shows end + 1 day, Discord charts label the same day differently, and date-filter defaults are UTC ([additional-findings.md](../research/additional-findings.md))
  - UI-13 (medium): Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-28 (low): Money and dates are formatted ad hoc: four currency precisions and more than six date formats ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-06 (medium): Broken admin deep links: links drop the year or the user, the admin lands on the full-screen user-facing generation screen, and the nav loses its active state ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.2 in plan.md](plan.md#step-p102-analytics-pages-shares-llm-usage-and-cost)

**Context.** The analytics charts today hard-code their own theme, shift days to UTC and inflate the cost projection (UI-24, GAP-42). Share analytics, LLM usage and cost analysis show honest numbers bucketed in `Config.timezone`, on the admin composites and the first ChartCard, in time for the season success review on 2027-01-15.

**Acceptance criteria** (the step's "Done when" list):

- [ ] All three pages bucket and label days in `Config.timezone`, include today and show an inclusive period.
- [ ] Projections divide by calendar days, and every amount goes through `formatMoney`.
- [ ] ChartCard is the only chart wrapper on these pages, and one Chart.js registration serves them.
- [ ] LLM usage groups before paginating, keeps every param and links members; share rows keep the year.
- [ ] axe passes and the visual baselines are updated.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P10.3: Queues page with live status

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-28 to 2027-01-28 (track ui, admin lane, effort S)
- **Depends on:** P6.5
- **Findings addressed:**
  - UI-08 (medium): Monitoring pages never refresh, the queue chip says "Processing" while the worker is stopped, and the status row overflows on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-22 (medium): Surfaces, stat tiles, badges and empty states are hand-copied (95 admin panel copies), and KPI tiles stack one per row on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.3 in plan.md](plan.md#step-p103-queues-page-with-live-status)

**Context.** Today the page never refreshes, and its chip says "Processing" while the worker is stopped (UI-08). `/admin/queues` shows the real worker and queue state in words, refreshes itself while it is visible, and fits a phone.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Worker, Redis and queue state are words with dots, and the worker state is read from Redis.
- [ ] The page refreshes every 10 s while visible, shows "Updated Ns ago" and can be paused.
- [ ] Pause and Resume are labelled Buttons with a confirm, and no `window.location.reload()` remains.
- [ ] Jobs are in a DataTable with Retry, a page total and FilterBar, and the page meets 9.5 at 390px.

### P10.4: Prompts pages and the split editor

- **Labels:** enhancement, ui, admin, llm
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-28 to 2027-02-01 (track ui, admin lane, effort M)
- **Depends on:** P6.5
- **Findings addressed:**
  - UI-43 (medium): Oversized client components (prompt editor 853 lines, invites 644, playground 394 + 430) mix UI, state machines and duplicated business logic ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-30 (medium): Files well over the CLAUDE.md size limits mix several responsibilities ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-21 (medium): No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.4 in plan.md](plan.md#step-p104-prompts-pages-and-the-split-editor)

**Context.** The prompts list becomes a DataTable with status badges. The 853-line editor becomes a 960px page of small components and hooks that edits what Rewind v3 reads: the appended style-guide block.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The list is a DataTable with the `prompt` status badges, an EmptyState and test ids.
- [ ] The editor is a 960px page with breadcrumbs; its files are each under 200 lines, and its state lives in two tested hooks.
- [ ] The preview is built by the pipeline's own `systemPrompt()`, and the 1,200-character rule is shared with the actions and the playground.
- [ ] No client copy of placeholder replacement remains.

### P10.5: Announcements and Discord admin pages

- **Labels:** enhancement, ui, admin, discord
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-01 to 2027-02-03 (track ui, admin lane, effort M)
- **Depends on:** P6.5, P3.8
- **Findings addressed:**
  - UI-25 (medium): Announcements: Markdown lists lose their bullets, the list is clipped in a hidden scroll box, "NEW" is permanent, and the admin list shows raw Markdown with no preview ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-08 (medium): Monitoring pages never refresh, the queue chip says "Processing" while the worker is stopped, and the status row overflows on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-24 (medium): Charts: 14 files each register Chart.js and hard-code their own theme; no accessible names, repeated tick labels, invented curves, UTC date shifts and an inflated cost projection ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-42 (medium): Action, confirm and toast patterns are re-implemented per button; the confirm dialog has no pending state, and toasts appear under the modal backdrop ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-22 (medium): Surfaces, stat tiles, badges and empty states are hand-copied (95 admin panel copies), and KPI tiles stack one per row on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.5 in plan.md](plan.md#step-p105-announcements-and-discord-admin-pages)

**Context.** Admins manage announcements in a DataTable with rendered previews and a Dialog form with a live preview. The Discord page shows two honest status rows, a DateRangeFilter, ChartCards and a StatGrid, and all of them refresh.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Announcements render through `MarkdownBody` in the table, the preview and home, and "New" follows read state everywhere.
- [ ] The announcement form is a Dialog with a live preview and inline errors.
- [ ] The Discord page has two status rows, a DateRangeFilter, a StatGrid and ChartCards, all refreshed while visible.
- [ ] No Discord or announcement component hand-builds a panel, a badge, an empty state or a chart, and the baselines are updated.

### P10.6: User detail, Rewind history and conversation pages

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-03 to 2027-02-05 (track ui, admin lane, effort M)
- **Depends on:** P6.5, P7.9
- **Findings addressed:**
  - GAP-38 (low): The admin user activity timeline paginates wrongly: from page 3 items can be skipped or misordered, and from page 5 every page is empty ([additional-findings.md](../research/additional-findings.md))
  - UI-06 (medium): Broken admin deep links: links drop the year or the user, the admin lands on the full-screen user-facing generation screen, and the nav loses its active state ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-21 (medium): No page shell: every page hand-builds its container, header, back link and actions, and titles don't match the nav ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-29 (medium): No admin overview or Rewind generation console; bulk generation is unreachable, and stuck jobs can't be retried from the list ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-43 (low): No timezone policy: server-rendered admin timestamps show unlabelled container time (UTC in Docker), client-rendered ones show browser time, and the same page mixes both ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P10.6 in plan.md](plan.md#step-p106-user-detail-rewind-history-and-conversation-pages)

**Context.** The user detail page becomes an entity page: the member's name, status badges and four tabs, with Regenerate for stuck rows and keyboard-reachable tables. The history and conversation pages get breadcrumbs and zone-labelled times, and the activity timeline pages correctly at any depth.

**Acceptance criteria** (the step's "Done when" list):

- [ ] User detail has the name as h1, status badges and four URL-driven tabs, and no file is over 200 lines.
- [ ] Stuck rows can be regenerated from the detail page and from the users list through `canRegenerate`.
- [ ] The timeline is keyset-paged, and the Postgres test for pages 3 and 5 passes.
- [ ] The history and conversation pages have breadcrumbs, and every server-rendered time carries its zone.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P10.8: Admin Overview page

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-08 to 2027-02-09 (track ui, member lane, effort M)
- **Depends on:** P6.5, P7.8
- **Findings addressed:**
  - UI-29 (medium): No admin overview or Rewind generation console; bulk generation is unreachable, and stuck jobs can't be retried from the list ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.8 in plan.md](plan.md#step-p108-admin-overview-page)

**Context.** There is no admin overview today, and `/admin` redirects straight to Users (UI-29). `/admin` stops redirecting to Users and becomes an Overview: a StatGrid of service health, job queues, Rewind progress and LLM spend, each tile linking to the page that fixes it (ui-design-system 9.2 phase 5, 6.2).

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin` renders the four-tile Overview, and each tile links to its page.
- [ ] Every source fails on its own with a dash, and no poll runs a live upstream test.
- [ ] The Overview refreshes while visible, and the nav and mobile tab bar include it.
- [ ] It meets the 9.5 definition of done, with E2E, axe and a visual baseline.

### P10.10: Light theme behind its flag

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-15 to 2027-02-17 (track ui, member lane, effort M)
- **Depends on:** P10.9
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P10.10 in plan.md](plan.md#step-p1010-light-theme-behind-its-flag)

**Context.** Take light baselines for every page, add the server-side theme resolver and the Appearance picker, and ship light behind `Config.lightThemeEnabled`, off by default (ui-design-system 3.3, 4.1, open question 2). Rewind surfaces re-declare their own inks, so they look the same in both themes, and light baselines join the visual suite.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every page has light baselines at both sizes, and the Rewind pages match their dark baselines.
- [ ] `resolveTheme()` decides on the server from the flag and the cookie, with no flash and no extra database read.
- [ ] The Appearance picker appears only behind the flag, in the menus and on `/account`.
- [ ] axe passes in light, and the flag ships off.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P10.12: 'New on' poster row on home

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-15 to 2027-01-15 (track ui, member lane, effort S)
- **Depends on:** P10.21, P0.16
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P10.12 in plan.md](plan.md#step-p1012-new-on-poster-row-on-home)

**Context.** Home gains the "New on {server name}" row of `home.html`: recently added titles from the member's own libraries, served through the poster proxy's library-access check and linking to each title in Plex web (ui-design-system 3.11, open question 3). It reuses the poster proxy's library-access check from P0.16, so members see only titles from libraries shared with them.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Home shows up to 12 recently added titles from the member's own sections, linking to Plex web.
- [ ] The row never delays home and hides when it can't work.
- [ ] Posters come through the proxy's library-access check, with tests on both sides.
- [ ] The home baselines and E2E are updated.

### P10.16: Admin command menu

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-21 to 2027-01-21 (track ui, admin lane, effort S)
- **Depends on:** P6.1
- **Findings addressed:**
  - UI-32 (low): Admin navigation config is hard-coded with pasted icons, grouping is odd, there is no command palette, and the copy still says "Wrapped" ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-41 (medium): Pages load data client-side in `useEffect`, as sequential waterfalls, instead of server props or TanStack Query ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.16 in plan.md](plan.md#step-p1016-admin-command-menu)

**Context.** Ctrl or Cmd K opens a Command dialog that lists destinations, finds users and invite codes, and offers quick actions. Search runs through a GET route and TanStack Query, never a server action (UI-41).

**Acceptance criteria** (the step's "Done when" list):

- [ ] The dialog opens from the keyboard and both triggers, and it covers destinations, users, invites and quick actions.
- [ ] The search route is admin-only, Zod-validated and rate-limited, and returns only public fields.
- [ ] The hook debounces, keeps previous results and validates responses.
- [ ] Keyboard tests and the E2E spec pass.

### P10.17: Status screens, 404, global error and route skeletons

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-05 to 2027-01-07 (track ui, member lane, effort M)
- **Depends on:** P6.3, P3.8
- **Findings addressed:**
  - UI-19 (medium): Six different error and status screen designs, dead ends, and an admin auth gate that relies on error names production strips ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-35 (low): No `not-found.tsx` or `global-error.tsx`; invalid share links get the unbranded default 404 ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-44 (low): One full-screen loading screen for every admin route, brand-text spinners elsewhere, and no skeleton primitive ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - SEC-20 (low): Raw internal error messages are returned to clients, including from the unauthenticated `checkServerAccess` ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P10.17 in plan.md](plan.md#step-p1017-status-screens-404-global-error-and-route-skeletons)

**Context.** One StatusScreen design and one in-card ErrorState, driven by error codes and digests, never by `error.message`. Add a branded 404 and a global error, and replace the full-screen and brand-text loaders with skeletons shaped like their pages.

**Acceptance criteria** (the step's "Done when" list):

- [ ] StatusScreen and ErrorState exist with tests, and no boundary renders `error.message`.
- [ ] `app/not-found.tsx` and `app/global-error.tsx` exist, and the admin denial screens are StatusScreens.
- [ ] Every `loading.tsx` in scope is a shaped skeleton, and the brand-text loaders are gone.
- [ ] The production-mode E2E spec and the baselines pass.

### P10.18: Admin users page as the reference list page

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-11 to 2027-01-13 (track ui, admin lane, effort M)
- **Depends on:** P6.1, P6.5, P10.14
- **Findings addressed:**
  - UI-05 (medium): The users list hides everyone by default when Plex is unreachable, hides the active filter, and its filter menu is covered on mobile ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-23 (medium): No shared data table: 16 hand-built tables with no sort or search, three pagination styles, actions hidden on mobile, and user detail unreachable by keyboard ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-42 (medium): Action, confirm and toast patterns are re-implemented per button; the confirm dialog has no pending state, and toasts appear under the modal backdrop ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-46 (low): 40 interactive admin files have no data-testid, and admin E2E selects by DOM structure ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-28 (low): Money and dates are formatted ad hoc: four currency precisions and more than six date formats ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.18 in plan.md](plan.md#step-p1018-admin-users-page-as-the-reference-list-page)

**Context.** Rebuild `/admin/users` as the 6.3 reference list page (`admin-users.html`). It never hides members when Plex is down, shows its filters, lets keyboard and mobile users reach every action, and is covered by `admin-users-*` test ids that the whole admin E2E suite moves onto.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The page matches `admin-users.html`: StatGrid above, the Plex-down Alert, filters defaulting to All, and no pager on a single page.
- [ ] Every row action is reachable by keyboard and on mobile, through ConfirmDialogs with pending and error states.
- [ ] Money and dates use `lib/utils/format.ts`, and axe passes `wcag22aa`.
- [ ] The admin E2E specs select only by `data-testid`.

### P10.19: Settings layout and connection status

- **Labels:** enhancement, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-13 to 2027-01-15 (track ui, admin lane, effort M)
- **Depends on:** P6.5, P10.14
- **Findings addressed:**
  - UI-31 (medium): Settings is one 3,200px page with vague or misleading status badges, no connection health, and two editing patterns ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-17 (high): The shared primitives exist but are bypassed at scale, partly because they lack features ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-27 (low): Primitive quality gaps: a white focus halo, `focus:` instead of `focus-visible:`, template-string classes, a deprecated export, and 9 of 18 primitives untested ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.19 in plan.md](plan.md#step-p1019-settings-layout-and-connection-status)

**Context.** Turn the 3,200px settings page into the 6.4 layout: a sticky section nav with tone glyphs and a legend, and `SettingsSection`s that show live connection health from `lib/ui/status.ts`. Every form uses one always-open editing pattern, and mobile gets a "Jump to" Select.

**Acceptance criteria** (the step's "Done when" list):

- [ ] One page with the grouped glyph nav, the legend and the mobile Jump to Select.
- [ ] Every section is a `SettingsSection` with a status and a "Checked" time.
- [ ] No form has an Edit toggle, and the local badge helpers are deleted.
- [ ] Health checks are cached and never expose error text, and the baselines are reviewed.

### P10.20: Settings sections with SecretInput and audited saves

- **Labels:** enhancement, ui, admin, security
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-18 to 2027-01-20 (track ui, admin lane, effort M)
- **Depends on:** P10.19, P4.6
- **Findings addressed:**
  - UI-31 (medium): Settings is one 3,200px page with vague or misleading status badges, no connection health, and two editing patterns ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-13 (medium): Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - SEC-31 (medium): "Leave blank to keep the current secret", combined with the connection test, sends stored tokens and API keys to a newly entered URL ([security-audit.md](../research/security-audit.md))
  - SEC-55 (low): Credential and config changes are not audit-logged; the audit log goes to stdout only ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P10.20 in plan.md](plan.md#step-p1020-settings-sections-with-secretinput-and-audited-saves)

**Context.** Every service form uses FormFields and a SecretInput. A changed address demands the secret again before Test or Save can run (SEC-31), and each section shows who last saved it, from the persisted audit log (SEC-55). Discord shows two status rows, and Stripe states its prerequisites without premature errors.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every service form uses FormFields and SecretInput, with field-level errors.
- [ ] A changed origin blocks Test and Save in the browser, and the server refuses it too.
- [ ] Footers show the last audited save, and Discord shows two status rows.
- [ ] The Stripe prerequisites show without premature errors, and the origin E2E spec passes.

### P10.21: Home page refresh

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-08 to 2027-01-12 (track ui, member lane, effort M)
- **Depends on:** P6.9, P3.8, P6.3
- **Findings addressed:**
  - UI-38 (medium): Home quick links and feature cards: the Plex link goes to plex.tv, the Discord tile can be dead, the grid has holes, and watchlist sync shows where it can't work ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-34 (medium): Onboarding copy is Plex-only, leaks admin and internal details, and promises features the dashboard lacks ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-25 (medium): Announcements: Markdown lists lose their bullets, the list is clipped in a hidden scroll box, "NEW" is permanent, and the admin list shows raw Markdown with no preview ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-28 (low): Money and dates are formatted ad hoc: four currency precisions and more than six date formats ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-07 (medium): Status and error query params from Discord and NextAuth are silently dropped ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-29 (low): The Jellyfin dashboard tile falls back to jellyfin.org when the Jellyfin login button is hidden, and shows the Plex server's name ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P10.21 in plan.md](plan.md#step-p1021-home-page-refresh)

**Context.** Rebuild signed-in home as a Server Component page in the order of `home.html`: greeting, RewindCard, announcements with pips, quick links that go to the right places, a watchlist card only where it works, membership and help cards, and an UptimeStrip. Nothing animates forever. The "New on" poster row waits for P10.12.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Home follows `home.html` (minus "New on") as a Server Component page with no client fetch waterfall.
- [ ] The quick links go to the server's own Plex Web, the public Requests URL, `/discord/link`, and Jellyfin with the right name.
- [ ] Announcements render through MarkdownBody with seen-based pips, and the UptimeStrip hides without Prometheus.
- [ ] No infinite animation remains, and the E2E, visual and axe checks pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P10.22: Announcements, help and membership pages

- **Labels:** enhancement, ui, stripe
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-12 to 2027-01-14 (track ui, member lane, effort M)
- **Depends on:** P6.3, P3.8
- **Findings addressed:**
  - UI-25 (medium): Announcements: Markdown lists lose their bullets, the list is clipped in a hidden scroll box, "NEW" is permanent, and the admin list shows raw Markdown with no preview ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-30 (medium): No member app shell: home, Rewind, Discord, membership and account are connected by no navigation ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-37 (medium): The subscription pages are unstyled, show raw Stripe price IDs, and leave gated users with no way out ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.22 in plan.md](plan.md#step-p1022-announcements-help-and-membership-pages)

**Context.** Today nothing connects the member areas, and announcements lose their list styles inside a clipped scroll box (UI-30, UI-25). Add the three member destinations that home and the shell point to: `/announcements` with seen-based pips, `/help` with the onboarding guides and the support link, and `/membership` (Stripe on), which takes the plan, renewal and Manage billing off home.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/announcements`, `/help` and `/membership` exist with metadata, nav entries and tests.
- [ ] The guides are shared components with service-aware copy and no admin hints.
- [ ] `/membership` never shows a raw price id, and the subscription section is gone from home.
- [ ] E2E, visual and axe checks pass.

### P10.23: Onboarding refresh

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-15 to 2027-01-19 (track ui, member lane, effort M)
- **Depends on:** P6.5, P3.5, P10.22
- **Findings addressed:**
  - UI-33 (medium): Two separate wizard steppers; the setup stepper puts about 1,300px of cards before the form on mobile, and every step forces a timed interstitial ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-34 (medium): Onboarding copy is Plex-only, leaks admin and internal details, and promises features the dashboard lacks ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-10 (high): Status messages, focus and landmark semantics are missing: silent toasts, focus loss in wizards, no `aria-current`, no `<main>` or skip link, skipped heading levels ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.23 in plan.md](plan.md#step-p1023-onboarding-refresh)

**Context.** Rebuild member onboarding on the shared Stepper (6.5, `onboarding.html`): five illustrated steps in a minimal shell, no space background and no timed interstitials, focus on each step's h1, and copy that fits Plex and Jellyfin and promises only what the dashboard offers. Discord links through `/discord/connect?redirect=/onboarding`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Stepper exists in both orientations with tests.
- [ ] Onboarding has no space background, no interstitials and no infinite animation, and focus lands on each h1.
- [ ] The copy is service-aware, has no admin hints and promises only configured features.
- [ ] Discord goes through `/discord/connect?redirect=/onboarding`, and the E2E and visual checks pass.

### P10.25: Setup wizard UI

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-28 to 2027-02-01 (track ui, member lane, effort M)
- **Depends on:** P10.24, P6.5, P10.20
- **Findings addressed:**
  - UI-03 (high): The setup wizard requires every optional integration to pass a live connection test, with no skip ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-13 (medium): Forms lack a FormField primitive: orphan labels, unlabeled date inputs, error text not linked, four copy-pasted setup forms ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-33 (medium): Two separate wizard steppers; the setup stepper puts about 1,300px of cards before the form on mobile, and every step forces a timed interstitial ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - SEC-30 (medium): Setup wizard actions are unauthenticated until setup completes, so a fresh install exposed to the internet can be hijacked ([security-audit.md](../research/security-audit.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.25 in plan.md](plan.md#step-p1025-setup-wizard-ui)

**Context.** Today the wizard cannot be finished without a passing live connection to every optional service (UI-03). Rebuild first-run setup as `setup.html` draws it: the claim step, then Connect with Plex through the PIN flow with an owned-server picker and a token fallback; a grouped vertical Stepper with the same FormFields, SecretInput and inline test results as settings; and Skip on optional steps, with a summary that signs the owner in. No confetti and no space background.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The claim, Plex connect, service, Skip and summary steps match `setup.html` on the shared primitives.
- [ ] No plex.tv token reaches the browser, and the token fallback still works.
- [ ] The confetti, the space background and the five copied forms are deleted.
- [ ] The E2E spec passes on the test database, and the baselines are reviewed.

### P10.26: Invite page as a server-rendered pass

- **Labels:** enhancement, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-21 to 2027-01-25 (track ui, member lane, effort M)
- **Depends on:** P6.3, P3.9
- **Findings addressed:**
  - UI-36 (medium): The invite page is client-only (no unfurl), shows the wrong server name and mismatched brand marks, and labels every failure "Invalid Invite" ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-39 (medium): Branding, page titles and social metadata are inconsistent or missing; "Rewind" appears nowhere ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-40 (low): Copy has no shared voice: the same actions carry different labels, casing and tone ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.26 in plan.md](plan.md#step-p1026-invite-page-as-a-server-rendered-pass)

**Context.** Make `/invite/[code]` a Server Component that renders the InvitePass with metadata for link unfurls, the right server name and marks, and its own copy for expired, used-up and unknown invites. It gets a pass-shaped skeleton and a StatusScreen error.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The invite page is a Server Component with `generateMetadata` and no client validation.
- [ ] The server name and marks are correct for Plex and Jellyfin invites.
- [ ] Expired, used-up and unknown invites each have their own headline.
- [ ] The skeleton, the StatusScreen and the tests pass.

### P10.27: Sign-in, callback and denied screens

- **Labels:** enhancement, ui, privacy
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-19 to 2027-01-21 (track ui, member lane, effort M)
- **Depends on:** P6.3, P10.17
- **Findings addressed:**
  - UI-35 (medium): Sign-in takes two clicks plus a forced 3-second wait, on a landing page with no context ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-19 (medium): Six different error and status screen designs, dead ends, and an admin auth gate that relies on error names production strips ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-40 (low): Copy has no shared voice: the same actions carry different labels, casing and tone ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-34 (low): Plex sign-in copy says the token is "only needed to match your Plex account" although it is stored and reused, and members are never told about OpenAI processing, admin visibility or retention ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P10.27 in plan.md](plan.md#step-p1027-sign-in-callback-and-denied-screens)

**Context.** Rebuild the signed-out `/` as the member pass: one click on "Continue with Plex" with no forced wait, Jellyfin as the secondary option, and accurate copy about the stored Plex token with a short privacy notice. "Finishing sign-in" is the one full-screen spinner, and failed sign-ins and non-members get StatusScreens.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Sign-in is one click with no forced wait, and Jellyfin is the secondary option.
- [ ] The copy says the token is stored and reused, and the short privacy notice is present.
- [ ] "Finishing sign-in" is the only full-screen spinner, and the failure, denied and NextAuth error screens are StatusScreens.
- [ ] The E2E, axe and visual checks pass.

### P10.28: Subscribe pages

- **Labels:** enhancement, ui, stripe
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-26 to 2027-01-26 (track ui, member lane, effort S)
- **Depends on:** P6.3
- **Findings addressed:**
  - UI-37 (medium): The subscription pages are unstyled, show raw Stripe price IDs, and leave gated users with no way out ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-10 (high): Status messages, focus and landmark semantics are missing: silent toasts, focus loss in wizards, no `aria-current`, no `<main>` or skip link, skipped heading levels ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-40 (low): Copy has no shared voice: the same actions carry different labels, casing and tone ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.28 in plan.md](plan.md#step-p1028-subscribe-pages)

**Context.** Entitled members on `/subscribe` see "You already have access" with Manage billing. Everyone else sees plan cards with names and prices, never raw price ids, one primary action and a Sign out escape. The success page shows a live checklist.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Entitled members get the "You already have access" screen.
- [ ] The plan cards show names, prices and benefits, never raw ids, with one primary action.
- [ ] Sign out is always present, and checkout errors render inline.
- [ ] The success page polls a live checklist, and the tests pass.

### P11.13: Member offboarding and deletion

- **Labels:** enhancement, security, privacy, admin
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-18 to 2027-01-20 (track security, security and ops lane, effort M)
- **Depends on:** P4.7, P4.11
- **Findings addressed:**
  - GAP-31 (medium): Members can never be removed: no delete-user path exists, and unshare, Stripe revoke and Discord unlink leave almost all data in place while watchlist sync keeps using the stored Plex token ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.13 in plan.md](plan.md#step-p1113-member-offboarding-and-deletion)

**Context.** An admin can remove a member with an audited action that needs the member's name typed to confirm. Removal ends the member's sessions, removes their Plex or Jellyfin access, stops watchlist sync, revokes their Discord grant, and deletes or anonymises their personal rows and tokens, following a written data inventory.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Unshare and revoke stop watchlist sync and clear the stored Plex token.
- [ ] `eraseMember` runs the external effects, deletes or anonymises every inventory row, and audits the removal with ids only.
- [ ] The admin action needs the member's name typed, refuses protected members, and shows dry-run counts.
- [ ] `DiscordCommandLog` has its foreign key, and `docs/privacy.md` holds the inventory checked by a test.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.14: Retention jobs for content tables

- **Labels:** enhancement, security, privacy
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-21 to 2027-01-25 (track security, security and ops lane, effort M)
- **Depends on:** P11.13
- **Findings addressed:**
  - GAP-35 (low): No retention on content tables: LLMUsage, ChatConversation, DiscordCommandLog, WrappedShareVisit and WatchlistSyncHistory grow without bound, and no cleanup job exists ([additional-findings.md](../research/additional-findings.md))
  - SEC-34 (low): Bearer tokens and PII stored in plaintext beyond ENCRYPTED_FIELDS, with no retention policy ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.14 in plan.md](plan.md#step-p1114-retention-jobs-for-content-tables)

**Context.** A daily job enforces documented retention windows on the content tables, so viewing histories, direct messages and visit counters stop growing without bound. `docs/privacy.md` states how long each kind of personal data and each stored token is kept.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A daily sweep applies every documented window, with and without Redis.
- [ ] `ChatConversation.endedAt` is written, and watchlist removals are recorded.
- [ ] The Privacy settings section shows the windows and the last run, with an audited "Run now".
- [ ] `docs/privacy.md` states the retention of every content table and stored token.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.15: Member export and item-level deletion

- **Labels:** enhancement, security, privacy
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-26 to 2027-01-28 (track security, security and ops lane, effort M)
- **Depends on:** P11.13
- **Findings addressed:**
  - GAP-36 (low): Members have no machine-readable export or item-level deletion; the existing mark-delete action is unreachable ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.15 in plan.md](plan.md#step-p1115-member-export-and-item-level-deletion)

**Context.** Members have no machine-readable export or item-level deletion today, and the existing mark-delete action is unreachable (GAP-36). Members can download a machine-readable JSON export of their data from `/account`, and can delete single marks, watchlist history items and assistant conversations.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/account/export` returns a versioned, strictly validated JSON export with no secrets, rate-limited.
- [ ] Members can delete marks, watchlist history items and assistant conversations they own, and nothing else.
- [ ] The export covers every inventory model or records why not, and the E2E passes.

### P11.30: Eval results page

- **Labels:** enhancement, rewind, admin, llm
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-11 to 2027-01-11 (track rewind, security and ops lane, effort S)
- **Depends on:** P5.13, P6.5
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P11.30 in plan.md](plan.md#step-p1130-eval-results-page)

**Context.** Show the bake-off and eval results in the admin, for the 2027 model choice. This was the eval half of the former P7.11; the season used the committed results files directly, so the page waited for January.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `/admin/rewind/evals` lists `RewindEvalRun` rows and the committed results, and Evals appears in the admin nav.

## Refactoring & Technical Debt

### [READY] P1.1: Delete unreachable code; revive the Discord link panel

- **Labels:** refactor, ui, discord
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-20 to 2026-10-21 (track ui, UI lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - UI-45 (low): About 1,385 lines of unreachable admin code and several dead member components, with duplicates and naming drift ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - DUP-12 (medium): 26 files (3,107 LOC) that the shipped app never imports, kept alive only by ~6,400 LOC of tests, plus 4 API routes nothing live calls ([code-duplication.md](../research/code-duplication.md))
  - BP-36 (low): 16 unused component files (2,058 lines), a dead polling hook and 4 dead API routes ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-01 (high): Discord account linking cannot be reached from any user-facing UI ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-26 (low): The icon system is inline SVG copy-paste; lucide-react is installed but used once; `service-icons.tsx` is dead and points at missing files ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P1.1 in plan.md](plan.md#step-p11-delete-unreachable-code-revive-the-discord-link-panel)

**Context.** One PR deletes the code the shipped app never reaches, so no later step restyles, counts or tests a dead copy. It also turns `/discord/link` from a redirect into the working page that every Discord nudge already points at.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The 25 files, the 4 routes, `settings-edit-forms.tsx` and `link-callout.tsx` are deleted with their tests, and `npm run build`, `npm test` and the E2E suite pass.
- [ ] `/discord/link` renders the panel for signed-in members, and no secret field reaches the client.
- [ ] The home Discord tile takes unlinked members to `/discord/link`.
- [ ] `npm run knip` exists, and its unused-files list contains none of the removed paths.

### [READY] P1.2: Remove dead exports, the orphaned model and stale CLAUDE.md facts

- **Labels:** refactor, ops, database
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-27 to 2026-10-27 (track ops, hardening lane, effort S)
- **Depends on:** P1.1
- **Findings addressed:**
  - DUP-13 (medium): ~1,150 LOC of dead exported functions in live modules, an orphaned Prisma model, and stale CLAUDE.md references from the removed maintenance feature ([code-duplication.md](../research/code-duplication.md))
  - DUP-16 (low): Barrel and re-export chains, backwards-compat shims, duplicate component names and needless dynamic imports blur the module structure ([code-duplication.md](../research/code-duplication.md))
  - BP-39 (low): Performance tooling and CLAUDE.md references point at deleted modules ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - GAP-22 (low): CLAUDE.md documents client APIs that do not exist, plus wrong path, test and stack facts ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P1.2 in plan.md](plan.md#step-p12-remove-dead-exports-the-orphaned-model-and-stale-claudemd-facts)

**Context.** Remove the remaining dead exports and the orphaned `UserWatchIntent` model, and flatten the barrel and shim chains. Then make CLAUDE.md and the performance doc describe code that exists, because every agent session in this plan reads CLAUDE.md.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every DUP-13 dead export is deleted, and so are those P1.1 orphaned, except the two Discord helpers the link page uses.
- [ ] The `drop_user_watch_intent` migration applies cleanly, and `migrate diff` reports no difference.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] No nested barrel or compatibility shim remains, and each domain has at most one entry.
- [ ] CLAUDE.md names only APIs and paths that exist, and the path test enforces it.
- [ ] Build, typecheck and Jest are green.

### [READY] P1.3: Wire the Next, react-hooks and jsx-a11y ESLint presets

- **Labels:** refactor, ops, dependencies, accessibility
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-26 to 2026-10-26 (track ops, hardening lane, effort S)
- **Depends on:** P0.1
- **Findings addressed:**
  - BP-09 (medium): ESLint omits the Next, react-hooks and jsx-a11y presets, which are installed but not used ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - DUP-15 (medium): Unused, redundant and miswired dependencies: unwired eslint-config-next, unused prisma-adapter, redundant autoprefixer, and zlib-sync's native-toolchain cost ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P1.3 in plan.md](plan.md#step-p13-wire-the-next-react-hooks-and-jsx-a11y-eslint-presets)

**Context.** Run the Next, react-hooks and jsx-a11y rules, which are installed but unused, and fix the 18 errors they report today. Drop the unused and redundant dependencies, and the native-toolchain cost of zlib-sync.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The Next core-web-vitals, Next TypeScript and jsx-a11y recommended rules run, with one copy of each plugin.
- [ ] The 18 errors are fixed, and the new rules report as warnings.
- [ ] `autoprefixer`, `@eslint/eslintrc`, `qs` and `@types/qs` are gone, and `chalk` (plus `tsconfig-paths` if needed) is declared.
- [ ] `zlib-sync` is optional, and the Docker build needs no native toolchain.

### [READY] P1.8: Design-system guardrail script and debt baseline

- **Labels:** refactor, ui
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-22 to 2026-10-22 (track ui, UI lane, effort S)
- **Depends on:** P1.1
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P1.8 in plan.md](plan.md#step-p18-design-system-guardrail-script-and-debt-baseline)

**Context.** Count, per file, the design debt that `design/ui-design-system.md` section 9.6 bans, and commit today's counts (taken after P1.1) as `design-debt.json`. CI fails only when a count rises or a new file has a non-zero count.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The script implements every 9.6 rule, with unit tests.
- [ ] `design-debt.json` is committed from the tree after P1.1.
- [ ] The CI job fails only on a rise or on a new file with a non-zero count, and it handles renames.
- [ ] The PR template carries the 9.6 checkbox.

### [READY] P2.3: Shared outbound HTTP client and one Tautulli client

- **Labels:** refactor, platform, security
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-22 to 2026-10-23 (track platform, Rewind lane, effort M)
- **Depends on:** none
- **Findings addressed:**
  - DUP-03 (medium): No shared HTTP client for external services: three Tautulli layers, timeout-less fetches, unvalidated responses, copied connection tests and test-mode bypasses ([code-duplication.md](../research/code-duplication.md))
  - SEC-36 (low): Outbound service clients follow redirects carrying custom auth headers, put secrets in query strings, and often have no timeout ([security-audit.md](../research/security-audit.md))
  - RWP-10 (low): The shared Tautulli client wraps commands that do not exist, and Rewind bypasses the client entirely ([rewind-pipeline-audit.md](../research/rewind-pipeline-audit.md))
- **Plan:** [Step P2.3 in plan.md](plan.md#step-p23-shared-outbound-http-client-and-one-tautulli-client)

**Context.** Build one outbound HTTP helper with real timeouts, safe redirects and Zod parsing, and one Tautulli client that every caller uses. A hung or misbehaving upstream service can then no longer stall a request for five minutes or leak a key. The unrelated schema clean-up (DUP-11) moved to P11.5, so this step stays one reviewable change.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every outbound service call goes through `serviceFetch` or `tautulliCommand`, with a timeout that covers the body.
- [ ] Cross-origin redirects drop the custom auth headers, and no error text contains a key.
- [ ] There is one Tautulli client, the three nonexistent commands are gone, and the chatbot tools still work.
- [ ] A `result` other than `'success'` becomes a typed `TAUTULLI_ERROR` that is retried.
- [ ] One test-mode bypass remains, off in production.

### [READY] P2.15: framer-motion to motion with a global reduced-motion policy

- **Labels:** refactor, ui, dependencies, accessibility
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-10-27 to 2026-10-28 (track ui, UI lane, effort M)
- **Depends on:** P1.6
- **Findings addressed:**
  - BP-38 (low): Non-security dependency drift: motion is two majors behind, TypeScript 7 and ESLint 10 are available, plus an unused and an undeclared dependency ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-34 (low): Client bundles: framer-motion imported in full in 57 files, chart.js imported statically in 14, no bundle budget ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-15 (medium): Reduced motion is honored in 3 of 57 animated files, and infinite decorative animation runs on home, setup, onboarding, invite and error screens ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - RWV-09 (high): Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P2.15 in plan.md](plan.md#step-p215-framer-motion-to-motion-with-a-global-reduced-motion-policy)

**Context.** Move the app to the current `motion` package and replace `react-countup`, without changing what any screen looks like. Then make the operating system's reduced-motion setting apply app-wide.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every import uses `motion/react`, and `framer-motion` and `react-countup` are uninstalled.
- [ ] `<MotionConfig reducedMotion="user">` wraps the app, and the infinite loops respect reduced motion.
- [ ] `CountUp` gives screen readers a stable final value.
- [ ] The rename commit shows zero visual diffs, and every later diff is limited to looping elements and has been reviewed.

### [READY] P3.10: One formatter module

- **Labels:** refactor, ui
- **Phase:** [P3: UI foundations: tokens, fonts and primitives](plan.md#phase-3-ui-foundations-tokens-fonts-and-primitives), 2026-10-26 to 2026-11-05
- **Window:** 2026-10-28 to 2026-10-29 (track ui, UI lane, effort M)
- **Depends on:** P2.2
- **Findings addressed:**
  - DUP-09 (low): Formatter sprawl: two byte formatters, 9 local formatDate copies, divergent watch-time rounding across Rewind surfaces ([code-duplication.md](../research/code-duplication.md))
  - UI-28 (low): Money and dates are formatted ad hoc: four currency precisions and more than six date formats ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - GAP-41 (low): Server-rendered client components format dates, numbers and relative times with runtime defaults, causing confirmed React hydration mismatches ([additional-findings.md](../research/additional-findings.md))
  - GAP-45 (low): Relative-time helpers count elapsed 24-hour periods instead of calendar days and are English-only, and Rewind eligibility ignores the day of the month ([additional-findings.md](../research/additional-findings.md))
  - GAP-46 (low): Number grouping depends on which runtime renders it: server components always use en-US, client components the viewer's locale ([additional-findings.md](../research/additional-findings.md))
  - GAP-43 (low): No timezone policy: server-rendered admin timestamps show unlabelled container time (UTC in Docker), client-rendered ones show browser time, and the same page mixes both ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P3.10 in plan.md](plan.md#step-p310-one-formatter-module)

**Context.** Replace `lib/utils/formatters.ts`, `lib/utils/time-formatting.ts` and the local copies with one `lib/utils/format.ts`. It formats every number, amount, date, duration and relative time in `Config.timezone` and `Config.locale`, identically on the server and the client, so the pages with hydration mismatches stop re-rendering.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `lib/utils/format.ts`, `lib/settings/app-settings.ts` and `<Time>` exist, and `formatters.ts`, `time-formatting.ts`, the shims and the local copies are deleted.
- [ ] Server and client format in `Config.timezone` and `Config.locale`.
- [ ] The hydration spec passes, and the zone and locale tests pass.
- [ ] The lint bans are on for `app/` and `components/`.

### P10.7: Client data-loading and boundary sweep

- **Labels:** refactor, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-08 to 2027-02-10 (track ui, admin lane, effort M)
- **Depends on:** P10.1, P10.2, P10.5
- **Findings addressed:**
  - BP-29 (medium): Client components load data with `useEffect` plus server actions or fetch, instead of server props or TanStack Query ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - UI-41 (medium): Pages load data client-side in `useEffect`, as sequential waterfalls, instead of server props or TanStack Query ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-32 (low): `'use client'` is overused and the React 19 form APIs are not adopted ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-33 (low): Live internal admin reads go through API routes, against CLAUDE.md ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P10.7 in plan.md](plan.md#step-p107-client-data-loading-and-boundary-sweep)

**Context.** Many client components still load their first data in `useEffect` waterfalls, and live admin reads go through API routes, against CLAUDE.md (BP-29, UI-41, BP-33). No client component loads its first data in an effect, the command-menu search is the only admin API route left, unneeded `'use client'` markers are gone, and the remaining forms that mutate use React 19 form actions.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No client component loads its first data in a `useEffect`; the inventory is attached to the PR.
- [ ] `app/api/admin/` holds only the search route, and a test enforces it.
- [ ] The client-marker rule is in the ratchet, with a count at or near zero.
- [ ] Every remaining mutation form uses `<form action>` with `useActionState`, and the react-hooks rules are errors.

### P10.9: Charts on shadcn Chart; chart.js removed

- **Labels:** refactor, ui, admin, dependencies, accessibility
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-10 to 2027-02-12 (track ui, admin lane, effort M)
- **Depends on:** P10.2, P10.5
- **Findings addressed:**
  - UI-24 (medium): Charts: 14 files each register Chart.js and hard-code their own theme; no accessible names, repeated tick labels, invented curves, UTC date shifts and an inflated cost projection ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - BP-34 (low): Client bundles: framer-motion imported in full in 57 files, chart.js imported statically in 14, no bundle budget ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P10.9 in plan.md](plan.md#step-p109-charts-on-shadcn-chart-chartjs-removed)

**Context.** ChartCard renders through shadcn Chart on Recharts 3, with its accessibility layer, CSS-variable colours and generated text summaries. The last Chart.js registration goes, chart.js and react-chartjs-2 are uninstalled, and the bundle budget is checked.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every chart is a ChartCard on shadcn Chart and Recharts 3, with `accessibilityLayer`, CSS-variable colours and a generated summary.
- [ ] chart.js and react-chartjs-2 are uninstalled, and lint blocks their return.
- [ ] The admin chart budget is recorded and enforced, and the Rewind budget still passes.
- [ ] Jest, E2E, axe and the reviewed visual baselines pass.

### P10.11: Remove adapters and enforce the guardrails

- **Labels:** refactor, ui, admin, testing
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-17 to 2027-02-19 (track ui, admin lane, effort M)
- **Depends on:** P10.7, P10.9
- **Findings addressed:**
  - UI-17 (high): The shared primitives exist but are bypassed at scale, partly because they lack features ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-46 (low): 40 interactive admin files have no data-testid, and admin E2E selects by DOM structure ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - DUP-14 (medium): UI primitives exist but are rarely adopted: 108-115 hand-copied panels, 32-34 inline spinners, 243 inline SVGs, duplicated filters, charts, modals and status panels ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P10.11 in plan.md](plan.md#step-p1011-remove-adapters-and-enforce-the-guardrails)

**Context.** This closes the design-system migration: today the shared primitives are bypassed at scale, and admin E2E selects by DOM structure (UI-17, UI-46, DUP-14). Move every call site off the 9.4 adapters and delete them, make the raw-element ESLint bans and the design-system check fail CI, and give every interactive admin element a `data-testid` that the E2E specs use.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No adapter file or deprecated prop value remains, and typecheck proves it.
- [ ] The raw-element bans and the restricted imports are errors, and `check-design-system.mjs --strict` gates CI with `design-debt.json` deleted.
- [ ] Every interactive admin element has a `data-testid`, enforced by the coverage spec.
- [ ] No admin E2E spec selects by DOM structure, CSS class or text.

### P10.13: Token codemod: the tool and the member slices

- **Labels:** refactor, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-04 to 2027-01-07 (track ui, member lane, effort L, 2 PRs)
- **Depends on:** P3.1, P3.4
- **Findings addressed:**
  - UI-16 (high): Four unrelated visual languages; Rewind's own controls, intro and public share page break its cinematic theme ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-17 (high): The shared primitives exist but are bypassed at scale, partly because they lack features ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.13 in plan.md](plan.md#step-p1013-token-codemod-the-tool-and-the-member-slices)

**Context.** Build `scripts/codemods/tokens.ts` on ts-morph, apply the automatic pairs of `design/ui-design-system.md` 9.3, and write every other match to `codemod-review.md`. Run it over the member slices that no January rebuild replaces, each with its screenshot diff and lower design-debt counts. This was P3.11; it moved to January with the page rebuilds (decision 28), and its other slices fold into the steps that rebuild those pages.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The tool implements every 9.3 pair, with tests, and is idempotent.
- [ ] The two slice PRs are merged, each with a reviewed screenshot diff and resolved review items, and the tool is ready for P10.14 and the page rebuilds.
- [ ] `design-debt.json` counts are lower for every file in those slices.

### P10.14: Token codemod: admin users and settings slices

- **Labels:** refactor, ui, admin
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-01-07 to 2027-01-11 (track ui, admin lane, effort M, 2 PRs)
- **Depends on:** P10.13
- **Findings addressed:**
  - UI-17 (high): The shared primitives exist but are bypassed at scale, partly because they lack features ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
  - DUP-14 (medium): UI primitives exist but are rarely adopted: 108-115 hand-copied panels, 32-34 inline spinners, 243 inline SVGs, duplicated filters, charts, modals and status panels ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P10.14 in plan.md](plan.md#step-p1014-token-codemod-admin-users-and-settings-slices)

**Context.** Run the token codemod over the admin users and settings areas, one PR each with screenshot diffs, converting the hand-copied panels to `Card` (UI-17, DUP-14). P10.18's users page and P10.19's settings layout then start from tokenised files, while the other admin areas run the codemod inside their own January rebuilds (P10.1 to P10.6).

**Acceptance criteria** (the step's "Done when" list):

- [ ] The users and settings areas are tokenised in their own PRs, with reviewed diffs.
- [ ] The users and settings panels render through `Card`.
- [ ] Those areas' `design-debt.json` counts and contrast violations are lower.

### P10.15: Spinner and icon sweeps

- **Labels:** refactor, ui
- **Phase:** [P10: UI refresh after Rewind](plan.md#phase-10-ui-refresh-after-rewind), 2027-01-04 to 2027-02-19
- **Window:** 2027-02-02 to 2027-02-04 (track ui, member lane, effort M, 2 PRs)
- **Depends on:** P3.4, P3.9
- **Findings addressed:**
  - DUP-14 (medium): UI primitives exist but are rarely adopted: 108-115 hand-copied panels, 32-34 inline spinners, 243 inline SVGs, duplicated filters, charts, modals and status panels ([code-duplication.md](../research/code-duplication.md))
  - UI-26 (low): The icon system is inline SVG copy-paste; lucide-react is installed but used once; `service-icons.tsx` is dead and points at missing files ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P10.15 in plan.md](plan.md#step-p1015-spinner-and-icon-sweeps)

**Context.** Script the replacement of the 32 to 34 inline spinners with `Spinner` or `Button loading`, and of the repeated check, chevron, close and warning SVGs with lucide components through `Icon`. Add both counts to the design-debt ratchet so they can only go down.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `inline-spinner` and `inline-svg` are in the ratchet, with counts that have fallen.
- [ ] No inline spinner remains outside the skipped v2 code; each became `Spinner` or `Button loading`.
- [ ] The repeated check, chevron, close and warning SVGs render through lucide.
- [ ] Both codemods have tests and are idempotent.

### P11.5: Admin actions on the action helper; server-only boundaries

- **Labels:** refactor, security, admin
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-06 to 2027-01-08 (track security, security and ops lane, effort M)
- **Depends on:** P4.3
- **Findings addressed:**
  - BP-04 (medium): 44 of 91 parameterised server actions have no Zod validation, and action return shapes are inconsistent ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-06 (low): `'use server'` is used as a server-only marker and for read helpers; the `server-only` package is never imported ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - DUP-06 (medium): Server-action auth, try/catch and result-shape boilerplate repeated about 130 times with three result shapes and throw-based guards ([code-duplication.md](../research/code-duplication.md))
  - DUP-11 (low): Zod schema and type duplication: per-service schemas differ only by port, duplicate year validators, unused shared schemas, repeated config types ([code-duplication.md](../research/code-duplication.md))
- **Plan:** [Step P11.5 in plan.md](plan.md#step-p115-admin-actions-on-the-action-helper-server-only-boundaries)

**Context.** Every remaining admin action runs through P4.3's `adminAction` with a Zod schema and returns one result shape. Read helpers leave `'use server'` modules for server-only loaders that check auth next to the data, and the last backwards-compatible action barrels are deleted.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No `requireAdmin()` call remains, and every admin action validates with Zod and returns `ActionResult`.
- [ ] Read helpers live in `lib/data/*` with `server-only` and check admin access themselves.
- [ ] The guards and the chatbot internals are server-only modules, not `'use server'` files.
- [ ] `actions/admin/index.ts` and `actions/users.ts` are deleted, and the brand test passes.
- [ ] The per-service schemas share one factory, and the duplicate types and schemas listed under DUP-11 are gone.

### P11.18: Season success review and season close cleanup

- **Labels:** refactor, rewind, database
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-15 to 2027-02-02 (track rewind, security and ops lane, effort S)
- **Depends on:** P9.3
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P11.18 in plan.md](plan.md#step-p1118-season-success-review-and-season-close-cleanup)

**Context.** On 2027-01-15, review the season against the Rewind 1.4 targets and record the result. After the 2026 season closes on 2027-01-31, remove the v2 sharing leftovers and the legacy season-date columns, and confirm that every expired share link returns the branded 404 (`design/rewind-2026-design.md` 6.2, 7.10 and the "Season close" row of 13.1). A database dump is taken first, and the row counts of the removed data are recorded in the PR.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The 2027-01-15 review is recorded in `docs/rewind.md` with each target's figure, and follow-ups are filed.
- [ ] The v2 share branch, projection, routes and actions are deleted, and the FR-1 redirect remains.
- [ ] `PlexWrapped.shareToken`, `WrappedShareVisit` and the two legacy `Config` date columns are dropped by one reviewed migration.
- [ ] Expired v3 links and their card assets return 404, checked in tests and on production.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.19: Adopt Cache Components

- **Labels:** refactor, platform, performance
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-15 to 2027-02-19 (track platform, platform lane, effort L)
- **Depends on:** P11.5
- **Findings addressed:**
  - BP-31 (low): Next 16 caching and rendering features are unused: blanket force-dynamic, no per-request memoization, redundant refreshes ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.19 in plan.md](plan.md#step-p1119-adopt-cache-components)

**Context.** Move the app onto Next 16 Cache Components: delete the 41 `force-dynamic` exports, memoise per-request reads, cache shared non-secret data with tags, and drop the redundant client refreshes. The visual and E2E suites stay green throughout.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `cacheComponents` is on, and no `force-dynamic` export remains.
- [ ] Session and active-service reads are memoised per request, and shared non-secret data is cached with tags that mutations update.
- [ ] Redundant `router.refresh()` calls are gone, and before and after measurements are in the PR.
- [ ] The visual, E2E, axe and performance suites are green.

### P11.21: Split oversized files

- **Labels:** refactor, platform
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-01 to 2027-02-03 (track platform, platform lane, effort M)
- **Depends on:** P11.5
- **Findings addressed:**
  - BP-30 (medium): Files well over the CLAUDE.md size limits mix several responsibilities ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.21 in plan.md](plan.md#step-p1121-split-oversized-files)

**Context.** Several files are still well over the CLAUDE.md size limits and mix responsibilities (BP-30). Split the components and action files that still exceed the CLAUDE.md size limits along their responsibilities, with no behaviour change, and keep them under the limits with a lint rule.

**Acceptance criteria** (the step's "Done when" list):

- [ ] No component or action file exceeds 300 lines without a documented exception.
- [ ] Each split is a move-only PR with green tests.
- [ ] The `max-lines` rule is enforced for components and actions, and warns for `lib` and `hooks`.

### P11.23: Dependency majors and the auth spike

- **Labels:** refactor, platform, dependencies, security
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-22 to 2027-02-24 (track platform, security and ops lane, effort M)
- **Depends on:** P1.5
- **Findings addressed:**
  - BP-38 (low): Non-security dependency drift: motion is two majors behind, TypeScript 7 and ESLint 10 are available, plus an unused and an undeclared dependency ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-07 (low): next-auth v4 is in maintenance; unused `@next-auth/prisma-adapter`; ts-node is stale ([security-audit.md](../research/security-audit.md))
- **Plan:** [Step P11.23 in plan.md](plan.md#step-p1123-dependency-majors-and-the-auth-spike)

**Context.** Upgrade to TypeScript 7 and ESLint 10, or record exactly what blocks each one. Run a time-boxed Better Auth spike (Plex PIN and Jellyfin plugins, database sessions) that ends in a written go or no-go on leaving next-auth v4.

**Acceptance criteria** (the step's "Done when" list):

- [ ] TypeScript 7 and ESLint 10 are merged, or each blocker is recorded with its upstream issue.
- [ ] Lint findings are unchanged across the ESLint upgrade.
- [ ] `auth-spike-2027-02.md` exists with evidence for each question and a go or no-go.

### P11.29: Remove the v2 viewer

- **Labels:** refactor, rewind
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-04 to 2027-01-06 (track rewind, security and ops lane, effort M)
- **Depends on:** P7.13, P8.8, P7.9
- **Findings addressed:**
  - DUP-08 (low): Legacy v1 "classic" wrapped section set and chart stack are kept only for stored pre-2026 records ([code-duplication.md](../research/code-duplication.md))
  - RWV-12 (medium): No slide registry: two duplicated theme trees, two switch dispatchers, copy split between lib and components, stored data never validated, dead files ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-13 (low): Performance: 20 Hz React re-render of the whole slide during autoplay, width-animated progress, chart.js shipped to v2, full-size posters for thumbnails ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - BP-34 (low): Client bundles: framer-motion imported in full in 57 files, chart.js imported statically in 14, no bundle budget ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.29 in plan.md](plan.md#step-p1129-remove-the-v2-viewer)

**Context.** Delete the legacy viewer and, with it, the journey's other visual identities: `components/wrapped/**`, the classic and cinematic section trees, chart.js in Rewind and the temporary cinematic aliases. This was the second half of P7.13; it waits for January because P7.13's archive articles already keep members off the old viewer, and the deletion touches nothing the season needs.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `components/wrapped/**`, the classic and cinematic trees, chart.js in Rewind and the temporary cinematic aliases are deleted.
- [ ] `knip --production` and the design-system check pass with lower totals.

## Documentation

### P7.17: Rewind operator runbook

- **Labels:** documentation, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-24 to 2026-11-25 (track docs, hardening lane, effort M)
- **Depends on:** P1.10, P7.8
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.17 in plan.md](plan.md#step-p717-rewind-operator-runbook)

**Context.** An operator can run the Rewind season from `docs/rewind.md` alone: requirements, flags, the soft launch, the season-open checklist hour by hour, monitoring, roll back and the final cut. It is written by 2026-11-25, so the 30 November rehearsal (P8.1) and the season open (P8.2) follow it rather than writing it. This is the docs half of the former P8.7; its code half, the safe upgrade path, is P1.10.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `docs/rewind.md` covers the requirements, flags and cut keys, the season-open checklist, monitoring, roll back, the final cut and the Tautulli 2.17 warning.
- [ ] It is merged by 2026-11-25, and the runbook test passes.

### P11.24: Deployment, environment and domain-move docs

- **Labels:** documentation
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-04 to 2027-02-08 (track docs, security and ops lane, effort M)
- **Depends on:** P1.10, P7.17
- **Findings addressed:**
  - GAP-16 (low): Production deployment is undocumented: the only compose file is a dev harness that overrides `.env`, the image is never named, and `start:prod` works only inside the image ([additional-findings.md](../research/additional-findings.md))
  - GAP-17 (low): Moving host or domain is undocumented: `NEXT_PUBLIC_APP_URL` is frozen at build time for non-Docker builds, and four external registrations must be changed by hand ([additional-findings.md](../research/additional-findings.md))
  - GAP-18 (low): The env reference is incomplete and partly wrong: 12 app variables are missing from example.env, and the README production list omits the required `PLEX_CLIENT_IDENTIFIER` ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.24 in plan.md](plan.md#step-p1124-deployment-environment-and-domain-move-docs)

**Context.** An operator can deploy the published image in production, move the install to a new host or domain, and look up every environment variable from the docs alone. The environment reference is generated from `lib/env.ts`, so it cannot drift.

**Acceptance criteria** (the step's "Done when" list):

- [ ] A production compose file uses the published image, and `docs/deployment.md` covers compose, reverse proxy, claim and bare metal.
- [ ] `start:prod` works outside the image or is removed, and CLAUDE.md matches.
- [ ] `docs/domain-move.md` lists the URL variables, the four external registrations and what members notice, and the Discord portal fallback is fixed.
- [ ] `docs/environment.md` and `example.env` are generated from `envSchema`, and CI checks them.

### P11.26: README and CLAUDE.md accuracy pass

- **Labels:** documentation
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-16 to 2027-02-16 (track docs, security and ops lane, effort S)
- **Depends on:** P11.24
- **Findings addressed:**
  - GAP-21 (low): README feature and security claims are partly false or overstated, and several shipped features are not mentioned ([additional-findings.md](../research/additional-findings.md))
  - GAP-22 (low): CLAUDE.md documents client APIs that do not exist, plus wrong path, test and stack facts ([additional-findings.md](../research/additional-findings.md))
  - BP-39 (low): Performance tooling and CLAUDE.md references point at deleted modules ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.26 in plan.md](plan.md#step-p1126-readme-and-claudemd-accuracy-pass)

**Context.** README's feature and security claims match the code after the refresh, and it describes Rewind, Stripe and Jellyfin. CLAUDE.md's integration patterns, paths and testing facts are checked again against the final code, because every agent session reads it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] README claims match the code, and Rewind, Stripe, Jellyfin, invites, watchlist sync and the assistants are described.
- [ ] CLAUDE.md's integration snippets, file tree, testing and workflow facts match the final code.
- [ ] The path, symbol and claims tests pass.

### P11.27: Project-authored agent skills

- **Labels:** documentation
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-17 to 2027-02-18 (track docs, security and ops lane, effort S)
- **Depends on:** P1.9
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P11.27 in plan.md](plan.md#step-p1127-project-authored-agent-skills)

**Context.** Write the four project skills that Rewind Phase 3 deferred (`design/rewind-2026-design.md` 13.5, `research/visual-generation-skills.md` 7.3): `rewind-design-system`, `rewind-page`, `share-card` and `visual-qa` in `.claude/skills/`, and check each against the code it describes. Each skill points at the source files and design sections rather than copying values, so it cannot drift silently.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The four skills exist with scoped frontmatter and point at the real files and design sections.
- [ ] The project-skills test passes, and `THIRD_PARTY.md` and the settings list them.
- [ ] The fresh-session check loads the right skills for a card file.

## Testing

### [READY] P1.4: Type-check the test files

- **Labels:** testing, ops
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-26 to 2026-10-27 (track ops, hardening lane, effort M)
- **Depends on:** P1.1
- **Findings addressed:**
  - BP-08 (medium): Test files are never type-checked: `tsconfig.test.json` inherits the parent's exclude list, hiding 601 type errors and stale tests ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P1.4 in plan.md](plan.md#step-p14-type-check-the-test-files)

**Context.** Make `tsc` check the test files, then fix the hidden type errors (601 before P1.1's deletions) and the stale tests behind them. `npm run typecheck` runs both the app project and the test project.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `tsconfig.test.json` type-checks every Jest test file.
- [ ] `npm run typecheck` passes for both projects with 0 errors.
- [ ] The stale tests assert today's contracts, and Jest is green.
- [ ] Tests use the typed Prisma mock helper and the factories, and no new suppressions were added.

### [READY] P1.6: Visual-regression project and baselines

- **Labels:** testing, ui
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-22 to 2026-10-23 (track ui, UI lane, effort M)
- **Depends on:** P0.1, P1.1
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P1.6 in plan.md](plan.md#step-p16-visual-regression-project-and-baselines)

**Context.** Before any styling change, take screenshots of 20 key screens at 1440x900 and 390x844: the 16 that `design/ui-design-system.md` section 9.2, Phase 0 item 3 lists, plus `/discord/link`, `/auth/denied`, the admin user detail page and the stored v2 Rewind. From then on, every styling PR shows a reviewed diff.

**Acceptance criteria** (the step's "Done when" list):

- [ ] 20 screens at both viewports (40 images) are committed under `e2e/visual/__screenshots__/`, generated in the CI container.
- [ ] Two consecutive CI runs pass with no pixel differences.
- [ ] Time, randomness and timestamps are controlled, and the seed is deterministic.
- [ ] `e2e/visual/README.md` explains how to update a baseline, and a baseline commit from the workflow gets the required checks on its own SHA.

### [READY] P1.7: axe at wcag22aa on every route

- **Labels:** testing, ui, accessibility
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-22 to 2026-10-22 (track ui, UI lane, effort S)
- **Depends on:** P0.1
- **Findings addressed:**
  - UI-12 (medium): Text and button contrast fails AA widely, and the existing axe gate can't detect it on gradient page backgrounds ([ui-ux-audit.md](../research/ui-ux-audit.md))
- **Plan:** [Step P1.7 in plan.md](plan.md#step-p17-axe-at-wcag22aa-on-every-route)

**Context.** Scan every route at WCAG 2.2 AA and every impact level, counting "incomplete" contrast results too, and commit today's violations as a burn-down baseline that may only shrink. Today contrast fails AA widely, and the existing axe gate cannot detect it on gradient page backgrounds (UI-12). Later UI steps that fix contrast, labels or landmarks lower the baseline in the same PR.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Every page under `app/` is scanned with the WCAG 2.2 AA tags plus best-practice, at every impact level.
- [ ] Incomplete contrast results are counted.
- [ ] `e2e/a11y/axe-baseline.json` records today's counts, and the check fails on any rise.
- [ ] The spec uses no CSS or aria-label selectors and no longer scans the nonexistent `/auth/signin`.

### P2.10: Twenty golden fixtures with hand-checked stats

- **Labels:** testing, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-02 to 2026-11-04 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.4, P2.7
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P2.10 in plan.md](plan.md#step-p210-twenty-golden-fixtures-with-hand-checked-stats)

**Context.** Twenty synthetic member profiles with hand-checked values. Every later change to the stats, every page `select()` and every eval run is measured against them. This step asserts the stats-level values; P2.16 asserts the facts, editions and archetypes once P2.9 has merged. The owner signs off the profiles and the eval budget on 2026-11-06.

**Acceptance criteria** (the step's "Done when" list):

- [ ] 20 synthetic fixtures cover every profile in design 8.6 and parse through the real source schemas.
- [ ] For each fixture, the hand-checked stats-level values match in Jest under both process zones.
- [ ] The generator is deterministic, and its `--check` run is clean.
- [ ] The owner has signed off the profiles and the eval budget on 2026-11-06.

### P2.16: Fact and archetype goldens for the twenty fixtures

- **Labels:** testing, rewind
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-06 to 2026-11-09 (track rewind, Rewind lane, effort M)
- **Depends on:** P2.9, P2.10
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P2.16 in plan.md](plan.md#step-p216-fact-and-archetype-goldens-for-the-twenty-fixtures)

**Context.** Once P2.9's catalogue, `buildFacts` and scorers have merged, prove that every fixture's hand-checked facts, edition, archetype and omitted pages come out of the real code. This is the half of the former P2.10 that needs P2.9; P5.5's `select()` tests and P5.13's harness start from it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] For each fixture, the hand-checked facts, edition, archetype and omitted pages match in Jest under both process zones.
- [ ] The owner has reviewed the golden values by 2026-11-10.

### P2.14: Re-measure cards on Next 16.4.2

- **Labels:** testing, rewind, performance
- **Phase:** [P2: Rewind data layer and AI foundations](plan.md#phase-2-rewind-data-layer-and-ai-foundations), 2026-10-22 to 2026-11-09
- **Window:** 2026-11-04 to 2026-11-04 (track rewind, Rewind lane, effort S)
- **Depends on:** P0.1, P2.13
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P2.14 in plan.md](plan.md#step-p214-re-measure-cards-on-next-1642)

**Context.** Confirm that the cards render as designed, and fast enough, on the Next version that ships. Then set the typesetter's card slack and the `CARD_VERSION` format from measured numbers, replacing the design's provisional ones.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The three mockup cards and the fitting fixtures render through the installed `next/og`.
- [ ] Render timings are recorded against NFR-10, with the versions they were measured on.
- [ ] `CARD_SLACK` comes from measurement, and `CARD_VERSION` is generated in the fixed format and checked in CI.

### P5.4: Rewind visual, axe and performance test projects

- **Labels:** testing, rewind, accessibility, performance
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-12 to 2026-11-13 (track rewind, UI lane, effort M)
- **Depends on:** P5.2, P1.6
- **Findings addressed:**
  - BP-10 (medium): Critical modules are barely tested; app/ and hooks/ are excluded from coverage; no thresholds; E2E skips Rewind and production mode ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-34 (low): Client bundles: framer-motion imported in full in 57 files, chart.js imported statically in 14, no bundle budget ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - RWV-13 (low): Performance: 20 Hz React re-render of the whole slide during autoplay, width-animated progress, chart.js shipped to v2, full-size posters for thumbnails ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P5.4 in plan.md](plan.md#step-p54-rewind-visual-axe-and-performance-test-projects)

**Context.** Put the Rewind safety nets in place before the pages land: screenshots at every supported viewport on chromium and webkit, axe at WCAG 2.2 AA, a throttled performance gate with the first-page JavaScript budget, and an authenticated E2E skeleton on the design's test ids. They land before the Rewind pages, so every page step in P5 and P7 arrives with screenshot, axe and performance evidence.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Visual projects run at the five phone viewports and 1440x900 on chromium and webkit, with the 12 px text and 44 px target checks.
- [ ] Axe runs at wcag22aa on story mode, and article mode is wired for chromium, webkit and firefox.
- [ ] The 4x-throttled performance gate fails on long tasks over 50 ms or on renders between page turns.
- [ ] The 110 KB first-page JavaScript budget is checked in CI.
- [ ] The authenticated E2E skeleton runs on the design's test ids, and every later flow has a named placeholder.

### P5.13: Eval harness and model bake-off

- **Labels:** testing, rewind, llm
- **Phase:** [P5: Rewind core experience and model bake-off](plan.md#phase-5-rewind-core-experience-and-model-bake-off), 2026-11-06 to 2026-11-20
- **Window:** 2026-11-16 to 2026-11-20 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.9, P2.16
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P5.13 in plan.md](plan.md#step-p513-eval-harness-and-model-bake-off)

**Context.** Choose the default and economy models by measurement, with a harness that shows its cost before spending, gates on deterministic checks and treats a cross-family judge as advice. Run the bake-off on 18-20 November and record the decision.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `npm run eval:rewind` prints a cost estimate before any paid call, and writes a results JSON and a `RewindEvalRun` row.
- [ ] The deterministic gates run in CI on recorded outputs with no network access.
- [ ] The judge always comes from a different model family, and its score stays advisory.
- [ ] Eval runs started on 2026-11-16, and the 18-20 November bake-off applied the selection rule; the default reaches 98% or more first-pass grounding.
- [ ] The default and economy models are recorded in the planning folder and configured.

### P7.15: Accessibility and low-end performance pass

- **Labels:** testing, rewind, accessibility, performance
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-19 to 2026-11-23 (track rewind, Rewind lane, effort M)
- **Depends on:** P5.4, P7.1, P7.2
- **Findings addressed:**
  - RWV-09 (high): Reduced motion mostly ignored, count-ups and charts give screen readers nothing stable, low-contrast chart marks, zoom disabled ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
  - RWV-13 (low): Performance: 20 Hz React re-render of the whole slide during autoplay, width-animated progress, chart.js shipped to v2, full-size posters for thumbnails ([rewind-visuals-audit.md](../research/rewind-visuals-audit.md))
- **Plan:** [Step P7.15 in plan.md](plan.md#step-p715-accessibility-and-low-end-performance-pass)

**Context.** Prove that the whole issue works with screen readers, forced colours and low-end phones before the soft launch. Run the manual VoiceOver and TalkBack scripts, add low-end mode, and fix until axe, the long-task gate and the bundle budget pass on every page of three fixtures. The step no longer waits for P7.4: the phone story is its scope, P7.4's spread brings its own axe and visual checks, and the gates below then cover the spread too because they are blocking CI jobs.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The VoiceOver (iOS 26) and TalkBack (Android 16) scripts have been run, their failures fixed and the results recorded in the PR.
- [ ] The forced-colours checks pass on every page.
- [ ] Low-end mode uses the `scaleX` stretch, drops the grain blend and loads the smallest posters.
- [ ] axe, the long-task gate and the bundle budget pass on every page of three fixtures.

### P8.10: First final-cut dry run on staging

- **Labels:** testing, rewind
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-11 to 2026-12-11 (track rewind, Rewind lane, effort S)
- **Depends on:** P8.5
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.10 in plan.md](plan.md#step-p810-first-final-cut-dry-run-on-staging)

**Context.** Rehearse the final cut end to end on a staging copy of production before the code freeze, so a failure can still be fixed as ordinary work. P9.2 repeats it on 2026-12-28 as the second rehearsal.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The final cut ran on a staging copy with `--through=2026-12-10`, with its own Redis and every outbound side effect neutralised.
- [ ] The validator reported zero failures, the re-call rate and its reasons are recorded, and staging is torn down.

### P9.2: Second final-cut dry run

- **Labels:** testing, rewind
- **Phase:** [P9: Monitor and final cut](plan.md#phase-9-monitor-and-final-cut), 2026-12-15 to 2027-01-02
- **Window:** 2026-12-28 to 2026-12-28 (track rewind, Rewind lane, effort S)
- **Depends on:** P8.5, P8.10
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P9.2 in plan.md](plan.md#step-p92-second-final-cut-dry-run)

**Context.** Show again, on a fresh staging copy of production, that the final cut works before it runs for real. This is the second rehearsal: P8.10 ran the first on 2026-12-11, before the code freeze, so this one should only confirm. It must re-call the LLM for fewer than 30% of members, and every resulting Rewind must validate against `RewindDataV3` and its page schemas.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The final cut ran on a staging copy of production, with its own Redis and every outbound side effect neutralised.
- [ ] Fewer than 30% of members re-called the LLM, and the reasons are recorded.
- [ ] Every eligible member's 2026 Rewind validates: version 3, every page schema, `finalCut` set, kept slots grounded, and share projections inside the allow-list.
- [ ] The cost, the timings and the notification recipient count are recorded, and a roll back and its undo were rehearsed.
- [ ] The go decision is recorded, staging is torn down, and production's 1 January schedule is confirmed.

### P11.22: Test coverage backfill

- **Labels:** testing, ops
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-11 to 2027-02-15 (track ops, security and ops lane, effort M)
- **Depends on:** P1.5
- **Findings addressed:**
  - BP-10 (medium): Critical modules are barely tested; app/ and hooks/ are excluded from coverage; no thresholds; E2E skips Rewind and production mode ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.22 in plan.md](plan.md#step-p1122-test-coverage-backfill)

**Context.** Critical modules are barely tested today, and `app/` and `hooks/` were outside coverage until P1.5 (BP-10). Add tests for authentication, encryption, the queue core and the setup wizard until P1.5's per-path coverage floors reach the agreed targets, and make the Prisma client lazy so suites no longer need a dummy `DATABASE_URL`.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The agreed targets are recorded and met for auth, encryption, the queue core and the setup wizard.
- [ ] The Prisma client is lazy, and the test job runs without a dummy `DATABASE_URL`.
- [ ] The ratchet holds the new floors.

## DevOps & Infrastructure

### [READY] P1.5: CI gates: typecheck, audit, knip, coverage, integration, schema drift and production-mode E2E

- **Labels:** devops, ops, github-actions, testing, security
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-27 to 2026-10-30 (track ops, hardening lane, effort L, 2 PRs)
- **Depends on:** P0.3, P0.4, P1.3, P1.4, P1.6, P1.8
- **Findings addressed:**
  - BP-11 (low): CI hygiene: unused services, E2E only against `next dev`, two broken workflows, no concurrency, permissions or timeouts ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-10 (medium): Critical modules are barely tested; app/ and hooks/ are excluded from coverage; no thresholds; E2E skips Rewind and production mode ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-01 (critical): Pinned Next.js 16.1.1 plus a wildcard image optimizer exposes an unauthenticated RCE/SSRF path; CI has no security gates ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - SEC-05 (low): CI hardening gaps: a dormant script injection, mutable action tags, and an issue-triage agent driven by untrusted text ([security-audit.md](../research/security-audit.md))
  - BP-21 (low): Migration hygiene: retroactive init baseline, non-descriptive names, hand-written timestamps, no drift check ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P1.5 in plan.md](plan.md#step-p15-ci-gates-typecheck-audit-knip-coverage-integration-schema-drift-and-production-mode-e2e)

**Context.** Make CI the gate every later PR must pass. The required checks are typecheck for app and tests, lint, the production-dependency audit, knip, Jest with ratcheting coverage that now includes `app/` and `hooks/`, an integration job on real Postgres and Redis, a schema-drift check, the design-system ratchet, and Playwright against a production build on a throwaway Postgres with Redis. The step also hardens and cleans up the workflows and groups dependency updates. It lands as two PRs: the integration, drift and Redis changes first (from 2026-10-26, needing only P0.4), then the gates.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The ten checks are required on `main`, and every job has permissions, concurrency and a timeout.
- [ ] E2E runs against `next build` plus `next start` on a throwaway `_test` Postgres with a `redis:7` service, and the test-token sign-in path is gone.
- [ ] The `integration` job runs every Postgres- and Redis-gated test, and a missing variable fails CI instead of skipping.
- [ ] `schema-drift` gates every migration from P1.2 and P2.2 on, and its first run passes over P0.5's, P0.20's and P2.1's.
- [ ] Coverage includes `app/` and `hooks/`, with committed floors that only rise.
- [ ] Actions are pinned by SHA, the broken workflows are fixed or deleted, and Dependabot groups next, react, next-auth, motion and Playwright.

### [READY] P1.9: Vendor the recommended agent skills with pinned commits

- **Labels:** devops, ops
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-10-23 to 2026-10-23 (track ops, hardening lane, effort S)
- **Depends on:** none
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P1.9 in plan.md](plan.md#step-p19-vendor-the-recommended-agent-skills-with-pinned-commits)

**Context.** Give every agent session, including cloud sessions, the same reviewed design, React and motion skills. They are vendored into `.claude/skills/` at pinned commits, with their licences and a record of where each came from, and shell execution from skills is turned off.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The seven skills are vendored, each with its licence and a THIRD_PARTY.md row.
- [ ] `web-design-guidelines` reads its local guidelines.
- [ ] Shell execution from skills is disabled, and `.mcp.json` holds only the pinned chrome-devtools server.
- [ ] The vendored-skills test passes, and `/security-review` ran on the PR.

### P1.10: Safe upgrade path: db:deploy, migration pre-flight and backups

- **Labels:** devops, ops, database
- **Phase:** [P1: Baselines, guardrails and CI gates](plan.md#phase-1-baselines-guardrails-and-ci-gates), 2026-10-20 to 2026-11-03
- **Window:** 2026-11-02 to 2026-11-03 (track ops, hardening lane, effort M)
- **Depends on:** P1.5
- **Findings addressed:**
  - GAP-11 (medium): The documented install and upgrade commands (`db push`, `migrate dev`) are development tools that do not match the image's `migrate deploy` ([additional-findings.md](../research/additional-findings.md))
  - GAP-14 (medium): No backup, restore or state inventory anywhere, while every container start applies migrations with no pre-flight step ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P1.10 in plan.md](plan.md#step-p110-safe-upgrade-path-dbdeploy-migration-pre-flight-and-backups)

**Context.** An operator can install, upgrade, back up and restore from the docs alone, before the November migrations reach production; until then the Phase 0 day-0 dump rule covers the October ones. The documented commands match what the image runs (`migrate deploy`), the entrypoint logs what it is about to apply and can be told not to, and every upgrade starts with a dump. This is the code half of the former P8.7; P7.17 writes the Rewind runbook.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `npm run db:deploy` exists, CI uses it, and README and CLAUDE.md install and upgrade with it, with `db:push` and `db:migrate` labelled contributor-only.
- [ ] `docs/operations.md` has the state inventory, backup and restore commands, the dump-before-every-migration rule and the db-push baseline note.
- [ ] The entrypoint logs pending migrations and honours `SKIP_MIGRATIONS`, and the `./data` mount is gone.
- [ ] It is live in production by 2026-11-03, and every later migration deploy follows it.

### P4.17: Harden the Docker image and compose file; add a health check

- **Labels:** devops, ops, security
- **Phase:** [P4: Security and reliability hardening](plan.md#phase-4-security-and-reliability-hardening), 2026-10-23 to 2026-12-03
- **Window:** 2026-11-23 to 2026-11-24 (track ops, hardening lane, effort M)
- **Depends on:** P4.2
- **Findings addressed:**
  - SEC-03 (medium): Docker image runs on end-of-life Node 25, installs the Prisma CLI at runtime without a lockfile, and has writable app files and no healthcheck ([security-audit.md](../research/security-audit.md))
  - BP-16 (medium): Runtime image installs the whole dependency tree, devDependencies included and unlocked, runs EOL Node 25, and has no HEALTHCHECK or init process ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-17 (medium): Observability gaps: request IDs never reach logs, production errors lose stack traces, no health or metrics endpoint, no `onRequestError` ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P4.17 in plan.md](plan.md#step-p417-harden-the-docker-image-and-compose-file-add-a-health-check)

**Context.** The image runs a supported Node LTS from reproducible, production-only dependencies. Its code cannot be rewritten at runtime, its one writable path holds the Rewind cache, and it reports its own health. It lands in the soft-launch deploy, so the season starts on an image that has already run for a week. The compose port binding and passwords moved to P4.1.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The image runs Node 24 LTS under tini, with production dependencies from the lockfile, a pinned Prisma CLI and read-only app files.
- [ ] `/api/health` checks the database and Redis, and `HEALTHCHECK` uses its liveness probe.
- [ ] Migrations apply inside the image through the pinned CLI, and `REWIND_CACHE_DIR` points at the one writable path.
- [ ] The image smoke test, including the scan, runs in CI.

### P7.16: Gallery review and admin soft launch

- **Labels:** devops, rewind
- **Phase:** [P7: Rewind breadth, admin tooling and soft launch](plan.md#phase-7-rewind-breadth-admin-tooling-and-soft-launch), 2026-11-10 to 2026-12-04
- **Window:** 2026-11-25 to 2026-11-27 (track rewind, Rewind lane, effort S)
- **Depends on:** P7.11, P7.12, P7.15, P4.16
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P7.16 in plan.md](plan.md#step-p716-gallery-review-and-admin-soft-launch)

**Context.** Review the gallery with the owner and fix what blocks sign-off, then confirm the admin soft launch on 2026-11-27, which meets the "Gallery signed off and admin soft launch" milestone. Because admin-audience generation has run on production data since 2026-11-20 (P7.8), this step is a sign-off, not the first shakedown.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The owner has reviewed the gallery and signed off, and no P0 sign-off issue is open.
- [ ] Log redaction is verified in production, and every sign-off fix merged by 12:00 on 2026-11-30.
- [ ] `rewindEnabled` is on with `rewindAudience = admins`, and every admin's issue is generated on real data.
- [ ] The cost, share-link, notification and view checks pass in production.

### P8.1: Freeze candidate: tag, dump, deploy and rehearse

- **Labels:** devops, rewind, llm
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-11-30 to 2026-11-30 (track rewind, Rewind lane, effort S)
- **Depends on:** P7.16, P5.13, P7.17
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.1 in plan.md](plan.md#step-p81-freeze-candidate-tag-dump-deploy-and-rehearse)

**Context.** Open the season on a measured prompt and a model that cannot drift. Make the last prompt edits, drop the release-candidate suffix so `PROMPT_VERSION` reads `rewind-2026.1`, and commit a lock that fails CI if the model, the prompt or the fact catalogue changes. Then tag, dump, deploy and rehearse; 30 November carries nothing else. Re-check the frozen models' prices on 2026-12-01.

**Acceptance criteria** (the step's "Done when" list):

- [ ] The last prompt edits reach 98% or more first-pass grounding on all 20 fixtures, and their recordings are committed.
- [ ] `PROMPT_VERSION` is `rewind-2026.1`, and the lock covers the model, the prompt and the catalogue, with a CI check that fails on any change.
- [ ] The Rewind model cannot be changed in settings until the season closes, and a provider mismatch falls back to templates.
- [ ] The page data that P8.3 and P8.4 need is verified in the stored soft-launch issues, with no change to the data contract on the day.
- [ ] The tag, the dump and the deploy happened before 18:00 on 30 November, and the staging rehearsal's timings are in `ship-check.md`.
- [ ] Prices were re-checked on 2026-12-01 and recorded in `model-selection.md`.

### P8.2: Season open

- **Labels:** devops, rewind
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-01 to 2026-12-01 (track rewind, Rewind lane, effort S)
- **Depends on:** P8.1, P7.8, P7.14
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.2 in plan.md](plan.md#step-p82-season-open)

**Context.** Generate every member's issue overnight with data through 30 November, check it, then open Rewind to everyone at 08:00 and send each member one ready notification. The step is done when 100% of eligible members have a completed Rewind.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Prepare ran at 00:15 in the westernmost Rewind zone with data through 30 November, for every eligible member.
- [ ] 100% of eligible members have a completed Rewind, and every skip carries an eligibility reason.
- [ ] `rewindAudience` became `all` at 08:00, and each member received one ready notification inside their window.
- [ ] `RewindView` rows are recording, and spend is within the cap and under $0.03 per member.

### P8.9: CI freeze gate, off until the code freeze

- **Labels:** devops, ops, github-actions
- **Phase:** [P8: Freeze, season open and ship window](plan.md#phase-8-freeze-season-open-and-ship-window), 2026-11-30 to 2026-12-11
- **Window:** 2026-12-09 to 2026-12-09 (track ops, hardening lane, effort S)
- **Depends on:** P1.5
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P8.9 in plan.md](plan.md#step-p89-ci-freeze-gate-off-until-the-code-freeze)

**Context.** The code freeze is enforced by CI from its first minute, by a gate that was merged and tested before the freeze rather than added during it. Moved here from P9.1.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `freeze-gate.yml` and the two labels exist, the gate is a required check, and `CODE_FREEZE` is `off`.
- [ ] The three throwaway PRs behaved as expected, with run ids recorded, before 2026-12-10.

### P9.1: Season monitoring and the first success review

- **Labels:** devops, ops, rewind
- **Phase:** [P9: Monitor and final cut](plan.md#phase-9-monitor-and-final-cut), 2026-12-15 to 2027-01-02
- **Window:** 2026-12-15 to 2026-12-31 (track ops, Rewind lane, effort S)
- **Depends on:** P8.2, P8.9
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P9.1 in plan.md](plan.md#step-p91-season-monitoring-and-the-first-success-review)

**Context.** Check every day through December that every eligible member's Rewind is complete, that no run is stuck and that spend stays within budget. Review the design 1.4 success measures on 2026-12-15, and hold the code freeze so that only data or security fixes merge until the final cut.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `season-log.md` has a dated entry for each day from 2026-12-15 to 2026-12-31, and each failure was retried, explained or counted as an expected skip.
- [ ] No run stayed stuck past one sweep cycle, and season spend stayed under the cap with the final-cut headroom.
- [ ] `season-review-2026-12-15.md` records every design 1.4 measure, including the 2026-12-31 open rate.
- [ ] The freeze gate is a required check, and every merge after 2026-12-14 is a labelled data or security fix with a regression test.

### P9.3: Final cut and final-cut notifications

- **Labels:** devops, rewind
- **Phase:** [P9: Monitor and final cut](plan.md#phase-9-monitor-and-final-cut), 2026-12-15 to 2027-01-02
- **Window:** 2027-01-01 to 2027-01-02 (track rewind, Rewind lane, effort S)
- **Depends on:** P9.2
- **Findings addressed:** none (design or research item)
- **Plan:** [Step P9.3 in plan.md](plan.md#step-p93-final-cut-and-final-cut-notifications)

**Context.** Run the final cut in production, so that every eligible member's Rewind includes December and says "Final cut". Retry whatever fails, tell the members who read their issue in December, then record the run and lift the code freeze.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `REWIND_FINAL_CUT` ran at 00:30 on 1 January in the westernmost zone, interactively.
- [ ] Failed and expired items were retried interactively, and no eligible member's latest final-cut generation is `failed`.
- [ ] Every eligible member's Rewind says "Final cut" and validates, and skipped members are listed by reason.
- [ ] "Your Rewind now includes December" reached each member who opened their issue in December once, during their waking hours.
- [ ] The cost and timings are recorded in `final-cut-log.md`, and the code freeze is lifted.

### P11.3: Separate worker process and queue hygiene

- **Labels:** devops, ops
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-08 to 2027-02-10 (track ops, platform lane, effort M)
- **Depends on:** P11.2, P4.2
- **Findings addressed:**
  - BP-19 (low): Workers, scheduler and Discord bot run inside every web process; two lock implementations and two sync paths ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-20 (low): Queue jobs lack deduplication, and request-path enqueues can hang on Redis ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.3 in plan.md](plan.md#step-p113-separate-worker-process-and-queue-hygiene)

**Context.** The workers, schedulers and Discord bot can run in one dedicated container from the same image, while web containers only serve requests. One lock implementation remains, every job type has a deduplication or deterministic id, and no request waits on Redis for more than about two seconds.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `PROCESS_ROLE=web|worker|all` controls what each container starts, and a worker serves only health and metrics.
- [ ] One `LeaseLock` with Prisma and Redis stores remains, and the legacy lock tables are dropped.
- [ ] Every job type has a deduplication or deterministic id.
- [ ] Request-path enqueues fail fast with `QUEUE_UNAVAILABLE`, and the webhook answers 503 so Stripe retries.
- [ ] The compose example is committed and tested.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### P11.4: Observability

- **Labels:** devops, ops, observability
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-13 to 2027-01-15 (track ops, security and ops lane, effort M)
- **Depends on:** P4.16
- **Findings addressed:**
  - BP-17 (medium): Observability gaps: request IDs never reach logs, production errors lose stack traces, no health or metrics endpoint, no `onRequestError` ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
  - BP-37 (low): The logger is 663 lines and about half unused; the Discord bot runs a second, unsanitized winston logger; 53 console.* calls bypass both ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.4 in plan.md](plan.md#step-p114-observability)

**Context.** One request ID follows a request from `proxy.ts` through actions, route handlers and the jobs they enqueue into every log line. Unhandled server errors are logged with their digest, and a metrics endpoint reports queue depth, job failures and LLM spend. The logger shrinks to what is used, and the remaining `console.*` calls move onto it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] Request IDs reach every log line in actions, route handlers and jobs, and `onRequestError` logs the digest.
- [ ] `/api/metrics` reports queue depth, job failures and LLM spend behind a token.
- [ ] `lib/utils/logger.ts` keeps only used exports and has no chalk path or `@ts-ignore`.
- [ ] No `console.*` call remains outside scripts, and `no-console` is enforced.

### P11.6: Migration naming and the ?schema= parameter

- **Labels:** devops, ops, database, github-actions
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-01-18 to 2027-01-18 (track ops, security and ops lane, effort S)
- **Depends on:** P1.5
- **Findings addressed:**
  - GAP-19 (low): The Prisma CLI honours `?schema=` in DATABASE_URL but the runtime adapter ignores it, so a non-public schema splits migrations from queries ([additional-findings.md](../research/additional-findings.md))
  - BP-21 (low): Migration hygiene: retroactive init baseline, non-descriptive names, hand-written timestamps, no drift check ([best-practices-and-ops.md](../research/best-practices-and-ops.md))
- **Plan:** [Step P11.6 in plan.md](plan.md#step-p116-migration-naming-and-the-schema-parameter)

**Context.** New migrations get descriptive names, checked in CI. A `?schema=` in `DATABASE_URL` is honoured by the runtime as well as the CLI, or rejected at boot when it is not a valid name. The schema-drift job itself moved into P1.5 in October, so that every season migration was gated.

**Acceptance criteria** (the step's "Done when" list):

- [ ] New migration names are checked, and the docs describe the `--create-only` workflow.
- [ ] A valid `?schema=` reaches the runtime adapter, and an invalid one stops boot.

### P11.25: Versioned releases and a changelog

- **Labels:** devops, ops, github-actions
- **Phase:** [P11: Platform, ops, privacy, Jellyfin parity, locale and docs](plan.md#phase-11-platform-ops-privacy-jellyfin-parity-locale-and-docs), 2027-01-04 to 2027-02-24
- **Window:** 2027-02-09 to 2027-02-10 (track ops, security and ops lane, effort S)
- **Depends on:** P0.3
- **Findings addressed:**
  - GAP-20 (low): No versioned releases, changelog or upgrade notes ([additional-findings.md](../research/additional-findings.md))
- **Plan:** [Step P11.25 in plan.md](plan.md#step-p1125-versioned-releases-and-a-changelog)

**Context.** Operators have no versioned releases, changelog or upgrade notes today (GAP-20). Semver tags publish versioned images, a CHANGELOG carries the upgrade notes, and a release workflow ties them together, so operators can pin a version and read what an update does before pulling it.

**Acceptance criteria** (the step's "Done when" list):

- [ ] `CHANGELOG.md` exists with an "Upgrade notes" block per release, and `v0.2.0` is published.
- [ ] Tags publish semver images, and the release workflow creates the GitHub Release from the changelog.
- [ ] The changelog check runs on pull requests, and the README explains pinning and rolling back.

## Completed
