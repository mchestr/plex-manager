# Additional Findings (Gap Sweep)

Generated 2026-10-17 · 5 auditor(s) · every finding re-checked by a verifier; critical/high findings also survived an independent refutation attempt.

Scope: five areas the earlier reports did not cover in depth:

- external API contracts (external-api-contracts);
- operator runbooks and documentation (operator-runbook-docs);
- Jellyfin parity (jellyfin-parity);
- privacy and the personal-data lifecycle (privacy-data-lifecycle);
- locale, timezone and formatting (locale-timezone-formatting).

The five auditors filed 49 findings. Two were refuted as duplicates of earlier reports (see the appendix), which leaves 47. Each finding lists its original auditor ID under **Sources**. Where an earlier report already covers part of a finding, this report cites that report's ID (SEC, BP, DUP, UI, RWP) instead of repeating it. Several findings share a fix (noted on each), but no two share a single defect, so none were merged.

**Status legend**

| Status | Meaning |
|---|---|
| verified | Re-checked by a verifier; for high findings, also survived an independent refutation attempt |
| confirmed | Verifier confirmed the finding as written |
| adjusted | Verifier confirmed the core issue but corrected the severity, impact or details (the corrections are folded in here) |
| disputed | Reviewers disagree on the severity (no finding in this report has this status) |
| unverified | Not re-checked (no finding in this report has this status) |

## Executive summary

- **Jellyfin sign-in fails on every Jellyfin 12.0 server (GAP-01, high).** The password login sends only the legacy `X-Emby-Authorization` header. Jellyfin 12.0, released 2026-09-07, turns legacy authorization off by default, and a migration switches it off on upgraded servers too. `AuthenticateByName` therefore returns 400 before the password is checked. After a routine media-server upgrade every Jellyfin member is locked out, the Jellyfin admin included. The fix is one header (S).
- **Watchlist sync most likely requests nothing while reporting success (GAP-02, high), and the TV path behind it is broken too (GAP-03).** The sync reads TMDB IDs from the watchlist listing. Every reference client (Overseerr, Seerr, Ombi, python-plexapi) gets those IDs with a second, per-item metadata call. Items without an ID are skipped silently, and the card says "Watchlist is up to date". Once that is fixed, every new TV request fails with a 500 from Overseerr because `seasons` is never sent. Fix both in one change.
- **Unsharing a member removes them as a plex.tv friend, not only from this server (GAP-04).** A lapsed Stripe subscriber, or a member an admin unshares, loses access to every server the owner shares. A repeated revoke ends as a failed job, because any reply other than 200/204 counts as failure.
- **The documented install and upgrade commands are development tools (GAP-11).** README and CLAUDE.md say to install with `db push` and to run `migrate dev` as the "production" migration, while the image runs `migrate deploy`.
  - A database built from the README crash-loops the image with P3005.
  - Upgrading with `db push` skips the Stripe grandfathering UPDATE, so pre-existing members are gated once Stripe is enabled.
  - Nothing documents backup or restore (GAP-14), and there are no tags, releases or changelog (GAP-20).
- **Discord bot setup fails on a fresh install in two places (GAP-12, GAP-13).**
  - The bot poller never starts if the bot is disabled or unconfigured at boot, which is always the case on a fresh install. Enabling the bot in the wizard does nothing until a restart.
  - The slash-command registration script imports Prisma before it loads `.env`, so the documented command crashes, and the script cannot run from the image at all.
- **Jellyfin members are second-class outside sign-in (GAP-23 to GAP-30).**
  - With Stripe on, Jellyfin-only members are sent to a paywall that buys a Plex invite to their username-derived email (GAP-23).
  - `primaryAuthService` is never written for invite-created Jellyfin members, so they get the Plex onboarding and a plex.tv tile (GAP-24).
  - Discord `/mystats`, `/watching`, the assistant and linked roles go silently empty for them (GAP-25).
- **Members cannot be offboarded or deleted (GAP-31).** Unshare, Stripe revoke and Discord unlink leave almost all of a member's data in place, including a working plex.tv token. Scheduled watchlist sync keeps reading a removed member's watchlist and filing Overseerr requests under the admin key.
- **Admins can see more of the assistant conversations than members are told (GAP-32, GAP-33, GAP-35).**
  - The first 500 characters of every DM to the bot are copied into the Discord command log and listed on two admin pages.
  - Members are never told that admins can read assistant conversations.
  - Five admin actions that change member data emit no audit event.
  - No content table has a retention policy.
- **Admin-entered times are converted in the wrong timezone (GAP-40).**
  - Announcement expiry fires 8 hours early for a Pacific admin.
  - For admins east of UTC, the Rewind generation window is enforced one day early at both ends, and a January start date flips the Rewind year.
  - There is no timezone or locale setting at all. That produced confirmed React hydration mismatches on two admin pages (GAP-41).

## Severity summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 11 |
| Low | 30 |
| Info | 4 |
| **Total** | **47** |

Only non-refuted findings are counted. Two findings were refuted (JFP-05 and JFP-09; see the appendix). Verifiers lowered the severity of 18 findings, and the severities here are the verified ones:

- **High to medium (5):** GAP-03, GAP-11, GAP-14, GAP-23, GAP-31.
- **Medium to low (12):** GAP-05, GAP-07, GAP-16, GAP-17, GAP-20, GAP-21, GAP-26, GAP-27, GAP-34, GAP-41, GAP-42, plus one privacy finding.
- **Low to info (1):** GAP-39.

| Area | High | Medium | Low | Info | Total |
|---|---|---|---|---|---|
| 1. External API contracts | 2 | 2 | 5 | 1 | 10 |
| 2. Operations, deployment and documentation | 0 | 4 | 8 | 0 | 12 |
| 3. Jellyfin parity | 0 | 3 | 4 | 1 | 8 |
| 4. Privacy, data lifecycle and admin data access | 0 | 1 | 7 | 1 | 9 |
| 5. Locale, timezone and formatting | 0 | 1 | 6 | 1 | 8 |
| **Total** | **2** | **11** | **30** | **4** | **47** |

### Finding index

| ID | Source | Title | Severity | Effort |
|---|---|---|---|---|
| GAP-01 | EAC-03 | Jellyfin login sends only the legacy auth header; fails on Jellyfin 12.0 | High | S |
| GAP-02 | EAC-01 | Watchlist sync never resolves external IDs and reads one unpaged response | High | M |
| GAP-03 | EAC-02 | Overseerr TV requests omit `seasons` (500); 202/403 misclassified | Medium | S |
| GAP-04 | EAC-05 | Unshare removes the plex.tv friend, not this server's share; not idempotent | Medium | S |
| GAP-05 | EAC-04 | Temporary Plex failures shown as permanent "Access Denied" or "token expired" | Low | M |
| GAP-06 | EAC-06 | Plex import treats the whole friend list as this server's users | Low | S |
| GAP-07 | EAC-07 | *arr/Overseerr chatbot tools send ignored filters; first page only | Low | S |
| GAP-08 | EAC-08 | Owner's own streams never match `/watching` (PMS user id 1) | Low | S |
| GAP-09 | EAC-09 | Prometheus client drops the JSON error body | Low | S |
| GAP-10 | EAC-10 | PMS reads use legacy routes, `limit` and GET scrobble | Info | S |
| GAP-11 | OPS-DOC-01 | Documented `db push` / `migrate dev` do not match the image's `migrate deploy` | Medium | S |
| GAP-12 | OPS-DOC-07 | Discord bot never starts if disabled at boot; docs contradict the default | Medium | S |
| GAP-13 | OPS-DOC-06 | Slash-command registration crashes as documented; not runnable from the image | Medium | S |
| GAP-14 | OPS-DOC-02 | No backup, restore or state inventory; migrations auto-apply on start | Medium | S |
| GAP-15 | OPS-DOC-12 | Stripe can be enabled without Redis | Low | S |
| GAP-16 | OPS-DOC-05 | No production deployment recipe; dev compose overrides `.env` | Low | M |
| GAP-17 | OPS-DOC-04 | Moving domain undocumented; `NEXT_PUBLIC_APP_URL` baked at build | Low | S |
| GAP-18 | OPS-DOC-09 | Env reference incomplete; README omits `PLEX_CLIENT_IDENTIFIER` | Low | S |
| GAP-19 | OPS-DOC-10 | `?schema=` honoured by the CLI, ignored by the runtime adapter | Low | S |
| GAP-20 | OPS-DOC-03 | No versioned releases, changelog or upgrade notes | Low | M |
| GAP-21 | OPS-DOC-08 | README feature and security claims partly false; features omitted | Low | S |
| GAP-22 | OPS-DOC-11 | CLAUDE.md documents nonexistent client APIs and wrong paths | Low | S |
| GAP-23 | JFP-01 | Stripe gate applies to Jellyfin-only members but provisions Plex only | Medium | M |
| GAP-24 | JFP-03 | `primaryAuthService` never written correctly; wrong onboarding | Medium | S |
| GAP-25 | JFP-04 | Discord commands, linked roles and assistant empty for Jellyfin members | Medium | M |
| GAP-26 | JFP-06 | Jellyfin owner check is dead; failed lookup demotes the admin | Low | S |
| GAP-27 | JFP-02 | Admins cannot see a member's service or remove Jellyfin access | Low | M |
| GAP-28 | JFP-07 | Failed Jellyfin invite leaves a working account and a reusable invite | Low | S |
| GAP-29 | JFP-08 | Jellyfin tile falls back to jellyfin.org; shows the Plex server's name | Low | S |
| GAP-30 | JFP-10 | No tests for Jellyfin member paths | Info | M |
| GAP-31 | PRIV-01 | No member deletion; offboarding keeps data and the sync keeps running | Medium | M |
| GAP-32 | PRIV-02 | DM text shown to admins; no disclosure to members | Low | S |
| GAP-33 | PRIV-04 | Member-affecting admin writes emit no audit event | Low | M |
| GAP-34 | PRIV-03 | Plex sign-in copy misdescribes token storage; no privacy notice | Low | S |
| GAP-35 | PRIV-05 | No retention on content tables; no cleanup job | Low | M |
| GAP-36 | PRIV-07 | No member export or item-level deletion | Low | M |
| GAP-37 | PRIV-06 | Share visits store an unused, reversible IP pseudonym, UA and referer | Low | S |
| GAP-38 | PRIV-09 | Admin activity timeline pagination drops items after page 2 | Low | S |
| GAP-39 | PRIV-08 | Admin per-user watchlist sync ignores the member's opt-in (latent) | Info | S |
| GAP-40 | LTZ-03 | Admin wall-clock inputs converted in the wrong timezone | Medium | S |
| GAP-41 | LTZ-01 | Runtime-default formatting in SSR client components; hydration mismatches | Low | M |
| GAP-42 | LTZ-04 | Analytics day windows, zero-fill and labels inconsistent | Low | M |
| GAP-43 | LTZ-02 | Unlabelled server-UTC and browser-local times on the same page | Low | M |
| GAP-44 | LTZ-05 | Discord assistant emits UTC dates with no timezone context | Low | S |
| GAP-45 | LTZ-06 | Relative-time helpers count 24-hour periods; eligibility ignores the day | Low | S |
| GAP-46 | LTZ-07 | Number grouping differs between server and client components | Low | S |
| GAP-47 | LTZ-08 | i18n readiness: hard-coded `lang="en"`, no i18n layer | Info | S |

## Findings

### 1. External API contracts

#### GAP-01: Jellyfin password login sends only the legacy `X-Emby-Authorization` header, which Jellyfin 12.0 ignores by default, so every Jellyfin sign-in fails

- **Severity:** High
- **Status:** verified. The verifier and an independent refutation reviewer both read Jellyfin's v12.0 source, and neither could refute the finding.
- **Sources:** EAC-03
- **Where:** `lib/connections/jellyfin-core.ts:45-55`, `lib/connections/jellyfin-users.ts:284-294`, `lib/connections/jellyfin-users.ts:307`, `lib/jellyfin-auth.ts:87`, `lib/auth.ts:296`, `components/auth/jellyfin-sign-in-button.tsx:74`
- **Evidence:**
  ```ts
  // lib/connections/jellyfin-core.ts:45-55, the only header set used for POST /Users/AuthenticateByName
  const deviceId = process.env.JELLYFIN_DEVICE_ID || "plex-wrapped-server"
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Emby-Authorization": `MediaBrowser Client="${clientName}", Device="${device}", DeviceId="${deviceId}", Version="${clientVersion}"`,
  }
  ```
  - **Repo:**
    - `jellyfin-users.ts:284-294` POSTs `AuthenticateByName` with only these headers.
    - `:307` maps every non-401 to `Authentication failed: ${response.statusText}`.
    - Nothing else in the repo adds an `Authorization` header to this call.
    - The admin API-key calls already use `Authorization: MediaBrowser Token="..."` (`jellyfin-core.ts:33-39`) and keep working.
  - **Jellyfin v12.0** (tag dated 2026-09-07, commit 6c073e19):
    - `MediaBrowser.Model/Configuration/ServerConfiguration.cs:290` declares `public bool EnableLegacyAuthorization { get; set; }`, so the flag defaults to false. In 10.11.11 the same line was `= true`.
    - Migration `20260531160000_DisableLegacyAuthorization` sets the flag to false and saves the config, so upgraded servers are switched over too.
    - `AuthorizationContext.cs:233-235` reads `X-Emby-Authorization` only when the flag is on.
    - `SessionManager.AuthenticateNewSessionInternal` (`:1702-1705`) calls `ArgumentException.ThrowIfNullOrEmpty(request.App)` (and the same for DeviceId, DeviceName and AppVersion) before it checks the password. `ExceptionMiddleware.cs:127` maps `ArgumentException` to 400.
    - Upstream issue jellyfin/jellyfin#15962 is titled "Default EnableLegacyAuthorization=false breaks Jellyseerr authentication".
  - **Official SDK:** `@jellyfin/sdk` 1.0.1 sends `Authorization: MediaBrowser Client=..., Device=..., DeviceId=..., Version=..., Token=...`.
- **Impact:**
  - **Who is affected:** every Jellyfin sign-in fails with 400, whatever the credentials, on Jellyfin 12.0 and later (12.0, 12.1 and 12.2 are released). The same happens on 10.11 servers where the operator turned legacy authorization off.
  - **What members see:** `authorize()` returns null, so the member gets NextAuth's generic error. The raw "Bad Request" text is only logged.
  - **Jellyfin-only installs:** the Jellyfin admin signs in through the same provider, so these installs lose all Jellyfin sign-in after a routine media-server upgrade.
  - **Why high, not critical:** Plex sign-in is unaffected and no data is lost.
  - **Side effect:** the returned access token is discarded and never logged out. Jellyfin logs out earlier sessions for the same user and DeviceId (`SessionManager.cs:1784-1800`), so each member keeps at most one stale token.
- **Recommendation:**
  - For `AuthenticateByName`, send `Authorization: MediaBrowser Client="Plex Manager", Device="Server", DeviceId="<stable per-install id>", Version="<app version>"`, encoded the way the SDK does it, and drop `X-Emby-Authorization`.
  - After reading `User.Id`, POST `/Sessions/Logout` with the returned token, since the app never uses it.
  - Map a Jellyfin 400 or 500 to "Jellyfin rejected the sign-in request" instead of the raw status text.
  - Add a unit test that asserts the header. The SSRF exposure of these helpers is SEC-35.
- **Effort:** S

#### GAP-02: Watchlist sync expects external IDs in a listing that does not carry them and reads only one unpaged response, so it most likely requests nothing while reporting success

- **Severity:** High
- **Status:** verified. The refutation reviewer could not refute it. They read Overseerr, Ombi and python-plexapi, and all three get external IDs with a second call. They narrowed the root cause (see Impact). The live plex.tv payload could not be fetched from the sandbox.
- **Sources:** EAC-01
- **Where:** `lib/watchlist/plex-watchlist.ts:16-21`, `:125-129`, `:150-151`; `lib/watchlist/sync-service.ts:80`, `:122-130`, `:203`; `components/watchlist/sync-settings-card.tsx:89-94`, `:257`
- **Evidence:**
  ```ts
  // lib/watchlist/plex-watchlist.ts:125-129: one GET, no X-Plex-Container-* headers, no includeGuids/includeExternalMedia
  const url = `${PLEX_DISCOVER_URL}/library/sections/watchlist/all`
  const response = await fetch(url, { method: "GET", headers: getPlexHeaders(userToken) })
  // :150-151: the only source of TMDB/TVDB/IMDb ids
  const externalIds = parseExternalIds(item.Guid)
  ```
  - **Response handling:** the response type (`:16-21`) has only `size` and `Metadata`. `totalSize` is never read, and the repo has no per-item metadata lookup anywhere.
  - **Silent skip:** `sync-service.ts:122-130` skips with `if (!item.tmdbId) { logger.debug("Skipping item without TMDB ID", ...); itemsSkipped++; continue }` and writes no history row.
  - **False success:** `:203` records `"success"` whenever `itemsFailed === 0`, and the card then shows `showInfo("Watchlist is up to date")` with a Success badge.
  - **Reference clients** (no official spec covers this endpoint):
    - Overseerr `server/api/plextv.ts:101-108` types the listing as `Metadata?: { ratingKey: string }[]` with `totalSize`. At `:312-327` it calls `/library/metadata/${watchlistItem.ratingKey}` for each item to read `Guid`.
    - Seerr does the same through `fetchWatchlistItemMetadata`. Ombi's `PlexWatchlistImport.cs:676-695` (`ResolveProviderIds`) also makes a second call.
    - python-plexapi 4.18.3 (`myplex.py:952-967`) sends `includeCollections=1&includeExternalMedia=1` and pages through `fetchItems` (`base.py:338-366`, with `X-Plex-Container-Size` defaulting to 100).
  - **History:** the module came in one commit (a9f5475) and has not changed since. It has no tests; `lib/watchlist/*` is at 0% coverage (BP-10).
- **Impact:**
  - **Nothing gets requested:** if the listing carries no `Guid` array, as all three reference clients assume, every item is skipped. This optional feature then never files a request, while telling the member their watchlist is up to date.
  - **No signal to anyone:** neither the member nor the admin is told, and the admin counters understate the gap.
  - **Truncation is the weaker sub-claim:** even with Guids, items past the server's first page would be dropped silently. The refutation reviewer noted that Overseerr's own sync fetches only the 20 most recent items (`watchlistsync.ts:65`), and the server's default page size is unknown.
- **Recommendation:**
  - Get the external IDs with `GET https://discover.provider.plex.tv/library/metadata/{ratingKey}` and read `Guid[]`. Cache the result per ratingKey in WatchlistSyncHistory, so each item is looked up once.
  - Page with `X-Plex-Container-Start` and `X-Plex-Container-Size` (for example 100) until `start >= totalSize`, and validate the container with Zod.
  - Send `If-None-Match` with the stored ETag, as Overseerr does, so an unchanged watchlist costs a single 304.
  - Record items skipped for having no TMDB ID with a status the card can show.
  - Add a fixture test with a two-page watchlist.
  - Fix this together with GAP-03.
- **Effort:** M

#### GAP-03: Overseerr TV requests omit `seasons`, which makes Overseerr throw a 500; 202 and 403 replies are misclassified, and 4K status is never checked

- **Severity:** Medium
- **Status:** verified; the refutation pass lowered the severity from high to medium. It confirmed the defect against Overseerr and Seerr source. Reasons for the lower severity: the TV path is unreachable today behind GAP-02, the feature is optional, and the failure is loud.
- **Sources:** EAC-02
- **Where:** `lib/connections/overseerr.ts:165`, `:306-314`, `:316-318`, `:329-346`, `:355-367`; `lib/watchlist/sync-service.ts:112-116`, `:134-137`, `:154-159`
- **Evidence:**
  ```ts
  // lib/connections/overseerr.ts:306-313
  const body: Record<string, unknown> = { mediaType: payload.mediaType, mediaId: payload.mediaId }
  if (payload.seasons && payload.seasons.length > 0) { body.seasons = payload.seasons }
  // lib/watchlist/sync-service.ts:134-137, the only caller, never passes seasons
  const requestResult = await submitOverseerrRequest({ ... }, { mediaType, mediaId: item.tmdbId })
  ```
  - **How Overseerr handles a missing `seasons`:**
    - `server/entity/MediaRequest.ts:238-243` and `:280` do `requestBody.seasons === 'all' ? ... : (requestBody.seasons as number[])` and then call `requestedSeasons.filter(...)`. That throws a TypeError when `seasons` is undefined.
    - Seerr does the same (`:359-370`).
    - `overseerr-api.yml` marks `seasons` optional with no default, so the validator passes the body through unchanged.
  - **How Overseerr maps errors to statuses** (`server/routes/request.ts:188-197`):

    | Error | Status |
    |---|---|
    | Default case | 500, with `error.message` |
    | `NoSeasonsAvailableError` | 202 |
    | Quota and permission errors | 403 |
    | Duplicates | 409 |
  - **Repo:**
    - `:355-367` treats any 2xx as created: `return { success: true, requestId: data.id, status: "created" }`.
    - The pre-check (`:165`) reads only `data.mediaInfo?.status`, never `status4k`.
    - FAILED is not a terminal state (`sync-service.ts:112-116`).
- **Impact:**
  - **Every new show fails once GAP-02 is fixed.** Each watchlisted show that Overseerr has not seen gets a 500. It is stored as FAILED with `lastSyncError` "<Show>: Cannot read properties of undefined (reading 'filter')", and it is POSTed again on every sync. Movies are unaffected.
  - **Once seasons are sent:**
    - a 403 (quota or permission) is still retried forever;
    - a 202 "no seasons available" would be recorded as REQUESTED with no request id.
  - **4K is latent:** no caller passes `is4k`, so the missing `status4k` check does not fire today.
  - Request attribution under the admin key is SEC-27.
- **Recommendation:**
  - Send `seasons: "all"` for `mediaType === "tv"` when no explicit list is given.
  - Map 202 to `already_requested`, without inventing a request id.
  - Map 403 to a new terminal status such as QUOTA_OR_PERMISSION, with the message. Keep 409 as today.
  - Check `mediaInfo.status4k` when `is4k` is set.
  - Validate the 201 `MediaRequest` body with Zod.
  - Add tests for the TV body and for the 202, 403 and 500 paths.
- **Effort:** S

#### GAP-04: Unshare calls plex.tv's remove-friend endpoint, which is not limited to the configured server and is not idempotent

