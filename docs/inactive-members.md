# Inactive members

**Admin > Automations > Inactive members** shows when each member last played something on
Plex, and can remove Plex access from members who stopped watching. It can
also email each member before the run removes them (see Warning emails).
Removal and the warning emails are off until an admin turns them on. Reading
last seen is always on, because it changes no one's access.

## Last seen

Last seen is the start of the member's newest play, as Tautulli records it
(`get_users_table`). The app matches a Tautulli user to a member by their
plex.tv account id, never by name.

- **Where it shows:** the **Last seen** column on Admin > Members > Users,
  and **Last seen on Plex** on a member's Overview tab.
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
2. When automatic removal is on, plans the warning emails that are due (when
   they are on, see Warning emails), then removes Plex access from the
   members who qualify (see the rules below).

Only one run works at a time. A run holds a claim, and renews it every 5
minutes while it works. Another run can take the claim only when no one
renewed it for 30 minutes, for example because the worker stopped. A run that
loses its claim stops.

The page lists the newest 30 runs: when each started, who started it, the
Tautulli users read, the members found, how many were removed, how many
warning emails it planned, how many failed, and why a run removed no one. Each run in the list has an audit row,
so you can open any run to see its events in the audit log.

## Who counts as inactive

A member counts as inactive when no play has started for the set number of
days (180 by default, from 30 to 3650). The count starts at the latest of
three days: their newest play, the day they joined, and the day their access
came back after it ended. So:

- A member who joined recently and has not played yet is not inactive.
- A member who gets access back after it ended has the full number of days to
  play from that day. The app records that day in three cases:
  - They sign in with access again.
  - Grant access, or a new Stripe subscription, shares the server with them
    again.
  - You share the server with them again in Plex itself. The first run that
    sees their share records the day.

The run never removes these members, in this order:

| Rule | Who |
|---|---|
| No Plex account | The member has no plex.tv account id |
| Admin | Admins |
| Server owner | The Plex account that owns the server |
| Has a role | Members with a role, such as Support |
| Paying member | Subscription active or past due |
| Excluded by an admin | Members an admin excluded on their page |
| Not found in Tautulli | The latest read did not find them, or Tautulli keeps no history for them |

An exemption from the subscription does not protect a member, because it is
about billing and not about use. To keep a member, exclude them on their page.

Only members who still have an accepted share of the server can be removed.

## Who a run would remove

The page lists the members a run would remove now, the longest inactive
first, with the same rules as the run. It uses the newest read of Tautulli,
so a member who played since then can still be on the list until the next
read. Under the list, the page counts everyone else and why they are left out.

Under **Warned members**, the page has three more lists:

- **Waiting for their date**: members with an open warning. Each row shows
  the removal date, the newest email and its status. While warning emails
  are off, only a warning that went out or was skipped holds a date, so only
  those members are here.
- **First warning at the next run**: members with no warning yet whom the
  next daily run warns, the longest inactive first. Each row shows the
  removal date that the warning would name.
- **Cannot email**: the members of the two lists above whom the app cannot
  email, with the reason: no address, not one address, not the address on
  plex.tv, disabled, unsubscribed or refused by the mail server. The three
  lists show a member's name, never their address. "Refused" comes from the
  member's newest email only. So a member whose address the mail server
  refused in an earlier cycle shows as one the app can email in **First
  warning at the next run**.

While warning emails or automatic removal are off, no run sends a warning.
The second and third lists then show what the first run after you turn them
on would do.

When Plex does not answer, the page cannot check the shares. It then lists
every inactive member, and says that the list can include members who no
longer have access. A run removes no one and sends no warning until Plex
answers.

## Warning emails

The run can email each member before it removes their access. The emails go
out 30, 7 and 1 days before the removal date by default. They are off until
an admin turns them on in the **Warning emails** card, below **Automatic
removal**. Email must be set up first (`docs/email.md`), and Redis too, since
the worker sends each email as a job.

