> Part of the [implementation plan](../../plan.md): the index, timeline, milestones and progress checklist live there. This phase is done.

## Phase 1: Baselines, guardrails and CI gates

**Goal.** Put the safety nets in place before any styling or refactoring: delete dead code first, take visual and axe baselines, add the design-debt ratchet, wire lint and type checks, gate CI, and vendor pinned agent skills.

**Window.** 2026-10-20 to 2026-11-03. The phase passes the "Baselines and CI gates in place" milestone on 2026-10-30, and P1.10's safe upgrade path follows on 2026-11-03, before the first deploy that carries the Rewind schema.
- The UI lane runs P1.1 (from 2026-10-20), then P1.6, P1.7 and P1.8. P1.1 and P1.6 sit on the longest chain to the season, through P3.1, P3.4, P3.6 and P3.7.
- The hardening lane runs P1.9 in the Phase 0 week, then P1.3, P1.2, P1.4, P1.5 and P1.10 from 2026-10-26.

**Ordering that matters.**
- P1.1 merges before anything counts or photographs the code. That way the visual baselines (P1.6), the design-debt baseline (P1.8), the test type-check burn-down (P1.4) and the dead-export sweep (P1.2) never run over dead copies.
- P1.6 introduces the Playwright production-server mode (`E2E_SERVER=prod`) and the minted-session fixture, and P1.5 makes both the CI default for every spec.
- P1.5 lands in two PRs. The first (the `integration` and `schema-drift` jobs and Redis in E2E) needs only P0.4. It is built from 2026-10-26 and merges first thing on 2026-10-27, so P1.2's and P2.2's migrations are the first ones the drift gate checks; rebase both on it. P2.1 merges on 2026-10-23, before the gate exists, so its PR records the gate's two commands run against a `_test` database, and the gate's first run re-checks every earlier migration. The second (the gates) waits for P1.3, P1.4, P1.6 and P1.8.
- P1.10 changes `docker-entrypoint.sh` before P4.17 rewrites the image around it, and its `db:deploy` script is what CI runs from then on.
- P1.6 and P1.7 share one deterministic seed (`e2e/helpers/seed-fixtures.ts`) and one determinism helper (`e2e/helpers/deterministic.ts`). Whichever PR merges first creates them, and the other rebases on it.

### Step P1.1: Delete unreachable code; revive the Discord link panel

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-10-20 to 2026-10-21. **Depends on:** none.
- **Findings addressed:** UI-45, DUP-12, BP-36, UI-01, UI-26

**Objective.** One PR deletes the code the shipped app never reaches, so no later step restyles, counts or tests a dead copy. It also turns `/discord/link` from a redirect into the working page that every Discord nudge already points at.

**Guidance.**
- Delete 25 of the 26 files in the dead-file inventory of `research/code-duplication.md`. The 26th, `components/discord/link-panel.tsx`, is revived below.
  - Generator: `components/generator/wrapped-generator.tsx`, `wrapped-generator-prompt.tsx` and `wrapped-generator-status.tsx`, plus the polling hook `hooks/use-wrapped-polling.ts`.
  - Viewers and history: `components/wrapped/user-wrapped-viewer.tsx`, `components/wrapped/wrapped-home-button.tsx`, `components/admin/wrapped/wrapped-viewer.tsx`, `historical-wrapped-selector.tsx` and `historical-versions-inline.tsx`.
  - Admin: `components/shared/admin-footer.tsx`, `admin-footer-client.tsx`, `components/admin/settings/llm-toggle.tsx` (the live toggle is `LLMToggle.tsx`), `llm-settings.tsx`, `components/admin/playground/cost-display.tsx`, `components/admin/users/user-management.tsx`, `components/admin/llm-usage/scrollspy-nav.tsx` and `components/admin/shared/sign-out-button.tsx`.
  - Member and UI: `components/dashboard/plex-link-card.tsx`, `components/watchlist/sync-history-table.tsx`, `components/ui/styled-select.tsx` and `components/ui/service-icons.tsx`. `service-icons.tsx` points at `.ico` files that are not in `public/`. It is not rebuilt as brand marks, because UI Q9 plans generic lucide glyphs (P3.9).
  - Barrels and leftovers: `components/setup/setup-wizard/index.ts`, `lib/security/index.ts`, `actions/user-marks.ts` and `lib/validations/user-media.ts`.
- Delete four routes: `app/api/admin/sonarr/route.ts`, `app/api/admin/radarr/route.ts`, `app/api/admin/wrapped/by-user/[userId]/route.ts` and `app/api/admin/wrapped/[wrappedId]/user/route.ts`. Keep `app/api/admin/wrapped/[wrappedId]/versions/route.ts`.
- Delete the barrel `components/admin/settings/settings-edit-forms.tsx`, and import each of the five forms in `app/admin/settings/page.tsx:3` from its own file.
- Keep `components/generator/wrapped-generating-animation.tsx`. It is live: `components/wrapped/wrapped-page-client.tsx:4` imports it.
- Revive the Discord link page (UI-01):
  - Move `DashboardDiscordConnection` from `components/discord/link-callout.tsx` to `types/discord.ts`, and update `components/dashboard/user-dashboard.tsx:11` and `discord-card.tsx:4`. Then delete `link-callout.tsx`, whose component never renders.
  - Rewrite `app/(app)/discord/link/page.tsx` as a Server Component. It keeps the session check and loads `Promise.all([getDiscordLinkStatus(userId), getDiscordIntegration(true)])` from `@/lib/discord/integration`. It renders `<main id="main">` with an h1 and `<DiscordLinkPanel connectUrl="/discord/connect?redirect=%2Fdiscord%2Flink" ...>`, and exports `metadata` with a title.
  - Pass the panel only `instructions` and `serverInviteCode` from the integration row. The row carries `clientSecret` and must never reach a client component.
  - Do not forward a query-string `error` into the panel's toast. Short status codes arrive with `FlashFromQuery` in P6.11 (UI-07, SEC-20).
  - Add these `data-testid`s to the panel: `discord-link-panel`, `discord-link-connect`, `discord-link-disconnect`, `discord-link-resync`, `discord-link-join-server` and `discord-link-unavailable`.
  - When the member is not linked, `DiscordCard` links to `/discord/link` (`data-testid="discord-card-link-action"`) instead of discord.gg. The page offers both Join server and Link account. P10.21 and P6.11 restyle both.
- Add `knip` (exact version) as a devDependency, with an `npm run knip` script that runs `knip --production`. `knip.json` marks the production entries with `!` (`instrumentation.ts`, `proxy.ts`, `server.js`, `scripts/*.ts`), ignores `lib/generated/**` and `.agents/**`, and sets `ignoreDependencies: ["zlib-sync"]`, because discord.js loads that package inside a try. Run knip with a dummy `DATABASE_URL`, because its Prisma plugin loads `prisma.config.ts`.
- Pitfall: `resyncDiscordRole` and `getDiscordLinkStatus` are dead exports today and become live again here, so P1.2 must keep them.
- As merged:
  - `server.js` does not exist (`start:prod` still names it), so `knip.json` has no entry for it. It also ignores `.claude/worktrees/**`, where agent worktrees hold full copies of the repo. `npm run knip` exits 1 on the remaining dead exports and on test helpers, which production mode reports as unused files; P1.2 and P1.5 work from that output.
  - The panel's query-string `error` prop is removed, not just left unwired. `DiscordCard` no longer takes `serverInviteCode`.
  - While linking is unavailable, the panel still offers Join server when an invite code is set. Without it, a member whose tile used to open discord.gg would lose that link.
  - Playwright selects by `data-testid` with `filter({ visible: true })` on this page, because React streaming briefly leaves a hidden copy of the page in its `S:0` container.
  - The E2E suite is not yet green, so the first Done-when item stays open. Four tests fail the same way on the pre-P1.1 commit: `announcements.spec.ts` (create and toggle) and `stripe-subscription.spec.ts` ("admin is never gated") hit `page.goto: net::ERR_ABORTED` intermittently, and `rewind-year.spec.ts` ("a year without a Rewind") hits the same hidden `S:0` duplicate as a strict-mode violation.

**Tests.**
- Delete the tests of the deleted code, about 6,700 lines: `components/__tests__/wrapped-generator*.test.tsx` (three files), `__tests__/hooks/use-wrapped-polling.test.ts`, `components/__tests__/wrapped/user-wrapped-viewer.test.tsx`, `wrapped-home-button.test.tsx`, `admin-wrapped-viewer.test.tsx`, `historical-wrapped-selector.test.tsx`, `historical-versions-inline.test.tsx`, `admin-footer.test.tsx`, `admin-footer-client.test.tsx`, `llm-toggle.test.tsx`, `components/__tests__/admin/playground/cost-display.test.tsx` and `__tests__/api/admin-{sonarr,radarr,wrapped-by-user,wrapped-user}-route.test.ts`.
- In `__tests__/security/admin-api-routes.test.ts`, remove the two dead-route blocks and keep the `versions` block.
- New `app/(app)/discord/link/__tests__/page.test.tsx`: the page redirects without a session, renders the panel with the fixed connect URL, and serializes no `clientSecret` or `clientId` into the props.
- New `components/discord/__tests__/link-panel.test.tsx`: the disabled, not-linked, linked, and linked-but-not-on-server states; Disconnect and Force resync call their actions and show a toast.
- New `components/dashboard/__tests__/discord-card.test.tsx`: when the member is not linked, the card links to `/discord/link`.
- New `e2e/discord-link.spec.ts`: a member opens `/discord/link`. `discord-link-unavailable` shows while the integration is disabled, and `discord-link-connect` carries the connect URL once it is enabled.

**Integration.**
- These already point at `/discord/link` and need no change: `getDiscordPortalUrl()` (`lib/discord/config.ts:101`), the DM nudges in `lib/discord/routing/dm-router.ts`, `lib/discord/commands/require-linked-user.ts` and the admin "Portal URL" field.
- Members still in onboarding are sent to `/onboarding` by the `(app)` guard until P10.23 links to Discord from within onboarding.
- P1.2 updates the CLAUDE.md file tree, where `components/generator/` now holds one file.

**Demo.** As an unlinked member, follow a DM nudge's link to `/discord/link`, complete the Discord OAuth round trip, and come back to a "Linked" panel. Then run `DATABASE_URL=postgresql://x:x@localhost:5432/x_test npm run knip` and show that none of the deleted paths is listed.

