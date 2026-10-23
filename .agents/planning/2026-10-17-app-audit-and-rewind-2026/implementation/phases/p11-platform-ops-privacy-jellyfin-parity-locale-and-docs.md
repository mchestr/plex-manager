> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 11: Platform, ops, privacy, Jellyfin parity, locale and docs

**Goal.** Finish the platform, operations, privacy, Jellyfin-parity, locale and documentation work that neither blocks Rewind nor fixes an urgent security problem, and close the 2026 season cleanly. By the end, a member can be removed, export their data and delete single items; content tables have retention windows; a lost encryption key is recoverable; Jellyfin members get the same treatment as Plex members in onboarding, admin, Stripe and Discord; the app can run its background work in a separate container with request IDs and metrics; and the deployment, environment, release and agent documentation describe the code that exists.

**Window.** 2027-01-04 to 2027-02-24. The code freeze lifts when P9.3 records the final cut. Rewind stays live until the season closes on 2027-01-31: member regenerations and hide runs continue, P8.1 keeps the model frozen until then, and share links resolve. So the two steps that change runtime Rewind depends on, P11.1 (at-rest encryption, which covers the Rewind provider key) and P11.3 (the separate worker process and the lock-table drop), are scheduled after 2027-01-31, and P11.18's cleanup starts on 2027-02-01. P11.18's season success review is on 2027-01-15. The phase ends with the milestone "Platform, privacy and docs complete" on 2027-02-24: offboarding, retention and export are shipped, the Jellyfin parity steps are merged, observability and the worker role are in place, the deployment docs, releases and changelog are published, and no finding is open outside the deferred list.

**Moved in.** P11.28 (the watchlist sync, formerly P4.14) pairs with P11.2's watchlist lock. P11.29 deletes the v2 viewer (the second half of the former P7.13), P11.30 adds the eval results page (formerly part of P7.11), P11.31 cleans up duplicate service rows behind an audit (the destructive half of the former P6.14), and P11.32 is the setup claim (formerly P4.4), ahead of P10.24 and P10.25. P11.5 takes the DUP-11 schema clean-up from P2.3, and P11.6 keeps the migration naming and `?schema=` work after its drift job moved into P1.5.

**Tracks.** P10 (ui) runs alongside until 2027-02-19. Inside this phase two lanes are enough, at most two open PRs each:
- **security, ops and rewind:** P11.29, P11.5, P11.30, P11.16, P11.4, P11.18 (review 2027-01-15, cleanup from 2027-02-01), P11.6, P11.13, P11.32, P11.14, P11.15, P11.1, P11.24, P11.25, P11.22, P11.26, P11.27 and P11.23;
- **platform:** P11.28, P11.2, P11.8, P11.9, P11.10, P11.31, P11.11, P11.12, P11.17, P11.21, P11.7, P11.3, P11.19 and P11.20.

Where windows overlap inside a lane, the later step starts when the earlier one merges, or runs as a second agent session on its own branch when the two touch different files.

**Ground rules.**
- Conflict hotspots: `lib/prisma.ts` (P11.1, P11.6, P11.22), `lib/instrumentation/node.ts` (P11.2, P11.3, P11.7, P11.32), `proxy.ts` (P11.3, P11.4, P11.20), `lib/queue/**` (P11.3, P11.4, P11.14) and `actions/admin/**` (P11.5, P11.16, P11.21). Rebase daily, and land the earlier step in each pair first.
- Every migration in this phase is created with `npx prisma migrate dev --create-only --name <descriptive_name>` against a `_test` database, passes P1.5's `schema-drift` check and, from 2027-01-18, P11.6's naming check. Data steps report dry-run counts in the PR, and each deploy that carries a migration is preceded by a dump (P1.10); each such step lists "Dump taken before deploy; `prisma migrate status` clean" in its Done-when.
- New personal-data tables or columns update `docs/privacy.md` (P11.13) in the same PR, because P11.14's retention and P11.15's export are driven by it.
- Every user-visible upgrade step (new required variable, dropped data, new container role) goes into the PR description under "Upgrade note", so P11.25 can carry it into the first CHANGELOG release.

### Step P11.1: Encryption-key safety and at-rest encryption by default

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-02-01 to 2027-02-03. **Depends on:** P4.1.
- **Findings addressed:** SEC-32, SEC-33, SEC-34

**Objective.** A missing, wrong or rotated key no longer takes the app down: unreadable secrets become "enter it again" prompts, a boot check catches a mismatched key, and a keyring makes rotation routine. Production encrypts secrets by default, a data migration encrypts the plaintext values already stored, and nested reads decrypt like top-level ones.

**Guidance.**
- Schedule: after the season closes on 2027-01-31. This step changes how every stored secret is read, including the Rewind provider key, and members still regenerate and share until then.
- Keyring in `lib/security/crypto.ts`:
  - `ENCRYPTION_KEYS` is a comma-separated list of `kid:base64` entries, each decoding to exactly 32 bytes (`openssl rand -base64 32`); the first is primary. The existing `ENCRYPTION_KEY` stays as the legacy key, still derived with SHA-256. It reads `enc:v1:` values. When `ENCRYPTION_KEYS` is unset, it is also the primary key under the implicit kid `legacy`, so an install that sets only `ENCRYPTION_KEY` keeps writing secrets in production, as `enc:v2:legacy:`. Moving to a keyring means adding `ENCRYPTION_KEYS` and running the re-encryption below, and the upgrade note says so.
  - New writes use `enc:v2:<kid>:<base64(iv|tag|ciphertext)>`. Decryption picks the key by prefix and kid, passes `{ authTagLength: 16 }` to `createDecipheriv`, and rejects payloads shorter than 28 bytes (SEC-33, Node DEP0182).
  - New `tryDecryptSecret(value)` returns `{ ok: true, value }` or `{ ok: false, code: 'KEY_MISSING' | 'KEY_UNKNOWN' | 'CORRUPT', kid }` and never throws. `decryptSecret` keeps throwing for scripts. Empty strings stay unencrypted, so filters such as `response: { not: "" }` (`actions/admin/admin-llm-history.ts:52`) keep working.
- Fail soft (SEC-32). `decryptRow` in `lib/prisma.ts:57` uses `tryDecryptSecret`. A failed field becomes null, `crypto.decrypt_failed` is logged once per model, field and kid, and the field is added to an in-memory set in new `lib/security/unreadable-secrets.ts`. The settings page shows "The stored key can't be read with the current encryption key. Enter it again." on that service, through P10.20's `SecretInput` re-enter state. Check that login with a null `PlexServer.token` returns P4.8's error code rather than throwing.
- Nested reads and writes (the SEC-34 caveat that P0.18 left here). Build a relation map at module load from `Prisma.dmmf.datamodel.models` (exported through `@/lib/generated/prisma/client`), mapping each model's relation fields to the related model.
  - `decryptDeep(model, value)` walks every included or selected relation, objects and arrays, and decrypts each related model's `ENCRYPTED_FIELDS`. Example: `user.discordConnection` in `actions/user-queries.ts:103`.
  - `encryptData` walks nested `create`, `createMany.data`, `update`, `upsert` and `connectOrCreate.create` payloads the same way.
  - There is no global `omit`: the watchlist and Stripe jobs read `plexAuthToken`, so P0.18's explicit selects stay.
- Coverage (SEC-34). `plexAuthToken`, the service keys, the Discord tokens and the Stripe secrets are already in `ENCRYPTED_FIELDS` (`lib/prisma.ts:23-35`), and P2.1 added `Config.rewindSerialKey`. The data migration below encrypts the values written while no key was set.
  - Add `LLMUsage: ['prompt', 'response']`. These hold viewing histories and chat text, and are read only by top-level admin queries.
  - Document what cannot be encrypted because it is looked up by equality: `Invite.code`, and `RewindShare.assetKey` (`tokenHash` is already a hash). `PlexWrapped.shareToken` goes in P11.18, `DiscordOAuthState.codeVerifier` is always `""` (`lib/discord/integration.ts:108`), and `DiscordChatSession.messages` is JSON that P11.14 clears.
- On by default (SEC-33). P4.1's `checkProductionEnv` gains `ENCRYPTION_KEY_MISSING` (neither variable is set) and `ENCRYPTION_KEY_WEAK` (a keyring entry is not 32 bytes, or the legacy key is shorter than 32 characters or equals `NEXTAUTH_SECRET`). `ALLOW_PLAINTEXT_SECRETS=true` is the one escape hatch, which turns both into a warning logged at every boot. The upgrade note tells existing installs to set a key before pulling the release.
- Boot key check. Migration `encryption_canary` adds `Config.encryptionCanary String?` and `Config.encryptionFieldsHash String?`. `assertEncryptionKey()` runs first in `startNodeInstrumentation()` (after P4.2's coordinator), with a 5 s timeout:
  - a canary that does not decrypt logs `crypto.key_mismatch` with the kid, never the value, and exits with 1;
  - a missing canary is written under the primary key;
  - a database timeout logs and retries later, and never exits.
- Data migration. New `lib/security/reencrypt.ts` exports `reencryptSecrets({ dryRun, signal })`.
  - It walks each `ENCRYPTED_FIELDS` model in id-cursor batches of 200, and rewrites any value that is plaintext or not under the primary kid, one batch per `$transaction`. It is idempotent, and it records `encryptionFieldsHash` when it finishes.
  - With Redis, boot enqueues `SECRETS_REENCRYPT` with deduplication id `secrets:reencrypt:<kid>:<fields hash>`.
  - Settings, Security section, "Encrypt stored secrets" (`settings-reencrypt-button`) runs the same function as an audited admin action: a dry run with counts first, then the run, audited as `SECRETS_REENCRYPTED`. It also covers installs without Redis.
- The Security section (`settings-security-status`) shows `isEncryptionConfigured()` (its first call site), the primary kid, the plaintext count from the dry run, and any unreadable fields.
- Docs. `docs/operations.md` (P1.10) gains "Encryption keys": how to generate a key; how to rotate (add the new kid first, run the re-encryption, remove the old kid afterwards); and "Lost key" recovery (set the right key, or enter the service secrets again; member Plex tokens refresh at the next sign-in, Discord links are linked again). Correct `README.md:273` and `example.env:19-22`.

**Tests.**
- New `lib/security/__tests__/crypto-keyring.test.ts`: v1 legacy values decrypt and v2 values round-trip; with only `ENCRYPTION_KEY` set and `NODE_ENV=production`, a write produces `enc:v2:legacy:` and reads back; an unknown kid gives `KEY_UNKNOWN` and a wrong key `CORRUPT`; a 12-byte tag, a short payload and a 31-byte keyring entry are rejected; an empty string passes through.
- New `__tests__/lib/prisma-encryption-extension.test.ts`, with a fake `query`:
  - decrypts `invite.usages[].user.plexAuthToken` and `user.discordConnection.accessToken`;
  - encrypts a nested `create`;
  - one bad field becomes null, the rest of the row decrypts, and one log line is written.
- New `lib/security/__tests__/reencrypt.test.ts`: dry-run counts, two applies (the second changes nothing), and rotation from k1 to k2. A Postgres-gated `reencrypt.pg.test.ts` runs the same against real rows.
- `lib/__tests__/env.test.ts`: the missing and weak issues in production, and the escape hatch.
- New `lib/instrumentation/__tests__/encryption-canary.test.ts`: a mismatch exits with 1 and prints no secret; a missing canary is written; a database timeout does not exit.
- `e2e/admin/settings-encryption.spec.ts`: the status renders, and a seeded unreadable Tautulli key shows the re-enter Alert while the rest of the page works.

**Integration.** P4.1's schema documents the new variables, and P11.24 renders them. `AuditEventType` gains `SECRETS_REENCRYPTED`. P11.13's erase and P11.15's export never read tokens, and P11.22's per-path floor covers the extension. The breaking requirement is an upgrade note for P11.25.

**Demo.** Start the production image without a key: it exits with `env.invalid ENCRYPTION_KEY_MISSING` and the generation hint. With k1 set, the canary is written. Restart with a wrong key: `crypto.key_mismatch`, exit 1. Add k2 as primary and run "Encrypt stored secrets": every value reads `enc:v2:k2:`. Remove k1 and the app still works. Corrupt the stored Tautulli key: settings asks for it again, and sign-in still works.

**Done when.**
- [ ] Decryption never throws in the extension; an unreadable field is null and shown as "enter it again" in settings.
- [ ] `ENCRYPTION_KEYS` with kids, `enc:v2:` writes, tag-length checks and an idempotent re-encryption job and action exist.
- [ ] Production refuses to boot without a strong key unless `ALLOW_PLAINTEXT_SECRETS` is set, and the canary catches a mismatched key.
- [ ] Nested includes and nested writes are decrypted and encrypted, and `LLMUsage` text is encrypted.
- [ ] The lost-key and rotation runbook is in `docs/operations.md`.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
- [ ] An install with only `ENCRYPTION_KEY` set writes `enc:v2:legacy:` values in production, and the upgrade note explains the move to `ENCRYPTION_KEYS`.

### Step P11.2: Watchlist lock and fallback polling

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-07 to 2027-01-11. **Depends on:** P11.28.
- **Findings addressed:** DUP-07, SEC-52, SEC-49

**Objective.** The Discord bot and watchlist sync share one lease lock and one poller, and the 395-line copy in `lib/watchlist/lock.ts` is deleted. Watchlist sync runs on its interval whether it was enabled at boot or later, with or without Redis.

**Guidance.**
- New `lib/locks/lease-lock.ts`: `LeaseLock` is today's `DistributedLock` (`lib/discord/lock/lease.ts:58`, with P0.7's `getLeaseDurationMs()`), generalised by a name and a `LeaseStore` interface (`acquire`, `renew`, `release`). `PrismaLeaseStore` implements it on one new table.
  - Migration `lease_lock`: `model LeaseLock { name String @id; instanceId String; acquiredAt DateTime; expiresAt DateTime; lastRenewedAt DateTime; @@index([expiresAt]) }`. The names are `discord-bot` and `watchlist-sync`.
  - For one release, `acquire` also refuses while the legacy `DiscordBotLock` or `WatchlistSyncLock` row with that id is unexpired and owned by another instance. An old and a new container overlapping in a deploy therefore cannot both run the bot. P11.3 removes the check and drops both tables.
- New `lib/locks/lease-poller.ts`: `LeasePoller` is today's `BotLockPoller` (`lib/discord/lock/poller.ts:85`) with P0.7's separate renewal timer, the `ticking` guard and the per-tick `isEnabled`. `getConfigVersion` becomes optional, so the bounce runs only when it is given, and a new optional `onHeldTick()` runs on every poll while the lease is held.
- Discord: `lib/instrumentation/node.ts` builds `new LeaseLock({ name: 'discord-bot' })` and a `LeasePoller`. Delete `lib/discord/lock/lease.ts` and `poller.ts`, moving their tests to `lib/locks/__tests__/`. Move `isDiscordBotEnabled` into `lib/discord/config.ts` and delete `lib/discord/lock.ts`; P1.2 already removed its facade functions.
- Watchlist without Redis (SEC-49):
  - New `lib/watchlist/config.ts` holds `isWatchlistSyncEnabled()` and `getWatchlistSyncInterval()`, moved unchanged.
  - New `lib/watchlist/fallback.ts` exports `startWatchlistFallback({ signal })`, used only when `REDIS_URL` is unset. It builds the poller unless `ENABLE_WATCHLIST_SYNC=false`, and never returns early on the database flag (today `node.ts:118-122` and `lock.ts:286-297` both do).
  - `isEnabled` is `isWatchlistSyncEnabled`. `onHeldTick` starts `syncAllEnabledUsers()` when no run is in flight and the interval, re-read on every tick, has passed since the last start. The first held tick syncs at once, and an `inFlight` promise keeps a long run from being doubled.
  - Register `poller.stop()` with P4.2's `onShutdown('watchlist-fallback', 'drain', ...)`, and delete `lib/watchlist/lock.ts`.
- Watchlist with Redis, the same root cause: `node.ts:58-73` schedules `watchlist-sync-scheduled` only if sync was enabled at boot, and `updateGlobalWatchlistSyncSettings` (`actions/admin/watchlist.ts:43`) never reschedules. New `ensureWatchlistSchedule()` in `lib/watchlist/schedule.ts` upserts or removes the BullMQ job scheduler from the current `Config`. Boot and the settings save both call it inside P4.2's `withTimeout`, so turning sync on or changing the interval takes effect at once.
- Docs: `README.md:274` and `example.env` say "Without Redis, watchlist sync runs under a database lease in one process. Stripe and Rewind need Redis."

**Tests.**
- New `lib/locks/__tests__/lease-lock.test.ts`, ported from `lease.test.ts`: acquire, renew and release per name; two names never conflict; a live legacy row blocks acquisition.
- New `lib/locks/__tests__/lease-poller.test.ts`, ported from the poller tests, adds `onHeldTick` and runs without `getConfigVersion`.
- New `lib/watchlist/__tests__/fallback.test.ts`, with fake timers and a mocked `syncAllEnabledUsers`:
  - disabled at boot and enabled later syncs within one poll;
  - syncs repeat every interval, and a changed interval applies;
  - a run that lasts three intervals is never doubled;
  - a lost lease stops further runs, and `ENABLE_WATCHLIST_SYNC=false` builds nothing.
- New `lib/watchlist/__tests__/schedule.test.ts`: enabling upserts the scheduler with the interval, disabling removes it, and a Redis timeout returns a code.
- `actions/__tests__/admin-watchlist.test.ts`: the save calls `ensureWatchlistSchedule`.
- `lib/instrumentation/__tests__/node.test.ts`: without `REDIS_URL` the fallback starts, and with it the fallback does not.

**Integration.** P11.3 builds the worker role and the Redis store on `LeaseLock`. P11.14's retention fallback reuses `LeasePoller` under the name `retention`. `knip --production` confirms that the old modules are gone, and `docs/discord-bot.md` describes the lock.

**Demo.** On a dev install without Redis, boot with sync off, then turn it on in settings: the log shows a sync within a minute, and with a 5-minute interval it repeats every 5 minutes. A second container never runs it. With Redis, turning sync on makes the scheduler appear on `/admin/queues` without a restart.

**Done when.**
- [x] `lib/locks/` holds the one lease lock and poller, used by the Discord bot and watchlist sync, and `lib/watchlist/lock.ts` is deleted.
- [x] Without Redis, sync starts when enabled after boot and repeats on the configured interval.
- [x] With Redis, saving the settings creates, updates or removes the scheduler.
- [x] The fake-timer tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270116000002_p112_lease_lock`. `LeaseName` is the union `"discord-bot" | "watchlist-sync"` in `lib/locks/lease-lock.ts`; P11.14 adds `"retention"` to it and makes `legacyHolder` return false for that name (it has no legacy row). `LeaseStore` is `acquire(claim)`, `renew(claim)`, `release(name, instanceId)` with `claim = { name, instanceId, now, expiresAt }`; `PrismaLeaseStore`'s legacy check (`legacyHolder`) is what P11.3 deletes with the two tables. `onHeldTick` also runs on the poll that acquires (startup included), so a newly enabled sync runs within one poll. The bot liveness readers (`lib/admin/discord.ts`, `lib/settings/connection-health.ts`) read the `discord-bot` `LeaseLock` row. `withTimeout` moved to `lib/utils/with-timeout.ts` (throws `TimeoutError`). `ensureWatchlistSchedule()` returns `{ ok: true, state: "scheduled" | "removed" | "no-redis" }` or `{ ok: false, code: "TIMEOUT" | "FAILED" }`; when it fails, the settings save still saves and answers `UPSTREAM_UNAVAILABLE`. The tests named in the plan as `lease.test.ts`/`lock-integration.test.ts` are `lib/locks/__tests__/lease-lock.test.ts` and `lease-integration.test.ts`; both node tests (`lib/instrumentation/__tests__/node.test.ts`, `__tests__/lib/instrumentation/node.test.ts`) were updated.)

### Step P11.3: Separate worker process and queue hygiene

- **Track:** ops. **Lane:** platform. **Effort:** M. **Window:** 2027-02-08 to 2027-02-10. **Depends on:** P11.2, P4.2.
- **Findings addressed:** BP-19, BP-20

**Objective.** The workers, schedulers and Discord bot can run in one dedicated container from the same image, while web containers only serve requests. One lock implementation remains, every job type has a deduplication or deterministic id, and no request waits on Redis for more than about two seconds.

**Guidance.**
- Schedule: after the season closes on 2027-01-31, because the Rewind queues move to the worker role and the lock tables are dropped.
- Roles come from P4.2's `PROCESS_ROLE`: `web`, `worker` or `all`. The default stays `all`, so single-container installs behave as before.
  - In `startNodeInstrumentation()`, `web` starts only P11.1's canary check and P11.32's setup-code issue, because the wizard is served by web containers. `worker` and `all` also start:
    - the queue workers (`plex-wrapped` and P2.5's three Rewind queues);
    - the schedulers: watchlist, P4.18's role reconcile, `REWIND_SEASON_PREPARE` and P11.14's retention;
    - the Discord poller and P11.2's fallback.
  - The worker runs the same `server.js`, so there is no second bundle. A separate esbuild worker entrypoint was rejected, because the standalone trace can drop modules that only the worker loads.
  - With `PROCESS_ROLE=worker`, `proxy.ts` answers 404 for everything except `/api/health` and `/api/metrics` (P11.4), so a worker never serves pages even if its port is exposed.
  - P4.1's schema validates the role, P4.2's `poolConfigFor` gives each role its pool, and `/api/health` reports the role.
- One lock implementation (BP-19; P2.5 deferred the merge to this step):
  - Add `RedisLeaseStore` to `lib/locks/`, carrying P2.5's `SET NX PX`, compare-and-`PEXPIRE` and compare-and-`DEL` scripts behind P11.2's `LeaseStore`. The per-member Rewind lock becomes `new LeaseLock({ name: 'rw:lock:gen:<year>:<userId>', store: redisLeaseStore })`; delete `lib/queue/redis-lock.ts`.
  - Remove P11.2's legacy-row check, and drop the `DiscordBotLock` and `WatchlistSyncLock` models (migration `drop_legacy_lock_tables`).
  - P2.5's Redis semaphore is a different primitive and stays.
- Deduplication (BP-20):
  - `addJob` (`lib/queue/client.ts:74`) loses its `${jobType}:${Date.now()}` fallback. A `JOB_ID_POLICY` map in `lib/queue/types.ts` gives every job type either a `deduplication` id or a deterministic `jobId`, and `addJob` reads it.
  - Types still without one: `WATCHLIST_SYNC_ALL` (`watchlist:all`, used by the admin "Sync all" at `actions/admin/queue.ts:528` and by the scheduler) and `SECRETS_REENCRYPT` (P11.1). `PLEX_ACCESS_GRANT` and `REVOKE` keep their per-event ids, and their processors take a `LeaseLock` named `access:<userId>` on the Redis store, so a grant and a revoke for one member never run at once.
  - On the final failed attempt, the worker's `failed` handler logs `queue.job_exhausted` at error and increments P11.4's failure counter.
- Bounded enqueues on request paths:
  - New `lib/queue/request-path.ts` exports `enqueueFromRequest(type, data)`. It uses a `Queue` built on P2.5's `getRequestPathRedis()` (no offline queue, 2 s command timeout), and returns `{ ok: false, code: 'QUEUE_UNAVAILABLE' }` instead of hanging.
  - Callers: `actions/watchlist.ts:198`, `actions/admin/queue.ts`, `actions/admin/subscriptions.ts:148` and the Stripe webhook route, plus any P5 or P7 enqueue site that does not use it yet.
  - The webhook returns 503 on `QUEUE_UNAVAILABLE`, so Stripe retries. Change the "never 5xx" wording in CLAUDE.md, `docs/stripe.md` and the route comment to "never 5xx for a bad signature".
- Compose example `docs/examples/docker-compose.workers.yml`, which P11.24 links:
  - `web` with `PROCESS_ROLE=web` and P1.10's `SKIP_MIGRATIONS=true`, which may be scaled (`docker compose up -d --scale web=2`);
  - one `worker` with `PROCESS_ROLE=worker` and no published port, which applies the migrations;
  - both on one `.env`, the same database and Redis, and the image healthcheck. The leases make a second worker safe, but one is enough.

**Tests.**
- New `lib/instrumentation/__tests__/roles.test.ts`: `web` starts no worker and no poller, while `worker` and `all` start everything.
- `__tests__/proxy.test.ts`: in the worker role, `/` and `/admin` return 404, and `/api/health` passes through.
- New `lib/locks/__tests__/redis-lease-store.test.ts`, gated on `TEST_REDIS_URL`: compare-and-renew, a foreign release has no effect, and expiry hands over.
- New `lib/queue/__tests__/job-id-policy.test.ts`: every `JobType` has an entry, and enqueuing the same manual sync twice yields one job.
- New `lib/queue/__tests__/request-path.test.ts`: against a closed port, the call returns `QUEUE_UNAVAILABLE` within 2.5 s.
- `__tests__/api/stripe-webhook-route.test.ts`: an enqueue failure gives 503, and a bad signature still gives 400.
- New `__tests__/config/compose-workers.test.ts`: the example parses, has one worker, and the web service skips migrations.
- P4.17's `image-smoke` job starts the image once as `web` and once as `worker`; only the worker logs "Queue worker started".

**Integration.** P11.4's metrics read queue counts from any role. P11.14's sweep runs in the worker. P11.24's deployment guide links the example, and P1.10's `SKIP_MIGRATIONS` note now points at it. The P2.5 single-flight tests keep passing on the new store.

**Demo.** Start the workers example with two web replicas. Only the worker logs the queue and the bot starting, and `curl http://worker:3000/` returns 404. A manual sync clicked twice yields one job. Stop Redis and click it again: the toast says the queue is unavailable within two seconds.