The card shows the switch, the days before removal, the mail server, and the
rule that removal waits for the warnings. While email or Redis is not set up,
the card cannot turn the emails on, and says why. Emails that are on can
always be turned off, but then the next run can remove members who have no
sent warning yet. Turn automatic removal off first to stop removals.
Warnings can be on while removal is off: the app then sends nothing, so you
can turn the two switches on in either order.

### The days before removal

- Enter 1 to 4 different whole numbers from 1 to 90, such as `30, 7, 1`.
  The app saves them largest first.
- The largest can also be at most half the days without a play. For 100
  days, the largest is 50. A longer lead could warn a member on the day of
  their last play.
- While the emails are on, the **Automatic removal** card refuses a new
  number of days without a play below twice the largest lead. A save that
  keeps the number, such as turning removal off, always passes.
- An email for the smallest lead, or a smaller one, is the **last warning**.
- After missed runs, a member gets only the most urgent email that is due.
  A member with 3 days left gets the 7-day email, with the text "3 days
  left", never the 30-day one.
- A new lead in the list can add one more email to a warning that is
  already open. A smaller smallest lead does more: the app compares the
  emails already sent with the new smallest lead, so an email that was the
  last warning before can count as an earlier one now. The member then gets
  a new last warning. This never makes a removal earlier.

### The timeline

For a member with 180 days without a play, the leads 30, 7 and 1, and a
newest play on May 1 at 20:00, in the server's zone:

| When | What happens |
|---|---|
| September 28, 09:00 | The first warning names October 28, "30 days from now" |
| October 21, 09:00 | The second email: 7 days left |
| October 27, 09:00 | The last warning: the removal date is tomorrow |
| October 29, 02:17 | The run removes access, as it would without the emails |

In this normal case the emails add no delay. When the emails go on, or the
days without a play go down, a member who is already past their days gets a
first warning at the next run, with a date at least the largest lead away.
So no one is removed without the full notice.

- Each email goes out between 09:00 and 20:00 in the member's zone (their
  own time zone, else the server's). It names the date in that zone.
- Each email says "on or after" the date. A guard, the safety limit or a
  hold can make the removal later. Nothing makes it earlier.
- A play, or access that comes back, ends the warnings. The pending emails
  of that period are cancelled when their jobs run.

### The rules

While the emails are on:

1. **No surprise removal.** The run removes a member only when all of
   these are true: they are inactive, their removal date has started in
   their zone, their last warning for that date was sent or skipped at
   least 12 hours before the run, and Tautulli recorded a play on the server
   after that warning.
2. **The first warning gives the full lead.** It names a date at least the
   largest lead after the day it goes out. If its job reaches it more than
   one day late, the job cancels it, and the next run plans a new one.
3. **Dates never move earlier.** A later email names the same date or a
   later one. Fewer days without a play keep the date already sent. More
   days move it later, and the emails start again for the new date. A
   pending email for the old date is then cancelled (`superseded`).
4. **Dates survive switching off.** With the emails off, the run still never
   removes a member before a date that a sent or skipped email named. A
   pending, failed or cancelled email names no date for this rule.
5. **Old warnings expire.** When the run did not remove a member within 7
   days after their date started, the warnings start again with a new
   first warning and the full lead.
6. **A failed last warning holds the removal.** The next run plans a new
   last warning, with a date the smallest lead after the day it goes out. A
   new last warning with a later date, for example one that rule 7 planned,
   also holds the removal when it fails or is cancelled. A cancel because
   more days without a play moved the date (`superseded`) does not count. A
   failed earlier email gets more tries while its date is ahead, but does
   not hold the removal.
7. **An idle server holds the removal.** When no one played on the server
   after the last warning, the removal waits. The first time in a warning
   period, the next run also plans a new last warning.
8. **A skipped email counts.** An email that the job skipped, for example
   because the member has no address or turned the emails off, counts as
   sent for the timeline.

Why 12 hours: in normal timing, a last warning at 09:00 is at least 15 hours
before the next run. The 12 hours only delay a late email, for example one
at 19:30 after a Run now.