- **Severity:** Medium
- **Status:** confirmed. Not confirmed: the status plex.tv returns for an already-removed friend (404 is assumed).
- **Sources:** EAC-05
- **Where:** `lib/connections/plex-invitations.ts:273-291`; `lib/queue/jobs/stripe.ts:632-646`; `actions/user-queries.ts:293`; `lib/queue/client.ts:22`
- **Evidence:**
  ```ts
  // lib/connections/plex-invitations.ts:273-291
  const sharingId = plexUserId
  const deleteUrl = `https://plex.tv/api/v2/sharings/${sharingId}`
  const deleteResponse = await fetch(deleteUrl, { method: "DELETE", headers: { "X-Plex-Token": serverConfig.token, ... } })
  if (deleteResponse.status !== 200 && deleteResponse.status !== 204) { ... return { success: false, ... } }
  ```
  - **No server scoping:** `serverConfig.url` is used only for logging, and the server's machineIdentifier is never resolved.
  - **Retry behaviour:**
    - `stripe.ts:636-641` throws on any failure, with the comment "Transient Plex failure: throw so BullMQ retries the revoke".
    - After 3 attempts (`lib/queue/client.ts:22`) the job fails, and `plexInviteStatus: "revoked"` is never written.
  - **Contract** (python-plexapi `myplex.py`):
    - `FRIENDUPDATE = 'https://plex.tv/api/v2/sharings/{userId}'` is the URL `removeFriend` DELETEs, documented as "Remove the specified user from your friends."
    - Removing one server's share is a DELETE on `FRIENDSERVERS = 'https://plex.tv/api/servers/{machineId}/shared_servers/{serverId}'` (`updateFriend(..., removeSections=True)`).
    - Wizarr reads per-server shares from `clients.plex.tv/api/v2/shared_servers/owned/accepted`.
- **Impact:**
  - **Over-revoke:** a lapsed Stripe subscriber, or a member an admin clicks "Unshare" on, is removed from the owner's friend list. They lose every server the owner shares (a separate 4K or family server, for example), not only this one.
  - **Re-runs fail permanently:** if the user is already gone, or the DB write failed after the DELETE, the retry gets a reply other than 200/204. The job fails, the subscription row stays `accepted`, and the admin action shows a raw Plex error.
  - **Permanent errors are retried:** a 401 from a revoked owner token is retried as if it were transient.
  - Revokes acting on stale state are SEC-38.
- **Recommendation:**
  - **Simplest fix** (from the verifier): the share id is already on each `<Server id=...>` element of `/api/users`, which `getPlexUsers` parses. Keep that id and DELETE `FRIENDSERVERS` for this machineIdentifier. Listing `shared_servers/owned/accepted` is the alternative.
  - Treat 404, or "share not found", as success.
  - Throw BullMQ `UnrecoverableError` on 401/403. Back off and retry on 429 and 5xx.
  - Add tests for the 404 and 401 paths.
- **Effort:** S

#### GAP-05: Temporary Plex failures are shown to members as permanent verdicts ("Access Denied", subscriber role removed, "Plex token expired")

- **Severity:** Low
- **Status:** adjusted (lowered from medium). Failing closed at login is deliberate and documented. The defects are the wrong messages and the extra dependency on the PMS.
- **Sources:** EAC-04
- **Where:** `lib/connections/plex-user-info.ts:127-137`; `lib/connections/plex-user-access.ts:73-86`, `:98`; `lib/connections/plex-connection.ts:58-63`; `lib/auth.ts:150-161`; `app/auth/callback/plex/callback-client.tsx:155-163`; `app/auth/denied/denied-client.tsx:163-166`; `lib/discord/role-metadata.ts:93-104`; `lib/watchlist/plex-watchlist.ts:177-188`; `lib/watchlist/sync-service.ts:55-61`
- **Evidence:**
  - **Status mapping:** `plex-user-info.ts:127-137` maps only 401. Every other status becomes ``{ success: false, error: `API returned error status: ${response.status} ...` }``, and timeouts become "Connection timeout".
  - **PMS on every login:**
    - `checkUserServerAccess` calls the PMS `/identity` endpoint first on every login (`plex-user-access.ts:73-86`, 5 s timeout at `plex-connection.ts:63`), because PlexServer has no machineIdentifier column.
    - Any failure returns `success: false, hasAccess: false`.
  - **Member-facing results:**
    - The callback (`callback-client.tsx:155-163`) sends every failed check to `/auth/denied`, which says "Access Denied" and "You don't have access to this Plex server" (`denied-client.tsx:163-166`).
    - `role-metadata.ts:93-104` returns `false` unless the check succeeded, which pushes `is_subscribed=false` to Discord.
    - `validatePlexToken` (`plex-watchlist.ts:184-188`) returns `response.ok`, and `false` on any error. `sync-service.ts:55-61` then stores "Plex token expired - please log in again".
  - **Contrast:** `actions/user-queries.ts:122` already uses a tri-state (`accessResult.success ? accessResult.hasAccess : null`).
  - **Contract:** Plex's auth guide says "If plex.tv cannot be reached, or if you receive any other status code it indicates an error state, but does not indicate an invalid Access Token."
- **Impact:**
  - **False denials:** during a plex.tv 429 or 5xx, a slow friend-list response (15 s cap) or a PMS restart, a non-admin member is told they have no access and should contact the admin. Paying subscribers are included. The verdict is false and presented as permanent.
  - **PMS restarts block logins:** a PMS restart alone turns away non-admin logins, even though plex.tv is what decides access.
  - **Why only low:** existing sessions are unaffected and logins are infrequent. A plex.tv outage blocks PIN login anyway.
  - **Discord role:** collapsing an unknown result to false is documented design (`role-metadata.ts:63-76`), and it runs only at link time or on a manual resync. Role staleness is SEC-47.
- **Recommendation:**
  - Return `granted | denied | unknown{retryable, reason}` from `checkUserServerAccess`.
  - Map 401 to an invalid token. Map 429 (honouring Retry-After), 5xx, timeouts and parse errors to unknown.
  - Keep fail-closed admission, but send an unknown result to a "Plex is temporarily unavailable" page instead of `/auth/denied`.
  - Skip the Discord role update when the result is unknown.
  - Make `validatePlexToken` report an invalid token only on 401.
  - Store `machineIdentifier` on PlexServer at setup, so login, invite and grant stop calling `/identity`.
  - Add tests for 429, 503 and a timeout.
- **Effort:** M

#### GAP-06: getAllPlexServerUsers treats the owner's whole plex.tv friend list as this server's users; managed users are dropped and pending shares count as access

- **Severity:** Low
- **Status:** adjusted. The `plex-core.ts` line numbers were corrected, and the managed-user drop applies to both parsers.
- **Sources:** EAC-06
- **Where:** `lib/connections/plex-user-info.ts:189-196`, `:245-253`, `:345-375`; `lib/connections/plex-core.ts:67-69`, `:77-86`; `lib/connections/plex-user-access.ts:36`; `actions/import-plex-users.ts:39`, `:59-85`; `app/api/admin/plex/users/route.ts:37`
- **Evidence:**
  - **Friend list read as server users:**
    - `getAllPlexServerUsers` ("Fetches all users from a Plex server", `:245-253`) GETs `https://clients.plex.tv/api/users`. Its loop (`:345-375`) never reads the `<Server>` children.
    - `ParsedXmlServerUser` (`plex-core.ts:77-86`) has no Server field, and `ParsedXmlServer` (`:67-69`) carries only `machineIdentifier`.
    - `import-plex-users.ts:59-85` creates a User for every row.
  - **Managed users dropped:**
    - `getPlexUsers` uses `const username = user["@_username"] ?? user["@_name"]` and skips empty names (`:189-196`). `getAllPlexServerUsers` uses `username ?? title ?? name` (`:347`).
    - With the repo's fast-xml-parser, `username=""` parses to `""`, which `??` does not skip.
  - **Pending shares count:** `checkUserHasAccess` (`plex-user-access.ts:36`) is `user.servers.some((server) => server.machineIdentifier === machineIdentifier)`, which ignores `pending`.
  - **Contract** (python-plexapi):
    - `MyPlexUser` (`https://plex.tv/api/users/`) "represents non-signed in users such as friends and linked accounts".
    - Each user has per-server `MyPlexServerShare` entries carrying `owned`, `pending` and `machineIdentifier`.
    - The endpoint has no paging, so a single call is correct; only the interpretation is wrong.
  - **Duplication:** two near-copies fetch and parse the same XML (`:101` and `:253`).
- **Impact:**
  - **Non-members in admin lists:** "Import Plex users" creates rows for friends who do not share this server, including friends who only share their own server with the owner. The admin list and the Rewind playground picker then show non-members.
  - **Managed users missing:** Plex Home managed users never appear when Plex sends an empty username.
  - **Pending shares:** a pending share passes the login gate. That is a minor false positive, since the user was invited.
  - Non-members are still refused at login.
- **Recommendation:**
  - Use one shared `/api/users` parser that keeps `servers` with `machineIdentifier`, `owned` and `pending`.
  - Filter `getAllPlexServerUsers` to users with a non-pending share for this machineIdentifier.
  - Use `||` or explicit empty checks, so an empty username falls back to `title`.
  - Validate with Zod.
- **Effort:** S

#### GAP-07: The *arr and Overseerr chatbot tools send filter parameters the APIs ignore, omit `includeSeries`, and read only the first page

- **Severity:** Low
- **Status:** adjusted (lowered from medium). The `sortDir` part was ruled out, and these tools are admin-only.
- **Sources:** EAC-07
- **Where:** `lib/connections/sonarr.ts:58`, `:79-86`, `:101-105`, `:111`; `lib/connections/radarr.ts:58`, `:78-85`, `:107`; `lib/connections/overseerr.ts:103`; `actions/chatbot/executors/sonarr.ts:99`; `actions/chatbot/executors/radarr.ts:94`; `actions/chatbot/tools/sonarr.ts:74`
- **Evidence:**
  - **What the code sends:** `sonarr.ts:79-86` builds `new URLSearchParams({ pageSize, sortKey: "date", sortDir: "desc" }); if (seriesId !== undefined) params.append("seriesId", ...)`. `radarr.ts:78-85` does the same with `movieId`.
  - **What the APIs accept:**
    - Sonarr's `GET /api/v3/history` binds `int[] seriesIds` and `episodeId`, not `seriesId`, which exists only on `/api/v3/history/series`.
    - Radarr's binds `int[] movieIds`, not `movieId`, which exists only on `/api/v3/history/movie`.
    - ASP.NET ignores unknown query parameters, so the filter is silently dropped.
  - **Missing includeSeries:**
    - Calendar (`sonarr.ts:101-105`), wanted/missing (`:111`, `radarr.ts:107`) and queue (`sonarr.ts:58`, `radarr.ts:58`) never pass `includeSeries` or `includeMovie`.
    - Their controllers default it to false, and `EpisodeResource` has no `seriesTitle`.
    - The queue defaults to pageSize 10.
  - **Overseerr users:**
    - `routes/user/index.ts:31` has `const pageSize = req.query.take ? Number(req.query.take) : 10`, while `overseerr.ts:103` sends a bare `/api/v1/user`.
    - The Rewind call site is BP-24; this chatbot site is separate.
  - **Ruled out:** `sortDir` does no harm. `PagingResource` defaults `SortDirection` to Descending, and history defaults to newest first.
- **Impact:** in the admin web chatbot and the Discord-admin assistant:
  - "Why didn't X download?" returns the latest server-wide history rather than X's, so the assistant reports unrelated events.
  - Calendar and missing answers cannot name the show.
  - Queue answers see only 10 items.
  - "All Overseerr users" returns 10.
- **Recommendation:**
  - For history, call `/api/v3/history/series?seriesId=` (or `seriesIds=`) and `/api/v3/history/movie?movieId=`.
  - Add `includeSeries=true` on Sonarr calendar, wanted/missing and queue, and `includeMovie=true` on the Radarr queue.
  - Pass explicit page sizes, and page Overseerr `/user` with take/skip.
  - Generating param types from the published openapi.json would turn a nonexistent param into a type error.
  - Renaming `sortDir` is optional.
- **Effort:** S

#### GAP-08: The server owner's own streams never match Discord `/watching` or the chatbot session scope, because PMS reports the owner as user id 1

- **Severity:** Low
- **Status:** confirmed
- **Sources:** EAC-08
- **Where:** `lib/discord/commands/watching.ts:97-100`, `:261`; `actions/chatbot/executors/plex.ts:36-41`
- **Evidence:**
  ```ts
  // lib/discord/commands/watching.ts:97-100 (executors/plex.ts:36-41 is the same comparison)
  return sessions.filter((session) => session.User?.id === plexUserId || session.user_id === plexUserId)
  ```
  - `plexUserId` is the stored plex.tv account id.
  - python-plexapi shows the PMS reports the owner's session user as `1`:
    - `base.py:1051` casts `user.attrib.get('id')` to int;
    - `:1088` does `if self._userId == 1: return myPlexAccount`;
    - everyone else is resolved by username.
- **Impact:**
  - The owner (the account that matches `adminPlexUserId`) always gets the "nothing playing" reply from `/watching`.
  - The owner's streams are filtered out of the Discord-scoped `get_plex_sessions`.
- **Recommendation:**
  - When the caller's plexUserId equals `PlexServer.adminPlexUserId`, also match `User.id === "1"`. Alternatively, match `User.title` against the stored username, as plexapi does.
  - Add a fixture test with an owner session.
- **Effort:** S

#### GAP-09: The Prometheus client drops the documented JSON error body on 4xx/5xx and reports only the HTTP status text

- **Severity:** Low
- **Status:** confirmed
- **Sources:** EAC-09
- **Where:** `lib/connections/prometheus.ts:84-86`, `:90-95`, `:141-143`, `:147-149`; `actions/prometheus-status.ts:66-75`
- **Evidence:**
  - **Error body discarded:** `prometheus.ts:84-86` is ``if (!response.ok) { return { success: false, error: `Query validation failed: ${response.statusText}` } }``. `:141-143` does the same for query_range.
  - **Dead error branch:** the `data.error` branches only run on 2xx, where `status` is always "success".
  - **Prometheus contract:** it documents these errors, each with body `{status: "error", errorType, error}`:
    - 400 for bad parameters;
    - 422 when an expression cannot be executed;
    - 503 on a timeout or abort.
  - **Not logged:** `actions/prometheus-status.ts:66-75` turns a failure into unknown segments without logging `result.error`.
- **Impact:**
  - An admin who saves an invalid PromQL query sees "Query validation failed: Bad Request" instead of the parse error.
  - The member-facing status bar silently shows unknown segments, and no reason is logged.
- **Recommendation:**
  - On non-2xx, parse the JSON body and return `${errorType}: ${error}`.
  - Treat 503 as retryable, or as a timeout.
  - Log the error in `prometheus-status.ts`.
- **Effort:** S

#### GAP-10: PMS reads use legacy routes, an undocumented `limit` parameter and GET for scrobble

- **Severity:** Info
- **Status:** adjusted. The `plex-search.ts` line numbers were corrected. The deprecation risk is speculative, because python-plexapi uses the same routes.
- **Sources:** EAC-10
- **Where:** `lib/connections/plex-marking.ts:21-28`; `lib/connections/plex-search.ts:30`, `:71`; `lib/connections/plex-sessions.ts:74`, `:101`
- **Evidence:**
  - **What the code calls:**
    - `plex-marking.ts:21-28` calls `${config.url}/:/scrobble?identifier=com.plexapp.plugins.library&key=${ratingKey}&X-Plex-Token=...` with `method: "GET"`.
    - `plex-search.ts:30` calls `/search?query=${encodeURIComponent(query)}`, and `:71` maps the results through `(item: any)`.
    - `plex-sessions.ts:74` calls `/library/recentlyAdded?limit=${limit}`, and `:101` calls `/library/onDeck`.
  - **What the spec documents:** the PMS OpenAPI (developer.plex.tv, as packaged in `@lukehagar/plexjs` 0.43.0) lists:
    - PUT `/:/scrobble`;
    - `/hubs/search`;
    - `/hubs/continueWatching`;
    - `/library/sections/all`;
    - paging with `X-Plex-Container-Start`/`Size`, not `limit`.
  - **De-facto stable:** python-plexapi itself issues GET `/:/scrobble` (`mixins/played_unplayed.py:11-13`) and uses `/library/onDeck` and `/library/recentlyAdded` (`library.py:154`, `:159`).
- **Impact:**
  - Nothing is broken today.
  - The chatbot's "recently added N" may ignore N.
  - On-deck and search results reflect the owner token's scope. The `/mark` side effects are SEC-48.
- **Recommendation:**
  - Page with `X-Plex-Container-Size`, as plexapi does for maxresults.
  - Validate the subset of Metadata you read with Zod.
  - Moving to the documented operations is optional.
- **Effort:** S

### 2. Operations, deployment and documentation

#### GAP-11: The documented install and upgrade commands (`db push`, `migrate dev`) are development tools that do not match the image's `migrate deploy`

- **Severity:** Medium
- **Status:** adjusted (lowered from high). The image path is correct, and several "silent data loss" claims were corrected (see Impact).
- **Sources:** OPS-DOC-01
- **Where:** `README.md:137-141`, `:207-208`, `:257-260`; `CLAUDE.md:386-388`, `:688`; `package.json:25-26`; `docker-entrypoint.sh:5`; `.github/workflows/build.yml:88`; `.agents/planning/2026-07-04-discord-enhancements/RELEASE_NOTES.md:33-34`; `prisma/migrations/20260703000000_add_stripe_subscriptions/migration.sql:18`; `prisma/migrations/20251228065125_add_multi_service_auth/migration.sql:18-27`; `lib/access.ts:68-96`
- **Evidence:**
  ```json
  // package.json:25-26
  "db:push": "prisma db push",
  "db:migrate": "SKIP_SEED=true prisma migrate dev",
  ```
  - **What the docs say:**
    - README installs with `npm run db:generate` then `npm run db:push` (`:137-141`).
    - README calls `db:migrate` "Run database migrations" (`:208`) and "Create migration (production)" (`:259-260`).
    - CLAUDE.md says the same (`:387`, and deploy step `:688`: "Run database migrations: npm run db:migrate").
    - So do the only upgrade notes (`RELEASE_NOTES.md:33-34`).
  - **What actually deploys:** no npm script runs `prisma migrate deploy`. Only `docker-entrypoint.sh:5` (under `set -e`) and CI (`build.yml:88`) do.
  - **`db push`:** it records no `_prisma_migrations` history, so `migrate deploy` on such a database fails with P3005 ("The database schema is not empty...").
  - **`migrate dev`:**
    - it needs a shadow database, which requires the CREATEDB privilege;
    - it writes new migration files from local schema changes;
    - on drift it offers `prisma migrate reset` behind an interactive prompt.
  - **Skipped data SQL:** `db push` skips the data SQL inside migrations. That includes `UPDATE "User" SET "isExempt" = true, "exemptReason" = 'grandfathered';` (`add_stripe_subscriptions:18`). Once `stripeEnabled` is on, `lib/access.ts:74-96` then denies every non-exempt user without a subscription.
- **Impact:**
  - **Switching to the image:** a README-built install crash-loops when moved to the Docker image (P3005 under `set -e`). It is recoverable, but only with an undocumented `prisma migrate resolve` baseline.
  - **A dev command against production:** operators who "run database migrations" as documented run a development command against production. It fails without CREATEDB and can generate stray migrations. It drops nothing on its own; it only offers `migrate reset` behind a confirmation.
  - **Members gated after enabling Stripe:** on an install upgraded with `db push`, the grandfather UPDATE never ran, so every pre-existing member is gated to /subscribe once an admin turns Stripe on. An admin can fix this by marking users exempt. While Stripe is off, `lib/access.ts:68-71` fast-paths to allowed.
  - **Ruled out:** `db push` will not silently drop `onboardingCompleted` while it holds data; it prompts, or needs `--accept-data-loss`.
- **Recommendation:**
  - Add `"db:deploy": "prisma migrate deploy"`, and make it the documented install and upgrade command in README step 4 and the CLAUDE.md Deployment Checklist (`:688`).
  - Label `db:push` and `db:migrate` as contributor-only, in the README command table and in CLAUDE.md `:386-388`.
  - Add a short "installed with db push?" note:
    1. Check the database with `prisma migrate diff`.
    2. Mark each existing migration with `prisma migrate resolve --applied`.
    3. Run the Stripe grandfather UPDATE by hand before enabling Stripe.
  - Leave `e2e/README.md:201` as is; it refers to a test database.
- **Effort:** S

#### GAP-12: The Discord bot never starts if it is disabled or unconfigured at boot, so every fresh install needs a restart; the docs contradict the `ENABLE_DISCORD_BOT` default

- **Severity:** Medium
- **Status:** confirmed
- **Sources:** OPS-DOC-07
- **Where:** `lib/instrumentation/node.ts:168`, `:177-187`, `:219`, `:256`; `lib/discord/lock.ts:26-36`, `:119`; `lib/discord/lock/poller.ts:180-190`; `actions/setup.ts:336-380`; `actions/discord.ts:37-102`; `docs/discord-bot.md:3-4`, `:53-55`, `:63-65`, `:88`, `:151-152`; `example.env:40`
- **Evidence:**
  ```ts
  // lib/instrumentation/node.ts:177-182, runs once inside register(), before the poller is built (:219) and started (:256)
  const { isDiscordBotEnabled } = await import("@/lib/discord/lock")
  const botEnabled = await isDiscordBotEnabled()
  if (!botEnabled) {
    logger.debug("Discord bot disabled in database settings")
    return
  }
  ```
  - **The check is false on fresh installs:** `isDiscordBotEnabled` returns `integration?.botEnabled ?? false` and maps any DB error to false (`lib/discord/lock.ts:26-36`). On a fresh install the DiscordIntegration row does not exist at first boot.
  - **Nothing starts the poller later:**
    - The poller re-checks `isEnabled()` every tick (`poller.ts:180-190`), but only once it has started.
    - Saving `botEnabled` from the setup wizard (`actions/setup.ts:336-380`) or admin settings (`actions/discord.ts:37-102`) never starts it.
    - The only other `new BotLockPoller` is in the unused facade (`lock.ts:119`, DUP-07).
  - **The docs overstate it:** they say the bot "runs automatically with the Next.js process" (`:3-4`) and that setting the token "takes effect without a redeploy" (`:63-65`). They never mention the DB "bot enabled" switch.
  - **The docs contradict themselves on the env default:**
    - Enabled by default: `:53-55` and `example.env:40`, which match `node.ts:168` (`!== "false"`).
    - Off unless set: "only starts when `ENABLE_DISCORD_BOT="true"`" (`:88`, `:151-152`).
- **Impact:**
  - An admin who enables the bot in the wizard or settings sees it stay offline indefinitely, until a process restart that the docs never mention. The only signal is a debug-level log line.
  - A transient DB error at boot disables the bot until the next restart.
  - Nit: the "proceed anyway" catch at `:183-187` can still fire if the dynamic import fails, but not on DB errors.
- **Recommendation:**
  - Always construct and start the poller unless `ENABLE_DISCORD_BOT` is "false", and delete the boot-time short-circuit. The poller already gates on `isEnabled` every tick.
  - Log at info level while waiting for enablement or a token.
  - Change `docs/discord-bot.md:88` and `:151-152` to "enabled by default; set to "false" to opt out".
  - Document the Admin → Discord "Bot enabled" switch as the primary control.
- **Effort:** S

#### GAP-13: Discord slash-command registration crashes as documented and cannot be run from the image

- **Severity:** Medium
- **Status:** confirmed (reproduced in a scratch directory)
- **Sources:** OPS-DOC-06
- **Where:** `scripts/register-discord-commands.ts:21-22`, `:25-32`; `lib/discord/commands/mystats.ts:37`; `lib/prisma.ts:69-72`, `:120`; `docs/discord-bot.md:57`, `:77`, `:149-150`; `example.env:39-47`; `Dockerfile:48-67`; `CLAUDE.md:680`
- **Evidence:**
  ```ts
  // scripts/register-discord-commands.ts:25-29 (compiled as commonjs, so the requires run in this order)
  import { REST, Routes } from "discord.js"
  import dotenv from "dotenv"
  import { COMMANDS } from "@/lib/discord/commands/registry"
  dotenv.config()
  ```
  - **Import chain:**
    - The registry imports mystats, which imports `@/lib/prisma` (`mystats.ts:37`).
    - That module calls `createPrismaClient()` at load time (`lib/prisma.ts:120`).
    - `createPrismaClient()` throws "DATABASE_URL environment variable is not defined" (`:69-72`) unless DATABASE_URL is already exported in the shell.
  - **Reproduced:**
    - With DATABASE_URL unset, or present only in `.env`, the script exits 1 at `lib/prisma.ts:71`.
    - With an exported DATABASE_URL, even an unreachable one, it proceeds.
    - So both the script's own usage note ("Or set these in your .env file", `:21-22`) and the documented command (`docs/discord-bot.md:77`) fail.
    - The metadata script imports no Prisma and works.
  - **Env-only inputs:**
    - The scripts read only `process.env.DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID || NEXT_PUBLIC_DISCORD_CLIENT_ID`, while the docs say to keep the token in the DB ("Fallbacks only", `:57`).
    - `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` are missing from `example.env:39-47`.
  - **Not in the image:** the image copies only the standalone bundle, `prisma/` and the entrypoint (`Dockerfile:48-67`). `scripts/`, `tsconfig.scripts.json` and the TS sources are absent.
  - **No other registration path:** the bot never registers commands itself; `Routes.applicationCommands` appears only in the script.
  - **Docs and dependencies:** CLAUDE.md `:680` lists only the metadata script, and `tsconfig-paths` is undeclared (DUP-15).
- **Impact:**
  - Since the removal of the `!` commands, slash commands are the bot's whole interface. Docker operators, and anyone who stored the token in the DB as documented, get a bot whose commands never appear.
  - The troubleshooting tip (`docs/discord-bot.md:149-150`) points back to the failing command.
  - From a checkout the error is explicit, and exporting DATABASE_URL works around it. Docker-only operators need a full checkout and toolchain.
- **Recommendation:**
  - **Best:** register commands from the bot when it acquires the lock (`client.application.commands.set(COMMANDS.map(c => c.data))`, an idempotent overwrite), using the DB token and client id. Then no separate step exists.
  - **If the script stays:**
    - make `import "dotenv/config"` its first import;
    - keep the registry's `data` builders free of DB imports;
    - fall back to the DB values;
    - add `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` to example.env;
    - list the script in CLAUDE.md.
- **Effort:** S

#### GAP-14: No backup, restore or state inventory anywhere, while every container start applies migrations with no pre-flight step

- **Severity:** Medium
- **Status:** adjusted (lowered from high). The "locks everyone out" impact belongs to SEC-32, and it applies only when encryption is enabled.
- **Sources:** OPS-DOC-02
- **Where:** `docker-entrypoint.sh:2-5`; `Dockerfile:75`; `docker-compose.yml:14`, `:61`, `:68-71`; `lib/prisma.ts:23-35`; `lib/security/crypto.ts:57`; `lib/security/ip-hash.ts:15-25`; `lib/plex-auth.ts:28`; `app/api/stripe/webhook/route.ts:93-100`; `lib/queue/jobs/stripe.ts:344-348`; `README.md:282`
- **Evidence:**
  - **Docs:** `grep -rniE "backup|restore|pg_dump|upgrad|rollback"` across README, docs, example.env, CLAUDE.md and the Docker files returns one line: `docs/discord-bot.md:12`, "Re-run the command registration script after upgrading".
  - **Entrypoint:** `docker-entrypoint.sh` is `set -e`, then `npx prisma migrate deploy`, then `exec "$@"`. It has no backup hook, no opt-out and no dry run.
  - **State that must survive, none of it documented:**
    1. Postgres, which holds every integration secret (ENCRYPTED_FIELDS, `lib/prisma.ts:23-35`):
       - `User.plexAuthToken` and `PlexServer.token`;
       - `DiscordIntegration.clientSecret` and `botToken`;
       - `Config.stripeSecretKey` and `stripeWebhookSecret`;
       - the service API keys.
    2. `ENCRYPTION_KEY` (`crypto.ts:57`), when set (SEC-32, SEC-33).
    3. `NEXTAUTH_SECRET`, which signs sessions and salts the share-visit IP hashes (`ip-hash.ts:15-25`).
    4. `PLEX_CLIENT_IDENTIFIER`, which identifies the app to plex.tv (`plex-auth.ts:28`).
    5. Redis AOF (`docker-compose.yml:61`). The webhook returns `{ received: true }` right after `addJob` (`route.ts:93-100`), and the StripeEvent row is written only inside the job (`jobs/stripe.ts:344-348`).
  - **Dead mount:** nothing in app, lib or actions reads the `./data:/data` mount (`docker-compose.yml:14`).
- **Impact:**
  - **No answer in the docs:** an operator cannot work out what to back up.
  - **Upgrades cannot be undone:** migrations run on every start and Prisma has no down migrations. A bad upgrade can only be undone from a backup that nothing told the operator to take.
  - **Encryption key:** dumping Postgres without ENCRYPTION_KEY locks everyone out (SEC-32). Encryption is off by default (SEC-33), though, so for default installs a plain `pg_dump` holds every secret.
  - **Other secrets:** a changed NEXTAUTH_SECRET or PLEX_CLIENT_IDENTIFIER only forces re-logins.
  - **Redis:** jobs lost with Redis are Stripe events that must be resent from the dashboard. The window is narrow.
