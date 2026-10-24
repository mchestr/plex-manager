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
| A queue worker | **Yes** | An `all` or `worker` container runs it, never a `web` one (`ENABLE_QUEUE_WORKER`, `PROCESS_ROLE`; see `example.env` and `docs/operations.md`). It must be running at 00:15 on the opening day for the season-open run. At start it retries Redis for about two minutes, then stays off until the next restart. |
| Node 22 or later | **Yes** | `engines.node` in `package.json`; the Docker image ships it. |
| PostgreSQL | **Yes** | Migrated with `npm run db:deploy` (the image does it at start). |
| Plex and Tautulli | **Yes** | Rewind reads every play from Tautulli. Use **Tautulli 2.17 or later**: the season console warns below it ("Update Tautulli: versions before 2.17 are affected by CVE-2026-31799"). A member Tautulli does not list is skipped with `TAUTULLI_USER_NOT_FOUND`. |
| `REWIND_CACHE_DIR` | No | Where posters, cards and fonts are cached (default `.next/cache/rewind`). Rebuildable; it needs no backup, but it must be writable. |
| An LLM provider | No | The active provider for the `wrapped` purpose supplies the key; once the freeze lock names a model, Rewind writes with that model (see [The freeze lock](#the-freeze-lock)). Without a provider, or with LLM mode Off, every issue is complete with template copy. The preflight wants a model that is priced and does not retire before 2027-01-02. |
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
| The 08:00 audience switch and the staging rehearsal | `lib/rewind/season-open.ts`, `lib/queue/jobs/rewind-season-open.ts`, `scripts/rewind-season-open.ts` |
| The freeze lock and the frozen model | `lib/wrapped/freeze/rewind-2026.1.lock.json`, `lib/wrapped/freeze/lock.ts`, `scripts/rewind-freeze.ts`, `getFrozenRewindModel()` in `lib/llm/registry.ts` |
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
| Excluded libraries | `rewindExcludedSectionIds` | none | Plex libraries left out of every Rewind, from Tautulli's library list: their plays count toward nothing, totals included. Next generation. |
| Excluded content ratings | `rewindExcludedContentRatings` | none | Ratings left out, from the metadata cache. Next generation. |
| Include managed accounts | `rewindIncludeManagedUsers` | off | Plex Home managed accounts get a Rewind; otherwise they are skipped with `MANAGED_ACCOUNT`. Next generation. |
| Disabled pages | `rewindDisabledPages` | none | Turns non-core pages off without a deploy; see [Cut list](#cut-list). A page key takes effect on the next view; the Next year part keys at the next generation. |
| Ready notifications | `rewindNotifyChannels` | Discord DM and dashboard banner | Where "Your Rewind is ready" goes. Discord is disabled while the bot is off. |
| (not shown) | `rewindAudio` | off | Sound cues, deferred; leave it off. |

`Config.wrappedEnabled` has no control any more and defaults to on. If an old
install stored it off, the console's Regenerate is refused; set it back with
`UPDATE "Config" SET "wrappedEnabled" = true;` after a dump.

### Features added in December

`lib/rewind/features.ts` lists the P1 interactions, each behind its own flag
and off on a fresh `Config`. They share `rewindDisabledPages`: a feature is on
only while the list holds `+<key>` and not the plain `<key>` (the plain key
beside it switches it off again), so a deploy never turns one on by itself.
The "Features added in December" switches in the Rewind section write or
remove the `+` entry, audited as `CONFIG_CHANGED`. Turn each on in production
only after checking it on the heavy test member, and record the enable, with
the date and the check, in `ship-check.md`. A flag that misbehaves stays off.

| Switch | Key | What it adds | Off |
|---|---|---|---|
| The race: scrubber and Replay | `race.scrubber` | A month slider and Replay under the race, after its single run (at once under reduced motion or on a revisit) | Autoplay once, then the final frame |
| The calendar: Pick a day | `calendar.day-picker` | "Pick a day" under the calendar: a bottom sheet with a month selector and a row per day | The grid only |
| Notes and article calendar: arrow-key grid | `calendar.grid` | The desktop Notes and article calendars become a roving-focus grid once hydrated; without JavaScript they stay month tables | Month tables |
| First tap completes a count-up | `stage.tap-completes` | A forward tap on a page whose count-up is still running lands it; the next tap turns | Every tap turns |
| The number: Compare with last year | `number.compare-2025` | "Compare with 2025" on page 02: both years as mirrored 7-day averages; hidden without last-year history | The daily strip only |
| Share: Edit card | `share.edit-card` | Three poster stats on the centrefold and back cover, from the member's allow-list, saved in their prefs and on a live link | The default stats |
| Share: Save all cards | `share.save-all` | "Save all {n} cards" on the back cover and in the share sheet: one ZIP built in the browser; each run records one `save` share action | One card at a time |
| Notes for the core pages | `notes.core` | Desktop Notes for the cover, the number, the bookends, the guess (no answer until the quiz is answered or skipped), top films, the clock and the back cover | Their summary |
| Season open: switch the audience to Everyone at 08:00 on the opening day | `season.auto-open` | Not a member feature: the scheduled 08:00 audience switch (P8.2, [Season open](#season-open-hour-by-hour)). It switches only when the season-open generation is clean | The owner switches Audience by hand at 08:00 |

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

`lib/wrapped/freeze/rewind-2026.1.lock.json` freezes what Rewind's copy rests
on, so the season's model and prompt cannot drift between 1 December and the
season close. It holds a sha256 of `canonicalJson` for each section:

| Section | Covers |
| --- | --- |
| `promptVersion` | `PROMPT_VERSION` (`rewind-2026.1`, also OpenAI's `prompt_cache_key`) |
| `systemPrompt`, `wireSchema` | the frozen system block and the copy's JSON schema |
| `copySlots` | each slot's length cap, allowed facts, identity facts and bands; no slot lists `window.finalCut` (P8.5), so the final cut re-calls only changed slots |
| `grounding` | banned and window phrases, number words, quantifier thresholds and the word list |
| `posterLines`, `slotTemplates` | the sixty poster lines and every slot's fallback templates |
| `catalogue` | `CATALOGUE_VERSION` and each fact's id, group, unit and format; `statsVersion` stays outside, because a stats fix is a data fix |
| `model` | provider, model, budget model, effort `low` and the 1,800-token output limit, from `evals/rewind/selected.json` |

Headlines, Notes and UI strings are outside the lock, so typo fixes and the
December features never trip it.

- **CI.** The Unit Tests job runs `npm run rewind:freeze -- --check`, which
  fails naming each changed section ("systemPrompt changed"), and also when
  the locked model has no price, no structured outputs or retires before
  2027-01-02. `lib/wrapped/freeze/__tests__/rewind-freeze.test.ts` checks the
  same in Jest.
- **Writing it.** `npm run rewind:freeze -- --write --reason="<why>"` writes the
  lock with a dated reason line. Until `frozenAt` (2026-12-01) it may be
  rewritten under `rewind-2026.1`; this is how the bake-off's model goes in.
- **Exception rule.** From 1 December a changed lock needs a reason line, the
  owner's sign-off in the PR and a new version (`rewind-2026.2`: bump
  `PROMPT_VERSION` and `LOCK_PATH` in `lib/wrapped/freeze/lock.ts`); the script
  refuses otherwise. After 14 December only a data or security fix qualifies.
- **The model at runtime.** `getFrozenRewindModel()` returns the lock's model
  (and budget model) with the key of the active `wrapped` provider. Until the
  lock names a model, Rewind writes with the provider's own model. If the
  provider is another company than the lock's, every issue gets template copy,
  the log warns once, and the preflight's AI copy row turns red ("The Rewind
  provider is openai, but the frozen model is anthropic:..."). Fix it by
  setting the provider back, not by editing the lock.
- **Settings.** From the season's opening to its close, saving the Rewind
  provider refuses a provider, model or base-URL change ("Rewind's model is
  frozen until the season closes on 31 January"): member and hide
  regenerations still run after the final cut. Rotating the key works, the
  assistant's provider is never blocked, and LLM mode stays the emergency
  switch.
- **Prices are not frozen.** `costUsd()` takes the dated entry in
  `lib/llm/models.ts`. On 1 December the owner re-checks the frozen pair, the
  judge and `gemini-4-argon` against the providers' price pages (see the
  [owner checklist](#owner-checklist-30-november-to-2-december)); from
  2 December `lib/llm/__tests__/models.test.ts` fails until the frozen pair
  carries a price with `asOf` 2026-12-01 or later.
- `/admin/rewind` shows the model, the prompt version and "Model freeze:
  Frozen 1 December 2026" (or "Not frozen: no model selected yet").

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
| 1 Dec, 08:00 | Audience to Everyone: the scheduled switch when `+season.auto-open` is on and the run is clean, else by hand. |
| 2 Dec | Validator against production: `npm run rewind:validate -- --year=2026`, zero failures. |
| 10 Dec | Feature freeze. |
| 11 Dec | First final-cut dry run on staging. |
| 14 Dec, 00:00 | Code freeze: `CODE_FREEZE` on; only `freeze:data` or `freeze:security` PRs merge. |
| 28 Dec | Second final-cut dry run on staging. |
| 1 Jan 2027, 00:30 in the westernmost zone | Final cut. Dump first. |
| 2 Jan 2027 | Final-cut notifications, from 09:00 in each member's zone. |
| 31 Jan 2027 | Season close. |

### Owner checklist, 30 November to 2 December

These are the owner's steps on production; no code does them. Tick each in
`ship-check.md` with the time.

**By 29 November**
- [ ] The bake-off (P5.13) is recorded: `evals/rewind/selected.json` names
  the model, its recordings are committed, and the last prompt edits reach
  98% or more first-pass grounding on all 20 fixtures
  (`npx jest evals/rewind`, then `npm run eval:rewind -- --model=<selected>
  --judge=<other family> --record`).
- [ ] `npm run rewind:freeze -- --write --reason="Bake-off winner <model>"`,
  merged by 30 November 12:00 with the owner's sign-off.

**30 November**
- [ ] 12:00: sign-off fixes merged; nothing else merges that day.
- [ ] Run the validator's page-schema pass on one admin's soft-launch issue
  (`npm run rewind:validate -- --year=2026` from a checkout): page 02's
  `lastYearDaily`, page 10's per-day minutes and titles and page 11's
  `frames` parse, with zero failures.
- [ ] Tag the commit `rewind-2026.1` and push the tag.
- [ ] Take the dump (`pg_dump -Fc`, encrypted, off the host, kept 30 days).
- [ ] Deploy before 18:00; `npx prisma migrate status` reports nothing
  pending.
- [ ] `/admin/rewind`: preflight green, "Model freeze: Frozen 1 December
  2026", the frozen model and `rewind-2026.1` shown, the budget at its season
  value, the Prepare at 00:15 in the westernmost zone and "Opens to
  everyone" at 08:00; `redis-cli ZRANGE bull:rewind-batch:delayed 0 -1` lists the
  Prepare and `redis-cli ZRANGE bull:rewind-aux:delayed 0 -1` the switch.
- [ ] Settings: Rewind on, Audience "Admins only", LLM mode standard. Turn on
  "Season open: switch the audience to Everyone at 08:00" (`+season.auto-open`)
  if you want the scheduled switch; leave it off to switch by hand.
- [ ] Evening: staging rehearsal (`npm run rewind:season-open -- --year=2026
  --rehearse`); timings into `ship-check.md`. Deploy blackout from 18:00.

**1 December**
- [ ] 00:15 to 08:00: every eligible member ready (Retry failed until no
  failure is left), every skip with a reason, spend under $0.03 per member
  and under the cap; admins see "Data through 30 November" on a phone.
- [ ] 08:00: the audience is "Everyone" (the console's Audience fact). If the
  scheduled switch left it to you, save Audience "Everyone" yourself.
- [ ] During the day: DMs arrive inside each member's window, `RewindView`
  rows appear, new share links work, no new P0.
- [ ] Prices: compare `lib/llm/models.ts` for the frozen model and budget
  model, the judge and `gemini-4-argon` (its price doubles that day) with the
  price pages; update changed prices with `asOf: '2026-12-01'`, confirm
  `retiresOn` is after 2027-01-02, and append the check to
  `model-selection.md`.
- [ ] From 12:00: other work may merge and deploy again.

**2 December**
- [ ] `npm run rewind:validate -- --year=2026` against production from a
  checkout, read-only: zero failures, recorded in `ship-check.md`.

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
| AI copy | the frozen model (or, before the lock names one, the provider's), priced and not retiring before 2027-01-02; template-only mode shows as degraded on purpose; a provider other than the lock's is red |
| Entitlement (Stripe on only) | every member entitled, else the skip count you expect |

**Soft launch (25 to 27 November).** Review the gallery, confirm Rewind on,
"Admins only", LLM mode standard and the budget at its season value, then run
Prepare season and Generate all. Check on real data: every admin's issue
completes under $0.03 per member; each admin opens it on an iPhone, an Android
phone and a desktop browser; a share link is created, unfurled in Discord,
rotated and revoked; any new P0 is filed as `rewind-signoff`. Confirm that log
redaction is live (open a share link and an invite, then search the logs for
unmasked tokens).

**Gallery.** `/admin/rewind/gallery` renders every page and card of the five
review fixtures (heavy, median, light, postcard, extreme) from dry runs, which
write nothing and expire after one hour. Each tab starts or reuses its dry run;
the copy replays the selected model's recordings, or is "Templates only" until
`evals/rewind/selected.json` names a model. "Desktop spread" switches the
frames to 1440 x 900. For the same set headless, run `npm run rewind:gallery --
--base-url=<server>` against a server started for E2E (it signs in as the first
admin with `NEXTAUTH_SECRET` and needs a `_test` database), or run the manual
Rewind Gallery workflow and download its `rewind-gallery` artifact; open
`index.html` for the contact sheet.

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

**30 November, evening.** Rehearse on staging and record the timings in
`ship-check.md`. Deploy blackout from 18:00.

```
REWIND_STAGING=1 DATABASE_URL=<staging> REDIS_URL=<staging redis> npm run rewind:season-open -- --year=2026 --rehearse
```

It refuses without `REWIND_STAGING=1`. It enqueues the season-open Prepare at
once with audience `all`, waits for it and every generation it started, then
switches the audience the way the 08:00 job does, and prints the timings.
With a failed member it stops before the switch: use Retry failed on the
staging console, then run it again with `--switch-only`. Without a mode,
`npm run rewind:season-open -- --year=2026` prints the production schedule
read-only: the Prepare's instant, the switch's instant and whether the
scheduled switch is on.

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

**08:00.** Rewind opens to everyone. With `+season.auto-open` on (the
"Season open" switch under Features added in December), `REWIND_SEASON_OPEN`
does it on `rewind-aux` at 08:00 server time
(`lib/queue/jobs/rewind-season-open.ts`), kept scheduled at worker start and
by the stale sweep like the Prepare; the console's "Opens to everyone" fact
shows when. It switches only when the audience is still "Admins only", Rewind
is on, the season-open Prepare has finished and no member is generating or
failed. While a run is still going it checks again every 10 minutes until
12:00, then leaves it to you; with a failed member it leaves it to you at
once (the log says which). With the switch off, or whenever it leaves it to
you, set **Audience** to "Everyone" and save. Either way the change writes
`CONFIG_CHANGED` (the job as actor `system`, `source: season-open`), and
members' home cards turn from before season to ready.

**Notifications.** The 08:00 switch also enqueues one `REWIND_NOTIFY` job per
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

### The validator

`npm run rewind:validate -- --year=2026 [--final-cut]` runs
`scripts/rewind-validate.ts` read-only from a checkout (the runtime image has
no scripts) against `DATABASE_URL`. For each eligible member it checks that
the stored issue parses as v3, that every page passes its schema (so the
viewer drops none), that `factsHash` and every `copyMeta.slotHashes` entry
match the stored facts, and that every copy slot passes grounding again with
today's displays; for every live share link, that its projection passes the
allow-list. `--final-cut` adds `window.finalCut` and `finalCutAt`. It prints
counts per code, the skipped members by reason and the failing row ids, never
a title or a name, and exits 1 on any failure.

Run it on 2 December, after every bulk run, in each final-cut dry run and
after the final cut; it must report zero failures. A failure is a data fix:
regenerate the members it names.

| Code | Meaning |
|---|---|
| `NOT_COMPLETED` | An eligible member has no completed Rewind and was not skipped. |
| `UNPARSABLE`, `NOT_V3` | The stored data does not parse, or is an older version. |
| `PAGE_SCHEMA` | A page fails its registry schema; the viewer would drop it. |
| `FACTS_HASH_MISMATCH`, `SLOT_HASH_STALE` | The stored hashes do not match the stored facts. |
| `SLOT_MISSING`, `SLOT_TOO_LONG`, `SLOT_TOKEN`, `SLOT_GROUNDING` | A copy slot is empty, too long, cites a fact it may not, or breaks another grounding rule. |
| `NOT_FINAL_CUT`, `FINAL_CUT_AT_MISSING` | With `--final-cut`: the issue is still the season's. |
| `SHARE_KEYS`, `SHARE_PROJECTION` | A live link's projection carries an unlisted key, or cannot be built. |

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

3. **Every final-cut issue**: `npm run rewind:rollback-final-cut -- --year=2026`
   counts the members whose latest completed generation is a final cut;
   `--apply --admin=<your user id>` rolls each back to the season issue with
   P7.9's roll back, one audited transaction (`REWIND_ROLLED_BACK`) each,
   under the member's generation lock, skipping members whose run is queued or
   running. It needs `DATABASE_URL` and `REDIS_URL`. A second `--apply`
   changes nothing, and a member skipped as generating is picked up by the
   next one. Set **LLM mode** to `off` first if the model is the problem.

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

On 1 January every issue is regenerated with the whole year, almost for
free. `REWIND_FINAL_CUT` runs by itself at 00:30 on 1 January in the
westernmost zone (the worker and the stale sweep keep it scheduled, as they do
the season-open Prepare). The console's **Run final cut** button reads
"Available from 1 January" and is disabled until then; after it, it asks to
confirm, joins the scheduled run when that is waiting or running
(`rewind:final:<year>`) and writes `REWIND_FINAL_CUT_STARTED`.

The job runs three steps:

1. `REWIND_SERVER_AGGREGATE` for the full year (through 31 December), with the
   archetype counts and medians;
2. `REWIND_METADATA_WARM` for the titles not warm yet, in practice those first
   watched in December;
3. `REWIND_GENERATE_ALL` with `kind: 'final-cut'`, one generation per member
   with `copyPolicy: 'changed-slots'`: facts, pages and cards are rebuilt, and
   the model is called only for slots whose identity facts changed (a new
   No. 1), whose band was crossed or whose page is new. Every other slot keeps
   its text, and numbers re-render through their tokens. A member without a
   completed season issue gets a full generation; `JOINED_LATE` stays skipped.
   The season issue is kept in `previousData`, and the budget cap still
   applies.

The job never retries; start it again if it fails, and it leaves out the
members it already finished. Every later 2026 regeneration (a member's
request, an admin run, a hide) keeps the full-year window, so issues keep
"Final cut". December's readers (members who opened the season issue) get one
DM, "Your <server> Rewind 2026 now includes December.", from 09:00 on 2 January
in their zone, and the banner uses the same words.

**Before it:** take a dump. **After it:** check the dashboard (every member
`completed`, spend under the cap) and run
`npm run rewind:validate -- --year=2026 --final-cut`, which must report zero
failures. A bad final cut is rolled back with the bulk roll back above.

### Dry runs

`npm run rewind:final-cut -- --year=2026 [--through=YYYY-MM-DD] [--with-llm]`
runs every eligible member through the pipeline in dry-run mode with the
full-year window and writes nothing. Without `--with-llm` it calls no model
(changed slots get templates) and estimates the cost from the price table. It
prints "N of M keep all copy, K re-call (reasons)", the re-call share (pass
mark under 30%), the cost and the validator's result.

### Staging rehearsal

Rehearse the real final cut on a staging copy of production on 11 December
(P8.10, `--through=2026-12-10`) and 28 December (P9.2,
`--through=2026-12-27`), in the evening when production is quiet. Record
everything in the plan's `final-cut-dry-run.md`, which has a section per run.

1. **Restore** the latest dump (decrypted) into a new database on the same
   private network. Do not use `--create`: it would recreate the dump's own
   database, which is production's.

   ```bash
   createdb plex_manager_staging
   pg_restore -d postgresql://user:password@host:5432/plex_manager_staging --no-owner plex-manager-….dump
   DATABASE_URL=postgresql://…/plex_manager_staging npx prisma migrate status   # nothing pending
   ```

2. **Redis.** Start a throwaway `redis:7` for staging
   (`docker run -d --rm --name rewind-staging-redis -p 127.0.0.1:6380:6379 redis:7`).
   Never point staging at production Redis: the queue names are the same, so
   staging workers would take production's jobs.
3. **Neutralise** the side effects before the first boot. Estimate the cost
   first with the plan (`npm run rewind:final-cut -- --year=2026 --through=<day>`
   against staging), then pass that estimate plus 50% as the budget:

   ```bash
   psql -v budget=<USD> -d postgresql://…/plex_manager_staging -f scripts/rewind-staging-neutralise.sql
   ```

   It refuses any database but `plex_manager_staging`, turns Discord off and
   clears its bot token, turns watchlist sync off, sets the notification
   channels to `["banner"]`, nulls the Stripe keys (leaving `stripeEnabled`,
   so entitlement skips match production) and sets `rewindLlmBudgetUsd`.
   Copy its output into the report. The model calls are real and billed to the
   production key.
4. **Boot** the production image digest from `season-log.md`, not a fresh
   build, with: `DATABASE_URL` on staging; `REDIS_URL` on the throwaway Redis;
   the production `ENCRYPTION_KEY` (so stored keys decrypt); a new
   `NEXTAUTH_SECRET`; both app URLs on `http://127.0.0.1:3100`, reached through
   an SSH tunnel; `ENABLE_DISCORD_BOT=false`, `ENABLE_WATCHLIST_SYNC=false`,
   `REWIND_STAGING=1` and `LOG_LEVEL=debug` (Tautulli's 429s log at debug);
   never `E2E_TEST_MODE`. The worker schedules its own 1 January final cut,
   which the teardown removes; the season-open Prepare has passed, so it
   schedules none (check the console's queue).
5. **Run** from a checkout, against staging:

   ```bash
   REWIND_STAGING=1 DATABASE_URL=… REDIS_URL=redis://127.0.0.1:6380 \
     npm run rewind:final-cut -- --year=2026 --through=2026-12-10 --with-llm --apply
   ```

   `--apply` enqueues `REWIND_FINAL_CUT` with the full-year window and
   `window.finalCut: true`. With a `--through` before 31 December it refuses
   unless `REWIND_STAGING=1`, which production never sets, and it gets its own
   deduplication id (`rewind:final:2026:2026-12-10`), so it never joins the
   delayed 1 January run. Note the time you started it.
6. **Measure** once the console shows every member finished:

   ```bash
   docker logs <staging app> > staging-worker.log 2>&1
   DATABASE_URL=… npm run rewind:final-cut-report -- --year=2026 --since=<start time> --log=staging-worker.log --warn=20
   ```

   It prints the re-call rate (completed final-cut generations with a model
   call, overall and for full editions), the per-slot reasons, the cost per
   member, the timings, failures by code, skips by reason and the Tautulli
   429s, and exits 1 on a failure or a rate of 30% or more. Use `--warn=20` on
   11 December (real data stops three weeks short) and `--warn=25` on
   28 December. One slot behind most re-calls usually means its `COPY_SLOTS`
   entry is wrong.
7. **Validate:** `DATABASE_URL=… npm run rewind:validate -- --year=2026 --final-cut`
   must report zero failures.
8. **Tear down** the same day: stop the staging app and Redis, then
   `dropdb plex_manager_staging` and delete `staging-worker.log` and the
   decrypted dump, so no copy of member data or tokens lingers and staging's
   own 1 January final cut never fires.

A failure is fixed in an ordinary PR before the code freeze (14 December),
and the rehearsal is repeated on a fresh copy; after it, only under the freeze
rules.

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