### Members the app cannot email

The run plans the same emails for these members. Each one is skipped with a
code, and the timeline goes on. So turning the emails off, or having no
address, never keeps a member from removal while email is set up. To keep a
member, exclude them.

While email is not set up, every member waits. The job fails each email
with `no_transport` before it checks the address, and the run plans no
email for a member whose address plex.tv does not confirm. Once email
works, the next run plans their emails again.

| Code | Member |
|---|---|
| `no_email` | No address on file |
| `invalid_email` | The value is not exactly one address |
| `email_unconfirmed` | The address differs from the one on their plex.tv account, or plex.tv shows no address for them |
| `disabled` | An admin disabled the member |
| `unsubscribed` | The member turned off **Access reminders** |
| `rejected` | The mail server refused the address for good |

The run checks the address against the plex.tv list that it reads for the
shares, and never writes the plex.tv value to the member's row. A member
whose plex.tv account shows no address gets every email skipped with
`email_unconfirmed`, and the run removes them on the same timeline, while
email is set up.

### Guards

| Guard | Emails planned in this run | Emails planned by earlier runs |
|---|---|---|
| Automatic removal off | No | Cancelled when their job runs (`removal_off`) |
| The emails off | No | Cancelled when their job runs (`warnings_off`) |
| The read from Tautulli failed, Tautulli is stale, or its history is short | No | Cancelled when their job runs (`stale_data`). The next good run plans them again |
| No Plex server, or plex.tv does not answer or refuses the token | No | Sent |
| The safety limit (`over_limit`) or a member not confirmed in Run now | Yes | Sent |
| Another run in progress | No run | Sent |
| A run that stops part way | Yes, unless it stopped before the warning step | Sent |
| No one played on the server after a member's last warning | Yes: one new last warning in a warning period | Sent |

A false warning is the main harm of stale data, so the emails follow the
data guards. The safety limits stay removal only: a member who gets a wrong
warning only needs to play.

### The spread of removal dates

A scheduled run removes no one when more members qualify than its safety
limit. Members with the same date become removable together. So the run
spreads the dates of new first warnings:

- It counts the members of each future removal run, from the latest date of
  every open warning.
- A new first warning gets the first date, from the largest lead on, whose
  run holds fewer members than the safety limit. The longest inactive go
  first, and each email names its real number of days, for example "32 days
  from now".
- A new last warning, and a date that more days without a play move, do not
  use the count.

For example, at the first switch-on with 40 members with a share and 12 of
them past their days, the limit is 2. The first run sends 12 first warnings
with 6 dates, 30 to 35 days out. The runs on those days remove 2 members
each. There is no cap on the number of first warnings in one run.

### Run now and the page alerts

With Redis set up, the Run now dialog says that the run also sends any
warnings that are due. The run plans the emails, and the worker sends them
in their send window. Without Redis, Run now runs in the request and plans
no email, so the dialog does not say it.

While the emails are on, the page shows an alert when:

- Email is not set up. No email goes out, so no one new is removed.
- Redis is not set up. No email goes out, so no one new is removed. Without
  Redis there is no daily run, and a Run now removes only members who were
  already fully warned.
- Some members' newest first warning or last warning failed. They wait
  until a run sends a new one. An email that failed 9 times is not tried
  again, and the alert names its member. A failed email between the first
  and the last warning shows no alert, since it does not hold the removal:
  the member still gets the last warning and is removed after it.
- The newest scheduled run removed no one because of the safety limit, while
  members wait for removal. Check the list, then use Run now. After 7 days,
  their warnings start again.
- Members past their days without a play have no warning yet, and the
  newest run, after the newest save of the settings, stopped before it could
  warn them. The alert says why, for example stale Tautulli data. A run that
  gets to the warnings warns every such member. So a member whose exclusion
  ends, or whose subscription lapses, after the run shows no alert: the next
  run warns them.

The member page shows the newest email of any warning period. The **Waiting
for their date** list shows the current period only.

### Going back to an older release

