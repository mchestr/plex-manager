# Problem reports

Members report a problem with a title (a copy that won't play, a bad picture, the wrong movie, missing episodes) from `/report`, and follow what happens to it. Every report goes to the server admin for now; automatic fixes come later and will run within limits.

The feature is off until the switch is on (`ProblemReportSettings.enabled`, off by default), in the settings card at the bottom of **Automations > Problem reports**. While it is off, Help and Home don't link to `/report`, and the page shows only Your reports, to a member who made or follows one, who can still cancel theirs; for anyone else it is a 404. The server admin keeps every report, and reports stay in each member's Your data.

## For members

- **Entry points:** Help, Report a problem links to `/report`, and the Home help card has a Report a problem row. The Discord links stay. There is no top-bar item.
- **The page**, top to bottom: **Watching now** (the member's own Plex streams, shown only while they stream), **Find a title** (a `?q=` search), **Recently watched** (their Tautulli history, newest first, one row per movie and one per show at its newest episode) and **Your reports**. Every list holds only movies, shows and episodes in libraries shared with the member. When Plex or Tautulli can't be read, its list says so and the rest of the page still loads.
- **The sheet:** a title opens a bottom sheet (`/report?item=<ratingKey>`, so a link can open it directly).
  - Step 1 asks what kind of problem, one full-width row per kind. Episode problems appear only for shows and episodes.
  - Step 2 asks which problem, the episode for a show, and an optional note (required for "Something else"). The button says what happens: **Send to the server admin**.
  - For a playback problem that may be the device (won't start, stops, glitches, out of sync, no sound), when Tautulli knows the member's last player of the title, it asks "Does anything else play on Living Room?": **Yes, others play fine**, **No, nothing plays** or **I haven't tried**. The last two show playback tips. For a show, the question is about the show's last play, so it goes away when the member picks one episode.
  - For a blurry or glitching picture after a play that Plex converted, it first says "Your Plex app converted this video while you watched, which lowers quality and can cause buffering." with a link to the playback guide.
  - Back returns to step 1, and focus moves to each step's heading.
- **Already reported:** a title has at most one open report. The sheet then says "This title already has an open report: Sound is out of sync. With the server admin since Nov 6." with **Same problem, tell me when it's fixed** (follow it) and **It's something else** (report another problem, which is added to the open report for the server admin).
- **Your reports:** the member's reports and the ones they follow, with the status, the latest step and **Cancel report** while nothing has run on it. Once the server admin marks a report fixed or closes it, the member who reported it sees the admin's note there, as plain text. Followers see the status only, since the note is written to the reporter.

## For the server admin

- **Automations > Problem reports** is the first Automations tab, so the item and the phone tab bar open on it. The Automations badge says "N to review" for reports with the server admin; failed jobs keep priority.
- **The list** (`?status=`): Needs you (oldest first), Fixing, Fixed and Closed (newest first), each with its count. A row shows the title, the problem, who reported it (+N for the other members who reported or follow it), the status and when.
- **A report** (`/admin/problem-reports/<id>`): the title, the problem, the reporter and their note, a link to the title in the Plex web app, and the timeline: each step, who took it, a second member's problem and note, the answer about their player, and what Tautulli said when they reported it. Members' words are plain text, never Markdown.
- **Mark fixed** and **Close with a note** end an open report once (a second press is refused). Each takes a note the member who reported it sees on `/report` and an internal note only admins see. Ending a report frees the title for a new one.
- **Swaps need approval** is a switch on a member's admin page (`User.swapsNeedApproval`). It keeps automatic swaps of the copy for that member's reports waiting for the server admin, once swaps run on their own.

### Discord alerts

When the bot is on, a new report sends a text DM to every admin who linked Discord (`PROBLEM_REPORT_NOTIFY`, `lib/queue/jobs/problem-report-notify.ts`): the member, the title, the problem and a link to the report. A member's reports reach the admins at most once an hour: the first at once, and any in the next hour in one message when it ends (at most five listed, then a count). The job claims the reports (`ProblemReport.alertedAt`) before it sends, so two jobs never send the same report; an admin whose DMs are closed (Discord's 50007) is skipped without a retry, and a send that reached no admin for another reason releases the claim for a retry. An admin gets each alert at most once: when one admin's DM fails and another's goes out, the claim stays, so the first is not sent it again. A worker that stops between the claim and the sends loses that alert; the badge still counts the reports. The member's name and the titles go through `plainDiscordText` (`lib/discord/plain-text.ts`): no formatting, masked or bare links, mentions, bidi or zero-width characters, and messages go out with no allowed mentions. A join adds to a report the admins already know of, so it sends nothing. Without Redis there are no alerts; the badge still counts every report.

### Audit

- `PROBLEM_REPORT_CLOSED`: Mark fixed or Close, with the report id, the outcome and whether the member got a note, never a title or a note.
- `PROBLEM_REPORT_SETTINGS_CHANGED`: the switch, with its value before and after.
- `PROBLEM_SWAP_APPROVAL_CHANGED`: Swaps need approval, with the member and the new value.
- Reading reports is a read of members' content: the list writes `MEMBER_CONTENT_LISTED` and a report writes `MEMBER_CONTENT_VIEWED` for each member whose words it shows, with the surface `problem-reports`, at most once an hour per admin (and member).

The words for a report's status are in `lib/ui/status.ts` (`problemReport`): Sent, Fixing, Fixed, With the server admin, Closed (always with a reason). The problems, their kinds and the words members see are in `lib/problem-reports/taxonomy.ts`; web, Discord and the admin pages read them from there.

## Rules

`lib/problem-reports/service.ts` is the one entry point for the web and Discord:

- the switch must be on and the member entitled (`full`);
- a report or a follow spends `problem-report:create` (10 an hour) and `problem-report:create:day` (20 a day) per member, before the library check, so a rating key outside the member's libraries still spends one and the check can't be used to probe Plex;
- the title must be in a library shared with the member, checked on the server for every rating key (SEC-21, `lib/problem-reports/access.ts`): admins and the server owner see every library, anyone else needs plex.tv's share list to name the item's section;
- the title's type and details come from Plex, never from the request;
- one open report per title: `ProblemReport.activeKey` holds the title's Plex guid under a unique index until the report closes. A second report of the title joins the open one with an `ALSO_REPORTED` event, written after the failed insert;
- a member's `ALSO_REPORTED` event is written once: the same problem and note again, or a second follow, writes nothing;
- following checks the title against the member's libraries too;
- only the reporter can cancel, and only while the report is Sent or With the server admin. Cancelling works with the switch off or a lapsed membership, so a member can always withdraw their own report. Every way of closing a report clears `activeKey`, and closes it for the members who followed it too: they see it as Closed, with "The member who reported it cancelled it".

Each report records the answer to the device question and the evidence from Tautulli (`lib/problem-reports/evidence.ts`) on its `REPORTED` event, or on its `ALSO_REPORTED` event when it joins an open report: the member's last play of the title (the player's name, whether it was converted, when; for a show, its newest episode's), and whether the title has played to the end for anyone since its file was added (never said for a show, which has no file of its own). Tautulli's IP address and device id are never read, so they are never stored. The member's Tautulli `user_id` is their Plex account id. The member waits on these reads, so each is tried once, with a short timeout, and the report is saved without them when Tautulli is slow. The device answer is kept only for the problems that ask it, and only when the evidence names the player of that last play, so a stored answer is about the player the event names. The one exception is a member who starts the title on another player between opening the sheet and sending it: the evidence is read when they send, and then names that player.

Member notes are plain text: format characters (bidi controls, zero-width spaces) are dropped, other control characters become spaces, and they are at most 500 characters (`lib/validations/problem-reports.ts`). Followers see status words only, never who else reported.

## Data

- `ProblemReport`: the reporter, the problem code and note, the title's rating key, guid (`titleKey`) and display fields, `activeKey`, the status, the server admin's notes (one the member sees, one internal), when the admins' Discord alert claimed it (`alertedAt`) and dates.
- `ProblemReportEvent`: the timeline. `REPORTED`, `ALSO_REPORTED` (a follow, or a second member's problem and note), `FIXED` and `CLOSED` (with its reason: `cancelled` by the reporter, or `admin`) so far. `data` is parsed with Zod on read.
- `User.swapsNeedApproval`: the member's Swaps need approval switch.
- `ProblemReportSettings`: the switch, one row with id `problem-reports`.

Removing a member deletes their reports, and their `ALSO_REPORTED` events on other members' reports, which hold their notes (`lib/members/erase-problem-reports.ts`, `docs/privacy.md`).

## MCP

The member actions (`reportProblem`, `followProblemReport`, `cancelProblemReport` in `actions/problem-reports.ts`) and the admin actions (`resolveProblemReport`, `updateProblemReportSettings`, `setSwapsNeedApproval` in `actions/admin/problem-reports.ts`) are MCP tools like every action. The member actions' descriptions say that member text is untrusted.

## Testing

The E2E specs sign in as a member who doesn't own the server; the share list comes from the plex.tv mock (`e2e/README.md`, "Library access for a member"). One spec has the admin close a report with a note and the member read it on `/report`.