**Done when.**
- [ ] The 25 files, the 4 routes, `settings-edit-forms.tsx` and `link-callout.tsx` are deleted with their tests, and `npm run build`, `npm test` and the E2E suite pass.
- [x] `/discord/link` renders the panel for signed-in members, and no secret field reaches the client.
- [x] The home Discord tile takes unlinked members to `/discord/link`.
- [x] `npm run knip` exists, and its unused-files list contains none of the removed paths.

### Step P1.2: Remove dead exports, the orphaned model and stale CLAUDE.md facts

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-27 to 2026-10-27. **Depends on:** P1.1.
- **Findings addressed:** DUP-13, DUP-16, BP-39, GAP-22

**Objective.** Remove the remaining dead exports and the orphaned `UserWatchIntent` model, and flatten the barrel and shim chains. Then make CLAUDE.md and the performance doc describe code that exists, because every agent session in this plan reads CLAUDE.md.

**Guidance.**
- Delete the DUP-13 dead exports, about 1,150 lines, one commit per group:
  - Services: `deleteSonarrSeries`, `bulkDeleteSonarrEpisodeFiles` and `getSonarrSeriesStatistics` (`lib/connections/sonarr.ts`); `getRadarrMovieFile`, `deleteRadarrMovie` and `bulkDeleteRadarrMovies` (`radarr.ts`); `getTautulliLibraryMediaInfo`, `getTautulliMediaWatchStats` and `getTautulliUnwatchedMedia` (`tautulli.ts`); `getOverseerrMediaByTmdbId` and `batchGetOverseerrMediaStatus` (`overseerr.ts`).
  - Plex: `getPlexLibraryItems`, `getPlexPlaylists` and `getPlexPlaylistItems` (`plex-sessions.ts`), `getLibrarySectionIDs` (`plex-connection.ts`) and `markPlexItemUnwatched` (`plex-marking.ts`), with their lines in the `lib/connections/plex.ts` barrel.
  - LLM usage: `getLLMUsageRecords` and `getCostSummary` (`lib/wrapped/usage.ts`). The pages use the versions in `actions/admin/admin-llm-usage.ts`.
  - Admin actions: `getQueueHealth`, `getQueueJob`, `updateWatchlistSyncSchedule` and `getWatchlistSyncSchedulerStatus` (`actions/admin/queue.ts`); `forceUserWatchlistSync` (`actions/admin/watchlist.ts`); and `deleteJellyfinServer` and `deletePrometheus` (`actions/admin/admin-servers.ts`).
  - Others: `formatFileSize`, `getMediaTypeLabel` and `formatDate` in `lib/utils/formatters.ts` (P3.10 deletes the file, but P1.5's knip gate runs first), plus `constructServerUrl`, `processWrappedContent`, `verifyPlexAuthToken`, `requireAuthAPI` and `getDiscordStats`.
  - The lock facade in `lib/discord/lock.ts:56-140`. Keep `isDiscordBotEnabled`, which `lib/instrumentation/node.ts:177` imports, and rebase on P0.7's lease changes.
  - Exports orphaned by P1.1: `generateAllPlexWrapped` (`actions/wrapped-generation.ts:401`, plus its re-export in `actions/users.ts`; P7.8 rebuilds bulk generation as a fan-out) and `getWatchlistSyncHistory` (`actions/watchlist.ts:239`).
  - Keep `resyncDiscordRole` and `getDiscordLinkStatus`, because `/discord/link` now uses them. Tag exports that only tests use with `/** @internal */`, so knip's production mode skips them.
- Orphaned model: delete `model UserWatchIntent` (`prisma/schema.prisma:470`), `enum IntentType` (`:516`) and `User.userWatchIntents` (`:33`). Generate the migration with `npx prisma migrate dev --create-only --name drop_user_watch_intent` against a local `_test` database, so it gets a real timestamp (BP-21). Its SQL must contain only `DROP TABLE "UserWatchIntent"` and `DROP TYPE "IntentType"`.
  - Nothing has used the table since `20251206172926_remove_maintenance_tables`, so note in the PR that any stale rows are discarded. P2.1's `rewind_2026` migration merges first (2026-10-23), so generate this one after rebasing on it, which gives it the later timestamp.
- Fix the stale type import in `lib/discord/commands/mark/__tests__/mark-command.test.ts:130` (`../registry` becomes `../../registry`). Keep the assertion in `bot-intents.test.ts`.
- Flatten the barrels and shims (DUP-16) to at most one entry per domain:
  - Delete `actions/admin.ts`, which only does `export * from "./admin/index"`. `@/actions/admin` then resolves to `actions/admin/index.ts`, so its 22 importers stay as they are; verify with a build.
  - Delete the `actions/admin/admin-llm.ts` barrel. Export `admin-llm-usage`, `-providers` and `-history` directly from `actions/admin/index.ts`.
  - Make `lib/connections/plex.ts` re-export `plex-user-info.ts` and `plex-user-access.ts` directly, and delete `plex-users.ts`.
  - Point the 11 importers of `lib/wrapped/statistics.ts` at `tautulli-statistics.ts`, `statistics-types.ts` and the other provider modules, then delete the barrel.
  - Delete the `actions/chatbot/tools.ts` shim. `./tools` then resolves to `actions/chatbot/tools/index.ts`, which exports the same names. Drop the duplicate `TOOLS` alias and the `ONBOARDING_STEPS` alias in `types/onboarding.ts`.
  - Leave the remaining single entries (`actions/admin/index.ts`, `actions/users.ts`, `lib/connections/plex.ts`) for P11.5.
- In `actions/admin/admin-servers.ts`, replace the needless `await import()` of Zod validators and `next/cache` (26 sites) with static imports. Keep the deliberate lazy imports of the queue and Redis modules.
- Rename `components/admin/settings/LLMToggle.tsx` to `llm-toggle.tsx`, and the other PascalCase files in that folder to kebab-case. The clash between the setup and admin `LLMProviderForm` names goes away when P10.24 merges the forms (DUP-05).
- Rewrite `docs/performance-testing.md` (BP-39): drop the nonexistent `scripts/performance/profile-maintenance-query.ts`, name today's hotspots (BP-24 data collection, BP-28 usage totals), and say that the Playwright performance project lands in P5.4.
- Fix CLAUDE.md (GAP-22, DUP-13):
  - Stack: Next.js 16 (App Router), React 19, Tailwind v4.
  - File tree: `app/(app)/wrapped/`, `components/setup/setup-wizard/`, `components/generator/` (now only the generating animation) and `types/discord.ts`.
  - Replace the integration snippets with the real calls: for Plex, `getActivePlexServerConfig()` from `@/lib/connections/plex-config` followed by the `@/lib/connections/plex` functions; for Tautulli, `getTautulliHistory(config, userId, limit)`; for the LLM, `callChatLLM(config, messages, tools?)` from `@/lib/llm/chat`.
  - Playwright: it runs chromium only, through the `chromium` and `setup-wizard` projects, and gets auth from `e2e/fixtures/auth.ts`.
  - Discord: commands live in `lib/discord/commands/`, registered with `npm run register-discord-commands`.
  - JSDoc: point the reference implementation at `lib/wrapped/archetype-scoring.ts`, and change the "verified by tests" claim to "add `__tests__/jsdoc-examples.test.ts` beside any `@example`".
  - List `ENCRYPTION_KEY` as recommended.

**Tests.**
- After each deletion group, the full Jest suite, `npm run build` and `tsc --noEmit` stay green. Separate commits keep a bisect cheap.
- New `__tests__/docs/claude-md-paths.test.ts`: extract every backticked repository path in CLAUDE.md under `app/`, `actions/`, `components/`, `lib/`, `types/`, `prisma/`, `docs/`, `e2e/`, `scripts/` and `hooks/`, and assert that each one exists. Today this test would fail on `lib/maintenance/`.
- Migration check on the `_test` database, with the commands P1.5's `schema-drift` job runs on the installed Prisma 7.2.0: `npx prisma migrate deploy`, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. The diff must be empty. (`--to-schema-datamodel` does not exist in 7.2.0, and `--from-migrations` needs a shadow database in `prisma.config.ts`.)

**Integration.**
- `knip --production` then reports no unused exports apart from `@internal` ones, which unblocks P1.5's knip gate.
- The CLAUDE.md corrections land before the P2 and P3 agent work starts (decision "CLAUDE.md timing"). Keep the "Agent skills" section from P1.9 and merge it with these edits. P11.26 re-checks CLAUDE.md after the refresh.

**Demo.** Show the `git diff --stat` (about 1,150 lines removed), knip listing no unused exports, and the CLAUDE.md path test passing.

**Done when.**
- [x] Every DUP-13 dead export is deleted, and so are those P1.1 orphaned, except the two Discord helpers the link page uses.
- [x] The `drop_user_watch_intent` migration applies cleanly, and `migrate diff` reports no difference.
- [ ] Dump taken before deploy; `prisma migrate status` clean. (Owner, at deploy: `migrate status` is clean on the `_test` database.)
- [x] No nested barrel or compatibility shim remains, and each domain has at most one entry.
- [x] CLAUDE.md names only APIs and paths that exist, and the path test enforces it.
- [x] Build, typecheck and Jest are green.

(As merged:
- The migration is `20261021000100_drop_user_watch_intent`. P2.1 had not merged, so P1.2 went first; P2.1 generates `rewind_2026` after rebasing on it, which gives it a later name. It is dated after the hand-dated `20261020000000_clear_jellyfin_username_emails` and `20261021000000_llmusage_text_nullable` so it sorts last on every database (a real `migrate dev` timestamp would have sorted before them). The generated `ALTER TABLE ... DROP CONSTRAINT` was removed, because `DROP TABLE` drops the foreign key.
- `lib/validations/user-media.ts`, the `settings-edit-forms.tsx` shim and the second `LLMToggle` were already gone. `lib/wrapped/statistics.ts` had 4 production importers plus tests; they now import `tautulli-statistics.ts` (the one Tautulli statistics entry), `server-statistics.ts` and `overseerr-statistics.ts`. All 24 lazy imports in `admin-servers.ts` became static; none was a queue or Redis module. The settings components are now `discord-integration-form.tsx`, `jellyfin-login-toggle.tsx`, `llm-provider-form.tsx`, `llm-toggle.tsx`, `server-form.tsx` and `stripe-settings-form.tsx`.
- `knip --production` reports no unused exports, types or duplicates. Besides DUP-13, the sweep deleted exports with no caller, stopped exporting module-local helpers (including eleven Discord activity server actions that only `getDiscordDashboardData` and `getDiscordDetailedStats` call) and tagged test-only exports `@internal`. Left for P1.5: 15 unused enum members (`AuditEventType` values, Overseerr status values), the 18 unused test-helper files, `@prisma/client` and the unlisted `tsx` binary.
- `__tests__/docs/claude-md-paths.test.ts` checks inline-code paths, including `@/` aliases, and skips fenced blocks (the file tree and sample code) and globs, so P3.9's `components/shell/` in the tree passes.)

### Step P1.3: Wire the Next, react-hooks and jsx-a11y ESLint presets

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-26 to 2026-10-26. **Depends on:** P0.1.
- **Findings addressed:** BP-09, DUP-15

**Objective.** Run the Next, react-hooks and jsx-a11y rules, which are installed but unused, and fix the 18 errors they report today. Drop the unused and redundant dependencies, and the native-toolchain cost of zlib-sync.

**Guidance.**
- Rewrite `eslint.config.mjs` with `defineConfig` and `globalIgnores` from `eslint/config`:
  - Keep `js.configs.recommended`. Spread `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`; both are flat configs in v16. Use the version P0.1 matched to next 16.4.x.
  - Drop the direct `...tseslint.configs.recommended`. The Next TypeScript preset already registers `@typescript-eslint`, and a second copy fails with "Cannot redefine plugin".
  - Turn on jsx-a11y recommended: import `eslint-plugin-jsx-a11y`, and add a block for `**/*.{jsx,tsx}` that sets every rule in `jsxA11y.flatConfigs.recommended.rules` to `"warn"`. Do not register the plugin again; the Next preset already does.
  - Pin `eslint-plugin-jsx-a11y` as an exact devDependency equal to the copy eslint-config-next resolves. `npm ls eslint-plugin-jsx-a11y` must show one copy.
- Rule levels:
  - Keep the preset's error level for the react-hooks compiler rules that fire today: `purity`, `set-state-in-effect` and `static-components`. This step fixes them to zero.
  - Every other new rule starts as a warning: `react-hooks/exhaustive-deps`, the jsx-a11y rules, and any `@next/next/*` rule the preset does not already make an error.
  - Keep the current overrides: `no-explicit-any` and `ban-ts-comment` as warnings, and the logger's `no-require-imports` exception. Drop `react/no-unescaped-entities: off` if the Next preset covers it.
  - Add `no-console: "warn"` for `lib/**`, `actions/**` and `app/api/**`, with an exception for `lib/utils/logger.ts`.
- Fix the 18 errors:
  - `components/ui/styled-checkbox.tsx:13`: use `useId()` instead of `Math.random()`.
  - Random particles in `components/generator/wrapped-generating-animation.tsx:70-73`, `components/setup/setup-wizard/final-success-animation.tsx:26-28` and `:195-201`, and `success-animation.tsx:19`: compute them once, in a `useState` initializer.
  - `app/admin/users/[userId]/wrapped/page.tsx:27`: hoist `AdminHeader` to module scope.
  - The six `set-state-in-effect` sites: derive the value during render, or move the update into the event handler. Use `useSyncExternalStore` for browser subscriptions.
  - Behaviour must not change. The P1.6 baselines do not exist yet, so check the touched screens by hand.
- Dependencies (DUP-15):
  - Remove `autoprefixer` and its `postcss.config.js` entry (`@tailwindcss/postcss` v4 adds prefixes itself), and remove `@eslint/eslintrc`.
  - In `lib/plex-auth.ts:136`, replace `qs` with `URLSearchParams`, using the key `context[device][product]`. Both encode the brackets as `%5B` and `%5D`. Then remove `qs` and `@types/qs`.
  - Declare `chalk` as an exact devDependency (`lib/utils/logger.ts:66` requires it inside a try).
  - If the `register-discord-*` scripts still run `ts-node -r tsconfig-paths/register` after P0.1, declare `tsconfig-paths`. If P0.1 moved them to `tsx`, drop the `-r` flag instead.
  - P0.1 already removes `@next-auth/prisma-adapter` and ts-node.
- Make zlib-sync optional:
  - Move it to `optionalDependencies`, and delete `python3 make g++` from the Dockerfile's `deps` stage; keep `libc6-compat`.
  - Without the toolchain, `npm ci` skips the failed optional build, and discord.js falls back to an uncompressed gateway (`WebSocketManager.js:24-26`).
  - Keep it in `serverExternalPackages` (`next.config.js:5`), and note in `docs/discord-bot.md` that compression needs the toolchain.
  - Do not use `npm ci --omit=optional`. That also drops sharp's and the Tailwind oxide's platform binaries, which are optional dependencies, and the build breaks.

**Tests.**
- `npm run lint` exits 0. Record the warning count per rule in the PR description as the burn-down list.
- New `__tests__/lib/plex-auth-url.test.ts`: the auth URL for a fixed pin, code and client id equals the string the `qs` version produced. Capture that string before the change.
- Extend the StyledCheckbox test: the id is stable across rerenders, and the label's `htmlFor` matches the input.
- Run the Discord bot smoke test from P0.2 against the image built without the toolchain.

**Integration.**
- P1.5 makes lint a required check.
- The raw-element bans in P3.4, and their switch to errors in P10.11, extend this config.
- Note the image change in the README's Docker section: no native toolchain, and gateway compression is optional.

**Demo.** Show:
- `npm run lint` with 0 errors;
- `docker build --target runner .` succeeding without python3, make or g++;
- the bot logging in from that image.

**Done when.**
- [x] The Next core-web-vitals, Next TypeScript and jsx-a11y recommended rules run, with one copy of each plugin.
- [x] The 18 errors are fixed, and the new rules report as warnings.
- [x] `autoprefixer`, `@eslint/eslintrc`, `qs` and `@types/qs` are gone, and `chalk` (plus `tsconfig-paths` if needed) is declared.
- [ ] `zlib-sync` is optional, and the Docker build needs no native toolchain.

(As merged: with `eslint-plugin-react-hooks` 7.1.1 the preset reported 34 errors from `purity`, `set-state-in-effect` and `static-components`, not 18, plus 22 `react-hooks/refs` and 1 `react-hooks/preserve-manual-memoization` errors and 22 `react/no-unescaped-entities` errors. All 34 are fixed. `refs` and `preserve-manual-memoization` start as warnings like the other new rules, and `react/no-unescaped-entities` stays off, because the preset turns it on rather than covering it. jsx-a11y rules the recommended set leaves off stay off, and their options are kept. Browser-only random content renders through the new `hooks/use-is-client.ts` (`useSyncExternalStore`), and effect-time resets became render-time adjustments ("adjust state when a prop changes"). The `qs` swap and `plex-auth-url.test.ts` had already merged in P0.2, and the `register-discord-*` scripts already run `tsx`, so `tsconfig-paths` is not needed. `zlib-sync` is in `optionalDependencies` and the Dockerfile's `deps` stage installs only `libc6-compat`, but `docker build --target runner .` and the bot smoke test from that image were not run, because no Docker daemon was available; the last box stays open until they pass.)

### Step P1.4: Type-check the test files

- **Track:** ops. **Lane:** hardening. **Effort:** M. **Window:** 2026-10-26 to 2026-10-27. **Depends on:** P1.1.
- **Findings addressed:** BP-08

**Objective.** Make `tsc` check the test files, then fix the hidden type errors (601 before P1.1's deletions) and the stale tests behind them. `npm run typecheck` runs both the app project and the test project.

**Guidance.**
- The cause: `tsconfig.test.json` extends `tsconfig.json`, whose `exclude` removes `**/*.test.ts`, `**/*.test.tsx` and `**/__tests__/**`. So the test config's `include` matches nothing, and `--listFilesOnly` shows four `.d.ts` files.
- New `tsconfig.test.json`:
  - `include`: `["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*", "jest.setup.js", "types/**/*.d.ts", "next-env.d.ts"]`;
  - its own `exclude`: `["node_modules", ".next", "e2e", "lib/generated", ".agents"]`. Leave `e2e` out because the root project already checks it, and Playwright's `test` and `expect` clash with the Jest globals;
  - keep `types` (`jest`, `@testing-library/jest-dom`, `node`);
  - set `tsBuildInfoFile` to `node_modules/.cache/tsc-test.tsbuildinfo`, so the two projects do not share `tsconfig.tsbuildinfo`.
- Add `"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json"`. Run `prisma generate` first.
- Typed Prisma mocks, which clear most of the 217 TS2339 errors:
  - Add `jest-mock-extended` at an exact version, after checking that its peer range covers Jest 30 and TypeScript 5.9.
  - Add `__tests__/helpers/prisma-mock.ts`, exporting `prismaMock = mockDeep<PrismaClient>()` (typed from `@/lib/generated/prisma/client`) and `prismaModule = { prisma: prismaMock }`.
  - Each test then calls `jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)` and `beforeEach(() => mockReset(prismaMock))`.
  - Mock `PrismaClient`, not `ExtendedPrismaClient` (`lib/prisma.ts:127`). The `$extends` type can hit TS2589 ("excessively deep"), and the extension does not change any model method signature.
  - Move the 75 files that hand-roll their Prisma mock in batches.
- Add `__tests__/helpers/factories.ts` with `buildUser`, `buildPlexWrapped`, `buildInvite` and `buildLLMUsage`. Each returns a full Prisma model type from partial overrides, so `mockResolvedValue` gets a valid shape without `as any`.
- Burn the errors down in this order, and run Jest after each batch:
  1. TS2353 (62): shapes the code no longer accepts. These are the stale tests: `__tests__/actions/wrapped-settings.test.ts:476-479` still passes `year: 2024` (removed by migration `20251127010000_remove_wrapped_year_field`); route tests pass `{ params: {...} }` where handlers await a Promise, so pass `{ params: Promise.resolve({...}) }`; and `__tests__/actions/auth.test.ts:40`. Where a fix changes what a test asserts, assert today's contract and say so in the PR.
  2. TS2345 (67): argument types.
  3. TS2339 (217): mostly the Prisma mocks above.
  4. TS2540 (65): writes to read-only `process.env` keys. Use `jest.replaceProperty(process.env, 'NODE_ENV', 'production')`, which restores itself.
  5. TS6133 (81): unused locals. Delete them.
- Do not use `@ts-ignore`, `@ts-expect-error` or `as any` to silence an error. `as unknown as` is allowed only inside `__tests__/helpers/`.
- Pitfall: ESLint ignores `**/__tests__/**` (`eslint.config.mjs`). Put the count of `as any` in tests, before and after, in the PR description.

**Tests.**
- The type check is the test. Jest stays green with the same test count.
- New `__tests__/helpers/__tests__/prisma-mock.test.ts`: the helper resets between tests, and a typed `findUnique` mock returns a factory user.

**Integration.**
- P1.5 adds the required `typecheck` job.
- CLAUDE.md's testing section (edited the same week in P1.2) and `.claude/commands/fix-tests.md` name the mock helper and the factories as the standard for new tests.

**Demo.**
1. Run `npx tsc -p tsconfig.test.json --listFilesOnly | grep -c '\.test\.'`; the count matches the number of test files.
2. Run `npm run typecheck`; it reports 0 errors.
3. Break one mock's shape on purpose, and the check fails.

**Done when.**
- [x] `tsconfig.test.json` type-checks every Jest test file.
- [x] `npm run typecheck` passes for both projects with 0 errors.
- [x] The stale tests assert today's contracts, and Jest is green.
- [x] Tests use the typed Prisma mock helper and the factories, and no new suppressions were added.

(as merged: the hidden count was 541 errors in 71 files after P1.1, not 601. `npm run typecheck` runs `prisma generate` first, then both projects; the root project keeps checking `e2e/` (its `include` is `**/*.ts`), so new specs are covered with no config change. `jest-mock-extended` is pinned at 4.0.1. `prisma-mock.ts` also exports `asTransactionClient(partial)` for hand-built `$transaction` clients, and `factories.ts` adds `buildConfig`. 86 of the 97 files that mocked `@/lib/prisma` moved to the helper; 11 keep their own mock: six whose mocks return `select`- or `include`-shaped partial rows that the full-row types reject (`guards`, `auth-access-relaxation`, `admin-settings-leave-blank-to-keep`, `admin-settings-secret-hiding`, `discord/config`, `discord/integration-audit`), four in-memory fakes (`chat-session`, `oauth-state-cap`, both `wrapped` page tests) and the real-database `wrapped-generation-claim.pg`. `as any` in tests went from 199 to 197; the one `@ts-ignore` and one `@ts-expect-error` that predate the step are still there.)

### Step P1.5: CI gates: typecheck, audit, knip, coverage, integration, schema drift and production-mode E2E

- **Track:** ops. **Lane:** hardening. **Effort:** L, 2 PRs. **Window:** 2026-10-27 to 2026-10-30. **Depends on:** P0.3, P0.4, P1.3, P1.4, P1.6, P1.8.
- **Findings addressed:** BP-11, BP-10, BP-01, SEC-05, BP-21

**Objective.** Make CI the gate every later PR must pass. The required checks are typecheck for app and tests, lint, the production-dependency audit, knip, Jest with ratcheting coverage that now includes `app/` and `hooks/`, an integration job on real Postgres and Redis, a schema-drift check, the design-system ratchet, and Playwright against a production build on a throwaway Postgres with Redis. The step also hardens and cleans up the workflows and groups dependency updates. It lands as two PRs: the integration, drift and Redis changes first (from 2026-10-26, needing only P0.4), then the gates.

**Guidance.**
- `.github/workflows/build.yml`:
  - Keep the workflow name "Checks" (P0.3 renamed it from "Build" so main's old `workflow_run` triggers never match a pull request). Branch protection keys on the job names, which are unchanged.
  - Add top-level `permissions: contents: read`, and a `concurrency` group on `${{ github.workflow }}-${{ github.ref }}` that cancels in-progress pull-request runs. Set `timeout-minutes`: 10 for lint, typecheck, knip and audit; 20 for test and build; 40 for e2e.
  - Pin every third-party action by SHA, with a version comment, here and in the `claude-*.yml` workflows (P0.3 pinned `docker-publish.yml`). Move setup-node 22, the npm cache, `npm ci` and `prisma generate` (with a dummy `DATABASE_URL`) into `.github/actions/setup/action.yml`.
- Required jobs:
  - `lint` runs `npm run lint` plus a pinned `actionlint`; `typecheck` runs the P1.4 script.
  - `test` runs Jest with coverage, with a dummy `DATABASE_URL` and no Postgres service. `lib/prisma.ts:71` throws only when the variable is unset; making the client lazy is left to P11.22. It skips the integration files below.
  - `integration` runs the Postgres- and Redis-backed tests that a dozen steps add (P0.10, P0.12, P0.20, P2.2, P2.5, P4.6, P4.20, P5.9, P5.11, P7.7, P7.8, P8.5 and the P11 data steps). Services: `postgres:16` with `POSTGRES_DB=plex_manager_it_test`, and `redis:7`. Steps: `prisma migrate deploy` (`npm run db:deploy` once P1.10 lands), then export `TEST_DATABASE_URL` and `TEST_REDIS_URL` and run the Jest project `integration`, which matches `**/*.pg.test.ts` and `**/*.redis.test.ts`.
  - New `test/helpers/integration.ts` exports `describePg(name, fn)` and `describeRedis(name, fn)`. Locally they skip when their variable is unset. Under `CI=true` a missing variable throws, so a gated test can never pass by being skipped. Move P0.12's and P0.20's tests onto `describePg` in this PR.
    - Already landed in Phase 0's review: `test/helpers/integration.ts` with `describePg` (the body receives the validated URL) and its test, the P0.5, P0.12 and P0.20 suites on it, `npm run test:pg` (`JEST_PG=1`, which loads `*.pg.test.ts` and sets `maxWorkers: 1`; every other run leaves them out), and a "Run Postgres integration tests" step after `prisma migrate deploy` in the `test` job. This PR adds `describeRedis`, moves that step into `integration`, and keeps the Postgres suites serial: P0.20's suite empties PlexWrapped and counts whole tables. The `test` job ignores `\.(pg|redis)\.test\.ts$`, and every later step that adds a Postgres- or Redis-backed test uses the helpers and one of the two suffixes, even where its guidance names the file without it (for example P2.5's `redis-lock.test.ts` becomes `redis-lock.redis.test.ts`).
  - `schema-drift` (moved here from P11.6, so that every season migration is gated) starts `postgres:16` with a fresh `plex_manager_drift_test` and runs `npx prisma migrate deploy`, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Exit code 2 means drift, and the job prints the human-readable diff before failing. These flags match the installed Prisma 7.2.0 (`prisma migrate diff --help`); check them again after P0.2's upgrade.
  - `build` runs a Postgres service, `prisma migrate deploy` and `npm run build`, with no E2E flags.
  - `audit` runs `scripts/audit-gate.mjs`, which calls `npm audit --omit=dev --audit-level=high --json`. It fails on any high or critical advisory not listed in `.github/audit-exceptions.json`. Each exception holds an id, a reason and an expiry at most 14 days out, and an expired exception fails too. On pull requests the job also runs `actions/dependency-review-action` with `fail-on-severity: high`.
  - `knip` runs `npm run knip` with a dummy `DATABASE_URL`; `design-system` comes from P1.8; `e2e` is described below.
- Coverage (BP-10):
  - In `jest.config.js`, add `app/**/*.{ts,tsx}` and `hooks/**/*.{ts,tsx}` to `collectCoverageFrom`, exclude `lib/generated/**`, and add the `json-summary` reporter.
  - `coverageThreshold` reads `jest.coverage-thresholds.json`. It holds a global floor at today's values, rounded down, and per-path floors at today's values for `./lib/auth.ts`, `./lib/prisma.ts`, `./lib/security/`, `./lib/stripe/`, `./actions/admin/` and `./lib/queue/`.
  - `scripts/coverage-ratchet.mjs --update` only ever raises the floors. P11.22 lifts them to the agreed targets.
- Production-mode E2E (BP-10, BP-11):
  - The job runs in `mcr.microsoft.com/playwright:v<exact @playwright/test version>-noble`, the container P1.6 takes baselines in. Inside it, the Postgres host is `postgres`, not `localhost`.
  - Start a `postgres:16` service with `POSTGRES_DB=plex_manager_e2e_test`, and point `E2E_DATABASE_URL` and `DATABASE_URL` at it. Set `E2E_TEST_MODE=true`, the value P0.4's `isE2ETestMode()` checks and P0.4's `webServer.env` uses.
  - Start a `redis:7` service and set `REDIS_URL=redis://redis:6379` for the web server. Without it, FR-50 makes `/rewind/[year]` (P5.1) and the RewindCard (P6.9) resolve to their unavailable state, and P5.4's Rewind visual, axe, perf and E2E projects would take baselines of the status panel.
  - Steps: `prisma migrate deploy`, then `npm run build:e2e` (a `next build` with `NEXT_PUBLIC_APP_URL=http://localhost:3000`, which is inlined at build time), then `E2E_SERVER=prod npx playwright test` over every project.
  - Generate `NEXTAUTH_SECRET` per run (`openssl rand -base64 32` into `$GITHUB_ENV`). P4.1 will refuse placeholder secrets and non-https URLs, so it must allow loopback `http://localhost`.
  - Move `authenticateAs` (`e2e/fixtures/auth.ts`) and the direct callback visit (`e2e/onboarding-flow.spec.ts:27`) to P1.6's minted cookie, `e2e/fixtures/session.ts`. Then delete the now-unused test-token path in `authorize()` (`lib/auth.ts:33` onwards) and `app/auth/callback/plex/callback-client.tsx:29-40`, together with `ENABLE_TEST_AUTH` and `NEXT_PUBLIC_ENABLE_TEST_AUTH`. Run `/security-review` on that diff.
  - A test that fails only in the production build because of the error-name check (BP-27) is marked `test.fixme('BP-27, fixed in P4.3')`. Upload the HTML report and the visual diffs when the job fails.
- Workflow cleanup (BP-11, SEC-05): if P0.3 only patched `test-analyze-failure.yml`, delete it, since it watches a workflow named "CI" that does not exist. Make `claude-issue-triage.yml` call `/label-issues`, and drop the unused Postgres services from lint and test.
- Dependabot is already installed, so use it rather than Renovate. In `.github/dependabot.yml`:
  - add groups `next-react` (`next`, `eslint-config-next`, `@next/*`, `react`, `react-dom`, `@types/react*`), `next-auth`, `motion` (`motion`, `framer-motion`) and `playwright` (`@playwright/test`, paired with the container tag);
  - add a grouped security-updates entry, and turn on Dependabot security updates in the repository settings;
  - ignore semver-major `typescript` and `eslint` until P11.23.
- For BP-01's CodeQL, enable CodeQL default setup for javascript-typescript in the repository settings; no workflow file is needed. Image scanning stays with P4.17's image smoke test.
- The owner marks Lint, Typecheck, Unit tests, Integration, Schema drift, Build, Audit, Knip, Design system and E2E as required on `main`, through repository rules or `gh api -X PUT repos/mchestr/plex-manager/branches/main/protection`.

**Tests.**
- `scripts/__tests__/audit-gate.test.ts`: a clean report passes; a new high, a critical or an expired exception fails.
- `scripts/__tests__/coverage-ratchet.test.ts`: a value below a floor fails, and `--update` never lowers a floor.
- `test/helpers/__tests__/integration.test.ts`: with `CI=true` and no `TEST_DATABASE_URL`, `describePg` throws; without `CI`, it skips.
- A throwaway PR that edits `schema.prisma` without a migration fails `schema-drift`.
- `__tests__/e2e-support/session-cookie.test.ts`: `decode()` from `next-auth/jwt` accepts the minted token.
- `e2e/production.spec.ts`, which runs only with `E2E_SERVER=prod`, checks four things:
  - `/_next/image?url=https%3A%2F%2Fexample.com%2Fa.avif&w=64&q=75` does not return 200 (BP-01, P0.1);
  - the CSP has no `'unsafe-eval'`;
  - an admin can open `/admin/users`;
  - a member is refused `/admin`.

**Integration.**
- Document `npm run typecheck`, `npm run knip`, `npm run build:e2e`, `E2E_SERVER=prod`, the coverage ratchet and a local throwaway Postgres (`docker run --rm -e POSTGRES_DB=plex_manager_e2e_test -p 5433:5432 postgres:16`) in CLAUDE.md's testing section and in `e2e/README.md`.
- When P4.7 adds `sessionVersion`, the session fixture reads it from the seeded row.
- P11.6 adds the migration naming check beside `schema-drift`. P5.4 adds webkit and the Rewind projects, which rely on this job's Redis service.

**Demo.** On a scratch PR, add a type error in a test, an unused file, a dependency with a known high advisory, and a coverage drop. Each check goes red with a clear message. Revert the changes, and the run is green, with `next start` in the E2E log.

**As merged.**
- Required check names (the job `name:`s; existing ones kept): `Lint`, `Typecheck`, `Unit Tests`, `Integration`, `Schema Drift`, `Build`, `Audit`, `Knip`, `Design System`, `E2E Tests`. `Docker Build` stays optional.
- The integration suites are not a Jest `projects` entry (next/jest wraps one config): `npm run test:integration` (`JEST_INTEGRATION=1`, serial) replaces `test:pg` and runs `*.pg.test.ts` and `*.redis.test.ts`; every other run ignores both. `describeRedis` also checks the URL is `redis://` or `rediss://`. The CI steps still call `npx prisma migrate deploy`; the owner switches them to `npm run db:deploy` when P1.10 merges.
- E2E: the job builds in its own step and sets `E2E_PREBUILT=1`, a new `playwright.config.ts` switch that makes the prod web server skip `build:e2e`. It runs on port 3100 (`E2E_PORT`'s default), so `NEXT_PUBLIC_APP_URL` is `http://localhost:3100`, not 3000. `NEXTAUTH_SECRET` comes from Node's `crypto` (the container may lack `openssl`) and is masked.
- Production mode turned up two things the dev server hid. BP-27: the 16 `admin-protection.spec.ts` cases and the session-persistence case in `user-scenarios.spec.ts` assert the 401 page, which a production build replaces with the generic error, so they are `test.fixme(E2E_SERVER === 'prod', 'BP-27, fixed in P4.3')`; P4.3 must remove those fixmes. `production.spec.ts`'s member check therefore asserts that no admin content renders rather than the 401 page. Streaming: a production page can briefly hold a hidden `S:0` copy, so the strict locators that raced it (sign-in button, setup intro text, users heading) take `.filter({ visible: true })`; others may need the same if CI shows a strict-mode violation. The axe baseline is now counted on the production build (`region` on the invite dialog fell to 0). The known flaky `net::ERR_ABORTED` cases (announcements, Stripe "admin is never gated") came from `adminPage`: `/admin` redirects in the browser after `load` (the admin layout streams), and the test's next `goto` raced it; the fixture now waits for `/admin/users`. `rewind-year.spec.ts:133` passed in production mode unchanged. The visual baselines were taken outside the CI image, so they must be regenerated through the Visual Baselines workflow before `E2E Tests` can pass in CI.
- Removing test-token login also removed the E2E-mode exemption from the Plex sign-in rate limit and the startup "E2E test login is enabled" warning; `E2E_TEST_MODE` now only arms the seed.
- Knip: production mode leaves test helpers out through negated `project` patterns; `@prisma/client` is in `ignoreDependencies` (the generated client needs its runtime utils) and `tsx` in `ignoreBinaries`; the audit-log calls import statically (knip cannot see members read through a destructured dynamic import), the four never-logged `AuditEventType` members are deleted, and the Overseerr enums are `@public`.
- Coverage floors are whole percentages. The actionlint binary comes from its release tarball, pinned by version and SHA-256. Dependabot's security-updates group and its scan of `.github/actions/*` are in `dependabot.yml`.
- Not done here (owner): marking the ten checks required; turning on Dependabot security updates and CodeQL default setup; the scratch-PR demo, including a schema edit without a migration (checked locally: exit 2 with the diff); regenerating the visual baselines in the CI container (above). `scripts/__tests__/vendored-skills.test.ts` fails in `Unit Tests` until the owner's `.claude/settings.json` edit from P1.9.

**Done when.**
- [ ] The ten checks are required on `main`, and every job has permissions, concurrency and a timeout. (Permissions, concurrency and timeouts done; marking required is the owner's.)
- [x] E2E runs against `next build` plus `next start` on a throwaway `_test` Postgres with a `redis:7` service, and the test-token sign-in path is gone.
- [x] The `integration` job runs every Postgres- and Redis-gated test, and a missing variable fails CI instead of skipping.
- [x] `schema-drift` gates every migration from P1.2 and P2.2 on, and its first run passes over P0.5's, P0.20's and P2.1's. (Checked locally on a fresh `plex_manager_drift_test`; first CI run pending.)
- [x] Coverage includes `app/` and `hooks/`, with committed floors that only rise.
- [x] Actions are pinned by SHA, the broken workflows are fixed or deleted, and Dependabot groups next, react, next-auth, motion and Playwright.

### Step P1.6: Visual-regression project and baselines

- **Track:** ui. **Lane:** UI. **Effort:** M. **Window:** 2026-10-22 to 2026-10-23. **Depends on:** P0.1, P1.1.
- **Findings addressed:** none (design or research item)

**Objective.** Before any styling change, take screenshots of 20 key screens at 1440x900 and 390x844: the 16 that `design/ui-design-system.md` section 9.2, Phase 0 item 3 lists, plus `/discord/link`, `/auth/denied`, the admin user detail page and the stored v2 Rewind. From then on, every styling PR shows a reviewed diff.

**Guidance.**
- Add two projects to `playwright.config.ts`. That file is not pre-allowed in `.claude/settings.json`, so expect a permission prompt.
  - `visual-desktop`: chromium at 1440x900, `deviceScaleFactor: 1`.
  - `visual-mobile`: chromium at 390x844, `deviceScaleFactor: 2`, with `isMobile` and `hasTouch`. Do not use `devices['iPhone ...']`, which switches to webkit; webkit comes in P5.4.
  - Both match `e2e/visual/*.visual.spec.ts`, and `chromium` ignores that pattern.
  - Screenshot settings: `toHaveScreenshot` with `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`, `maxDiffPixelRatio: 0.01` and `stylePath: 'e2e/visual/screenshot.css'`; `snapshotPathTemplate: 'e2e/visual/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}'`.
- Server mode, shared with P1.5: `E2E_SERVER=prod` makes the webServer run `npx next start -p <port>` after `npm run build:e2e`. Without it, the default is still `next dev`. Baselines are taken and compared only in production mode.
- Session fixture, also shared with P1.5: `e2e/fixtures/session.ts` sets the `next-auth.session-token` cookie, encoded with `encode()` from `next-auth/jwt` and `NEXTAUTH_SECRET`. The token carries `sub`, `name`, `email`, `picture`, `isAdmin` and `checkedAt: 0`, so the jwt callback re-reads the seeded row. No application code changes.
- Determinism (`e2e/helpers/deterministic.ts`):
  - An `addInitScript` replaces `Math.random` with a seeded mulberry32. The SpaceBackground stars and the success particles are random.
  - Call `page.clock.install({ time: new Date('2026-10-19T12:00:00Z') })` before `goto`, then `page.clock.runFor(5000)` after load. Framer-motion entrances finish, and the infinite loops always stop at the same phase.
  - Call `page.emulateMedia({ reducedMotion: 'reduce' })`.
  - The server clock is not frozen. Seeds use offsets from seed time, so text like "3 days ago" stays stable.
  - Mask absolute dates with `mask: [page.getByTestId(/-timestamp$/)]`, adding `data-testid`s where they are missing. `screenshot.css` hides `[data-visual-mask]`.
- Seed (`e2e/helpers/seed-fixtures.ts`), through the E2E Prisma client that P0.4 guards:
  - an onboarding-incomplete member, `visual-onboarding-user`;
  - invites `VISUALOK` (expires 2099) and `VISUALEXP` (expired);
  - three LLMUsage rows, two prompt templates and one announcement;
  - a v2 PlexWrapped for the regular user.
- The 20 screens give 40 images, in `e2e/visual/member.visual.spec.ts`, `admin.visual.spec.ts` and `setup.visual.spec.ts`:
  - Member and public (9): sign-in (signed-out `/`), home, onboarding step 2 (after `onboarding-welcome-continue`), the valid and expired invites, `/subscribe` (Stripe on through `setStripeEnabled` from `e2e/helpers/stripe.ts`, reset in `afterAll`), `/discord/link`, `/auth/denied`, and the regular user's seeded v2 Rewind at `/wrapped`, which P0.14 resolves to its latest year. P5.1's redirect later moves that screen to `/rewind/<year>`, and its baseline is regenerated in that PR.
  - Admin (8): users in the default state; users with Plex down (the seeded PlexServer pointed at `http://127.0.0.1:9` for that test, restored in `afterEach`); user detail, settings, invites, queues, LLM usage and prompts.
  - Status (2): a 404 (`/visual-missing-page`), and an error state (`/auth/callback/plex` with no `plexPinId`).
  - Setup step 3 (1): `Setup.isComplete=false` with `currentStep: 3`, in a `visual-setup` project with `dependencies: ['setup-wizard']`. Restore the seed the way `setup-wizard.spec.ts` does.
  - CI cannot reach plex.tv, so the two users screens may look the same today. Keep both: P10.18 adds the Plex-down Alert (UI-05), and the pair proves it works.
- Generate baselines only in CI:
  - `.github/workflows/visual-baselines.yml` runs on `workflow_dispatch` with a branch input, for same-repository branches only, with `contents: write`.
  - It runs `--update-snapshots` in the Playwright container and commits the images to the branch.
  - It pushes with a token that triggers workflows: a GitHub App installation token from `actions/create-github-app-token` (preferred), or a fine-grained PAT stored as the `VISUAL_BASELINES_TOKEN` secret with contents write on this repository only. The push then fires `pull_request: synchronize`, and the required checks run on the new head SHA. A push made with `GITHUB_TOKEN` triggers nothing, and re-running a workflow re-runs it on the old head SHA, so the baseline commit would never get its checks and the PR could not merge.
  - Fallback if neither token is set up: the workflow's last step runs `gh workflow run build.yml --ref <branch>` (a `workflow_dispatch` that `GITHUB_TOKEN` may start; add `workflow_dispatch:` to `build.yml`), so check runs with the same job names land on the new head SHA. By hand, push an empty commit or close and reopen the PR. `e2e/visual/README.md` documents all three.
  - Pin `@playwright/test` exactly.
- Add `e2e/visual/README.md` covering when to update, how to run the workflow, how to read the diff artifact, and that an unexplained diff is a regression.

**Tests.**
- The visual specs are the tests. Before committing, run them twice in CI against the fresh baselines. Both runs must pass with zero differing pixels.
- `__tests__/e2e-support/deterministic.test.ts` checks that the seeded generator returns a fixed sequence.

**Integration.**
- P1.5's `e2e` job runs the visual projects inside the required E2E check.
- Every styling PR from P2.15 and P3.1 onwards updates its baselines through the workflow, with the diff reviewed (`ui-design-system.md` 9.5, item 11).
- P5.4 adds the Rewind visual projects beside these.

**Demo.** On a branch, change `text-slate-400` to `text-slate-500` on the users heading. The visual check fails and shows the highlighted diff. Revert the change, and the check is green again.

**As merged.**
- Setup step 3 runs in two projects, `visual-setup-desktop` and `visual-setup-mobile` (both `dependencies: ['setup-wizard']`), since one project has one viewport. The snapshot template is `{testDir}/visual/__screenshots__/...` and `stylePath` is absolute, so overlay configs resolve them; images land at `e2e/visual/__screenshots__/<project>/visual/<spec>/<name>.png`.
- The visual specs skip unless `E2E_SERVER=prod`, so today's `next dev` CI job stays green until P1.5 switches it. In prod mode the webServer sets `NODE_ENV=production`; `build:e2e` is `npm run build`. Specs that sign in through the test token (`e2e/fixtures/auth.ts`) do not work against a production build, so P1.5 must move them to `e2e/fixtures/session.ts` (`signIn` fixture / `signInAs`) before making prod the default.
- Determinism goes further than the guidance: the clock is installed and paused before `goto`, and `settlePage` runs it forward three times while finishing every finite Web Animation, because framer-motion runs opacity and transform on WAAPI (real time) and `AnimatePresence` exits otherwise stall. `screenshot.css` also undoes the `html, body { height: 100%; overflow-x: hidden }` rule (and gives `html` slate-900) so full-page shots are not cut at the viewport; drop that block in P3.1.
- `seedVisualFixtures()` resets every table the screens read (users other than the three seeded, invites, Rewinds, LLM usage, prompts, announcements, service configs, Config, Discord on) and `clearVisualFixtures()` removes its extras in `afterAll`. Timestamps masked through new `*-timestamp` test ids (admin user detail, invites, LLM usage, prompts, settings, users table) and `data-visual-mask` on the settings Node.js version and on the Rewind viewer's auto-advance progress fill. Dates the screens print in full sit at fixed days before 2026-10-19 rather than offsets from now, because a masked date's text width still moves table columns; only dates shown relative to the server clock (the announcement's "Yesterday", the expired invite) are offsets. The determinism test lives in `__tests__/e2e-helpers/deterministic.test.ts` (next to the existing E2E helper tests), not `e2e-support/`.
- The committed baselines were generated in the agent's Linux container (Chromium 1194 at `/opt/pw-browsers`), not the Playwright CI image, and were checked there with two consecutive runs at `maxDiffPixels: 0` (Playwright's default per-pixel threshold; with `threshold: 0` the blurred background orbs dither by a few pixels between runs). Regenerate them once through the Visual Baselines workflow before P1.5 makes the suite a required check.
- Not done here: `@playwright/test` is still `^1.57.0` (pinning it exactly touches package.json dependencies while P1.3 edits them; pin it in P1.5 together with the container tag); creating the GitHub App or `VISUAL_BASELINES_TOKEN` secret is an owner task. `/subscribe` shows its "unavailable" state, because the fake Stripe key returns no prices. P1.3's particle fix touches `success-animation.tsx`, which the onboarding-step-2 shot passes through but does not show, so no baseline should change from it; re-run the suite after P1.3 merges to confirm.

**Done when.**
- [ ] 20 screens at both viewports (40 images) are committed under `e2e/visual/__screenshots__/`, generated in the CI container. (40 committed, generated in the agent container; regenerate via the workflow.)
- [ ] Two consecutive CI runs pass with no pixel differences. (Two consecutive local runs passed with 0 differing pixels; CI runs pending.)
- [x] Time, randomness and timestamps are controlled, and the seed is deterministic.
- [ ] `e2e/visual/README.md` explains how to update a baseline, and a baseline commit from the workflow gets the required checks on its own SHA. (README and workflow done; the push-token path needs the owner's App or PAT and a first run.)

### Step P1.7: axe at wcag22aa on every route

- **Track:** ui. **Lane:** UI. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** P0.1.
- **Findings addressed:** UI-12

**Objective.** Scan every route at WCAG 2.2 AA and every impact level, counting "incomplete" contrast results too, and commit today's violations as a burn-down baseline that may only shrink.

**Guidance.**
- Rebuild `e2e/accessibility.spec.ts` on a route table, `e2e/a11y/routes.ts`. Each entry is `{ path, as: 'public' | 'member' | 'admin', ready: testId, setup? }`.
  - Public: `/` signed out, `/invite/VISUALOK`, `/invite/VISUALEXP`, `/auth/denied`, `/auth/callback/plex` with no PIN (its error state), `/wrapped/share/<seeded token>`, and a 404 page.
  - Member: `/`, `/wrapped`, `/onboarding` (as the onboarding-incomplete seed user), `/discord/link`, `/subscribe` and `/subscribe/success` (with Stripe on through `e2e/helpers/stripe.ts`).
  - Admin, every page under `app/admin`, with seeded ids for the detail routes:
    - users, `users/[userId]` and `users/[userId]/wrapped`;
    - invites and `invites/[inviteId]`;
    - announcements, cost-analysis, discord, playground, queues, settings and shares;
    - llm-usage, `llm-usage/[usageId]` and `llm-usage/conversation/[conversationId]`;
    - prompts, `prompts/new`, `prompts/[promptId]` and `prompts/[promptId]/edit`;
    - `wrapped/[wrappedId]/history/[llmUsageId]`.
  - Interactive states: the users filter open, the create-invite dialog open, a confirm dialog open, and a settings form in edit mode.
  - Setup: scan `/setup` at steps 1 and 3 inside the `setup-wizard` project, because the setup page needs an incomplete setup.
- Drop the scan of `/auth/signin`. That route does not exist (`pages.signIn` is `/`, `lib/auth.ts:434`), so today the spec scans the 404 page.
- Each test runs these steps:
  1. Sign in, using P1.6's minted session if it has merged and the existing fixture otherwise.
  2. Apply `e2e/helpers/deterministic.ts`, so the cinematic `/wrapped` and the share page are scanned at rest.
  3. Wait for the `ready` test id.
  4. Run `AxeBuilder` with `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'])`. The `best-practice` tag catches `region` and `heading-order` (UI-10).
- `e2e/a11y/summarize.ts` counts violations per route under `rule|impact` keys. Incomplete `color-contrast` results count under `color-contrast|incomplete`; today that covers 46 of 50 nodes on `/admin/users`, because of the gradient canvas.
- `e2e/a11y/baseline.ts` compares those counts with `e2e/a11y/axe-baseline.json`:
  - A new key or a higher count fails, and the failure names the rule, the route and the first three node targets.
  - A lower count also fails, with a request to run `UPDATE_AXE_BASELINE=1 npx playwright test e2e/accessibility.spec.ts`. The writer refuses to raise any count, so the baseline stays accurate and only shrinks.
- Keep the modal ARIA and button-name checks, but switch them to `data-testid` selectors (UI-46). Add `admin-invites-delete-<id>` and a create-invite test id to the components, in place of the selector `button[aria-label*="Delete invite"]`, the text locator and `locator('aside')`.
- Pin `@axe-core/playwright` and `axe-core` exactly (4.11.0 today), because a rule update changes the counts. A Dependabot axe bump regenerates the baseline in the same PR.

**Tests.**
- The spec itself is the main test.
- New `__tests__/e2e-support/axe-baseline.test.ts`: a new rule fails, a rise fails, a drop asks for an update, and the writer never raises a count. Jest ignores `e2e/`, so this test lives in `__tests__/` and imports `e2e/a11y/baseline.ts`.

**Integration.**
- The spec runs in the required E2E job (P1.5).
- The P3 and P6 steps that fix contrast, labels and landmarks lower the baseline in the same PR.
- A page meets item 7 of the `ui-design-system.md` 9.5 definition of done once its baseline entry is empty.
- P5.4 adds the Rewind story and article routes.

**Demo.**
1. Add an unlabeled `<input>` to a page: the spec fails, naming `label|critical` on that route.
2. Fix the Pause Queue contrast (`components/admin/queues/queue-controls.tsx:64`): the spec asks for a baseline update, and the regenerated file shows the drop.

**As merged.**
- 44 tests: 38 route scans (`e2e/a11y/routes.ts`: 7 public, 7 member, 24 admin including the four interactive states, plus `/wrapped/2026`, which the guidance list missed), the two `/setup` steps in `e2e/accessibility-setup.spec.ts`, the two modal ARIA checks, the `button-name` check and a check that the baseline lists no route the table lacks. The `setup-wizard` project matches `accessibility-setup.spec.ts` and `chromium` ignores it. Baseline keys are `<as> <path>[ [state]]`, e.g. `admin /admin/invites [confirm dialog open]`.
- Counts are nodes. `/admin/users` has 50 incomplete-contrast nodes today. Every route carries `meta-viewport|moderate` (the root viewport blocks zoom); P1.7 fixes no violations.
- axe runs its work on timers, so `analyzeAtRest` (`e2e/a11y/scan.ts`) resumes the paused fake clock just before `analyze()`; pages are settled with P1.6's `settlePage` first. The `next dev` overlay (`nextjs-portal`) is excluded, and the baseline matched in both `next dev` and `E2E_SERVER=prod` runs.
- The seed (`e2e/helpers/seed-fixtures.ts`) now gives the invites and the regular user's Rewind fixed ids (`VISUAL_INVITE_IDS`, `VISUAL_REWIND_ID`); `e2e/a11y/seed.ts` adds a share token and one chat conversation on top. The writer records a route the file does not list yet (a new table entry), and refuses any rise on a listed route. The update command covers both spec files: `UPDATE_AXE_BASELINE=1 npx playwright test e2e/accessibility.spec.ts e2e/accessibility-setup.spec.ts`.
- Ready test ids were added to the page headings that had none (`admin-*-heading`, `plex-callback-error-heading`), plus `admin-invites-delete-<id>`, `admin-invites-create-dialog`, `admin-invites-delete-dialog` (through a new `testId` prop on `ModalShell` and `ConfirmModal`) and `wrapped-settings-edit-button`. The create-invite button already had `generate-invite-button`. Next's built-in 404 has no test id, so its entry has `ready: null`.
- The unit test is `__tests__/e2e-helpers/axe-baseline.test.ts`, next to P1.6's helper test, not `e2e-support/`. `axe-core` and `@axe-core/playwright` are pinned at 4.11.0 in devDependencies.

**Done when.**
- [x] Every page under `app/` is scanned with the WCAG 2.2 AA tags plus best-practice, at every impact level.
- [x] Incomplete contrast results are counted.
- [x] `e2e/a11y/axe-baseline.json` records today's counts, and the check fails on any rise.
- [x] The spec uses no CSS or aria-label selectors and no longer scans the nonexistent `/auth/signin`.

### Step P1.8: Design-system guardrail script and debt baseline

- **Track:** ui. **Lane:** UI. **Effort:** S. **Window:** 2026-10-22 to 2026-10-22. **Depends on:** P1.1.
- **Findings addressed:** none (design or research item)

**Objective.** Count, per file, the design debt that `design/ui-design-system.md` section 9.6 bans, and commit today's counts (taken after P1.1) as `design-debt.json`. CI fails only when a count rises or a new file has a non-zero count.

**Guidance.**
- Put the rules in `scripts/design-system/rules.mjs` as pure functions, without `import.meta`, so Jest's SWC transform can load the file:
  - each rule is `{ id, description, pattern, scope?, allow? }`, covering the 9.6 regexes verbatim: `raw-palette`, `gradient`, `gradient-text`, `arbitrary-color`, `arbitrary-type-z`, `blur`, `caps-eyebrow`, `infinite-motion`, `rewind-only`, `copy` and `zoom-lock`;
  - the module also exports `countFile(path, source)` and `compare(baseline, current, renames)`.
- Class rules run as regexes over the raw source. Two rules use the TypeScript AST (`typescript` is already a devDependency):
  - `copy` checks only `JsxText` and string children, for ` -> `, ` → `, ` · `, `\bWrapped\b` and `Plex Rewind`;
  - `arbitrary-color` looks for hex values only inside `style={{...}}` literals.
- Scope:
  - Files come from `git ls-files -co --exclude-standard -- app components`, limited to `.ts`, `.tsx` and `.css`.
  - Excluded: `components/ui/**`, the OG route `app/api/wrapped/og-image/**`, `__tests__/` and `*.test.tsx`.
  - `rewind-only` and `infinite-motion` skip `components/rewind/**`, `lib/rewind/**`, and the part of `app/globals.css` between the `/* rewind-scope:start */` and `/* rewind-scope:end */` markers that P3.1 adds. Rewind is not exempt from NFR-6: P5.2 adds a Rewind-scoped motion check for those paths.
  - `blur` gets an allowlist entry for the member top bar once P6.3 creates it.
- CLI `scripts/check-design-system.mjs`:
  - `--report` is the default. It prints totals per rule and the top 20 files.
  - `--check` fails on any rise and on a new file with a non-zero count. It ignores deleted files, and on a drop it prints the update command. It reads renames from `git diff --find-renames --name-status origin/main...HEAD` and carries the old path's counts over to the new one.
  - `--update` lowers counts and drops deleted files. It refuses to raise a count or to add a file with a non-zero count.
- `design-debt.json` holds `{ "schema": 1, "commit", "generatedAt", "files": { "<path>": { "<rule>": n } }, "totals" }`, with sorted keys.
  - Generate it on `main` right after P1.1 merges.
  - Run `--update` again in P1.2 or P1.3 if either touches component files.
- Add the scripts `design:report`, `design:check` and `design:update`.
- Add `.github/pull_request_template.md` with these checkboxes:
  - "Matches the reference mockup or the components sheet; visual diff attached" (9.6);
  - "Design-debt counts not raised; ran `npm run design:update` if they fell";
  - "New interactive elements have a `data-testid`";
  - "Touches `.claude/skills/**` or `.mcp.json`: `/security-review` run" (P1.9).

**Tests.** New `scripts/__tests__/check-design-system.test.ts`:
- Each rule has one matching and one non-matching fixture. `animate-spin` and `animate-skeleton` are allowed, `text-white` is counted, and `Wrapped` in an identifier is not counted.
- `compare` handles a rise, a new file, a drop, a deleted file and a rename.
- `--update` refuses to raise a count.

**Integration.**
- A `design-system` job in `build.yml` runs `node scripts/check-design-system.mjs --check` with `fetch-depth: 0`, so `origin/main` exists. P1.5 makes it required.
- P10.13 to P10.15 and the P6 page steps lower the counts PR by PR, and P10.11 makes every remaining count an error.
- Add `npm run design:report` to CLAUDE.md's styling section.

**Demo.**
1. Run `npm run design:report`. It shows about 502 `text-white` and 17 `bg-black/60`.
2. Add `bg-gradient-to-r` on a branch. The check fails and names the file and the rule.
3. Remove a gradient elsewhere. The check passes and prints the update command.

**Done when.**
- [x] The script implements every 9.6 rule, with unit tests.
- [x] `design-debt.json` is committed from the tree after P1.1.
- [x] The CI job fails only on a rise or on a new file with a non-zero count, and it handles renames.
- [x] The PR template carries the 9.6 checkbox.

(as merged: `scripts/design-system/rules.mjs` holds the rules and `countFile`, and re-exports `compare`, `update`, `nonZero` and `totals` from `baseline.mjs`; the two AST passes live in `ast.mjs`. `copy` joins each element's direct `JsxText` and string-literal children, so `Next{' '}{'->'}` counts, and decodes `&rarr;` and `&middot;`. `*.test.ts` is excluded as well as `*.test.tsx`. A fourth script, `npm run design:baseline` (`--baseline`), rewrites `design-debt.json` from the current tree: it is the one command for regenerating the baseline after a merge that renames files on `main` itself, where no diff against `origin/main` shows the rename (for example P1.2's kebab-case renames in `components/admin/settings/`). `--check` and `--update` take `--base <ref>` (default `origin/main`). `knip.json` gains the entry `scripts/*.mjs!`. The CI job is `Design System` in `build.yml`. The baseline was taken at 84f50d7 (P1.1, P1.3, P1.6 and P1.9 in): 195 files, 3,518 `raw-palette` (392 `text-white` and 1 `bg-black/60`, against the design's pre-P1.1 502 and 17), 144 `blur`, 136 `gradient`, 91 `caps-eyebrow`, 57 `infinite-motion`, 56 `gradient-text`, 43 `copy`, 39 `arbitrary-type-z`, 17 `arbitrary-color`, 2 `zoom-lock` and 0 `rewind-only`.)

### Step P1.9: Vendor the recommended agent skills with pinned commits

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-10-23 to 2026-10-23. **Depends on:** none.
- **Findings addressed:** none (design or research item)

**Objective.** Give every agent session, including cloud sessions, the same reviewed design, React and motion skills. They are vendored into `.claude/skills/` at pinned commits, with their licences and a record of where each came from, and shell execution from skills is turned off.

**Guidance.**
- Follow `research/visual-generation-skills.md` 7.1. Make a sparse, partial clone at the pinned SHA in the scratchpad, never inside the repository. Read every file, looking for `allowed-tools`, `` !` `` injection lines, hooks, `scripts/` folders, binaries, `*.zip` files and runtime URL fetches. Then copy only the skill folder and its licence.
- Sources, from section 7.2 of the same report:
  - `frontend-design`: `anthropics/skills`, path `skills/frontend-design`, at `dbd4588f9e1033efb41dad4bef2f7947c8993d44`, Apache-2.0 (`LICENSE.txt`).
  - `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns` and `vercel-react-view-transitions`: `vercel-labs/agent-skills` at `063bee94c3f4df8453406c830b0a7df0f2860278`, MIT. Do not copy any `*.zip`, and confirm each folder path upstream.
  - Patch `web-design-guidelines` to read `./guidelines/command.md` instead of fetching `main`. Vendor that file from `vercel-labs/web-interface-guidelines` at `434b7f91364665f2f733b310ec54809bf8f37937`, together with that repository's MIT `LICENSE`.
  - `motion`: `content/skills/motion/` from the npm tarball `motion-ai@14.2.0` (`npm pack motion-ai@14.2.0`), MIT, which is identical to ai-kit at `b7e2c68fb3b159b6c849d4d2c5c7a17b408689fc`. Do not take it from the unlicensed git repository, and add no hosted Motion MCP. Its `motion/react` examples only match this codebase after P2.15.
  - `accessibility-review`: `anthropics/knowledge-work-plugins`, path `design/skills/accessibility-review`, at the HEAD SHA on the day, Apache-2.0. Take only the skill, without the plugin's `.mcp.json`. It targets WCAG 2.1 AA, while the project bar is 2.2 AA (`ui-design-system.md` section 8); record that gap in THIRD_PARTY.md rather than patching the skill.
- Add `paths:` frontmatter to each skill:
  - `motion`: `components/wrapped/**`, `components/rewind/**` and `lib/rewind/**`;
  - `vercel-react-view-transitions`: `app/**`;
  - `frontend-design`, `web-design-guidelines` and `accessibility-review`: `app/**` and `components/**`;
  - the other two Vercel skills: `app/**`, `components/**` and `hooks/**`.

  This is a local change, so add a "Modified by plex-manager" note to each modified Apache-2.0 file.
- `.claude/skills/THIRD_PARTY.md` has one row per skill: name, upstream repository and path, 40-character SHA (or npm package and version), licence, date reviewed, reviewer and local changes. It also records the update procedure: take a new SHA, review `git diff <old> <new> -- <path>` upstream, and never run `npx skills update`.
- In `.claude/settings.json`, add `"disableSkillShellExecution": true` and `Skill(...)` allow rules for the seven skills.
- In `.mcp.json`, commit only `chrome-devtools`, as `npx -y chrome-devtools-mcp@1.11.0 --headless --no-performance-crux`. Image, Figma and Motion+ servers stay at user scope (7.5). The server needs a local Chrome; in a cloud session without one it fails to start, which does no harm.
- From Next 16.3, `next dev` writes a managed `AGENTS.md` block when it detects a coding agent. Disable that with the `agentRules` setting, so CLAUDE.md stays the single source; check the setting's shape in the installed Next.
- Add a short "Agent skills" section to CLAUDE.md: what is vendored, when each skill loads, and the THIRD_PARTY.md procedure.
- Run `/security-review` on the branch and paste its summary into the PR. Section 7.6 asks for this on every change to `.claude/skills/**` or `.mcp.json`.

**Tests.** New `scripts/__tests__/vendored-skills.test.ts` checks that:
- every skill folder has a licence and a THIRD_PARTY.md row with a 40-character SHA or an exact npm version;
- no vendored `.md` contains `allowed-tools:`, a line starting with `` !` ``, or a `raw.githubusercontent.com` fetch;
- there are no `*.zip`, `*.tar.gz` or executable files;
- `.claude/settings.json` sets `disableSkillShellExecution: true`;
- `.mcp.json` has exactly one server, pinned to an exact version.

**Integration.**
- `frontend-design` and `accessibility-review` serve the P3 and P6 reviews.
- `vercel-react-view-transitions` serves the P6.9 RewindCard transition.
- `motion` serves P2.15 and the P5.2 story player.
- `web-design-guidelines` serves the P7.15 pass.

Project-authored skills follow in P11.27, and the P1.8 PR checkbox covers later changes.

**Demo.** In a fresh cloud session, opening `components/wrapped/wrapped-viewer.tsx` makes `motion` available, while a file in `lib/` does not. `/security-review` comes back clean, and `web-design-guidelines` runs without a network fetch.

**Done when.**
- [x] The seven skills are vendored, each with its licence and a THIRD_PARTY.md row.
- [x] `web-design-guidelines` reads its local guidelines.
- [ ] Shell execution from skills is disabled, and `.mcp.json` holds only the pinned chrome-devtools server.
- [ ] The vendored-skills test passes, and `/security-review` ran on the PR.

(as merged: `accessibility-review` is pinned at `33eeda1e8fd856455b05479d13a0f85b5f803744`. The Vercel folders take their skill names (`vercel-react-best-practices` and so on). `vercel-labs/agent-skills` and the `motion-ai` tarball ship no LICENSE file, so each of those folders has a `LICENSE` with the MIT terms and a note on where the licence is declared. `motion`'s `performance-audit/index.md` no longer runs `npx motionscore`. `next.config.js` already had `agentRules: false`, so nothing changed there. The `.claude/settings.json` change, `disableSkillShellExecution` and the seven `Skill(...)` rules, is applied by the owner, because the agent session may not edit its own settings; the test's settings case fails until then.)

### Step P1.10: Safe upgrade path: db:deploy, migration pre-flight and backups

- **Track:** ops. **Lane:** hardening. **Effort:** M. **Window:** 2026-11-02 to 2026-11-03. **Depends on:** P1.5.
- **Findings addressed:** GAP-11, GAP-14

**Objective.** An operator can install, upgrade, back up and restore from the docs alone, before the November migrations reach production; until then the Phase 0 day-0 dump rule covers the October ones. The documented commands match what the image runs (`migrate deploy`), the entrypoint logs what it is about to apply and can be told not to, and every upgrade starts with a dump. This is the code half of the former P8.7; P7.17 writes the Rewind runbook.

**Guidance.**
- **Scripts** (GAP-11). `package.json` gains `"db:deploy": "prisma migrate deploy"`, and `db:push` and `db:migrate` keep their names. The `build`, `integration`, `schema-drift` and `e2e` jobs in `.github/workflows/build.yml` call `npm run db:deploy`, so CI runs the documented command.
- **Entrypoint** (GAP-14), on today's `docker-entrypoint.sh`. P4.17 later moves the CLI to `/opt/prisma-cli` and keeps these lines:
  - `PRISMA_BIN="${PRISMA_BIN:-npx prisma}"`, which also makes the script testable; P4.17 changes the default to `/opt/prisma-cli/node_modules/.bin/prisma`;
  - a pre-flight `$PRISMA_BIN migrate status || true` logs the pending migrations without ever failing the start;
  - with `SKIP_MIGRATIONS=true` it logs "SKIP_MIGRATIONS=true: not applying migrations" and goes straight to `exec "$@"`; otherwise `migrate deploy` runs under `set -e` as today. Use it when applying migrations by hand after a backup, or on every replica but one (P11.3). It joins `example.env` and P4.1's `envSchema`.
- **Compose.** Drop the unused `./data:/data` mount from `docker-compose.yml`; nothing in `app/`, `lib/` or `actions/` reads it.
- **README** (`README.md:100-141`, `:197-212`, `:250-262`, `:304-316`):
  - prerequisites: Node.js 22 or later (the image ships Node 24 from P4.17), PostgreSQL, and Redis, which Rewind and Stripe require;
  - install step 4 becomes `npm run db:generate`, then `npm run db:deploy`. The scripts table and "Database Management" label `db:push` and `db:migrate` "contributor-only" (prototyping on a throwaway database, and creating a migration);
  - a new "Upgrading" checklist: take a dump, pull or rebuild, apply migrations (or let the container do it), check `/api/health` once P4.17 adds it, read the release notes;
  - an "Installed with db push?" note, to follow on the old release before upgrading: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must report no difference; then `npx prisma migrate resolve --applied <name>` for each folder in `prisma/migrations`; then, only if Stripe was never enabled, the grandfather `UPDATE` from `20260703000000_add_stripe_subscriptions` through `npx prisma db execute --stdin` (`docs/stripe.md`). The new release's migrations, including the data steps of `rewind_2026` and P2.2's season dates, then apply normally.
- **CLAUDE.md.** The Prisma Workflow block adds `db:deploy` and marks `db:push` and `db:migrate` contributor-only. Deployment Checklist step 4 becomes "Take a backup (`pg_dump -Fc`), then run `npm run db:deploy`; the Docker image runs it at start unless `SKIP_MIGRATIONS=true`."
- **`docs/operations.md`** (GAP-14), new:
  - the state inventory: Postgres (mandatory; it holds every `ENCRYPTED_FIELDS` secret, `lib/prisma.ts`); `ENCRYPTION_KEY` (mandatory when set, since a dump without it cannot be decrypted, SEC-32); `NEXTAUTH_SECRET` and `PLEX_CLIENT_IDENTIFIER` (to avoid forced sign-ins); Redis AOF (optional: Stripe can resend pending events, and Rewind jobs are idempotent and rescheduled at worker start); and `REWIND_CACHE_DIR` (rebuildable);
  - backup: `docker compose exec -T db pg_dump -U postgres -Fc plex_wrapped > plex-manager-$(date +%F-%H%M).dump`, encrypted with `age` or `gpg --symmetric`, kept off the host and deleted after 30 days. Restore: `docker compose stop app`, then `docker compose exec -T db pg_restore -U postgres -d plex_wrapped --clean --if-exists --no-owner < file.dump`, then start the app;
  - "Take a dump before every deploy that carries a migration", because Prisma has no down migrations. This replaces the Phase 0 day-0 rule. The season's moments are named too: before the soft-launch release, before the season-open release and before the final cut.
  - the migration calendar rule from the P8 header: no migration between 2026-11-25 and 2027-01-02 except through this path, with a dump and `SKIP_MIGRATIONS=true` on all but one replica.

**Tests.**
- `__tests__/config/docker-entrypoint.test.ts` runs the script with `spawnSync('sh', ...)` and a stub `PRISMA_BIN` that records its arguments: by default `migrate status`, then `migrate deploy`, then the command; with `SKIP_MIGRATIONS=true` neither; a failing deploy stops the start.
- `__tests__/config/package-scripts.test.ts` checks `db:deploy`, and a compose check asserts that the `./data` mount is gone.
- `__tests__/docs/upgrade-docs.test.ts`: README's Installation and Upgrading sections and CLAUDE.md's checklist name `db:deploy`, and every line that mentions `db:push` or `db:migrate` says "contributor-only".

**Integration.** P4.17 builds the hardened image around this entrypoint, and its `image-smoke` job restarts the container with `SKIP_MIGRATIONS=true` and checks for the log line and a healthy status. Every later step that adds a migration lists "Dump taken before deploy; `prisma migrate status` clean" in its Done-when and follows `docs/operations.md`. P7.17's runbook and P11.24's deployment docs build on `docs/operations.md`, and P11.25's changelog links the upgrade checklist.

**Demo.** On the dev compose, take a dump, apply a new migration, restore the dump, and `prisma migrate status` shows the earlier state. A container started with `SKIP_MIGRATIONS=true` logs the skip and still starts. A fresh clone installs with the README's steps and `npm run db:deploy`.

**Done when.**
- [x] `npm run db:deploy` exists, CI uses it, and README and CLAUDE.md install and upgrade with it, with `db:push` and `db:migrate` labelled contributor-only.
- [x] `docs/operations.md` has the state inventory, backup and restore commands, the dump-before-every-migration rule and the db-push baseline note.
- [x] The entrypoint logs pending migrations and honours `SKIP_MIGRATIONS`, and the `./data` mount is gone.
- [ ] It is live in production by 2026-11-03, and every later migration deploy follows it.

(as merged: the restore command is `pg_restore -U postgres -d postgres --clean --if-exists --create --no-owner`, not `-d plex_wrapped --clean`: tested on Postgres 16, `--clean` alone drops only the objects in the dump, so a table a later migration created survives the restore and that migration then fails when it is reapplied; `--create` drops and recreates the database, which needs every connection to it closed. P4.1's `envSchema` does not exist yet, so `SKIP_MIGRATIONS` joins `example.env` only and P4.1 adds it to the schema. The `build.yml` switch to `npm run db:deploy` lands with P1.5's workflow rather than in this step's diff, because the two were built in parallel. README's Node prerequisite says "22 or later" without naming the image's Node version, which is 25.8 until P4.17. The db-push baseline commands were run end to end on a `_test` database: `migrate diff --exit-code` exits 0 after `db push`, the `resolve --applied` loop leaves `migrate status` up to date, and the grandfather `UPDATE` runs through `db execute --stdin`.)