WARNING: A release older than the removal gate (before warning emails were
planned) ignores the dates that were sent. It removes overdue members at
once. Turn automatic removal off before you go back to such a release, and
turn it on again only on a release with the gate.

WARNING: Turning the emails off removes the hold for members with no sent or
skipped warning. The next run can remove them with no notice, for example
members whose first warning still waits for 09:00. To stop removals, turn
automatic removal off first.

| Action | Effect |
|---|---|
| Turn removal off | Nothing is sent and no one is removed. Do this first in an incident. |
| Turn the emails off | No new email. Dates already sent stay (rule 4), so the run still removes members on those dates. A member with no sent or skipped warning goes back to the timing without warnings, so the next run can remove them. |
| Remove `SMTP_URL` | The emails fail, and the removals of warned members wait. If you do not know why email stopped, turn removal off first. |

### Launch checklist

WARNING: Turning the emails off does not stop removals for dates already
sent. It also lets the next run remove members who have no sent or skipped
warning yet. To stop removals, turn automatic removal off.

1. Set `EMAIL_REPLY_TO`, so members can reply and bounce notices reach you.
   It is also the envelope sender, so your mail provider must accept it as
   a sender (`docs/email.md`, "Set up").
2. Send a test email from Admin > Settings > Email. It shows the first
   warning, and it uses the same sender as the warnings.
3. Read the three warning emails: the first warning, the second email and
   the last warning (`lib/email/templates/inactivity.ts`).
4. Have a person who knows Canada's anti-spam law (CASL) check the footer
   before you turn the emails on.
5. Make sure that your mail provider account is out of any sandbox.
6. Make sure that the mail provider suppresses addresses that bounce or
   complain.
7. Make sure that a CDN or a firewall in front of the app lets both
   unsubscribe paths through: `/api/email/unsubscribe` (`POST` and `GET`)
   and `/email/unsubscribe`.
8. On Inactive members, read **First warning at the next run** and **Cannot
   email**.
9. Exclude any member that the run must never remove.
10. Open the **Warning emails** card. Set the days before removal. Turn the
    emails on. Save.
11. After the next run, read the **Warned** count under Recent runs, the
    **Waiting for their date** list and the Job queues page.
12. After 09:00, check that the first emails went out, and read your mail
    provider's sending statistics.
13. Each week for the first two months, read the page for failed or
    refused emails.

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

Removal does the same as **Remove Plex access** on Admin > Members > Users:

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
| Inactivity sweep ran (`INACTIVITY_SWEEP_RUN`) | Every run under Recent runs, and a Run now that found another run in progress | The counts, the warning emails it planned (`warned`), and why it removed no one |
| Inactivity settings changed (`INACTIVITY_SETTINGS_CHANGED`) | An admin saves either card | The card (`section`: `inactivity` or `inactivity-warnings`), the fields that changed, before and after |
| Inactivity exclusion changed (`INACTIVITY_EXCLUSION_CHANGED`) | An admin excludes a member, or ends the exclusion | Excluded or not |
| Last seen check started (`ACTIVITY_SYNC_TRIGGERED`) | Run now starts or queues a run | Whether it was queued, and how many members the admin confirmed |

No audit row is written for each email: the email's own row holds its
result, and it holds no address. A member's change to **Access reminders**
writes `EMAIL_PREFERENCE_CHANGED` (`docs/email.md`).

Removals made by the daily run name System as who did it. Run now names the
admin, or System when that admin is no longer an admin as the job starts. A
run stores member ids only, never names.

## Excluding a member

Open the member's page in Admin > Members > Users. On the Overview tab, turn on
**Never remove for inactivity**. It saves at once. The run then never removes
that member, however long they go without playing. Turn it off to let the run
consider them again.

The same tab shows the member's warning emails: the newest one, with its
status and the removal date of their open warning, whether an address is on
file, and **Access reminders**, which is Off when the member turned the emails
off. With warning emails on, a removal date more than 7 days past does not
show, because the next run starts the warnings again.