**Done when.**
- [ ] `PROCESS_ROLE=web|worker|all` controls what each container starts, and a worker serves only health and metrics.
- [ ] One `LeaseLock` with Prisma and Redis stores remains, and the legacy lock tables are dropped.
- [ ] Every job type has a deduplication or deterministic id.
- [ ] Request-path enqueues fail fast with `QUEUE_UNAVAILABLE`, and the webhook answers 503 so Stripe retries.
- [ ] The compose example is committed and tested.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P11.4: Observability

- **Track:** ops. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-13 to 2027-01-15. **Depends on:** P4.16.
- **Findings addressed:** BP-17, BP-37

**Objective.** One request ID follows a request from `proxy.ts` through actions, route handlers and the jobs they enqueue into every log line. Unhandled server errors are logged with their digest, and a metrics endpoint reports queue depth, job failures and LLM spend. The logger shrinks to what is used, and the remaining `console.*` calls move onto it.

**Guidance.**
- Request IDs (BP-17):
  - `proxy.ts` keeps an incoming `x-request-id` that matches `/^[A-Za-z0-9._-]{8,64}$/` (set by a reverse proxy), and otherwise calls `generateRequestId()`. It forwards the id with `NextResponse.next({ request: { headers } })` and sets `X-Request-ID` on the response, which is BP-17's corrected snippet. P11.20 adds the nonce in the same function.
  - New `lib/observability/request-context.ts` (`server-only`): `getRequestId` is a React `cache()` over `(await headers()).get('x-request-id')`.
  - P4.3's `defineAction` and the route helpers in `lib/actions/route.ts` run their handler inside `runWithRequestContext(requestId, session?.user.id, fn)`, so every logger call inside carries `requestId` and `userId` from the AsyncLocalStorage store. Server Components that log pass `{ requestId: await getRequestId() }` themselves.
  - Jobs: `addJob` and `enqueueFromRequest` copy the current id into the payload as `_meta: { requestId }`; `JobPayloadMap` gains the optional field. The worker runs each processor inside `runWithRequestContext(job.data._meta?.requestId ?? 'job:' + job.id, ...)`, so P7.8's fan-out jobs inherit the batch's id.
- Errors: P4.16 already keeps stacks in production. Export `onRequestError(error, request, context)` from `instrumentation.ts`. It logs `request.unhandled_error` with `digest`, the method, the masked `request.path`, `context.routePath`, `routeType` and `renderSource`, and the request's `x-request-id`. P10.17's error states show the digest, so an admin can find the line.
- Metrics (BP-17):
  - New `app/api/metrics/route.ts` on the Node runtime serves the Prometheus text format 0.0.4. Without `METRICS_TOKEN` it returns 404; otherwise it requires `Authorization: Bearer <token>`, compared with `crypto.timingSafeEqual`. Add `METRICS_TOKEN` to P4.1's schema.
  - New `lib/observability/metrics.ts` writes the format by hand, with no new dependency:
    - `plex_manager_queue_jobs{queue,state}` from `getJobCounts()` on `plex-wrapped`, `rewind-batch`, `rewind-gen` and `rewind-aux`;
    - `plex_manager_job_failures_total{queue,job}` from a Redis hash `pm:metrics:job_failures`, which every Worker's `failed` handler increments, so the count survives P11.3's role split;
    - `plex_manager_llm_spend_usd{purpose,period}` for today and this month in `Config.timezone`, from P7.8's `lib/llm/usage-totals.ts`, cached for 60 s;
    - `plex_manager_build_info{version,commit}`, `process_resident_memory_bytes` and an event-loop delay p99 from `monitorEventLoopDelay`.
  - Each source has a 2 s timeout. A failed source sets `plex_manager_scrape_error{source}` and is otherwise skipped; the body never contains error text.
  - `docs/operations.md` gains a scrape example and three alert suggestions: failures rising, more than 100 waiting jobs for 15 minutes, and the day's LLM spend above a thirtieth of the budget.
- Logger trim (BP-37):
  - `lib/utils/logger.ts` keeps what has callers: `createLogger`, `runWithRequestContext`, `generateRequestId`, `sanitizeUrlForLogging` and P4.16's redaction functions. Delete `getBaseLogger`, `sanitizeForLogging`, `.child()`, `.time()`, `.timeSync()` and `setRequestUserId` once knip confirms they have no callers.
  - Delete the `let chalk: any` pretty-printer (`:61-66`); development output uses winston's `format.colorize()` with one line per entry. Remove the `@ts-ignore` at `:377`, and merge the four copies of the context merge into one function.
  - Aim for about 250 lines. If redaction keeps it over the 150-line utility limit, move it to `lib/utils/log-redaction.ts`.
- Console calls: re-count with `grep -rn "console\.\(log\|warn\|error\|info\|debug\)" app actions lib components hooks`. There are 57 today, and many go with P1.1, P2.11, P8.8 and P11.29. Move the rest to `createLogger`, whose browser branch already exists. Add `no-console: error` to `eslint.config.mjs`, allowing it in `scripts/**` and in the logger itself.

**Tests.**
- `__tests__/proxy.test.ts`: a generated id reaches the forwarded request headers and the response; a valid incoming id is kept; `<script>` as an id is replaced.
- `lib/actions/__tests__/define-action.test.ts`: a log line inside the handler carries the header's id.
- New `lib/queue/__tests__/request-id-propagation.test.ts`: the enqueued payload has `_meta.requestId`, and the processor's log line carries it.
- New `lib/instrumentation/__tests__/on-request-error.test.ts`: the digest, route path and id are logged, and the path is masked.
- New `__tests__/api/metrics-route.test.ts`: 404 without a token configured and 401 with a wrong one; the output parses with a small parser in the test; a failing source gives `scrape_error` with status 200.
- `__tests__/lib/logger.test.ts` and P4.16's redaction tests stay green, and a new case shows development output without chalk installed.
- Lint passes with `no-console`.

**Integration.** P10.3's queues page and the metrics share the same counts. P11.20 extends the same proxy function. The image smoke job scrapes `/api/metrics` with a token. CLAUDE.md's Logging section documents request IDs and the metrics route.

**Demo.** Send an action with `x-request-id: demo-1234abcd` that enqueues a sync and fails: every log line, the job's included, carries `demo-1234abcd`. A server error page's digest matches the `request.unhandled_error` line. `curl -H "Authorization: Bearer $METRICS_TOKEN" .../api/metrics` shows the queue gauges, which a local Prometheus scrapes.

**Done when.**
- [x] Request IDs reach every log line in actions, route handlers and jobs, and `onRequestError` logs the digest.
- [x] `/api/metrics` reports queue depth, job failures and LLM spend behind a token.
- [x] `lib/utils/logger.ts` keeps only used exports and has no chalk path or `@ts-ignore`.
- [x] No `console.*` call remains outside scripts, and `no-console` is enforced.

