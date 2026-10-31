# Inactive members

**Admin > Inactive members** shows when each member last played something on
Plex, and can remove Plex access from members who stopped watching. Removal is
off until an admin turns it on. Reading last seen is always on, because it
changes no one's access.

## Last seen

Last seen is the start of the member's newest play, as Tautulli records it
(`get_users_table`). The app matches a Tautulli user to a member by their
plex.tv account id, never by name.

- **Where it shows:** the **Last seen** column on Admin > Users, and **Last
  seen on Plex** on a member's Overview tab.
- **Never:** Tautulli knows the member but has no play for them.
- **Unknown:** Tautulli has not reported the member. Either they have no Plex
  account, Tautulli does not know them, Tautulli keeps no history for them
  ("Keep history" is off), or no read has run yet.
- **Keep history:** the app counts it as on only when Tautulli clearly says
  so: `1` from Tautulli 2.10 and later, or `Checked` from older versions. Any
  other value, an empty one included, counts as off.
- **It never moves back.** A play the app has read stays, even when Tautulli
  later loses it. The history guard (see Stale data guards) covers the plays
  the app never read.
- **A play dated in the future,** for example from a wrong clock, counts as a
  play at the time of the read.

## The daily run

The run starts every day at about 02:17 in the server time zone (Admin >
Settings > System information, else `TZ`, else UTC). It needs Redis and a
worker (`PROCESS_ROLE=worker` or `all`). Without Redis there is no daily run;
use **Run now**.

Each run does two things:

1. Reads last seen from Tautulli for every member with a Plex account.
2. When automatic removal is on, removes Plex access from the members who
   qualify (see the rules below).

Only one run works at a time. A run holds a claim, and renews it every 5
minutes while it works. Another run can take the claim only when no one
renewed it for 30 minutes, for example because the worker stopped. A run that
loses its claim stops.

The page lists the newest 30 runs: when each started, who started it, the
Tautulli users read, the members found, how many were removed, how many
failed, and why a run removed no one. Each run in the list has an audit row,
so you can open any run to see its events in the audit log.

## Who counts as inactive

A member counts as inactive when no play has started for the set number of
days (180 by default, from 30 to 3650). The count starts at the latest of
three days: their newest play, the day they joined, and the day their access
came back after it ended. So:

- A member who joined recently and has not played yet is not inactive.
- A member who gets access back after it ended has the full number of days to
  play from that day. The app records the day when they sign in with access
  again, or, when you share the server with them again in Plex itself, at the
  first run that sees their share.

The run never removes these members, in this order:

| Rule | Who |
|---|---|
| No Plex account | The member has no plex.tv account id |
| Admin | Admins |
| Server owner | The Plex account that owns the server |
| Has a role | Members with a role, such as Support |
| Exempt | Members exempt from the subscription |
| Paying member | Subscription active or past due |
| Excluded by an admin | Members an admin excluded on their page |
| Not found in Tautulli | The latest read did not find them, or Tautulli keeps no history for them |

Only members who still have an accepted share of the server can be removed.

## Who a run would remove

The page lists the members a run would remove now, the longest inactive
first, with the same rules as the run. It uses the newest read of Tautulli,
so a member who played since then can still be on the list until the next
read. Under the list, the page counts everyone else and why they are left out.

When Plex does not answer, the page cannot check the shares. It then lists
every inactive member, and says that the list can include members who no
longer have access. A run removes no one until Plex answers.

## Safety limits

- **Scheduled runs:** a scheduled run removes at most 5% of the members with
  access, at least 1 and at most 10. When more members qualify, it removes no
  one. So many at once more likely means stale data than a real drop in
  activity.
- **Run now:** when removal is on and the page lists members to remove, Run
  now first asks you to confirm them, and the run gets that list. It reads
  Tautulli again before it removes anyone. If it would then remove a member
  who is not in the list, it removes no one. A member in the list who no
  longer qualifies, for example because they played since, is left alone.
- **A confirmation does not last.** Job queues cannot retry a Run now job: it
  runs once, and leaves the queue when it ends. The job uses the confirmation
  only when it starts within 15 minutes, and only while the admin who
  confirmed is still an admin. Otherwise it removes no one if anyone
  qualifies.
- **One run at a time:** Run now says so when another run is in progress or
  waiting, and when the job queue does not answer. If the job still finds
  another run in progress when it starts, it stops there, and the audit log
  records "Another run was in progress".

## Stale data guards

A run removes no one when:

- Automatic removal is off.
- The read from Tautulli failed.
- Tautulli recorded no play on the whole server in 14 days, which usually
  means Tautulli stopped recording.
- Tautulli's history does not go back the set number of days: its oldest
  play is newer than that, it has no play at all, or the app could not read
  it. A Tautulli that was added late, reset or emptied has no record of older
  plays, so a member who played before then could look inactive.
- No Plex server is set up, plex.tv does not answer, or plex.tv refuses the
  server token.

A run that stops part way, for example when plex.tv starts refusing the token
or the server shuts down, keeps the removals it made. Its counts say how many.
When a share is removed but the clean-up after it fails, the member counts as
removed, their audit row says the clean-up did not finish, and the run stops.

## What removal does

Removal does the same as **Remove Plex access** on Admin > Users:

1. Removes the member's share of the configured Plex server. They stay your
   plex.tv friend, and keep any other server you share with them.
2. Turns off their watchlist sync and clears their stored plex.tv token.
3. Ends their affiliate status, if they have one.
4. Signs them out of this app.

Their account, Rewind and other data stay.

## Audit rows

Each appears in Admin > Audit log under its name.

| Event | When | Details |
|---|---|---|
| Plex access removed (`MEMBER_UNSHARED`) | Each removal | The reason `inactivity`, last seen, the days without a play and the run id; `offboarded: false` when the clean-up did not finish |
| Inactivity sweep ran (`INACTIVITY_SWEEP_RUN`) | Every run under Recent runs, and a Run now that found another run in progress | The counts, and why it removed no one |
| Inactivity settings changed (`INACTIVITY_SETTINGS_CHANGED`) | An admin saves the settings | The fields that changed, before and after |
| Inactivity exclusion changed (`INACTIVITY_EXCLUSION_CHANGED`) | An admin excludes a member, or ends the exclusion | Excluded or not |
| Last seen check started (`ACTIVITY_SYNC_TRIGGERED`) | Run now starts or queues a run | Whether it was queued, and how many members the admin confirmed |

Removals made by the daily run name System as who did it. Run now names the
admin, or System when that admin is no longer an admin as the job starts. A
run stores member ids only, never names.

## Excluding a member

Open the member's page in Admin > Users. On the Overview tab, turn on
**Never remove for inactivity**. It saves at once. The run then never removes
that member, however long they go without playing. Turn it off to let the run
consider them again.