- **Recommendation:**
  - Add a short operations section listing what to keep:
    - Postgres (mandatory);
    - ENCRYPTION_KEY (mandatory when set);
    - NEXTAUTH_SECRET and PLEX_CLIENT_IDENTIFIER, to avoid forced re-logins;
    - Redis AOF (optional), since pending Stripe events can be resent.
  - Include `pg_dump -Fc` and `pg_restore` commands for the compose `db` service.
  - Include a "take a dump before upgrading" step.
  - Optionally honour `SKIP_MIGRATIONS` in the entrypoint.
  - Drop the unused `./data` mount.
- **Effort:** S

#### GAP-15: Stripe can be enabled without Redis: the documented prerequisite is not checked, so webhooks return 500 and comp grants half-apply

- **Severity:** Low
- **Status:** adjusted. Provisioning is delayed, not lost: Stripe retries for days, and the events succeed once REDIS_URL is set. BP-20 already ruled the 500 itself acceptable.
- **Sources:** OPS-DOC-12
- **Where:** `actions/admin/admin-config.ts:300-310`, `:472-484`; `app/api/stripe/webhook/route.ts:93`; `lib/queue/connection.ts:33`, `:41`; `actions/admin/subscriptions.ts:141-152`, `:165-169`; `docs/stripe.md:71-72`, `:124-130`, `:224`
- **Evidence:**
  - **Enable guard:**
    - `getMissingStripeConfig` checks only `hasSecretKey`, `hasWebhookSecret` and `priceIds.length` (`admin-config.ts:300-309`), and `setStripeEnabled` applies it (`:472-484`).
    - `docs/stripe.md:124-130` lists the same three blockers.
    - Elsewhere the docs call REDIS_URL required: `docs/stripe.md:71-72` and `:224`, `example.env:181`, `README.md:274`.
  - **Webhook without Redis:**
    - `addJob(JOB_TYPES.STRIPE_WEBHOOK, ...)` (`route.ts:93`) reaches `getRedisUrl()`.
    - `getRedisUrl()` throws "REDIS_URL environment variable is required for queue operations" (`connection.ts:33`).
    - The route has no try/catch.
  - **Comp grant order:** `grantAccess` writes `isExempt: true, exemptReason: "comp"` before `addJob(PLEX_ACCESS_GRANT, ...)` (`subscriptions.ts:141-152`).
- **Impact:**
  - **Paid gating with no worker:** an operator can switch it on. Checkouts succeed in Stripe, but nobody is provisioned until Redis is configured; Stripe's retries cover that window.
  - **Comp grants half-apply:** the user is marked exempt but never invited. The admin sees the error (`:165-169`), and a retry is idempotent.
  - **Not toggle-dependent:** the comp path misbehaves whatever the Stripe toggle says.
- **Recommendation:**
  - Add `isRedisConfigured()` (already exported at `connection.ts:41`) to `getMissingStripeConfig` as "job queue (REDIS_URL)", so the toggle hint and `setStripeEnabled` both block.
  - In `adminGrantAccess`:
    - fail fast when Redis is not configured;
    - revert the exemption if `addJob` throws;
    - do not reorder the write and the enqueue, because the grant job should be able to check `isExempt` (SEC-28 recommends an entitlement check there).
  - Add the queue to the blocker list in the docs.
  - Leave the webhook's 500 behaviour as is (BP-20).
- **Effort:** S

#### GAP-16: Production deployment is undocumented: the only compose file is a dev harness that overrides `.env`, the image is never named, and `start:prod` works only inside the image

- **Severity:** Low
- **Status:** adjusted (lowered from medium). `npm run start` works with a warning, and the compose file is explicitly for development. SEC-04 and BP-02 already cover the production compose file and naming the GHCR image.
- **Sources:** OPS-DOC-05
- **Where:** `README.md:199`, `:310-316`; `docker-compose.yml:8`, `:14`, `:17-24`, `:28-29`; `Dockerfile:14`, `:49`; `package.json:15`; `next.config.js:4`; `node_modules/next/dist/server/next.js:225-227`; `docs/discord-bot.md:92`; `CLAUDE.md:686-692`
- **Evidence:**
  - **README Docker section** (`:310-316`): three bullets. It does not:
    - name the image (docker-publish.yml pushes `ghcr.io/${{ github.repository }}`);
    - name a compose file, volumes or Redis;
    - say that the container runs `migrate deploy` on every start.
  - **`docker-compose.yml` is a dev harness:**
    - `container_name: plex-wrapped-dev` (`:8`), `NODE_ENV=development` (`:20`), `stdin_open`/`tty` (`:28-29`).
    - It has no `target:`, so it builds the `runner` stage, not the `dev` stage that `Dockerfile:14` says is "for docker-compose".
    - After `env_file: - .env` (`:17-18`), its `environment:` block hard-codes `DATABASE_URL=postgresql://postgres:postgres@db:5432/plex_wrapped`, `NEXT_PUBLIC_APP_URL=http://localhost:3000` and `NEXTAUTH_URL=http://localhost:3000` (`:21-24`). Compose gives `environment` precedence over `env_file`.
  - **`start:prod`:**
    - `package.json:15` defines `"start:prod": "node server.js"`, but `output: 'standalone'` (`next.config.js:4`) writes `.next/standalone/server.js`.
    - Only the Dockerfile copies that file to the app root (`:49`).
    - CLAUDE.md `:690` says `npm run start:prod (uses server.js)`.
    - `next start` with standalone output only warns and continues (`next.js:225-227`).
- **Impact:**
  - There is no supported recipe for the most common self-host target.
  - Operators who adapt the dev compose file silently get localhost callback URLs, which break Plex login, Discord OAuth and Stripe returns, and they run with dev database credentials.
  - Bare-metal operators following CLAUDE.md hit a missing `server.js`.
- **Recommendation:**
  - Fix CLAUDE.md `:686-692`: use `migrate deploy`, and start with either `npm run start` or `node .next/standalone/server.js` (with `.next/static` and `public` copied).
  - Expand the README Docker section: say that the entrypoint runs `migrate deploy`, and name the image once BP-02 is fixed.
  - Rename the compose file or comment it as dev-only, and deliver the production compose file under SEC-04.
  - Remove the dead `./data` mount and the unused `dev` stage.
- **Effort:** M

#### GAP-17: Moving host or domain is undocumented: `NEXT_PUBLIC_APP_URL` is frozen at build time for non-Docker builds, and four external registrations must be changed by hand

- **Severity:** Low
- **Status:** adjusted (lowered from medium). Build-time inlining is standard Next.js behaviour, and the image path is unaffected. The share page's self-fetch is BP-23 and SEC-26.
- **Sources:** OPS-DOC-04
- **Where:** `lib/utils.ts:33-53`; `node_modules/next/dist/build/define-env.js:52`, `:60`; `lib/plex-auth.ts:127-128`; `lib/discord/integration.ts:14-16`, `:120`; `lib/stripe/checkout.ts:68`; `actions/subscription.ts:162`; `app/(app)/wrapped/share/[token]/page.tsx:12`, `:38`; `lib/discord/config.ts:101-106`; `prisma/schema.prisma:62-145`; `docs/discord-bot.md:39-40`; `docs/stripe.md:101-114`; `README.md:288-308`; `.dockerignore:23-25`
- **Evidence:**
  - **One base URL for everything:** `getBaseUrl()` returns `process.env.NEXT_PUBLIC_APP_URL`, else `NEXTAUTH_URL` (`lib/utils.ts:33-53`). It builds:
    - the Plex PIN `forwardUrl` (`plex-auth.ts:127-128`);
    - the Discord `redirect_uri` (`integration.ts:14-16`, `:120`);
    - the Stripe Checkout and Portal return URLs (`checkout.ts:68`, `subscription.ts:162`);
    - the share page's self-fetch and OG URL.
  - **Build-time inlining:**
    - Next spreads every `NEXT_PUBLIC_*` value present at build time into all bundles, the server bundle included (`define-env.js:52`, `:60`).
    - The README path (`cp example.env .env`, then `npm run build`) therefore bakes in `http://localhost:3000`.
    - Docker builds escape this only because `.dockerignore` drops `.env`.
  - **Domain-bound registrations:**
    - the Discord redirect (`docs/discord-bot.md:39-40`);
    - the Stripe endpoint and its per-endpoint whsec (`docs/stripe.md:101-114`);
    - the Discord Linked Roles verification URL, which is not documented at all.
  - **Other stale URLs:**
    - `getDiscordPortalUrl` prefers `PLEX_WRAPPED_BASE_URL`, ignores `NEXTAUTH_URL`, and falls back to `"http://localhost:3000"` (`config.ts:101-106`).
    - Service `url` and `publicUrl` columns live in the DB (`schema.prisma:62-145`).
- **Impact:** after a domain change, non-Docker installs keep emitting the old domain until rebuilt:
  - Plex login returns users to the old host.
  - Discord linking fails with an invalid redirect_uri.
  - Stripe keeps posting to the old URL, so paid users are not provisioned.
  - Share links break.

  Nothing in the docs helps diagnose it. Domain moves are rare, and re-registering OAuth and webhook endpoints is inherent to any self-hosted app.
- **Recommendation:**
  - Add a "Changing your domain" checklist:
    - set both URL variables, and rebuild if not using the image;
    - update the Discord redirect and the Linked Roles URL;
    - create a new Stripe endpoint and whsec;
    - update the service public URLs.
  - Make `getDiscordPortalUrl` fall back to `getBaseUrl()`.
  - Optionally read a runtime-only `APP_URL` ahead of `NEXT_PUBLIC_APP_URL` on the server.
- **Effort:** S

#### GAP-18: The env reference is incomplete and partly wrong: 12 app variables are missing from example.env, and the README production list omits the required `PLEX_CLIENT_IDENTIFIER`

- **Severity:** Low
- **Status:** confirmed. Correction: the server test-auth gate also requires `NODE_ENV !== "production"`, so leftover test flags cannot enable test auth in production.
- **Sources:** OPS-DOC-09
- **Where:** `example.env:28`, `:30-33`, `:47`; `README.md:284-302`; `lib/plex-auth.ts:27-36`; `lib/auth.ts:40-43`; `app/auth/callback/plex/callback-client.tsx:33-36`; `lib/discord/config.ts:101-106`; `lib/instrumentation/node.ts:106`, `:125`; `lib/connections/jellyfin-core.ts:48`; `actions/dev-defaults.ts:176-178`
- **Evidence:**
  - **Read by code but missing from example.env:**
    - `DISCORD_CLIENT_ID`, `NEXT_PUBLIC_DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` (scripts);
    - `ENABLE_WATCHLIST_SYNC` (`node.ts:106`) and `WATCHLIST_SYNC_POLL_INTERVAL_MS` (`node.ts:125`, default 60000);
    - `JELLYFIN_DEVICE_ID` (`jellyfin-core.ts:48`, default "plex-wrapped-server");
    - `DEV_PROMETHEUS_NAME`, `DEV_PROMETHEUS_URL` and `DEV_PROMETHEUS_QUERY` (`dev-defaults.ts:176-178`);
    - `ENABLE_TEST_AUTH` (`auth.ts:43`), `SKIP_CONNECTION_TESTS` (11 sites, not gated on NODE_ENV, DUP-03) and `SKIP_SEED` (`seed.ts:5`).
    - Platform variables (HOSTNAME, NODE_ENV, NEXT_RUNTIME) are also unlisted.
  - **Required variable missing from the README:**
    - README "Production Deployment Requirements" (`:284-302`) lists 4 variables and omits `PLEX_CLIENT_IDENTIFIER`. It is mentioned in install step 3.
    - Login needs it: `throw new Error("PLEX_CLIENT_IDENTIFIER is not set ...")` (`plex-auth.ts:27-36`).
    - example.env ships it empty (`:28`).
  - **Wrong test flag:**
    - example.env `:30-33` offers only `NEXT_PUBLIC_ENABLE_TEST_AUTH="true"` to "Enable test token authentication".
    - The server gate is `NODE_ENV === 'test' || ENABLE_TEST_AUTH === 'true'` (`auth.ts:40-43`).
    - The public flag only unlocks the client half (`callback-client.tsx:33-35`).
  - **Wrong description:** example.env `:47` says `PLEX_WRAPPED_BASE_URL` is "Only needed for external API access (bot uses direct function calls)". In fact it is the first choice for the Discord portal base (`config.ts:101-106`).
- **Impact:**
  - Operators cannot find the knobs for watchlist polling, Jellyfin device identity or command registration.
  - They can deploy without `PLEX_CLIENT_IDENTIFIER` and only learn at first login.
  - A leftover `PLEX_WRAPPED_BASE_URL` silently redirects Discord users.
- **Recommendation:**
  - Generate the env reference from one Zod env schema (the `lib/env.ts` proposed in SEC-09). Render example.env and a README table from it, with name, required in prod, default and description.
  - Put `SKIP_CONNECTION_TESTS`, `ENABLE_TEST_AUTH`, `NEXT_PUBLIC_ENABLE_TEST_AUTH` and `E2E_PORT` in a separate test-only block.
  - Add `PLEX_CLIENT_IDENTIFIER` to the README production list, with a generation hint (`openssl rand -hex 16`).
  - Correct the `PLEX_WRAPPED_BASE_URL` text and the Redis-fallback text.
- **Effort:** S

#### GAP-19: The Prisma CLI honours `?schema=` in DATABASE_URL but the runtime adapter ignores it, so a non-public schema splits migrations from queries

- **Severity:** Low
- **Status:** confirmed
- **Sources:** OPS-DOC-10
- **Where:** `example.env:3`; `lib/prisma.ts:73-75`; `node_modules/@prisma/adapter-pg/dist/index.js:758`; `prisma.config.ts:11`
- **Evidence:**
  - **Docs:** example.env documents `postgresql://[user]:[password]@[host]:[port]/[database]?schema=public` (`:3`).
  - **Runtime ignores it:**
    - `lib/prisma.ts:73-75` builds `new PrismaPg({ connectionString: process.env.DATABASE_URL })` with no options.
    - The adapter reports `schemaName: this.pgOptions?.schema` (`index.js:758`), which comes only from the second constructor argument.
    - `pg` ignores a `schema` URL parameter.
  - **The CLI honours it:** it reads `url: process.env.DATABASE_URL` (`prisma.config.ts:11`) and applies migrations into the URL's schema.
- **Impact:**
  - An operator who shares a Postgres database and sets `?schema=plex_manager` gets the migrations in that schema.
  - The app meanwhile queries the role's default search_path, so it fails with "relation does not exist" or reads unrelated tables.
  - Every shipped config uses `public`, so only operators who change it are affected.
- **Recommendation:**
  - Parse `new URL(DATABASE_URL).searchParams.get("schema")` in `createPrismaClient` and pass `new PrismaPg({ connectionString }, { schema })`.
  - Or document that only `public` is supported, and drop the parameter from example.env.
- **Effort:** S

#### GAP-20: No versioned releases, changelog or upgrade notes

- **Severity:** Low
- **Status:** adjusted (lowered from medium):
  - `sha-*` tags can be pinned, so rollback is not targetless.
  - Some breaking changes do have notes.
  - Multi-replica rolling updates are not a documented deployment mode.
- **Sources:** OPS-DOC-03
- **Where:** `.github/workflows/docker-publish.yml:8-10`, `:59-61`; `package.json:3`; `.agents/planning/2026-07-04-discord-enhancements/RELEASE_NOTES.md:3`; `docs/discord-bot.md:7-12`; `README.md:102`; `prisma/migrations/20251206172926_remove_maintenance_tables/migration.sql:26-35`; `prisma/migrations/20251228065125_add_multi_service_auth/migration.sql:27`
- **Evidence:**
  - **No versions to pin:**
    - Semver image tags are produced only `on: push: tags: - 'v*'` (`docker-publish.yml:8-10`; `:59-61` has `type=semver,pattern={{version}}`).
    - `gh api repos/mchestr/plex-manager/tags` and `/releases` both return 0.
    - `package.json:3` is still `"version": "0.1.0"`.
    - The only published tags are `latest`, `main` and `sha-*`, and those can come from unmerged PRs (BP-02).
  - **No changelog:** the repo has no CHANGELOG. The only release notes ("Breaking change: `!`-prefix commands removed ... clean break") live in an internal `.agents/planning` folder that README does not link.
  - **No down path:** destructive migrations such as `DROP TABLE "MaintenanceCandidate"` and `ALTER TABLE "User" DROP COLUMN "onboardingCompleted"` have no upgrade note, and Prisma has no down migrations.
- **Impact:**
  - Operators cannot tell what an update will do before pulling it, and can pin only by sha.
  - Rolling back after a DROP needs a database restore, whatever the tagging.
  - Breaking changes, such as bot commands disappearing or intents changing, are discovered in production. `docs/discord-bot.md:7-12` and `README.md:102` carry partial notes, and the project is labelled WIP.
- **Recommendation:**
  - After BP-02 is fixed, cut `v0.x.y` tags.
  - Keep a CHANGELOG.md with an "Upgrade notes / Breaking" section, and move the Discord release notes into it.
  - State in the README that `:latest` tracks main, and that rolling back means restoring the pre-upgrade dump and running the previous tag.
- **Effort:** M

#### GAP-21: README feature and security claims are partly false or overstated, and several shipped features are not mentioned

- **Severity:** Low
- **Status:** adjusted (lowered from medium). This is documentation-only, the README opens with a "Work In Progress" warning, and the security half duplicates existing findings.
- **Sources:** OPS-DOC-08
- **Where:** `README.md:9`, `:59`, `:61`, `:62`, `:78`, `:83`, `:117`, `:152-156`, `:165`, `:274`, `:306`, `:316`, `:324`, `:360`, `:372`, `:375`; `example.env:156-157`; `components/onboarding/onboarding-steps/discord-support-step.tsx:45-70`; `lib/discord/routing/dm-router.ts:179`; `actions/prometheus-status.ts:27-32`; `types/setup.ts:9-50`; `lib/queue/connection.ts:33`
- **Evidence:**
  - **"Issue Reporting workflow"** (`:9`, `:59`): only static onboarding copy that points at Discord (`discord-support-step.tsx:45-70`). There is no issue model, action or route.
  - **"Discord ... announcements"** (`:61`, `:360`): the bot never posts to channels. The only non-reply send in `lib/discord` is `message.channel.sendTyping()` (`dm-router.ts:179`). Announcements are in-app only.
  - **"Service Status monitoring for all connected platforms"** (`:62`): one optional Prometheus range query for one service (`prometheus-status.ts:27-32`).
  - **"background jobs fall back to PostgreSQL polling"** (`:274`, `example.env:156-157`): only watchlist sync has a fallback, and it is broken (DUP-07, SEC-49). Stripe jobs throw without Redis (`connection.ts:33`).
  - **Stale facts:**
    - "Next.js 14+" (`:324`); 16.1.1 is installed.
    - `cd plex-wrapped` and a `plex-wrapped/` tree (`:117`, `:165`).
    - A 4-service wizard list (`:152-156`); the wizard has 9 steps (`types/setup.ts:9-50`).
  - **Security bullets already covered elsewhere:**
    - "fails to start" (`:306`, `:316`): SEC-09.
    - Zod everywhere (`:375`): BP-04, SEC-56, DUP-03.
    - Rate limiting: SEC-24, SEC-25.
    - Audit logging (`:83`, `:380`): SEC-55.
    - Role-based access control (`:78`): SEC-12.
    - "Only users with access to your Plex server can sign in" (`:372`): Stripe non-members, invitees and Jellyfin users can too.
  - **Omitted features:** `grep -i 'jellyfin|prometheus|watchlist|invite|chatbot' README.md` matches only the Stripe invite line. Missing:
    - Jellyfin;
    - invite codes;
    - watchlist sync, which files Overseerr requests as the admin (SEC-27);
    - the admin chatbot and the Discord assistant;
    - prompt templates;
    - the Rewind name.
- **Impact:**
  - Operators configure the app for capabilities it lacks: issue tracking, Discord announcements, multi-service monitoring.
  - They miss features that change server behaviour: auto-filed Overseerr requests, Jellyfin login and invites.
- **Recommendation:**
  - Reword or remove the issue-reporting, Discord-announcement and all-platform status claims.
  - Fix the clone directory, framework version, wizard list and Redis-fallback sentence.
  - Add Jellyfin, invites, watchlist sync (with the SEC-27 caveat), the AI assistant and Prometheus.
  - Update the security bullets as SEC-55, SEC-24 and BP-04 are fixed, rather than tracking them here.
- **Effort:** S

#### GAP-22: CLAUDE.md documents client APIs that do not exist, plus wrong path, test and stack facts

- **Severity:** Low
- **Status:** adjusted:
  - ENCRYPTION_KEY and REDIS_URL are optional by design, so leaving them out of "Required" is correct.
  - The cross-browser claim is already in BP-10.
  - `lib/discord/bot.ts` exists.
- **Sources:** OPS-DOC-11
- **Where:** `CLAUDE.md:9`, `:41`, `:48`, `:273`, `:275`, `:480-483`, `:507-510`, `:591-594`, `:678`, `:680`, `:735`; `lib/connections/plex.ts`; `lib/connections/tautulli.ts:166`; `lib/connections/llm-provider.ts:4`; `lib/llm/chat.ts:74`; `playwright.config.ts:44-56`; `package.json:30`
- **Evidence:**
  - **Nonexistent APIs:** `getPlexClient().getLibrary()` (`:480-483`), `getTautulliClient().getHistory()` (`:507-510`) and `getLLMProvider().chat()` (`:591-594`) match nothing outside CLAUDE.md. The real APIs are functions that take a config:
    - `lib/connections/plex.ts` is a barrel (`getPlexLibrarySections`, `getPlexSessions`, ...);
    - Tautulli has `getTautulliHistory(config, userId?, limit)` (`tautulli.ts:166`);
    - `testLLMProviderConnection` is the only export of `llm-provider.ts` (`:4`);
    - chat goes through `callChatLLM(config, messages, tools?)` (`lib/llm/chat.ts:74`).
  - **Paths:**
    - `app/wrapped/` (`:41`) is really `app/(app)/wrapped/`.
    - `components/setup-wizard/` (`:48`) is really `components/setup/setup-wizard/`.
    - Commands live in `lib/discord/commands/` (the registry plus per-command files), not in `lib/discord/bot.ts` (`:678`). bot.ts is the client and interaction entry point.
  - **Tests:**
    - "Use setup project for auth state" (`:273`) is wrong: the Playwright projects are `chromium` and `setup-wizard` (`playwright.config.ts:44-56`), and auth comes from `e2e/fixtures/auth.ts`.
    - The Chrome/Firefox/WebKit claim (`:275`, `:735`) is already in BP-10.
  - **Stack and scripts:**
    - "Next.js 14+" (`:9`) is outdated; the dependency is `^16.1.1`.
    - `npm run register-discord-commands` (`package.json:30`) is never mentioned (`:680`).
- **Impact:** CLAUDE.md drives the coding agents. They will write code against clients that do not exist and look for directories that do not exist.
- **Recommendation:**
  - Replace the three integration snippets with the real pattern: load the active config row, then call `getTautulliHistory(config, userId)`, `callChatLLM(config, messages)` and the `plex.ts` barrel functions.
  - Fix the file tree.
  - Describe Playwright as chromium-only with fixture-based auth, and cross-reference BP-10.
  - Update the stack to Next.js 16.
  - Point the Discord section at `lib/discord/commands/` and add `register-discord-commands`.
  - Optionally list ENCRYPTION_KEY as "Recommended".
  - The deploy-checklist fixes belong to GAP-11 and GAP-16.
- **Effort:** S

### 3. Jellyfin parity

#### GAP-23: Stripe gating applies to Jellyfin-only members, but grant and revoke only act on Plex: paying sends a Plex invite to the username-derived email, and the paywall never controls Jellyfin access

- **Severity:** Medium
- **Status:** adjusted (lowered from high). The verifier found no Jellyfin revenue leak, because the app never sells Jellyfin access. The defect is a Plex-only paywall applied to Jellyfin members.
- **Sources:** JFP-01
- **Where:** `lib/queue/jobs/stripe.ts:426-449`, `:617-620`; `lib/auth.ts:327-331`, `:357-366`; `prisma/schema.prisma:37`; `lib/guards.ts:45-55`; `app/subscribe/page.tsx:40-47`; `app/subscribe/success/page.tsx:68`; `components/subscription/subscription-banners.tsx:63`; `actions/admin/subscriptions.ts:141-152`; `components/admin/users/grant-access-button.tsx:81`; `lib/connections/jellyfin-users.ts:139`; `actions/invite.ts:744-750`; `docs/stripe.md:3-7`
- **Evidence:**
  ```ts
  // lib/queue/jobs/stripe.ts:617-620 (revoke)
  if (!user.plexUserId) {
    logger.info("Revoke skipped: user has no linked Plex account", { userId })
    return { userId, revoked: false }
  }
  // :426-449 (grant), after select: { id: true, email: true, plexAuthToken: true }
  if (!user?.email) { throw new Error(`User ${userId} has no email; cannot grant Plex access`) }
  const inviteResult = await inviteUserToPlexServer({ url: plexServer.url, token: plexServer.token }, user.email, ...)
  ```
  - **Who hits the gate:**
    - A direct Jellyfin sign-in creates `{ jellyfinUserId, name: jellyfinUser.username, email: normalizedEmail, isAdmin, primaryAuthService: "jellyfin" }` (`lib/auth.ts:357-366`), with `isExempt` left at its false default (`schema.prisma:37`).
    - `normalizedEmail` is the Jellyfin username whenever it parses as an email (`:327-331`).
    - The `(app)` guard `ensureSubscriptionOrAccess` (`lib/guards.ts:45-55`) gates every non-exempt user.
    - Jellyfin rows created by an app invite get `INVITE_EXEMPTION` (`actions/invite.ts:744-750`), so they are not affected.
  - **Member copy:**
    - "A subscription is required to access the media server." (`subscribe/page.tsx:42`)
    - "We've sent a Plex invite to your email." (`success/page.tsx:68`, `subscription-banners.tsx:63`)
  - **Admin comp grant:** it sets `isExempt: true` and enqueues `PLEX_ACCESS_GRANT` (`subscriptions.ts:141-152`). The confirm dialog says "They will be invited to the Plex server" (`grant-access-button.tsx:81`).
  - **No Jellyfin provisioning:** no Jellyfin enable/disable helper exists, and `setJellyfinUserPolicy` hard-codes `IsDisabled: false` (`jellyfin-users.ts:139`).
  - **Documented scope:** `docs/stripe.md:3-7` scopes the feature to "Plex users who are not members".