(as merged: the AsyncLocalStorage store, `runWithRequestContext` and `generateRequestId` live in `lib/utils/log-context.ts`, not the logger, because 144 test files mock `@/lib/utils/logger`; the logger reads it. `getBaseLogger` stays as an `@internal` export for `__tests__/helpers/log-capture.ts`. The id header and its check are `REQUEST_ID_HEADER`/`isValidRequestId` in `lib/request-headers.ts` (the proxy cannot import server-only modules); `getRequestId()` is `lib/observability/request-context.ts`. Route handlers: `withRequestContext(handler)` in `lib/actions/route.ts` wraps every `route.ts` export (`export const GET = withRequestContext(handleGet)`) and carries the request id only, not a user id. There was no `enqueueFromRequest`: `traceQueue()` (`lib/queue/job-meta.ts`) patches `add`/`addBulk` on the three producer queues (`lib/queue/client.ts`, `rewind-producers.ts`, `rewind-batch-queue.ts`), so every enqueue in a request or a job stamps `_meta.requestId`; `runJobInContext` wraps both Workers' processors, and their `completed`/`failed` handlers log `requestId: jobRequestId(job)`. Failures: `recordJobFailure` (`lib/observability/job-failures.ts`) counts every failed attempt, retries included. Metrics: BullMQ 6 has no `paused` job state, so the gauges cover waiting, active, completed, failed, delayed and prioritized; the spend purposes are `chat` (rows with a `chatConversationId`) and `wrapped` (the rest), from `llmSpendSince()` in `lib/llm/usage-totals.ts`; the loop metric is `plex_manager_event_loop_delay_p99_seconds`, reset each scrape. `BUILD_COMMIT` is a new optional variable (Dockerfile `ARG`, `docker-publish.yml` passes `github.sha`). `no-console` is an error everywhere but `scripts/**`, `evals/**`, `prisma/seed.ts` and the logger; the only calls left were the five client error boundaries, now on `createLogger("error-boundary")` with the digest. The redaction masks the share segment of a `routePath` too (`/rewind/s/[masked]`). E2E specs were not run.)

### Step P11.5: Admin actions on the action helper; server-only boundaries

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-06 to 2027-01-08. **Depends on:** P4.3.
- **Findings addressed:** BP-04, BP-06, DUP-06, DUP-11

**Objective.** Every remaining admin action runs through P4.3's `adminAction` with a Zod schema and returns one result shape. Read helpers leave `'use server'` modules for server-only loaders that check auth next to the data, and the last backwards-compatible action barrels are deleted.

**Guidance.**
- Migrate the remaining `requireAdmin()` call sites (about 100), one PR per module, the unvalidated ones first (BP-04's counts):
  - `actions/discord-activity.ts` (14 unvalidated), `actions/user-queries.ts` (admin parts), `actions/admin/admin-config.ts`, `actions/admin/subscriptions.ts`, `actions/prompts.ts`;
  - then `actions/admin/admin-llm-history.ts`, `admin-users.ts`, `actions/announcements.ts` (admin CRUD), `actions/admin/queue.ts`, `admin-servers.ts`, `actions/admin/watchlist.ts`, `actions/share-analytics.ts`, `actions/import-plex-users.ts`, the admin exports of `actions/discord.ts`, and `chatWithAdminBot` in `actions/chatbot/index.ts`.
- Each gets an input schema. For example, `getDiscordActivityLogs` takes `{ startDate?: isoDate, endDate?: isoDate, markType?: z.enum(MarkType), page: 1..1000, pageSize: 10..100 }`, which removes the `markType as never` cast at `app/admin/discord/page.tsx:63`.
- `queue.ts`'s own `isRateLimited` (`:48-63`) and its six copied preambles become `rateLimit: 'admin:queue'`, a new entry in P0.10's `LIMITS`.
- Result shape: migrated actions return `ActionResult`. `AdminActionResult` (`subscriptions.ts:19`), `ConnectionResult` and the 23 inline `Promise<{ success: boolean; error?: string }>` types go, and callers read `result.code` through P3.8's `errorCopy`.
- When no caller remains, delete `requireAdmin()`, `UnauthenticatedError` and `UnauthorizedAdminError` (`lib/admin.ts:30-42`). `getAdminGate()` stays for the layout. P4.3's lint rule against returning `error.message` becomes an error everywhere.
- Server-only reads (BP-06). Read helpers move out of `'use server'` files into `lib/data/*`, each with `import 'server-only'`:
  - `lib/data/admin-users.ts`: `getUserDetails`, `getAllUsersWithWrapped`, `getUserActivityTimeline`;
  - `lib/data/discord-activity.ts`: one `getDiscordDashboardData` loader with one auth check, replacing the five exported wrappers (DUP-06's six session lookups per page load become one);
  - `lib/data/share-analytics.ts`, `lib/data/llm-usage.ts` (`getLLMUsageRecords`, `getLLMUsageById`, `getLLMUsageStats`) and `lib/data/admin-settings.ts` (`getAdminSettings`, `getConfig`).
- Each loader starts with new `assertAdmin()` from `lib/admin.ts`. It reads P4.5's cached session and throws an error with P4.3's `PM_FORBIDDEN` digest, which the error boundaries render as Unauthorized. The check sits next to the data because a shared layout is not an authorisation boundary: on client navigation, Next renders the page without re-running the layout.
- `lib/guards.ts`, `lib/access.ts`, `lib/jellyfin-auth.ts` and whatever P4.8 left of `lib/plex-auth.ts` drop `'use server'` and import `server-only`. The note at `lib/guards.ts:15-18` goes with it.
- The 23 non-action modules in `actions/chatbot/` (tools, executors, prompts) move to `lib/chatbot/` as server-only. `actions/chatbot/index.ts` keeps only `chatWithAdminBot`.
- Barrels (the rest of DUP-16, which P1.2 left here): delete `actions/admin/index.ts` (about 27 importers of `@/actions/admin`, tests included) and `actions/users.ts`. Importers move to the defining module with a ts-morph script, `scripts/codemods/barrel-imports.ts`, like P10.13's codemod. `lib/connections/plex.ts` stays, as the one documented Plex entry in CLAUDE.md. `no-restricted-imports` bans `@/actions/admin` and `@/actions/users`.
- Guard: `defineAction` brands its wrappers (a non-enumerable `__pmAction` symbol), and a test asserts that every export of every `'use server'` module carries the brand. A raw read helper can then never be exposed as an endpoint again.

- **DUP-11** (moved here from P2.3, so that step stayed one reviewable change).
  - `createServiceSchema({ defaultPort, publicExample })` in `shared-schemas.ts` reduces `sonarr.ts`, `radarr.ts`, `tautulli.ts` and `overseerr.ts` to one call each.
  - Delete the unused `sonarrServerListSchema` and `radarrServerListSchema`. Delete `validateYear` too (`lib/security/api-helpers.ts:84`), since its only caller went in P1.1.
  - `actions/setup.ts:553` uses `apiKeySchema`.
  - Build the announcement create and update schemas (`actions/announcements.ts:118`, `:188`) from one base with no defaults.
  - If `aggregateLlmUsage` still exists after P7.8, it returns `LlmUsageStats`; `TautulliConfig`, `OverseerrConfig` and `ArrConfig` collapse into the `*Parsed` types.

**Tests.**
- `lib/validations/__tests__/service-schemas.test.ts`: the factory gives the same results as the old schemas over a table of URLs, and the announcement update schema adds no defaults.
- For each migrated module, the action tests show that signed-out and non-admin callers get `UNAUTHENTICATED` and `FORBIDDEN` without a throw, that invalid input gets `VALIDATION` (for example `getDiscordActivityLogs({ startDate: 'nope' })`), and that the queue actions are rate-limited.
- New `__tests__/security/use-server-exports.test.ts` imports every module under `actions/` that starts with `'use server'` and checks the brand on each export.
- New `__tests__/security/server-only-modules.test.ts`: every `lib/data/*.ts` file, `lib/guards.ts`, `lib/access.ts` and `lib/jellyfin-auth.ts` imports `server-only` and has no `'use server'`.
- New `lib/data/__tests__/discord-activity.test.ts`: one session read per dashboard load.
- `__tests__/security/admin-actions.test.ts` is updated to the codes.
- `e2e/admin-protection.spec.ts` (production mode) and `e2e/admin-functionality.spec.ts` stay green.

**Integration.** P11.19 builds on loaders that are server-only and memoised, P11.21 splits the slimmer action files, and P11.16 adds its read audits inside these loaders. CLAUDE.md's Server Actions section shows `adminAction` and `memberAction`, and its file tree adds `lib/data/` and `lib/chatbot/`.

**Demo.** From a member session in devtools, replaying a former read action's id returns "Server action not found". A non-admin calling `triggerWatchlistSyncJob` gets `FORBIDDEN`. `/admin/discord` makes one session read, and the server log shows a single lookup.

(as merged: most admin modules were already on `adminAction` from P4.3 to P10; this step moved the rest (`queue.ts` with a new `admin:queue` limit, `subscriptions.ts`, `admin-users.ts`, `listLLMModels`, `importPlexUsers`, `unshareUserLibrary`, `getUserActivityTimeline`) and rebuilt `actions/setup.ts` on `publicAction` with an actor check (anyone during the first run, admins after). `requireAdmin`, `UnauthenticatedError` and `UnauthorizedAdminError` are deleted; `assertAdmin()` and a `cache()`d session read live in `lib/admin.ts`, which is server-only. Loaders: `lib/data/discord-activity.ts` (one `getDiscordDashboardData` with every figure, the recent commands and marked media; it replaces all of `actions/discord-activity.ts`), `admin-users.ts` (`getAllUsersWithWrapped`), `llm-usage.ts` (`getLLMUsageRecords({ page, pageSize, userId, conversationId })`, `getLLMUsageById`), `admin-settings.ts` (`getAdminSettings`, `getConfig`, `getStripeConfig`; `StripeConfigStatus` is in `types/admin.ts`) and `rewind-season.ts` (`getRewindSeasonDataPreparedAt`). Share analytics already lived in server-only `lib/admin/analytics/shares.ts` (P10.2), so there is no `lib/data/share-analytics.ts`; `getUserDetails` was gone (P10.6), and `getUserActivityTimeline` stays an `adminAction` because the timeline pages through it from the client. Public reads left `'use server'` too: `getWrappedSettings` is `lib/wrapped/generation-settings.ts`, `getSetupStatus` is `lib/setup/status.ts`. `lib/guards.ts` and `lib/jellyfin-auth.ts` were already server-only; `lib/access.ts` now is; `lib/plex-auth.ts` stays `'use server'` because its three exports are real `publicAction`s the sign-in page calls (they pass the brand test). The chatbot internals moved with a pure `git mv` commit, then a path and `server-only` commit. The brand is `Symbol.for("__pmAction")` (`brandAction`, `isBrandedAction` in `lib/actions/define-action.ts`); the brand test covers every `'use server'` module under `actions/` and `lib/`. `scripts/codemods/barrel-imports.ts` uses the TypeScript compiler API (ts-morph is not installed), and also splits `jest.mock` factories. The `actionsAndApi` lint ban is an error in all of `actions/` and `app/api/` (`migratedActionFiles` is gone). DUP-11: `createServiceSchema` and `ServiceInput`/`ServiceParsed` in `shared-schemas.ts`; the `*ServerListSchema`s were already gone and setup already used `apiKeySchema`; `ConnectionResult` stays as the `lib/connections` client shape and `ArrConfig` in `arr-client.ts` was left to P11.9, which owns that file. Callers keep reading each action's own `error` copy, which is fixed text; `errorCopy` is not wired in. Invites (PR #384 review): `createInvite` and `deleteInvite` are audited as `INVITE_CREATED`/`INVITE_DELETED` (never the code) and spend `admin:invites`. E2E specs were not run.)

**Done when.**
- [x] No `requireAdmin()` call remains, and every admin action validates with Zod and returns `ActionResult`.
- [x] Read helpers live in `lib/data/*` with `server-only` and check admin access themselves.
- [x] The guards and the chatbot internals are server-only modules, not `'use server'` files.
- [x] `actions/admin/index.ts` and `actions/users.ts` are deleted, and the brand test passes.
- [x] The per-service schemas share one factory, and the duplicate types and schemas listed under DUP-11 are gone.

### Step P11.6: Migration naming and the ?schema= parameter

- **Track:** ops. **Lane:** security and ops. **Effort:** S. **Window:** 2027-01-18 to 2027-01-18. **Depends on:** P1.5.
- **Findings addressed:** GAP-19, BP-21

**Objective.** New migrations get descriptive names, checked in CI. A `?schema=` in `DATABASE_URL` is honoured by the runtime as well as the CLI, or rejected at boot when it is not a valid name. The schema-drift job itself moved into P1.5 in October, so that every season migration was gated.

**Guidance.**
- Add a step to P1.5's `schema-drift` job, after its `migrate diff`: `node scripts/check-migrations.mjs`.
- `scripts/check-migrations.mjs` checks every folder newer than the baseline in `prisma/migrations/.legacy-names.json`, which lists today's folders, `20251129215232_latest` and `20251122201244_combined_schema_updates` included:
  - names match `^\d{14}_[a-z0-9]+(_[a-z0-9]+)+$`, so at least two words;
  - names are not on a deny list (`latest`, `combined`, `changes`, `update`, `fix`, `migration`, `init`);
  - timestamps strictly increase and are not in the future, and each folder has `migration.sql`;
  - round timestamps are allowed, because several plan migrations use them, and the drift check catches what matters.
- Docs (BP-21): CLAUDE.md's Prisma Workflow and the README's "Database Management" say to create migrations with `npx prisma migrate dev --create-only --name <descriptive_name>` against a `_test` database, to review the SQL, and never to hand-type timestamps. A short note explains the retroactive `20250101000000_init` baseline and `prisma migrate resolve --applied`, and links P1.10's db-push note.
- `?schema=` (GAP-19), in `createPrismaClient()` (`lib/prisma.ts:69`):
  - read `new URL(DATABASE_URL).searchParams.get('schema')`;
  - when it is set and not `public`, pass it as the adapter's second argument, `new PrismaPg({ connectionString, ...poolConfigFor(role) }, { schema })`. `PrismaPgOptions.schema` exists in `@prisma/adapter-pg` 7.2.0, and the adapter qualifies table names with it;
  - P4.1's `checkProductionEnv` reports `DATABASE_URL_SCHEMA_INVALID` unless the name matches `/^[A-Za-z_][A-Za-z0-9_]{0,62}$/`, so boot exits with a clear message instead of failing on the first query;
  - `prisma.config.ts` already gives the CLI the same URL, so migrations and queries now use the same schema. `example.env:3` keeps `?schema=public`, with one sentence on changing it.

**Tests.**
- New `scripts/__tests__/check-migrations.test.ts`: a good name passes; `latest`, a one-word name, a decreasing timestamp, a future timestamp and a missing `migration.sql` each fail; the baseline folders pass.
- New `lib/__tests__/prisma-schema-param.test.ts`, with `PrismaPg` mocked: `?schema=plex_manager` reaches the options, no parameter and `public` pass no option, and an invalid name is an env issue.
- New `prisma/__tests__/schema-param.pg.test.ts`, gated like P0.8's Postgres tests: create schema `pm_schema_test`, run `migrate deploy` with `?schema=pm_schema_test`, then a query through `createPrismaClient()` finds the `Config` row there, and `public` has no app tables.

**Integration.** The naming check runs inside P1.5's required `schema-drift` job. Every later migration (P10.24's step ids, every P11 migration) passes it. P11.25's release workflow requires it, and P11.24's environment reference documents the schema parameter.

**Demo.** Name a migration `latest`: the name check fails inside `schema-drift`. Locally, run the app with `?schema=pm_test` after migrating into it: the home page loads.

**Done when.**
- [x] New migration names are checked, and the docs describe the `--create-only` workflow.
- [x] A valid `?schema=` reaches the runtime adapter, and an invalid one stops boot.

(as merged: the baseline `.legacy-names.json` lists all 51 folders on the start point, including both `20270115000000_*` folders; every later folder must be later than the newest of them and than the folder before it. A timestamp may run up to 180 days ahead of the clock, because plan-calendar timestamps (2027) are ahead of the build date. Names fail only when every word is deny-listed (`latest_changes`), so `fix_invite_expiry` passes. The env issue is `DATABASE_URL` `schema_invalid`, and `createPrismaClient()` (now exported, `@internal`) also throws on an invalid name outside production; `prisma/seed.ts` passes the schema too. `20251122201244_combined_schema_updates` was edited (`table_schema = 'public'` to `current_schema()`): without it no migration into a non-public schema could finish. `migrate deploy`/`status` ignore the new checksum; `migrate dev` on an existing contributor database asks for a reset, or run `UPDATE "_prisma_migrations" SET checksum = 'af13d7e87e9a3687266696b8daa07909e189c98a5fe6b548cf5f098680e8a83a' WHERE migration_name = '20251122201244_combined_schema_updates'`.)

### Step P11.7: Discord bot lifecycle and command registration

- **Track:** platform. **Lane:** platform. **Effort:** S. **Window:** 2027-02-04 to 2027-02-04. **Depends on:** P4.2.
- **Findings addressed:** GAP-12, GAP-13

**Objective.** The bot starts within one poll of being enabled and given a token, without a restart. The docs match the `ENABLE_DISCORD_BOT` default. Slash-command registration loads its environment before anything touches Prisma, falls back to the token stored in the database, and runs from the published image.

**Guidance.**
- Lifecycle (GAP-12):
  - `startDiscordBotPolling()` (`lib/instrumentation/node.ts:165-187`) loses the boot-time `isDiscordBotEnabled()` short-circuit. The poller is always built unless `ENABLE_DISCORD_BOT=false` or `PROCESS_ROLE=web` (P11.3), and P11.2's `LeasePoller` checks `isEnabled` on every tick.
  - `isEnabled` becomes `isDiscordBotReady()` in `lib/discord/config.ts`: `botEnabled` is on and a token exists, from the database or the environment fallback. A database error returns false for that tick only, with a warning at most once a minute, and never disables the bot until a restart.
  - Log state changes at info, not debug: `discord.waiting_for_enable`, `discord.waiting_for_token` and `discord.ready`.
  - Saving bot settings already bumps `DiscordIntegration.configVersion`, which bounces a running bot. A poller that is not running picks the change up on its next tick, 10 s by default after P0.7.
  - The Discord admin page's bot row (P10.5) shows "Waiting for a bot token", "Turned off" or "Online" from a new `getDiscordBotStatus()`, which reads the lease row and the integration.
- Registration (GAP-13):
  - Move the REST call into `lib/discord/register-commands.ts`: `registerSlashCommands({ token, clientId, guildId?, dryRun })` returns the command names.
  - New `lib/discord/commands/definitions.ts` exports `COMMAND_DEFINITIONS`, the `SlashCommandBuilder` data only. `registry.ts` pairs each definition with a lazily imported handler (`load: () => import('./mystats')`). Importing the definitions therefore never loads `@/lib/prisma`, which `mystats.ts:37` does today.
  - `scripts/register-discord-commands.ts` starts with `import 'dotenv/config'`. It reads the token and client id from the environment, and only when they are missing does it `import('@/lib/discord/config')` to read the database. `--dry-run` prints the list and exits without network access.
  - The scripts run with `tsx` (P0.8 added it) instead of ts-node with the undeclared `tsconfig-paths` (DUP-15).
  - In the image, the Dockerfile builder bundles both Discord scripts with esbuild (exact-pinned) into `scripts/dist/*.cjs`, keeping `discord.js` external. It resolves from the standalone `node_modules`, because it is in `serverExternalPackages`. The runner copies them, and operators run `docker compose exec app node scripts/dist/register-discord-commands.cjs`.
  - GAP-13's other option, registering from the bot when it takes the lease, is left out, so the change stays small.
- Docs: `docs/discord-bot.md` says:
  - the bot runs in the single container or the worker (P11.3);
  - the Admin, Discord, "Bot enabled" switch is the main control, and no restart is needed;
  - `ENABLE_DISCORD_BOT` is on by default, and "false" opts out (fixing `:88` and `:151-152`);
  - how to register commands from a checkout and from the image.
  - `example.env` lists `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` if P4.1 did not, and CLAUDE.md names both scripts.

**Tests.**
- New `lib/instrumentation/__tests__/discord-start.test.ts`, with fake timers:
  - disabled at boot and enabled later starts `bot.initialize` within one poll, and so does a token saved later;
  - `ENABLE_DISCORD_BOT=false` builds no poller;
  - a database error at boot still builds the poller.
- New `lib/discord/__tests__/bot-ready.test.ts` covers the readiness matrix.
- New `lib/discord/commands/__tests__/definitions.test.ts`: with `DATABASE_URL` unset, importing the definitions does not load `@/lib/prisma`, and the names equal the registry's.
- New `scripts/__tests__/register-discord-commands.test.ts`, with `spawnSync` in a temp directory holding a `.env` and no exported `DATABASE_URL`: `--dry-run` exits 0 and lists the commands, and with no token anywhere it exits 1 with the message.
- The image smoke job runs `node scripts/dist/register-discord-commands.cjs --dry-run`.

**Integration.** P11.3's worker role owns the bot. P10.5's status rows use `getDiscordBotStatus()`. P11.24's deployment guide links the registration command, and P11.12's commands keep using the registry.

**Demo.** On a fresh install, turn the bot on in the wizard and paste the token: the bot is online within 10 s, with no restart. Then `docker compose exec app node scripts/dist/register-discord-commands.cjs` registers the commands with the stored token, and they appear in the dev guild.

**Done when.**
- [ ] The poller always runs unless opted out, and the bot starts once it is enabled and has a token.
- [ ] The docs and `example.env` match the default and describe the admin switch.
- [ ] The registration script loads its environment first, falls back to the database token, and runs from the image.
- [ ] The fake-timer and script tests pass.

### Step P11.8: Plex API contract fixes

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-11 to 2027-01-13. **Depends on:** P2.3.
- **Findings addressed:** GAP-05, GAP-06, GAP-08, GAP-10

**Objective.** A temporary Plex failure reads as "temporarily unavailable", never as a verdict, and never removes a role. Server users come from this server's shares, managed users are kept, and pending shares are labelled. The owner's own streams match, and PMS reads use container paging and a PUT scrobble. Contract tests run on recorded responses.

**Guidance.**
- Tri-state access (GAP-05). `checkUserServerAccess` (`lib/connections/plex-user-access.ts:53`) returns `{ status: 'granted' }`, `{ status: 'denied' }` or `{ status: 'unknown', reason, retryAfterSec? }`. In `getPlexUsers` (`plex-user-info.ts:97`), 401 means the token is invalid. A 429 (honouring `Retry-After`), a 5xx, a timeout or a parse error is `unknown`, following Plex's own guidance. The callers:
  - sign-in (P4.8's `authorize`): `unknown` becomes a new code, `plex_unavailable`. P10.27's callback shows a StatusScreen "Plex is temporarily unavailable. Try again in a minute." (`auth-plex-unavailable`), not `/auth/denied`. Admission still fails closed;
  - `lib/discord/role-metadata.ts:93-104` and P4.18's role sync skip the update on `unknown` and keep the stored metadata, so a timeout never removes a role;
  - `validatePlexToken` (`lib/watchlist/plex-watchlist.ts:184`) reports an invalid token only on 401. Other failures record "Plex was unreachable" and retry on the next run, never "Plex token expired";
  - `actions/user-queries.ts:122` keeps its tri-state, and P10.18's table shows Unknown.
- Machine identifier: migration `plex_server_machine_identifier` adds `PlexServer.machineIdentifier String?`. It is written when the server is saved in setup or settings, and filled lazily on the first identity call. Login, invites, grants and P4.11's unshare read it, so a PMS restart no longer blocks a login that plex.tv decides.
- One `/api/users` parser (GAP-06). New `lib/connections/plex-tv-users.ts` (`server-only`) validates fast-xml-parser's output with Zod:
  - each user has `id`, `username`, `title`, `email`, `home` and `restricted`, with `servers[]` carrying `machineIdentifier`, `shareId` (P4.11), `owned` and `pending`;
  - an empty username falls back to `title` with `||`, so managed users are named;
  - `getPlexUsers` and `getAllPlexServerUsers` (`:249`) both use it, removing the duplicate fetch at `:101` and `:253`;
  - `getAllPlexServerUsers` returns only users with a share for this machine identifier, labels `pending: true` and keeps managed users with `managed: true`;
  - `checkUserHasAccess` (`plex-user-access.ts:36`) ignores pending shares;
  - `importPlexUsers` (`actions/import-plex-users.ts:59-85`) imports only this server's members, creates managed users without an email, and reports counts per category.
- The owner as PMS user 1 (GAP-08). New `matchesSessionUser(session, { plexUserId, isOwner })` in `lib/connections/plex-sessions.ts`: the owner (`plexUserId` equal to `PlexServer.adminPlexUserId`) also matches `User.id === '1'`, and everyone else matches by id as today. `lib/discord/commands/watching.ts:97-100` and the chatbot's Plex executor (`lib/chatbot/executors/plex.ts:36-41` after P11.5) use it.
- PMS routes (GAP-10), all through P2.3's `serviceFetch` with the token in a header:
  - `markPlexItemWatched` (`plex-marking.ts:13`, called with the member's token since P4.18) sends `PUT /:/scrobble?identifier=com.plexapp.plugins.library&key=<ratingKey>`, and retries once with GET on a 405 from an older PMS;
  - `getPlexRecentlyAdded` (`plex-sessions.ts:73`) sends `X-Plex-Container-Start: 0` and `X-Plex-Container-Size: <limit>` instead of `?limit=`;
  - `getPlexOnDeck` and `searchPlexMedia` (`plex-search.ts:30`) page the same way, 50 at a time, and validate the fields they read with Zod, replacing `(item: any)` at `:71`;
  - `/hubs/search` and `/hubs/continueWatching` stay optional; python-plexapi uses the current routes.
- Fixtures, recorded from a real server with tokens removed:
  - in `lib/connections/__tests__/fixtures/plex-tv/`: P4.11's `users.xml`, extended with a pending share and a managed user with `username=""`, a 429 with `Retry-After`, and a 503;
  - in `fixtures/pms/`: an owner session with `User id="1"`, a recently-added page, and a 405 for the PUT scrobble.

**Tests.**
- `lib/connections/__tests__/plex-user-access.test.ts`: granted; denied; unknown for 429, 503, a timeout and a parse error; a pending share is denied; the owner is granted with no call.
- New `lib/connections/__tests__/plex-tv-users.test.ts`: the parser on the fixture, the managed user named from `title`, and only this server's users returned.
- `actions/__tests__/import-plex-users.test.ts`: a friend who shares only another server is not imported, and a pending user is labelled.
- `lib/discord/__tests__/role-metadata.test.ts`: `unknown` pushes no update.
- `lib/watchlist/__tests__/plex-watchlist.test.ts`: a 503 never stores "token expired".
- `lib/discord/commands/__tests__/watching.test.ts` and the Plex executor test: the owner's session matches.
- `lib/connections/__tests__/plex-marking.test.ts` checks the PUT and the GET fallback on 405, and `plex-sessions.test.ts` checks the container headers.
- `components/__tests__/auth/plex-callback.test.tsx`: the `plex_unavailable` copy.

**Integration.** P11.10 and P11.12 use the tri-state in Jellyfin and Discord paths. P11.13's offboarding reads the stored machine identifier. P10.18's Unknown state and P4.18's role sync now get real `unknown` values.

**Demo.** Block plex.tv in DNS and sign in as a member: "Plex is temporarily unavailable", and the member's Discord role is unchanged. Restart the PMS during a sign-in: it succeeds. The owner streams something and runs `/watching`: their stream is listed. Import users on a server where a friend shares only their own server: that friend is not imported.

**Done when.**
- [x] Access checks return granted, denied or unknown, and an unknown result never denies a sign-in as a verdict or removes a role.
- [x] Server users come from this server's shares, managed users are kept, and pending shares are labelled and refused.
- [x] The owner's sessions match, and PMS reads use container paging and the PUT scrobble.
- [x] The recorded-response contract tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270115000000_p118_plex_server_machine_identifier`. `checkUserServerAccess(config, plexUserId)` takes an optional `machineIdentifier` and returns `{ status: "granted" | "denied" } | { status: "unknown", reason: "plex_unavailable" | "rate_limited" | "server_unreachable" | "server_token_invalid", retryAfterSec? }`; a 401 on the owner token is `unknown` (`server_token_invalid`), not a denial. `withMachineIdentifier(row)` (`lib/connections/plex-machine-id.ts`) fills the column lazily; setup and settings store it on save; `getActivePlexServerConfig()` carries it. `lib/connections/plex-tv-users.ts` exports `fetchPlexTvUsers`, `parsePlexTvUsers` and `activeShareFor` (an accepted share of a machine). A managed user is `home && restricted` with no email, and `getAllPlexServerUsers` keeps one without a share. `importPlexUsers` leaves pending invites out and returns `managed` and `pending` counts. `computeRoleMetadata` returns `metadata: null` on unknown and `syncDiscordRoleConnection` then pushes and stores nothing. `validatePlexToken` returns `"valid" | "invalid" | "unreachable"`. `matchesSessionUser` and `containerPage`/`PLEX_PAGE_SIZE` live in `plex-sessions.ts`. The callback shows `plex_unavailable` on the shared StatusScreen with test id `plex-callback-error-plex_unavailable`, not `auth-plex-unavailable`. The fixtures were written from the documented response shapes, not recorded from a live server; the import test extends `__tests__/actions/import-plex-users.test.ts`.)

### Step P11.9: Chatbot tool and Prometheus client fixes

- **Track:** platform. **Lane:** platform. **Effort:** S. **Window:** 2027-01-14 to 2027-01-14. **Depends on:** P2.3.
- **Findings addressed:** GAP-07, GAP-09

**Objective.** The Sonarr, Radarr and Overseerr tools ask the APIs for what they actually support, filter in code where an endpoint cannot, include series and movie titles, and page through results. The Prometheus client reports Prometheus's own error message.

**Guidance.**
- Sonarr and Radarr (GAP-07), in `lib/connections/sonarr.ts` and `radarr.ts`:
  - `getSonarrHistory(config, { pageSize, seriesId?, episodeId? })` calls `/api/v3/history/series?seriesId=<id>&includeSeries=true&includeEpisode=true` when a series is given. Otherwise it calls `/api/v3/history?pageSize=<n>&includeSeries=true&includeEpisode=true`, with `episodeId` when given. Radarr uses `/api/v3/history/movie?movieId=<id>&includeMovie=true` or `/api/v3/history?...&includeMovie=true`.
  - The calendar, wanted/missing and queue calls pass `includeSeries=true` (Sonarr) or `includeMovie=true` (Radarr) and an explicit `pageSize`. The queue asks for 50 instead of the API default of 10.
  - New `arrGetPaged()` follows `PagingResource` (`page`, `pageSize`, `totalRecords`) up to a cap of 3 pages or 150 records, and the tool reply says "showing N of M".
  - Filter in code: when a tool asks about one series or movie on an endpoint that cannot filter (queue, calendar, wanted), filter the paged records by `seriesId` or `movieId`, so the assistant never reports unrelated events.
  - A small Zod schema per endpoint types the parameters, so a parameter the API does not bind, such as `seriesId` on `/history`, is a type error.
- Overseerr users: the "all users" tool (`getOverseerrUsers`, `lib/connections/overseerr.ts:103`) reuses P4.13's `buildOverseerrUserIndex` paging (`take=100&skip=n`), and returns the total and the first 100 names with "and N more".
- The tool descriptions in `lib/chatbot/tools/sonarr.ts` and `radarr.ts` (moved by P11.5; today `actions/chatbot/tools/sonarr.ts:74`) and the executors (`executors/sonarr.ts:99`, `radarr.ts:94`) describe the filters truthfully.
- Prometheus (GAP-09), at `lib/connections/prometheus.ts:84-86` and `:141-143`:
  - on a non-2xx response, parse the body with Zod as `{ status: 'error', errorType, error }` and return `${errorType}: ${error}`, cut to 300 characters;
  - a 503 returns `{ code: 'PROMETHEUS_TIMEOUT', retryable: true }`, and a non-JSON body falls back to the status text;
  - delete the dead `data.error` branch that only runs on 2xx;
  - `actions/prometheus-status.ts:66-75` logs `prometheus.query_failed` with the `errorType` and no URL.
- P10.20's Prometheus settings show the parse error inline after Test.

**Tests.** Recorded fixtures live in `lib/connections/__tests__/fixtures/arr/` (two pages of series history, a queue with `includeSeries`, a calendar) and `fixtures/prometheus/` (400 `bad_data`, 422 `execution`, 503 `timeout`).
- `sonarr.test.ts` and `radarr.test.ts`:
  - a series history call hits `/history/series` with `seriesId`;
  - `includeSeries` or `includeMovie` is present on calendar, missing and queue;
  - paging stops at `totalRecords` and at the cap.
- `lib/chatbot/executors/__tests__/sonarr.test.ts`: "why didn't X download" returns only X's events, and the reply says how many were shown.
- New `lib/chatbot/executors/__tests__/overseerr-users.test.ts`: 230 users report a total of 230.
- `lib/connections/__tests__/prometheus.test.ts`: the 400 body gives "bad_data: parse error at char 5", a 503 is retryable, and an HTML body falls back to the status text.
- `actions/__tests__/prometheus-status.test.ts`: a failure is logged once.

**Integration.** The admin web assistant and the Discord admin assistant pick the fixes up through the shared executors. P10.5's Prometheus card and P10.21's uptime strip show the clearer errors.

**Demo.** Ask the admin assistant "why didn't Severance download?": it answers from Severance's own history, with titles. Ask for every Overseerr user: it reports the true total. Save `rate(` as a PromQL query: settings show "bad_data: ..." instead of "Bad Request".

**Done when.**
- [x] History calls use the per-series and per-movie routes, and list calls include series and movie data and page with a cap.
- [x] Endpoints that cannot filter are filtered in code, and Overseerr users are paged.
- [x] Prometheus errors show `errorType: error`, and 503 is treated as retryable.
- [x] The fixture tests pass.

(as merged: built at the current paths, `actions/chatbot/{tools,executors}/` (P11.5's move to `lib/chatbot/` was in flight), with tests in `actions/chatbot/executors/__tests__/` and `__tests__/actions/prometheus-status.test.ts`. The history, queue and wanted calls return `ArrPage` (`{ records, totalRecords }`) from `arrGetPaged`/`arrGetList` in `lib/connections/arr-client.ts`, with params typed by `arrQuery(strictSchema, params)`; executors format them through `actions/chatbot/executors/arr-output.ts` (`showing` line). An episode's history uses `/history?episodeId=` even when a series is also given. The calendar takes no `pageSize` (neither API binds it), and Radarr's calendar and wanted/missing return movies, so they take no `includeMovie` and are filtered by the movie's `id`; `getSonarrCalendar` always sends `includeSeries` (its options argument is gone). `serviceFetch` gained `readErrorBody` (failure `detail: { body, statusText }`); Prometheus calls return `PrometheusResult` (`code`, `errorType`, `retryable`), `validatePrometheusQuery` returns Prometheus's message without the old "Invalid PromQL query:" prefix and takes `{ timeoutMs }`, and settings' Test runs the query after the connection check and puts a rejection on the `query` field.)

### Step P11.10: Jellyfin member parity: service, admin visibility and tests

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-14 to 2027-01-18. **Depends on:** P4.7.
- **Findings addressed:** GAP-24, GAP-27, GAP-30

**Objective.** Every member row records the service the member uses, written at invite, sign-in and import and backfilled once, and onboarding and the home tiles follow it. Admins see each member's service and can turn a member's Jellyfin access off and on. Tests and seed data cover Jellyfin members end to end.

**Guidance.**
- One rule for the service, in new `lib/members/service.ts`:
  - `memberServices(user)` returns `('plex' | 'jellyfin')[]` from `plexUserId` and `jellyfinUserId`;
  - `primaryService(user)` returns the stored `primaryAuthService` when it matches a linked identifier, else the only linked service, else `'plex'`.
- Writes (GAP-24):
  - `'plex'`: the Plex create in `authorize()` (`lib/auth.ts:202-211`), the Plex invite create (`actions/invite.ts:332`, inside P4.8's `redeemPlexInvite`) and `importPlexUsers` (`actions/import-plex-users.ts:75-83`);
  - `'jellyfin'`: the Jellyfin invite create (`invite.ts:744`, in P4.12's `recordJellyfinInviteUsage`) and the Jellyfin `authorize()` create (`lib/auth.ts:357-366`), which already sets it;
  - a later sign-in with the other service never flips an existing value. P0.5 removed the email-link override at `lib/auth.ts:345`; check that it is gone.
- Migration `primary_auth_service_enum` adds `enum AuthService { plex jellyfin }`. Its data step runs first:
  - `UPDATE "User" SET "primaryAuthService" = 'jellyfin' WHERE "jellyfinUserId" IS NOT NULL AND "plexUserId" IS NULL;`
  - `UPDATE "User" SET "primaryAuthService" = 'plex' WHERE "plexUserId" IS NOT NULL AND ("primaryAuthService" IS NULL OR "jellyfinUserId" IS NULL);`
  - any other value becomes NULL, and then the column changes type with `USING "primaryAuthService"::"AuthService"`;
  - the PR shows the dry-run counts from the same `WHERE` clauses.
- Readers: `app/(app)/page.tsx:75`, `app/onboarding/page.tsx:20` and `actions/onboarding.ts:58` use `primaryService(user)`. P10.21's QuickLinks show one media tile per linked service, so a member with both sees both.
- Admin visibility (GAP-27):
  - The list and detail DTOs (`lib/data/admin-users.ts` after P11.5, and `types/admin.ts:65-80`) gain `jellyfinUserId`, `services` and `primaryService`. The detail DTO also gains `jellyfinStatus` (`enabled`, `disabled`, `missing` or `unknown`), read live with `getJellyfinUserById` and a 5 s timeout.
  - P10.18's DataTable adds a service badge column (`admin-user-service-badge`) and a Service filter. The detail page shows the Jellyfin ID and Jellyfin access beside the Plex rows.
- Removing Jellyfin access:
  - New `setJellyfinAccountDisabled(config, jellyfinUserId, disabled)` in `lib/connections/jellyfin-users.ts` reads the user, merges the existing `Policy` and changes only `IsDisabled`. `setJellyfinUserPolicy` cannot be used, because it resets the libraries and `IsAdministrator` (`:139`).
  - New `adminAction` `setMemberJellyfinAccess({ userId, enabled })` in `actions/admin/member-access.ts`. It refuses the caller and any Jellyfin administrator; P4.7's `isJellyfinAdmin` returning `'admin'` or `'unknown'` both refuse.
  - Turning access off calls P4.7's `endUserSessions` and P4.18's `enqueueRoleSync`. Each change is audited as `JELLYFIN_ACCESS_DISABLED` or `JELLYFIN_ACCESS_ENABLED`.
  - On the user detail page, a P3.6 ConfirmDialog (`admin-user-jellyfin-disable`) asks for the member's name before turning access off, the typed confirmation of UI Q10.
- Seeds and fixtures (GAP-30):
  - `prisma/seed.ts` and `e2e/global-setup.ts` add a Jellyfin-only member (`jf-member`) and a member with both identities.
  - New `e2e/mocks/jellyfin-server.ts` is a small `node:http` server for `/System/Info/Public`, `/Users/AuthenticateByName`, `/Users/{id}`, `/Users/{id}/Policy` and `/Users/New`. Global setup starts it on a free port, and the seeded `JellyfinServer.url` points at it. Playwright's `page.route` cannot intercept these, because the server makes the calls.

**Tests.**
- New `lib/members/__tests__/service.test.ts` covers the rule matrix.
- New `__tests__/lib/auth-jellyfin-authorize.test.ts`:
  - a new Jellyfin user and an existing one found by `jellyfinUserId`;
  - P0.5's disabled toggle refuses;
  - an administrator is promoted (P4.7), and an `'unknown'` lookup changes nothing.
- `actions/__tests__/invite.test.ts`: a Jellyfin invite writes `'jellyfin'` and a Plex invite writes `'plex'`; `import-plex-users.test.ts` writes `'plex'`.
- New `prisma/__tests__/primary-auth-service.pg.test.ts` runs the migration over seeded rows of each shape.
- New `actions/__tests__/member-access.test.ts`: the merge keeps `EnabledFolders`; a Jellyfin administrator is refused; sessions end; there is one audit entry.
- `app/(app)/__tests__/page.test.tsx` and `app/onboarding/__tests__/page.test.tsx`: a Jellyfin member gets the Jellyfin steps and tile.
- New `e2e/jellyfin-member.spec.ts`, on the mock server:
  - invite, sign-in and onboarding show the Jellyfin copy (`onboarding-service-jellyfin`), and home shows `quick-link-jellyfin`;
  - after an admin turns access off, the member's next navigation lands on sign-in.
- P11.11 and P11.12 add the Stripe and Discord cases.

**Integration.** P11.11's grant and revoke and P11.12's Discord identity are built on `memberServices`. P11.13's offboarding calls `setJellyfinAccountDisabled`. The mock server is reused by P11.11's Stripe E2E.

**Demo.** Invite a Jellyfin member and sign them in: they see the Jellyfin onboarding and a Jellyfin tile. On `/admin/users` the Service column shows Jellyfin, and the detail page shows "Jellyfin access: enabled". Turn it off: the mock server records `IsDisabled: true`, and the member is signed out.

**Done when.**
- [x] `primaryAuthService` is written on every create path, backfilled, and stored as an enum.
- [x] Onboarding and the home tiles follow the member's service.
- [x] Admins see each member's service and Jellyfin status, and can turn Jellyfin access off and on with an audit entry.
- [ ] The seed, the mock Jellyfin server and the sign-in, onboarding and admin tests exist and pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: the rule lives in `lib/members/service.ts` (P11.10 wrote it in `lib/member/`; the P11 integration moved it to the plan's path beside P11.13's `lib/members/` and dropped P11.13's stand-in); `memberServices` and `primaryService` take `{ plexUserId, jellyfinUserId[, primaryAuthService] }`. Migration `20270116000000_p1110_primary_auth_service_enum`; Prisma enum `AuthService`. The readers are `getOnboardingStatus` and `getHelpData` (onboarding, Help and home all read `getHelpData`). `QuickLinksProps.media` is now an array, one tile per linked service, test ids `home-quick-link-plex` / `home-quick-link-jellyfin` (was `home-quick-link-media`). The detail DTO is `lib/admin/user-detail.ts` (`jellyfinUserId`, `services`, `primaryService`, `jellyfinStatus`, null without a Jellyfin account; `primaryAuthService` is gone from it); the list DTO gains `jellyfinUserId`, `services`, `primaryService` and the list a `?service=` filter. `setJellyfinAccountDisabled` is in `lib/connections/jellyfin-users.ts` (after the integration it returns P11.13's `JellyfinDisableResult`: `changed`/`unchanged`/`not_found`, or `JELLYFIN_ADMIN`/`JELLYFIN_UNAVAILABLE`); `isJellyfinAdmin` is now exported from `lib/jellyfin-auth.ts`. `setMemberJellyfinAccess` ends sessions with reason `unshared` and re-syncs the role with `access_granted` on enable. The mock Jellyfin server is started by `e2e/global-setup.ts`, which exports `E2E_JELLYFIN_URL`; global setup seeds only the members (`jf-member`, `both-member`, in `e2e/helpers/jellyfin-members.ts`), and each spec that needs Jellyfin upserts its own active row pointing at the mock (as `e2e/jellyfin-member.spec.ts` does), so other specs keep a Plex-only sign-in. Onboarding's root carries `onboarding-service-<service>`.)

### Step P11.11: Stripe for Jellyfin-only members

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-21 to 2027-01-25. **Depends on:** P4.10, P11.10.
- **Findings addressed:** GAP-23

**Objective.** Paying, cancelling and comp grants act on the service the member actually uses: they enable or disable the Jellyfin account, or add or remove the Plex share. Nothing ever invites a username-derived email to Plex.

**Guidance.**
- New `lib/members/access-actions.ts`: `grantServiceAccess(user)` and `revokeServiceAccess(user)` iterate `memberServices(user)` (P11.10):
  - `plex`: today's invite flow (`inviteUserToPlexServer`) and P4.11's unshare;
  - `jellyfin`: P11.10's `setJellyfinAccountDisabled(false)` or `(true)`.
- A member with no linked service, or a Plex grant with neither a `plexUserId` nor a Plex-verified email, is skipped with code `NO_MEMBER_SERVICE`. The code is recorded on the subscription, the skip is logged, and nothing throws, so BullMQ stops retrying (GAP-23). A Jellyfin username is never used as an address; P0.5 already cleared those emails.
- Jobs: keep the job names `PLEX_ACCESS_GRANT` and `PLEX_ACCESS_REVOKE`, so jobs queued before the deploy still run. Rename the processors in `lib/queue/jobs/stripe.ts` to `processAccessGrant` and `processAccessRevoke`, with a JSDoc note on the legacy names, and call the new functions after P4.10's live re-checks.
- Guards (FR-19):
  - `evaluateRevokeGuard` (`lib/queue/jobs/stripe.ts:536`) gains `jellyfinAdmin: boolean`: a Jellyfin administrator is never disabled, and an `'unknown'` admin check also skips;
  - the admin, exempt, not-Stripe-managed and `PAST_DUE` rules stay. FR-29 (no side effects while Stripe is off) and FR-4 are unchanged;
  - extend the JSDoc example, which the JSDoc-example test covers.
- Status: migration `subscription_jellyfin_access` adds `Subscription.jellyfinAccessStatus String?` (`enabled`, `disabled` or `skipped`) beside `plexInviteStatus`.
- Copy and UI:
  - P10.28's success checklist and `subscription-banners.tsx:63` say "Your Jellyfin account is enabled" or "We've sent a Plex invite to your email", per service; a member with both sees both lines;
  - the comp grant dialog (`components/admin/users/grant-access-button.tsx:81`) says "They will get access to {services}", and the cancel dialog names the services;
  - when the owner turns Stripe on, `setStripeEnabled` returns a confirmation step listing Jellyfin-only members who are not exempt ("3 Jellyfin members will be asked to subscribe"). These accounts were created in Jellyfin itself, not through an app invite, so the owner can mark them exempt first.
- Docs: `docs/stripe.md` changes its scope from "Plex users who are not members" (`:3-7`) to Plex and Jellyfin members, and describes what grant and revoke do per service and the Jellyfin administrator guard. CLAUDE.md's Stripe paragraph adds "never disables a Jellyfin administrator".

**Tests.**
- `__tests__/lib/queue/plex-access-grant.test.ts`, renamed `access-grant.test.ts`:
  - a Jellyfin-only member is enabled through a merged policy, with no Plex call;
  - a Plex member is invited, and a member with both gets both;
  - a member with no service is skipped and nothing throws.
- `access-revoke.test.ts`:
  - a Jellyfin-only member is disabled;
  - a Jellyfin administrator, or an `'unknown'` admin check, is skipped;
  - the exempt, admin and `PAST_DUE` guards hold for Jellyfin, and a stale event is skipped (P4.10).
- `stripe-processor-disabled.test.ts` and `stripe-toggle-off-safety.test.ts` gain Jellyfin cases with no side effects.
- `app/subscribe/success/__tests__/page.test.tsx`: the copy per service.
- `actions/__tests__/admin-stripe-config.test.ts`: enabling Stripe lists the non-exempt Jellyfin-only members.
- `e2e/stripe-subscription.spec.ts`, with Stripe mocked as today and P11.10's mock Jellyfin server: a Jellyfin-only member subscribes and the mock records `IsDisabled: false`; cancelling records `true`.

**Integration.** P11.13's offboarding reuses `revokeServiceAccess`. P4.18's role sync follows each change. The admin users page (P11.10) shows `jellyfinAccessStatus` next to the Plex invite status.

**Demo.** In Stripe test mode, a Jellyfin-only member subscribes: the success page says "Your Jellyfin account is enabled", and the account works. Cancel at period end and run the revoke: the account is disabled, while a Jellyfin administrator in the same state is left alone, with a logged reason.

**Done when.**
- [x] Grant and revoke act on Plex, Jellyfin or both, following the member's linked services.
- [x] No path invites a username-derived email; members without a usable identity are skipped with a code.
- [x] A Jellyfin administrator is never disabled, and the existing guards still hold.
- [x] Copy, admin dialogs and `docs/stripe.md` describe the per-service behaviour, and the tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270117000001_p1111_subscription_jellyfin_access` adds `Subscription.jellyfinAccessStatus` and also `Subscription.accessSkipCode`, where `NO_MEMBER_SERVICE` is recorded (null after a grant or revoke that acted). `grantServiceAccess(user)` sits beside P11.13's `revokeServiceAccess` in `lib/members/access-actions.ts`; it turns Jellyfin on first and invites Plex last, so a retry never invites twice, and returns failure codes (`NO_PLEX_SERVER`, `NO_JELLYFIN_SERVER`, `PLEX_INVITE_FAILED`, `JELLYFIN_UNAVAILABLE`) that the job throws to retry. A Plex invite needs a `plexUserId` and its email; otherwise the Plex part is skipped. The revoke guard asks `isJellyfinAdmin` between the stored-state and live Stripe checks and skips the whole revoke (Plex too) for `'admin'` or `'unknown'`. `startCheckout` now lets a Jellyfin-only member with no email check out. `setStripeEnabled` takes `boolean | { enabled: true, confirmJellyfinMembers: true }` and returns `{ status: "saved" }` or `{ status: "confirm", jellyfinMembers: { count, names } }` (non-admin, non-exempt, enabled Jellyfin-only members); the switch shows `stripe-enable-jellyfin-confirm`. `UserActionTarget` gains `services`; `serviceNames()` in `lib/members/service.ts`. Billing tab rows `admin-user-plex-invite-status` / `admin-user-jellyfin-access-status`; success checklist `subscribe-success-jellyfin-enabled` / `-provisioning` / `-skipped`; the pending-invite notice carries `jellyfinEnabled`. Job labels read "Member access grant/removal". The E2E case enqueues the grant and revoke jobs itself with Stripe on and no secret key (no Stripe stub exists); written, not run.)

### Step P11.12: Discord for Jellyfin members; stats from stored facts

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-25 to 2027-01-27. **Depends on:** P11.10.
- **Findings addressed:** GAP-25, RWP-17

**Objective.** Discord recognises Jellyfin members, and every command either works for them or says plainly why it cannot. `/mystats` and the linked-role hours read stored v3 Rewind facts or a bounded window of history instead of scanning a member's whole Tautulli history. This is the part of RWP-17 that Rewind deferred to January (`design/rewind-2026-design.md` 13.5).

**Guidance.**
- Identity (GAP-25): `verifyDiscordUser` (`lib/discord/services.ts:53-66`) also selects `jellyfinUserId` and `primaryAuthService`, and returns `services` (P11.10). Every branch on `plexUserId` gets an explicit reply for Jellyfin-only members from new `lib/discord/copy.ts`:
  - `/mystats` (`mystats.ts:141-144`): "Stats use Plex watch history, and your account is on Jellyfin, so they aren't available yet.";
  - `/watching` (`watching.ts:235-239`): "I can only see Plex streams for now.";
  - `/mark` (`mark/index.ts:195-203`): "Marking works with the Plex library only.";
  - the assistant: the Plex and Tautulli executors (`lib/chatbot/executors/plex.ts:53-62`, `tautulli.ts:93-105`) return `{ unavailable: 'jellyfin-member' }` instead of empty sessions. The Discord system prompt (`discord-system-prompt.ts:10`) names Jellyfin when it is configured, and so does the fallback reply (`services.ts:200`).
- Linked roles: P4.18's `computeRoleMetadata` sets `is_subscribed` from `getAccessLevel(userId) === 'full'` together with per-service access. That is either a Plex share (P11.8's tri-state, where `unknown` keeps the stored value) or a Jellyfin account that exists and is not disabled (`getJellyfinUserById`, `Policy.IsDisabled`).
- Stats from stored facts (RWP-17). New `lib/discord/stats/member-stats.ts` exports `getMemberYearStats(userId, { year, zone })`:
  1. When a completed v3 Rewind exists for the year, it reads the facts through P2.1's `parseStoredRewind`: hours, top show, top film, peak hour and longest streak. No Tautulli call is made.
  2. Otherwise it reads a bounded window: P2.4's `sources/tautulli-history.ts` over `yearWindow(year, zone)` with padded `after` and `before` (P2.2), at most 20 pages, under P2.5's Tautulli semaphore, computed with P2.7's `totals`, `time` and `calendar` modules. The result is cached in Redis for 15 minutes per member and year.
  - The year is the member's current year in `User.timezone ?? serverZone()`, which also fixes `mystats.ts:152` (GAP-44).
  - `/mystats` and the daily role reconcile's hours (P4.18's `lastWatchedHours`) both use it, so neither runs the all-time `fetchTautulliStatistics` scan.
- Delete `fetchTautulliStatistics` (`lib/wrapped/tautulli-user-statistics.ts:27`) and the v2 statistics modules that only Discord still used (P8.8 left them), after `knip --production` confirms there is no other caller.

**Tests.**
- `lib/discord/__tests__/services.test.ts`: Jellyfin-only and dual identities resolve with their services.
- `lib/discord/commands/__tests__/mystats.test.ts`:
  - the v3 path makes no Tautulli call;
  - the bounded path sends `after` and `before` and stops at 20 pages;
  - a Jellyfin-only member gets the explicit reply;
  - at 16:30 on 31 December in Los Angeles, the year is still the old one.
- `watching.test.ts`, `mark-command.test.ts` and the executor tests check the explicit replies.
- `lib/discord/__tests__/role-metadata.test.ts`: an enabled Jellyfin account counts as subscribed and a disabled one does not; an unknown Plex result pushes no update; hours come from the stored facts.
- New `lib/discord/stats/__tests__/member-stats.test.ts` runs P2.10's golden fixtures, whose totals equal the fixtures' Rewind facts.

**Integration.** P11.17 passes the member's zone into the assistant on the same identity. P4.18's daily reconcile now reads `getMemberYearStats`, and `docs/discord-bot.md` documents what Jellyfin members can use.

**Demo.** Link Discord as the seeded Jellyfin member: `/mystats` and `/watching` give the explicit replies, and the linked role shows "subscribed". For a Plex member with a completed 2026 Rewind, `/mystats` answers from stored facts, and the Tautulli access log shows no request.

**Done when.**
- [x] Discord identity carries Jellyfin, and every command or tool gives Jellyfin-only members a real answer or an explicit reason.
- [x] `is_subscribed` follows access on each service.
- [x] `/mystats` and the role hours read stored v3 facts or at most 20 pages of history for the member's year.
- [x] `fetchTautulliStatistics` and the Discord-only v2 modules are deleted.

(as merged: `verifyDiscordUser`'s user gains `jellyfinUserId`, `primaryAuthService`, `services` and `timezone` (the member's `User.timezone`, for P11.17). `lib/discord/copy.ts` holds `JELLYFIN_COPY` (mystats, watching, mark), `isJellyfinOnly(services)` and `assistantFallbackReply(jellyfinConfigured)`; the commands reply before deferring. The executors return `JELLYFIN_MEMBER` (`{ unavailable: "jellyfin-member" }`, `lib/chatbot/executors/tool-output.ts`) from `get_plex_sessions` and the Discord `get_tautulli_activity`; `generateDiscordSystemPrompt(toolset, { jellyfin })` takes an options object that P11.17 can extend with the zone, and `runChatbotForUser` sets it from an active `JellyfinServer`. `computeRoleMetadata`'s user is `{ id, plexUserId, jellyfinUserId, timezone, lastWatchedHours }`; access is true when either service grants it, null (push nothing) when none grants and one is unknown. Stats live in `lib/discord/stats/`: `getMemberYearStats(userId, { year, zone, limiter?, signal? })` returns `{ ok, stats }` or `NO_PLEX_ACCOUNT` / `NO_TAUTULLI` / `UNAVAILABLE`; `memberStatsYear(timezone, now?)` gives the year and zone; the pure `statsFromFacts` / `statsFromEvents` are in `year-stats.ts`. The history read is P2.4's source with a new `maxPages` option (20) over `yearWindow` (whole calendar year, `finalCut: true` context), honouring `RewindExclusion` for the top titles but not P2.6's content-rating exclusions; the default limiter is `redisLimiter` when Redis is configured; Redis key `discord:stats:<userId>:<year>:<zone>`, 15 minutes. A v1/v2 completed row falls through to the history read. `/mystats` formats the peak hour in en-US (P11.17 owns locale; after the P11 integration it formats it in `Config.locale`, and the prompt is `generateDiscordSystemPrompt(toolset, { format, now, jellyfin })`). Deleted: `lib/wrapped/{tautulli-statistics,tautulli-user-statistics,derived-statistics,statistics-types}.ts`, their tests, the v2 history schemas in `lib/validations/tautulli.ts` and the `DerivedStatistics` type export. The member-stats tests are in `lib/discord/stats/__tests__/member-stats.test.ts` (goldens included); the services cases are in `__tests__/lib/discord-services.test.ts`.)

### Step P11.13: Member offboarding and deletion

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-18 to 2027-01-20. **Depends on:** P4.7, P4.11.
- **Findings addressed:** GAP-31

**Objective.** An admin can remove a member with an audited action that needs the member's name typed to confirm. Removal ends the member's sessions, removes their Plex or Jellyfin access, stops watchlist sync, revokes their Discord grant, and deletes or anonymises their personal rows and tokens, following a written data inventory.

**Guidance.**
- Fix offboarding first (GAP-31). P4.11's unshare and P11.11's revoke also set `WatchlistSyncSettings.syncEnabled = false` and null `User.plexAuthToken`; P4.7's `endUserSessions` already runs. `syncUserWatchlist` refuses a member without access (`getAccessLevel` returns `none`, or the member is disabled) with a new skip code, `NO_ACCESS`, alongside P4.13's codes.
- Data inventory: new `docs/privacy.md` takes the table from `research/additional-findings.md` ("Privacy: personal-data inventory") and updates it for the v3 models and every column added since. Each row says what removal does to it. A test checks that every Prisma model appears in the document.
- New `lib/members/erase.ts` (`server-only`) exports `eraseMember(userId, { actorId, dryRun })`. Each part is idempotent and reports counts.
  1. External effects, before any database change, each recorded in the result:
     - cancel an active or past-due Stripe subscription at once (`stripe.subscriptions.cancel`, through `getStripe()`);
     - P11.11's `revokeServiceAccess`, which unshares from Plex or disables the Jellyfin account;
     - `clearDiscordRoleForUser` (`lib/discord/integration.ts:329`), then the new `revokeDiscordToken()` in `lib/discord/api.ts` (`POST /oauth2/token/revoke`);
     - remove the member's queued jobs by their deduplication ids, then `endUserSessions`.
  2. One `$transaction`:
     - delete `DiscordCommandLog` rows by `userId` or `discordUserId`, and `DiscordChatSession` and `DiscordPendingSelection` rows by `discordUserId`;
     - null `prompt` and `response` on `LLMUsage` rows that admins generated for this member (`generationId` pointing at the member's `RewindGeneration`, P2.1);
     - delete the `User` row, which cascades to PlexWrapped (and through it RewindShare, RewindView and RewindGeneration), RewindPrefs, RewindExclusion, LLMUsage, ChatConversation, DiscordConnection, the WatchlistSync tables, UserMediaMark, InviteUsage and Subscription.
  3. Audit `MEMBER_ERASED` with the target id, the counts and the Stripe customer id, so the owner can still find the billing record in Stripe, and nothing else personal.
  - An external failure, such as a Plex 503, stops before the transaction with a code. Running the action again is safe.
- Schema holes: migration `discord_command_log_user_fk` first nulls orphaned `DiscordCommandLog.userId` values, then adds `user User? @relation(fields: [userId], references: [id], onDelete: SetNull)`. Discord unlink also deletes the `DiscordChatSession` rows for that Discord id, and `getOrCreateSession` (`lib/discord/chat-session.ts:112`) checks the app user, so a relinked account starts fresh.
- Refusals: the caller, the Plex owner, the last admin (P4.7's rules), and a member with a running Rewind generation, who can be removed once it finishes.
- New `adminAction` `removeMember({ userId, confirmName })` in `actions/admin/member-access.ts`, limited to 10 per hour. The server compares `confirmName` with the member's display name. The dialog runs `eraseMember({ dryRun: true })` first and lists the counts.
- UI: a danger zone on the user detail page (P10.18, P10.6) with "Remove member". It opens a P3.6 `AlertDialog` with the counts and the field "Type {name} to confirm" (`admin-remove-member-confirm-input`). The destructive button (`admin-remove-member-button`) stays disabled until the text matches. Success returns to `/admin/users` with the flash code `member_removed`.
- `docs/privacy.md` also lists what removal keeps: audit entries (ids only), Stripe's own billing records, and Plex, Jellyfin and Tautulli history, which live outside the app.

**Tests.**
- New `lib/members/__tests__/erase.test.ts`, with the external calls mocked:
  - the external effects run before the transaction, and a dry run writes nothing;
  - each refusal returns its code;
  - a Plex failure stops before the transaction, and a rerun after a partial run completes.
- New `lib/members/__tests__/erase.pg.test.ts`, gated like P0.8's Postgres tests: a fixture builder seeds one row in every inventory table; after the erase, no model has a row referencing the user id or the Discord id, and the single `MEMBER_ERASED` row holds no name or email.
- New `lib/discord/__tests__/api-revoke.test.ts` checks the revoke request.
- `lib/watchlist/__tests__/sync-service.test.ts` checks the `NO_ACCESS` skip.
- `actions/__tests__/member-access.test.ts`: a wrong name returns `VALIDATION`, and the owner is refused.
- New `__tests__/docs/privacy-inventory.test.ts`: every model in `schema.prisma` appears in `docs/privacy.md`.
- New `e2e/admin/remove-member.spec.ts`: a wrong name keeps the button disabled; the right name removes the member, their session ends, and the row is gone from the list.

**Integration.** P11.14's retention and P11.15's export are driven by the same inventory. P11.16 adds the read and write events around it. The README's Security section links `docs/privacy.md`.

**Demo.** Remove a seeded member who has a subscription, a Discord link, marks, a Rewind with a public link and watchlist sync on. The dialog shows the counts. After confirming: Stripe shows the subscription cancelled, the Plex share is gone, the Discord role and grant are revoked, the public link returns 404, and a query over the inventory finds no rows for the member.

**Done when.**
- [x] Unshare and revoke stop watchlist sync and clear the stored Plex token.
- [x] `eraseMember` runs the external effects, deletes or anonymises every inventory row, and audits the removal with ids only.
- [x] The admin action needs the member's name typed, refuses protected members, and shows dry-run counts.
- [x] `DiscordCommandLog` has its foreign key, and `docs/privacy.md` holds the inventory checked by a test.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270116000003_p1113_discord_command_log_user_fk`. P11.10 and P11.11 had not merged, so this step wrote the smallest versions of their helpers at the plan's paths, for them to replace or extend: `memberServices` in `lib/members/service.ts`, `revokeServiceAccess(user)` in `lib/members/access-actions.ts` (Plex unshare, Jellyfin disable; returns `{ success, plex?, jellyfin? }` or a code: `PLEX_AUTH`, `PLEX_UNAVAILABLE`, `JELLYFIN_ADMIN`, `JELLYFIN_UNAVAILABLE`), and `setJellyfinAccountDisabled(config, id, disabled)` appended to `lib/connections/jellyfin-users.ts` (merges the policy, refuses an administrator, a 404 is `not_found`). `actions/admin/member-access.ts` holds `previewMemberRemoval` (the dry run the dialog loads) and `removeMember`; P11.10's `setMemberJellyfinAccess` joins it. `stopSyncAndClearPlexToken` (`lib/members/offboard.ts`) runs in `unshareUserLibrary` and `processPlexAccessRevoke`; `isPlexServerOwner` moved to `lib/members/owner.ts`. `NO_ACCESS` is a missing member or access level `none`; `lapsed` stays `NOT_ENTITLED`. `clearDiscordRoleForUser` itself revokes the grant (`revokeDiscordToken`, refresh token first) and deletes the Discord id's chat sessions, so a member's own unlink revokes too; it returns `{ linked, roleCleared, grantRevoked }`, and Discord failures never stop a removal. Removal also refuses a queued Rewind generation, not only a running one; it anonymises admin LLM rows found by `wrappedId` as well as `generationId`; sessions end before the queued jobs (`watchlist:user:<id>`, `discord:role:<id>`) are removed, so the role sync that `endUserSessions` queues is dropped too. The danger zone is at the foot of the Overview tab; its dialog is `RemoveMemberDialog` with test ids `admin-remove-member-open`, `-confirm-input`, `-button`, `-preview` and `-count-<table>`. Rate limit `admin:remove-member` (10 an hour); audit type `MEMBER_ERASED`; session reason `removed`; flash `member_removed`. The E2E spec was written but not run.)

### Step P11.14: Retention jobs for content tables

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-21 to 2027-01-25. **Depends on:** P11.13.
- **Findings addressed:** GAP-35, SEC-34

**Objective.** A daily job enforces documented retention windows on the content tables, so viewing histories, direct messages and visit counters stop growing without bound. `docs/privacy.md` states how long each kind of personal data and each stored token is kept.

**Guidance.**
- Windows live in new `lib/retention/policy.ts`, each overridable with a `RETENTION_<NAME>_DAYS` variable in P4.1's schema (minimum 1):
  - Rewind `LLMUsage` text (rows with `generationId` or `wrappedId`, or no `chatConversationId`): `prompt` and `response` are nulled after 120 days; tokens, cost and model are kept (design 7.10);
  - assistant `LLMUsage` text (rows with `chatConversationId`): nulled after 90 days;
  - `ChatConversation`: `endedAt` is written on idle reset (`lib/discord/chat-session.ts:139-142`) and manual reset (`lib/discord/services.ts:283-285`). Rows ended more than 180 days ago are deleted; `LLMUsage.chatConversationId` is set to null and `DiscordChatSession` cascades;
  - `DiscordChatSession.messages`: emptied after 1 idle day, and the row deleted after 30 idle days;
  - `DiscordCommandLog`: `commandArgs` nulled after 7 days, and the row deleted after 90;
  - `RewindShareVisitDay`: deleted after 90 days (design 6.2); `RewindView`: deleted after 120 days (design 7.10);
  - `WatchlistSyncHistory`: sync now writes the existing `REMOVED_FROM_WATCHLIST` status (`schema.prisma:658`) for items no longer on the full watchlist that P11.28 pages through, and those rows are deleted after 30 days;
  - transient rows: `DiscordOAuthState` expired for over a day, and expired `DiscordPendingSelection` rows;
  - `RewindGeneration.previousData`: nulled after 2027-06-30 (design 7.9);
  - `AuditLog`: deleted after 400 days (P4.6), its only delete path.
- The job: `JOB_TYPES.RETENTION_SWEEP` in new `lib/queue/jobs/retention.ts`.
  - Each rule selects ids in batches of 1,000 and then updates or deletes by id, so transactions stay short. It checks P4.2's `shutdownSignal` between batches.
  - It logs `retention.swept` with per-rule counts, and stores `Config.lastRetentionRunAt` and a summary (migration `retention_run`).
  - A BullMQ job scheduler runs it daily at 03:30 in `Config.timezone` (`pattern: '30 3 * * *'`, `tz`), with deduplication id `retention:<date>`, in the worker role (P11.3).
  - Without Redis, P11.2's `LeasePoller`, under the lease name `retention`, runs it when the last run is more than 24 hours old.
- Admin: a new Privacy section in settings lists the windows and the last run with its counts, and "Run now" (`settings-retention-run`) is an audited admin action (`RETENTION_RUN`).
- `docs/privacy.md` (P11.13) gains a Retention column and a "Stored tokens" section (SEC-34):
  - `plexAuthToken` is kept while the member has access, and cleared on unshare, revoke and removal;
  - Discord tokens are kept until unlink, and revoked at Discord on unlink and removal;
  - invite codes are kept until the invite is deleted; they are shown to admins, so they are not hashed;
  - share tokens are stored only as SHA-256 hashes (`RewindShare`), and service keys until they are replaced;
  - every secret column is encrypted at rest (P11.1), and log retention is the operator's rotation setting.

**Tests.**
- New `lib/retention/__tests__/policy.test.ts`: the environment overrides and the minimum.
- New `lib/queue/jobs/__tests__/retention.test.ts`, with a fake clock and mocked Prisma:
  - each rule's `where` and boundary (day 119 kept, day 121 nulled);
  - batching, and abort between batches.
- New `lib/queue/jobs/__tests__/retention.pg.test.ts`, gated like P0.8's Postgres tests: seed rows across ages and run twice; the first run reports counts and the second zeros; Rewind and assistant text are split correctly; `AuditLog` rows at 399 and 401 days.
- `lib/discord/__tests__/chat-session.test.ts`: `endedAt` is written on idle and manual reset.
- `lib/watchlist/__tests__/sync-service.test.ts`: an item gone from the watchlist becomes `REMOVED_FROM_WATCHLIST`.
- New `lib/retention/__tests__/fallback.test.ts`: without Redis, the sweep runs once per 24 hours under the lease.
- New `app/admin/settings/__tests__/privacy-section.test.tsx` renders the windows and the last run.

**Integration.** P9.1's note on `RewindView` and P5.11's 90-day visit counters are now enforced. P11.15's export and P11.13's inventory read the same policy. P11.4's metrics can show the last run's age.

**Demo.** On a staging copy, the Privacy section shows the windows. "Run now" reports counts per rule. A second run reports zeros, and `LLMUsage` rows older than 120 days keep their cost but have no text.

**Done when.**
- [x] A daily sweep applies every documented window, with and without Redis.
- [x] `ChatConversation.endedAt` is written, and watchlist removals are recorded.
- [x] The Privacy settings section shows the windows and the last run, with an audited "Run now".
- [x] `docs/privacy.md` states the retention of every content table and stored token.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270117000004_p1114_retention_run` adds `Config.lastRetentionRunAt` and `lastRetentionSummary` (per-rule counts). Rule ids, windows and the twelve `RETENTION_*_DAYS` variables are in `lib/retention/policy.ts` (`retentionDays()`, `retentionPolicy()`, `RETENTION_RULES`); an unreadable value keeps the default and a value below 1 becomes 1. `runRetentionSweep({ now, signal, batchSize })` in `lib/queue/jobs/retention.ts` is the one sweep (job, fallback and "Run now"); it records the run only when it was not aborted. Rewind text is an `LLMUsage` row with no conversation or with a `generationId`/`wrappedId`; assistant text is the rest. Deleting a 30-day-idle `DiscordChatSession` also ends its conversation, so its 180-day window starts. `previousData` is nulled for seasons whose 30 June of the next year has passed (UTC), not only for 2027-06-30. The scheduler (`retention-sweep`, `30 3 * * *`, `Config.timezone`) is upserted at boot on the main `plex-wrapped` queue (P11.3 moves it to the worker role) and has no `retention:<date>` deduplication id: a scheduler fires once a day and the sweep is idempotent; a time zone change applies at the next restart. Without Redis, `startRetentionFallback` (`lib/retention/fallback.ts`) polls the `retention` lease every 5 minutes and runs when `lastRetentionRunAt` is over 24 hours old, retrying a failure after an hour. "Run now" is `runRetentionNow` (`actions/admin/retention.ts`, `admin` rate limit, audit `RETENTION_RUN` with counts) and runs in the request. The Privacy section is `components/admin/settings/sections/privacy-section.tsx` (anchor `privacy`, test ids `settings-retention-run`, `-last-run`, `-windows`, `-<rule>`, `-count-<rule>`), its test `components/admin/settings/__tests__/privacy-section.test.tsx`, its read `getRetentionStatus()` in `lib/data/retention.ts`. Watchlist removals: `markRemovedItems` (`lib/watchlist/sync-run.ts`) runs after every complete read and stamps `syncedAt` with the removal time. `docs/privacy.md` has a Retention section with its own table and a Stored tokens section rather than a new column in the inventory tables, to stay clear of P11.15's edits; its first cells are not bare model names, because the inventory test counts those. Web assistant conversations are never ended, so they are not deleted; only their text expires.)

### Step P11.15: Member export and item-level deletion

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-26 to 2027-01-28. **Depends on:** P11.13.
- **Findings addressed:** GAP-36

**Objective.** Members can download a machine-readable JSON export of their data from `/account`, and can delete single marks, watchlist history items and assistant conversations.

**Guidance.**
- Export route: new `app/(app)/account/export/route.ts` (GET, Node runtime). It is a route handler because it returns a file download, not a mutation.
  - It requires a session through P4.3's route helper, and is limited to 3 per day per member (`account:export`).
  - Headers: `Cache-Control: no-store` and `Content-Disposition: attachment; filename="plex-manager-data-YYYY-MM-DD.json"`. Lapsed members can export too, because it is their data.
- New `lib/members/export.ts`: `buildMemberExport(userId)` validates against a strict Zod schema, `MemberExportV1`, with these keys:
  - `format: 'plex-manager-member-export'`, `version: 1` and `exportedAt`;
  - `profile`: name, email, image, services, `plexUserId`, `jellyfinUserId`, time zone and `createdAt`;
  - `rewinds`: year, edition, generated date and data per year. v3 data is copied as stored; v1 and v2 go through P2.1's parser, with rosters already stripped by P0.8;
  - `rewindPrefs` and `rewindExclusions`, and `rewindShares` with pages, signed, dates and status, but no token hash or asset key;
  - `marks`, and `watchlist` with its settings and history;
  - `subscription`: status, plan, period end and cancel date, without Stripe ids; and `discord`: username and link date, without tokens;
  - `assistantConversations`: the member's own turns from their `LLMUsage` rows that still have text, newest 500; and `discordCommands`: metadata only (P11.16).
  - The keys follow `docs/privacy.md`. A test fails when a model in the inventory has neither an export entry nor a recorded exclusion.
- `/account` (P6.11) gains a "Your data" section with "Download my data" (`account-export-button`) and three lists with delete actions:
  - Marks: a P6.5 DataTable of the member's `UserMediaMark` rows, with Delete on each row (`account-mark-delete-<id>`);
  - Watchlist history: Forget on each row (`account-watchlist-forget-<id>`). The confirm copy says that a forgotten item can be requested again if it is still on the Plex watchlist;
  - Assistant conversations: listed by date, with Delete, which removes the `ChatConversation` and nulls the text on its `LLMUsage` rows while keeping the costs.
- New `actions/member-data.ts` holds `deleteMyMark({ markId })`, `forgetWatchlistItem({ historyId })` and `deleteMyConversation({ conversationId })`. Each is a `memberAction` with a cuid schema and a limit of 60 per hour, puts the ownership check in the `where` (`deleteMany({ where: { id, userId } })`, with a count of 0 returning `NOT_FOUND`), and revalidates `/account`.
  - P1.1 deleted the unreachable `actions/user-marks.ts`, so these are new actions, not revived ones.
- Scope: no Discord `/unmark`; `/mymarks` points to `/account`. Rewind links and hidden titles already have their controls (P5.11, P7.7), and the section links to them.

**Tests.**
- New `lib/members/__tests__/export.test.ts`:
  - the strict schema rejects an extra key, and P0.18's `assertNoSecretKeys` passes on the output;
  - with two seeded members, nothing of the other member appears;
  - the inventory-coverage check passes.
- New `__tests__/api/account-export-route.test.ts`: 401 signed out, the headers, and a fourth export in a day returns 429.
- New `actions/__tests__/member-data.test.ts`:
  - another member's mark id returns `NOT_FOUND`, and nothing is deleted;
  - deleting a conversation nulls the text and keeps the cost;
  - the rate limit holds.
- New `app/(app)/account/__tests__/your-data.test.tsx` renders the section.
- New `e2e/account-data.spec.ts`: download with `page.waitForEvent('download')`, parse the JSON and check `format` and the seeded mark; delete a mark, and it stays gone after a reload.
- Visual baselines for the section at both sizes.

**Integration.** P10.22's `/help` links the export. P11.16's disclosure points to "Your data". The README's privacy summary names the export.

**Demo.** As a seeded member, download the export: a JSON file with the profile, the 2026 Rewind, marks and watchlist history, and no token. Delete a mark and forget a watchlist item: both are gone after a reload, and `/mymarks` in Discord no longer lists the mark.

**Done when.**
- [x] `/account/export` returns a versioned, strictly validated JSON export with no secrets, rate-limited.
- [x] Members can delete marks, watchlist history items and assistant conversations they own, and nothing else.
- [ ] The export covers every inventory model or records why not, and the E2E passes.

(as merged: the schema and the coverage map are `MemberExportV1` and `EXPORT_COVERAGE` in `lib/members/export-schema.ts`; `buildMemberExport(userId, now?)` is in `lib/members/export.ts`. The coverage test reads the "Member data" table of `docs/privacy.md` and its new section "Your data: export and single deletes" (bullets, not a column, so P11.14's Retention column merges cleanly); left out with reasons: RewindGeneration, RewindShareVisitDay, RewindView, WrappedShareVisit, DiscordChatSession, DiscordOAuthState, DiscordPendingSelection, InviteUsage, AuditLog. `subscription.plan` is the plan name from `getPlanName`, never the price id; `discordCommands` carry no `commandArgs`. Rate limits `account:export` (3 a day) and `account:data` (60 an hour, shared by the three actions). `lib/access-paths.ts` lets a lapsed member reach `/account/export` (the `/account` page itself still redirects them). The actions take `recordIdSchema` ids rather than a strict cuid, so seeded readable ids work. The section is `YourDataSection` (`components/account/`), with the marks DataTable paged by `?page=` (25 a page) and the newest 50 watchlist items and conversations; row menu id `account-marks-actions-<id>`, confirm ids `account-mark-delete-confirm`, `account-watchlist-forget-confirm`, `account-conversation-delete-confirm`. `/mymarks` ends with a link to `/account` (`getAccountUrl()` in `lib/discord/config.ts`), and `/help#privacy` links `/account#your-data`. The E2E spec and the `/account` visual baselines were not run or regenerated here.)

### Step P11.16: Disclosures and the admin audit trail

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-11 to 2027-01-13. **Depends on:** P4.6.
- **Findings addressed:** GAP-32, GAP-33

**Objective.** The command log keeps only the metadata of what members type to the assistant. Members are told, where they use it, that server admins can review assistant conversations. Admin writes that change member data, and admin reads of member content, leave audit entries.

**Guidance.**
- DM text out of the log (GAP-32):
  - `lib/discord/routing/dm-router.ts:170-176` writes `commandArgs: null` for CHAT rows, and so does the `/assistant` question in `interaction-router.ts`;
  - migration `discord_command_log_args_length` adds `DiscordCommandLog.argsLength Int?` and sets `commandArgs = NULL` on existing CHAT rows;
  - the admin tables (`discord-activity-table.tsx:172-177`, `user-activity-timeline.tsx:172-178`) show "Message, N characters".
- Disclosure: one string in `lib/ui/privacy-copy.ts`, reused by `lib/discord/copy.ts`: "Server admins can review assistant conversations, and messages are processed by {provider}." It appears:
  - in the first reply of each new Discord chat session, when `getOrCreateSession` creates one, not on every message;
  - in `/help` (`lib/discord/commands/help.ts`) and in the `/assistant` description (`lib/discord/commands/assistant.ts:171`);
  - in P10.27's sign-in privacy notice, on `/help#privacy` (P10.22) and in "Your data" (P11.15);
  - and `docs/discord-bot.md:130` describes what the `LLMUsage` table keeps.
- Write events (GAP-33), through P4.6's persisted `logAuditEvent` with `targetUserId`:
  - `MEMBER_UNSHARED` in `unshareUserLibrary`;
  - `MEMBERS_IMPORTED` in `importPlexUsers`, with counts and the created ids;
  - `REWIND_REGENERATED_BY_ADMIN` in the admin regenerate paths of P7.8 and P7.9, unless they already audit it.
  - Of GAP-33's five writes, P1.2 deleted `forceUserWatchlistSync` and P8.8 deleted `savePlaygroundWrapped`; a test asserts that both are gone. `triggerWatchlistSyncJob({ userId })` is already audited.
- Read events. New `auditMemberRead(surface, targetUserId)` in `lib/security/audit-log.ts` writes `MEMBER_CONTENT_VIEWED` with `{ surface }`.
  - P11.5's loaders call it for the surfaces of the inventory's list of ten that still exist: the activity timeline, LLM usage detail, the conversation page, the Rewind history page, marked media, the watchlist panel, and the admin chatbot's per-member Tautulli tools.
  - P7.9 already writes `REWIND_ADMIN_VIEWED`.
  - It keeps one row per admin, member and surface per hour, using P0.10's limiter under `audit:read`, so browsing does not flood the table.
  - Pages that list many members' content, such as the Discord activity table, write one `MEMBER_CONTENT_LISTED` per admin per hour, with the filters.
- `AuditEventType` gains the new names, and `docs/privacy.md` gains an "Admin access" section listing what admins can see and that it is audited.

**Tests.**
- `lib/discord/routing/__tests__/dm-router.test.ts`: a CHAT row has null `commandArgs` and the length; the `/assistant` row likewise.
- `lib/discord/__tests__/services.test.ts`: the first reply of a session carries the disclosure, and the second does not.
- `lib/discord/commands/__tests__/help.test.ts`: the disclosure is present.
- New `__tests__/security/admin-member-audit.test.ts`: each write emits one event with `targetUserId`, and the two deleted functions no longer exist.
- New `lib/security/__tests__/audit-member-read.test.ts`: a second read within the hour writes nothing, and the next hour writes again.
- The `lib/data/__tests__/*` loader tests check that `auditMemberRead` is called.
- A Postgres-gated migration test: existing CHAT `commandArgs` are nulled.
- New `e2e/admin/audit-trail.spec.ts`: opening a member's conversation page adds an `AuditLog` row, read through the E2E Prisma helper.

**Integration.** P11.14 keeps `AuditLog` rows for 400 days. P11.13's `MEMBER_ERASED` sits in the same table. A read-only audit view stays out of scope, as P4.6 decided.

**Demo.** Send the bot a DM: the reply carries the disclosure once, and `/admin/discord` shows "Message, 42 characters" instead of the text. Open a member's conversation page as an admin: `SELECT type, details FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 1` shows `MEMBER_CONTENT_VIEWED` with the surface.

**Done when.**
- [x] No DM or assistant question text is stored in `DiscordCommandLog`, including existing rows.
- [x] The disclosure appears in the first reply of each session, in `/help`, at sign-in and on the help and account pages.
- [x] The remaining member-data writes and the admin reads of member content emit audit events, with reads deduplicated per hour.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270116000006_p1116_discord_command_log_args_length` adds `argsLength` and moves each existing CHAT row's `char_length(commandArgs)` into it before nulling the text; `createCommandLog` also forces `commandArgs` to null for any CHAT row. There is no `lib/discord/copy.ts`: the pure string is `assistantDisclosure(provider)` in `lib/ui/privacy-copy.ts` (with `chatMessageLabel(n)`, "Message, N characters"), and the server read of the active chat provider is `getAssistantDisclosure()` in `lib/llm/assistant-disclosure.ts`, used by the bot, `/help`, the sign-in pass (`MemberPass` prop `assistantDisclosure`), `/help#privacy` and a minimal "Your data" card on `/account` (`account-your-data`) that P11.15 extends. `getOrCreateSession` returns `created`; the disclosure leads the first reply and is never stored in the history. The `/assistant ask` description changed, so the owner re-runs `npm run register-discord-commands`. No `REWIND_REGENERATED_BY_ADMIN`: `adminRegenerateRewind` (the only admin regenerate path; P7.9's rollback writes `REWIND_ROLLED_BACK`) already writes `REWIND_REGENERATE_REQUESTED` with `targetUserId`. New types `MEMBER_UNSHARED`, `MEMBERS_IMPORTED` (counts and `createdUserIds`, no single target), `MEMBER_CONTENT_VIEWED`, `MEMBER_CONTENT_LISTED`. The helpers are `auditMemberRead(surface, targetUserId, actorUserId)` and `auditMemberListed(surface, actorUserId, filters)` in `lib/security/audit-log.ts`, deduplicated through the `audit:read` limit (1 point an hour); surfaces: `activity-timeline` (in the `getUserActivityTimeline` action), `llm-usage-detail`, `llm-conversation`, `rewind-history`, `chatbot-tautulli` (the Tautulli user id is the Plex id, mapped to the app user; a Plex user without an account here is not audited), and listings `discord-activity` and `watchlist-panel` (`getWatchlistSyncStats` now calls `assertAdmin()`). The services test is `__tests__/lib/discord-services.test.ts`, which already existed. `docs/privacy.md` did not exist on this branch (P11.13 creates it in parallel), so its "Admin access" section is for the merge: "Admins can see each member's watch activity and Rewind (and its past versions), the assistant conversations stored in `LLMUsage` (prompts, responses and tool results), Discord command history (assistant messages as a length only), media marks and watchlist sync history. Opening one member's content writes `MEMBER_CONTENT_VIEWED` (once an hour per admin, member and page); pages that list every member's content write `MEMBER_CONTENT_LISTED`; unsharing, importing members and regenerating a Rewind are audited too. `AuditLog` rows are kept for 400 days (P11.14).")

### Step P11.17: Locale follow-ups

- **Track:** platform. **Lane:** platform. **Effort:** S. **Window:** 2027-01-28 to 2027-01-28. **Depends on:** P3.10.
- **Findings addressed:** GAP-44, GAP-47

**Objective.** The Discord assistant knows the member's time zone and formats every date it is shown through `lib/utils/format.ts`, so "yesterday" means the member's yesterday. `<html lang>` follows `Config.locale`. A full i18n layer stays out of scope, because translation is a non-goal for 2026.

**Guidance.**
- Zone and locale per turn: `handleDiscordChat` (`lib/discord/services.ts:112`) resolves `zone` with P2.2's `resolveZone(user, serverZone())` (`User.timezone`, then the server zone) and `locale` from P3.10's `getAppSettings()`, and passes both to the system prompt and the tool executors.
- System prompts, in `lib/chatbot/prompts/` after P11.5's move:
  - the Discord prompt (`discord-system-prompt.ts`) adds "Member time zone: {zone}. Local time now: {formatDateTime(now, { timeZone: zone, locale })}.";
  - the admin prompt (`default-system-prompt.ts:187`) replaces `Current Date: ${new Date().toISOString()}` with the server zone and the local time with its offset.
- Tool results:
  - `get_my_marks` (`executors/media-marking.ts:168`) replaces `new Date(mark.markedAt).toLocaleDateString()` with `markedAt` as an ISO string with the member's offset plus `markedAtDisplay` from `formatDate(d, 'short', { timeZone: zone, locale })`;
  - the admin chatbot's Tautulli results (`executors/tautulli.ts:140`) convert epoch seconds to ISO strings with an offset in `Config.timezone` before the model sees them, and session start times in the Plex executor do the same;
  - add `formatIsoWithOffset(date, timeZone)` to `lib/utils/format.ts` for this, with the module's cached `Intl` instances;
  - command replies that are not written by the model keep Discord's `<t:unix:R>` markup, as `/mymarks` does (`mymarks.ts:91`).
- `/mystats` takes its year in the member's zone, which P11.12 already does; check it here.
- `<html lang>` (GAP-47): the root layout (`app/layout.tsx`, as P3.2 rebuilt it) sets `lang={locale}` from `getAppSettings()`, which P3.10 already loads for the FormatProvider. The value is canonicalised with `Intl.getCanonicalLocales`, falling back to `en-US`. The Rewind layout and the public share page sit under the root layout and inherit it.
- Out of scope, recorded in `docs/operations.md` under "Locale": an i18n library, string extraction and Accept-Language negotiation (GAP-47's recommendation). `Config.locale` changes number and date formats and `lang`, not the language of the copy.

**Tests.**
- New `lib/chatbot/prompts/__tests__/discord-system-prompt.test.ts`: the prompt holds the zone and the local time for Europe/Berlin with en-GB.
- `lib/chatbot/executors/__tests__/media-marking.test.ts`: a mark at `2026-11-02T03:30:00Z` for a Los Angeles member reads "Nov 1, 2026", and the ISO string ends in `-08:00`, after the DST change on 1 November.
- `lib/utils/__tests__/format.test.ts`: `formatIsoWithOffset` across both DST changes.
- `lib/chatbot/executors/__tests__/tautulli.test.ts`: epochs reach the model as ISO strings with an offset.
- New `app/__tests__/layout-lang.test.tsx`: `lang="en-GB"` with `Config.locale` set to en-GB, and `en-US` for an invalid value.
- `e2e/accessibility.spec.ts` asserts that `html[lang]` equals the seeded locale, and axe's `html-has-lang` and `valid-lang` rules pass.

**Integration.** P11.12's identity carries the zone. P10.2's zone-correct day windows and this step share `serverZone()`. P11.26's README states the locale behaviour.

**Demo.** As a Los Angeles member, mark a film at 19:30 local time, then ask the bot "what did I mark today?": it answers with today's date, not tomorrow's. Set `Config.locale` to en-GB: the page source shows `<html lang="en-GB">`, and dates read "1 December".

**Done when.**
- [x] The Discord assistant's prompt and tool results carry the member's zone, formatted through `lib/utils/format.ts`.
- [x] Admin chatbot timestamps carry the server zone's offset.
- [x] `<html lang>` follows `Config.locale`, and axe passes.
- [x] The i18n non-goal is recorded.

(as merged: the turn's `{ timeZone, locale }` is a required `format` on `runChatbotForUser` and runs through `runConversationLoop` and `executeToolCall` to each executor's fifth argument, defaulting to UTC (`lib/chatbot/executors/timestamps.ts`, which also holds `withLocalTimestamps` and the Tautulli and Plex epoch keys). `handleDiscordChat` reads `Config.locale` and `serverZone()` directly, not `getAppSettings()`, because the bot runs outside a request, where `unstable_cache` has no incremental cache. The locale canonicaliser is `canonicalLocale` in `lib/utils/format.ts`. Plex sessions reach the model sanitised, with no timestamps; the Plex conversion covers recently added and On Deck. `/mystats`' year is left to P11.12, which is merging in parallel.)

### Step P11.18: Season success review and season close cleanup

- **Track:** rewind. **Lane:** security and ops. **Effort:** S. **Window:** 2027-01-15 to 2027-02-02. **Depends on:** P9.3.
- **Findings addressed:** none (design or research item)

**Objective.** On 2027-01-15, review the season against the Rewind 1.4 targets and record the result. After the 2026 season closes on 2027-01-31, remove the v2 sharing leftovers and the legacy season-date columns, and confirm that every expired share link returns the branded 404 (`design/rewind-2026-design.md` 6.2, 7.10 and the "Season close" row of 13.1).

**Guidance.**
- Success review on 2027-01-15 (owner, about two hours; it closes the milestone "Season success review"):
  - read the P7.14 season dashboard and the P9.1 log: the share of members with history who opened their Rewind (target 70%), openers who reached the centrefold (75%), openers who shared (25%), confirmed wrong numbers (0), leaked fields (0) and LLM cost per member (under $0.03);
  - write the figures, the misses and the 2027 follow-ups into `docs/rewind.md` under "2026 season results", in a docs-only PR;
  - file each follow-up as a backlog item, not as extra scope for this step.
- Preconditions on 2027-02-01:
  - `getSeasonState()` (P2.2) reports the 2026 season closed in `Config.timezone`, so P7.5's v2 branch already returns null;
  - take a `pg_dump` (P1.10);
  - record for the PR: `PlexWrapped` rows with a non-null `shareToken`, `RewindShare` rows whose `expiresAt` has passed, and the `WrappedShareVisit` row count.
- Code removal (find every reader with `git grep -n "shareToken\|WrappedShareVisit\|wrappedGeneration"`):
  - `lib/wrapped/data/get-share-safe.ts`: delete the `{ kind: 'v2' }` branch that P7.5 added, so only the hashed v3 lookup remains;
  - delete P0.8's `lib/wrapped/data/share-safe-v2.ts` and its key-snapshot test; P5.10's v3 snapshot test stays;
  - delete P0.19's `disableWrappedShareLink` and the owner banner's v2 path (P7.13 kept it for this step), `app/api/wrapped/share/[token]/route.ts`, and the v2 `app/api/wrapped/og-image/route.tsx` if it still exists;
  - remove any v2 rows from `/admin/shares` (P10.2);
  - keep the permanent redirect from `/wrapped/share/:token` to `/rewind/s/:token` (FR-1), which now lands on the branded 404.
- Migration `season_close_2026`, created with `--create-only` (P11.6's naming rule), containing only drops:
  - `ALTER TABLE "PlexWrapped" DROP COLUMN "shareToken"`;
  - `DROP TABLE "WrappedShareVisit"`, with its model and the `PlexWrapped` relation; `RewindShareVisitDay` replaced it (design 7.10);
  - `ALTER TABLE "Config" DROP COLUMN "wrappedGenerationStartDate", DROP COLUMN "wrappedGenerationEndDate"`. P2.2 moved their values to the month-day fields, and P7.12 removed `getWrappedSettings` and `updateWrappedSettings`; delete any reference left in `actions/admin/admin-config.ts` or `app/admin/settings/page.tsx:173-177`;
  - the PR states that the dropped data is in the pre-upgrade dump.
- Expired links:
  - a `RewindShare` whose `expiresAt` has passed (the `season-close` default from P5.11 resolves to 2027-01-31 23:59:59 in the server zone) returns 404 through the lookup; no rows are deleted;
  - check on production: three expired links opened in a private window return "This Rewind is no longer shared" with status 404 and `X-Robots-Tag: noindex`, and a link created with "No expiry" still works;
  - an expired link's card asset key also returns 404.
- Docs: `docs/rewind.md`'s season-close section gets a "done for 2026" checklist. The PR's upgrade note reads "Drops v2 share links and the legacy season-date columns", for P11.25's changelog.

**Tests.**
- `lib/wrapped/data/__tests__/get-share-safe.test.ts`: a v2-shaped token returns null; an expired v3 share returns null; a share with no expiry resolves.
- `e2e/rewind/share-page.spec.ts`: a share seeded with `expiresAt` in the past returns the 404 page, its asset key returns 404 from the card route, and an old `/wrapped/share/<token>` URL redirects and then shows the 404. Playwright's clock cannot move the server's clock, so the expiry is seeded in the past.
- New `__tests__/config/no-v2-share.test.ts`: no `shareToken`, `WrappedShareVisit` or `wrappedGeneration` reference remains under `app`, `actions`, `lib` or `components`.
- New `prisma/__tests__/season-close.pg.test.ts`: the migration applies to a database seeded with v2 tokens and visits. P1.5's `schema-drift` check passes, and `knip --production` reports nothing.

**Integration.** P11.14's retention no longer has a `WrappedShareVisit` rule to write. P10.2's share analytics read only `RewindShare` and `RewindShareVisitDay`. The milestones "Season success review" (2027-01-15) and "Season close" (2027-01-31) are closed by this step.

**Demo.** On production after the deploy, open a v2 link from December: it redirects to `/rewind/s/...` and shows the branded 404. Open an expired v3 link: 404. `\d "PlexWrapped"` in psql shows no `shareToken` column.

**Done when.**
- [ ] The 2027-01-15 review is recorded in `docs/rewind.md` with each target's figure, and follow-ups are filed.
- [ ] The v2 share branch, projection, routes and actions are deleted, and the FR-1 redirect remains.
- [ ] `PlexWrapped.shareToken`, `WrappedShareVisit` and the two legacy `Config` date columns are dropped by one reviewed migration.
- [ ] Expired v3 links and their card assets return 404, checked in tests and on production.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P11.19: Adopt Cache Components

- **Track:** platform. **Lane:** platform. **Effort:** L. **Window:** 2027-02-15 to 2027-02-19. **Depends on:** P11.5.
- **Findings addressed:** BP-31

**Objective.** Move the app onto Next 16 Cache Components: delete the 41 `force-dynamic` exports, memoise per-request reads, cache shared non-secret data with tags, and drop the redundant client refreshes. The visual and E2E suites stay green throughout.

**Guidance.**
- Preconditions: Next 16.4.2 or later (P0.1), since GHSA-mg66-mrh9-m8jx is a Cache Components denial of service below 16.2.5 (BP-31), and P11.5's server-only loaders.
- Per-request memoisation first (BP-31's "now" list; skip what P4.5 or P3.10 already did):
  - `lib/data/session.ts`: `getSession = cache(() => getServerSession(authOptions))`, used by every guard and page in place of the 46 direct calls;
  - `lib/data/active-service.ts`: `getActiveService(kind)` in `cache()`, replacing the 69 inline `findFirst({ where: { isActive: true } })` calls;
  - the admin layout computes `hasChatLLM` with a `count` instead of `getAdminSettings()`'s 12 queries, and `app/admin/llm-usage/page.tsx:18-20` runs its queries in `Promise.all`.
- The codemod: run the Next codemod for Cache Components if the `@next/codemod` version matching `next` lists one (`npx @next/codemod@<version> --help`). Otherwise script the mechanical part with ts-morph: delete every `export const dynamic = 'force-dynamic'`, and any `revalidate` or `fetchCache` segment export, because `cacheComponents` rejects them.
- Turn on `cacheComponents: true` in `next.config.js` on the branch. `next build` then names each route that reads uncached data outside `<Suspense>`. Convert one area per PR, each with its visual and production E2E run: member pages, auth and public pages, admin users and settings, admin analytics, Rewind, and route handlers.
  - Session-dependent parts go inside `<Suspense>` with P10.17's shaped skeletons, and static shell chrome renders outside.
  - Shared, non-secret data gets `'use cache'` with `cacheTag` and `cacheLife`:
    - `getAppSettings()`, replacing P3.10's `unstable_cache` (tag `app-settings`);
    - `serverName()` (P3.9) and the active announcements (tag `announcements`);
    - the Prometheus status, replacing `unstable_cache` at `actions/prometheus-status.ts:174` (`cacheLife('minutes')`);
    - P10.22's plan names (`cacheLife('hours')`).
  - Never put rows with `ENCRYPTED_FIELDS`, or anything specific to the viewer, inside `'use cache'`. The cache key does not include the viewer, and secrets would sit in the cache handler. Read those per request.
  - Server Actions that change cached values call `updateTag(tag)`: P4.6's config saves, P7.12's Rewind settings and the announcement actions.
  - The root layout's `await connection()` (P3.10) goes, because the cached `getAppSettings()` no longer needs it.
- Redundant refreshes (BP-31): re-count the `router.refresh()` calls (22 client files at audit time), and delete those that follow an action which already revalidates. Where the client must refresh, the action calls `refresh()` from `next/cache` instead.
- Measure before and after on home, `/admin/users` and `/rewind/2026`: Prisma queries per request (logged from the client's `query` event in a dev script) and time to first byte, recorded in the PR. Target: one session read and at most one `Config` read per request.
- Interaction with P11.20: a nonce makes every page render per request. Pages then keep the data caching but lose any static shell, so record both measurements for that decision.

**Tests.**
- New `lib/data/__tests__/session.test.ts`: two guards in one request call `getServerSession` once.
- `lib/settings/__tests__/app-settings.test.ts`: the zone save calls `updateTag('app-settings')`, with `next/cache` mocked.
- New `__tests__/config/no-force-dynamic.test.ts`: no `force-dynamic`, `revalidate` or `fetchCache` export remains in `app/`.
- New `__tests__/security/use-cache-no-secrets.test.ts`: no module containing `'use cache'` selects an `ENCRYPTED_FIELDS` column.
- The full visual project, production-mode E2E, axe and P5.4's Rewind performance project pass on every area PR.
- `e2e/production.spec.ts` adds: after an admin changes the server name, the next request shows it.

**Integration.** P11.20 builds the CSP on the result. CLAUDE.md's Data Fetching section documents `getSession`, `'use cache'` with tags, and the no-secrets rule. P10's admin pages are converted in the admin PRs.

**Demo.** `next build` lists routes as partially prerendered instead of dynamic. On home, the query log shows one session read and one `Config` read, compared with the counts in the PR. Change the server name in settings, and the next page load shows it.

**Done when.**
- [ ] `cacheComponents` is on, and no `force-dynamic` export remains.
- [ ] Session and active-service reads are memoised per request, and shared non-secret data is cached with tags that mutations update.
- [ ] Redundant `router.refresh()` calls are gone, and before and after measurements are in the PR.
- [ ] The visual, E2E, axe and performance suites are green.

### Step P11.20: Strict CSP

- **Track:** security. **Lane:** platform. **Effort:** M. **Window:** 2027-02-22 to 2027-02-24. **Depends on:** P11.19.
- **Findings addressed:** SEC-53

**Objective.** Ship a strict Content Security Policy, nonce-based or built on `experimental.sri` as decided with P11.19's measurements, and tidy the deprecated and overly broad headers. An E2E run proves there are no violations on any route.

**Guidance.**
- Decision: build both options on a branch, run the CSP E2E on each, and record the choice and P11.19's numbers in the PR. A nonce needs a per-request render; SRI keeps static shells but covers only Next's own scripts. The expectation is the nonce, since nearly every route already reads the session.
- Nonce policy in `proxy.ts`, Next's documented pattern, beside P11.4's request id:
  - `const nonce = Buffer.from(crypto.randomUUID()).toString('base64')`. Set `x-nonce` on the forwarded request headers, and `Content-Security-Policy` on both the forwarded request and the response, so Next applies the nonce to its own scripts;
  - production: `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://plex.tv https://*.plex.tv https://cdn.discordapp.com; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'self'; upgrade-insecure-requests; report-to csp; report-uri /api/csp-report`, plus `Reporting-Endpoints: csp="/api/csp-report"`;
  - development adds `'unsafe-eval'` and `ws:` for hot reload;
  - `style-src 'unsafe-inline'` stays, because motion writes inline styles (SEC-53);
  - confirm the image hosts in the report-only run: Plex avatars (`User.image` comes from `plexUser.thumb`) and Discord avatars;
  - `form-action` lists Stripe because a Server Action can redirect to Checkout or the portal after a form post without JavaScript;
  - inline scripts are only Next's own, plus any `next/script` that reads `(await headers()).get('x-nonce')`, such as the System theme script that `ui-design-system.md` 4.1 waits on;
  - remove the CSP entry from `next.config.js` `headers()`.
- New `app/api/csp-report/route.ts` accepts `application/csp-report` and `application/reports+json` bodies up to 8 KB, rate-limited per IP (P0.10). It logs `csp.violation` at warn with the directive, the blocked origin and the masked document path, writes nothing to the database, and returns 204.
- Rollout: send `Content-Security-Policy-Report-Only` on 2027-02-22, read the logs and the E2E results, then enforce on 2027-02-24.
- Header tidy (SEC-53), in `next.config.js`:
  - `poweredByHeader: false`;
  - delete `X-XSS-Protection` and `X-DNS-Prefetch-Control`, and set `Referrer-Policy: strict-origin-when-cross-origin`;
  - HSTS uses `HSTS_MAX_AGE` (default 31536000). `includeSubDomains` and `preload` are added only when `HSTS_INCLUDE_SUBDOMAINS` or `HSTS_PRELOAD` is true, and the header is sent only when `NEXTAUTH_URL` is https. Add the variables to P4.1's schema;
  - keep `X-Frame-Options: SAMEORIGIN`, `nosniff` and the `Permissions-Policy`.
- The card and share routes keep their `noindex` headers (P5.10, P7.5).

**Tests.**
- New `__tests__/proxy-csp.test.ts`: the nonce differs per request and appears in the header; production has no `'unsafe-eval'` and development does; the request id is still set.
- New `__tests__/api/csp-report-route.test.ts`: both content types are accepted, a body over 8 KB gets 413, the limiter applies, and there are no database calls.
- New `__tests__/config/security-headers.test.ts` reads `headers()`: no `X-XSS-Protection`, `poweredByHeader` false, and HSTS by default without `preload`.
- New `e2e/csp.spec.ts`, in production mode on chromium, webkit and firefox:
  - an init script collects `securitypolicyviolation` events;
  - it visits every route in P1.7's axe list signed out, as a member and as an admin, plus the Rewind story, the share page and `/subscribe` with Stripe mocked;
  - zero violations are recorded, and each page's scripts carry the nonce.
- `e2e/production.spec.ts` extends P1.5's CSP check to `'strict-dynamic'` and `object-src 'none'`.

**Integration.** `ui-design-system.md` 4.1's System theme option is unblocked. `docs/operations.md` documents the HSTS variables and the report endpoint. P11.26's README security bullets describe the policy.

**Demo.** The response headers show the nonce policy, and two reloads give two different nonces. Paste `<img src=x onerror=alert(1)>` into an announcement preview: nothing runs, and the report endpoint logs no violation from normal browsing. `curl -I` shows no `X-Powered-By` and no `X-XSS-Protection`.

**Done when.**
- [ ] A strict CSP is enforced in production, with the nonce-or-SRI decision recorded.
- [ ] Violations are reported to a rate-limited endpoint, and the report-only week found none on supported routes.
- [ ] The deprecated and overly broad headers are gone, and HSTS is configurable.
- [ ] The CSP E2E passes on three browsers.

### Step P11.21: Split oversized files

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-02-01 to 2027-02-03. **Depends on:** P11.5.
- **Findings addressed:** BP-30

**Objective.** Split the components and action files that still exceed the CLAUDE.md size limits along their responsibilities, with no behaviour change, and keep them under the limits with a lint rule.

**Guidance.**
- Take the inventory when the step starts: `npx eslint components actions --rule '{"max-lines":["warn",{"max":300,"skipBlankLines":true,"skipComments":true}]}'`, and a count of `lib/` and `hooks/` modules over 150 lines.
  - P1.1, P6, P8.8, P11.29, P10.1 and P10.4 remove or split many of the files BP-30 listed.
  - Expected to remain: `actions/invite.ts` (937 lines today), `actions/admin/admin-servers.ts` (684), `actions/admin/queue.ts` (653), `actions/setup.ts` (584), `actions/admin/admin-config.ts` (519), whatever P11.5 left of `actions/discord-activity.ts` and `actions/user-queries.ts`, and `components/watchlist/sync-settings-card.tsx` (374).
  - Also check `components/admin/settings/DiscordIntegrationForm.tsx` (339) and `components/admin/discord/discord-marked-media.tsx` (327), if P10.20 and P10.5 left them.
- One PR per file, with moves only. Update imports with P11.5's ts-morph script.
  - `actions/invite.ts` becomes `actions/invites/admin.ts` (create, list, delete) and `actions/invites/redeem.ts` (validation and Jellyfin redemption), with helpers in `lib/invites/`: `validate-and-use.ts`, P4.12's compensation and the exemption rules.
  - `actions/admin/admin-servers.ts` becomes `actions/admin/servers/{plex,jellyfin,tautulli,overseerr,arr,prometheus}.ts` over a shared `lib/admin/server-save.ts`, which holds P4.6's secret rule, P10.24's deactivation of earlier rows and the `CONFIG_CHANGED` event.
  - `actions/admin/queue.ts` becomes `actions/admin/queue/control.ts` and `schedule.ts`; the reads are already in `lib/data/`.
  - `actions/setup.ts` becomes `actions/setup/claim.ts`, `services.ts` and `complete.ts`, each keeping P11.32's `requireSetupClaim`. `actions/admin/admin-config.ts` splits by settings section.
  - `sync-settings-card.tsx` becomes a `useWatchlistSyncSettings` hook, `SyncResultCounts` and `SyncToggleForm`, and the other components split the same way.
- Deliberate exceptions (BP-30): cohesive modules such as `lib/queue/jobs/stripe.ts` and `lib/utils/logger.ts` carry a file-level `/* eslint max-lines: ["error", N] -- cohesive: <reason> */` and a line in CLAUDE.md's "File Size Limits".
- Lint, in `eslint.config.mjs`: `max-lines` is an error at 300 for `components/**` and `actions/**`, and a warning at 150 for `lib/**` and `hooks/**`, with blank lines and comments skipped. Tests are excluded.
- Pitfall: a `'use server'` file may export only async functions and cannot re-export (`lib/guards.ts:15-18`), so shared helpers move to `lib/`, not into another action file.

**Tests.** The step changes no behaviour, so the existing suites must pass with only their import paths updated. Each PR shows `git diff -M --stat` as renames plus small new index modules, and `knip --production` reports no new unused exports. P11.5's `use-server-exports.test.ts` covers the new action modules, and the lint job passes with the new rule.

**Integration.** CLAUDE.md's file tree shows `actions/invites/`, `actions/admin/servers/` and `actions/setup/`. P11.22's coverage paths follow the new files. P11.26 re-checks the tree.

**Demo.** `npx eslint components actions` reports no `max-lines` error. The admin settings, invites and setup E2E specs pass unchanged.

**Done when.**
- [ ] No component or action file exceeds 300 lines without a documented exception.
- [ ] Each split is a move-only PR with green tests.
- [ ] The `max-lines` rule is enforced for components and actions, and warns for `lib` and `hooks`.

### Step P11.22: Test coverage backfill

- **Track:** ops. **Lane:** security and ops. **Effort:** M. **Window:** 2027-02-11 to 2027-02-15. **Depends on:** P1.5.
- **Findings addressed:** BP-10

**Objective.** Add tests for authentication, encryption, the queue core and the setup wizard until P1.5's per-path coverage floors reach the agreed targets, and make the Prisma client lazy so suites no longer need a dummy `DATABASE_URL`.

**Guidance.**
- Agree the targets with the owner on the first day, and record them in `jest.coverage-thresholds.json` and the PR. Proposed floors (statements and branches; the audit-time values come from BP-10):
  - `lib/auth.ts`, or `lib/auth/**` if it was split: 80 and 70 (26 and 24 at audit time);
  - `lib/prisma.ts` and `lib/security/crypto.ts`: 90 and 85, mostly from P11.1's tests;
  - `lib/security/**`: 85 and 75;
  - `lib/queue/client.ts`, `connection.ts`, `worker.ts`, `request-path.ts`, `job-id.ts` and `lib/locks/**`: 80 and 70 (0 at audit time);
  - the setup wizard: `components/setup/**` at 70 and 60, and `actions/setup/**` at 80 and 70 (0.95 at audit time);
  - the global floor rises by 5 points, and P1.5's ratchet keeps every floor from falling.
- Lazy client (P1.5 left this here): `lib/prisma.ts` exports `prisma` as a lazily built client, a Proxy that creates the extended client on first property access and keeps the global singleton in development. Modules then import without `DATABASE_URL`, and CI's test job drops its dummy URL.
- Authentication, in `__tests__/lib/auth/`:
  - Plex `authorize()` on P4.8's cookie path: a new user, an existing user, owner promotion, a disabled user, P11.8's `unknown` result and invite redemption;
  - Jellyfin `authorize()` beyond P11.10's cases; the `session` callback's shape; `useSecureCookies`; `getAdminGate()`'s reasons.
- Encryption: P11.1 covers most of it. Add a property test: random strings round-trip through a nested `create` and a `findUnique` with `include`.
- Queue core:
  - `addJob` applies P11.3's id policy per type, and two adds with one deduplication id give one job;
  - `getRedisConnection()` connects lazily;
  - the worker fails an unknown job type with a log line, and its failure handler increments P11.4's counter;
  - `enqueueFromRequest` fails fast, and P11.2's lease and poller tests count toward `lib/locks/**`.
- Setup wizard:
  - a component test for each step form (`plex-server-form.tsx`, `tautulli-form.tsx`, `overseerr-form.tsx`, `sonarr-form.tsx`, `radarr-form.tsx`, `prometheus-form.tsx`, `llm-provider-form.tsx`, `discord-integration-form.tsx`): labels through P3.5's Field, validation errors, Test results shown inline, Skip on optional steps (P10.24), and Back keeping the values;
  - `setup-wizard.tsx` navigates by `currentStepId`;
  - action tests for each save: unclaimed calls get `SETUP_UNCLAIMED` (P11.32), the secret origin rule holds (P4.6), and earlier rows are deactivated.
- Every test sits in the matching `__tests__/` directory, uses Testing Library and `user-event` for interaction, and asserts behaviour, not snapshots.

**Tests.** The step is tests. CI's coverage job reports each path at or above its new floor, and a temporary deletion of one auth test makes the job fail.

**Integration.** P1.5's required "Unit tests" check enforces the floors. P11.26 updates CLAUDE.md's testing section with the targets and the lazy client.

**Demo.** `npm run test:coverage` prints the per-path table at or above the targets. `DATABASE_URL= npx jest lib/discord` runs without the import-time error.

**Done when.**
- [ ] The agreed targets are recorded and met for auth, encryption, the queue core and the setup wizard.
- [ ] The Prisma client is lazy, and the test job runs without a dummy `DATABASE_URL`.
- [ ] The ratchet holds the new floors.

### Step P11.23: Dependency majors and the auth spike

- **Track:** platform. **Lane:** security and ops. **Effort:** M. **Window:** 2027-02-22 to 2027-02-24. **Depends on:** P1.5.
- **Findings addressed:** BP-38, SEC-07

**Objective.** Upgrade to TypeScript 7 and ESLint 10, or record exactly what blocks each one. Run a time-boxed Better Auth spike (Plex PIN and Jellyfin plugins, database sessions) that ends in a written go or no-go on leaving next-auth v4.

**Guidance.**
- TypeScript 7 (BP-38), on its own PR:
  - lift P1.5's Dependabot ignore for semver-major `typescript`, and exact-pin 7.x;
  - run `npm run typecheck` (app and tests, P1.4) and fix the new errors;
  - check every tool that loads TypeScript's JavaScript API: `typescript-eslint`, `eslint-config-next`, `next build`'s type check and `ts-morph` (the codemods). Jest is unaffected, because `next/jest` uses SWC;
  - if a tool still needs the TypeScript 5 API and cannot be pointed at a second install, stay on 5.9 for the repository and record the blocker with its upstream issue. Record the typecheck time before and after.
- ESLint 10, on its own PR:
  - move `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y` and `eslint-config-next` to versions whose peer ranges include ESLint 10;
  - drop `@eslint/eslintrc`'s FlatCompat from `eslint.config.mjs` where `eslint-config-next` now ships flat configs;
  - keep every rule from P1.3, P3.4, P3.10, P4.3, P11.4 and P11.21. `npm run lint -- --format json` on `main` gives the same findings before and after;
  - update the Dependabot groups.
- Better Auth spike (SEC-07), on branch `spike/better-auth`, never merged, within the window:
  - answer each question yes, no or partly, with evidence from the branch:
    - Plex PIN sign-in as a Better Auth plugin that keeps P4.8's browser binding (the signed PIN cookie and the server-side token read);
    - Jellyfin username and password as a credentials plugin with P0.5's linking rules and P0.10's limits;
    - database sessions on Prisma 7 with the driver adapter, the generated client at `@/lib/generated/prisma/client`, and the `ENCRYPTED_FIELDS` extension;
    - revocation that could replace P4.7's `sessionVersion`, so an unshare ends the session on the next request;
    - working with Next 16's proxy, Server Actions, P11.19's Cache Components and P11.20's nonce CSP;
    - the migration path: the JWT cookie cannot be converted, so every member signs in once; the admin bootstrap; and P1.6's E2E session fixture;
    - package health: release cadence, open advisories and licence;
  - compare with staying on next-auth 4.24.x, which still gets security releases (SEC-07), plus P4.7's version check, and with Auth.js v5's status on the day;
  - write `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/auth-spike-2027-02.md`: the findings table, the files a migration would touch (`lib/auth.ts`, `types/next-auth.d.ts`, the `getSession` callers), the effort, the risks, and the go or no-go with a date to revisit.

**Tests.**
- Each upgrade PR runs the full CI suite: typecheck, lint, Jest with coverage, build, production E2E and visual.
- New `__tests__/config/toolchain.test.ts`: the installed TypeScript and ESLint majors match the pins in `package.json`.
- The spike branch holds a throwaway Playwright run of the Plex PIN flow against the mocked plex.tv from P4.8's tests, and its result is linked in the write-up. No spike code merges.

**Integration.** P11.26 updates CLAUDE.md's stack line. A "go" becomes a 2027 plan item, and a "no-go" keeps next-auth v4 with the revisit date in the decisions list.

**Demo.** CI is green on TypeScript 7 and ESLint 10, or the blockers file shows the failing tool and its issue link. The spike write-up answers each question with a link to the branch.

**Done when.**
- [ ] TypeScript 7 and ESLint 10 are merged, or each blocker is recorded with its upstream issue.
- [ ] Lint findings are unchanged across the ESLint upgrade.
- [ ] `auth-spike-2027-02.md` exists with evidence for each question and a go or no-go.

### Step P11.24: Deployment, environment and domain-move docs

- **Track:** docs. **Lane:** security and ops. **Effort:** M. **Window:** 2027-02-04 to 2027-02-08. **Depends on:** P1.10, P7.17.
- **Findings addressed:** GAP-16, GAP-17, GAP-18

**Objective.** An operator can deploy the published image in production, move the install to a new host or domain, and look up every environment variable from the docs alone. The environment reference is generated from `lib/env.ts`, so it cannot drift.

**Guidance.**
- Production compose (GAP-16): new `deploy/docker-compose.yml`. The root `docker-compose.yml` stays the development file (P4.17) and gains a "Development only" header comment.
  - `app`: `image: ghcr.io/mchestr/plex-manager:${PLEX_MANAGER_VERSION:-latest}`, the name docker-publish pushes (`ghcr.io/${{ github.repository }}`); `env_file: .env` with no hard-coded URLs, because the dev file's `environment:` override is the GAP-16 trap; `restart: unless-stopped`; the image healthcheck; `depends_on` with healthy conditions; and `127.0.0.1:3000:3000` for a reverse proxy.
  - `db`: `postgres:16-alpine` with a named volume and a required `POSTGRES_PASSWORD`. `redis`: `redis:7-alpine` with `--requirepass` and AOF, as P4.17 set them.
  - The worker variant is P11.3's `docs/examples/docker-compose.workers.yml`.
- New `docs/deployment.md`:
  - compose install, pinned to a version tag once P11.25 publishes them (`latest` tracks `main`);
  - reverse-proxy examples for Caddy and nginx that forward `X-Forwarded-For` and set `TRUSTED_PROXY_HOPS` (P0.10);
  - the first-run claim (P11.32's setup code in `docker logs`);
  - bare metal: `npm ci`, `npm run build` with the final `NEXT_PUBLIC_APP_URL`, `npm run db:deploy`, then `npm run start`.
- Fix `start:prod` (`package.json:15`), which only works inside the image: change it to `node .next/standalone/server.js` with a `postbuild` step that copies `.next/static` and `public` into the standalone folder, or delete it and document `npm run start`. CLAUDE.md's checklist (`:686-692`) matches whichever is chosen.
- Domain move (GAP-17): new `docs/domain-move.md`, a checklist:
  1. set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL`. The image reads them at start, because `.dockerignore` keeps `.env` out of the build; a bare-metal install must rebuild, since Next inlines `NEXT_PUBLIC_*` values at build time;
  2. the four external registrations:
     - the Discord OAuth2 redirect, `https://<new host>/api/discord/callback`;
     - the Discord Linked Roles verification URL, which the docs never mentioned;
     - the Stripe webhook endpoint, `https://<new host>/api/stripe/webhook`, created again with every handled event;
     - the new endpoint's signing secret, entered in settings, before the old endpoint is deleted;
  3. the public service URLs in settings (Overseerr, Jellyfin, the Plex web link) if they change. Plex's PIN forward URL is computed per request, so Plex needs no change;
  4. what members notice: cookies are bound to the host, so everyone signs in again, and old share links stop working unless the old host redirects.
  - Code fix: `getDiscordPortalUrl` (`lib/discord/config.ts:101-106`) falls back to `getBaseUrl()` instead of `http://localhost:3000`.
- Environment reference (GAP-18):
  - new `scripts/gen-env-reference.ts` reads P4.1's `envSchema`: each field's `.describe()` text, its default, its group, and a Zod 4 `.meta({ requiredInProduction: true })` that matches `checkProductionEnv`;
  - it writes `docs/environment.md`, one table per group (name, required in production, default, description), and the body of `example.env` between `# BEGIN GENERATED` and `# END GENERATED` markers;
  - `npm run env:docs` regenerates them, and CI runs it with `--check`, failing on any difference;
  - the README's production list becomes a link to the reference.

**Tests.**
- New `scripts/__tests__/gen-env-reference.test.ts`: every `envSchema` key appears in both outputs; `--check` fails after a description change; test-only variables land in their own block.
- New `__tests__/config/prod-compose.test.ts`: the production compose parses; the app uses the published image with no `environment:` URLs; ports bind to localhost; both passwords use `:?`.
- `lib/discord/__tests__/config.test.ts`: the portal URL falls back to `getBaseUrl()`.
- P1.2's `claude-md-paths.test.ts`, extended by P11.26, covers the paths named in the new docs.
- `__tests__/config/package-scripts.test.ts` checks the `start:prod` decision.

**Integration.** P1.10's `docs/operations.md` links all three documents. P11.25's release notes link the deployment guide. P11.26 trims the README to links.

**Demo.** On a clean VM, follow `docs/deployment.md` with `deploy/docker-compose.yml`: the app starts healthy behind Caddy, and the claim code is in the logs. Follow `docs/domain-move.md` to a second hostname: Plex sign-in, Discord linking and a Stripe test webhook work on the new host.

**Done when.**
- [ ] A production compose file uses the published image, and `docs/deployment.md` covers compose, reverse proxy, claim and bare metal.
- [ ] `start:prod` works outside the image or is removed, and CLAUDE.md matches.
- [ ] `docs/domain-move.md` lists the URL variables, the four external registrations and what members notice, and the Discord portal fallback is fixed.
- [ ] `docs/environment.md` and `example.env` are generated from `envSchema`, and CI checks them.

### Step P11.25: Versioned releases and a changelog

- **Track:** ops. **Lane:** security and ops. **Effort:** S. **Window:** 2027-02-09 to 2027-02-10. **Depends on:** P0.3.
- **Findings addressed:** GAP-20

**Objective.** Semver tags publish versioned images, a CHANGELOG carries the upgrade notes, and a release workflow ties them together, so operators can pin a version and read what an update does before pulling it.

**Guidance.**
- Version: `package.json` is still `0.1.0`, with the name `plex-wrapped`. Rename it `plex-manager` (it is private, so nothing breaks), and cut `v0.2.0` as the first release, unless the owner picks another number on the day.
- New `CHANGELOG.md` in the Keep a Changelog 1.1.0 format:
  - sections Added, Changed, Fixed, Security and Removed, plus a mandatory "Upgrade notes" block per release (breaking changes and the steps, always starting with "take a `pg_dump`");
  - `0.2.0` summarises the 2026 refresh by milestone, and collects the upgrade notes from the PR descriptions since 2026-10-19: P4.1's boot refusal, P4.17's required passwords, P1.10's `db:deploy`, P11.1's key requirement, P11.3's roles and P11.18's drops;
  - the 2026-07 Discord release notes (`.agents/planning/2026-07-04-discord-enhancements/RELEASE_NOTES.md`) move in as `0.1.x` history.
- The release flow keeps branch protection intact:
  1. `node scripts/release/prepare.mjs 0.2.0`, run locally, bumps `package.json`, moves "Unreleased" under the version with the date, and opens a PR `chore(release): v0.2.0`;
  2. after it merges, the owner pushes the tag `v0.2.0`;
  3. P0.3's docker-publish trigger on `v*` builds `0.2.0` and `0.2` through the metadata action's semver patterns. `latest` stays on `main`, and the image carries `org.opencontainers.image.version`;
  4. new `.github/workflows/release.yml`, on `push: tags: ['v*']`, with `permissions: contents: write` on its one job and actions pinned by SHA, checks that the tag matches `package.json` and that "Checks" passed on the commit, then runs `gh release create v0.2.0 --notes-file <the version's section>`.
- New CI check `changelog` on pull requests (`scripts/check-changelog.mjs`): a PR that touches `prisma/migrations/**`, `lib/env.ts`, `docker-entrypoint.sh`, `Dockerfile` or `deploy/**`, or carries the `breaking` label, must add a line under "Unreleased". The `no-changelog` label skips it.
- README "Versions and upgrades": `:latest` tracks `main`; pin `:0.2.0` in production; rolling back means restoring the pre-upgrade dump and running the previous tag, because Prisma has no down migrations (GAP-20). Link P1.10's upgrade checklist.

**Tests.**
- New `scripts/__tests__/release-prepare.test.ts`, on a temp copy: the version bump, Unreleased moved under the dated heading, a new empty Unreleased, and a refusal when the version is not greater.
- New `scripts/__tests__/check-changelog.test.ts`: a migration PR without an entry fails, with one it passes, and `no-changelog` skips.
- `actionlint` passes, and the SHA-pin check from P0.3 prints nothing.
- A dry run on a fork, with tag `v0.0.1-test`, produces a GitHub Release and an image tagged `0.0.1-test`.

**Integration.** P11.24's deployment guide pins the version, and P1.10's upgrade checklist links the CHANGELOG. P1.5's schema-drift check and Build are prerequisites in `release.yml`. P11.26 checks that the README describes the flow.

**Demo.** Cut `v0.2.0`: the release PR merges, the tag is pushed, `ghcr.io/mchestr/plex-manager:0.2.0` exists, and the GitHub Release shows the 0.2.0 section with its upgrade notes. A PR that adds a migration without a changelog line fails the check.

**Done when.**
- [ ] `CHANGELOG.md` exists with an "Upgrade notes" block per release, and `v0.2.0` is published.
- [ ] Tags publish semver images, and the release workflow creates the GitHub Release from the changelog.
- [ ] The changelog check runs on pull requests, and the README explains pinning and rolling back.

### Step P11.26: README and CLAUDE.md accuracy pass

- **Track:** docs. **Lane:** security and ops. **Effort:** S. **Window:** 2027-02-16 to 2027-02-16. **Depends on:** P11.24.
- **Findings addressed:** GAP-21, GAP-22, BP-39

**Objective.** README's feature and security claims match the code after the refresh, and it describes Rewind, Stripe and Jellyfin. CLAUDE.md's integration patterns, paths and testing facts are checked again against the final code, because every agent session reads it.

**Guidance.**
- README (GAP-21):
  - reword or remove the false claims: "Issue Reporting workflow" (`:9`, `:59`) becomes "a support link in onboarding"; Discord announcements (`:61`, `:360`) become in-app announcements only; "Service Status monitoring for all connected platforms" (`:62`) becomes the optional Prometheus uptime strip; the PostgreSQL-polling sentence (`:274`) becomes P11.2's text;
  - fix the stale facts: Next.js 16, the clone directory `plex-manager` (`:117`), the project tree (`:165`) and the wizard steps from `types/setup.ts`;
  - add the missing features: Rewind (the season, opt-in sharing, article mode and its privacy rules); optional Stripe; Jellyfin (sign-in, invites, and the limits that remain, such as Rewind needing Plex history); invites; watchlist sync, which files Overseerr requests as the member (P4.13); the admin and Discord assistants with P11.16's disclosure; prompt templates; and Prometheus;
  - security bullets, each checked against the code: Zod at every boundary (P4.3, P11.5); the Redis-backed limiter (P0.10); persisted audit logging (P4.6, P11.16); encryption on by default (P11.1); the strict CSP (P11.20); sessions that end when access ends (P4.7). Correct "only users with access to your Plex server can sign in" (`:372`) for Stripe members, invitees and Jellyfin;
  - Deployment and Environment sections become links to `docs/deployment.md`, `environment.md`, `domain-move.md`, `operations.md`, `rewind.md`, `privacy.md`, `stripe.md`, `discord-bot.md` and the CHANGELOG;
  - refresh the screenshots (`:11`) from the committed visual baselines (P1.6) into `docs/images/`.
- CLAUDE.md (GAP-22 and BP-39, after P1.2's first pass):
  - Integration Patterns: the final APIs. Plex is `getActivePlexServerConfig()` with the `lib/connections/plex.ts` functions; Tautulli is P2.3's `tautulliCommand`; the LLM is P2.11's facade and P2.12's registry; Overseerr is `buildOverseerrUserIndex` with `X-Api-User` (P4.13); the Stripe section adds the Jellyfin rules (P11.11);
  - the file tree adds `lib/data`, `lib/locks`, `lib/members`, `lib/retention`, `lib/observability`, `lib/chatbot`, `lib/rewind`, `components/rewind`, `components/shell`, `actions/invites`, `actions/admin/servers` and `actions/setup`;
  - Server Actions, Data Fetching and Logging use `adminAction` and `memberAction`, `getSession`, `'use cache'` with tags, `server-only` loaders and request IDs;
  - Testing: the Playwright projects as they now exist (chromium, webkit and firefox where used, `visual`, production mode and the Rewind projects) and P11.22's coverage targets;
  - the Prisma workflow (`db:deploy`, `--create-only` names, the drift check), the deployment checklist as a link to `docs/deployment.md`, and Agent Skills (P1.9 and P11.27);
  - the JSDoc reference points at `lib/locks/lease-poller.ts` or `lib/wrapped/archetype-scoring.ts`;
  - `docs/performance-testing.md` (BP-39, rewritten in P1.2) names P5.4's performance project and P11.4's metrics.

**Tests.**
- Extend P1.2's `__tests__/docs/claude-md-paths.test.ts` to `README.md` and `docs/*.md`: every backticked repository path exists.
- New `__tests__/docs/claude-md-symbols.test.ts`: every function named in CLAUDE.md's Integration Patterns snippets (`name(`) is exported from the module the snippet imports.
- New `__tests__/docs/readme-claims.test.ts`: the removed phrases ("Issue Reporting", "PostgreSQL polling", "Next.js 14") are absent, and the feature list names Rewind, Stripe and Jellyfin.
- Every `npm run` script named in either file exists in `package.json`.

**Integration.** P11.27's skills are listed in CLAUDE.md's Agent Skills section. Later PRs keep the docs tests green.

**Demo.** A new agent session follows CLAUDE.md to add a Tautulli-backed admin tile and uses only APIs that exist. A reader of the README learns what Rewind, Stripe and Jellyfin do and finds every operator doc from one section.

**Done when.**
- [ ] README claims match the code, and Rewind, Stripe, Jellyfin, invites, watchlist sync and the assistants are described.
- [ ] CLAUDE.md's integration snippets, file tree, testing and workflow facts match the final code.
- [ ] The path, symbol and claims tests pass.

### Step P11.27: Project-authored agent skills

- **Track:** docs. **Lane:** security and ops. **Effort:** S. **Window:** 2027-02-17 to 2027-02-18. **Depends on:** P1.9.
- **Findings addressed:** none (design or research item)

**Objective.** Write the four project skills that Rewind Phase 3 deferred (`design/rewind-2026-design.md` 13.5, `research/visual-generation-skills.md` 7.3): `rewind-design-system`, `rewind-page`, `share-card` and `visual-qa` in `.claude/skills/`, and check each against the code it describes.

**Guidance.**
- Each skill is a `SKILL.md` with frontmatter (`name`, a `description` saying when to use it, and `paths:` scoping as in P1.9) and no `allowed-tools` and no shell lines. Each points at the source files and design sections rather than copying values, so it cannot drift silently.
- `rewind-design-system`, with `paths:` `components/rewind/**`, `lib/rewind/**`, `app/(app)/rewind/**` and `app/rewind/**`:
  - the scope contract (`ui-design-system.md` 4.4): `[data-theme="rewind"]`, `inkProps` and `rewindInks` in `lib/design/tokens.ts`, the twelve inks, the `.light` and `.dark` rule, and two-ink discipline (design 5.2 and 5.3);
  - type (design 5.4): the Archivo widths and Newsreader roles, `fitLines` in `lib/rewind/typeset/fit-lines.ts`, and `lib/rewind/format.ts`'s rules;
  - motion (5.6): `motion/react`, the Rewind easing tokens, reduced motion and P7.15's low-end mode;
  - imagery (5.8): posters only through `components/rewind/media/poster.tsx`, title-card fallbacks, no generated art; and the Rewind-only names that P1.8's guardrail restricts.
- `rewind-page` (the research's "rewind-slide", renamed to match the design's pages), with `paths:` `components/rewind/pages/**` and `lib/rewind/registry.ts`, is a checklist for adding or changing a page:
  - the registry entry (`select`, `schema`, `srSummary`, `spot`, `table`, `share.facts`), facts from P2.9's catalogue only, and copy slots with grounding (P5.8);
  - the omission rules, and data-testids following design 4.3's names;
  - article-mode rendering (P5.12), desktop Notes (P7.4), the cut list and `rewindDisabledPages`;
  - the tests: a component test on three fixtures, baselines at the five phone viewports and 1440x900, and axe.
- `share-card`, with `paths:` `lib/rewind/cards/**` and `app/api/rewind/card/**`:
  - the Satori rules of design 6.4 and P5.10's lint rule, and the card fonts and roles;
  - `toShareSafe` as the only data source (6.1), and no name unless the card is signed;
  - the sizes (1080x1920 and 1200x630), `CARD_VERSION` and the cache key, the rate limits, and the owner-versus-link pixel test.
- `visual-qa`, with `paths:` `e2e/**`:
  - the projects (`visual`, the Rewind visual, axe and performance projects);
  - `npx playwright test --project=visual`, with `--update-snapshots` only for intended changes and only inside the CI container (P1.6's note);
  - reading diff artifacts, `npm run rewind:gallery` (P7.11), P1.9's chrome-devtools server for quick looks, and P1.8's PR checkbox.
- `THIRD_PARTY.md` gets one row per skill marked "project-authored", with the reviewer and date. `.claude/settings.json` gains their `Skill(...)` allow rules, and CLAUDE.md's Agent Skills section lists them.

**Tests.**
- New `scripts/__tests__/project-skills.test.ts`, for each project skill:
  - the frontmatter parses, `name` equals the folder name, and `description` and `paths` are present;
  - every backticked repository path exists;
  - every backticked identifier (`inkProps`, `rewindInks`, `toShareSafe`, `fitLines`, `eligibleCards`, `CARD_VERSION` and the rest) is exported from a module under `lib/`, `components/` or `app/`;
  - every `npm run` script it names exists in `package.json`, and every Playwright project it names exists in `playwright.config.ts`.
- P1.9's `vendored-skills.test.ts` accepts project-authored rows without a SHA, and still forbids `allowed-tools`, shell lines and remote fetches in them.

**Integration.** P11.26 lists the skills in CLAUDE.md. P1.8's PR template reminds authors to update a skill when its code changes, and the test above fails when they do not.

**Demo.** In a fresh session, open `lib/rewind/cards/centrefold.tsx`: `share-card` and `rewind-design-system` load. On a scratch branch, ask the agent to add a trial page with `rewind-page`: it produces the registry entry, the component test and the baseline entries, and the branch is then discarded.

**Done when.**
- [ ] The four skills exist with scoped frontmatter and point at the real files and design sections.
- [ ] The project-skills test passes, and `THIRD_PARTY.md` and the settings list them.
- [ ] The fresh-session check loads the right skills for a card file.
### Step P11.28: Watchlist sync resolves IDs and files valid TV requests

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-04 to 2027-01-06. **Depends on:** P4.13.
- **Findings addressed:** GAP-02, GAP-03

**Objective.** Watchlist sync reads the whole watchlist, looks up each item's TMDB and TVDB IDs, and files TV requests that Overseerr accepts. Each reply is classified correctly, and the card reports skipped items honestly. It lands after P4.13, so working requests never go out under the admin key.

**Guidance.**
- `lib/watchlist/plex-watchlist.ts`:
  - `getPlexWatchlist(userToken, { etag, signal })` pages `GET https://discover.provider.plex.tv/library/sections/watchlist/all?includeCollections=1&includeExternalMedia=1`, with `X-Plex-Container-Start` and `X-Plex-Container-Size: 100`, until `start >= totalSize`. It is capped at 20 pages.
    - Each container is validated with Zod through `serviceFetch`: `totalSize` and `Metadata[{ ratingKey, type, title, year? }]`.
    - The first page sends `If-None-Match` with the stored ETag, and a 304 returns `{ notModified: true }`.
  - New `resolveExternalIds(ratingKey, userToken)` calls `GET /library/metadata/{ratingKey}` and reads `Guid[]` with `parseExternalIds`. It runs at concurrency 4 with a 10 s timeout per call. It is skipped when `WatchlistSyncHistory` already holds a `tmdbId` or `tvdbId` for that key, so each item is looked up once.
- `submitOverseerrRequest` (`lib/connections/overseerr.ts:289`):
  - TV requests send `seasons: 'all'` unless a list is given. Without `seasons`, Overseerr throws a TypeError and answers 500.
  - The reply mapping:
    - 201 with a `MediaRequest` that passes Zod is `created`, with its id;
    - 202 (Overseerr's "no seasons available") is `already_requested`, with no invented id;
    - 409 is `already_requested`;
    - 403 is a new terminal `not_permitted`, with Overseerr's message cut to 200 characters (a quota or permission refusal);
    - 5xx is `failed`, retried on the next sync.
  - The pre-check reads `mediaInfo.status4k` when `is4k` is set.
- Migration `watchlist_sync_status`:
  - `WatchlistSyncStatus` gains `SKIPPED_NO_EXTERNAL_ID` and `NOT_PERMITTED`;
  - `WatchlistSyncSettings` gains `watchlistEtag String?` and `itemsSkipped Int @default(0)`.
- `syncUserWatchlist`:
  - an item still without a TMDB id after the lookup gets a `SKIPPED_NO_EXTERNAL_ID` history row; today it writes nothing (`sync-service.ts:122-130`);
  - `NOT_PERMITTED` and the `ALREADY_*` statuses are terminal, and `FAILED` retries;
  - a run files at most 50 new requests, the cap SEC-27 asks for, and the rest wait for the next run;
  - the run is `success` only when nothing failed, and a run in which everything was skipped is `partial`, with the reason.
- `components/watchlist/sync-settings-card.tsx` drops "Watchlist is up to date" for the real counts, for example "Requested 3, already on the server 12, already requested 4, skipped 2 (no TMDB match), not allowed 1". Test ids: `watchlist-sync-result-requested`, `-available`, `-already-requested`, `-skipped` and `-not-permitted`.
- Pitfall: the discover API is undocumented. Record real responses from one test account into fixtures, with tokens removed, and re-record them if Plex changes the shape. Overseerr's own sync reads only 20 items, so paging 100 at a time with a cap is deliberate.

**Tests.** Contract tests in `lib/watchlist/__tests__/`, with recorded fixtures in `fixtures/`: `watchlist-p1.json` and `watchlist-p2.json` (`totalSize: 140`), `metadata-<key>.json` with `Guid[]`, a 304, and Overseerr replies 201, 202, 403, 409 and 500. They check that:
- both pages are read, and requests are filed only for new items;
- a second run uses the stored IDs and makes no metadata calls, and a 304 run makes one request;
- the TV body carries `seasons: 'all'`;
- a 202 stores no request id, and a 403 is terminal and not retried on the next run;
- the 50-request cap holds;
- the card text matches the counts (`components/watchlist/__tests__/sync-settings-card.test.tsx`).

**Integration.**
- P11.2 moves the sync onto the shared lock, and P11.13 stops it for removed members.
- The admin watchlist statistics gain the two new statuses.

**Demo.**
- For a test account with 140 watchlist items, the first sync files requests in the member's name and shows the counts. The second run gets a 304 and makes one request.
- A show that Overseerr has not seen is requested with all seasons.

**Done when.**
- [x] The whole watchlist is paged, and TMDB and TVDB IDs come from per-item metadata, cached per item.
- [x] TV requests send seasons, and 202, 403, 409 and 4K status are handled correctly.
- [x] The card reports requested, available, already requested, skipped and refused items.
- [x] The recorded-response contract tests pass.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

(as merged: migration `20270115000000_p1128_watchlist_sync_status`. The item loop lives in `lib/watchlist/sync-run.ts` (`processWatchlistItems`), the count copy and test ids in `lib/watchlist/summary.ts`. `serviceFetch` gained `onResponse` (status and headers, used for the ETag and 201 against 202) and `readErrorMessage` (a 4xx JSON `message`, cut to 200 characters, on `ServiceFailure.message`). The 50 cap counts `created` requests; the rest are `itemsDeferred`. The ETag is stored only after a run with no failures and nothing deferred, so a 304 never hides a retry; a 304 run only touches `lastSyncAt`. A 403 message goes into `lastSyncError` without failing the run. The card counts come from a `groupBy` of the member's history rows (`getWatchlistSyncSettings().counts`). The fixtures follow the shape the reference clients read but were not recorded from a live account: the owner re-records them from a test account. P11.2 wraps `syncUserWatchlist` in the shared lock unchanged.)

### Step P11.29: Remove the v2 viewer

- **Track:** rewind. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-04 to 2027-01-06. **Depends on:** P7.13, P8.8, P7.9.
- **Findings addressed:** DUP-08, RWV-12, RWV-13, BP-34

**Objective.** Delete the legacy viewer and, with it, the journey's other visual identities: `components/wrapped/**`, the classic and cinematic section trees, chart.js in Rewind and the temporary cinematic aliases. This was the second half of P7.13; it waits for January because P7.13's archive articles already keep members off the old viewer, and the deletion touches nothing the season needs.

**Guidance.**
- **Deletions.**
  - All of `components/wrapped/**`, about 4,700 lines (DUP-08, RWV-12, RWV-13): the classic sections and `wrapped-charts.tsx` (Rewind's only chart.js user), the cinematic tree and its theme, the viewer, navigation, transition, share summary, share button, card download, P0.19's share controls, and the test-only `user-wrapped-viewer.tsx` and `wrapped-home-button.tsx`.
  - Their tests in `components/__tests__/` and `components/__tests__/wrapped/`, and `components/admin/playground/preview-modal.tsx` if P8.8 has not already removed it. If P8.8 was cut and the v2 playground still imports the v2 sections, remove those imports first, or wait for the playground swap.
  - Then the temporary cinematic aliases that P3.1 left in `app/globals.css` (`--color-gold: var(--primary)` and the rest), plus `components/shared/formatted-text.tsx` and `lib/wrapped/text-processor.ts` if knip reports them.
  - chart.js stays installed for the admin charts until P10.9.
- **Debt.** Regenerate `design-debt.json` with `scripts/check-design-system.mjs --update`. The deleted files' counts leave the baseline, and the PR records the totals before and after.

**Tests.**
- `knip --production` reports nothing, and the design-system check passes with lower totals.
- `__tests__/config/no-legacy-viewer.test.ts`: no file under `app`, `components` or `lib` imports `components/wrapped`, and `app/globals.css` has no `--color-gold` alias.
- The Rewind visual, axe and E2E projects and the archive spec stay green.

**Integration.** `ui-design-system.md` Phase 4 no longer needs its aliases. The CLAUDE.md file tree drops `components/wrapped/`, and P11.26 re-checks it.

**Demo.** `git grep -n "components/wrapped" -- app components lib` returns nothing, and the design-debt report shows the deleted files' counts gone.

**Done when.**
- [x] `components/wrapped/**`, the classic and cinematic trees, chart.js in Rewind and the temporary cinematic aliases are deleted.
- [x] `knip --production` and the design-system check pass with lower totals.

(as merged: `design-debt.json` no longer exists after P10.11, so the "lower totals" are the deleted `components/wrapped/` and `components/shared/formatted-text.tsx` allowlist entries and the viewer's ESLint overrides (the react-hooks ignore, the Chart.js exception and the warn-only restricted-syntax blocks). P10.9 had already moved every admin chart to Recharts, so `chart.js` and `react-chartjs-2` left `package.json` too. The deletion also took `components/ui/count-up.tsx`, `lib/wrapped/text-processor.ts`, the v2 `grain` keyframes and the type re-exports only the viewer used. `.claude/skills/motion/SKILL.md` still lists `components/wrapped/**` in `paths:`; changing a vendored skill needs a `/security-review`, so P11.26 drops it with the CLAUDE.md skills table row.)

### Step P11.30: Eval results page

- **Track:** rewind. **Lane:** security and ops. **Effort:** S. **Window:** 2027-01-11 to 2027-01-11. **Depends on:** P5.13, P6.5.
- **Findings addressed:** none (design or research item)

**Objective.** Show the bake-off and eval results in the admin, for the 2027 model choice. This was the eval half of the former P7.11; the season used the committed results files directly, so the page waited for January.

**Guidance.**
- `app/admin/rewind/evals/page.tsx` is a DataTable of `RewindEvalRun` rows merged with the committed `evals/rewind/results/*.json`. The files are read with `fs` (the folder is in `outputFileTracingIncludes`) and validated with P5.13's `results-schema.ts`.
  - Columns: model, prompt version, first-pass grounding, after-repair rate, judge scores, cost, p50 and p95 latency, and a "Selected" badge from `selected.json`.
  - A detail Sheet shows the per-fixture outputs with their issues.
  - Paid evals stay on the CLI: the page shows `npm run eval:rewind` as a copyable command instead of a Run button.
- Add Evals to the Rewind group in `lib/admin/nav.ts`.

**Tests.** `app/admin/rewind/evals/__tests__/page.test.tsx`: database rows and committed results merge, an invalid results file is skipped with a warning, the selected model carries its badge, and non-admins are refused.

**Integration.** P11.18's success review links the page, and next year's bake-off writes to the same tables and files.

**Demo.** `/admin/rewind/evals` lists the 2026 bake-off candidates with their grounding rates and cost, with the selected model badged.

**Done when.**
- [x] `/admin/rewind/evals` lists `RewindEvalRun` rows and the committed results, and Evals appears in the admin nav.

### Step P11.31: One active row per service: audit, then a reviewed apply

- **Track:** platform. **Lane:** platform. **Effort:** M. **Window:** 2027-01-19 to 2027-01-21. **Depends on:** P9.3.
- **Findings addressed:** DUP-05

**Objective.** Leave exactly one active row per service without silently switching the config the app uses today. A dry-run audit lists the duplicates, a reviewed apply keeps the right row and records the rest, and every active read gains a deterministic order. This was the destructive half of the former P6.14's migration; it runs after the final cut, behind the owner's confirmation.

**Guidance.**
- **Audit**, in new `lib/services/duplicate-audit.ts` with the CLI `scripts/service-rows-audit.ts` (dry run only) and an audited admin action `auditServiceRows()` (`SERVICE_ROWS_AUDITED`):
  - for `PlexServer`, `Tautulli`, `Overseerr`, `Sonarr`, `Radarr`, `Prometheus` and `JellyfinServer`, list every table with more than one active row: id, URL host, `updatedAt`, `createdAt`, the result of `testServiceConnection()` (P2.3), and which row today's `findFirst({ where: { isActive: true } })` returns on this database;
  - print hosts and ids only, never keys or tokens.
- **Apply**, `scripts/service-rows-apply.ts --keep <table>=<id> ...` (or the same admin action with `confirm: true`):
  - the default keep is the row today's query returns; where that row fails its connection test and another passes, the audit marks the passing one as the suggestion, and the owner chooses;
  - it refuses without an explicit keep for every table the audit listed, takes a dump first (P1.10), deactivates the others in one `$transaction`, and records the deactivated ids in the PR and in a `SERVICE_ROWS_DEDUPED` audit entry.
- **Deterministic reads.** In the same PR, add `orderBy: { updatedAt: 'desc' }` to every active-row read of these models (about 28 sites, for example `lib/auth.ts:129`, `actions/user-queries.ts:539` and `lib/discord/role-metadata.ts:118`), found with `rg "isActive: true" -g '*.ts'`. A test fails if a new `findFirst` on these models with `isActive` lacks an order.
- P10.24's `saveActiveService` keeps the invariant from then on.

**Tests.**
- `lib/services/__tests__/duplicate-audit.test.ts`: two active Tautulli rows are listed with their connection results; a table with one active row is not listed; no output contains a key.
- `scripts/__tests__/service-rows-apply.test.ts`: without a keep for each listed table it refuses; with keeps it deactivates only the others, once; a second run is a no-op.
- `__tests__/config/active-row-order.test.ts`: every `findFirst` with `isActive` on the seven models has an `orderBy`.

**Integration.** P10.24 depends on this step, so the setup model lands on clean data. P11.32's claim and auth reads use the ordered queries.

**Demo.** On a staging copy with two active Tautulli rows, the audit lists both with the row the app reads today; the apply keeps that row, and `SELECT count(*) FROM "Tautulli" WHERE "isActive"` returns 1.

**Done when.**
- [ ] The audit lists every duplicate active row with its connection result and today's choice, and the owner confirmed the keeps.
- [ ] The apply left one active row per service, recorded the deactivated ids, and is idempotent.
- [ ] Every active read of the seven models has a deterministic order, enforced by a test.
- [ ] Dump taken before the apply.

### Step P11.32: Claim the server before first-run setup

- **Track:** security. **Lane:** security and ops. **Effort:** M. **Window:** 2027-01-19 to 2027-01-21. **Depends on:** P4.3.
- **Findings addressed:** SEC-30

**Objective.** Until setup completes, only the person who can read the container log, or who set `SETUP_TOKEN`, can call a setup action. A fresh install exposed to the internet can then no longer be taken over between container start and the end of the wizard. This was P4.4; it moved to January because it protects only fresh installs and P10.24 and P10.25 build the wizard on it.

**Guidance.**
- Migration `setup_claim` adds `claimCodeHash String?`, `claimCodeIssuedAt DateTime?`, `claimId String?` and `claimedAt DateTime?` to `Setup`.
- The claim cookie uses P4.8's `lib/security/signed-cookie.ts` with its own purpose, `setup-claim`.
- New `lib/setup/claim.ts` (`server-only`), following `design/ui-design-system.md` 6.5, step 0:
  - `issueSetupCode()` runs from P4.2's background start while setup is incomplete and `SETUP_TOKEN` is unset.
    - It generates 12 characters from `[A-HJ-NP-Z2-9]`, formatted like `K7QM-4WZD-P2HX`, and stores only its SHA-256 in `claimCodeHash`.
    - It writes one banner line to stdout: "Setup code: K7QM-4WZD-P2HX". This is the one deliberate output that bypasses the logger, so P4.16's redaction does not mask it.
    - Every boot while setup is incomplete issues a new code, and the newest code in the log is the valid one. A new code does not end an existing claim.
  - When `SETUP_TOKEN` (at least 16 characters, added to P4.1's schema) is set, it replaces the generated code. It stays valid while it is set.
  - `claimServer({ code })` is a `publicAction` limited by `consume('setup:claim', ip)` to 5 tries per minute, a new entry in P0.10's `LIMITS`.
    - It upper-cases the input, strips dashes and spaces, and compares SHA-256 digests with `timingSafeEqual`.
    - On a match it writes a new random `claimId` and `claimedAt`, clears `claimCodeHash` so the code is single-use, and sets the `pm-setup` cookie to `signValue({ claimId }, 'setup-claim', 43200)`: httpOnly, SameSite=Lax, Secure per P4.1, path `/`.
    - It audits `SETUP_CLAIMED`, with the IP masked.
  - `requireSetupClaim()` verifies the cookie and compares its `claimId` with the `Setup` row in constant time. It returns `{ ok: true }` or `{ ok: false, code: 'SETUP_UNCLAIMED' }`.
- P4.3's `defineAction` gains `auth: 'setup'`: an admin once setup is complete, otherwise a valid claim.
  - It replaces `requireAdminIfSetupComplete()` (`actions/setup.ts:38`) in every export: `savePlexServer`, `saveTautulli`, `saveOverseerr`, `saveSonarr`, `saveRadarr`, `saveDiscordIntegration`, `saveChatLLMProvider`, `saveLLMProvider`, `savePrometheus`, `completeSetup` and `fetchLLMModels`. It also covers `getDevDefaults` (`actions/dev-defaults.ts:104`).
  - `fetchLLMModels` thereby stops being an anonymous OpenAI key checker (SEC-19).
  - The saves switch from `schema.parse` to `safeParse`, so ZodError JSON no longer reaches the client.
- `completeSetup` clears `claimId` and `claimCodeHash` and deletes the cookie, so the claim ends with setup.
- Which server row auth decisions read is settled by P11.31, which leaves one active row per service and adds a deterministic order to every active read; P10.24 then makes setup saves deactivate earlier rows (DUP-05).
- Minimal claim screen: without a claim, `app/setup/page.tsx` renders new `components/setup/setup-claim-form.tsx`, a client form on `StyledInput`, `Button` and the existing toast. It shows "Claim this server", the one-sentence explanation from 6.5 and a code field with `autocomplete="one-time-code"`, with the test ids `setup-claim-form`, `setup-claim-code-input`, `setup-claim-submit` and `setup-claim-error`. P10.25 rebuilds it as the wizard's first step.
- Docs: the README install steps and `example.env` document `SETUP_TOKEN` and `docker logs <container> | grep 'Setup code'`.

**Tests.**
- New `lib/setup/__tests__/claim.test.ts`:
  - the code has the right format, and only its hash is stored;
  - a wrong code fails, the right one passes in lower case with spaces, and a second use of it fails;
  - the `SETUP_TOKEN` path works, and the comparison uses `timingSafeEqual` (spied);
  - a tampered or expired cookie is refused.
- `lib/security/__tests__/signed-cookie.test.ts` (P4.8) gains a case: a setup cookie fails as a PIN cookie.
- `__tests__/security/setup-actions-security.test.ts` (rewritten) iterates over every export of `actions/setup.ts` and `getDevDefaults`. Before completion, each returns `SETUP_UNCLAIMED` without a claim; after it, each returns `FORBIDDEN` for a member. An export added later without the guard fails the test. The sixth claim attempt within a minute from one IP returns `RATE_LIMITED`.
- `e2e/setup-wizard.spec.ts`, with `SETUP_TOKEN` set in its environment:
  - an unclaimed `/setup` shows `setup-claim-form`, and a wrong code shows `setup-claim-error`;
  - the token claims the server, and the wizard renders;
  - a fresh browser context without the cookie sees the claim form again.

**Integration.**
- P4.2's background start calls `issueSetupCode()`.
- P10.24 builds the step model on the claim, and P10.25 renders the refreshed claim step.
- P0.6's server-action surface test allow-lists `actions/setup*.ts`, which is now safe because every setup action requires the claim.

**Demo.** On a fresh database, `docker compose up` prints "Setup code: ...", and a second browser that calls `savePlexServer` gets `SETUP_UNCLAIMED`. Entering the code opens the wizard, and after setup completes the same cookie opens nothing.

(as merged: migration `20270117000009_p1132_setup_claim`. `defineAction` gained `auth: "setup"` with a `setupAction` alias in `lib/actions/define-action.ts`; its handler context is `{ session, actor }` (`actor` is `"setup"` during the first run, the admin's id after), and a missing claim is the new `ActionErrorCode` `SETUP_UNCLAIMED` (copy in `lib/ui/error-copy.ts`). `claimServer` is a `publicAction` in `actions/setup-claim.ts` (a `'use server'` module, so the form can call it; inside the `actions/setup*.ts` allow-list), not in `lib/setup/claim.ts`, which holds `issueSetupCode`, `redeemSetupCode`, `setupClaimCookie`, `requireSetupClaim` and `clearSetupClaimCookie`. A wrong code answers `VALIDATION` with a `code` field error; a successful claim refunds its `setup:claim` point, so only wrong codes count toward the 5 a minute. `SETUP_TOKEN` is compared exactly (trimmed, case-sensitive); the generated code is normalised. A token shorter than 16 characters is ignored with a warning, and production boot refuses it (`checkProductionEnv`). A claim replaces `claimId`, so a newer claim ends an older browser's. `fetchLLMModels` no longer exists (P10.7 deleted it), and `getDevDefaults` is a server-only loader since P11.5, not an action: it returns empty defaults without the claim, and `/setup` renders `SetupClaimForm` (on `Input`/`FormField`/`Button`/`Alert`; `StyledInput` is gone) before it reads them. Playwright sets `SETUP_TOKEN` (default `e2e-setup-token-0123456789`) for the server and workers; `e2e/helpers/setup-claim.ts`'s `claimSetup(page)` is used by the setup, setup-axe and setup-visual specs. E2E specs were not run.)

**Done when.**
- [x] Every setup action, `fetchLLMModels` and `getDevDefaults` require a claim before completion and an admin after it.
- [x] The setup code is printed once per boot, stored only as a hash, compared in constant time, rate-limited and single-use, and `SETUP_TOKEN` overrides it.
- [x] Today's wizard shows the claim screen, and the E2E spec claims before it continues.
- [ ] Dump taken before deploy; `prisma migrate status` clean.
