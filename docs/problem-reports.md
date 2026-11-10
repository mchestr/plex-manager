# Problem reports

Members report a problem with a title (a copy that won't play, a bad picture, the wrong movie, missing episodes) from `/report`, and follow what happens to it. Every report goes to the server admin for now; automatic fixes come later and will run within limits.

The feature is off until the switch is on (`ProblemReportSettings.enabled`, off by default). While it is off, `/report` is a 404 and Help and Home don't link to it. Reports already made stay in each member's Your data.

## For members

- **Entry points:** Help, Report a problem links to `/report`, and the Home help card has a Report a problem row. The Discord links stay. There is no top-bar item.
- **The page**, top to bottom: **Watching now** (the member's own Plex streams, shown only while they stream), **Find a title** (a `?q=` search), **Recently watched** (their Tautulli history, newest first, one row per movie and one per show at its newest episode) and **Your reports**. Every list holds only movies, shows and episodes in libraries shared with the member. When Plex or Tautulli can't be read, its list says so and the rest of the page still loads.
- **The sheet:** a title opens a bottom sheet (`/report?item=<ratingKey>`, so a link can open it directly).
  - Step 1 asks what kind of problem, one full-width row per kind. Episode problems appear only for shows and episodes.
  - Step 2 asks which problem, the episode for a show, and an optional note (required for "Something else"). The button says what happens: **Send to the server admin**.
  - For a playback problem that may be the device (won't start, stops, glitches, out of sync, no sound), when Tautulli knows the member's last player, it asks "Does anything else play on Living Room?": **Yes, others play fine**, **No, nothing plays** or **I haven't tried**. The last two show playback tips.
  - For a blurry or glitching picture after a play that Plex converted, it first says "Your Plex app converted this video while you watched, which lowers quality and can cause buffering." with a link to the playback guide.
  - Back returns to step 1, and focus moves to each step's heading.
- **Already reported:** a title has at most one open report. The sheet then says "This title already has an open report: Sound is out of sync. With the server admin since Nov 6." with **Same problem, tell me when it's fixed** (follow it) and **It's something else** (report another problem, which is added to the open report for the server admin).
- **Your reports:** the member's reports and the ones they follow, with the status, the latest step and **Cancel report** while nothing has run on it.

The words for a report's status are in `lib/ui/status.ts` (`problemReport`): Sent, Fixing, Fixed, With the server admin, Closed (always with a reason). The problems, their kinds and the words members see are in `lib/problem-reports/taxonomy.ts`; web, Discord and the admin pages read them from there.

## Rules

`lib/problem-reports/service.ts` is the one entry point for the web and Discord:

- the switch must be on and the member entitled (`full`);
- a report or a follow spends `problem-report:create` (10 an hour) and `problem-report:create:day` (20 a day) per member;
- the title must be in a library shared with the member, checked on the server for every rating key (SEC-21, `lib/problem-reports/access.ts`): admins and the server owner see every library, anyone else needs plex.tv's share list to name the item's section;
- the title's type and details come from Plex, never from the request;
- one open report per title: `ProblemReport.activeKey` holds the title's Plex guid under a unique index until the report closes. A second report of the title joins the open one with an `ALSO_REPORTED` event, written after the failed insert;
- a member's `ALSO_REPORTED` event is written once: the same problem and note again, or a second follow, writes nothing;
- following checks the title against the member's libraries too;
- only the reporter can cancel, and only while the report is Sent or With the server admin. Cancelling works with the switch off or a lapsed membership, so a member can always withdraw their own report. Every way of closing a report clears `activeKey`, and closes it for the members who followed it too: they see it as Closed, Cancelled.

Each report records the answer to the device question and the evidence from Tautulli (`lib/problem-reports/evidence.ts`) on its `REPORTED` event, or on its `ALSO_REPORTED` event when it joins an open report: the member's last play of the title (the player's name, whether it was converted, when), and whether the title has played to the end for anyone since its file was added. Tautulli's IP address and device id are never read, so they are never stored. The member's Tautulli `user_id` is their Plex account id.

Member notes are plain text: format characters (bidi controls, zero-width spaces) are dropped, other control characters become spaces, and they are at most 500 characters (`lib/validations/problem-reports.ts`). Followers see status words only, never who else reported.

## Data

- `ProblemReport`: the reporter, the problem code and note, the title's rating key, guid (`titleKey`) and display fields, `activeKey`, the status, the server admin's notes (one the member sees, one internal) and dates.
- `ProblemReportEvent`: the timeline. `REPORTED`, `ALSO_REPORTED` (a follow, or a second member's problem and note) and `CLOSED` (with its reason) so far. `data` is parsed with Zod on read.
- `ProblemReportSettings`: the switch, one row with id `problem-reports`.

Removing a member deletes their reports, and their `ALSO_REPORTED` events on other members' reports, which hold their notes (`lib/members/erase-problem-reports.ts`, `docs/privacy.md`).

## MCP

The member actions (`reportProblem`, `followProblemReport`, `cancelProblemReport` in `actions/problem-reports.ts`) are MCP tools like every action. Their descriptions say that member text is untrusted.

## Testing

The E2E specs sign in as a member who doesn't own the server; the share list comes from the plex.tv mock (`e2e/README.md`, "Library access for a member").