- **Impact:** the precondition is narrow: Stripe and Jellyfin are both configured, and the member's account was created in Jellyfin itself, not through an app invite. Such a member lands on /subscribe at first sign-in.
  - **If they pay, either:**
    - the grant shares the Plex server with whatever Plex account owns the username-derived email (Jellyfin users can rename themselves, SEC-08, so that account may belong to someone else); or
    - it throws "has no email" on every retry, and the success page stays on "being set up".
  - **If they cancel:** only app access is removed. Jellyfin access came from the Jellyfin admin and is untouched.
  - **Admin actions:** comp grant and cancel act on Plex only.
  - **Dual-identity rows:** a revoke removes only Plex access.
- **Recommendation:**
  - Treat a user with `jellyfinUserId` and no `plexUserId` as out of scope for the Stripe gate: exempt them, skip the gate, or refuse /subscribe with a clear message.
  - In `processPlexAccessGrant`, when there is no `plexUserId` and no Plex-verified email, skip with a recorded reason instead of throwing on every retry.
  - Hide comp-grant and cancel for Jellyfin-only rows.
  - State the Plex-only scope in `docs/stripe.md`.
  - Jellyfin provisioning (a disable/enable helper that merges the policy) is optional parity work.
  - Add tests for Jellyfin-only and dual-identity users.
- **Effort:** M

#### GAP-24: `primaryAuthService` is never written correctly, so invite-created Jellyfin members get the Plex onboarding and a plex.tv tile, while email-linked Plex members flip to Jellyfin

- **Severity:** Medium
- **Status:** confirmed. UI-34 does not cover this; it is about Plex-only copy inside the shared steps, not about which flow is chosen.
- **Sources:** JFP-03
- **Where:** `prisma/schema.prisma:23`; `actions/invite.ts:332-341`, `:744-750`; `lib/auth.ts:202-211`, `:345`, `:363`, `:390-396`; `actions/import-plex-users.ts:75-83`; `app/(app)/page.tsx:75-79`; `app/onboarding/page.tsx:20`; `actions/onboarding.ts:58`; `components/dashboard/user-dashboard.tsx:105`; `components/dashboard/media-server-link-card.tsx:14`; `components/dashboard/status-background.tsx:50`
- **Evidence:**
  ```ts
  // actions/invite.ts:744-750: the Jellyfin invite create sets no service
  user = await tx.user.create({ data: { name: username, jellyfinUserId, ...INVITE_EXEMPTION } })
  // lib/auth.ts:345: an email-linked row with a null service becomes "jellyfin"
  primaryAuthService: userByEmail.primaryAuthService || "jellyfin",
  // app/(app)/page.tsx:75 (the same "|| plex" fallback is at app/onboarding/page.tsx:20 and actions/onboarding.ts:58)
  const primaryService: AuthService = (user.primaryAuthService as AuthService) || "plex";
  ```
  - **Written in only two places:** the field ("Track which service user authenticated with first", `schema.prisma:23`) is set only at `lib/auth.ts:345` and `:363`. These paths never set it:
    - the Plex create (`:202-211`);
    - the Plex invite create (`invite.ts:332-341`);
    - the import (`import-plex-users.ts:75-83`);
    - the existing-row update on Jellyfin login (`:390-396`, `data: { name, email, isAdmin }`).

    The Jellyfin invite form passes no service hint either.
  - **Tile selection:** the dashboard picks the tile with `service={primaryAuthService === "jellyfin" ? "jellyfin" : "plex"}` (`user-dashboard.tsx:105`), and the Plex tile links to `https://plex.tv` (`media-server-link-card.tsx:14`).
- **Impact:**
  - **Invited Jellyfin members get the Plex experience:** invites are the app's main way to create Jellyfin accounts, and every invited Jellyfin member:
    - goes through the Plex onboarding ("please update your Plex client settings");
    - sees a Plex tile linking to plex.tv;
    - has the footer service label hidden (`status-background.tsx:50`).
  - **The reverse flip:** a Plex member whose row gains a Jellyfin id by email (the SEC-08 path) is pushed through the Jellyfin onboarding.
  - **Limited reach:** the field drives only onboarding, the tile, `mediaServerUrl` and the footer label.
- **Recommendation:**
  - Set the value on every create path: "plex" at `lib/auth.ts:202`, `invite.ts:332` and `import-plex-users.ts:75`; "jellyfin" at `invite.ts:744`.
  - Remove the override at `:345`.
  - Backfill: "jellyfin" where `jellyfinUserId` is set and `plexUserId` is null; "plex" where `plexUserId` is set.
  - Make it a Prisma enum, or derive it from the identifiers.
  - Render one tile per linked service.
  - Test invite, then Jellyfin login, then the onboarding service.
- **Effort:** S

#### GAP-25: Discord identity is plexUserId only, so `/mystats`, `/watching`, linked roles and the assistant go silently empty for Jellyfin members

- **Severity:** Medium
- **Status:** adjusted:
  - The success-toast claim was dropped, because that component is never rendered.
  - The scrobble on the owner's account is SEC-48.
  - Medium stands for the broken linked roles on deployments that use both Jellyfin and Discord.
- **Sources:** JFP-04
- **Where:** `lib/discord/services.ts:21-27`, `:59-66`, `:200`; `lib/discord/commands/mystats.ts:53-54`, `:141-144`; `lib/discord/commands/watching.ts:235-239`; `lib/discord/role-metadata.ts:83-104`, `:122`, `:166`; `actions/chatbot/executors/plex.ts:53-62`; `actions/chatbot/executors/tautulli.ts:93-105`; `actions/chatbot/prompts/discord-system-prompt.ts:10`; `lib/discord/commands/mark/index.ts:195-203`
- **Evidence:**
  - **No Jellyfin identity:** `VerifyDiscordUserResult.user` is `{ id, name, email, plexUserId, isAdmin }` (`services.ts:21-27`). The select (`:59-66`) has no `jellyfinUserId` or `primaryAuthService`.
  - **`/mystats`:** `if (!plexUserId) { await interaction.editReply({ content: NO_DATA }); return }` (`mystats.ts:141-144`). NO_DATA reads "You don't have any watch stats yet for this year. Watch something and check back later!" (`:53-54`).
  - **`/watching`:** `if (!plexUserId) { await interaction.editReply({ content: EMPTY_STATE }) ...` (`watching.ts:235-239`). EMPTY_STATE reads "You're not watching anything right now."
  - **Linked roles:**
    - `role-metadata.ts:83-104` checks `if (plexServer && user.plexUserId) {` and otherwise returns `false`, so `is_subscribed` is always false.
    - `:122` checks `if (tautulli && user.plexUserId) {`, so `watched_hours` is omitted.
  - **Assistant:**
    - `executors/plex.ts:53-62` has `} else if (!user?.plexUserId) { // ... return empty sessions`, and `tautulli.ts:93-105` does the same.
    - The prompt says "Only discuss Plex, Tautulli, Overseerr, Sonarr, and Radarr status" (`discord-system-prompt.ts:10`), and the fallback reply (`services.ts:200`) lists only those services.
  - **`/mark`:** it searches the Plex library, with `getActivePlexServerConfig()` then `searchPlexMedia(plexConfig, title)` (`mark/index.ts:195-203`).
- **Impact:** a Jellyfin member who links Discord gets wrong or empty answers:
  - `/mystats` tells them to watch something, even if they stream daily.
  - `/watching` says they are not watching while a stream is playing.
  - Member-gated Discord channels never open, because `is_subscribed` is always false.
  - The assistant returns empty session data, and "is the server down?" gets the Plex status.
  - `/mark` records marks against Plex rating keys, for a library the member may not use.

  No command can tell a Jellyfin member apart from anyone else.
- **Recommendation:**
  - Add `jellyfinUserId` to the verified Discord user.
  - Compute `is_subscribed` from `isAccessAllowed` plus per-service access: a Plex share, or a Jellyfin account that exists and is not disabled.
  - Give Jellyfin-only members explicit replies in `/mystats`, `/watching` and `/mark`.
  - Jellyfin `/Sessions` and history sources are later parity work, shared with RWP-08.
  - Reference SEC-48 for the scrobble and SEC-47 for role-sync timing.
- **Effort:** M

#### GAP-26: Jellyfin admin detection: the server-owner check is dead code, and a failed lookup at login demotes the admin and writes a false audit entry

- **Severity:** Low
- **Status:** adjusted (lowered from medium). SEC-12 already weighs the recompute-and-overwrite and the policy that any Jellyfin Administrator is an app admin. What is new here is the dead owner check and the demotion when the lookup fails.
- **Sources:** JFP-06
- **Where:** `lib/jellyfin-auth.ts:142-169`; `actions/admin/admin-servers.ts:546-552`; `lib/auth.ts:193`, `:386-416`; `lib/connections/jellyfin-users.ts:245-249`
- **Evidence:**
  ```ts
  // lib/jellyfin-auth.ts:142-165
  if (serverAdminUserId && userId === serverAdminUserId) { return true }
  const userResult = await getJellyfinUserById(jellyfinConfig, userId)
  if (!userResult.success || !userResult.data) { logger.warn(...); return false }
  const isAdmin = userResult.data.Policy?.IsAdministrator || false
  // actions/admin/admin-servers.ts:546-552, the only JellyfinServer write path
  adminUserId = undefined
  ```
  - **Plex contrast:** Plex makes only the owner an admin (`lib/auth.ts:193`, `plexServer.adminPlexUserId === plexUser.id`).
  - **Written at every login:** each Jellyfin login writes the result and emits `ADMIN_PRIVILEGE_REVOKED` or `GRANTED` when it changes (`lib/auth.ts:386-416`).
  - **Timeout:** the lookup has a 5 s timeout (`jellyfin-users.ts:245-249`).
- **Impact:**
  - **Live call every time:** every Jellyfin admin decision depends on a live call.
  - **Spurious demotion:** a timeout or 5xx at login writes `isAdmin=false`. The admin loses admin within the 5-minute refresh, and the log records a revoke that nobody performed. It self-heals at the next successful login.
  - **Policy, not a hole:** that Jellyfin Administrators become app admins is a policy the operator controls (SEC-12).
- **Recommendation:**
  - On a lookup error, keep the stored `isAdmin` and skip the audit event.
  - Either populate `JellyfinServer.adminUserId` (let the operator pick the owner from `getJellyfinUsers` when saving the server) or delete the dead branch.
  - Document, or make opt-in, the rule that Jellyfin Administrators are app admins.
- **Effort:** S

#### GAP-27: Admins cannot tell which service a member uses, and no in-app action removes Jellyfin access

- **Severity:** Low
- **Status:** adjusted (lowered from medium). The "hidden by default" part is UI-05, and sessions surviving removal is SEC-10. The operator can work around what remains in the Jellyfin dashboard.
- **Sources:** JFP-02
- **Where:** `actions/user-queries.ts:113-123`, `:221-244`, `:279-281`, `:406-409`; `types/admin.ts:65-80`; `app/admin/users/[userId]/page.tsx:90-115`; `components/admin/users/user-actions-menu.tsx:165`; `lib/connections/jellyfin-users.ts:187-191`, `:337`; `actions/invite.ts:888`; `actions/import-plex-users.ts:24-42`; `components/admin/users/user-management.tsx:44`
- **Evidence:**
  - **No service in the DTOs:** the list DTO (`user-queries.ts:221-244`) and `UserDetails` (`types/admin.ts:65-80`) carry `plexUserId` and `hasPlexAccess`, but no `jellyfinUserId` or `primaryAuthService`.
  - **Plex-only detail page:** it shows `Plex ID: {user.plexUserId || "—"}` and `Plex Access:`, and offers only `<UnshareUserButton .../>` (`app/admin/users/[userId]/page.tsx:90-110`).
  - **Unshare fails for Jellyfin rows:** `unshareUserLibrary` fails with `"User Plex ID is required to unshare library access"` (`:279-281`).
  - **No Jellyfin removal:**
    - `deleteJellyfinUser` is documented as "Used for rollback when invite processing fails" (`jellyfin-users.ts:187-191`) and is called only from `invite.ts:888`.
    - `getJellyfinUsers` (`:337`) has no caller outside tests.
    - Import uses only `getAllPlexServerUsers` (`import-plex-users.ts:39`).
  - **Admin copy:** "Users are automatically created when they sign in with their Plex account" (`user-management.tsx:44`).
- **Impact:**
  - **No service shown:** once Jellyfin rows are visible (UI-05), they read "—" for access and Plex ID and never say which service the member uses. That includes Jellyfin Administrators who were made app admins (GAP-26).
  - **No removal:** there is no in-app way to remove or disable a Jellyfin member.
  - **Stale state:** the app reads Jellyfin user state only at login (`lib/jellyfin-auth.ts:149`). A member disabled in Jellyfin looks normal and keeps their session (SEC-10) and their Discord access.
- **Recommendation:**
  - Add `jellyfinUserId` and a service badge to the list and detail DTOs and UI.
  - Add an audited "Disable Jellyfin access" admin action that merges `Policy.IsDisabled`, and that bumps the session version once SEC-10 lands.
  - Optionally add a reconciliation pass over `getJellyfinUsers` that flags deleted or disabled accounts.
- **Effort:** M

#### GAP-28: Jellyfin invite compensation is incomplete: a failed DB write leaves a working Jellyfin account with library access and a restored, reusable invite

- **Severity:** Low
- **Status:** confirmed. SEC-08 (the race window) does not cover this. SEC-20 covers the raw error text and is referenced for that part.
- **Sources:** JFP-07
- **Where:** `actions/invite.ts:847`, `:866-870`, `:888-889`, `:894-911`, `:928-935`
- **Evidence:**
  ```ts
  // actions/invite.ts:894-911
  try { await recordJellyfinInviteUsage(invite.id, jellyfinUserId, username) }
  catch (recordError) {
    // Note: User is already created on Jellyfin, but we should still restore the invite
    await rollbackInviteUsage(invite.id, username, failureReason)
    return { success: false, error: failureReason }
  }
  ```
  - **Ignored delete:** on policy failure, the result of `deleteJellyfinUser` is ignored (`:888-889`).
  - **Late parse:** `JSON.parse(invite.jellyfinLibraryIds)` runs after the account exists (`:866-868`).
  - **Outer catch:** it returns `error.message` without deleting the account (`:928-935`). In that branch the invite stays consumed.
- **Impact:**
  - **Orphan account:** after a DB error the person keeps a Jellyfin account with the invite's library access.
  - **Reusable invite:** the invite is restored and can be redeemed again.
  - **Invisible to admins:** with no app row or InviteUsage, admins cannot see the account (GAP-27). A later Jellyfin sign-in creates a non-exempt row, which Stripe gating sends to /subscribe (GAP-23).
  - **Unrestricted account:** if both the policy update and the delete fail, the account keeps the server's default new-user policy instead of the invite's restriction.
  - **Rare:** it needs a DB error or malformed admin-written JSON.
- **Recommendation:**
  - Once `jellyfinUserId` exists, delete the Jellyfin account both in the record-usage branch and in the outer catch.
  - Check the delete result, and audit `INVITE_ROLLBACK_FAILED` with the orphan's id.
  - Parse the library ids before creating the account.
  - Create the account disabled and enable it after the DB write. This also narrows the SEC-08 race.
  - Return a generic error message.
- **Effort:** S

#### GAP-29: The Jellyfin dashboard tile falls back to jellyfin.org when the Jellyfin login button is hidden, and shows the Plex server's name

- **Severity:** Low
- **Status:** adjusted. The internal-URL part is UI-38; the other two parts are new.
- **Sources:** JFP-08
- **Where:** `app/(app)/page.tsx:32-34`, `:43`, `:104-106`; `components/dashboard/media-server-link-card.tsx:14`; `actions/invite.ts:925`
- **Evidence:**
  - **Server query:** the home page loads `prisma.jellyfinServer.findFirst({ where: { isActive: true, enabledForLogin: true } })` (`page.tsx:32-34`).
  - **Name:** it sets `const serverName = plexServer?.name || jellyfinServer?.name || "Media Server"` (`:43`).
  - **URL:** it sets `mediaServerUrl = user?.primaryAuthService === "jellyfin" ? jellyfinServer?.url : plexServer?.url` (`:104-106`).
  - **Fallback:** the tile uses `serverUrl || "https://jellyfin.org"` (`media-server-link-card.tsx:14`).
  - **Contrast:** the invite success page uses `jellyfinServer.publicUrl || jellyfinServer.url` (`invite.ts:925`).
- **Impact:**
  - When an admin hides the Jellyfin login button (SEC-14), signed-in Jellyfin members get a tile that links to jellyfin.org.
  - On installs with both servers (the wizard requires Plex), the page title and the tile show the Plex server's name.
  - The tile is reachable only for rows whose service is "jellyfin", which today means members who signed in directly with Jellyfin (GAP-24).
- **Recommendation:**
  - For signed-in members, drop the `enabledForLogin` filter.
  - Choose `serverName` from the member's own service.
  - Use `publicUrl` (UI-38).
  - Fix GAP-24 first.
- **Effort:** S

#### GAP-30: No tests cover Jellyfin sign-in, onboarding service selection, Discord, Stripe or admin behaviour for Jellyfin members

- **Severity:** Info
- **Status:** confirmed. Fold this into BP-10 as its Jellyfin-specific test and seed list.
- **Sources:** JFP-10
- **Where:** `lib/auth.ts:270-431`; `e2e/jellyfin-invite.spec.ts:7`; `prisma/seed.ts:67`, `:80`; `e2e/global-setup.ts:66`, `:86`
- **Evidence:**
  - **Test files that mention Jellyfin:**
    - unit: `components/__tests__/invites-page-client.test.tsx`, `actions/__tests__/invite.test.ts`, `admin-settings-secret-hiding.test.ts`, `admin-servers.test.ts`, `__tests__/actions/onboarding.test.ts` (only `completeOnboarding('jellyfin')`), `lib/connections/__tests__/jellyfin-connection.test.ts` and `jellyfin-users.test.ts`;
    - e2e: jellyfin-invite, onboarding-flow, admin-functionality and public-flows.
  - **Untested paths:**
    - none of these exercises the Jellyfin `authorize` (`lib/auth.ts:270-431`);
    - nothing under `lib/discord`, `lib/queue` or `lib/stripe` mentions Jellyfin.
  - **Fixtures:**
    - the seed and the e2e fixtures create only `primaryAuthService: 'plex'` users;
    - `e2e/jellyfin-invite.spec.ts` stops before sign-in and onboarding.
- **Impact:** every defect in this section would pass CI. BP-10 already records `lib/jellyfin-auth.ts` at 13% coverage.
- **Recommendation:**
  - Seed one Jellyfin-only member and one member with both ids.
  - Unit-test:
    - the Jellyfin authorize branches;
    - `processPlexAccessRevoke` and `processPlexAccessGrant` with a Jellyfin-only user;
    - `verifyDiscordUser` and the command replies;
    - `getAllUsersWithWrapped`.
  - Add an e2e test that runs invite, then sign-in, then onboarding against a mocked Jellyfin server.
- **Effort:** M

### 4. Privacy, data lifecycle and admin data access

#### GAP-31: Members can never be removed: no delete-user path exists, and unshare, Stripe revoke and Discord unlink leave almost all data in place while watchlist sync keeps using the stored Plex token

- **Severity:** Medium
- **Status:** adjusted (lowered from high). Most User relations cascade correctly; the real holes are listed below. The verifier ranked continued processing after unshare as the strongest live defect.
- **Sources:** PRIV-01
- **Where:** `actions/user-queries.ts:255-316`; `lib/queue/jobs/stripe.ts:643-646`; `lib/discord/integration.ts:337-355`; `lib/discord/api.ts:50`, `:104`; `prisma/schema.prisma:213`, `:229`, `:233`, `:330`, `:337`, `:533`; `actions/prompt-test.ts:46`, `:109-115`; `lib/watchlist/sync-service.ts:80`, `:307-313`; `lib/discord/services.ts:255-257`; `lib/discord/chat-session.ts:127-137`; `prisma/seed.ts:32`
- **Evidence:**
  - **No user deletion anywhere:**
    - The only `.delete(` and `.deleteMany(` calls in `actions/`, `app/` and `lib/` touch invite, announcement, promptTemplate, userMediaMark (in a module nothing imports), the lock tables, discordOAuthState, discordConnection and discordPendingSelection.
    - Users are deleted only by the dev seed (`prisma/seed.ts:32`, `await prisma.user.deleteMany()`) and the e2e helpers.
  - **Each offboarding path does one thing:**
    - `unshareUserLibrary` only calls `unshareUserFromPlexServer(...)` (`user-queries.ts:292-299`).
    - `PLEX_ACCESS_REVOKE` only writes `prisma.subscription.updateMany({ where: { userId }, data: { plexInviteStatus: "revoked" } })` (`stripe.ts:643-646`).
    - Discord unlink clears the role connection at Discord, then runs `prisma.discordConnection.deleteMany({ where: { userId } })` (`integration.ts:337-352`).
  - **Processing continues after removal:**
    - Nothing clears `WatchlistSyncSettings.syncEnabled` or `plexAuthToken`.
    - `syncAllEnabledUsers` (`sync-service.ts:307-313`, `where: { syncEnabled: true, ... }`) therefore keeps calling `getPlexWatchlist(user.plexAuthToken)` (`:80`) for the removed member, and keeps filing Overseerr requests with the admin key.
    - With Stripe off, SEC-28's entitlement filter would not catch this, because the gate returns true.
  - **Real cascade holes:**
    - `DiscordCommandLog.userId String?` has no `@relation` and no foreign key (`schema.prisma:533`).
    - The playground stores a member's stats under the admin's id (`prompt-test.ts:46`, `const userId = session.user.id`, then `:109-115`). Admin-chatbot tool output is stored the same way, so a cascade on the member misses those rows.
  - **Discord unlink gaps:**
    - `lib/discord/api.ts` only calls `/oauth2/token` (`:50`, `:104`), never `/oauth2/token/revoke`, so the grant stays live at Discord.
    - `DiscordChatSession` (`@@unique([discordUserId, discordChannelId])`, `:337`) survives unlink.
    - After unlink, `clearDiscordChat` refuses: `if (!connection || connection.revokedAt) { return { success: false, linked: false ...` (`services.ts:255-257`).
    - `getOrCreateSession` never checks the app user (`chat-session.ts:127-137`). A Discord account relinked to another app account within 30 minutes inherits the previous account's turns. This is a rare edge case.
  - **Corrected during verification:**
    - DiscordChatSession is not a hole on user deletion: its `chatConversation` relation cascades (`:330`), and ChatConversation cascades from User (`:213`).
    - `LLMUsage.wrapped onDelete: SetNull` (`:229`) is moot, because LLMUsage.user cascades (`:233`).
- **Impact:**
  - **For members:** a removed or cancelled member keeps all of this indefinitely, readable by admins:
    - their Rewinds;
    - LLM prompts and assistant transcripts;
    - typed DMs;
    - marks and watchlist history;
    - their Discord identity;
    - a working plex.tv token.

    They have no way to have it erased. The app keeps reading their private Plex watchlist and filing Overseerr requests after they leave. The public share link (SEC-16) and the session (SEC-10) also survive.
  - **For operators:** an operator handling an erasure request has no tool. A manual `DELETE FROM "User"`:
    - orphans the DiscordCommandLog rows and the LLMUsage rows attributed to the admin;
    - also deletes Subscription (it cascades), which is the only link to a Stripe customer who may still be billed.
- **Recommendation:**
  - **First, fix offboarding:**
    - In `unshareUserLibrary` and `processPlexAccessRevoke`, set `syncEnabled = false`, null `plexAuthToken` and bump a session version (SEC-10).
    - Make `syncUserWatchlist` refuse users whose access was revoked (see also GAP-39).
  - **Then add an `eraseMember(userId)` helper**, run in a `$transaction` behind an admin "Remove member" action. It should:
    1. cancel the Stripe subscription;
    2. unshare from Plex;
    3. POST `/oauth2/token/revoke` for the Discord token;
    4. delete DiscordCommandLog rows by userId or discordUserId, and DiscordChatSession and DiscordPendingSelection rows by discordUserId;
    5. delete the User row and let the rest cascade;
    6. emit an audit event.
  - **Close the remaining holes:**
    - Add a foreign key (`onDelete: SetNull` or Cascade) from `DiscordCommandLog.userId` to User.
    - Delete DiscordChatSession on unlink, or check the owner in `getOrCreateSession`.
    - Tag playground and admin-chat LLMUsage rows with a subject user id.
- **Effort:** M

#### GAP-32: Every DM to the Discord assistant is copied into the command log and listed to admins, and members are never told admins can read their assistant conversations

- **Severity:** Low
- **Status:** adjusted:
  - The bot's privacy copy is accurate about what Discord shows.
  - The new defects are the DM text stored in `DiscordCommandLog.commandArgs` and the missing disclosure.
  - Plaintext LLMUsage storage is SEC-34, and re-storing the full context is SEC-45.
