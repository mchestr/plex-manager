# Media cleanup

**Admin > Automations > Media cleanup** finds media that nobody watches and
removes it with Radarr or Sonarr. A rule says which titles to find, for
example movies that nobody played in a year. Matches first wait in Leaving
soon for a grace period, where members can see them and keep them. After the
grace period, Radarr or Sonarr deletes them inside a daily budget, after a
fresh check for plays, Keeps and requests.

Media cleanup is off after an upgrade, and every new rule starts in Dry run.
A Dry run rule records its matches and changes nothing. Nothing is deleted
until an admin turns the feature on and turns a rule on.

The page has five tabs: **Rules**, **Leaving soon**, **Kept and excluded**,
**History** and **Settings**. Only admins can open it (see `docs/roles.md`).

## Before you start

- **Plex, Tautulli, Radarr and Sonarr.** Plex lists the libraries, Tautulli
  gives the plays, and Radarr (movies) or Sonarr (shows and seasons) deletes.
  Without Sonarr, no TV library is offered, so no show or season rule can
  exist.
- **Overseerr** is needed for the request fields (Requested, Requested by,
  The requesters) and for the request protection. Without it, those fields
  are disabled.
- **The same file paths.** Plex and Radarr or Sonarr must see each file at
  the same path. A title whose Plex file is outside the root folders of
  Radarr or Sonarr is never deleted: it shows under **Cannot delete**.
- **Redis and a worker.** Library reads, runs and deletions are jobs, so they
  need `REDIS_URL` and a worker (`PROCESS_ROLE=worker` or `all`, see
  `docs/environment.md`). Without Redis, the page says "Redis is not set up".
  Then **Refresh data now**, **Run all rules now**, **Run dry run now** and
  **Turn on** are disabled. The preview still works on the newest stored
  library data, and Keeps, Postpone and Exclude still work.
