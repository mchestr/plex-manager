# Rewind operator runbook

How to run a Rewind season: what it needs, the switches, the soft launch, the
season open hour by hour, daily monitoring, failures, roll back, the final cut
and the season close. It is written for the 2026 season; the dates move with
`rewindSeasonOpens` and `rewindSeasonCloses`, and the rest carries over.

Times are **server time** (`Config.timezone`, set under Admin, Settings,
"Server time zone") unless a line says "in each member's zone". A member's
Rewind zone is the zone they chose (`User.timezone`), else the server's.

Sections marked **Pending** describe steps that have not merged yet. They say
what the step will add, and are filled in when it merges; until then the
fallback they name applies.

## Contents

- [Requirements](#requirements)
- [Where things are](#where-things-are)
- [Flags](#flags)
- [Cut list](#cut-list)
- [The freeze lock](#the-freeze-lock)
- [Calendar](#calendar)
- [Admin-audience runs and the soft launch](#admin-audience-runs-and-the-soft-launch)
- [Season open, hour by hour](#season-open-hour-by-hour)
- [Daily monitoring](#daily-monitoring)
- [When something goes wrong](#when-something-goes-wrong)
- [Roll back](#roll-back)
- [Backups and migrations](#backups-and-migrations)
- [The final cut](#the-final-cut)
- [Season close](#season-close)
- [Error and skip codes](#error-and-skip-codes)

## Requirements

| Need | Required | Notes |
| --- | --- | --- |
| Redis (`REDIS_URL`) | **Yes** | Rewind has no fallback without it (FR-50). The queue, the per-member lock, the rate limits and dry-run previews live there. Without `REDIS_URL` admins see "Rewind needs Redis (REDIS_URL)"; while it is down everyone sees "Rewind is temporarily unavailable. Try again in a few minutes." |
| A queue worker | **Yes** | The app process runs it by default (`ENABLE_QUEUE_WORKER`, `PROCESS_ROLE`; see `example.env`). It must be running at 00:15 on the opening day for the season-open run. At start it retries Redis for about two minutes, then stays off until the next restart. |
| Node 22 or later | **Yes** | `engines.node` in `package.json`; the Docker image ships it. |
| PostgreSQL | **Yes** | Migrated with `npm run db:deploy` (the image does it at start). |
| Plex and Tautulli | **Yes** | Rewind reads every play from Tautulli. Use **Tautulli 2.17 or later**: the season console warns below it ("Update Tautulli: versions before 2.17 are affected by CVE-2026-31799"). A member Tautulli does not list is skipped with `TAUTULLI_USER_NOT_FOUND`. |
| `REWIND_CACHE_DIR` | No | Where posters, cards and fonts are cached (default `.next/cache/rewind`). Rebuildable; it needs no backup, but it must be writable. |
| An LLM provider | No | The active provider for the `wrapped` purpose writes the copy. Without one, or with LLM mode Off, every issue is complete with template copy. The preflight wants a model that is priced and does not retire before 2027-01-02. |
| Overseerr | No | Only the Requests page uses it; without it the page leaves the issue. |
| Sonarr | No | Only Next year's returning shows use it; a failure or a missing Sonarr omits that part. |
| Stripe | No | With subscriptions on, members without access are skipped with `NOT_ENTITLED`, and the preflight counts them. |
| Discord bot | No | Needed only for the ready DM. |

## Where things are

| What | Where |
| --- | --- |
| Season console: preflight, counts, budget, actions, member table | `/admin/rewind` (Admin nav, Rewind, Season); `app/admin/rewind/page.tsx` |
| Rewind settings, every flag below | `/admin/settings#rewind`; `components/admin/settings/rewind-settings-section.tsx` |
| The flags' rules | `lib/validations/rewind-settings.ts` |
| Season dates, the season year | `lib/wrapped/season.ts` |
| Preflight rows | `lib/wrapped/admin/preflight.ts` |
| Prepare, Generate all, Retry failed, the season-open schedule | `actions/admin/rewind-season.ts`, `lib/rewind/season-runs.ts`, `lib/queue/jobs/rewind-season.ts` |
| Lost-run sweep (every 10 minutes) | `lib/queue/jobs/rewind-stale-sweep.ts` |
| Eligibility and skip reasons | `lib/wrapped/pipeline/eligibility.ts`, `lib/wrapped/generation-errors.ts` |
| Share page gate (404, 429, 503) | `lib/rewind/share/share-gate.ts`, `lib/rewind/share/status-html.ts` |
| Audit entries | the `AuditLog` table (`REWIND_*` and `CONFIG_CHANGED` events) and the app log |
| LLM spend | `/admin/llm-usage` and `/admin/cost-analysis`; the season total is the console's budget tile |

The Rewind queues (`rewind-batch`, `rewind-gen`, `rewind-aux`) are not on
`/admin/queues`, which shows only the general queue. Read them from Redis with
BullMQ's default `bull:` prefix, for example
`redis-cli ZRANGE bull:rewind-batch:delayed 0 -1` for delayed jobs.

## Flags

Every flag is a field on `Config`, edited in the Rewind section of
`/admin/settings`. A save writes only the changed fields, logs one
`CONFIG_CHANGED` audit entry with a field-level diff, and takes effect on the
next request. Fields marked "next generation" change no stored issue until it
is generated again.

| Setting | Field | Default | Effect |
| --- | --- | --- | --- |
| Rewind | `rewindEnabled` | off | Master switch for `/rewind`, the home card and member generation. Off hides Rewind at once and deletes nothing. The home card's "before season" teaser (from 20 November until the opening) shows whatever this says. Admin regenerations still run while it is off. |
| Audience | `rewindAudience` | `admins` | "Admins only" or "Everyone": who can open Rewind and whom the console's buttons generate. Admins only for the soft launch, Everyone at 08:00 on the opening day. The scheduled season-open run generates everyone regardless. |
| Season opens, Season closes | `rewindSeasonOpens`, `rewindSeasonCloses` | `12-01`, `01-31` | Month and day in the server zone; the window may wrap the year. Changing either reschedules the season-open run. A share link's default expiry is the close. |
| LLM mode | `rewindLlmMode` | `standard` | `standard` writes with the provider's model, `economy` with its budget model, `off` writes every line from templates with no call. `Config.llmDisabled` (AI features off) forces `off`. This is the emergency switch for an LLM outage or a cost problem. |
| Season budget (USD) | `rewindLlmBudgetUsd` | 10 | Season spend cap, 0 to 1,000. Past it, issues get template copy; the console's budget tile shows spend against it, and the Generate all confirm says how many members would get template copy. |
| Public links | `rewindPublicLinks` | on | Off refuses new links, and every existing link answers 404 without being deleted; turning it back on restores them. The kill switch for sharing. |
| Public counts | `rewindPublicCounts` | off | Counts instead of percentages on public cards. |
| Server name on cards | `rewindShowServerNameOnCards` | on | The server name (`Config.serverName`, edited with the Plex server) on cards and the share page. |
| Artwork on cards | `rewindAllowArtOnCards` | on | Lets members put posters on their cards. |
| Excluded libraries | `rewindExcludedSectionIds` | none | Plex libraries left out of every Rewind, from Tautulli's library list. Next generation. |
| Excluded content ratings | `rewindExcludedContentRatings` | none | Ratings left out, from the metadata cache. Next generation. |
| Include managed accounts | `rewindIncludeManagedUsers` | off | Plex Home managed accounts get a Rewind; otherwise they are skipped with `MANAGED_ACCOUNT`. Next generation. |
| Disabled pages | `rewindDisabledPages` | none | Turns non-core pages off without a deploy; see [Cut list](#cut-list). A page key takes effect on the next view; the Next year part keys at the next generation. |
| Ready notifications | `rewindNotifyChannels` | Discord DM and dashboard banner | Where "Your Rewind is ready" goes. Discord is disabled while the bot is off. |
| (not shown) | `rewindAudio` | off | Sound cues, deferred; leave it off. |

`Config.wrappedEnabled` has no control any more and defaults to on. If an old
install stored it off, the console's Regenerate is refused; set it back with
`UPDATE "Config" SET "wrappedEnabled" = true;` after a dump.

> **Pending P8.3 and P8.4 (P1 feature flags).** `lib/rewind/features.ts` adds
> `REWIND_FEATURES`, each off by default: the race scrubber and replay, Pick a
> day, the calendar grid, first-tap completion, Compare with 2025, Edit card,
> Save all and the remaining Notes. Each is turned on in production only after
> checking it on the heavy test member, and the enable is recorded in
> `ship-check.md`. A flag that misbehaves stays off. List each key here when
> the step merges.

## Cut list

If the schedule slips or a page misbehaves, turn pages off in "Disabled pages"
rather than deploying. A page leaves on the next view, and folios, the contents and the cover lines
renumber with it; the two Next year part keys apply when the issue is next
generated. Work down the list in this order; the plan-level cuts come
first:

1. the final-cut batch adapters (already dropped for 2026);
2. the playground swap (P8.8): the old playground keeps working;
3. the eval results page (already moved to January);
4. Edit card (P8.4);
5. the non-core cards (P7.6): those pages keep Copy link only;
6. then the pages, by key:

| Order | Key | Removes |
| --- | --- | --- |
| 1 | `people` | 08 People |
| 2 | `setup` | 13 Setup |
| 3 | `next-year.picks` | Next year's picks only |
| 3 | `next-year.returning` | Next year's returning shows (Sonarr) only |
| 3 | `next-year` | 17 Next year |
| 4 | the race scrubber | a P1 flag (P8.3); autoplay and the final frame stay |
| 5 | the square card format | already P2 |
| 6 | desktop Notes beyond Top shows, the calendar and the centrefold | P1 flags (P8.4); the screen-reader summary shows instead |
| later | `taste`, `race`, `records`, `requests`, `standing` | offered too, in that order, for a page that misbehaves |

The ten core pages (Bookends included), sharing, privacy and accessibility are
never cut, and the settings never offer them.

## The freeze lock

> **Pending P8.1 (freeze lock).** On 30 November, `PROMPT_VERSION` becomes
> `rewind-2026.1` and `lib/wrapped/freeze/rewind-2026.1.lock.json` records
> hashes of the prompt, the fact catalogue and the model; CI fails on any
> change (`npx tsx scripts/rewind-freeze.ts --check`). Headlines, Notes and UI
> strings are outside the lock. **Exception rule:** changing the lock needs a
> reason line, the owner's sign-off in the PR and a new version
> (`rewind-2026.2`); after 14 December only a data or security fix qualifies.
> From the season's opening to its close, settings refuse a provider or model
> change for Rewind ("Rewind's model is frozen until the season closes on 31
> January"); key rotation stays open, and LLM mode stays the emergency switch.
> Until P8.1 merges: do not change the Rewind provider or model after the
> soft launch.

## Calendar

| When (2026, server time) | What |
| --- | --- |
| From 20 Nov | Home cards show "before season" (exempt from the flags). Owner turns on `rewindEnabled` with Audience "Admins only" and runs admin-audience generations on production data after each deploy. |
| 24 Nov | Soft-launch release cut: the last pre-season migration. Dump, then deploy. |
| 25 Nov | Migration freeze starts (to 2 Jan 2027); no sign-in, invite, onboarding or subscribe change merges until 10 Dec except security fixes. This runbook is merged. |
| 25 and 27 Nov | Gallery review and sign-off; admin soft launch on 27 Nov (may slip to 29 Nov). |
| 30 Nov, 12:00 | Cutoff for sign-off fixes. Then tag `rewind-2026.1`, dump, deploy **before 18:00**, rehearse on staging in the evening. |
| 30 Nov 18:00 to 1 Dec 12:00 | **Deploy blackout.** |
| 1 Dec, 00:15 in the westernmost zone | Season-open Prepare runs by itself. |
| 1 Dec, 08:00 | Audience to Everyone. |
| 2 Dec | Validator against production (pending P8.5). |
| 10 Dec | Feature freeze. |
| 11 Dec | First final-cut dry run on staging. |
| 14 Dec, 00:00 | Code freeze: `CODE_FREEZE` on; only `freeze:data` or `freeze:security` PRs merge. |
| 28 Dec | Second final-cut dry run on staging. |
| 1 Jan 2027, 00:30 in the westernmost zone | Final cut. Dump first. |
| 2 Jan 2027 | Final-cut notifications, from 09:00 in each member's zone. |
| 31 Jan 2027 | Season close. |

## Admin-audience runs and the soft launch

From 20 November, until the soft launch:

1. In settings, turn **Rewind** on and keep **Audience** at "Admins only".
   Members still see only the before-season card.
2. On `/admin/rewind`, check the preflight (below), then press **Prepare
   season**. It runs the server aggregate, warms the metadata cache, then
   generates the audience (admins only). Its confirm shows the member count and
   the cost estimate. Pressing it again while a run waits or runs joins that
   run.
3. **Generate all** generates the audience again without the aggregate, and
   leaves out members whose run is queued or running. **Retry failed** runs only
   members whose latest run failed.
4. Watch the counts move (the console polls every 5 seconds). Every admin
   should end `ready`. File each failure as a GitHub issue labelled
   `rewind-signoff`.
5. Repeat after each deploy until the soft launch.

The preflight must be green before any run:

| Row | Green when |
| --- | --- |
| Redis | the queues answer |
| Tautulli | 2.17 or later |
| Overseerr, Sonarr | set up, or "not set up" (optional, not a warning) |
| AI copy | a priced model that does not retire before 2027-01-02; template-only mode shows as degraded on purpose |
| Entitlement (Stripe on only) | every member entitled, else the skip count you expect |

**Soft launch (25 to 27 November).** Review the gallery, confirm Rewind on,
"Admins only", LLM mode standard and the budget at its season value, then run
Prepare season and Generate all. Check on real data: every admin's issue
completes under $0.03 per member; each admin opens it on an iPhone, an Android
phone and a desktop browser; a share link is created, unfurled in Discord,
rotated and revoked; any new P0 is filed as `rewind-signoff`. Confirm that log
redaction is live (open a share link and an invite, then search the logs for
unmasked tokens).

> **Pending P7.11 (gallery).** `/admin/rewind/gallery` and
> `npm run rewind:gallery` render every page and card of the five review
> fixtures for the review. Until it merges, review on the admins' own issues.
> The dry runs it is built on have merged (P7.10): an admin can open a dry run
> at `/rewind/2026?preview=<id>`, which writes nothing; previews expire after
> one hour.

## Season open, hour by hour

The example is a server in America/Chicago with a member in
America/Los_Angeles; the console prints the same sentence for your zones.

**30 November, before 12:00.** Sign-off fixes are merged. Nothing else merges
that day.

**30 November, 12:00 to 18:00.**
- Tag the release, take a dump (encrypted, off the host, kept 30 days; see
  [Backups](#backups-and-migrations)) and deploy. The release carries no
  migration, so `npx prisma migrate status` reports nothing pending afterwards.
- On `/admin/rewind`: the preflight is green, the budget is at its season
  value, and the facts read "Prepare runs 02:15 in America/Chicago, which is
  00:15 in America/Los_Angeles, on 1 December".
- The season-open run is in Redis:
  `redis-cli ZRANGE bull:rewind-batch:delayed 0 -1` lists
  `rewind-prepare-2026-<epoch ms>`. If it is missing, check that the worker is
  running; it schedules the run at start and every 10 minutes.
- Settings read: Rewind on, Audience "Admins only", LLM mode standard.

**30 November, evening.** Rehearse on staging (pending P8.2's
`scripts/rewind-season-open.ts --rehearse`) and record the timings in
`ship-check.md`. Deploy blackout from 18:00.

**1 December, 00:15 in the westernmost zone (02:15 Chicago).** The scheduled
Prepare runs with audience "all": the server aggregate with data through 30
November 23:59:59 in each member's zone, the metadata warm batches, then one
generation per member. Allow 10 to 15 minutes per 100 members. The admins'
soft-launch issues are regenerated with the rest.

**00:15 to 08:00: verify on `/admin/rewind`.**
- Every eligible member is `ready`. Press **Retry failed** until no failure is
  left. Template copy counts as ready.
- Every skip carries a reason in the member table (see
  [codes](#error-and-skip-codes)): `NOT_ENTITLED`, `NO_PLEX_IDENTITY`,
  `TAUTULLI_USER_NOT_FOUND`, `MANAGED_ACCOUNT` or `JOINED_LATE`.
- Spend stays under $0.03 per member and under the cap.
- Admins open their own issue on a phone and see "Data through 30 November".
  Check members only through counts, not by opening their issues.

**08:00.** Set **Audience** to "Everyone" and save. That writes
`CONFIG_CHANGED`, and members' home cards turn from before season to ready.

**Notifications.** The 08:00 save also enqueues one `REWIND_NOTIFY` job per
completed member who has not been told yet
(`lib/queue/jobs/rewind-notify.ts`). Each job waits for 09:00 to 20:00 in its
member's zone, checks again that the member can open Rewind, has an active
membership and has notifications on, then sends one Discord DM, at most once
(`PlexWrapped.notifiedAt`). The DM needs `discord` in `rewindNotifyChannels`,
the bot switched on and a linked Discord account; a member with closed DMs is
logged and not retried. With `banner` in the channels, member pages other than
home show "Your Rewind is ready" until the member opens it. Members turn
notifications off on `/account`. Later completions notify the same way.

**Views.** Each opening of a Rewind writes one `RewindView` row
(`actions/rewind-views.ts`): the furthest page reached and the share actions
by kind, with no IP address, user agent or referrer. Admin previews write
none. The Readers section of the season page shows how many members opened
their Rewind, reached the centrefold and shared.

**During the day.** New share links work, members open their issues, and no
new P0 is open. From 12:00 other work may merge and deploy again; the noon
deploy carries no sign-in change.

## Daily monitoring

Once a day through December, on `/admin/rewind`:

- **Counts**: ready, generating, failed, stuck, not started. `stuck` is a run
  queued or running for 15 minutes or more. When its job is gone, the sweep
  (every 10 minutes) closes it as `WORKER_LOST` or `JOB_LOST` and re-runs a
  lost running run once; Regenerate is offered on stuck rows.
- **Failures**: filter the member table by status, read the codes, fix the
  cause, then **Retry failed** (or **Regenerate** on one row). Regenerate is
  audit-logged (`REWIND_REGENERATE_REQUESTED`) and keeps the current issue and
  its links live until the new one lands.
- **Spend**: the budget tile. The usage pages break it down by model and member.
- **Preflight**: still green; Tautulli updates can change its version.
- **Logs**: warnings from `REWIND_STALE_SWEEP` ("Closed lost Rewind runs"),
  `REWIND_QUEUES` and `REWIND_SEASON_JOBS`.

> **Pending P8.5 (validator).** `scripts/rewind-validate.ts --year=2026`,
> run read-only from a checkout, checks every stored issue and prints counts
> per code. Run it on 2 December and after every bulk run; it must report zero
> failures.

## When something goes wrong

**A member's issue looks wrong.** Regenerate it from the member table. If the
new one is wrong too, turn the page off in "Disabled pages" for everyone, or
roll the member back (below).

**Budget cap reached.** New issues get template copy; nothing fails. Raise the
budget in settings if the spend is expected, or leave it: template issues are
complete.

**LLM outage or runaway cost.** Each slot falls back to templates, so issues
still complete (copy source `template` or `mixed`). If calls keep failing or
costing too much, set **LLM mode** to Off: no further calls, every new issue
uses templates. Set it back when the provider recovers; don't regenerate
everyone just to replace template copy.

**Redis down.** The preflight's Redis row turns red. Requests that would queue
work answer "Rewind is temporarily unavailable. Try again in a few minutes."
at once; completed issues still open. Bring Redis back, then **restart the app
if the worker gave up** (it retries for about two minutes at start). Jobs are
idempotent: the worker reschedules the stale sweep and the season-open run
when it starts, the sweep marks runs lost in the outage as `WORKER_LOST` or
`JOB_LOST`, and **Retry failed** finishes them. Without a dump of Redis, a
delayed season-open run lost with it is recreated by the worker.

**Slow Tautulli.** Rewind caps Tautulli, Plex and Overseerr at 4 concurrent
calls across all processes, so a bulk run slows rather than overloads them. A
member run has 5 minutes and three attempts (backing off from 30 seconds);
past that it fails with `TIMEOUT` or `UPSTREAM_ERROR`. Fix Tautulli, then
Retry failed. Spread large reruns over the night rather than raising the cap.

**Share page answers 429 or 503.** `/rewind/s/<token>` is answered by the proxy
before the page renders, with a static "This Rewind couldn't load. Try again in
a moment." page:
- **429**: one client address opened more than 60 share pages in a minute
  (`rw:share-page`). It clears by itself. If many visitors share an address
  behind your proxy, check `TRUSTED_PROXY_HOPS`.
- **503** with `Retry-After: 30`: the database did not answer a one-row read
  within 2 seconds (checked at most every 5 seconds). Treat it as a database
  incident.
- **404** "This Rewind is no longer shared": the link is unknown, revoked,
  rotated or expired, or Public links is off. Nothing else is revealed.

**A member wants a title gone.** Members hide titles themselves from the
story's row sheet ("Hide this title", up to 20 hides a day). The title leaves
their public cards and share page at once and their in-app pages after a
template-only regeneration about a minute later; it still counts toward their
totals.

## Roll back

From the smallest to the largest:

1. **One page for everyone**: add its key to "Disabled pages".
2. **One member**: Regenerate from the member table.

   > **Pending P7.9 (roll back).** The member table and the admin preview at
   > `/admin/users/<id>/rewind/<year>` gain **Roll back**, which restores the
   > previous issue in one audited transaction (`REWIND_ROLLED_BACK`); a second
   > roll back undoes the first. It is refused while a run is queued or
   > running.

3. **Every final-cut issue**:

   > **Pending P8.5 (bulk roll back).** `scripts/rewind-rollback-final-cut.ts`
   > (a dry run unless told to apply) rolls back each member whose latest issue
   > is a final cut, one audited transaction each.

4. **Sharing**: turn **Public links** off. Every link answers 404 at once; no
   row is deleted, and turning it back on restores them.
5. **Everything (kill switch)**: turn **Rewind** off. `/rewind` and the home
   card disappear at once and no data is lost. Members never saw an issue
   while Audience was "Admins only".
6. **Last resort**: restore the dump taken before the deploy, following
   [operations.md](operations.md#restore), and start the previous release.

## Backups and migrations

Follow `docs/operations.md`: take a dump before every deploy that carries a
migration, encrypt it, keep it off the host and delete it after 30 days. For
the season, also take one before the soft-launch release (24 November), before
the season-open release (30 November) and before the final cut (1 January).

No migration merges from 25 November 2026 to 2 January 2027 except a named
freeze exception, recorded in `season-log.md`, which ships with a dump first
and `SKIP_MIGRATIONS=true` on every replica but one. The last pre-season
migrations are listed in the Phase 8 plan's migration calendar; the newest in
this release is `prisma/migrations/20261124000700_p77_rewind_exclusion_title`.

## The final cut

On 1 January every issue is regenerated with the whole year. The console's
**Run final cut** button reads "Available from 1 January" and is disabled; it
is refused before 1 January has begun in the westernmost zone.

> **Pending P8.5 (final cut).** `REWIND_FINAL_CUT` runs by itself at 00:30 on
> 1 January in the westernmost zone (the button enables after that): the
> full-year aggregate, the December metadata, then one `final-cut` generation
> per member that calls the LLM only for slots whose facts changed (expected
> for under 30% of members). Issues then read "Final cut". Take a dump before
> it. Rehearse on staging on 11 and 28 December with
> `scripts/rewind-final-cut.ts --year=2026 --through=<date> --with-llm --apply`
> (`REWIND_STAGING=1` only), on a restored dump with its own Redis and every
> outbound side effect (Discord, watchlist sync, Stripe, notifications)
> neutralised, then run the validator with `--final-cut`. Fill in the
> procedure and its checks here when it merges.

## Season close

On 31 January (`rewindSeasonCloses`) the season closes: members can no longer
request a generation, share links made with the default expiry stop opening,
and old v2 share links stop opening. Issues stay readable at `/rewind/<year>`.
The freeze on the Rewind model lifts (P8.1). Set `CODE_FREEZE` back to off once the
final cut has finished.

## Error and skip codes

Admins see these in the member table; members only ever see fixed copy.

| Code | Kind | Meaning | What to do |
| --- | --- | --- | --- |
| `TAUTULLI_USER_NOT_FOUND` | skip | Tautulli's user list lacks the member's Plex user. | Refresh users in Tautulli, wait 10 minutes (the answer is cached), regenerate. |
| `NO_PLEX_IDENTITY` | skip | No linked Plex account, so no history. | Nothing, unless the account should be linked. |
| `MANAGED_ACCOUNT` | skip | A Plex Home managed account. | Turn on "Include managed accounts" if wanted. |
| `NOT_ENTITLED` | skip | Stripe is on and the member has no active subscription or exemption. | Expected; matches the preflight's count. |
| `NOT_IN_AUDIENCE` | skip | Audience is "Admins only" and the member is not an admin. | Expected before the audience switch. |
| `REWIND_DISABLED` | skip | Rewind is off. | Turn it on. |
| `REDIS_UNAVAILABLE` | skip | Redis did not answer. | See [Redis down](#when-something-goes-wrong). |
| `JOINED_LATE` | skip | **Pending P7.3.** The member's first play, or else their account, falls on or after 1 October in their zone; their first Rewind is next year. | Expected. |
| `WORKER_LOST` | failure | A run stopped with its worker (a restart or crash); the sweep found it after 15 minutes. | Retry failed. |
| `JOB_LOST` | failure | A queued job vanished (for example, Redis lost it). | Retry failed. |
| `TIMEOUT` | failure | The run hit its 5-minute limit. | Check that Tautulli and the LLM provider respond quickly, then Retry failed. |
| `UPSTREAM_ERROR` | failure | Tautulli, Plex or Overseerr failed after three attempts. | Check they are reachable, then Retry failed. |
| `NOT_CONFIGURED` | failure | No active Plex or Tautulli. | Fix the settings, then regenerate. |
| `LLM_FAILED`, `GENERATION_FAILED` | failure | Anything else. | Read the app log for the run, then regenerate. |