- **Sources:** PRIV-02
- **Where:** `lib/discord/routing/dm-router.ts:170-176`; `components/admin/discord/discord-activity-table.tsx:172-177`; `components/admin/users/user-activity-timeline.tsx:172-178`; `actions/user-queries.ts:648-669`; `actions/chatbot/conversation.ts:86-93`; `app/admin/llm-usage/[usageId]/page.tsx:41-63`; `app/admin/llm-usage/conversation/[conversationId]/page.tsx:104-120`; `lib/discord/commands/assistant.ts:171`; `lib/discord/services.ts:196-204`, `:283-295`; `docs/discord-bot.md:130`
- **Evidence:**
  ```ts
  // lib/discord/routing/dm-router.ts:170-176
  commandType: "CHAT" as DiscordCommandType, commandName: "dm", commandArgs: trimmed.substring(0, 500),
  ```
  - **DM text in admin tables:** `commandArgs` holds what the member typed. Admins see it in two places:
    - the `/admin/discord` activity table (`{log.commandArgs && (<span ... title={log.commandArgs}> {log.commandArgs}`, `discord-activity-table.tsx:172-177`);
    - the per-user timeline (`user-activity-timeline.tsx:172-178`, fed by `user-queries.ts:669`).
  - **Full transcripts in LLMUsage:**
    - Every loop iteration stores `prompt: JSON.stringify(currentMessages)` and `response: response.content || JSON.stringify(response.toolCalls)` (`conversation.ts:86-93`).
    - Admins can read these at `/admin/llm-usage/[usageId]` and on the conversation page, which renders the latest prompt as the whole transcript.
  - **Bot copy:**
    - "Ask the assistant a question (answer is only visible to you)" (`assistant.ts:171`) is accurate about Discord's ephemeral display.
    - "Personal details were removed for privacy" (`services.ts:202-204`) describes the reply, which is sanitized after it is stored (`:196`).
    - "Chat context cleared! Starting fresh." only creates a new ChatConversation (`:283-295`).
  - **Operator docs:** they say only that LLM usage "flows into the `LLMUsage` table for cost tracking" (`docs/discord-bot.md:130`).
  - **No disclosure:** nothing tells members that admins can read conversations, or that messages go to the LLM provider (GAP-34).
- **Impact:**
  - **Admin reach:** admins can browse the first 500 characters of every DM in a sortable table, and the full conversation and tool output on the LLM-usage pages.
  - **Duration:** this lasts indefinitely (GAP-35) and survives unlink (GAP-31).
  - **Why low:** per SEC-12, the admin is effectively the server owner, who already sees members' viewing history in Tautulli.
- **Recommendation:**
  - Stop writing DM text to `commandArgs` for CHAT rows; store null or the length instead.
  - Add one line to `/help` and to the first DM reply saying that server admins can review assistant conversations and that messages are processed by the configured LLM provider.
  - Leave LLMUsage retention to SEC-34 and SEC-45.
- **Effort:** S

#### GAP-33: Five admin actions that change or create member data emit no audit event, and admin reads of member content leave no trace

- **Severity:** Low
- **Status:** adjusted. What remains is the missing events on those admin writes. Already covered elsewhere or out of scope:
  - Read-access auditing of the server owner is defence in depth, not a defect.
  - The playground-save validation problems are BP-04.
  - The stdout-only sink is SEC-55.
  - `forceUserWatchlistSync` has no caller (DUP-13).
- **Sources:** PRIV-04
- **Where:** `lib/admin.ts:30-42`; `actions/user-queries.ts:39-45`, `:310-313`; `actions/import-plex-users.ts:75-83`; `actions/wrapped-generation.ts:102-106`; `actions/playground-wrapped.ts:77-130`; `app/api/admin/playground/statistics/route.ts:50-58`; `actions/admin/watchlist.ts:105-117`, `:160-164`; `actions/discord-activity.ts:441-480`; `actions/chatbot/tools/tautulli.ts:81-88`; `actions/admin/admin-users.ts:71-80`
- **Evidence:**
  - **No read logging:**
    - `requireAdmin` (`lib/admin.ts:30-42`) only checks `session.user.isAdmin`.
    - `getUserPlexWrapped` logs only denied reads (`if (session.user.id !== userId && !session.user.isAdmin) { logger.warn(...`, `user-queries.ts:39-45`).
  - **Writes with no `logAuditEvent`:**
    - `unshareUserLibrary` writes only `logger.info("Successfully unshared user library", { userId: user.id, email: user.email })` (`:310-313`).
    - `importPlexUsers` creates rows with `prisma.user.create({ data: { plexUserId: plexUser.id, name: plexUser.name, email: plexUser.email || null, ...` (`import-plex-users.ts:75-83`).
    - Admin regeneration of a completed Rewind (`wrapped-generation.ts:102-106`).
    - `savePlaygroundWrapped` saves a client-supplied `input.llmResponse` and `input.statistics` as the member's Rewind, and keeps their existing `shareToken` (`playground-wrapped.ts:77-130`).
    - `forceUserWatchlistSync` writes a logger line only (`admin/watchlist.ts:160-164`).
  - **Contrast:** `updateUserAdminStatus` does emit `ADMIN_PRIVILEGE_GRANTED` and `REVOKED` (`admin-users.ts:71-80`).
  - The 10 admin surfaces that show member content are listed under Metrics and inventories.
- **Impact:**
  - **No trail:** these admin changes leave no audit trail and no notice to the member:
    - unsharing;
    - bulk profile import;
    - Rewind regeneration;
    - publishing an admin-authored Rewind behind the member's existing public link.
  - **Non-users:** import plus the playground can build Rewinds for Plex users who never used the app, send their history to OpenAI under the admin's id, and create share tokens for them.
- **Recommendation:**
  - Fold this into SEC-55. Emit audit events, with the target user id, from `unshareUserLibrary`, `importPlexUsers`, admin regeneration and `savePlaygroundWrapped`.
  - Delete `forceUserWatchlistSync` (DUP-13).
  - Optionally mark admin-saved playground Rewinds (an `authoredBy` field), or do not reuse the existing share token for them.
  - Read-access logging and a support-admin role are optional extras.
- **Effort:** M

#### GAP-34: Plex sign-in copy says the token is "only needed to match your Plex account" although it is stored and reused, and members are never told about OpenAI processing, admin visibility or retention

- **Severity:** Low
- **Status:** adjusted (lowered from medium):
  - The Discord-link copy the auditor cited is in components that are never rendered. Re-checked for this report: `link-panel.tsx` and `link-callout.tsx` are imported only for their types.
  - Share-link wording is SEC-16, and the name sent with the role sync is SEC-47.
- **Sources:** PRIV-03
- **Where:** `components/auth/plex-sign-in-button.tsx:131-132`; `lib/auth.ts:205`, `:229`; `lib/watchlist/sync-service.ts:80`; `lib/queue/jobs/stripe.ts:461-465`; `components/wrapped/wrapped-share-button.tsx:125`; `app/api/wrapped/share/[token]/route.ts:60-66`, `:87`; `components/generator/wrapped-generator-prompt.tsx:22`; `lib/wrapped/prompt-template.ts:34`; `lib/wrapped/llm.ts:111`
- **Evidence:**
  - **Plex sign-in:**
    - The copy says "You may see a warning, but this is only needed to match your Plex account to the server subscriber." (`plex-sign-in-button.tsx:131-132`).
    - Yet every login stores the token: `plexAuthToken: authToken, // Store for watchlist sync` (`lib/auth.ts:205`) and `// Update token on each login for watchlist sync` (`:229`).
    - The token is later used by `getPlexWatchlist(user.plexAuthToken)` (`sync-service.ts:80`) and by invite auto-accept (`stripe.ts:461-465`).
  - **Sharing:**
    - The button says "Share your wrapped summary" (`wrapped-share-button.tsx:125`).
    - The link returns the full `data: wrappedData` (`route.ts:87`, SEC-16), and every fetch records a visit (`:60-66`).
  - **OpenAI:**
    - The copy says "Generate your personalized Plex Wrapped to see your viewing statistics" (`wrapped-generator-prompt.tsx:22`).
    - It never says that the prompt includes `"{{userName}}": userName` (`prompt-template.ts:34`) and viewing stats sent to OpenAI (`llm.ts:111`, `callOpenAI(config, prompt)`).
  - **No privacy page:** the member routes are only `app/(app)/page.tsx`, `wrapped/`, `wrapped/share/[token]` and `discord/`. None of them mentions retention, admin visibility, OpenAI or deletion.
- **Impact:**
  - Members consent on partial premises: they think the Plex token is used once.
  - They are told nothing about their history and chats going to an LLM provider, being kept indefinitely, or being readable by admins.
  - For a self-hosted app the privacy notice is the operator's document, but the app gives operators no template.
- **Recommendation:**
  - Change the Plex sign-in warning to say the token is kept for watchlist sync and invite acceptance. Pair this with SEC-34: store or clear the token only when it is needed.
  - Optionally ship an operator-editable `/privacy` page, linked from the sign-in footer and Discord `/help`. It should name the LLM provider, say that admins can see the data, and give the retention period.
  - Leave share-link wording and revocation to SEC-16.
- **Effort:** S

#### GAP-35: No retention on content tables: LLMUsage, ChatConversation, DiscordCommandLog, WrappedShareVisit and WatchlistSyncHistory grow without bound, and no cleanup job exists

- **Severity:** Low
- **Status:** adjusted. This extends SEC-34 (no retention policy), SEC-45 (quadratic LLMUsage growth) and BP-28 (performance). The new parts are DiscordCommandLog, WrappedShareVisit, the never-written `ChatConversation.endedAt` and removed watchlist items.
- **Sources:** PRIV-05
- **Where:** `actions/chatbot/conversation.ts:86-93`; `lib/wrapped/llm.ts:48-56`, `:129-141`; `actions/prompt-test.ts:109-121`; `lib/discord/chat-session.ts:36`, `:139-142`; `lib/discord/services.ts:283-285`; `lib/chatbot/assistant.ts:77-80`; `lib/discord/routing/interaction-router.ts:133-148`; `app/api/wrapped/share/[token]/route.ts:60-66`; `prisma/schema.prisma:215`, `:634`, `:658`; `lib/queue/types.ts:14-20`; `lib/instrumentation/node.ts:62-72`; `lib/queue/client.ts:27-33`
- **Evidence:**
  - **LLMUsage:** one row per LLM call, with the full text. Even with the LLM disabled it stores a full copy of the Rewind: `prompt: "[LLM Disabled - Mock Data]", response: JSON.stringify(mockData)` (`llm.ts:48-56`).
  - **ChatConversation:**
    - A new row is created on every Discord idle reset (`SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000`, `chat-session.ts:36`, `:139-142`), on every manual reset (`services.ts:283-285`) and for every admin chat (`assistant.ts:77-80`).
    - `endedAt` (`schema.prisma:215`) is never written.
  - **DiscordCommandLog:** one row per slash command, component and DM. The row is opened before the `requireLinkedUser` gate (`interaction-router.ts:133-148`), so commands from unlinked non-members are logged too.
  - **WrappedShareVisit:** one row per GET of the share API, including bots and the page's own server-side fetch (RWP-09).
  - **WatchlistSyncHistory:** bounded per item (`@@unique([userId, plexRatingKey])`, `:634`). But `REMOVED_FROM_WATCHLIST` (`:658`) is never written, so titles a member removed from Plex are kept.
  - **No cleanup job:**
    - `JOB_TYPES` has only watchlist and Stripe jobs (`queue/types.ts:14-20`).
    - `node.ts:62-72` schedules only `watchlist-sync-scheduled`.
    - The only cleanup is BullMQ's `removeOnComplete`/`removeOnFail` (`client.ts:27-33`) and the self-cleaning of two transient Discord tables.
- **Impact:**
  - Viewing histories, every DM and visitor fingerprints accumulate indefinitely.
  - That widens the blast radius of a database or backup leak (SEC-34).
  - It slows the admin pages that aggregate LLMUsage (BP-28).
- **Recommendation:** as part of SEC-34's retention work, add one daily sweep (a BullMQ repeatable job, with a fallback when Redis is absent) that:
  - nulls `commandArgs` after a short window, and deletes DiscordCommandLog rows after N days;
  - rolls WrappedShareVisit up into counts;
  - sets `endedAt` on reset and idle;
  - writes or prunes `REMOVED_FROM_WATCHLIST` rows.

  Make the windows configurable.
- **Effort:** M

#### GAP-36: Members have no machine-readable export or item-level deletion; the existing mark-delete action is unreachable

- **Severity:** Low
- **Status:** adjusted:
  - Members can view their own data (`/mymarks`, `/mystats`, the Rewind viewer), so this is a missing feature rather than a defect.
  - Dead code is DUP-13, share revocation is SEC-16, and account deletion is GAP-31.
- **Sources:** PRIV-07
- **Where:** `components/wrapped/share-card-download.tsx:22-29`; `actions/user-marks.ts:119-145`; `components/watchlist/sync-history-table.tsx:29`; `actions/watchlist.ts:54-68`; `actions/wrapped-generation.ts:102-106`; `lib/discord/commands/mark/index.ts:300`; `lib/discord/media/mark-media.ts:135`
- **Evidence:**
  - **No account or data page:** `app/(app)` contains only `page.tsx`, `wrapped/page.tsx`, `wrapped/share/[token]/page.tsx`, `discord/link/page.tsx` and `discord/connect/route.ts`.
  - **The only export is a PNG card:** ``fetch(`/api/wrapped/og-image?token=${shareToken}&format=card`)`` followed by ``link.download = `plex-wrapped-${year}.png` `` (`share-card-download.tsx:22-29`).
  - **Marks cannot be deleted:**
    - `deleteUserMediaMark` (`user-marks.ts:119-145`) has no importer, and it revalidates `/media`, which does not exist.
    - The Discord mark flow only upserts (`mark-media.ts:135`), and there is no unmark command.
  - **Watchlist history is mostly hidden:** members see only 5 items, and only while sync is on (`watchlist.ts:54-68`).
  - **Rewinds cannot be removed:** only admins can regenerate a completed Rewind (`wrapped-generation.ts:102-106`).
- **Impact:**
  - Members cannot get their data out.
  - They cannot retract a mark, a public Rewind or their chat history.
  - Operators answering access or portability requests have to hand-write SQL.
- **Recommendation:**
  - Add a Discord `/unmark` command, or a web control, backed by a fixed `deleteUserMediaMark` with the correct revalidate path.
  - Optionally add a "Download my data" JSON action covering:
    - profile fields (no tokens);
    - Rewind data per year;
    - marks;
    - watchlist history;
    - subscription status.
- **Effort:** M

#### GAP-37: Share-visit analytics store a permanent, reversible IP pseudonym plus user agent and referer, and no code reads them

- **Severity:** Low
- **Status:** confirmed. Overlaps SEC-09 (salt reuse) and SEC-34 (raw user agent and referer). Because of RWP-09, most rows today record the server's own fetch rather than the visitor.
- **Sources:** PRIV-06
- **Where:** `lib/security/ip-hash.ts:15-25`, `:35-38`; `app/api/wrapped/share/[token]/route.ts:55-66`; `actions/share-analytics.ts:52`, `:110-118`; `actions/user-queries.ts:97`, `:456`; `prisma/schema.prisma:201`
- **Evidence:**
  - **The hash:**
    - `ip-hash.ts:15-25` computes `createHash("sha256").update(ip + salt)` with `const salt = process.env.NEXTAUTH_SECRET || ...`.
    - It has no rotation and is not an HMAC, so one IP gets the same value on every share, forever.
    - The IP comes from the leftmost `x-forwarded-for`, which the client sets (`:35-38`).
  - **What is written:** the route stores `ipAddress: hashedIP, // Store hashed IP for privacy`, plus `userAgent` and `referer` (`route.ts:56-66`).
  - **Nothing reads it:**
    - Grep finds those three fields only in that writer.
    - The readers use only `count()` (`share-analytics.ts:52`), `select: { createdAt: true }` (`:110-118`) and `_count.shareVisits`.
  - **Reversibility:**
    - A scratch benchmark measured 825k SHA-256 hashes per second on one Node core.
    - At that rate the whole IPv4 space takes about 87 CPU-minutes.
    - So anyone holding NEXTAUTH_SECRET, or the shipped placeholder (SEC-09), can reverse every row.
- **Impact:**
  - The app collects data about non-members for no purpose.
  - The operator can reverse it, and it links one visitor across every member's shares and across years.
  - It becomes real visitor data once RWP-09 is fixed.
- **Recommendation:**
  - Fix this together with RWP-09. When visits are recorded from the real request, store only `wrappedId` and `createdAt` (or daily counters), and drop the three fields.
  - If unique visitors are needed, use an HMAC with a dedicated key that rotates daily.
- **Effort:** S

#### GAP-38: The admin user activity timeline paginates wrongly: from page 3 items can be skipped or misordered, and from page 5 every page is empty

- **Severity:** Low
- **Status:** confirmed. UI-23 does not cover this.
- **Sources:** PRIV-09
- **Where:** `actions/user-queries.ts:648-657`, `:696-699`; `components/admin/users/user-activity-timeline.tsx:205`, `:240-246`
- **Evidence:**
  ```ts
  // actions/user-queries.ts:651 and :656 (each source)
  take: pageSize * 2, // Fetch extra to merge properly
  // :696-699
  const totalPages = Math.ceil(total / pageSize)
  const offset = (page - 1) * pageSize
  const paginatedItems = allActivities.slice(offset, offset + pageSize)
  ```
  With the fixed `pageSize = 10` (`user-activity-timeline.tsx:205`), the merged list holds at most 40 items, while `totalPages` comes from the full counts.
- **Impact:**
  - Pages 1 and 2 are correct.
  - From page 3, items can be skipped or shown out of order.
  - From page 5, every page is blank while the pager (`:240-246`) still advertises more pages.
- **Recommendation:** use one of:
  - `take: offset + pageSize` on each source before merging;
  - cursor pagination;
  - a single ordered UNION query.
- **Effort:** S

#### GAP-39: Admin-triggered per-user watchlist sync ignores the member's opt-in

- **Severity:** Info
- **Status:** adjusted (lowered to info). The defect is entirely latent:
  - `forceUserWatchlistSync` has no caller.
  - The only UI caller takes the sync-all path, which filters on `syncEnabled`.
- **Sources:** PRIV-08
- **Where:** `lib/watchlist/sync-service.ts:26-80`, `:131-137`, `:163`, `:268-275`; `actions/admin/watchlist.ts:140-180`; `actions/admin/queue.ts:510-522`; `lib/queue/jobs/watchlist-sync.ts:36`; `components/admin/queues/queue-controls.tsx:39`
- **Evidence:**
  - **No opt-in check:** `syncUserWatchlist` selects `watchlistSyncSettings: true` (`:31-38`) but never checks `syncEnabled`. It goes straight on to:
    - `validatePlexToken` and `getPlexWatchlist(user.plexAuthToken)` (`:55`, `:80`);
    - submitting Overseerr requests (`:131-137`);
    - upserting history (`:163`).
  - **Two admin paths reach it**, both through `processWatchlistSyncUser` (`watchlist-sync.ts:36`):
    - `forceUserWatchlistSync(userId)` (`admin/watchlist.ts:140-180`), which is not audited;
    - `triggerWatchlistSyncJob({ userId })` (`admin/queue.ts:510-516`), which is audited as `QUEUE_SYNC_TRIGGERED` (`:518-522`).
  - **Latent today:** `queue-controls.tsx:39` calls `triggerWatchlistSyncJob({})`, which takes the sync-all path.
- **Impact:** an admin calling the server action by hand, or any future UI, could read a non-consenting member's private watchlist and file auto-approved requests in their name (SEC-27).
- **Recommendation:**
  - When applying SEC-27's re-check of the toggle, also return early in `syncUserWatchlist` (or the WATCHLIST_SYNC_USER processor) unless `syncEnabled` is set. The member's own manual trigger is the exception.
  - Combine this with GAP-31's check for revoked access.
  - Delete `forceUserWatchlistSync` (DUP-13).
- **Effort:** S

### 5. Locale, timezone and formatting

#### GAP-40: Admin-entered wall-clock values are converted to instants in the wrong timezone: announcement expiry and the Rewind generation window

- **Severity:** Medium
- **Status:** confirmed. The verifier found one more location: `actions/announcements.ts:226`, the update path.
- **Sources:** LTZ-03
- **Where:** `components/admin/announcements/announcement-form-modal.tsx:135`; `components/admin/announcements/announcements-page-client.tsx:56-58`, `:80-83`, `:138-139`; `actions/announcements.ts:154`, `:226`; `components/admin/settings/wrapped-settings-form.tsx:21`, `:31-34`, `:40`; `actions/admin/admin-config.ts:44-48`, `:76`, `:215`
- **Evidence:**
  ```ts
  // actions/announcements.ts:154 (and :226): a datetime-local string with no offset, parsed in server-local time
  expiresAt: expiresAt ? new Date(expiresAt) : null,
  // components/admin/announcements/announcements-page-client.tsx:139: the edit form pre-fills the UTC wall time
  ? new Date(announcement.expiresAt).toISOString().slice(0, 16)
  // components/admin/settings/wrapped-settings-form.tsx:31-34: browser-local midnight
  return new Date(currentYear, parseInt(month, 10) - 1, parseInt(day, 10))
  // actions/admin/admin-config.ts:44-48: server-local normalisation
  const start = new Date(now.getFullYear(), startDate.getMonth(), startDate.getDate())
  ```
  - **Announcement expiry:** under `TZ=UTC`, `new Date("2026-12-31T23:59")` gives `2026-12-31T23:59:00.000Z`, which is 15:59 PST for a Pacific admin. The round trip shows the admin "23:59" again, which hides the shift.
  - **Rewind window east of UTC:**
    - A Europe/Berlin admin who saves Dec 1–Jan 31 stores `2026-11-30T23:00Z..2026-01-30T23:00Z`.
    - A UTC server reads that as 11/30 and 1/30 and displays "Nov 30, 2026 - Jan 30, 2026".
    - The Berlin browser shows "Dec 1 - Jan 31", so `formatDateForDisplay` (`:40`) also causes an SSR/hydration mismatch.
    - Australia/Sydney behaves the same way.
  - **January start:** a Berlin Jan 1–Jan 31 window is stored as `2025-12-31T23:00Z`. That yields `wrappedYear=2025` (`admin-config.ts:76`) and turns the window into a cross-year Dec 31–Jan 30 range.
  - **Rewind window in the US:** US admins get the right month and day. But `today` is the UTC date, so the window opens and closes at 00:00 UTC, which is 4-5 PM the previous evening on the US West Coast.
- **Impact:**
  - Announcements expire early or late by the admin's UTC offset; on the US West Coast that is 8 hours early.
  - For operators east of UTC:
    - the Rewind generation gate is one day early at both ends;
    - the settings page shows different dates before and after hydration;
    - a January start date flips the Rewind year.
  - Year selection itself is RWP-04 and UI-02.