- **Kometa.** Does Kometa manage your Plex collections? Then, before a rule
  leaves Dry run, make the change in [Kometa](#kometa).

## How a rule works

A rule has six parts:

1. **Level:** Movies, Whole shows or Seasons. A season rule acts on single
   seasons and never deletes the show.
2. **Libraries:** the Plex libraries that Radarr or Sonarr manages. A library
   with no Radarr or Sonarr root folder, or with no external ids, is not
   offered.
3. **Conditions:** sentence rows such as "Last played more than 365 days ago,
   or never". A title must meet every condition.
4. **Any-of groups:** a box of 2 to 10 conditions, "Any of these is true". One
   of them must be true.
5. **Never touch:** the protections. The global protections of Settings apply
   to every rule ("Always on: 10 global protections"). A rule can add its
   own, under "This rule only". If any protection is true, the title is not a
   match.
6. **Then:** the grace period (1 to 3650 days, 30 by default), the action,
   and the import list exclusion for a delete action.

Under the builder, **In plain words** reads the whole rule as one sentence.
For example:

```text
Movies in the Movies library that were added more than 365 days ago, had no play in the last 365 days,
and either have no request in Overseerr or were requested only by former members. Never touch anything
that a global protection keeps safe, or that has at least 3 plays in total. Keep matches in Leaving soon
for 30 days, then delete each movie and its files in Radarr, and add an import list exclusion. This rule
is in Dry run, so runs only record its matches.
```

Start a rule from one of the ten recipes on the Rules tab, or from a blank
rule. A recipe asks for 1 to 3 key values, with a match count on each choice,
and creates a normal rule that you can change.

The app keeps an unsaved rule while you visit up to 3 other pages. After more
pages, the editor opens with the saved rule, and the unsaved changes are gone.
A new rule opens with its start draft.

When two rules match one title, the longest grace period and the most careful
action win: unmonitor before delete. The title lists every rule that matched
it.

## Fields

"Months" are 30 days and "years" are 365 days. Plays count as Rewind counts
them. A play counts after 120 seconds or 90 % of the title. A title is
finished after 90 %, or after Tautulli marks it watched.

| Field | Levels | What it reads |
|---|---|---|
| Last played | Movies, Whole shows, Seasons | The newest counted play (any episode for a show or a season) from Tautulli. "Or never" also matches titles with no play. |
| Plays | Movies, Whole shows, Seasons | Counted plays, in total or in the last N days. |
| Requested in Overseerr | Movies, Whole shows, Seasons | Whether a request exists. |
| Requested | Movies, Whole shows, Seasons | The age of the newest request. |
| Requested by | Movies, Whole shows, Seasons | Who asked: any member, former members, members inactive for N days, or named members. |
| The requesters | Movies, Whole shows, Seasons | The requesters never played it, or every requester finished it. |
| Added | Movies, Whole shows, Seasons | When Plex or Radarr or Sonarr added it. |
| Size on disk | Movies, Whole shows, Seasons | The size in Radarr or Sonarr, else in Plex. |
| Show status | Whole shows, Seasons | Ended or continuing, from Sonarr. |
| Last episode added | Whole shows, Seasons | When the newest episode arrived in Plex. |
| Seasons on disk | Whole shows, Seasons | The seasons that Sonarr has files for. |
| Season position | Seasons | Whether the season is one of the newest N seasons of its show. |

Every value is true, false or unknown. "Never" means no counted play since
the start of the Tautulli history. A rule that reads plays needs a history
that covers its window: a rule with "more than 365 days, or never" needs 365
days of history. A shorter history stops the rule (see The nightly run).

Two causes make a value unknown: its service did not answer, or no record
holds it. A condition that is unknown keeps the title out of Leaving soon,
under **Missing data**, until the value is known.

## Global protections

Settings holds 13 global protections. Each applies to every rule of its
levels. The days in brackets are the defaults.

| Protection | Levels | Keeps a title safe when |
|---|---|---|
| G1 | All | A member kept it, until the Keep ends. Always on. |
| G2 | All | A member marked it Keep forever. |
| G3 | All | An admin excluded it, until its end date. Always on. |
| G4 | All | Anyone played it in the last [30] days. |
| G5 | All | Someone is part-way through: an unfinished play in the last [180] days. |
| G6 | All | It was added, or new episodes were added, in the last [30] days. |
| G7 | All | A member with access requested it in the last [90] days and has not finished it. |
| G8 | All (seasons through their show) | It is on the Plex watchlist of a member with access who uses watchlist sync. |
| G9 | All (seasons through their show) | It has one of the Radarr or Sonarr tags in the setting, `keep` by default. |
| G10 | All (seasons through their show) | It is in a stored Rewind, until the Rewind season closes. |
| G11 | Seasons | It is the newest season of a continuing show. |
| G12 | Seasons | A member who played the show in the last [365] days has not finished the season. |
| G13 | All (seasons through their show) | It is in one of the Plex collections in the setting. Off by default. |

A protection whose service is not set up does nothing, and Settings shows
"Needs {Service}" under it. A protection whose service did not answer is
unknown, so the title waits under **Missing data**.

The cascade: a Keep or an exclusion of a show protects the show and all its
seasons. A Keep or an exclusion of a season protects that season and its
show, so a whole-show deletion never takes a kept season. A Keep forever
mark on an episode protects its season and its show. The other protections
read the title's own facts: a play of season 9 last week does not protect
season 2.

Settings shows "Protects N titles" under each protection, and a change shows
how many titles each rule then matches before you save.

## The preview

The editor checks the rule against the newest library data while you edit
it. The preview card shows:

- The matches, their size, and how many weeks of new media that is.
- For each condition, "N more without it": the titles that fail only that
  condition, whatever the order of the conditions.
- How many titles the global protections and the rule's own protections keep
  safe.
- The warnings, for example a rule that matches more than half of the
  library, or two conditions that cancel each other.

The **Results** section splits the titles into five tabs:

| Tab | Titles |
|---|---|
| Matches | Meet every condition and no protection. |
| Near misses | Fail exactly one condition (a group counts as one), with no protection. |
| Protected | Meet every condition, but a protection keeps them safe. |
| Missing data | A value that a condition or a protection needs is unknown. |
| Cannot delete | No Radarr or Sonarr record matches, two records match, or the file is outside the root folders. Cleanup never deletes them. |

Select a title to open its **Why** panel. It shows each condition with the
real value of the title, and the protections. For a near miss, it shows the
day that it starts to match, and one value that includes it. It also shows
what the action does to the title, and the other rules that match it.

## Modes and turning a rule on

| Mode | What a run does | What members see |
|---|---|---|
| Dry run | Records the matches. Changes nothing in Plex, Radarr, Sonarr or Leaving soon. | Nothing |
| Review first | Puts matches in Leaving soon. At the leave date, the titles wait in a deletion batch for an admin's approval. | The Plex collection, the Leaving soon page and the Home row |
| Automatic | Puts matches in Leaving soon. At the leave date, deletes them inside the daily budget. | The same |

Every new rule, and every copy of a rule, starts in Dry run, and a dry run
starts at once. **Run dry run now** checks the saved rule again.

To turn a rule on, open it and select **Turn on**. The review page shows what
happens today: the titles that go into Leaving soon, their size, the leave
date, who can see them, the daily budget and the 10 largest titles. Its
checks must pass:

| Check | Blocks |
|---|---|
| Media cleanup is on | Yes |
| Cleanup is not paused | Yes |
| Every source that the rule uses answered, the library data is less than 36 hours old, and no source returned far fewer rows than before | Yes |
| Tautulli recorded a play in the last 14 days | Yes |
| The Tautulli history covers the window of the rule | Yes |
| Radarr or Sonarr manages every match | No (a warning) |
| At least one finished dry run, with steady matches | Automatic only |
| The first batch is 10 % or less of the checked titles | Automatic only |
| The grace period is at least 7 days (Settings) | Automatic only |
| No Kometa removal of a Leaving soon collection in the last 30 days | No (a warning) |

Automatic needs one finished dry run. Steady matches: the newest 7 dry runs of
the saved rule stay within 10 %, or within 5 titles, of the newest count.

**Typed approval.** Above 50 titles, turning a rule on in Automatic and
approving a deletion batch ask you to type the count. Routine edits never ask.
Typed approval is a check in the admin UI. MCP has no tool that turns a rule
on or approves a deletion batch. Ask a person to check each cleanup change
that an MCP tool marks destructive.

A saved change to a rule that is on can move titles in or out of Leaving
soon. The save then shows the change first, and titles that no longer match
leave at once. The level of a rule that is on is read only: to change it,
move the rule back to Dry run, or duplicate it.

**Change mode...** moves a Review first rule to Automatic through the review
page. **Switch to Review first...** and **Move back to Dry run...** open a
dialog first. Back in Dry run, the rule's titles leave Leaving soon, and
nothing is deleted.

### A test rule before the first real deletion

Before a rule deletes media that you care about, delete one title that you do
not need. No field matches one title, so a library holds it:

1. In Radarr, add a root folder for tests, for example a `cleanup-test` folder
   beside your movies folder.
2. Add one movie that you do not need to that root folder.
3. In Plex, add a library "Cleanup test" on that folder.
4. Make a Movies rule for that library only, with the condition "Added more
   than 1 day ago".
   1. In Settings, Global protections, set "Added, or new episodes added, in
      the last" (G6) to 1 day. The new library gives the test movie a new
      Plex added date, so G6 protects it for 30 days by default. Set it back
      to 30 after the checks. No other rule is on at this time.
5. Turn the rule on in Review first. After the grace period, approve the
   batch on the Leaving soon tab.
6. Check that Radarr deleted the folder, that Plex no longer lists the movie,
   and that History lists it as deleted.
7. Do the same with a Sonarr root folder, a short show and a Seasons rule.
   Check that Sonarr stops monitoring the season and its episodes.

## Leaving soon

**Leave dates.** A title that joins Leaving soon gets its leave date: today
plus the grace period. A leave date only moves later. A show never leaves
before its seasons that are in Leaving soon: its date moves later to match
them. Members see the date on the Leaving soon page and on Home. The Plex
collection lists the soonest title first.

**Rescue.** A title that no longer matches leaves Leaving soon: a member
played it, kept it or requested it, new episodes arrived, or a protection
keeps it safe. History and the exits line ("In the last 7 days, 3 titles left
Leaving soon") give the reason.

**Batches.** Two kinds of batch wait for an admin, as cards at the top of the
tab:

- A **deletion batch** holds the due titles of one Review first rule. After
  an admin approves it, Radarr or Sonarr deletes its titles inside the daily
  budget. The approve dialog names the action, the size and the import list
  exclusions of the selected titles. A batch never deletes by itself and
  never expires.
- An **entry batch** holds new matches that the entry check held. Approve it
  to put them in Leaving soon with a full grace period. Nothing is deleted
  then.

**The entry check.** Settings sets two limits for each rule in one run: 50
new titles, and 10 % of the checked titles. Above a limit, the run adds none
of them and makes an entry batch, so a wide rule never fills Leaving soon by
surprise. The check applies to every run that can change titles, also a run
that an admin starts. While the batch waits, the next run adds nothing new
for that rule.

**Selection.** Every title of a deletion batch starts selected. Untick a
title to leave it out of the approval. You can leave out at most 500 titles
of a batch. The unticked titles of a batch stay unticked only in the same
browser tab. A new browser tab, another browser or a phone shows every title
selected. To keep a title out for longer, postpone or exclude it.

**Postpone** moves the leave date of the selected titles later, by 1 to 3650
days. It never moves a date earlier, and it clears an approval. **Exclude**
keeps the selected titles out of every rule until an end date, or for good,
with a note that only admins see. In the footer of a deletion batch,
**Postpone...** and **Exclude...** act on every selected title of the batch.
That includes the titles on the other pages of the batch.

To approve a few titles of a very large batch, leave them out and postpone the
rest from the footer. Then select them again and approve.

**Keeps.** A member can keep a title that is leaving soon, on the Leaving soon
page or the Home row. The title leaves Leaving soon at once, with its show or
seasons. A Keep lasts 90 days by default (7 to 365), and a member can hold 20
Keeps at a time (1 to 100). The **Kept and excluded** tab lists every Keep and
exclusion, where an admin can end a Keep, remove an exclusion or change its
end date. The member then sees "Your Keep ended. The server admin ended it on
{date}" for 30 days. Turning member Keeps off in Settings stops new Keeps
only: every current Keep still protects its title until it ends.

Members never see sizes, rule names, other members' names or admin notes.

## The nightly run

Every night at 03:07, the worker reads the library data from Plex, Tautulli,
Overseerr, Radarr and Sonarr. The time is in the server time zone: Admin >
Settings > System information, else `TZ`, else UTC. A run of every rule
follows. It rescues titles that no longer match, adds new matches to Leaving
soon, and deletes the due titles of Automatic rules. Approved titles that
still wait go in the same deletion step. **Refresh data now** reads the
library data again, and **Run all rules now** runs the rules on the stored
data. A run that you start never deletes: deletions happen only in the
nightly run or after a batch approval.

Set the server time zone to the time zone of Tautulli. Before a deletion, the
app asks Tautulli for plays after a day, and Tautulli reads that day in its
own time zone.

A safety stop keeps a rule from changing anything in a run, and names the
cause. Keeps, exclusions and Postpone still apply. The stops are in
`lib/cleanup/blocks.ts`:

| Stop | Cause |
|---|---|
| {Service} did not answer | A service that the rule uses failed in the newest library read. |
| Tautulli recorded no play in 14 days | Tautulli is probably not recording. |
| Tautulli history is shorter than the window of {rule} | The rule reads plays further back than the history goes. |
| Library data is {N} hours old | The newest complete library data is older than 36 hours. |
| No library data yet | No library read finished yet. |
| {Service} returned {N} {things}, {M} before | A count of requests, plays in the history or members with a play fell more than 10 %, or to 0. For an expected fall, press **Refresh data now**: a read that you start and that agrees clears the stop. |
| Tonight's library read failed | The read before the nightly run failed, so the run rescues titles on the older data but deletes nothing. |
| Plex has no owner account for this server | Reconnect Plex in Settings. |

History also shows runs that did not start or stopped: "Not started: another
run was in progress", "Stopped: the server shut down", "Stopped: {Service}
refused the API key" and "Stopped: the app did not write an audit row".

## What deletion does

Before each delete, the app checks the title again with the current rules and
settings. One of these changes since the run skips the title, or rescues it:

1. Radarr or Sonarr no longer has the record (the title counts as already
   gone).
2. The record has other ids, another path, or more files than before.
3. A movie's Plex file is no longer inside the Radarr path.
4. Someone played it, or someone requested it.
5. A Keep, an exclusion, a Keep forever mark, a watchlist entry or a tag now
   protects it.
6. Someone plays it now: it waits for the next deletion step.

Then Radarr or Sonarr acts. The app never calls an Overseerr delete and never
deletes through Plex.

| Action | What happens |
|---|---|
| Delete the movie and its files in Radarr (Movies default) | Radarr deletes the movie and its files. With the import list exclusion on, Radarr also adds the exclusion. |
| Unmonitor the movie and delete its files in Radarr | Radarr keeps the movie and stops monitoring it, so it does not download it again. Then it deletes the file. |
| Delete the show and its files in Sonarr (Whole shows default) | Sonarr deletes the series and its files. With the import list exclusion on, Sonarr also adds the exclusion. |
| Unmonitor the show and delete its files in Sonarr | Sonarr keeps the series and stops monitoring it and every season. Then it deletes every episode file. |
| Unmonitor the season and delete its files in Sonarr (Seasons) | Sonarr keeps the show and stops monitoring the season and its episodes. Then it deletes the episode files of that season. First, the app checks that the Sonarr files of the season are the Plex files of the season. If the numbering differs, nothing is deleted. |

The import list exclusion stops Radarr or Sonarr import lists from adding the
title again. It applies to the delete actions only.

After each delete, Plex scans the title's folder. After a deletion step, the
app asks Overseerr to run its availability check. Members can request a
deleted title again after Overseerr's next availability check, at the latest
the next morning.

Freed space always reads "up to". A hardlinked torrent copy keeps its space
until the torrent client removes it.

A delete can fail part-way, for example after the unmonitor and before the
file delete. The title then stays in Leaving soon, and the next deletion step
tries again. A failed delete can leave a record unmonitored. History names it:
"Still unmonitored in {Service}". The app never monitors it again by itself,
because monitoring can start downloads. History lists such a row for 90 days,
but the record stays unmonitored until you change it in {Service}. The
`failed` row of the partial delete ("unmonitored, files kept") stays for 365
days.

## Daily budget and order

All rules share one daily budget: at most 20 titles and 500 GB a day by
default (Settings: 1 to 500 titles, 1 GB to 50 TB). Due titles go in the order
of their leave date, then the largest first. The seasons of a show go before
the show. A title that does not fit waits for the next day.

One title larger than the space budget goes alone on its own day, as the first
deletion of that day. The Settings tab, the turn-on page and the approve
dialog name such titles and their day. So the space budget is not a hard cap.

## Plex collections

Titles in Leaving soon show in Plex collections, one for each library and
level: "Movies leaving soon", "Shows leaving soon" and "Seasons leaving soon".
The soonest title comes first. The summary of each collection tells members
where to keep a title. By default, the collections show on the Home of the
owner and of members, and not in Recommended. Change this in Settings, Plex
visibility. A collection on Home needs Plex Pass. The collection sync runs
every hour at minute 41, and after each change. Off, paused, or with
collections turned off in Settings, the collections are empty.

On the Leaving soon page and on Home, a member sees only the titles of
libraries that are shared with them. A Plex label filter on their share hides
the same titles here.

## Kometa

A library in the Kometa file can have `delete_collections` with
`configured: false`. Then Kometa deletes every Plex collection that the file
does not define. The file does not define the Leaving soon collections, so
Kometa deletes them on its next run. The app sees the removal within the
hour, makes the collection again, and shows a notice on the Rules tab. The
turn-on page warns for 30 days after such a removal.

To keep them, add `managed: true` to `delete_collections` of each library that
has Leaving soon titles. Kometa then deletes only collections with its own
label, and the app's collections carry no label:

```yaml
libraries:
  Movies:
    operations:
      delete_collections:
        configured: false
        managed: true
  TV Shows:
    operations:
      delete_collections:
        configured: false
        managed: true
```

With `managed: true`, Kometa no longer deletes Plex's automatic collections
either. To keep those off, do this once in Plex:

1. Open the Movies library, then Edit, then Advanced.
2. Set "Minimum automatic collection size" to "Disabled".
3. Save.

## Off and paused

**Off** is the switch in Settings. **Pause all cleanup** in the page header is
the emergency stop. Both have the same effect:

- No run changes anything, and nothing is deleted. An arr call that already
  started finishes. No other item starts.
- Approved batches go back to waiting for approval.
- The Plex collections empty at the next sync, and the member page, nav item
  and Home row hide.
- Library reads and dry runs go on. Keeps and exclusions stay, and titles keep
  their leave dates.

After **Resume cleanup**, and after the feature turns on, nothing is deleted
for 7 days. A leave date earlier than that moves to the end of the 7 days, and
members see the new date.

During the code freeze (from 2026-12-14, see `docs/operations.md`, "Code
freeze gate"), something can look wrong. Then pause cleanup. Do not wait for a
fix.

## Audit rows

Every admin change, every member Keep and every run writes an audit row in
**Admin > Audit log**, category "Media cleanup". The rows hold ids, counts,
codes and dates, never a title, a rule name or a member name.

| Event | When |
|---|---|
| Cleanup rule created, changed, deleted | An admin creates, saves, duplicates or deletes a rule. |
| Cleanup rule mode changed | A rule is turned on, changes mode, or moves back to Dry run. |
| Media cleanup settings changed | An admin saves a Settings section. |
| Media cleanup paused, resumed | An admin pauses or resumes. |
| Media cleanup run started | An admin starts a run, a library read or a dry run. |
| Media cleanup ran | A run ends, with its counts, outcome and safety stops. |
| Titles joined Leaving soon | A run adds new matches. |
| New matches held for review | The entry check holds a batch. |
| Titles released from Leaving soon | A rule moved back to Dry run, was deleted, or lost a library. |
| Cleanup batch approved | An admin approves a deletion or an entry batch. |
| Leave dates postponed, Titles excluded from cleanup, Cleanup exclusion changed | An admin postpones, excludes, removes an exclusion or changes its end. |
| Title kept by a member, Keep ended | A member keeps a title, or a Keep ends. |
| Title rescued from Leaving soon | A title leaves Leaving soon because it no longer matches. |
| Title deleted by cleanup, Cleanup deletion failed | A delete succeeds or fails. |

Each run in History has an **Audit** link. It opens the audit log with the
rows of that run: the run, the titles it added and held, its rescues, its
deletions and its failures.

## MCP tools

Through the MCP endpoint (`docs/mcp.md`), an admin's token can read cleanup
state with eight tools in `lib/mcp/read-tools-cleanup.ts`:

| Tool | Reads |
|---|---|
| `get_cleanup_overview` | The Rules tab: the feature state, the library data, the safety stops, the batches, the recipes, and the rules with their `revision`, paged |
| `get_cleanup_rule` | One rule: its definition, plain words, stats and `revision` |
| `get_cleanup_turn_on` | The turn-on review of a rule: its checks, counts and `keysHash` |
| `list_cleanup_leaving_soon` | The batches with their `count`, `keysHash` and `reviewedAt`, and the titles in Leaving soon, paged. With `batch`, the titles of one deletion batch |
| `list_cleanup_protections` | The Keeps and exclusions, paged |
| `list_cleanup_runs` | The newest 30 runs |
| `list_cleanup_deleted` | The deleted and failed titles, and records left unmonitored, paged |
| `get_cleanup_settings` | The Settings tab |

Every cleanup action is also a tool, with the same checks and audit rows as
the admin pages: the previews, rule changes, Postpone, Exclude, entry batch
approval, Keeps, pause, resume and settings. Turning a rule on and approving a
deletion batch have no tool: they need a person on the admin pages. The
previews and the batch selection read only. These tools are marked
destructive: delete a rule, remove a Keep or an exclusion, and the actions
that start or widen deletions. Those actions are: save a rule, approve an
entry batch, save settings, resume, and change an exclusion end
(`DESTRUCTIVE_ACTIONS` in `lib/mcp/action-tools.ts`). A read-only token gets
only the reads.

A rule that is already Automatic needs no review page to delete. A full
token can save a wider definition of such a rule, run all rules, approve
its entry batch, or turn a global protection off. The nightly run then
deletes the new matches at the end of their grace period (at least 7
days for Automatic). Members can Keep the titles in that time, and each
change has its audit row. Ask a person to check these changes.

## Limits

| Limit | Value |
|---|---|
| Rules | 50 |
| Conditions and groups per rule | 20 |
| Conditions per any-of group | 2 to 10 |
| Rule protections | 10 |
| Libraries per rule | 20 |
| Requesters in one Requested by condition | 50 |
| Titles per Postpone or Exclude | 500 (the batch footer has no limit) |
| Titles left out of one batch approval | 500 |
| Grace period | 1 to 3650 days. Automatic: 7 (Settings) to 3650. A warning below 14. |
| Daily budget | 1 to 500 titles, and 1 GB to 50 TB |
| Entry check | 1 to 1000 titles, and 1 to 100 % |
| Typed approval | Above 50 titles |
| Time to approve after the review page loads | 15 minutes |
| Hold after a turn-on or a resume | 7 days |
| Keep length | 7 to 365 days (90) |
| Keeps per member | 1 to 100 (20) |
| Runs kept | 30 |
| Outcomes kept | 365 days for deleted and failed, 90 days for rescued and released |
| Library data kept | The 2 newest complete reads |
| Previews | 120 a minute for each client address |
| Admin changes | 60 every 10 minutes for each admin |
| Member Keep actions | 30 an hour for each member |
| Stale library data | 36 hours |
| Tautulli silence | 14 days |

The fixed values are in `lib/cleanup/constants.ts`, and the options with their
defaults in `lib/validations/cleanup-options.ts`.