- **Recommendation:**
  - Convert wall times on the client before calling the action: send `new Date(value).toISOString()`, or send the value plus `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Pre-fill the edit form with the local wall time, not `toISOString().slice(0, 16)`.
  - Store the Rewind window as month/day integers or date-only strings, and evaluate it in `Config.timezone` (RWP-03) with an `Intl.DateTimeFormat(..., { timeZone })` day key.
  - Display the window from the stored month/day, not from a re-parsed Date.
  - Add unit tests that run the form helpers under `TZ=Europe/Berlin` and the gate under `TZ=UTC`.
- **Effort:** S

#### GAP-41: Server-rendered client components format dates, numbers and relative times with runtime defaults, causing confirmed React hydration mismatches

- **Severity:** Low
- **Status:** adjusted (lowered from medium):
  - Mismatches were reproduced on two pages; the other sites depend on what data the page renders.
  - The app has no error-monitoring SDK, so in production the effect is a console error and a client re-render.
- **Sources:** LTZ-01
- **Where:** `components/admin/announcements/announcement-list-item.tsx:58`, `:60`; `components/admin/llm-usage/conversation-usage-row.tsx:20-27`, `:84`; `components/admin/users/user-table-row.tsx:134`, `:168`, `:171`; `components/dashboard/announcements-card.tsx:116`, `:127`; `components/admin/discord/discord-activity-table.tsx:147`, `:150`; `components/admin/discord/discord-bot-status.tsx:105`, `:113`; `components/admin/discord/discord-active-users.tsx:75`; `components/admin/discord/discord-marked-media.tsx:287`, `:301`; `components/admin/users/user-activity-timeline.tsx:154`; `components/admin/queues/job-table.tsx:36`; `components/admin/queues/scheduler-info.tsx:16-20`; `components/admin/prompts/expandable-prompt.tsx:171`; `components/admin/settings/wrapped-settings-form.tsx:40`; `components/subscribe/plan-list.tsx:29`; `lib/utils/time-formatting.ts:100-133`; `components/discord/link-panel.tsx:130` (not rendered)
- **Evidence:**
  - **The pattern:** a `'use client'` component receives server data as props and formats it during render with no fixed locale or timeZone. Examples:
    - `<span>Created: {new Date(announcement.createdAt).toLocaleDateString()}</span>` (`announcement-list-item.tsx:58`);
    - `new Date(date).toLocaleString("en-US", { ..., hour: "2-digit", minute: "2-digit" })` (`conversation-usage-row.tsx:20-27`);
    - `toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })` (`user-table-row.tsx:171`).
  - **Clock-dependent renders:**
    - `formatRelativeTime` reads `new Date()` and has seconds granularity (`time-formatting.ts:100-133`). It is called during render at the Discord sites listed, including a "Lock expires in" countdown on a 30 s lease (`discord-bot-status.tsx:113`, `lease.ts:9`).
    - `scheduler-info.tsx:20` prints `` `in ${Math.round(diffMs / 1000)}s` ``.
  - **Playwright probe** (React 19.2.3, chromium, against :3100):
    - `/admin/llm-usage/conversation/[id]`, under the LA timezone: `<ConversationUsageRow> ... + Oct 17, 2026, 07:28 AM - Oct 17, 2026, 02:28 PM`. No mismatch under UTC.
    - `/admin/announcements`, under de-DE: `<AnnouncementListItem> ... + 17.10.2026 - 10/17/2026`. No mismatch under en-US.
    - No mismatch on /, /admin/users, /admin/discord, /admin/queues, /discord or /admin/prompts. The seed renders no affected rows there; for example, the users list shows "No users found" because the default filter is `plexAccess: "yes"` (`users-list.tsx:16-20`).
  - **React's recovery:** React (`react-dom-client.development.js:5521-5537`) discards the server HTML up to the nearest Suspense boundary and re-renders that part on the client. Next 16.1.1's `onRecoverableError` forwards the error to `reportGlobalError`.
  - **Dead site:** `link-panel.tsx:130` is in a component that is never rendered (re-checked for this report).
- **Impact:**
  - **Who:** admins whose browser locale is not en-US, or whose timezone differs from the container's (UTC).
  - **What:** the affected admin pages, and a few member pages, lose their SSR output to a client re-render. The text flashes and a console error is logged.
  - **Understated in the console:** React reports only the first mismatch per boundary.
  - **Even for UTC/en-US admins:** seconds-level relative times can mismatch.
  - The final text is correct.
- **Recommendation:**
  - Fix this with the shared formatter (DUP-09, UI-28) and one timezone/locale setting (RWP-03's `Config.timezone`), so server and client format with an explicit locale and timeZone.
  - Where browser-local time is wanted, render it after mount, or put `suppressHydrationWarning` on that one text node.
  - Give relative times a server-supplied `now`, or render them after mount.
  - Optionally add one Playwright smoke run with `timezoneId: "America/Los_Angeles"` and `locale: "de-DE"` against seeded rows that actually render, failing on "Hydration failed".
  - The number sites overlap GAP-46.
- **Effort:** M

#### GAP-42: Analytics day windows: the share chart never zero-fills today, the cost "Period" header shows end + 1 day, Discord charts label the same day differently, and date-filter defaults are UTC

- **Severity:** Low
- **Status:** adjusted (lowered from medium). This is admin-analytics display only. The Discord trend-chart label shift is another instance of UI-24's `new Date('YYYY-MM-DD')` bug and should be folded into it.
- **Sources:** LTZ-04
- **Where:** `actions/share-analytics.ts:90-92`, `:125-128`, `:134`; `lib/discord/audit/query-helpers.ts:34-35`; `lib/discord/audit/metrics/activity.ts:44-64`; `lib/discord/audit/metrics/users.ts:93`; `lib/discord/audit/metrics/errors.ts:22`, `:95`; `components/admin/discord/discord-trend-chart.tsx:47-52`; `components/admin/discord/discord-linking-metrics.tsx:51`; `components/admin/discord/discord-error-analysis.tsx:24`; `components/admin/discord/discord-date-filter.tsx:16-19`, `:50-58`; `components/admin/cost-analysis/cost-date-filter.tsx:45-49`; `app/admin/cost-analysis/page.tsx:19`, `:53`; `app/admin/discord/page.tsx:43`
- **Evidence:**
  - **Share activity:**
    - The window starts at server-local midnight (`startDate.setHours(0, 0, 0, 0)`, `share-analytics.ts:90-92`).
    - The zero-fill builds `safeDays` keys from `date.toISOString().split("T")[0]` (`:125-128`), and visits are keyed by UTC day (`:134`).
    - A replay at 2026-10-17T18:00Z gives keys 09-17..10-16 under UTC and LA, and 09-16..10-15 under Berlin.
    - So today is never zero-filled, and east of UTC the zero-fill also shifts back a day.
  - **Discord charts:**
    - `toDateKey` is UTC (`query-helpers.ts:34-35`), and `activity.ts:44-64` creates buckets only for days that had logs.
    - `discord-trend-chart.tsx:47-52` labels days with `new Date(point.date).toLocaleDateString("en-US", ...)`, which comes out a day early in the Americas.
    - The adjacent `discord-linking-metrics.tsx:51` uses the raw `"2026-10-17"` key, so the same day is labelled two ways.
    - `errorTrend` is computed (`errors.ts:95`) but only typed in `discord-error-analysis.tsx:24`; it is never rendered.
  - **Date filters:** they put `start.toISOString().split("T")[0]` into `<input type="date">` (`discord-date-filter.tsx:50-58`, `cost-date-filter.tsx:45-49`). After about 4-5 PM on the US West Coast, the end-date picker shows tomorrow.
  - **Cost period:**
    - `const endDate = toEndOfDayExclusive(params.endDate)` (`cost-analysis/page.tsx:19`) is displayed directly (`:53`).
    - The probe on `?startDate=2026-10-01&endDate=2026-10-17` rendered "Period: Oct 1, 2026 - Oct 18, 2026".
- **Impact:**
  - Operators outside UTC see daily activity attributed to the wrong day, and adjacent charts contradict each other's labels.
  - The "Last 30 days" share chart drops today on quiet days.
  - The cost header misreports the selected range by one day.
  - No stored data, gating or member-facing behaviour is affected.
- **Recommendation:**
  - **Quick fixes, independent of timezone:**
    - include today in the share zero-fill;
    - display `params.endDate` in the cost header, not the exclusive bound.
  - Fold the Discord label parsing into UI-24, and use one label format on both Discord charts.
  - Delete or render `errorTrend`.
  - When `Config.timezone` lands (RWP-03), move the day-key helpers and the filter defaults onto it.
- **Effort:** M

#### GAP-43: No timezone policy: server-rendered admin timestamps show unlabelled container time (UTC in Docker), client-rendered ones show browser time, and the same page mixes both

- **Severity:** Low
- **Status:** adjusted. Operators can already set TZ through `.env`; it is undocumented and has the date-only side effect described below. The fix belongs with RWP-03 and UI-28.
- **Sources:** LTZ-02
- **Where:** `app/admin/llm-usage/conversation/[conversationId]/page.tsx:12-20`; `app/admin/users/[userId]/page.tsx:24-31`; `app/admin/llm-usage/page.tsx:235`; `app/admin/llm-usage/[usageId]/page.tsx:18`; `app/admin/prompts/page.tsx:11`; `app/admin/prompts/[promptId]/page.tsx:23`; `app/admin/settings/page.tsx:429`; `app/admin/shares/page.tsx:161`; `app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx:82`; `components/admin/wrapped/wrapped-viewer.tsx:76`; `app/admin/discord/page.tsx:79-88`; `Dockerfile:1`, `:38-40`; `docker-compose.yml:19-24`; `prisma/schema.prisma`
- **Evidence:**
  - **Server components format in the process timezone:**
    - `new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" })` (`conversation/[conversationId]/page.tsx:12-20`);
    - `new Date(settings.config.updatedAt).toLocaleString()` (`settings/page.tsx:429`);
    - `toLocaleString("en-US", {...})` (`users/[userId]/page.tsx:24-31`).
  - **Both zones on one page:** the probe's post-hydration DOM on the conversation page (LA, en-US) shows the summary `Oct 17, 2026 · 02:26 PM–02:28 PM (2m)` (server, UTC) above rows reading `07:28 AM` and `07:26 AM` (client, LA).
  - **Nothing configures or labels a zone:**
    - `grep timeZone` across app, components, actions, lib and hooks: 0 hits.
    - No `process.env.TZ` or `resolvedOptions` usage, and no timezone or locale field in the schema.
    - The Dockerfile runner stage sets only `NEXT_TELEMETRY_DISABLED`, `PORT` and `HOSTNAME` (`:38-40`), and compose sets no TZ.
  - **Setting TZ shifts date-only strings:** `new Date(startDate).toLocaleDateString("en-US", ...)` on a `"YYYY-MM-DD"` string (`app/admin/discord/page.tsx:79-88`) prints "Sep 16 - Oct 16" under `TZ=America/Los_Angeles` for a Sep 17–Oct 17 window.
- **Impact:**
  - **Unlabelled UTC:** a US admin sees LLM requests, prompt edits, config updates, share visits and user details in UTC, with no zone marker.
  - **Mixed with local time:** those sit next to client tables in local time, so correlating events is off by hours.
  - **Setting TZ is not a clean fix:** doing so, as RWP-03's interim fix suggests, would move the date-only headers back a day.
  - This affects display only.
- **Recommendation:**
  - Reuse RWP-03's `Config.timezone` and the UI-28/DUP-09 formatter rather than adding a separate policy.
  - Format server-rendered admin timestamps in that zone, with `timeZoneName: "short"`.
  - Format `YYYY-MM-DD` keys from their string parts instead of `new Date('YYYY-MM-DD')`.
  - Document TZ in example.env and docker-compose.yml, with the date-only caveat, until that is fixed.
- **Effort:** M

#### GAP-44: The Discord assistant emits server-locale UTC dates and gets no timezone context, unlike `/mymarks`

- **Severity:** Low
- **Status:** confirmed. The Tautulli epoch point applies only to the admin chatbot, because those tools are not Discord-safe.
- **Sources:** LTZ-05
- **Where:** `actions/chatbot/executors/media-marking.ts:168`; `actions/chatbot/tools/media-marking.ts:46-52`; `actions/chatbot/prompts/discord-system-prompt.ts`; `actions/chatbot/prompts/default-system-prompt.ts:187`; `actions/chatbot/executors/tautulli.ts:140`; `lib/discord/commands/mystats.ts:103-108`, `:152`; `lib/discord/commands/mymarks.ts:91`
- **Evidence:**
  - **Correct pattern:** `/mymarks` uses `` `<t:${Math.floor(mark.markedAt.getTime() / 1000)}:R>` `` (`mymarks.ts:91`), so Discord shows each viewer their own timezone.
  - **The assistant's marks tool:** the Discord-safe `get_my_marks` tool (`discordSafe: true`, `tools/media-marking.ts:46-52`) builds `const markedDate = new Date(mark.markedAt).toLocaleDateString()` (`executors/media-marking.ts:168`). That renders as an en-US date for the UTC day.
  - **No time context in the prompts:**
    - The Discord system prompt contains no date or time at all.
    - The admin prompt has only `Current Date: ${new Date().toISOString()}` (`default-system-prompt.ts:187`).
  - **Raw epochs:** Tautulli results pass through as raw JSON (`tautulli.ts:140`).
  - **`/mystats`:** it takes the year from `new Date().getFullYear()` (`mystats.ts:152`) and shows a UTC-bucketed `peakHour.label` (`:103-108`, RWP-03).
- **Impact:**
  - "What did I mark yesterday?" returns UTC calendar dates in US format, so marks made on a US evening show as the next day. The same data reads "2 hours ago" through `/mymarks`.
  - From 4 PM Pacific on New Year's Eve, `/mystats` reports the near-empty new year.
- **Recommendation:**
  - Have Discord tool results emit `<t:unix:f>` and `<t:unix:R>` markup.
  - Give the admin chatbot ISO strings with an offset in `Config.timezone`.
  - Add "Server timezone: <IANA>; local now: <formatted>" to both system prompts.
  - Convert Tautulli epochs to ISO-with-offset before handing them to the model.
  - Derive the `/mystats` year in `Config.timezone`. The peak-hour fix stays with RWP-03.
- **Effort:** S

#### GAP-45: Relative-time helpers count elapsed 24-hour periods instead of calendar days and are English-only, and Rewind eligibility ignores the day of the month

- **Severity:** Low
- **Status:** confirmed. The duplication is DUP-09. The 6-month rule is only a client-side gate; nothing enforces it on the server.
- **Sources:** LTZ-06
- **Where:** `components/dashboard/announcements-card.tsx:114-130`; `lib/utils/time-formatting.ts:106-122`; `components/watchlist/sync-settings-card.tsx:141-154`; `components/admin/queues/scheduler-info.tsx:13-24`; `components/dashboard/wrapped-card.tsx:43-49`
- **Evidence:**
  - **Announcements card** (`announcements-card.tsx:116-123`):
    - It computes `const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)); if (diffDays === 0) { return "Today" } else if (diffDays === 1) { return "Yesterday" }`.
    - So a post from 20:00 yesterday, viewed at 18:00 today, reads "Today".
    - Older posts fall through to `toLocaleDateString("en-US", ...)` with no timeZone (`:127`).
  - **`formatRelativeTime`:** it divides by `days / 30` and `days / 365` (`time-formatting.ts:121-122`), so 360 days reads "12 months ago". The unit names are English literals.
  - **Copies:** `sync-settings-card.tsx` and `scheduler-info.tsx` re-implement the same arithmetic.
  - **Rewind eligibility** (`wrapped-card.tsx:47-49`):
    - Months are computed as `(now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth())`.
    - That ignores the day of the month, and it uses runtime-local months on both server and client.
- **Impact:**
  - Announcements posted yesterday evening are labelled "Today".
  - The Rewind card unlocks up to 30 days early (joined Apr 30, eligible Oct 1), and at month boundaries the server render and the client can disagree.
  - Every relative-time string is English.
- **Recommendation:**
  - Write one `formatRelative(date, { now, tz, locale })` on top of `Intl.RelativeTimeFormat` (`numeric: "auto"`), with calendar-day differences computed in `Config.timezone`.
  - Use it from the announcements card, the Discord tables, watchlist and queues.
  - Compute eligibility on the server with a calendar-aware month add, and pass the boolean to the card.
- **Effort:** S

#### GAP-46: Number grouping depends on which runtime renders it: server components always use en-US, client components the viewer's locale

- **Severity:** Low
- **Status:** confirmed:
  - The verifier counted 94 bare `.toLocaleString()` calls; the auditor counted 96.
  - The Chart.js tooltip runs only in the browser, so it is an inconsistency, not a hydration mismatch.
- **Sources:** LTZ-07
- **Where:** `app/admin/cost-analysis/page.tsx:87`; `components/admin/cost-analysis/cost-trend-chart.tsx:104-105`; `app/admin/discord/page.tsx:131`; `components/admin/discord/discord-active-users.tsx:71`; `components/admin/users/users-stats-summary.tsx:43`; `lib/utils/time-formatting.ts:56`; `components/dashboard/status-background.tsx:103`
- **Evidence:**
  - **Server components** always format en-US in the container:
    - `{stats.totalTokens.toLocaleString()}` (`cost-analysis/page.tsx:87`);
    - `users-stats-summary.tsx:43` and `admin/discord/page.tsx:131`.

    The SSR HTML for a de-DE browser contains `Total Tokens||21,338`.
  - **Client components on the same pages** render `21.338` for de-DE:
    - `` `Tokens: ${point.tokens.toLocaleString()}` `` (`cost-trend-chart.tsx:104-105`);
    - `{user.commandCount.toLocaleString()}` (`discord-active-users.tsx:71`).
  - **Decimals and currency:**
    - Decimals use `toFixed` (53 calls in .tsx files), for example `{percentage.toFixed(1)}% uptime` (`status-background.tsx:103`).
    - Cost is a hard-coded `$` at about 40 sites; precision drift is UI-28.
  - **Caller-dependent helper:** `formatWatchTimeHours` calls `days.toLocaleString()` (`time-formatting.ts:56`), so its output depends on which runtime calls it.
- **Impact:**
  - A de-DE or fr-FR admin sees "21,338" in a KPI tile, "21.338" in the tooltip below it, and "$0.0874" next to both.
  - Client cells of 1,000 or more also add hydration mismatches (GAP-41).
- **Recommendation:**
  - Add `formatNumber`, `formatCompact`, `formatPercent` and `formatCurrency(usd)` to the shared formatter (DUP-09, UI-28). Each should be a cached `Intl.NumberFormat(appLocale, ...)` with explicit fraction digits; the currency one uses `style: "currency", currency: "USD"`.
  - Ban bare `toLocaleString()`, and `toFixed()` in JSX, with lint.
- **Effort:** S

#### GAP-47: i18n readiness: hard-coded `<html lang="en">`, no i18n layer and roughly 1,000 hard-coded UI strings

- **Severity:** Info
- **Status:** confirmed
- **Sources:** LTZ-08
- **Where:** `app/layout.tsx:28`; `lib/discord/commands/mystats.ts:51-52`
- **Evidence:**
  - **Fixed language:** `app/layout.tsx:28` is `<html lang="en">`.
  - **No i18n layer:** package.json has no next-intl, i18next, react-intl, lingui or formatjs, and the app does no Accept-Language negotiation.
  - **Hard-coded strings** (heuristic counts):
    - about 860 JSX text nodes plus 67 attribute strings across 109 admin files;
    - about 34 on the member dashboard;
    - about 46 on the Discord web pages;
    - about 20 in watchlist;
    - about 31 in components/shared;
    - 57 or more constant bot replies, for example `const GENERIC_ERROR = "Sorry, I couldn't load your stats right now..."` (`mystats.ts:51-52`).
- **Impact:**
  - `lang="en"` is accurate for today's English copy.
  - Client components already emit browser-locale formats ("17.10.2026") inside that English text.
  - Translation would mean touching about 1,000 literals.
- **Recommendation:**
  - No translation work now.
  - When an app-locale setting lands with GAP-43, set `<html lang>` from it and keep the formatter locale in sync.
  - Defer an i18n library until there is a concrete need.
- **Effort:** S

## Strengths to preserve

**Privacy and data lifecycle**

- **Bounded BullMQ retention:** completed jobs are kept for 24 h or the last 1000 (`lib/queue/client.ts:27-30`), failed jobs for 7 days (`:31-33`). The Stripe webhook job carries only `{ eventId: event.id }` (`app/api/stripe/webhook/route.ts:93`), so Redis holds no customer PII.
- **Self-cleaning transient Discord tables:**
  - `DiscordPendingSelection` is swept by TTL on read (`lib/discord/commands/mark/pending-store.ts:63-67`).
  - `DiscordOAuthState` drops expired rows and caps pending states per user (`lib/discord/integration.ts:85-102`).
- **Bounded, sanitized assistant context:** `HISTORY_LIMIT = 12` (`lib/discord/chat-history.ts:21`, `:76-82`), and `appendTurn` saves the scrubbed `safeMessage` (`lib/discord/services.ts:206-217`).
- **Clean Discord unlink:** it clears the role-connection metadata at Discord before deleting the local row, and emits `DISCORD_ACCOUNT_UNLINKED` (`lib/discord/integration.ts:337-355`).
- **Read authorization:**
  - Rewind reads enforce owner-or-admin (`actions/user-queries.ts:35-45`).
  - Every admin reader calls `requireAdmin()`.
  - `getUserDetails` maps DiscordConnection to a DTO that omits the OAuth tokens (`:147-159`).
- **Cascades are close to complete:** most User relations cascade (PlexWrapped, LLMUsage, ChatConversation, DiscordConnection, DiscordOAuthState, UserMediaMark, WatchlistSync*, Subscription, InviteUsage), so the schema is close to supporting a correct delete.
- **Audited admin actions:** admin role changes, admin subscription actions and the per-user queue sync emit audit events (`actions/admin/admin-users.ts:71-80`; `actions/admin/subscriptions.ts:81`, `:157`, `:224`; `actions/admin/queue.ts:518-522`).
- **Other privacy-friendly choices:**
  - Share visits store a salted hash, never the raw IP.
  - Personal Discord commands reply ephemerally.
  - Card data never touches the app: Checkout and the Billing Portal are Stripe-hosted.

**Jellyfin and identity**

- **Fail-closed Discord scoping:** users without a plexUserId get empty results rather than other viewers' streams (`actions/chatbot/executors/plex.ts:53-62`, `executors/tautulli.ts:93-105`, `lib/discord/commands/watching.ts:235-239`).
- **No email-only Tautulli lookups:** they are never tried by email alone for Jellyfin members (`mystats.ts:141`, `role-metadata.ts:122`, `app/(app)/page.tsx:86`), so nobody else's history is attributed to them.
- **Safe revoke:** the guards run before any Plex call, the job re-reads live state, and it never unshares by email (`lib/queue/jobs/stripe.ts:584-621`).
- **Jellyfin invite flow:**
  - It has compensating rollbacks, with audit events, for create and policy failures (`actions/invite.ts:846-891`).
  - Jellyfin credentials are Zod-validated and length-bounded (`lib/jellyfin-auth.ts:32-42`).
- **Dedicated Jellyfin onboarding:** a welcome and client-configuration flow with data-testids (`components/onboarding/onboarding-wizard.tsx:97-103`).
- **Honest watchlist message:** watchlist sync states its Plex prerequisite on both server and UI (`actions/watchlist.ts:120-124`, `components/watchlist/sync-settings-card.tsx:234-235`).
- **Shared entitlement check:** entitlement is service-agnostic and shared by the web app and the bot (`lib/access.ts:50-58`), so a Jellyfin capability flag can be added in one place.

**External API usage**

- **Encoded search terms:** all user- and LLM-supplied search terms are encoded (`lib/connections/plex-search.ts:30`, `sonarr.ts:70`, `radarr.ts:70`, `overseerr.ts:75`, `:85`). The *arr history and calendar helpers build query strings with URLSearchParams.
- **titleSlug links:** CLAUDE.md's rule is respected. No browser URL is built from an *arr `id`; cross-links are stored as `titleSlug` (`lib/utils/media-matching.ts:99`, `:210`; `lib/discord/media/mark-media.ts:123`, `:131`).
- **Invite library ids never widen access:** stale ids are dropped and only existing libraries are shared, with no fallback to "all" (`plex-invitations.ts:85-104`).
- **A reusable tri-state:** `actions/user-queries.ts:122` already treats a failed access check as unknown. GAP-05 can reuse it.
- **Correct Jellyfin admin calls:**
  - API-key calls use the modern `Authorization: MediaBrowser Token="..."` header (`jellyfin-core.ts:37`).
  - `setJellyfinUserPolicy` merges the full policy before POSTing (`jellyfin-users.ts:116-144`).
- **Dedupe before requesting:** the Overseerr request path checks media status first and treats 409 or "already" as already_requested (`overseerr.ts:272-303`, `:334`).
- **Documented PIN flow:** PIN creation and the auth URL follow Plex's documented sequence (`lib/plex-auth.ts:47-54`, `:137-148`).

**Operations and documentation**

- **Accurate Stripe docs:** `docs/stripe.md` is accurate on:
  - the webhook path and the 4 event types;
  - where to find the keys;
  - the "Missing: ..." enable guard (`actions/admin/admin-config.ts:300-309`);
  - disable semantics and troubleshooting.
- **Stripe symbols resolve:** all 7 symbols CLAUDE.md names exist where it says:
  - `getStripe` (`lib/stripe/client.ts:53`);
  - `getOfferedPrices` (`prices.ts:107`);
  - `mapStripeStatus` (`events.ts:35`);
  - `getCurrentPeriodEnd` (`events.ts:115`);
  - `startCheckout` and `openBillingPortal` (`actions/subscription.ts:61`, `:134`);
  - `evaluateRevokeGuard` (`lib/queue/jobs/stripe.ts:536`).

  `ENCRYPTED_FIELDS` is at `lib/prisma.ts:23-35`.
- **Accurate Discord docs:** `docs/discord-bot.md` matches the code on:
  - the redirect path (`lib/discord/integration.ts:11`);
  - the Linked Roles metadata keys (`role-metadata.ts:50`, `:55`);
  - the configVersion token-rotation bounce (`lib/discord/lock/poller.ts`).
- **Right migration primitive:** the container runs `prisma migrate deploy` (`docker-entrypoint.sh:5`, `build.yml:88`), and Prisma's advisory lock serializes concurrent replicas (BP-16).
- **Data-safe migrations:** migrations that drop data backfill first (`add_multi_service_auth:12-27`), and the Stripe migration grandfathers existing members (`add_stripe_subscriptions:18`).
- **example.env defaults match the code:**
  - `LLM_REQUEST_TIMEOUT_MS` 300000 (`lib/wrapped/api-calls.ts:20-22`);
  - `QUEUE_WORKER_CONCURRENCY` 5;
  - the `LOG_LEVEL` levels (`lib/utils/logger.ts:205-215`);
  - `ENABLE_QUEUE_WORKER` on unless "false";
  - `DEV_*` gated to development (`actions/dev-defaults.ts:121`).
- **README security claims that hold:**
  - share tokens are 32 random bytes (`lib/utils.ts:14-19`);
  - no `dangerouslySetInnerHTML` anywhere;
  - webhooks are signature-verified on the raw body (`route.ts:66-78`).
- **Safe scripts:** the seed refuses `NODE_ENV=production` (`prisma/seed.ts:13-16`). The Discord scripts give clear "where to get this value" errors and do an idempotent bulk overwrite.
- **Commands and links resolve:** the slash commands CLAUDE.md lists exist in `.claude/commands/`, and the README/CLAUDE.md links to `e2e/README.md`, `lib/utils/logger.ts`, `docs/stripe.md` and `docs/images/*` resolve.

**Formatting**

- **Discord timestamps:** `/mymarks` uses Discord timestamp markup (`lib/discord/commands/mymarks.ts:91`), so each viewer sees their own timezone and language.
- **One day-key helper:**
  - Discord audit metrics share one `toDateKey` and one half-open `dateRangeWhere` (`lib/discord/audit/query-helpers.ts:19-36`).
  - `toEndOfDayExclusive` documents its UTC assumption (`lib/utils/formatters.ts:16-25`).
  - A fix touches one helper.
- **Unambiguous data:** server actions serialize instants as ISO strings before handing them to client components (`actions/discord-activity.ts:62-67`, `actions/announcements.ts:60`).
- **A model formatter:** the Stripe plan list uses `Intl.NumberFormat(..., { style: "currency", currency })` with a fallback for unknown codes (`components/subscribe/plan-list.tsx:29-36`), which is the right pattern for a shared formatter.
- **No new dependency needed:** no date library is bundled, and Node's full ICU already supports `Intl.DateTimeFormat({ timeZone })`.

## Metrics and inventories

### Privacy: personal-data inventory

Readers: M = member, A = admin, P = public.

| model.field | category | writer | readers (M / A / P) | retention | removed on offboarding | encrypted at rest |
|---|---|---|---|---|---|---|
| User.name, email, image | identity/contact | `lib/auth.ts:202-209`, `:226-234`, `:357-366`; `actions/import-plex-users.ts:75-83` | M own; A users list and detail, shares, marked media, watchlist panel, LLM usage; P name (falls back to email) and image on the share link (`share/[token]/route.ts:85-86`) | forever; overwritten at each login | N | N |
| User.plexUserId, jellyfinUserId | identity | `lib/auth.ts:204`, `:359` | A | forever | N | N |
| User.plexAuthToken | credential | `lib/auth.ts:205`, `:229` | not displayed; used at `lib/watchlist/sync-service.ts:80`, `lib/queue/jobs/stripe.ts:461-465` | forever | N | Y only when ENCRYPTION_KEY is set (SEC-33) |
| User.isExempt, exemptReason | billing note | `actions/admin/subscriptions.ts:217-227` | A | forever | N | N |
| PlexWrapped.data, summary, archetype | viewing history, LLM text, other users' leaderboards | `actions/wrapped-generation.ts:331-340`; `actions/playground-wrapped.ts:106-130` | M viewer; A `/admin/users/[id]/wrapped`; P share link (SEC-16) | forever; overwritten on regeneration | N | N |
| PlexWrapped.error | may hold every user's name and email (SEC-17) | `actions/wrapped-generation.ts:344-350` | M toast; A | until the next success | N | N |
| PlexWrapped.shareToken | bearer link | `actions/wrapped-generation.ts:135-136`, `:327` | M; A `/admin/shares` | forever; cannot be revoked | N | N |
| WrappedShareVisit.ipAddress (hash), userAgent, referer | visitor network data (non-members) | `app/api/wrapped/share/[token]/route.ts:56-66` | never read (only count and createdAt, `actions/share-analytics.ts:52`, `:110-118`) | forever | N | N (salted SHA-256 only) |
| LLMUsage.prompt, response | viewing stats, member chat text, tool output, playground copies | `lib/wrapped/llm.ts:48-60`, `:129-141`; `actions/chatbot/conversation.ts:86-97`; `actions/prompt-test.ts:109-121` | A `/admin/llm-usage/[id]`, conversation page, Rewind history page | forever | N | N |
| ChatConversation.userId, createdAt | linkage | `lib/discord/chat-session.ts:140-142`; `lib/discord/services.ts:283-285`; `lib/chatbot/assistant.ts:77-80` | A (via LLM usage) | forever; endedAt never written | N | N |
| DiscordChatSession.messages, discordUserId, channelId | DM text (12 turns) | `lib/discord/chat-session.ts:144-158`, `:215-223` | none (LLM context only) | until the next DM after 30 min idle, or a reset | N (kept on unlink) | N |
| DiscordConnection.discordUserId, username, globalName, avatar | identity | `lib/discord/integration.ts:173-202` | M link panel; A user detail | until unlink | Y on unlink only | N |
| DiscordConnection.accessToken, refreshToken | credential | `lib/discord/integration.ts:183-185`, `:268-276` | none | until unlink (grant not revoked at Discord) | Y on unlink only | Y only when ENCRYPTION_KEY is set |
| DiscordOAuthState.state, redirectTo | transient | `lib/discord/integration.ts:104-112` | none | expired rows swept when a link starts (`:85-91`) | n/a | N |
| DiscordPendingSelection.discordUserId, results | transient | `lib/discord/commands/mark/pending-store.ts:80-89` | none | TTL sweep on read (`:63-67`) | Y (TTL) | N |
| DiscordCommandLog.discordUserId, discordUsername, userId, channelId, guildId, commandArgs, error | identity and DM free text | `lib/discord/audit/write.ts:43-56`; `lib/discord/routing/dm-router.ts:170-176`; `lib/discord/routing/interaction-router.ts:135-144`, `:208-217` | A `/admin/discord` table, active users, user timeline | forever | N (no foreign key) | N |
| UserMediaMark.title, markType, markedAt, markedVia, discordChannelId | viewing behaviour | `lib/discord/media/mark-media.ts:135-164` | M `/mymarks`; A marked media, timeline | forever (no reachable delete) | N | N |
| UserWatchIntent.* | planned viewing | no writer | none | n/a | N | N |
| WatchlistSyncSettings.syncEnabled, lastSyncError, counters | preference | `lib/watchlist/sync-service.ts:268-280`; `actions/watchlist.ts:150-160` | M card; A counts | forever | N (sync stays on) | N |
| WatchlistSyncHistory.title, year, tmdbId, imdbId, status, syncedAt | private Plex watchlist | `lib/watchlist/sync-service.ts:163` | M 5 latest while sync is on (`actions/watchlist.ts:54-68`); A 10 latest across members with name and email (`actions/admin/watchlist.ts:105-117`) | forever; removals never recorded | N | N |
| InviteUsage.userId, usedAt | join record | `actions/invite.ts:353`, `:766` | A `/admin/invites/[id]` | until the invite is deleted (cascade) | N | N |
| Subscription.stripeCustomerId, stripeSubscriptionId, status, priceId, currentPeriodEnd, canceledAt, plexInviteStatus | billing | `lib/queue/jobs/stripe.ts:92`, `:223`, `:274`, `:643-646` | M status view; A users list | forever | N (status only) | N |
| StripeEvent.id, type | no personal data | `app/api/stripe/webhook/route.ts` | none | forever | n/a | N |
| stdout logs | email on unshare (`actions/user-queries.ts:302-313`), audit events (SEC-55), IPs (SEC-54) | | operator | log rotation | N | N |

**Admin surfaces that show another member's content.** There are 10, and none is audit-logged:

1. the `/admin/users/[id]` activity timeline (DM text and marks);
2. `/admin/users/[id]/wrapped` (any year's Rewind);
3. `/admin/llm-usage/[usageId]` (full prompt and response);
4. `/admin/llm-usage/conversation/[id]` (transcript and last-message snippets);
5. `/admin/wrapped/[id]/history/[llmUsageId]` (past Rewind versions);
6. the `/admin/discord` activity table (`commandArgs`);
7. `/admin/discord` marked media (every member's marks, with name and email);
8. the `/admin/settings` watchlist panel (recent watchlist titles by member);
9. `/admin/playground` (any member's Tautulli stats by name or email; can be saved as their Rewind);
10. the admin chatbot's `get_tautulli_watch_history` and `get_tautulli_user_watch_stats` for any user.

There are also 3 metadata-only surfaces (the users list, `/admin/shares`, invite detail), none of them audited.

**Admin actions that change or create member data.**

- No audit event: `unshareUserLibrary`, `importPlexUsers`, admin Rewind regeneration, `savePlaygroundWrapped`, `forceUserWatchlistSync`, and `testPromptTemplate` (run on member stats).
- Audited: `updateUserAdminStatus`, `triggerWatchlistSyncJob({ userId })`, `adminCancelSubscription`, `adminGrantAccess`, `adminToggleExempt`.

**Deletion paths.**

- Account or user deletion: 0. Only `prisma/seed.ts:29-37` and the e2e helpers delete users.
- Member-reachable: 2.
  - One row delete: Discord unlink (`lib/discord/integration.ts:350`).
  - One context clear, which empties only `DiscordChatSession.messages` (`lib/discord/services.ts:287-295`).
- Admin deletion of member data: 0. Deleting an invite cascades to InviteUsage as a side effect.
- Automatic TTL: 2 tables (DiscordOAuthState, DiscordPendingSelection).
- Dead: 1 (`deleteUserMediaMark`; `actions/user-marks.ts` is imported nowhere).

**Export paths.**

- Machine-readable: 0.
- Image: 1, the Rewind PNG share card (`components/wrapped/share-card-download.tsx:22-29`).
- Read-only views: the Rewind viewer, the 5 latest watchlist items, and `/mymarks` (an ephemeral Discord embed).

**User-facing privacy statements.** 16 statements: 5 true, 4 partly true, 5 false, 1 omission, 1 weak. The verifier softened several "false" verdicts (see GAP-32 and GAP-34).

| # | Location | Statement | Verdict |
|---|---|---|---|
| 1 | `lib/discord/commands/assistant.ts:171` | "answer is only visible to you" | Accurate for Discord display; the Q&A is stored in LLMUsage (`actions/chatbot/conversation.ts:86-97`) and shown at `/admin/llm-usage` |
| 2 | `docs/discord-bot.md:23` | "answers ephemerally" | True (Discord display only) |
| 3 | `lib/discord/commands/mystats.ts:188`, `help.ts:68` | "(only visible to you)" | True; ephemeral reply (`mystats.ts:133`), no LLM involved |
| 4 | `lib/discord/services.ts:203` | "Personal details were removed for privacy" | True for the reply; raw text is stored first (`conversation.ts:93`, sanitized at `services.ts:196`) |
| 5 | `dm-router.ts:146`, `assistant.ts:142` | "Chat context cleared! Starting fresh." | True for the context only; nothing is deleted (`services.ts:283-295`) |
| 6 | `docs/discord-bot.md:16-17` | "only the invoking user sees them" | True in Discord; DM text still reaches the admin table (`dm-router.ts:175`) |
| 7 | `docs/discord-bot.md:130` | "flows into the LLMUsage table for cost tracking" | Partly true; the table also keeps the full text indefinitely |
| 8 | `docs/discord-bot.md:135-137` | "identifying fields never enter the context" | Mostly true; see SEC-50 for the exceptions |
| 9 | `components/auth/plex-sign-in-button.tsx:131-132` | "only needed to match your Plex account" | False; the token is stored at every login (`lib/auth.ts:205`, `:229`) and reused (GAP-34) |
| 10 | `plex-sign-in-button.tsx:125-126` | invite copy | Partly true; the token is kept afterwards |
| 11 | `components/auth/jellyfin-sign-in-button.tsx:206` | Jellyfin copy | True; no Jellyfin token is stored |
| 12 | `components/wrapped/wrapped-share-button.tsx:125` | "Share your wrapped summary" | False; the link serves the full JSON (SEC-16), every visit is tracked, and the link cannot be revoked |
| 13 | `components/discord/link-panel.tsx:81`, `:148`, `link-callout.tsx:119` | "sync your Plex membership status" | Partly true (the name or email also goes to Discord, SEC-47); both components are not rendered |
| 14 | `help.ts:96` | "also marks as watched in Plex" | False; see SEC-48 |
| 15 | `components/generator/wrapped-generator-prompt.tsx:22`, `wrapped-home-button.tsx:236` | Rewind generation copy | Omission; nothing says the Plex username and viewing stats go to OpenAI (`lib/wrapped/prompt-template.ts:34`) |
| 16 | `lib/security/ip-hash.ts:4`, `share/[token]/route.ts:63` (developer-facing) | "for privacy" | Weak; reversible in about 87 CPU-minutes (825k SHA-256 hashes per second on one Node core) |

### Jellyfin feature matrix

| # | Feature | Plex | Jellyfin | Evidence |
|---|---|---|---|---|
| 1 | Login | works | broken on Jellyfin 12.0 (GAP-01); otherwise works with SEC-08, SEC-14, SEC-35 caveats | `lib/auth.ts:141-190` vs `:286-322` |
| 2 | Onboarding | works | Plex flow shown to invite-created members (GAP-24); works for direct sign-ins | `app/(app)/page.tsx:75-79`; `actions/invite.ts:744-750` |
| 3 | Card: Rewind | works | errors (RWP-08); hidden for the first 6 months because memberSince = createdAt | `wrapped-card.tsx:156-158`; `app/(app)/page.tsx:85-91` |
| 4 | Card: media-server link | works | plex.tv tile for invitees; internal URL (UI-38); jellyfin.org when the login button is hidden (GAP-29) | `user-dashboard.tsx:105`; `app/(app)/page.tsx:104-106`; `media-server-link-card.tsx:14` |
| 5 | Card: Requests | works | degrades, with the wrong message ("Log in with your Plex account") | `user-dashboard.tsx:108-109`; `media-request-step.tsx:61` |
| 6 | Card: Discord | works | works | `user-dashboard.tsx:113-117` (the "Plex membership" copy is in the unrendered `link-callout.tsx:119`) |
| 7 | Card: Watchlist sync | works | degrades, with an honest message | `sync-settings-card.tsx:234-235` |
| 8 | Card: Announcements | works | works | `user-dashboard.tsx:92-94` |
| 9 | Card: Membership and banners | works | errors ("We've sent a Plex invite") | `subscription-banners.tsx:63`; `app/subscribe/success/page.tsx:68` |
| 10 | Status footer | works | works for direct sign-ins; label hidden for invitees | `status-background.tsx:26-27`, `:50` |
| 11 | Member-since | works (Tautulli) | silently empty (falls back to createdAt) | `app/(app)/page.tsx:86-91` |
| 12 | Rewind | works | errors (RWP-08) | `actions/wrapped-generation.ts` |
| 13 | Discord link | works | works | `app/(app)/discord/connect/route.ts:18-37` |
| 14 | `/mystats` | works | silently empty (NO_DATA "Watch something and check back later!") | `lib/discord/commands/mystats.ts:141-144`, `:53-54` |
| 15 | `/watching` | works (owner never matched, GAP-08) | silently empty (EMPTY_STATE) | `watching.ts:235-239` |
| 16 | `/mark` | unsafe (SEC-48) | unsafe (SEC-48), and searches the Plex library | `mark/index.ts:195-203`; `media/mark-media.ts:168` |
| 17 | `/mymarks` | works | works | `mymarks.ts:176-205` |
| 18 | `/assistant` | works | silently empty (tools emptied; prompt scope is Plex-only) | `executors/plex.ts:53-62`; `executors/tautulli.ts:93-105`; `prompts/discord-system-prompt.ts:10` |
| 19 | `/help` | works | Plex-only copy (accurate for Plex-only features) | `lib/discord/commands/help.ts:68`, `:96`, `:220` |
| 20 | Linked roles | works (stale, SEC-47) | silently empty (is_subscribed always false, no watched_hours) | `lib/discord/role-metadata.ts:83`, `:122` |
| 21 | Media marks (actions) | works | works (keyed by plexRatingKey) | `actions/user-marks.ts:74-103` |
| 22 | Watchlist sync | likely requests nothing (GAP-02) | degrades, with an honest message | `actions/watchlist.ts:120-124`; `lib/watchlist/sync-service.ts:45-51` |
| 23 | Overseerr requests | works (SEC-27) | not reachable through watchlist; portal copy says "Plex" | `components/onboarding/onboarding-steps/media-request-step.tsx:61` |
| 24 | Stripe subscribe | works | unsafe: offered to gated members, buys a Plex invite (GAP-23) | `app/subscribe/page.tsx:40-47`; `lib/auth.ts:357-366` |
| 25 | Stripe grant | works | unsafe: Plex invite to the username-derived email, or 3 failed attempts (GAP-23) | `lib/queue/jobs/stripe.ts:426-449` |
| 26 | Stripe revoke | over-revokes (GAP-04) | never touches Jellyfin (GAP-23) | `lib/queue/jobs/stripe.ts:617-620` |
| 27 | Admin list | works | silently empty: hidden by the default filter (UI-05) | `components/admin/users/users-list.tsx:16-27` |
| 28 | Admin detail | works | silently empty ("Plex ID: —", "Plex Access: —") (GAP-27) | `app/admin/users/[userId]/page.tsx:90-113` |
| 29 | Admin unshare | over-revokes (GAP-04) | no way to remove Jellyfin access (GAP-27) | `actions/user-queries.ts:279-281`; `user-actions-menu.tsx:165` |
| 30 | Admin import | imports non-members (GAP-06) | silently absent (`getJellyfinUsers` never called) | `actions/import-plex-users.ts:24-42`; `lib/connections/jellyfin-users.ts:337` |
| 31 | Admin comp grant | works | unsafe: Plex invite (GAP-23) | `actions/admin/subscriptions.ts:141-152` |
| 32 | Admin cancel subscription | works | billing stops, Jellyfin access untouched (GAP-23) | `actions/admin/subscriptions.ts:41-47`; `stripe.ts:617-620` |
| 33 | Admin role change | reverted at next login (SEC-12) | reverted at next login (SEC-12) | `actions/admin/admin-users.ts:65-68` |
| 34 | Admin detection | server owner only | any Jellyfin Administrator; demoted when the lookup fails (GAP-26) | `lib/auth.ts:193`; `lib/jellyfin-auth.ts:142-159` |
| 35 | Assistant `get_plex_status` | works | reports the Plex server | `actions/chatbot/tools/plex.ts:12` |
| 36 | Assistant `get_plex_sessions` / `get_tautulli_activity` | works (scoped; owner never matched, GAP-08) | silently empty | `executors/plex.ts:53-62`; `executors/tautulli.ts:93-105` |
| 37 | Assistant `mark_media_*` | unsafe (SEC-48) | unsafe (SEC-48), plus the Plex library | `actions/chatbot/executors/media-marking.ts:46-49` |
| 38 | Assistant `get_my_marks` and the Overseerr/Sonarr/Radarr status tools | works | works | `actions/chatbot/tools/*.ts` |
| 39 | Removal reflected (sessions, Discord, admin list) | no (SEC-10) | no (SEC-10); Jellyfin state is never re-read after login | `lib/auth.ts:487-490`; `lib/jellyfin-auth.ts:149` |

**Plex-only features.** 15 features depend only on Plex or Tautulli:

- Rewind, member-since, watchlist sync;
- `/mystats`, `/watching`, `/mark`;
- the assistant's session, activity and status tools;
- linked roles;
- Stripe grant and Stripe revoke;
- the admin access column and filter, unshare, import and comp grant.

None of the 15 shows a Jellyfin-specific message, and 14 give a Jellyfin member no accurate explanation. Watchlist sync is the only one that explains its Plex prerequisite.

**Other counts.**

- `primaryAuthService` is written in 2 app code paths (`lib/auth.ts:345`, `:363`) and read in 7 places.
- Jellyfin user helpers: 6 exported. `getJellyfinUsers` is never called, and `deleteJellyfinUser` is called only for invite rollback.

### External API endpoint inventory

69 outbound call sites were checked (endpoint plus calling function). Rows marked xN group N correct sibling endpoints.

Doc keys:

| Key | Source |
|---|---|
| PG | Plex auth guide, https://forums.plex.tv/t/authenticating-with-plex/609370 |
| PMS | developer.plex.tv/pms OpenAPI, as packaged in `@lukehagar/plexjs` 0.43.0 |
| PAPI | python-plexapi `myplex.py` and `base.py` |
| OSP | Overseerr `server/api/plextv.ts` |
| WZ | Wizarr `plex_custom.py` |
| OV | https://api-docs.overseerr.dev (`overseerr-api.yml` plus `server/entity/MediaRequest.ts` and `server/routes/*`) |
| SO | https://sonarr.tv/docs/api (`Sonarr.Api.V3/openapi.json`) |
| RA | https://radarr.video/docs/api (`Radarr.Api.V3/openapi.json`) |
| JF | https://api.jellyfin.org plus Jellyfin `AuthorizationContext.cs`, `ServerConfiguration.cs`, `SessionManager.cs` |
| PR | https://prometheus.io/docs/prometheus/latest/querying/api/ |

| service | method | URL | caller | doc | verdict |
|---|---|---|---|---|---|
| plex.tv | GET | plex.tv/api/v2/user | `lib/connections/plex-user-info.ts:43` (login, invite, setup) | PG | unvalidated shape |
| plex.tv | GET | plex.tv/api/v2/user | `lib/watchlist/plex-watchlist.ts:179` | PG | wrong error mapping (GAP-05) |
| plex.tv | POST | plex.tv/api/v2/user?strong=true | `lib/plex-auth.ts:102` (dead, DUP-13 inventory) | PG | wrong method (doc: GET) |
| plex.tv | POST | plex.tv/api/v2/pins?strong=true | `lib/plex-auth.ts:47` | PG | correct |
| plex.tv | GET | plex.tv/api/v2/pins/{id} | `lib/plex-auth.ts:75` | PG | correct (security: SEC-11) |
| app.plex.tv | nav | app.plex.tv/auth#? | `lib/plex-auth.ts:148` | PG | correct (encoding: SEC-56) |
| plex.tv | GET | clients.plex.tv/api/users | `plex-user-info.ts:101/115` via `plex-user-access.ts:94` (login gate), `user-queries.ts:380` | PAPI, OSP | wrong error mapping (GAP-05); no paging exists, fetch-all is correct |
| plex.tv | GET | clients.plex.tv/api/users | `plex-user-info.ts:253/270` via `import-plex-users.ts:39`, `app/api/admin/plex/users/route.ts:37` | PAPI | unvalidated shape, misread (GAP-06) |
| plex.tv | GET | plex.tv/api/v2/servers/{machineId} | `plex-invitations.ts:40` | undocumented | unvalidated shape (guesses librarySections/LibrarySections, id/ID, key/Key; DUP-03) |
| plex.tv | POST | clients.plex.tv/api/v2/shared_servers | `plex-invitations.ts:115/134` via `invite.ts:631`, `stripe.ts:445` | WZ (same field names) | non-idempotent (SEC-38) |
| plex.tv | POST | plex.tv/api/v2/shared_servers/{id}/accept | `plex-invitations.ts:216/218` via `invite.ts:382`, `stripe.ts:462` | WZ (same path on clients.plex.tv) | correct |
| plex.tv | DELETE | plex.tv/api/v2/sharings/{plexUserId} | `plex-invitations.ts:279/282` via `stripe.ts:632`, `user-queries.ts:293` | PAPI (removeFriend) | non-idempotent and not server-scoped (GAP-04) |
| discover | GET | discover.provider.plex.tv/library/sections/watchlist/all | `plex-watchlist.ts:125` via `sync-service.ts:80` | OSP, PAPI | missing pagination and unvalidated shape (GAP-02) |
| PMS | GET | /identity | `plex-connection.ts:56` | PMS | correct (but called on every login, GAP-05) |
| PMS | GET | /status/sessions | `plex-connection.ts:18` (connection test) | PMS | correct |
| PMS | GET | /status/sessions | `plex-sessions.ts:60` via `watching.ts:249`, `executors/plex.ts:21` | PMS, PAPI | unvalidated shape, User.id = 1 misread (GAP-08) |
| PMS | GET | /library/sections | `plex-sessions.ts:67` | PMS (/library/sections/all) | correct (legacy alias) |
| PMS | GET | /library/recentlyAdded?limit= | `plex-sessions.ts:74` | PMS (not listed) | wrong param (GAP-10) |
| PMS | GET | /library/onDeck | `plex-sessions.ts:101` | PMS (/hubs/continueWatching) | correct (legacy) |
| PMS | GET | /search?query=&type= | `plex-search.ts:30` | PMS (/hubs/search) | unvalidated shape (`item: any`); encoding correct |
| PMS | GET | /:/scrobble | `plex-marking.ts:21` via `mark-media.ts:168` | PMS (PUT) | wrong method (owner token: SEC-48) |
| Overseerr | GET | /api/v1/auth/me | `overseerr.ts:15` | OV | correct |
| Overseerr | GET | /api/v1/request?take&sort=added&filter=processing | `overseerr.ts:55` | OV | correct |
| Overseerr | GET | settings/about, discover/movies, discover/tv, {movie,tv}/{id}, request?take&sort (x5) | `overseerr.ts:64`, `:75`, `:85`, `:94`, `:112` | OV | correct |
| Overseerr | GET | /api/v1/user | `overseerr.ts:103` via `executors/overseerr.ts:52` | OV (take default 10) | missing pagination (GAP-07) |
| Overseerr | GET | /api/v1/{movie,tv}/{tmdbId} | `overseerr.ts:145` via `:272` | OV | unvalidated shape (status4k ignored, GAP-03) |
| Overseerr | POST | /api/v1/request | `overseerr.ts:306/320` via `sync-service.ts:134` | OV | wrong body (no TV seasons) plus wrong error mapping (202/403) (GAP-03) |
| Sonarr | GET | system/status x2, health, diskspace, series/lookup, series, series/{id}, rootFolder, qualityProfile, episode?seriesId, episode/{id} (x10) | `sonarr.ts:14`, `:54`, `:62`, `:66`, `:70`, `:94`, `:98`, `:115`, `:119`, `:123`, `:127` | SO | correct |
| Sonarr | GET | /api/v3/queue | `sonarr.ts:58` | SO (paged) | missing pagination |
| Sonarr | GET | /api/v3/history?sortDir&seriesId | `sonarr.ts:79-90` | SO | wrong param: `seriesId` ignored; `sortDir` harmless (GAP-07) |
| Sonarr | GET | /api/v3/calendar | `sonarr.ts:101-105` | SO | wrong param (no includeSeries) |
| Sonarr | GET | /api/v3/wanted/missing?sortDir | `sonarr.ts:111` | SO | wrong param (no includeSeries) |
| Radarr | GET | system/status, health, diskspace, movie/lookup, movie, movie/{id}, calendar, rootFolder, qualityProfile, moviefile (x10) | `radarr.ts:14`, `:54`, `:62`, `:66`, `:70`, `:90`, `:94`, `:98`, `:111`, `:115`, `:119` | RA | correct |
| Radarr | GET | /api/v3/queue | `radarr.ts:58` | RA (paged) | missing pagination |
| Radarr | GET | /api/v3/history?sortDir&movieId | `radarr.ts:78-86` | RA | wrong param: `movieId` ignored (GAP-07) |
| Radarr | GET | /api/v3/wanted/missing?sortDir | `radarr.ts:107` | RA | wrong param |
| Jellyfin | various | System/Info x2, Library/VirtualFolders, Users/New, Users/{id} GET, Users/{id}/Policy, Users/{id} DELETE, Users (x7) | `jellyfin-connection.ts:22`, `:73`, `:107`; `jellyfin-users.ts:35`, `:117/:243`, `:154`, `:202`, `:341` | JF | correct |
| Jellyfin | POST | /Users/AuthenticateByName | `jellyfin-users.ts:284` via `lib/jellyfin-auth.ts:87` | JF | wrong header, legacy auth (GAP-01) |
| Prometheus | GET | /api/v1/status/buildinfo | `prometheus.ts:24` | PR | correct |
| Prometheus | GET | /api/v1/query, /api/v1/query_range | `prometheus.ts:75`, `:131` | PR | wrong error mapping (GAP-09) |

**Verdict counts (69 call sites).**

| Verdict | Count | Sites |
|---|---|---|
| correct | 43 | |
| wrong path, param or method | 10 | pins-user POST, recentlyAdded limit, scrobble GET, Overseerr TV body, Sonarr history/calendar/wanted, Radarr history/wanted, Jellyfin auth header |
| missing pagination | 4 | watchlist, Overseerr /user, Sonarr queue, Radarr queue |
| unvalidated shape | 6 | api/v2/user, /api/users friend list read as a server list, api/v2/servers sections, PMS sessions User.id, PMS /search, Overseerr media status4k |
| wrong error mapping | 4 | validatePlexToken, /api/users access gate, Prometheus query and query_range (the Overseerr POST also has this as a secondary verdict) |
| non-idempotent | 2 | shared_servers POST (SEC-38), sharings DELETE |

Almost every "correct" row is still cast without Zod, which is DUP-03.

**Member-visible feature broken by each defect.**

- **GAP-02:** "Sync my Plex watchlist to requests" requests nothing, or only page 1, while reporting success.
- **GAP-03:** every watchlisted TV show fails with "Cannot read properties of undefined (reading 'filter')" on the sync card and is retried every interval.
- **GAP-01:** Jellyfin sign-in fails for all members on Jellyfin 12.0.
- **GAP-05:**
  - a paying member sees "Access Denied" during a plex.tv or PMS hiccup;
  - the Discord subscriber role is pulled;
  - the watchlist card says "Plex token expired - please log in again".
- **GAP-04:** a lapsed subscriber loses access to every server the owner shares, and revoke retries end as failed jobs with `plexInviteStatus` never set to revoked.
- **GAP-06:** admin user import and the playground list non-members, and managed users are missing.
- **GAP-07:**
  - chatbot and Discord-admin answers about "download history for X" show unrelated server-wide events;
  - calendar and missing answers lack show names;
  - only 10 Overseerr users are listed.
- **GAP-08:** the server owner's `/watching` is always empty.
- **GAP-09:** the admin sees "Bad Request" instead of the PromQL error.
- **GAP-10:** the chatbot's "recently added N" may ignore N.

**Verification limits.**

- plex.tv, developer.plex.tv, api-docs.overseerr.dev, sonarr.tv, radarr.video and prometheus.io do not resolve from the sandbox.
- Contracts were checked instead against each project's published spec or source on raw.githubusercontent.com, and against the npm SDKs (`@lukehagar/plexjs` 0.43.0, `@jellyfin/sdk` 1.0.1).
- No live Plex endpoint was called.

### Operator documentation

**Env-var matrix.** Code under app/, actions/, lib/, scripts/, components/, `instrumentation.ts`, `proxy.ts`, `next.config.js` and prisma/ reads 76 distinct names, 45 of them DEV_*. example.env lists 62 (42 DEV_*), and README names 8.

| Name | Read at | example.env | README | Default | Required |
|---|---|---|---|---|---|
| DATABASE_URL | `lib/prisma.ts:70`, `:74`; `prisma.config.ts:11`; `prisma/seed.ts:18`; `app/admin/settings/page.tsx:63`, `:422` | Y | Y | none (throws at import; every Prisma CLI command, including validate) | Required |
| NEXT_PUBLIC_APP_URL | `lib/utils.ts:35-36`; `lib/discord/config.ts:104` | Y | Y | NEXTAUTH_URL, then localhost (dev only) | Required in prod (one of the pair); inlined at build |
| NEXTAUTH_URL | `lib/utils.ts:40-41` (and next-auth) | Y | Y | none | Required |
| NEXTAUTH_SECRET | `lib/security/ip-hash.ts:15` (and next-auth) | Y (placeholder, SEC-09) | Y | "dev-salt-only" for the IP hash in dev | Required |
| PLEX_CLIENT_IDENTIFIER | `lib/plex-auth.ts:28`; `lib/connections/plex-core.ts:99` | Y (empty "") | Y (not in the prod list) | none; throws at login | Required |
| ENCRYPTION_KEY | `lib/security/crypto.ts:57` | commented | Y | unset = plaintext | Optional (recommended) |
| REDIS_URL | `lib/queue/connection.ts:31`, `:42`; `lib/instrumentation/node.ts:33` | commented | Y | unset = no worker | Optional; required for Stripe |
| ENABLE_QUEUE_WORKER | `node.ts:25` | commented | N (docs/stripe.md) | on unless "false" | Optional |
| QUEUE_WORKER_CONCURRENCY | `lib/queue/worker.ts:23` | commented | N | 5 | Optional |
| ENABLE_WATCHLIST_SYNC | `node.ts:106` | N | N | on unless "false" (no-Redis path only) | Optional |
| WATCHLIST_SYNC_POLL_INTERVAL_MS | `node.ts:125` | N | N | 60000 | Optional |
| ENABLE_DISCORD_BOT | `node.ts:168` | commented | N (docs contradict: `:53` vs `:88`) | on unless "false" (and DB botEnabled at boot) | Optional |
| DISCORD_BOT_POLL_INTERVAL_MS | `node.ts:208` | commented | N | 60000 (longer than the 30 s lease, BP-12) | Optional |
| DISCORD_BOT_TOKEN | `lib/discord/config.ts:66`, `:70`; `scripts/register-discord-commands.ts:31`; `register-discord-metadata.ts:21` | commented | N (docs) | DB botToken wins | Bot: fallback; scripts: required |
| DISCORD_CLIENT_ID | `register-discord-commands.ts:32`; `register-discord-metadata.ts:22` | N | N (docs) | NEXT_PUBLIC_DISCORD_CLIENT_ID | Required for scripts |
| NEXT_PUBLIC_DISCORD_CLIENT_ID | same lines | N | N | none | Alias |
| DISCORD_GUILD_ID | `register-discord-commands.ts:33` | N | N (docs) | global registration | Optional |
| DISCORD_SUPPORT_CHANNEL_ID | `lib/discord/config.ts:81` | commented | N (docs) | DB wins | Optional |
| DISCORD_SUPPORT_THREAD_IDS | `lib/discord/config.ts:93` | commented | N (docs) | DB wins | Optional |
| DISCORD_PORTAL_URL | `lib/discord/config.ts:106` | commented | N | `<base>/discord/link` | Optional |
| PLEX_WRAPPED_BASE_URL | `lib/discord/config.ts:103` | commented (described wrongly) | N | none (overrides NEXT_PUBLIC_APP_URL for the portal) | Optional |
| LLM_REQUEST_TIMEOUT_MS | `lib/wrapped/api-calls.ts:20-21` | commented | N | 300000 | Optional |
| LOG_LEVEL | `lib/utils/logger.ts:205`; `lib/discord/bot.ts:48` | commented | N | info in prod, debug otherwise | Optional |
| JELLYFIN_DEVICE_ID | `lib/connections/jellyfin-core.ts:48` | N | N | "plex-wrapped-server" | Optional |
| SKIP_CONNECTION_TESTS | `lib/connections/{tautulli:7, sonarr:8, radarr:8, overseerr:9, plex-connection:12, plex-user-info:30, jellyfin-connection:16, openai:19, :67, prometheus:18, :66}` | N | N | off; not gated on NODE_ENV (DUP-03) | Test-only; unsafe in prod |
| ENABLE_TEST_AUTH | `lib/auth.ts:43` | N | N | off; ignored in production | Test-only |
| NEXT_PUBLIC_ENABLE_TEST_AUTH | `app/auth/callback/plex/callback-client.tsx:36` | commented (implied sufficient) | N | off | Test-only (client half) |
| E2E_PORT | `playwright.config.ts:4` | commented | N | 3000 | Test-only |
| SKIP_SEED | `prisma/seed.ts:5` | N | N | none (set by db:migrate) | Vestigial (SEC-15) |
| DEV_* (45 names) | `actions/dev-defaults.ts` (57 reads) | Y except DEV_PROMETHEUS_NAME/URL/QUERY (`:176-178`) | Y (generic) | none | Dev-only (`dev-defaults.ts:121`) |
| HOSTNAME | `lib/discord/lock/lease.ts:21`; `lib/watchlist/lock.ts:46`; `Dockerfile:40` | N | N | Dockerfile forces "0.0.0.0" | Platform |
| PORT | `Dockerfile:39` (standalone server.js) | N | N | 3000 | Platform |
| NODE_ENV | 39 reads | N | N | inlined "production" by next build | Platform |
| NEXT_RUNTIME | `instrumentation.ts:7`; `lib/utils/logger.ts:53` | N | N | set by Next | Platform |
| TZ | not read (RWP-03) | N | N | container default (UTC) | none |

**README feature and security claims.**

| README line | Claim | Verdict |
|---|---|---|
| `:57` | Guided onboarding | True (app/onboarding, components/onboarding) |
| `:58` | Client configuration guides for Direct Play | True (`plex-configuration-step.tsx:44-56`) |
| `:9`, `:59` | Issue Reporting workflow | False: static onboarding copy pointing at Discord (`discord-support-step.tsx:45-70`) |
| `:60` | Media requests via Overseerr | True (onboarding step, watchlist sync; see SEC-27, GAP-02) |
| `:61`, `:360` | Discord for announcements | False: the bot never posts to channels (only `sendTyping`, `dm-router.ts:179`); announcements are in-app only |
| `:62` | Service status monitoring for all platforms | Overstated: one optional Prometheus query (`prometheus-status.ts:27-32`) |
| `:65-69` | Wrapped stats, leaderboards, charts, AI | True |
| `:72-74`, `:82` | Sharing, public links, share analytics | True (sharing is automatic and cannot be revoked, SEC-16; hashed IPs are stored but never read, GAP-37) |
| `:78` | Role-based access control | Overstated: a single isAdmin flag, overwritten at login (SEC-12) |
| `:79`, `:84` | Service management and centralized config | True (Jellyfin, Prometheus and Discord exist but are not listed) |
| `:80` | Announcements with markdown | True (`announcements-card.tsx:98`) |
| `:81` | LLM usage and cost tracking | True (BP-28 for performance) |
| `:83`, `:380` | Audit logging | Overstated: stdout only, config changes not logged (SEC-55, GAP-33) |
| `:85-92` | Stripe gating, Checkout/Portal, provisioning, off by default | True (caveats: BP-20, SEC-38, GAP-15) |
| `:117`, `:165` | `cd plex-wrapped` | Wrong: the repo is plex-manager |
| `:137-141` | db:generate plus db:push to initialize | Wrong for production (GAP-11) |
| `:152-156` | Wizard: Plex, Tautulli, Overseerr, LLM | Incomplete: 9 steps (`types/setup.ts:9-50`) |
| `:274` (and `example.env:156-157`) | Background jobs fall back to PostgreSQL polling | Mostly false: watchlist only, and broken (DUP-07, SEC-49); Stripe jobs throw |
| `:306`, `:316` | Fails to start without the URL vars | False: throws lazily per request (SEC-09) |
| `:324` | Next.js 14+ | Stale: next 16.1.1 |
| `:371` | Plex PIN authentication | True (Jellyfin credentials login not mentioned) |
| `:372` | Only users with server access can sign in | Overstated: Stripe non-members, invitees and Jellyfin users can also sign in |
| `:373` | Secure share tokens | True (`randomBytes(32)`) |
| `:374` | Admin actions role-checked | True (SEC-12 caveat) |
| `:375` | Zod on all inputs and API responses | False (BP-04, SEC-56, DUP-03) |
| `:376` | SQL injection protection via Prisma | True (no raw SQL) |
| `:377` | No unsafe HTML | True (no dangerouslySetInnerHTML) |
| `:378` | CSRF via Server Actions | True for actions |
| `:379` | Rate limiting | Partial (SEC-24, SEC-25) |
| `:381` | Encryption at rest when the key is set | True, but opt-in (SEC-33) |
| `:382` | Signed Stripe webhooks | True (`route.ts:72`) |
| (absent) | Jellyfin, invites, watchlist sync, assistant, prompts, Prometheus, Rewind | Omitted |

**CLAUDE.md claims.**

| Line | Claim | Verdict |
|---|---|---|
| `:9` | Next.js 14+ | Outdated (16.1.1) |
| `:11` | Prisma 7 + PostgreSQL only | True |
| `:13`, `:28` | TanStack Query for client fetching | Mostly false (BP-29) |
| `:41` | app/wrapped/ | Wrong: app/(app)/wrapped/ |
| `:48` | components/setup-wizard/ | Wrong: components/setup/setup-wizard/ |
| `:144` | `cn()` in @/lib/utils | True (`lib/utils.ts:5`) |
| `:158` | useToast hook | True (`components/ui/toast.tsx:24`) |
| `:273` | Setup project for auth state | False: projects are chromium and setup-wizard; auth comes from `e2e/fixtures/auth.ts` |
| `:275`, `:735` | Chrome, Firefox, Safari | False: chromium only (`playwright.config.ts:44-56`; already in BP-10) |
| `:287` | `__tests__` alongside components | True |
| `:335`, `:343`, `:354` | lib/maintenance references | False (BP-39, DUP-13) |
| `:369` | createLogger | True (`lib/utils/logger.ts:480`) |
| `:386-387` | db:push for dev, db:migrate for production | Wrong (GAP-11) |
| `:407-415` | Required production vars | Correct to omit ENCRYPTION_KEY and REDIS_URL (optional by design); ENCRYPTION_KEY could be listed as recommended |
| `:480-483` | `getPlexClient().getLibrary()` | False: no such API |
| `:507-510` | `getTautulliClient().getHistory()` | False (real: `getTautulliHistory(config, userId, limit)`, `tautulli.ts:166`) |
| `:591-594` | `getLLMProvider().chat()` | False (`llm-provider.ts:4` exports only `testLLMProviderConnection`; chat is `callChatLLM`, `lib/llm/chat.ts:74`) |
| `:605-652` | Stripe modules and APIs | True (7 symbols resolve); "never 5xx" is wrong (BP-20) |
| `:624` | ENCRYPTED_FIELDS in lib/prisma.ts | True |
| `:678` | Bot commands in lib/discord/bot.ts | Misleading: commands live in lib/discord/commands/ (bot.ts is the client entry point) |
| `:679` | chat-safety.ts | True |
| `:680` | register-discord-metadata | True, but register-discord-commands is omitted |
| `:688` | Deploy step: npm run db:migrate | Wrong (GAP-11) |
| `:690` | npm run start:prod (server.js) | Works only inside the image (GAP-16) |
| `:691` | Fails on startup if vars missing | False (SEC-09) |
| `:697-704` | Slash-command list | True (5 more exist, unlisted) |
| `:738` | MCP servers not used | True (no `.mcp.json`) |

**Operator tasks.**

| Task | Documented | Correct | Notes |
|---|---|---|---|
| Install, dev (README Quick Start) | Y | N | `cd plex-wrapped`; db:push leaves no migration history; wizard list incomplete; no warning about SEC-30 |
| Install, prod bare metal | N | N | start:prod needs a root server.js; NEXT_PUBLIC_APP_URL is baked in at build |
| Install, Docker | Partial (3 bullets) | N | No image or tags named; dev compose overrides .env; migrate-on-boot not mentioned |
| Discord setup | Y | Partial | Registration fails as written (GAP-13); restart needed after first enable (GAP-12); Linked Roles verification URL missing; BP-12 |
| Stripe setup | Y | Mostly | Redis not enforced (GAP-15); BP-20; SEC-38 |
| Upgrade | N (one line, plus internal RELEASE_NOTES) | N | The notes say `db:migrate` (migrate dev) |
| Roll back | N | n/a | No down migrations, no version tags |
| Back up | N | n/a | Postgres, ENCRYPTION_KEY, NEXTAUTH_SECRET, PLEX_CLIENT_IDENTIFIER, Redis AOF |
| Restore | N | n/a | Needs the same ENCRYPTION_KEY (SEC-32); lost Redis jobs need a Stripe resend |
| Move host or domain | N | n/a | Rebuild (non-Docker); Discord redirect and verification URL; Stripe endpoint and whsec; stored service URLs; PLEX_WRAPPED_BASE_URL |
| Rotate NEXTAUTH_SECRET | N | n/a | Logs everyone out; changes the IP-hash salt (the hashes are never read) |
| Rotate ENCRYPTION_KEY | Y (`README:273`, `example.env:19-21`) | N | SEC-32 |
| Rotate PLEX_CLIENT_IDENTIFIER | N | n/a | Docs never say to keep it stable |
| Rotate Discord bot token | Y (`discord-bot.md:104-111`) | Y, with a caveat | Only while the bot is running; the scripts still read the env token |
| Rotate Stripe keys or whsec | Y (`stripe.md:85-86`, `:258-260`) | Y | |
| Rotate service keys or the Plex token | N (UI only) | n/a | SEC-31 |
| Rotate DB or Redis credentials | N | n/a | Compose hard-codes postgres/postgres (SEC-04) |

**Other counts.**

- **Releases:** 0 git tags, 0 GitHub releases. package.json is at version 0.1.0, there is no CHANGELOG, and the only release notes are 1 file under `.agents/planning/`.
- **Upgrade docs:** grepping for backup, restore, pg_dump, upgrade and rollback across README, docs, example.env, CLAUDE.md and the Docker files gives 1 hit.
- **Migrations:** 34. 6 contain DROP TABLE or DROP COLUMN, and there are no down migrations.
- **Repro 1:** `register-discord-commands.ts` exits 1 at `lib/prisma.ts:71` when DATABASE_URL is unset or present only in `.env`. It proceeds when DATABASE_URL is exported, even pointing at an unreachable host.
- **Repro 2:** `npx prisma validate` without DATABASE_URL fails with "Failed to load config file ... DATABASE_URL is required".

### Locale, timezone and formatting

**Formatting calls** (production code, tests excluded):

- **Total:** 136 `toLocale*String` calls in 54 files:
  - 50 .tsx files (36 `'use client'`, 14 server) and 4 .ts files;
  - 87 calls format numbers and 49 format dates.
- **In scope:** 126 calls in 48 files, excluding the Rewind slides, viewer and prompt template. The verifier counted 94 bare `.toLocaleString()` calls against the auditor's 96.
- **By locale argument:**

  | Locale argument | Calls |
  |---|---|
  | none | 106 (96 bare `toLocaleString()`, 9 `toLocaleDateString()`, 1 `toLocaleTimeString()`) |
  | "en-US" | 22 (15 DateString, 6 String, 1 TimeString) |
  | `undefined` | 7 |
  | `[]` | 1 |
- **`Intl.*` constructors:** 4 (2 `Intl.DateTimeFormat("en-US")`, 1 `DateTimeFormat(undefined)`, 1 `NumberFormat(undefined)`).
- **`timeZone` / `timeZoneName` options:** 0 in the whole codebase.
- **`toFixed(` in .tsx:** 53. Hard-coded `$` cost formatting: about 40 sites.

**Client components:** 75 calls in 36 files.

- 21 render into the DOM during SSR with server data (13 dates and 8 numbers, in 13 live files).
- 9 render sites read `Date.now()` or `new Date()` during render: 6 formatRelativeTime calls, formatRelativeDate, the scheduler countdown and the wrapped-card eligibility check.
- The rest run only:
  - after a client fetch;
  - in event state;
  - inside the Chart.js canvas or on hover;
  - in the unmounted AdminFooterClient (11 calls).

**Confirmed hydration mismatches:** 2. Playwright (chromium 1194) ran against :3100 in la-en, la-de, berlin-de, utc-de and utc-en contexts.

- `/admin/announcements`, AnnouncementListItem: driven by locale. Reproduced with de-DE, not with en-US.
- `/admin/llm-usage/conversation/[id]`, ConversationUsageRow: driven by timezone. Reproduced with LA and Berlin, not with UTC.
- No mismatch on 13 routes, because the seed renders no affected rows there (the users list shows "No users found", there are no Discord logs, no Rewind window is set, and prompts are short):
  - /, /discord;
  - /admin/users, /admin/users/[id], /admin/users/[id]/wrapped;
  - /admin/shares, /admin/discord, /admin/llm-usage, /admin/settings;
  - /admin/invites, /admin/queues, /admin/cost-analysis, /admin/prompts.

**Charts with day-bucket timezone defects:** 5 rendered, plus 1 computed but never rendered.

- Rendered: share activity, cost trend, the cost "Most Expensive Day" tile, Discord activity trend, Discord account linking.
- Not rendered: Discord errorTrend.
- UI-24 already reported 3 of these. New in GAP-42:
  - the 2 Discord charts;
  - the share window and zero-fill defect;
  - the cost "Period" header showing end + 1 day.

**Configuration:**

- TZ is not set in the Dockerfile (node:25.8-alpine), docker-compose.yml, docker-entrypoint.sh or example.env, so the app runs in UTC.
- There is no single source of truth for locale or timezone: no Config or env field, and no Intl wrapper.

**Hard-coded user-facing strings** (rough heuristic):

| Area | Strings |
|---|---|
| Admin | about 860 JSX text nodes plus 67 attribute strings in 109 files |
| Member dashboard | about 34 |
| Discord web pages | about 46 |
| Watchlist | about 20 |
| Shared components | about 31 |
| Discord bot | 57 or more reply strings |

There is no i18n library.

## Appendix: Investigated and ruled out

**Refuted findings**

- **JFP-05 (dual-account handling: a Plex login never attaches to a row created by Jellyfin first; shared rows flip isAdmin, name and email):** refuted as a duplicate.
  - SEC-08 already covers the email-based link, the username written into User.email, the Plex create failing on the unique email, and the Plex invite email link.
  - SEC-12 covers isAdmin being recomputed by whichever provider was used last.
  - The only new claim, a second account when the Plex and Jellyfin emails differ, is the expected result of having no explicit cross-provider linking.
  - Mapping a P2002 error to a clear sign-in error could be added as a note on SEC-08.
- **JFP-09 (Plex-only wording on screens shared by both services):** refuted.
  - The onboarding strings are UI-34, and the watchlist strings are UI-38.
  - `link-callout.tsx` and `link-panel.tsx` are never rendered.
  - The Discord help, the `/mark` description and the plan-list "Plex Access" fallback accurately describe features that are Plex-only today; the underlying gaps are GAP-25 and GAP-23.
  - The admin sentence is already cited in GAP-27.

**Sub-claims ruled out or corrected during verification**

- **External API contracts:**
  - **`sortDir` in *arr requests is harmful:** ruled out. `PagingResource` defaults to descending, and history comes back newest first (GAP-07).
  - **Pagination is the primary cause of the watchlist failure:** downgraded. Overseerr's own sync fetches only 20 items; the root cause is unresolved external IDs (GAP-02).
  - **The Overseerr 202 path is reachable today:** ruled out. The TypeError fires before `NoSeasonsAvailableError` can be thrown (GAP-03).
  - **One stale Jellyfin token per login:** corrected to one per member per DeviceId, because Jellyfin logs out earlier sessions (GAP-01).
  - **Transient Plex failures collapsing the Discord role is a defect:** ruled out. It is documented design and runs only at link or resync (GAP-05).
- **Jellyfin parity:**
  - **A Jellyfin revenue leak from the Plex-only revoke:** ruled out. The app never sells Jellyfin access (GAP-23).
  - **A false "Role metadata synced successfully" toast for Jellyfin members:** ruled out. The toast is in an unrendered component (GAP-25).
  - **Home servers often give Jellyfin Administrator to family members:** unsupported (GAP-26).
- **Privacy:**
  - **DiscordChatSession is a cascade hole on user deletion, and `LLMUsage.wrapped SetNull` keeps prompts:** both ruled out; the relevant relations cascade (GAP-31).
  - **The bot's "only visible to you" and "personal details removed" copy is misleading:** ruled out. Both accurately describe what Discord shows (GAP-32).
  - **The live Discord-link copy is at `link-callout.tsx:119`:** ruled out. Re-checked for this report: that component is imported only for its type (GAP-34).
  - **"Fabricated" admin Rewinds are a defect:** ruled out. Saving from the playground is the intended feature, and its validation is BP-04 (GAP-33).
  - **Members cannot view their own data:** ruled out. `/mymarks`, `/mystats` and the Rewind viewer exist (GAP-36).
- **Operations and documentation:**
  - **`migrate dev` drops data, and `db push` silently drops the onboarding column:** both ruled out; each prompts first (GAP-11).
  - **Changing NEXTAUTH_SECRET or PLEX_CLIENT_IDENTIFIER locks users out:** corrected to a forced re-login (GAP-14).
  - **Rollback has no target:** ruled out. `sha-*` tags can be pinned (GAP-20).
  - **`npm run start` fails with standalone output:** ruled out. It only warns (GAP-16).
  - **Leftover test flags can enable test auth in production:** ruled out by the `NODE_ENV !== "production"` gate (GAP-18).
  - **ENCRYPTION_KEY and REDIS_URL belong in "Required Production Variables":** ruled out. Both are optional by design (GAP-22).
  - **Stripe events are lost without Redis, and the enqueue should move before the exemption write:** corrected. Provisioning is delayed but recoverable through Stripe's retries, and reordering would race SEC-28's entitlement check (GAP-15).
- **Locale and timezone:**
  - **Hydration mismatches hit every affected page and pollute error monitoring:** ruled out. Only two pages reproduced, and the app has no error-monitoring SDK (GAP-41).
  - **Operators cannot configure a timezone at all:** corrected. TZ set through `.env` works; it is undocumented and shifts date-only strings (GAP-43).
