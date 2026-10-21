> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 7: Rewind breadth, admin tooling and soft launch

**Goal.** Rewind Phase 3 (`design/rewind-2026-design.md` 13.1). Before the soft launch it delivers:
- the remaining eight pages (07, 08, 11 to 15 and 17), the pocket edition and the postcard, and the desktop spread with its Notes;
- the public share page with its OG card, and hiding a title;
- the admin season console with admin-audience generation on real data from 2026-11-20, preview and roll back, dry runs and preview mode, the gallery, and the Rewind settings section;
- ready notifications and view tracking, the accessibility and low-end performance passes, the operator runbook (P7.17), then the gallery review and the admin soft launch on 2026-11-27.

In the ship window, behind the season's opening, it delivers the remaining cards (P7.6) and the archive articles for stored years (P7.13). Until they land, non-core pages offer Copy link only and stored v1 and v2 years render through P0.14's `WrappedYearView`. Both are P0 requirements (FR-18, FR-1) delivered late with a fallback, which Appendix C decision 29 records. The deletion of the v2 viewer moved to January (P11.29), the eval results page to January (P11.30), and the playground swap (FR-42, P1) to the ship window (P8.8).

**Window.** 2026-11-10 to 2026-12-04. The phase passes the "Soft-launch release cut" milestone on 2026-11-24 and closes its pre-season part at the "Gallery signed off and admin soft launch" milestone on 2026-11-27:
- the gallery of the review fixtures is reviewed and signed off, and no P0 bug is open;
- log redaction (P4.16) is live;
- `rewindEnabled` is on with `rewindAudience = admins`, and admin issues have been generated on real data since 2026-11-20.

**Tracks.** The Rewind lane runs P7.8 from 2026-11-10, then P7.10, P7.9, P7.1, P7.2, P7.7, P7.3, P7.11, P7.14 and P7.15, then P7.16. The UI lane runs P7.12, P7.4 and P7.5, then P7.6 and P7.13 in the ship window from 2026-12-03, beside P6.1. The hardening lane writes P7.17's runbook. Each lane keeps at most two PRs open.

**What the soft launch needs.** P7.16 depends only on P7.11 (a gallery of at least the core pages), P7.12, P7.15 and P4.16. Everything that the season-open release needs, P7.8's audience payload and P7.14's notification fan-out included, merges by the 2026-11-24 release cut, so the soft-launch deploy exercises it.

**Critical path and float.** The steps with the least float before the release cut are P7.15 (1 day), P7.2, P7.11, P7.14 and P5.13 (2 days each), and P7.17 (due 2026-11-25, no float); the table in "How to use this plan" lists them all.

**Cuts, in order, if this phase slips.** Plan-level cuts come first, then the design's list (design 13.3), all through `rewindDisabledPages` or the features flags:
1. the final-cut batch adapters (former P8.6), already dropped for 2026;
2. P8.8's playground swap (FR-42 is P1); the v2 playground keeps working, and P0.19 stops it minting tokens;
3. the eval results page, already moved to January (P11.30);
4. P8.4's Edit card (FR-23, P1);
5. P7.6's non-core cards: those pages keep Copy link only (a departure from FR-18 that needs the owner's yes, decision 29);
6. then the design's list: People (08); Setup (13); Next year (17), first the picks and Sonarr parts; the race scrubber (keep autoplay and the static final frame); the square card format (already P2); desktop Notes beyond Top shows, the calendar and the centrefold.
The ten core pages (Bookends included), sharing, privacy and accessibility are never cut.

**Ordering that matters.**
- `lib/rewind/registry.ts`: P7.1 and P7.2 add eight entries, P7.3 adds `short-list` and `postcard`, P7.4 adds `notes()` and page 02's 2025 series, P7.5 adds `shareAlt()`, and P7.6 completes `share`. Each step edits only its own entries.
- `components/rewind/stage/story-stage.tsx` is extended by P7.3 (the cut), P7.4 (the spread chrome), P7.7 (Hide in the row sheet), P7.10 (preview mode), P7.14 (view tracking) and P7.15 (low-end mode). Rebase in merge order.
- `lib/queue/jobs/rewind.ts` gains P7.7's exclusion runs, P7.8's `REWIND_SEASON_PREPARE` and `REWIND_GENERATE_ALL`, P7.10's `REWIND_DRY_RUN` and P7.14's `REWIND_NOTIFY`. Each step adds its own job types to `JOB_TYPES`.
- `app/(app)/rewind/[year]/page.tsx`: P7.10 adds `?preview=`, P7.11 adds `page` and `still`, and P7.13 swaps the legacy branch in December.
- `next.config.js`: P7.5 adds `headers()` for `/rewind/s/*`; P7.10, P7.11 and P7.6 add `outputFileTracingIncludes`; P8.8 adds the `/admin/playground` redirect.
- Admin navigation: P7.8 adds Season and P7.11 adds Gallery to today's admin nav (`components/admin/shared/admin-nav.tsx`), and P6.1 carries both into `lib/admin/nav.ts` in December. P7.8 and P7.12 do not wait for P6.1 or P10.19: the console sits under today's admin layout, and the Rewind settings section goes on today's settings page.
- `AuditEventType` gains Rewind entries in P7.7, P7.8 and P7.9. Migrations: P7.7 (`RewindExclusion.title`, 2026-11-17) and, if P2.1 lacks it, P7.14 (a unique index on `RewindView`, 2026-11-20). These are the last Rewind migrations before the season.

### Step P7.1: Pages: Taste, People, The race, Records

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-16 to 2026-11-17. **Depends on:** P5.5.
- **Findings addressed:** RWV-11, RWP-18

**Objective.** Build pages 07 Taste, 08 People, 11 The race and 12 Records on the registry, each with a deterministic srSummary, a Table where the page has one, and an omission rule, so a member with thin data never sees an empty page. The race plays once and then holds its final standings.

**Guidance.**
- **Registry entries** use P5.5's entry type, with strict schemas in `lib/rewind/pages/{taste,people,race,records}.schema.ts`.
  - Fields and dwell follow design 4.2: Taste petrol for 8 s, People paper for 7 s, The race mint for 10 s, and Records peach for 8 s. The spot is `ink` on the colour pages and `arch-deep` on People.
  - Only Taste and The race have a `table` builder (design 4.6's list of chart pages). `share.facts` lists what P7.6's cards may print.
- **07 Taste** (`components/rewind/pages/taste.tsx`, design 4.3).
  - `select` returns null when genres cover under 60% of minutes (P2.8's flag). Genre names are the server's own Plex tags.
  - New `lib/rewind/viz/column.ts` draws one full-width bar per genre (at most 5) with its name and percentage: the top genre solid, the rest hatched. `decade-strip.ts` marks the median year with a numeral fitted by `fitLines`.
  - The 12-cell `taste.genreByMonth` strip drops out when that fact is missing, and the column and the decade strip then stand alone.
  - The headline template reads "Mostly drama, made around 2022", and the deck is `deck.taste`. The Table lists genres with minutes and shares, then the decades.
- **08 People** (`people.tsx`) is a billing block of names only, with no headshots. The No. 1 actor is a nameplate, the names are caps in Archivo width 62 weight 700, and the connectors are Newsreader italic. Directors appear for films only, and `select` returns null below 70% metadata coverage. People is first on the cut list, so the gallery review checks it first, and `rewindDisabledPages: ['people']` removes it without a deploy.
- **11 The race** (`race.tsx`, with the client island `race-animator.tsx`).
  - New `lib/rewind/viz/race.ts` turns P2.7's `race.frames[11][5]` into pure geometry: per-series `scaleX` keyframes, `translateY` re-order offsets (the rank in each frame times the row pitch) and the who-led strip segments.
  - The animator plays the 11 frames once, at 520 ms each, with `element.animate()` on refs: a 420 ms bar tween, a 360 ms re-order and the month clock as a stepped strip. That makes zero React commits during the run, so P5.4's commits-per-turn gate still holds.
  - A revisit, or reduced motion, renders the final standings and the who-led strip at once.
  - The headline is the race-events template ("Severance led for ten months. Then came November.", or the no-change variant). Titles sit above their bars and break after a colon. The Table lists cumulative minutes by month.
  - `select` returns null without 3 series of 60 minutes or more across 3 active months; the `single-title` fixture covers it. Leave the `rewind-race-scrubber` and `rewind-race-play` slots empty for P8.3.
  - **Stored data for the P1 scrubber.** Page 11's schema stores `frames` in the page data: one entry per month (11 during the season, 12 after the final cut) with the top five series' cumulative minutes, `ratingKey`s and display titles. P8.3's scrubber reads only these stored frames, so no member is regenerated for it under the freeze. `race.schema.test.ts` asserts the field on the heavy fixture and that each frame's minutes never shrink.
- **12 Records** (`records.tsx`) is a 2x2 box score built from P2.7's `sessions.ts` facts: the longest binge (3 episodes or more), most episodes in a day, the biggest week, completion, most paused and the latest start. Each cell is a fitted numeral and a label, chosen in catalogue order. `select` returns null with fewer than 2 qualifying cells. The "record" stamp marks the cell furthest above `aggregate.medians`, and appears only with 10 or more scored members.
- **Robustness (RWV-11).** Counts go through `Intl.PluralRules` in `lib/rewind/format.ts`, list keys are `ratingKey`s or names with their index, and ties use P2.7's `rank.ts`. Each srSummary names every number shown ("Drama 41%, comedy 22%, ...").
- **RWP-18.** These pages are the first to show genres, people, completion, binges and pausing: data the v2 pipeline downloaded and threw away.

**Tests.**
- `lib/rewind/pages/__tests__/{taste,people,race,records}.select.test.ts` run all 20 P2.10 fixtures, and each returns valid data or null:
  - Taste is null at 55% coverage and present at 60%, and People is null at 69%;
  - the race is null on `single-title` and on a two-series fixture;
  - Records is null with 1 qualifying cell, and a two-episode binge does not count.
- `lib/rewind/viz/__tests__/race.test.ts`: 11 frames, cumulative widths that never shrink, offsets that match each frame's rank, and deterministic output.
- `components/rewind/pages/__tests__/{taste,people,race,records}.test.tsx` run on `heavy`, `median`, `light` and `long-and-non-latin-titles`:
  - no "0 ..." string appears, "1 film" is singular, and no name splits inside a word;
  - the srSummaries match their snapshots;
  - the animator calls a mocked `Element.prototype.animate` on the first visit only, and reduced motion renders the final frame.
- Remove the four pages from P5.4's `PENDING_PAGES`, and generate baselines of the final state plus the race's frame at 2.6 s on a frozen clock.
- Extend `evals/rewind/recordings/hand/` with `deck.taste`, `deck.people` and `deck.records`, so P5.9's golden snapshots and P5.13's checks cover the new decks.

**Integration.** `selectPages()` picks the entries up in registry order, so the folios and cover lines renumber with no other change. P7.6 adds the Genre column, Billing block, Final standings and Records box cards, and P7.4's Notes show these pages' srSummaries. Each entry also gains an `article()` builder for P5.12's article mode, and P8.3 adds the race scrubber.

**Demo.** The heavy fixture's full issue grows to 14 pages. Taste reads "Mostly drama, made around 2022", and the race runs its 5.7 s sequence once, then rests on November; a second visit shows the final frame at once. Adding `people` to `rewindDisabledPages` renumbers every folio.

**Done when.**
- [x] Pages 07, 08, 11 and 12 render from the registry with schemas, srSummaries and omission rules, and Taste and The race have Table builders.
- [x] The race autoplays once with zero React commits during the run, then holds a static final frame, which reduced motion shows at once.
- [x] No page shows a zero count, a wrong plural or a split word on any of the 20 fixtures.
- [ ] The select, component and visual tests pass, and the golden recordings cover the new decks. (Select and component tests pass and the goldens snapshot the new decks; the visual baselines, including `heavy-race-2600ms.png`, are left for the coordinator's E2E run.)

(as merged: the race's page data is `series[]` (key and display title, final standing order) plus `frames[]` of `{ month, minutes[] (one per runner), leader (runner index or null) }`, so titles and keys are stored once rather than in every frame; P8.3's scrubber reads these. Records keeps the hand-checked page rule (2 of binge, day, completion and paused); the biggest week (5 h or more) and the latest start (11 PM to 4 AM) only fill the box. There was no `PENDING_PAGES`: the four pages left `LATER_PAGES` in `lib/rewind/registry.ts`. The hand recordings already held `deck.taste`, `deck.people` and `deck.records`; the golden snapshots now cover them, and `e2e/fixtures/rewind/*.v3.json` were regenerated with the new pages. `srSummary` takes no locale, so the race's month names and Records' paused minutes in summaries are en-US.)

### Step P7.2: Pages: Setup, Requests, Standing, Next year

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-17 to 2026-11-18. **Depends on:** P5.5.
- **Findings addressed:** RWP-06, RWV-11

**Objective.** Build pages 13 Setup, 14 Requests, 15 Standing and 17 Next year: the server act and the look ahead. Other members appear only as anonymous aggregates with 3 or more contributors, and no public surface carries a player name, an IP or a request title.

**Guidance.**
- **Registry entries** (design 4.2): Setup paper for 6 s, Requests lilac for 7 s, Standing sky for 7 s, Next year paper for 7 s. Setup and Standing have `table` builders. Setup and Next year declare no `share` entry, so `eligibleCards()` never offers them (FR-18).
- **13 Setup** (`setup.tsx`) uses template copy only ("92% direct play. Your setup is dialled in.").
  - Three `meter` graphics from P5.7's `meter.ts` show direct play, watching at home (as a percentage only) and 4K (when the cache has `videoResolution`). `setup.topPlatform` is a nameplate, with `topProduct` beneath it.
  - The data comes from P2.8's `devices.ts`, and `PlayEvent` has no `player`, `ipAddress` or `machineId` field to read. `select` returns null under 20 plays. Setup is second on the cut list.
- **14 Requests** (`requests.tsx`) is a receipt ledger with dotted leaders and a fitted total, under the headline "You asked for 27. You watched 15 of them." (RWP-06):
  - approved counts statuses 2 and 5, and available follows `media.status` (5 for films, 4 or 5 for series);
  - `requests.watched` comes from P2.8's join through `MediaMetadataCache.guids`;
  - declined requests get a ledger line, but never appear in the headline or the deck;
  - `select` returns null with 0 requests or without an Overseerr row, and request titles never enter `share.facts`.
- **15 Standing** (`standing.tsx`).
  - The headline names a percentile only in the top 50% ("Top 3%"). Otherwise it reads "You were one of 34 members who pressed play this year". The nameplate sits over a strip of one mark per member, with the member's mark solid.
  - The community box (dotted leaders) prints only P2.8's community facts with 3 or more contributors, plus `community.titlesAdded`.
  - Counts such as "one of 34" and the member strip stay in-app. They are not in `share.facts`, so P5.10's projection drops them, and P7.6's card prints only the percentile, at top 25% or better (FR-37).
  - `select` returns null below 5 members with Rewinds. The Table lists the member's percentile and the community facts.
- **17 Next year** (`next-year.tsx`) is a cinema-listings column, with dates in tabular numerals, built from `next.leftForLater`, `next.returning` and `next.picks`. Each pick's reason line is a template ("Because you watched ..."), so picks add no LLM slot.
  - New `lib/wrapped/sources/sonarr-calendar.ts` fills `next.returning`. It calls `getSonarrCalendar()` (`lib/connections/sonarr.ts:101`) through P2.3's client with a 10 s timeout and a Zod schema, for the generation date to 31 March of next year, and matches the member's top series by `tvdb://` guid. It runs only when a Sonarr row is active, and a failure omits the part (NFR-3).
  - Titles are `data-rw-interactive` links. Library titles open in the server's Plex web app through P10.21's item-link helper (`lib/ui/plex-links.ts`, created here if P10.21 has not merged). A returning season that is not on the server links to its Overseerr page when Overseerr is configured.
  - `select` returns null when all three lists are empty. For the cut list, `rewindDisabledPages` also accepts `next-year.picks` and `next-year.returning`, which drop those parts first (design 13.3); P7.12 lists them.
- **RWV-11.** Plurals go through `lib/rewind/format.ts`, tiny shares read "under 1%", keys are `ratingKey`s, and a zero line is omitted rather than printed.

**Tests.**
- `lib/rewind/pages/__tests__/{setup,requests,standing,next-year}.select.test.ts` run all 20 fixtures:
  - Setup is null at 19 plays, Requests on `no-overseerr`, and Standing on `solo-server` and below 5 members;
  - Next year is null with three empty lists, and the `next-year.picks` key drops only the picks.
- Privacy: a `// @ts-expect-error` line proves that Setup's selector cannot read `player`, and a key snapshot of each page's data finds no `player`, `ip`, `machine`, `email` or other member's name.
- Requests: statuses 2 and 5 count as approved, a declined request never reaches the headline, a film with `media.status` 4 is not available, and `plex://` guids are ignored.
- `standing.test.tsx`: the top-50% rule, "one of 34" in-app, and P5.10's projection of page 15 carrying no member count.
- `lib/wrapped/sources/__tests__/sonarr-calendar.test.ts` uses recorded responses: tvdb matching, a timeout that omits the part, and a malformed body rejected by Zod.
- Component tests and baselines for the four pages on `heavy`, `median` and `no-overseerr`, which also leave `PENDING_PAGES`.

**Integration.** `selectPages()` renumbers the issue. P7.6 adds the Requests and Percentile cards, P7.12 exposes the page and part keys, and each entry gains an `article()` builder for P5.12. P7.17's runbook notes that Sonarr is optional.

**Demo.** On the heavy fixture, Requests reads "You asked for 27. You watched 15 of them." and Standing says "Top 3%". The `solo-server` fixture omits Standing with gap-free folios, and adding `next-year.picks` to `rewindDisabledPages` leaves only "Unfinished business".

(as merged: `PENDING_PAGES` is `LATER_PAGES` in `lib/rewind/registry.ts`. The Sonarr match runs in `lib/wrapped/stats/next-year.ts` over `MemberSources.premieres` (optional), which `read-inputs.ts` fills from `fetchSeasonPremieres()` in `lib/wrapped/sources/sonarr-calendar.ts` when `RewindContext.sonarr` is set; `getSonarrCalendar()` gained an `includeSeries` option and keeps `serviceFetch`'s default 10 s timeout. `lib/ui/plex-links.ts` (`plexItemHref`, `overseerrSeriesHref`, `ItemLinks`) was created here for P10.21; `lib/rewind/item-links.ts` reads the machine id, cached 24 h under `plex-identity`, into the optional `IssueContext.links`. `NEXT_YEAR_PARTS` in `lib/rewind/pages/next-year.ts` holds the part keys P7.12 lists. Page 15's `share.facts` is the percentile only, so `standing.members` no longer prints even with `rewindPublicCounts`. The requests headline now drops "You watched 0 of them". Visual baselines for the four pages were not generated: the coordinator regenerates them with the phase.)

**Done when.**
- [x] Pages 13, 14, 15 and 17 render with schemas, srSummaries and their omission rules.
- [x] Setup is template-only with no path to player names, and Requests counts through cached guids with the corrected statuses.
- [x] Standing's percentile comes from the server-wide pass, community facts need 3 or more contributors, and counts stay in-app.
- [x] Next year's parts can be cut on their own, and Setup and Next year offer no card.
- [ ] The select, component and visual tests pass on all fixtures. (Select and component tests pass; visual baselines pending.)

### Step P7.3: Pocket edition, Short list and postcard

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-11-23 to 2026-11-23. **Depends on:** P5.9, P5.7.
- **Findings addressed:** RWP-19, RWV-11

**Objective.** Light viewers get a six-page pocket edition and very light viewers a one-page postcard, both template-only, and any member can pick the pocket cut on a full issue's cover. Late joiners are told their first Rewind arrives next year, and none of these paths runs a paid generation (RWP-19).

**Guidance.**
- **Editions** (design 4.5). P5.9's `edition.ts` already chooses the edition and writes template copy. New `lib/rewind/editions.ts` exports `pagesForCut(rewind, cut)`:
  - `full` returns the stored selection;
  - `pocket` returns the cover, the number, Short list, the clock or the calendar, the centrefold and the back cover, numbered 1 to 6;
  - Short list and the habit page are derived from the stored facts at render time, so a full-issue member who picks the pocket cut keeps their LLM copy.
  - The design does not fix the clock-or-calendar rule. Proposed: the calendar when `streak.longest.days` is 3 or more, else the clock when it is eligible, else the calendar's active-dates row. Confirm it at the gallery review (P7.16).
- **Short list** (registry type `short-list`, pocket only, `pocket-short-list.png`):
  - films and series merged into the top 3 titles of any type through `rank.ts`;
  - the No. 1 as a nameplate, with its full-colour poster or the hero-size title card;
  - minute-level numbers ("48 minutes"), and `tz.note` under the clock time it prints.
  It reuses P5.6's list rows. The pocket note follows `copySource` through P5.8's template.
- **Postcard** (registry type `postcard`, `postcard.tsx`): one paper page reading "A quiet year on {serverName}".
  - It shows the member's total in minutes when there is one, three titles that 3 or more members watched (from `aggregate.titles` viewer counts, with no names), and "Browse the library", which opens the server's Plex web app.
  - Members with no plays and no earlier Rewind see it without the minutes line. The player treats it as a single page in the `ended` state.
- **The cut** (FR-4). P5.5's cover dispatches `CHOOSE_CUT` with `full` or `pocket`. The stage swaps its page list to `pagesForCut()`, and the folio, progress and Contents renumber. Pocket members see only the pocket button. The choice is kept in `sessionStorage` under `rewind:cut:<year>` (in try/catch), so a reload resumes the same cut.
- **Late joiners** (design 4.5, GAP-45).
  - `lib/wrapped/pipeline/late-joiner.ts` `isLateJoiner(member, year, zone)` is true when the first lifetime play (`member.since`), or else `User.createdAt`, falls on or after 1 October in the member's Rewind zone. It uses P3.10's calendar-aware date arithmetic.
  - P5.9's `eligibility.ts` gains the skip reason `JOINED_LATE`, and P6.9's card shows its `not-eligible` state, "Your first Rewind arrives next year".
- Pocket pages reuse the core entries' rules, so the pocket edition never shows a zero count either (RWV-11).

**Tests.**
- `lib/rewind/__tests__/editions.test.ts`: the `light` fixture gives six pages in order, a full-issue fixture's pocket cut keeps its LLM copy, and the habit rule takes each branch.
- `lib/wrapped/pipeline/__tests__/late-joiner.test.ts`: 30 September 23:59 and 1 October 00:00 in Los Angeles and in Sydney fall on either side, under `TZ=UTC`.
- `edition.test.ts` additions: the postcard and pocket fixtures make zero LLM calls with `copySource: 'template'`, and `JOINED_LATE` skips without a call.
- Component tests: Short list with the long accented French title, and the postcard with and without minutes, never printing "0 minutes".
- `e2e/rewind/editions.spec.ts` (chromium and webkit): choosing `rewind-cut-pocket` as the heavy member shows "01/06" in the folio, and the light member's cover offers only the pocket button.
- Baselines for Short list and the postcard.

**Integration.** P6.9's RewindCard reads the page count from `pagesForCut()`, P7.6 adds the Short list and postcard cards, P5.12's article mode renders the member's own edition, and P7.15's passes include the pocket fixture.

**Demo.** The `light` fixture opens on "The pocket edition" and plays its six pages in about 40 seconds. The heavy member picks "Pocket edition" and gets six pages with their own LLM decks. A member whose first play was on 3 October sees "Your first Rewind arrives next year" on home.

**Done when.**
- [ ] The pocket edition has six pages, including the merged Short list with its `tz.note`, and the postcard lists community titles without names.
- [ ] The cover's cut choice switches between the editions and renumbers every folio.
- [ ] Late joiners are skipped with `JOINED_LATE` and see the next-year message.
- [ ] No pocket, postcard or late-joiner path makes an LLM call, and the tests pass.

### Step P7.4: Desktop spread and Notes

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-23 to 2026-11-24. **Depends on:** P5.7.
- **Findings addressed:** RWV-04

**Objective.** On desktop every page becomes a magazine spread, with act tabs, grouped progress, a contents rail, labelled previous and next buttons, the framed artboard and a Notes column that extends the page. The same page slots and player drive it, so the phone story and the spread cannot drift apart.

**Guidance.**
- **When** (design 4.7, FR-17): at `(min-width: 1024px) and (min-aspect-ratio: 4/3)`. The switch is CSS only: the stage renders both chrome variants and a media query shows one, so there is no hydration mismatch and no layout shift. Tablets in portrait keep the phone stage at up to 1.4x.
- **Layout** (`desktop-top-shows.png`). New components in `components/rewind/desktop/`, each under about 250 lines:
  - `spread-top-bar.tsx`: the brand from `rewindName(year)`; the act tabs (Front, Features, Habits, Server, Centrefold, Back) as a `nav` of buttons that jump to each act's first selected page, with `aria-current` on the current act; and labelled Pause, "Share this page", Settings and Close buttons;
  - progress segments grouped by act, still `aria-hidden`;
  - `contents-rail.tsx`: every selected page with its folio and registry name, the current one marked by a 3 px ink bar and `aria-current="page"`, and at its foot the legend "Letter keys work while the page has focus. Turn them off in Settings.";
  - `spread-nav.tsx`: large previous and next buttons labelled with their destinations ("04 Guess", "06 Top films");
  - the artboard framed in ink with crop marks, at `--u = min(1.1, (100dvh - 140px) / 693, columnWidth / 390)`. `lib/rewind/stage/fit-stage.ts` gains `fitSpread({ vw, vh, railW, notesW })` for it, which gives 1.1 at 1440x900 and about 0.9 at 1366x768.
- **Notes column** (`notes-column.tsx`).
  - Registry entries gain an optional `notes(data, facts)` builder that returns P5.12's `ArticleBlock`s, so Notes reuse the article tables.
  - The P0 Notes are:
    - Top shows: every series as a `<table>`, with the counting rule from the templates ("Counted from 1 January to 30 November in America/Chicago, the server's time zone. Rewatches count; trailers and extras do not.");
    - the calendar: minutes per day, one table per month (P8.3 adds the roving-focus grid);
    - the centrefold: the shortlist with its "Why this?" reasons and the 24-hour table.
  - Every other page shows its `srSummary` as a paragraph (F11). P8.4 adds Notes for the other seven core pages.
- **Stored data for P8.4.** Page 02's schema and `select()` gain `lastYearDaily`: 2025's daily minutes over the same window, from P2.4's `fetchLifetime()`, or absent when the member has no 2025 history. P8.4's Compare with 2025 and the page-02 Notes read only this field, so nothing is regenerated for them under the freeze. `number.schema.test.ts` asserts it on the heavy fixture and its absence on a member who joined in 2026.
  - "Show as table" (`rewind-notes-table-toggle`) swaps the Notes body for the page's own `table()` output. On desktop, T toggles it instead of opening the Table sheet.
  - The share formats line ("Story card, 1080 by 1920") sits at the foot.
- **Input.** Clicks on the artboard's left 30% and right 70% still turn pages. The keymap is unchanged and stays scoped to the stage region (the artboard and its chrome), so arrow keys inside the rail or the Notes scroll them instead of turning pages.
- **RWV-04.** Nothing on the spread scrolls sideways and titles keep their fitted lines. Only the Notes column scrolls, vertically.

**Tests.**
- `lib/rewind/stage/__tests__/fit-spread.test.ts`: 1440x900 gives 1.1, 1366x768 about 0.9, and 1024x768 stays at 0.8 or more.
- `components/rewind/desktop/__tests__/*.test.tsx`:
  - act tabs jump to the first selected page of each act and skip empty acts;
  - the rail sets `aria-current`, and the previous and next labels name their destinations;
  - T toggles "Show as table", and Esc still closes.
- `notes-column.test.tsx`: Top shows lists every series with the counting rule, and a non-P0 page shows its srSummary.
- P5.4's `rewind-visual-desktop-*` projects add 1366x768. `e2e/visual/rewind.spec.ts` snapshots every built page of the heavy and median fixtures at 1440x900 and 1366x768 on chromium and webkit, and asserts `document.documentElement.scrollWidth <= innerWidth`.
- `e2e/a11y/rewind.a11y.spec.ts` runs axe on the spread at 1440x900.

**Integration.** The spread is the stage's desktop chrome, so P7.1 to P7.3's pages appear in it with no extra work. P8.3 adds the calendar grid to the Notes, P8.4 adds the remaining Notes, and P7.15's passes include the spread.

**Demo.** At 1440x900, Top shows matches `desktop-top-shows.png`: the rail lists "16 Centrefold", "Show as table" swaps the Notes, and "06 Top films" turns the page. Resized to 1366x768, the artboard shrinks to about 0.9 without re-breaking a line.

(as merged: the registry's builder is `notes(data, facts, { locale, zone })` and `lib/rewind/notes.ts` `pageNotes()` falls back to the srSummary; `StoryStagePage.notes` carries the blocks and `StoryStage` takes `serverName` for the brand. Top shows' "every series" needed stored data too: `TopShowsData.more` (optional) holds series 6 on with title, minutes and episodes, from the new `TitleStats.moreSeries`; P7.7's hiding must drop hidden titles from `more` as well. Page 02's field is `lastYearDaily` (optional), from `totals.minutes2025`. The switch is the `rw-spread:` custom variant in `app/globals.css` (`SPREAD_QUERY`); `useFitStage` writes `--rw-u-story`, `--rw-u-spread`, `--rw-rail-w` and `--rw-notes-w`, and the stage's classes pick `--u` by media query. Spread controls have their own test ids (`rewind-spread-*`, `rewind-rail-item`, `rewind-notes*`); inside `[data-rw-scroll]` the keymap leaves the scroll keys alone. 1366x768 is a second viewport in the desktop visual projects' loop rather than a new project. E2E, visual and axe runs and the new baselines are left for the coordinator.)

**Done when.**
- [x] At 1024 px and wider (aspect 4:3 or wider), every page is a spread with act tabs, the contents rail, labelled previous and next buttons and the framed artboard.
- [x] Notes hold the P0 Notes for Top shows, the calendar and the centrefold, and the srSummary on every other page.
- [x] The switch is CSS only, with no layout shift and no horizontal scroll. (CSS only by construction; the scroll-width assertion runs with the visual suite.)
- [ ] Visual tests pass at 1440x900 and 1366x768 on chromium and webkit. (Specs written; baselines pending the coordinator's run.)

### Step P7.5: Public share page and OG card

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-20 to 2026-11-23. **Depends on:** P5.11.
- **Findings addressed:** RWV-05, SEC-16, BP-35, UI-16, UI-39

**Objective.** Replace the moved v2 share page with the Rewind share page. It is in the Rewind theme, outside the authenticated layout, and shows only the published cards, with an owner banner, branded 404, 503 and 429 states, and an OG card built from the first published page. Surviving v2 tokens still open through the v2 projection until the season closes.

**Guidance.**
- **Lookup** (SEC-16). Extend P0.11's `getShareSafeRewind(token)` in `lib/wrapped/data/get-share-safe.ts` (still wrapped in `cache()`). It returns one of:
  - `{ kind: 'v3', share, shareId, wrappedId, ownerUserId, assetKey, year, expiresAt }`, found by `sha256(token)` on `RewindShare.tokenHash`, refused when revoked, rotated or expired or when the row is not a completed v3 Rewind, and projected with P5.10's `toShareSafe()` and `loadShareContext()`;
  - `{ kind: 'v2', ... }` for a surviving `PlexWrapped.shareToken`, projected with P0.8's `toShareSafeV2`, only while P2.2's `getSeasonState()` says the season is open;
  - `null`, also for every token while `rewindPublicLinks` is off (no rows are deleted). Database errors throw.
- **Page.** `app/rewind/s/[token]/page.tsx` (P5.1 moved P0.11's page here) renders inside `RewindScope`, on the first published page's field, instead of the neon starfield (UI-16, RWV-05). Move P5.1's `fonts.ts` to `lib/rewind/fonts.ts`, so this route and the admin preview import it too.
  - The masthead reads "{brand} Rewind 2026", or "Rewind 2026" when `brand` is null.
  - The published cards are `<img>`s from `/api/rewind/card/s/{assetKey}/{page}`, with `width` and `height`, in a snap-scroll row on phones and three across from `lg`. Their alt text comes from a new registry `shareAlt(projectedPage)`, built only from the projection.
  - "Shared by Mike" appears only when signed, else "Shared by a member of {brand}" or "Shared from Rewind 2026". Signed-in members see "Open your own Rewind".
  - A v2 share renders its stripped summary (totals and the top-five lists) as a short paper article without cards. `WrappedShareSummary` is no longer used.
- **Owner banner** (`components/rewind/share/owner-banner.tsx`, `rewind-share-owner-banner`), for the share's owner: "This page is public until 31 Jan 2027." with "Change cards" (to `/rewind/{year}?sheet=share`), "Rotate link" and "Stop sharing". Rotate and Stop are `ConfirmDialog`s that call P5.11's `rotateRewindShare` and `disableRewindShare`; Rotate shows the new URL once, with Copy. A v2 share offers only Stop sharing, through P0.8's `disableWrappedShareLink`.
- **States.**
  - Unknown, revoked, rotated or expired tokens call `notFound()`, which renders a new `app/rewind/s/[token]/not-found.tsx` on paper: "This Rewind is no longer shared", revealing nothing else (BP-35; P10.17 adds the app-wide `not-found.tsx`).
  - A page cannot set 429 or 503, so `proxy.ts` handles both for `/rewind/s/:path*`. It applies P0.11's `rw:share-page:<ip>` limit (60 per minute, moved out of the page body) and a 2 s `SELECT 1` probe, cached for 5 s. It answers with the static branded page in new `lib/rewind/share/status-html.ts` ("This Rewind couldn't load. Try again in a moment.", with a Try again link): 429 when limited, and 503 with `Retry-After: 30` when the probe fails. An error during render reaches `error.tsx`, which uses the same copy.
  - The page cannot set the 404 status either (open item from P0.11's review). `app/loading.tsx` streams every page, and P10.17 keeps a root loader, so `notFound()` goes out with status 200. P0.11 therefore looks the token up in `proxy.ts`: a well-formed `/wrapped/share/<token>` whose row is missing or not `completed` is rewritten to the same page with status 404 (one indexed read of `status`; a failed read lets the request through to the page's own lookup and `error.tsx`). Move that check to `/rewind/s/:token` with the same rule as `getShareSafeRewind` (the hashed v3 lookup, refused when revoked, rotated or expired, and the v2 fallback). Run it after the `rw:share-page` limit and the probe, so a limited visitor gets the 429 and costs no lookup: neither this check nor `generateMetadata` nor the page runs for them. (Phase 0's review already moved the `rw:share-page` point into `proxy.ts`, before the lookup; a limited visitor gets the busy page through the `x-rewind-share-busy` request header, `lib/wrapped/share-page-limit.ts`.) The revoked-link 404 in the E2E below depends on this check, not on `notFound()`.
- **Headers and metadata** (UI-39). `next.config.js` `headers()` adds `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` for `/rewind/s/:path*`. `generateMetadata` sets `robots: { index: false, follow: false }`, a title without the owner's name unless signed, `ogText` as the description, and `openGraph` and `twitter` (`summary_large_image`) images at `/api/rewind/card/s/{assetKey}/{firstPage}?size=og`. A v2 share uses P3.9's default `app/opengraph-image`, so no image URL ever carries a token.
- **OG card** (design 6.7). New `lib/rewind/cards/og.tsx` serves `size=og` (1200x630) on both card routes; the share route takes only `size` from its query.
  - When page 16 or 18 is published, it uses the centrefold layout of `card-og.png`.
  - Otherwise it is a type-only preview of the first published page on that page's field: the masthead, the page name, the card headline and at most two of that page's published facts.
- **Visits.** The page body calls P5.11's `recordShareVisit(shareId, ip)` inside `after()`. v2 views keep P0.11's visit row.
- **Deletions.** `app/api/wrapped/og-image/route.tsx` and the JSON route `app/api/wrapped/share/[token]/route.ts`, with their tests; nothing calls them once the page reads the database.

**Tests.**
- `lib/wrapped/data/__tests__/get-share-safe.test.ts`, extending P0.11's: the hashed v3 lookup; null for revoked, rotated and expired rows and while public links are off; a v2 token that works before the season close and not after; a database error that throws.
- `__tests__/app/rewind-share-contract.test.ts` publishes only page 05 of the heavy fixture. The page HTML, `generateMetadata` and the OG response contain no archetype name, no `time.totalHours` display and no percentile, and no key matches P5.10's forbidden-key pattern.
- `__tests__/proxy-share.test.ts`: the 61st request from one IP gets 429 with the branded body, a failing probe gives 503 with `Retry-After: 30`, and other routes are untouched.
- `lib/rewind/cards/__tests__/og.render.test.tsx`: the centrefold layout when page 16 is published, the type-only layout otherwise, and no name when unsigned.
- `e2e/rewind/share-page.spec.ts` (chromium, webkit and firefox) extends P5.11's spec:
  - a logged-out visitor sees only the published cards, and the response carries `X-Robots-Tag`;
  - the owner sees the banner, and after a rotate the old URL returns 404 at once;
  - a revoked link shows "This Rewind is no longer shared" with status 404, and an old `/wrapped/share/<v2 token>` lands here;
  - axe at wcag22aa finds 0 violations.
- Visual baselines of the page at 390x844 and 1440x900, and of the 404.

**Integration.** P5.1's redirect brings old links here, P7.6's cards fill the page, and P7.7's hidden titles leave it at once through the projection. P11.18 removes the v2 branch after the season, and P7.17's runbook documents the 429 and 503 states.

**Demo.** Paste a link that publishes only Top shows into Discord: the unfurl shows "Top shows" and the No. 1 title, with no archetype or hours. Open it signed out (cards only, no name), then as the owner (the banner). Rotate it and reload the old URL: "This Rewind is no longer shared", with status 404.

**Done when.**
- [x] `/rewind/s/[token]` renders outside `(app)`, in the Rewind theme, and shows only the published cards.
- [x] noindex is set in headers and metadata, and the owner banner offers Change cards, Rotate link and Stop sharing.
- [x] Unknown, revoked, rotated and expired tokens get the branded 404, rate-limited visitors get 429, and database failures get 503 with `Retry-After`.
- [x] Surviving v2 tokens render through the v2 projection until the season closes.
- [x] The 1200x630 OG card comes from the first published page, and the page-05-only contract test passes.

(as merged: the proxy gate is `lib/rewind/share/share-gate.ts` and the token rule `lib/wrapped/data/share-token.ts` (`shareTokenKind`, `v2LinksOpen`: v2 tokens open while `getSeasonState().seasonYear <= 2026` and before its `closesAt`); the busy header and `lib/wrapped/share-page-limit.ts` are gone. The probe is a one-row Prisma read, not raw `SELECT 1`. The OG card is `size=og` on both card routes for every page (`OgCard`); the metadata points at `ogPage()`, which prefers the centrefold, then the back cover, else the first published page; `CARD_RENDERER_VERSION` is 2. The web fonts moved to `lib/rewind/fonts.ts` and `lib/rewind/web-fonts/`. `RewindScope` takes an optional `archetype`. Deleting the v2 OG route also removed the v2 viewer's card download (`ShareCardDownload`) and `WrappedShareSummary`. The share page lists only pages with a card (`eligibleCards`), so P7.6's cards appear with no page change. `e2e/rewind/share-page.spec.ts` runs on the new `rewind-e2e-firefox` project too; it and the visual baselines were not run here.)

### Step P7.6: Remaining cards

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-12-03 to 2026-12-04. **Depends on:** P5.11, P7.1, P7.2.
- **Findings addressed:** RWV-06

**Objective.** Give every eligible page its own 9:16 card (FR-18, RWV-06), and make `eligibleCards()` list them under the current options. Titles outside the Rewind font subset print in Noto instead of falling back to a title-free template. This lands in the ship window (2026-12-02 to 12-04). Until then the share sheet lists only P5.11's core cards, and non-core pages hide "Share this page" and offer Copy link from the sheet; that late delivery of a P0 requirement is Appendix C decision 29. The Edit card (FR-23, P1) moved to P8.4.

**Guidance.**
- **Cards** go in `lib/rewind/cards/` and register in `index.ts` (design 6.4). Each is re-laid out in the 1080x1340 safe zone from `lib/rewind/viz` geometry inside P5.10's frame:
  - `bookends.tsx`, `top-films.tsx`, and `guess-teaser.tsx` ("Guess my No. 1", three poster or title-card tiles, never the answer);
  - `calendar.tsx`, only with `dailyDetail` (FR-35);
  - `taste.tsx` (Genre column), `people.tsx` (Billing block, names only) and `race.tsx` (Final standings, the static final frame);
  - `records.tsx` (Records box, with the stamp only at 10 or more scored members) and `requests.tsx` (counts only, never request titles);
  - `standing.tsx` (Percentile, only at top 25% or better and only as a percentage);
  - `short-list.tsx` and `postcard.tsx` (no numbers, design 4.5). These two are missing from design 6.4's list, but FR-18 covers every page except Setup and Next year, which get none.
- **`eligibleCards(rewind, options)`** (P5.11) becomes the full rule set. A card is listed only when its page is selected, its own conditions hold under the options and the admin flags, and its titles are not all hidden. The heavy fixture gets 15 cards with Daily detail off and 16 with it on (design 6.4). The share sheet's page picker and P8.4's Save all read this list.
- **Safe-mode titles** (design 4.9).
  - Commit the static Noto TTFs under `lib/rewind/cards/fonts/noto/` with their OFL licences, and record them in `THIRD_PARTY.md`.
  - `lib/rewind/cards/noto.ts` picks faces by Unicode script (Han, Hiragana and Katakana, Hangul, Arabic, Hebrew, Devanagari, Thai, Cyrillic, Greek and Vietnamese). It cuts each face to the card's glyphs with `subset-font` (harfbuzzjs), cached at `${REWIND_CACHE_DIR}/fonts/{sha1(face, glyphs)}.ttf`.
  - A title is in safe mode when P2.13's `metrics.json` coverage lookup fails. It prints at a fixed size, with balanced word breaks chosen before rendering and set `whiteSpace: 'nowrap'`. P5.10's title-free fallback is removed.
  - Add the folder to `outputFileTracingIncludes` for both card routes in `next.config.js`, so the standalone build copies it, and add the Noto file hashes to `CARD_VERSION`.
- Every card passes P5.10's Satori lint rule and tree test, and an unsigned card never contains the first name.

**Tests.**
- `lib/rewind/cards/__tests__/cards.render.test.tsx` renders every card on `heavy`, `median`, `light` and `extreme`:
  - the guess teaser never contains the No. 1 title, and the requests card holds no request title;
  - the percentile card is absent at top 26%, and the calendar card requires Daily detail;
  - unsigned cards have no first name in any text node.
- `eligible-cards.test.ts`: 15 and 16 for heavy, the pocket and postcard lists, and a fully hidden top list removing its card.
- `noto.test.ts`: a Japanese and a Romanian title pick the right faces, the subset holds exactly the glyphs used, and a second render hits the cache.
- `e2e/visual/rewind-cards.spec.ts` (design 12) renders every card of the heavy, median, pocket and extreme fixtures through the real owner route and a share link. It compares them with pixelmatch at a 0.5% threshold, and the owner and link PNGs must match.

**Integration.** P7.5's share page shows these cards, P7.11's gallery lists them as they merge, and P8.4's "Save all {n} cards" and Edit card build on `eligibleCards()`. The PR records NFR-10 timings for the cards with art. Card changes after 2026-12-01 change no fact, slot or prompt, so the freeze lock (P8.1) is untouched; the `CARD_VERSION` bump re-renders cards on demand.

**Demo.** The heavy member's share-sheet picker lists 15 cards. A shared Top films card with a Japanese title prints it in Noto Sans JP.

**Done when.**
- [ ] Every eligible page except Setup and Next year has a card, and `eligibleCards()` returns 15 for the mock member with Daily detail off.
- [ ] Safe-mode titles render in Noto subsets on cards, and the standalone build ships the fonts.
- [ ] Pixelmatch baselines pass for the owner and link renders.

### Step P7.7: Hide and unhide a title

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-16 to 2026-11-17. **Depends on:** P5.10, P5.9.
- **Findings addressed:** none (design or research item)

**Objective.** A member can hide a title from their Rewind and bring it back (FR-7). A hidden title leaves every public card, the share page and the OG card at once, and every in-app list after a regeneration with no LLM call, while still counting toward the totals.

**Guidance.**
- **Actions.** New `actions/rewind-exclusions.ts` on P4.3's action helper (design 9.3) exports `hideRewindTitle({ year, ratingKey, kind })` and `unhideRewindTitle(...)`:
  - Zod input: `ratingKey` matches the poster proxy's regex, and `kind` is `film` or `series`;
  - a session check, plus ownership: the key must appear in the member's own completed Rewind, found by a registry helper `ratingKeysIn(rewind)` over page data and facts;
  - `consume('rw:hide', userId)` at 20 per day, added to P0.10's `LIMITS`. There is no entitlement check, because hiding is a privacy action (FR-51);
  - one transaction creates or deletes the `RewindExclusion` and increments `RewindPrefs.exclusionsVersion`, upserting the prefs row;
  - then it enqueues `REWIND_GENERATE_USER` with `kind: 'member'` and `copyPolicy: 'no-llm'`, exempt from the `rw:gen` limit. The deduplication id `rewind:hide:{year}:{userId}` and a 5 s delay collapse a burst of hides into one run;
  - it writes the audit entries `REWIND_TITLE_HIDDEN` and `REWIND_TITLE_UNHIDDEN` with the key and kind, never the title.
- **Titles for the unhide list.** Design 7.10's `RewindExclusion` has no title, and the regenerated Rewind no longer contains it. Migration `rewind_exclusion_title` adds `title String? @db.VarChar(200)`, copied from the member's own page data at hide time. It is private and never projected.
- **The job** in `lib/queue/jobs/rewind.ts`:
  - when another run holds the per-member lock, an exclusion job does not end as `skipped`; it delays itself by 30 s with BullMQ's `DelayedError`, up to 10 times;
  - after its write, it compares the `exclusionsVersion` it read with the current one, and re-enqueues itself when a hide arrived mid-run;
  - P5.9's `no-llm` policy keeps every slot whose identity facts did not change and templates the rest, so hiding the No. 1 series replaces only the slots that named it.
- **At once.** P5.10's `loadShareContext` reads `RewindExclusion` at projection time, and `exclusionsVersion` is part of the card cache key, so public cards, the share page and the OG card drop the title on the next request.
- **UI.**
  - P5.6's row sheet (Top shows, Top films) and the Short list rows gain "Hide this title" (`rewind-hide-title`). It opens a `ConfirmDialog`: "Hide {title} from your Rewind? It still counts toward your hours, and it leaves your cards and public link now."
  - On success the sheet reads "Hidden. Your pages update in about a minute." and refreshes through P2.17's `useRewindStatus`.
  - P5.3's Settings sheet gains "Hidden titles" (`rewind-hidden-titles`), with "Unhide" (`rewind-unhide-{ratingKey}`) beside each.

**Tests.**
- `actions/__tests__/rewind-exclusions.test.ts`:
  - another member's key, and a key outside the member's Rewind, are refused; the 21st hide in a day is limited;
  - a lapsed subscriber can still hide;
  - one transaction writes the row and bumps the version, and the enqueue uses `no-llm`, the dedup id and no `rw:gen` point;
  - with Redis down, the action returns the FR-50 error and writes nothing.
- `lib/queue/jobs/__tests__/rewind-exclusion-regen.test.ts`:
  - a held lock delays the job instead of skipping it, and a version bump mid-run triggers one more run;
  - hiding the No. 1 series makes no LLM call, re-templates only the slots whose identity facts changed, and leaves the totals unchanged.
- `lib/wrapped/data/__tests__/share-safe.test.ts` adds a hide between two projections: the title and its poster key disappear, and the card cache key changes.
- `e2e/rewind/hide-title.spec.ts` (chromium and webkit) replaces P5.4's fixme. It hides the No. 1 series from the row sheet and loads the member's public share page in a fresh context, where the title and its card art are already gone. With `TEST_REDIS_URL` and a worker in CI, the in-app list drops the title within 60 s, and Unhide brings it back.

**Integration.** P7.6's `eligibleCards()` drops a card whose titles are all hidden, P7.8's member table shows the regeneration, and P8.5's final cut keeps the exclusions. P11.13 deletes exclusions with the member.

**Demo.** Hide "Severance" from Top shows. On reload, the public link's Top shows card no longer names it. About a minute later the in-app page shows the new No. 1 with a template deck, and page 02's hours are unchanged. Unhiding it from Settings brings the old deck back.

**Done when.**
- [ ] `hideRewindTitle` and `unhideRewindTitle` validate with Zod, check ownership, allow 20 per day, and write `RewindExclusion` rows with an `exclusionsVersion` bump.
- [ ] Each change enqueues a no-LLM regeneration that is exempt from the generation limit and waits out a held lock.
- [ ] The title leaves public cards and the share page at once, and in-app lists after the regeneration, while still counting toward totals.
- [ ] The E2E test passes.
- [ ] Dump taken before deploy; `prisma migrate status` clean.

### Step P7.8: Season dashboard and bulk generation

- **Track:** rewind. **Lane:** Rewind. **Effort:** L. **Window:** 2026-11-10 to 2026-11-13. **Depends on:** P2.17, P2.6, P6.5.
- **Findings addressed:** UI-29, BP-22, BP-28

**Objective.** Give the admin one console for the season at `/admin/rewind`: preflight checks, four bulk actions with cost estimates, live progress and per-member state. Bulk generation becomes a BullMQ fan-out, and cost totals come from aggregate queries instead of every `LLMUsage` row. The season-open generation audience (formerly one of P8.2's two code changes) lands here, and from 2026-11-20 the owner uses the console to generate the admins' issues on production data, so the soft launch signs off issues that have already been through real runs.

**Guidance.**
- **Page** (UI-29). `app/admin/rewind/page.tsx` is a Server Component in the app theme, under today's admin layout (P6.1's AdminShell wraps it from the ship window), with P6.5's PageHeader ("Season"), StatGrid (ready, generating, failed, stuck, not started) and DataTable (design 10.1). P6.5 is this step's one hard UI dependency; if it is late, the fallback in the P6 header applies.
  - It shows the season dates in `Config.timezone`, the data window, the model, `promptVersion`, the flags of design 13.2, and when Prepare runs ("02:15 in America/Chicago, which is 00:15 in America/Los_Angeles").
  - Add Season to today's admin nav (`components/admin/shared/admin-nav.tsx`). P6.1 carries it into `lib/admin/nav.ts`, where the mobile Rewind tab opens it.
- **Preflight.** `getRewindPreflight()` in `lib/wrapped/admin/preflight.ts` returns status rows from `lib/ui/status.ts`:
  - Redis, through P2.5's `checkRewindInfra()` ("Rewind needs Redis (REDIS_URL)", FR-50);
  - Tautulli, with its version from a new `getTautulliInfo()` (`cmd=get_tautulli_info`) in P2.3's client, warning below 2.17 ("Update Tautulli: versions before 2.17 are affected by CVE-2026-31799");
  - Overseerr and Sonarr, both optional;
  - the LLM provider and model, priced and not retiring before 2027-01-02 according to `lookupModel()`, or template-only mode;
  - with Stripe on, how many members are skipped for entitlement (P4.5).
- **Actions** in `actions/admin/rewind-season.ts` (P2.6's file), on the admin action helper. Each opens a `ConfirmDialog` with the member count and a cost estimate, and writes an audit entry: add `REWIND_SEASON_PREPARED`, `REWIND_GENERATE_ALL_STARTED`, `REWIND_RETRY_FAILED` and `REWIND_FINAL_CUT_STARTED`.
  - **Prepare season** enqueues `REWIND_SEASON_PREPARE` and replaces P2.6's button. Its processor uses BullMQ's step-job pattern (`job.data.step`, children added with `parent`, then `moveToWaitingChildren` with `WaitingChildrenError`) to run the aggregate, then the warm batches, then `REWIND_GENERATE_ALL`. Each step is safe to retry.
  - **Generate all** (BP-22) enqueues `REWIND_GENERATE_ALL`, a FlowProducer parent on `rewind-batch` with one `REWIND_GENERATE_USER` child (`kind: 'season'`) per eligible member. Members whose `RewindGeneration` for the year is `queued` or `running` are left out, and the children carry no dedup id (design 9.1). `through` is 30 November 23:59:59 in each member's zone, or the end of yesterday when that is earlier.
  - **Retry failed** fans out only the members whose latest generation failed, including `WORKER_LOST` and `JOB_LOST`.
  - **Run final cut** enqueues `REWIND_FINAL_CUT`. It reads "Available from 1 January" and stays disabled until P8.5 registers the processor and the date has passed in the westernmost zone.
  - `estimateSeasonCost()` in `lib/wrapped/admin/estimate.ts` is pure: full-edition members whose `factsHash` changed, times about 4,400 input and 1,500 output tokens (design 8.2), times `lookupModel()` prices.
- **Generation audience** (moved here from P8.2, so the soft-launch deploy runs it). The fan-out would otherwise respect `rewindAudience`, which is still `admins` at 00:15 on 1 December, and members would not be generated. `REWIND_SEASON_PREPARE` and `REWIND_GENERATE_ALL` carry `audience: 'config' | 'all'` in their payload. `ensureSeasonPrepareScheduled()` schedules the season-open run with `all`, the Prepare and Generate all buttons use `config`, and P5.9's `eligibility.ts` checks `NOT_IN_AUDIENCE` against the payload. Viewing stays gated by `rewindAudience` (P5.1, P6.9), so members see the before-season card until 08:00.
- **Admin-audience runs from 2026-11-20** (an owner calendar item). Once this step and P7.12 are deployed, the owner turns `rewindEnabled` on with `rewindAudience = admins` (members still see only the before-season card, which ignores both flags) and runs Prepare season and Generate all on production data. The run repeats after each deploy until the soft launch, and every failure is filed as a `rewind-signoff` issue.
- **Scheduling.** `ensureSeasonPrepareScheduled(year)` takes the latest instant of 1 December 00:15 across `Config.timezone` and the eligible members' `User.timezone`, using P2.2's `zone.ts`. It keeps one delayed job with dedup id `rewind:prepare:{year}:{through}`, replaced when that instant moves. It runs at worker start, in P2.17's stale sweep every 10 minutes, and after P7.12 saves the season dates.
- **Budget cap.** `getRewindSeasonSpend(year)` in new `lib/llm/usage-totals.ts` sums the cost of this year's generations with one `aggregate()`. P5.9's copy step and the dashboard share it. A tile shows the spend against `rewindLlmBudgetUsd`, and the Generate all confirm says how many members would get template copy past the cap.
- **Progress.** A client island polls the Server Action `getRewindSeasonStatus(year)` every 5 s with TanStack Query while anything is queued or running, and calls `router.refresh()` when the counts change. The action returns `groupBy` counts by status, edition and copy source, never `data`.
- **Member table.** URL-driven pagination, with filters for status, edition and copy source. Columns: name, status, edition, copy source, `factsHash` age, last generated, cost, share state (on or off, never the token) and the failure code. The row action is Regenerate (P2.17's `adminRegenerateRewind`, also offered for runs stuck past 15 minutes); P7.9 and P8.8 add the others.
- **BP-28.**
  - `lib/llm/usage-totals.ts` also exports `usageTotalsByUser(userIds)` and `usageTotalsForWrapped(wrappedIds)` (`groupBy` with `_sum` and `_count`) and `latestModelByUser()` (`distinct`, ordered by `createdAt` descending).
  - `fetchUsersWithWrappedData` (`actions/user-queries.ts:330-356`) and `getUserDetails` drop `llmUsage: true` and select only `status` and `generatedAt` from `plexWrapped`.
  - `getLLMUsageStats` (`lib/wrapped/usage.ts`) groups by provider, model and user, and its `byDate` reads only `createdAt`, `cost` and `totalTokens`. `aggregateLlmUsage` (`lib/utils.ts:139`) goes once its callers have moved.

**Tests.**
- `lib/wrapped/admin/__tests__/preflight.test.ts`: Redis missing, Tautulli 2.16.9 warning and 2.17.0 passing, a retiring model, and the entitlement skip count.
- `lib/queue/jobs/__tests__/rewind-generate-all.test.ts`, against Redis when `TEST_REDIS_URL` is set: running members are left out, a child that loses the lock completes as `skipped`, the `admins` audience fans out only admins, and Retry failed picks only failed members.
- `lib/wrapped/pipeline/__tests__/eligibility.test.ts`: with `rewindAudience = admins`, a member is generated under payload audience `all` and skipped under `config`.
- `rewind-season-prepare.test.ts`: the steps run in order and a retry resumes at the current step. The scheduled run carries `all`, and the buttons' runs carry `config`. `ensureSeasonPrepareScheduled` gives 02:15 Chicago time for a Chicago server with one Los Angeles member, and moves when that member's zone changes.
- `lib/llm/__tests__/usage-totals.test.ts`, on Postgres when `TEST_DATABASE_URL` is set: the totals equal the old in-memory sums, and a Prisma spy shows no query selecting `prompt` or `response`.
- `estimate.test.ts`, plus action tests: non-admins refused, every action audited, and the final cut refused before 1 January.
- `e2e/admin/rewind-season.spec.ts`: the preflight rows (`admin-rewind-preflight-*`) and the table render, and Generate all opens a confirm with the estimate. Visual baselines at 1440x900 and 390x844.

**Integration.** P7.9 and P8.8 add row actions, P7.12's status line reuses `getRewindPreflight()` once this step merges, P8.2 relies on the scheduled Prepare with audience `all`, and P8.5 fills in the final cut. P10.8's Overview reuses the queries. If P5.9 has not merged when this step starts, the fan-out enqueues the v2 job body from P2.17, and nothing here changes when P5.9 swaps it. The users, LLM usage and cost pages load faster with no visible change.

**Demo.** On a seeded server, Prepare season runs the aggregate, the warm batches and the fan-out in order, and the tiles move every 5 s until every member is ready. A second Generate all during the run leaves the running members out. `/admin/users` loads without selecting any prompt text.

(as merged: the Season nav item went into `lib/admin/nav.ts` (P6 had merged; the mobile Rewind tab now opens `/admin/rewind`), not `admin-nav.tsx`. Processors live in `lib/queue/jobs/rewind-season.ts` and producers plus `ensureSeasonPrepareScheduled`/`scheduleSeasonOpenRun` in `lib/rewind/season-runs.ts`; `JobProcessor` now receives the BullMQ token. The fan-out adds children with `parent` from the step job (`addBulk`), not a `FlowProducer`; children set `ignoreDependencyOnFailure`, the aggregate child `failParentOnFailure`. `REWIND_SERVER_AGGREGATE` takes `warm: 'return'` so Prepare adds the warm batches as its own children. `through` is the batch's day (`YYYY-11-30`); the "end of yesterday" clip is left to the data window. The season-open run uses the opening day from `rewindSeasonOpens` at 00:15, and is replaced (remove and re-add, job id carries the instant) when it moves; P7.12's `updateRewindSettings` reschedules it on a date change. Run final cut is a disabled button; `runRewindFinalCut` refuses before 1 January in the westernmost zone and, after, until P8.5. P2.6's Prepare season data button and `prepareRewindSeasonData`/`enqueueServerAggregate` are gone; settings links to Season. P7.12's stopgap `getRewindSeasonSpendUsd` was replaced by `getRewindSeasonSpend`. `aggregateLlmUsage` stays for the LLM usage list and conversation pages, which sum the rows already on the page; those pages and the usage detail still read prompt text by design. Visual baseline `admin-rewind-season` and the E2E spec were written but not run.)

**Done when.**
- [x] `/admin/rewind` shows the preflight rows, the StatGrid, live progress and the per-member DataTable.
- [x] Prepare season, Generate all, Retry failed and Run final cut each show a cost estimate and write an audit entry, and the fan-out skips queued and running members.
- [x] `REWIND_SEASON_PREPARE` is scheduled for 00:15 on 1 December in the westernmost zone with audience `all`, the buttons use the configured audience, and the season budget cap is shown and enforced.
- [ ] Admin-audience generation has run on production data from 2026-11-20.
- [x] Cost totals come from aggregate queries, and no admin page loads `LLMUsage` prompt or response text.

### Step P7.9: Admin preview, roll back and audited reads

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-11-16 to 2026-11-16. **Depends on:** P7.8.
- **Findings addressed:** UI-06, UI-29, GAP-33

**Objective.** Admins preview any member's Rewind inside the admin shell, with the year always in the URL, a clear "viewing as an admin" banner and an audit entry for each read. Roll back restores the previous Rewind in one audited transaction.

**Guidance.**
- **Route.** `app/admin/users/[userId]/rewind/[year]/page.tsx` (`ui-design-system.md` 10) is a Server Component under today's admin layout; P6.1's AdminShell wraps it from the ship window.
  - It is not an immersive route: the nav stays, and only the assistant is hidden (6.2). Remove `/^\/admin\/users\/[^/]+\/wrapped/` from the immersive list in `components/admin/shared/admin-layout-shell.tsx:10`; P6.1 carries the rule into `ASSISTANT_HIDDEN`.
  - `year` parses with `z.coerce.number().int().min(2010).max(2100)`, and the admin check uses P4.3's discriminated result.
  - The PageHeader has breadcrumbs "Users / {name} / Rewind {year}", status, edition and copy-source badges, and the actions Regenerate, Roll back and "Read as an article".
  - The banner `admin-rewind-preview-banner` reads "You are viewing {name}'s Rewind as an admin. Members are told that admins can view their Rewind." (FR-36).
  - The body is a framed artboard inside `RewindScope` with `lib/rewind/fonts.ts`. It renders P5.2's `StoryStage` with `mode="admin-preview"`, which writes no `RewindView`, shows no share, hide or notify controls, and keeps the keyboard map. v1 and v2 years show today's viewer in the same frame until P7.13 swaps in the archive article in the ship window.
  - Generating, failed and missing rows render `RewindStatusPanel` with admin copy and the typed code (P0.9's admin-only detail). The member's full-screen generating screen never appears (UI-06).
- **Audited read** (GAP-33, design 10.1). Add `REWIND_ADMIN_VIEWED` to `AuditEventType`, and write it inside `after()` with `{ targetUserId, year, wrappedId }` on every render of a stored Rewind. P4.6 persists it.
- **Redirect.** `app/admin/users/[userId]/wrapped/page.tsx` becomes a `redirect()` to `userRewind(userId, year)`. This step creates `lib/admin/routes.ts` with `userRewind` (returning `/admin/users/${id}/rewind/${year}`) and the `userDetail` builder it needs; P6.1 adds the other builders to the same file in December. The year comes from `?year=`, else the member's latest completed year. Repoint the links at `app/admin/users/[userId]/page.tsx:239` and `:329`, `app/admin/llm-usage/[usageId]/page.tsx:205`, `app/admin/shares/page.tsx:192` and `components/admin/users/user-actions-menu.tsx:122` to `userRewind()`, with the year.
- **Roll back** (design 7.9): `rollbackRewind({ userId, year })` in `actions/admin/rewind-season.ts`.
  - It refuses while a generation is queued or running, and holds P2.5's per-member lock while it works.
  - It takes the latest completed `RewindGeneration` that has `previousData`, and refuses unless P2.1's `parseStoredRewind()` accepts that data.
  - In one `$transaction`, it writes the previous data back to `PlexWrapped` (`data`, `dataVersion`, `edition`, `factsHash` and `dataThrough`), and creates a `RewindGeneration` (`kind: 'admin'`, `status: 'completed'`) whose `previousData` holds the replaced data, so a second roll back undoes the first.
  - It writes `REWIND_ROLLED_BACK` with the target user, the year and the source generation id. Cards change key with `factsHash`, so nothing else needs invalidating.
- P7.8's member table gains Preview (to `userRewind()`) and Roll back (UI-29), a `ConfirmDialog` reading "Roll back {name}'s Rewind 2026 to the version from {date}?". The preview page offers the same Roll back.

**Tests.**
- `app/admin/users/[userId]/rewind/__tests__/page.test.tsx`:
  - a non-admin gets the admins-only StatusScreen;
  - a v3 row renders the stage in admin-preview mode, with the banner and no `recordRewindView` call;
  - a failed row shows its typed code, and each render writes one `REWIND_ADMIN_VIEWED` entry.
- `wrapped-redirect.test.ts`: both `?year=2025` and a missing year redirect with the year in the path.
- `actions/__tests__/rewind-rollback.test.ts`: the previous data is restored and the current data kept for undo; a roll back is refused while a run is active, without `previousData`, and when that data fails to parse; non-admins are refused; there is one audit entry.
- `e2e/admin/rewind-preview.spec.ts`:
  - Preview from `/admin/rewind` opens the member's 2026 Rewind with the admin nav visible;
  - an old `/admin/users/<id>/wrapped?year=2025` link lands on `.../rewind/2025`;
  - Roll back through the dialog changes the status badge.

**Integration.** P7.8's table links here, P8.8's diff compares against the stored Rewind shown here, and P7.13 replaces the legacy branch. P10.6 adds the Rewind tab on user detail, and P11.16 adds the rest of GAP-33's read and write events.

**Demo.** Open Morgan Lee's 2025 row from Share analytics: it lands on her 2025 Rewind in the admin shell, with the banner, and the audit table gains a `REWIND_ADMIN_VIEWED` row. Roll back her 2026 issue, then roll back again to restore it.

**Done when.**
- [ ] `/admin/users/[userId]/rewind/[year]` renders inside the admin shell with the Rewind fonts and the banner, and writes an audit read entry.
- [ ] The old `[userId]/wrapped` route redirects with the year, and every admin link passes the year.
- [ ] Roll back restores `previousData` in one audited transaction, and can be undone.
- [ ] The tests pass.

### Step P7.10: Dry runs and preview mode

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-12 to 2026-11-13. **Depends on:** P5.9, P2.10.
- **Findings addressed:** none (design or research item)

**Objective.** Run the production pipeline in dry-run mode, as a job, on a member or a golden fixture, and let an admin open the result as a story and as cards without writing anything. P7.11's gallery is built on this, and P8.8 builds the playground's panes on it in the ship window.

**Guidance.**
- **A job, not a long action.** A dry run can take 90 s, longer than a proxy allows a request.
  - `estimateRewindDryRun(input)` returns the cost from `lookupModel()` and makes no call.
  - `startRewindDryRun(input)` in `actions/admin/rewind-playground.ts` is on the admin helper. Its Zod input is the subject (a member id or a fixture id), `year`, `model`, `promptVersion`, `effort`, `styleGuide` (1,200 characters at most) and `copyPolicy`. It calls `consume('rw:dryrun', adminId)` at 10 per 10 minutes, then enqueues `REWIND_DRY_RUN` on `rewind-aux`.
  - The processor runs `generateUserRewind({ mode: 'dry-run', source, model, promptVersion, styleGuide, signal })`, with P2.10's `fixtureSource()` for a fixture, and stores `{ data, trail }` in Redis at `rw:preview:<uuid>` for 1 hour. `getRewindDryRun(id)` returns it.
  - A dry run writes no `PlexWrapped` or `RewindGeneration` row, and its billed `LLMUsage` rows carry `promptVersion` with no `generationId` (P5.9).
- **Preview mode.** P5.1's `[year]/page.tsx` accepts `?preview=<uuid>` for admins only and loads the data from Redis. The stage runs with `mode="preview"` (no views, sharing or hiding) under a "Preview" banner, and an unknown or expired id shows `RewindStatusPanel` `not-found`. New `app/api/rewind/card/preview/[previewId]/[page]/route.tsx` (admin only, noindex) renders cards through `toShareSafe` with the default options.
- The fixture ids are read with `fs` from `evals/rewind/fixtures/`, a folder listed in `outputFileTracingIncludes` for the action's route.

**Tests.**
- `actions/__tests__/rewind-dry-run.test.ts`: non-admins are refused, the 11th dry run in 10 minutes is limited, the estimate makes no provider call, and an over-long style guide is refused.
- `lib/queue/jobs/__tests__/rewind-dry-run.test.ts`: a fixture run writes no `PlexWrapped`, `RewindGeneration` or `RewindView` row, the preview key has a 3,600 s TTL, and the trail carries the facts, selection, raw output, grounding and cost.
- `app/(app)/rewind/__tests__/preview.test.tsx`: a member with `?preview=` gets 404, an admin sees the banner, and an expired id shows `not-found`.
- `app/api/rewind/card/__tests__/preview-route.test.ts`: admin only, noindex, and the card equals the owner route's card for the same data.

**Integration.** P7.11's gallery starts dry runs for its five fixtures and opens them through preview mode and the preview card route. P8.8 adds the playground panes, the `/admin/playground` redirect and the v2 deletions. P7.8's table can link a member's dry run once P8.8 adds "Open in playground".

**Demo.** From a script or the Node REPL, start a dry run of the `heavy` fixture in "Templates only": `/rewind/2026?preview=<id>` opens the story with the Preview banner, and the preview card route returns its centrefold card. Nothing is written to `PlexWrapped`.

**Done when.**
- [x] `REWIND_DRY_RUN` runs `generateUserRewind` in dry-run mode on a member or a fixture, rate-limited, with an estimate first, and writes no Rewind rows.
- [x] Admins open a dry run through `?preview=` and the preview card route, and members cannot.

(as merged: the processor is `lib/queue/jobs/rewind-dry-run.ts`, not `jobs/rewind.ts`, to keep clear of P7.8's edits; it is registered on `rewind-aux` in `lib/queue/rewind-queues.ts`. The input schema is `DryRunInput` in `lib/rewind/dry-run/input.ts`, the subject `{ kind: "member", userId } | { kind: "fixture", fixtureId }`, and a fixture run must name the fixture's year (2026). `effort` is plumbed through `generateUserRewind` to the copy and repair calls (default `low`). `actions/admin/rewind-playground.ts` exports `estimateRewindDryRun`, `startRewindDryRun` (returns `{ previewId }`, also the job id) and `getRewindDryRun` (`pending` while the job waits or runs, then the stored `completed | skipped | failed` entry); the file is a knip entry until P7.11 calls it. Redis entries are read with `readDryRun` / `readPreview` in `lib/rewind/dry-run/store.ts`; a fixture preview runs as `FIXTURE_USER_ID`. The preview card route is `route.ts`, `Cache-Control: private, no-store`, spending `rw:card:session` by admin id on a cache miss. `outputFileTracingIncludes` lists the fixtures under `/admin/**`, so P7.11's gallery page must live under `/admin`. In preview mode the stage hides the share pill and the Share key; P7.7 (Hide) and P7.14 (views) must also check `mode === "preview"`.)

### Step P7.11: Gallery of the review fixtures

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-19 to 2026-11-20. **Depends on:** P7.10, P5.11.
- **Findings addressed:** none (design or research item)

**Objective.** Give the pre-freeze review one place to see every selected page and card of the five review fixtures, rendered through the real routes, both in the admin and as a headless batch. The soft launch needs only the core pages here; the other pages and cards appear as they merge. The eval results page moved to January (P11.30).

**Guidance.**
- **Gallery.** `app/admin/rewind/gallery/page.tsx` (design 10.3) has one tab per review fixture: `heavy`, `median`, `light` (the pocket edition), `postcard` and `extreme`.
  - Each tab starts or reuses a dry run through P7.10's `REWIND_DRY_RUN` with the model `replay:selected`, a new replay provider in `lib/llm/replay.ts` built on P5.9's recording replay. It reads `evals/rewind/recordings/<selected model>/`, named in P5.13's `selected.json`, so the review sees the bake-off winner's real copy at no cost. Until P5.13 writes `selected.json` on 2026-11-20, the tabs default to "Templates only" (`copyPolicy: 'no-llm'`), which the switch keeps offering afterwards.
  - Every selected page renders as a lazy `<iframe>` of `/rewind/2026?preview=<id>&page=<type>&still=1` at 390x844, scaled down, with a 1440x900 spread toggle. `page` opens the stage on that page and `still` settles it in its reduced-motion final state; both work only in preview mode.
  - Every card from `eligibleCards()`, with Daily detail on so the calendar card is included, renders as an `<img>` from P7.10's preview card route.
- **Headless.** `npm run rewind:gallery` runs `scripts/rewind-gallery.ts` (tsx):
  - it takes `--base-url` (default `http://localhost:3000`) and needs a server in `E2E_TEST_MODE` for the admin test-session login (P0.4);
  - it creates the five previews the same way, then drives Playwright's chromium to screenshot every page at 390x844 and 1440x900 and to download every card;
  - it writes `${REWIND_CACHE_DIR}/gallery/<date>/<fixture>/<nn>-<page>.png`, `cards/<page>.png` and an `index.html` contact sheet.
  - A manual workflow, `.github/workflows/rewind-gallery.yml` (`workflow_dispatch`), runs it against the CI production build and uploads the folder as an artifact.
- Add Gallery to today's admin nav; P6.1 carries it into `lib/admin/nav.ts`.

**Tests.**
- `app/admin/rewind/gallery/__tests__/page.test.tsx`: five tabs, one iframe per selected page with `preview`, `page` and `still`, one `<img>` per eligible card, and non-admins refused.
- `app/(app)/rewind/__tests__/preview-still.test.tsx`: `page` and `still` do nothing without `preview`.
- `lib/llm/__tests__/replay.test.ts`: `replay:selected` returns the recorded output with `global.fetch` stubbed to throw.
- `scripts/__tests__/rewind-gallery.test.ts`: the output plan lists every page and card of each fixture, and the contact sheet links each file.
- `e2e/admin/rewind-gallery.spec.ts`: the heavy tab's cover iframe contains `rewind-stage`, and the centrefold card loads with status 200.

**Integration.** P7.16's review runs on these pages and on the headless set. P8.1 checks the frozen model against the committed `evals/rewind/results/*.json`, and P9.1 uses the gallery for the success review.

**Demo.** Open `/admin/rewind/gallery`, switch to `extreme`, and scroll through every page at phone size and then its cards. Run `npm run rewind:gallery` and open the contact sheet.

**Done when.**
- [ ] `/admin/rewind/gallery` renders every page and card of the five review fixtures through the real routes, using the selected model's recordings.
- [ ] `npm run rewind:gallery` produces the same set headless, with a contact sheet, both locally and from the manual workflow.
- [ ] The tests pass, and Gallery appears in the admin nav.

### Step P7.12: Rewind settings section and feature flags

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-11-10 to 2026-11-11. **Depends on:** P2.2, P3.5.
- **Findings addressed:** none (design or research item)

**Objective.** One Rewind section in settings holds every admin-facing flag of design 13.2, validated, audit-logged and checked against Redis and Tautulli. The soft launch, the season open and the cut list then need no deploy.

**Guidance.**
- **Section.** `components/admin/settings/rewind-settings-section.tsx` (`id="rewind"`) is built from P3.5's `FormField`, `Switch`, `Select`, `Checkbox` and `Input` inside a P3.4 `Card`, and goes on today's settings page, so it does not wait for the settings layout (P10.19 in January). P10.19 moves it into its `SettingsSection` slot in the Features group (`ui-design-system.md` 6.4, design 10.4) without changing its fields.
  - It replaces `components/admin/settings/wrapped-settings-form.tsx` (272 lines), which is deleted with its tests.
  - Its status comes from P7.8's `getRewindPreflight()` (Redis and the Tautulli version) once P7.8 merges; until then it shows P2.5's `checkRewindInfra()` result.
- **Fields**, all on `Config` (design 7.10):
  - Rewind on or off (`rewindEnabled`) and Audience (`rewindAudience`: "Admins only" or "Everyone");
  - the season's opening and closing dates as month and day Selects (`rewindSeasonOpens`, `rewindSeasonCloses`), evaluated in `Config.timezone`, which is shown read-only with a link to its own setting;
  - LLM mode (`standard`, `economy` or `off`) and the season budget (`rewindLlmBudgetUsd`), with the spend so far from `getRewindSeasonSpend()`;
  - public links, public counts, the server name on cards and artwork on cards. The name itself is `Config.serverName`, edited with the Plex server;
  - excluded libraries, as a checkbox list of the Plex sections from Tautulli `get_libraries` (`rewindExcludedSectionIds`), and excluded content ratings from the distinct `MediaMetadataCache.contentRating` values (`rewindExcludedContentRatings`). Both say "Takes effect at the next generation";
  - include managed accounts (`rewindIncludeManagedUsers`);
  - disabled pages: the eight non-core pages in cut-list order (People, Setup, and Next year with its picks and Sonarr parts, then Taste, The race, Records, Requests and Standing). The ten core pages are never offered (design 13.3);
  - notification channels (`rewindNotifyChannels`: Discord DM and the dashboard banner). Discord is disabled, with the reason, while the bot is off. `rewindAudio` is not shown, because RWV-14 is deferred.
- **Validation.** `lib/validations/rewind-settings.ts` (Zod) accepts only month-day strings that exist (`02-30` fails), lets the opening and closing dates wrap the year, takes a budget from 0 to 1,000 with 2 decimals, and limits section ids, ratings and page keys to the known lists.
- **Action.** `updateRewindSettings(input)` in `actions/admin/rewind-settings.ts` runs on the admin action helper.
  - It writes only the changed fields and emits P4.6's `CONFIG_CHANGED` with a field-level diff.
  - It calls `ensureSeasonPrepareScheduled()` when the dates change, and revalidates `/admin/settings`, `/admin/rewind` and `/`.
- **llmDisabled.** `effectiveRewindLlmMode(config)` in `lib/wrapped/config.ts` returns `off` whenever `Config.llmDisabled` is on. P5.9's copy step and P7.8's estimate use it. The section then shows LLM mode disabled, with "AI features are off, so Rewind uses template copy." (6.4).
- **Public links off.** New links are refused (P5.11), and P7.5's lookup returns null for every token without deleting rows. The switch's description says so.
- Delete `getWrappedSettings` and `updateWrappedSettings` (`actions/admin/admin-config.ts:16`, `:194`) once nothing calls them. P11.18 drops the old date columns.

**Tests.**
- `lib/validations/__tests__/rewind-settings.test.ts`: `02-30` fails, `12-01` to `01-31` passes, a core page in the disabled list fails, and a budget of -1 fails.
- `actions/__tests__/rewind-settings.test.ts`: non-admins are refused; one `CONFIG_CHANGED` entry lists only the changed fields; a date change reschedules Prepare; the flags reach `getConfig()`.
- `lib/wrapped/__tests__/config.test.ts`: `llmDisabled` forces `off` over `standard` and `economy`, and a P5.9 copy-step case then makes no call.
- `components/admin/settings/__tests__/rewind-settings-section.test.tsx`: Save stays disabled until the section is dirty, Discard restores, Discord is disabled with its reason while the bot is off, and every control is labelled.
- `e2e/admin/settings-rewind.spec.ts`: "Admins only" hides the home RewindCard from a member session and keeps it for an admin, and disabling People removes it from the heavy member's folios. Visual baseline of the section.

**Integration.** From 2026-11-20 the owner turns the flags on here for admin-audience runs (P7.8), P7.16 confirms them for the soft launch, P8.2 changes the audience, and the cut list works through the disabled pages. P7.14's notification fan-out hooks into this step's audience save, and P7.17's runbook documents each field.

**Demo.** Turn Rewind on for admins only, set the budget to $5 and disable People. The audit table shows one `CONFIG_CHANGED` row, a member sees no Rewind card, and the season dashboard shows the new cap.

**Done when.**
- [x] The Rewind section in the Features group covers the season dates, audience, LLM mode and budget, public links and counts, server name and artwork on cards, excluded libraries and ratings, managed accounts, disabled pages and notification channels.
- [x] Every field is Zod-validated, and every save writes an audit entry with a diff.
- [x] `llmDisabled` forces template copy everywhere.
- [x] The tests pass, and the old wrapped settings form is gone.

(as merged: P7.8 was not on the branch, so `updateRewindSettings` does not yet call `ensureSeasonPrepareScheduled()`; P7.8 adds the call when `rewindSeasonOpens` or `rewindSeasonCloses` is among the changed fields, with the "a date change reschedules Prepare" test. The spend comes from `getRewindSeasonSpendUsd(year)` in `lib/wrapped/admin/settings-options.ts` (same aggregate as `load-context.ts`), which P7.8's `getRewindSeasonSpend` replaces; the status line shows `checkRewindInfra()` and whether Tautulli answered `get_libraries`, until `getRewindPreflight()` lands. Disabled-page keys are `REWIND_CUT_PAGES` in `lib/validations/rewind-settings.ts`, including `next-year.picks` and `next-year.returning`; P8's `+key` entries must extend that list. `getWrappedSettings` stays, because `actions/rewind-generation.ts` still calls it; `Config.wrappedEnabled` has no UI now and stays at its default. The section is a card on today's settings page, with Prepare season data and the server time zone (`#server-time-zone`) in a card under it; `components/ui/date-range-picker.tsx` went with the old form.)

### Step P7.13: Legacy archive articles

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-12-03 to 2026-12-04. **Depends on:** P5.12, P5.1.
- **Findings addressed:** RWV-07

**Objective.** Stored 2025 and earlier Rewinds open as archive articles in the Rewind theme, through the article renderer, so no member route renders the legacy viewer any more. It lands in the ship window (2026-12-02 to 12-04); until then those years render through P0.14's `WrappedYearView` (P5.1), which is FR-1's fallback and Appendix C decision 29. Deleting the legacy viewer itself moved to January (P11.29), because nothing in the season needs it gone.

**Guidance.**
- **Adapter.** `lib/wrapped/data/legacy-article.ts` (design 7.9) is a pure module of about 150 lines. `legacyToArticle(legacy, { year, brand })` maps P2.1's parsed v1 and v2 data to P5.12's `ArticleBlock[]`:
  - a heading, "{brand} Rewind {year}", with "From the archive";
  - fact rows for the totals (minutes, films, series and episodes, through `lib/rewind/format.ts`);
  - ranked lists for the top films and shows, keyed by `ratingKey`, or by title and year;
  - the archetype name, and the stored narrative paragraphs as plain text through `renderCopyText`, with `<highlight>` tags stripped;
  - monthly minutes as a table.
  - It never reads `leaderboards`, which P0.8 stripped, and a key test enforces that. A section it cannot map is dropped with one logged warning.
- **Callers.**
  - The `version: 1 | 2` branch of `app/(app)/rewind/[year]/page.tsx` renders `ArticleDocument` with these blocks, on paper inside the scope, with no story, cards or sharing. P0.14's `WrappedYearView` is deleted. `/rewind/[year]/read` renders the same for legacy years.
  - P7.9's admin preview renders it for v1 and v2 rows.
  - `app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page.tsx` renders it over `getHistoricalWrappedData()`, or a notice when P0.8 removed the text.
  - P0.19's `enableWrappedShareLink` loses its last caller and is deleted, and P0.19's grep test now asserts that no code sets a non-null `shareToken`. `disableWrappedShareLink` stays for P7.5's banner until P11.18.
- **Copy.** No surface a member sees says "Wrapped" any more (RWV-07). The design-system check's Copy rule enforces it.
**Tests.**
- `lib/wrapped/data/__tests__/legacy-article.test.ts` runs the stored v1 and v2 fixtures in `lib/wrapped/__tests__/fixtures.ts`:
  - every block kind appears, and the totals equal the stored numbers;
  - no key or text holds `leaderboard`, an email or another member's name;
  - a malformed section is dropped with one warning.
- `app/(app)/rewind/__tests__/rewind-page.test.tsx`: the v1 and v2 branches render the article, headed "Chester Family Plex Rewind 2025".
- `e2e/rewind/archive.spec.ts` (chromium, webkit and firefox): a seeded 2025 v2 row opens at `/rewind/2025` as an article, axe finds 0 violations, and the page has no "Wrapped" text.
- P5.4's budget spec adds `/rewind/2025` and asserts that no `/rewind` route loads a chart.js chunk.

**Integration.** P11.29 deletes `components/wrapped/**` and the cinematic aliases in January, once this step and P8.8 have removed their last callers. P10.9 uninstalls chart.js once the admin charts move, and P11.18 removes the v2 share fallback.

**Demo.** Open `/rewind/2025` on a phone: a paper archive article with the 2025 totals, top lists and archetype, in the Rewind fonts. The build's chunk list shows no chart.js for `/rewind/*`, and no route under `app/(app)/rewind/` imports `components/wrapped`.

**Done when.**
- [ ] `legacy-article.ts` renders stored v1 and v2 years as archive articles in the Rewind theme, on the member, article and admin routes.
- [ ] No member or admin Rewind route imports `components/wrapped`, and no `/rewind` route loads chart.js.
- [ ] No member-facing surface says "Wrapped".
- [ ] The tests on stored fixtures pass.

### Step P7.14: Ready notifications and view tracking

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-19 to 2026-11-20. **Depends on:** P5.9, P6.9.
- **Findings addressed:** none (design or research item)

**Objective.** Tell each member once that their Rewind is ready, by Discord DM in waking hours and on the dashboard, and record views for the success measures without storing anything about the viewer. The season-open fan-out on the audience switch (formerly one of P8.2's two code changes) lands here, so the soft-launch deploy carries it.

**Guidance.**
- **`REWIND_NOTIFY`** runs on `rewind-aux` (design 9.1, 9.7) with dedup id `rewind:notify:{year}:{userId}:{kind}`, 3 attempts and a 1-minute signal.
  - `afterRewindCompleted()` (P5.9) enqueues it when the generation's kind is `season` or `member`, or when "Notify me" set `RewindPrefs.notify`. Admin regenerations and dry runs never notify. P8.5 adds the `final-cut` kind and its copy.
  - `nextSendWindow(now, zone)` in `lib/wrapped/notify/window.ts` returns now when it is between 09:00 and 20:00 in the member's Rewind zone, or else the next 09:00. Outside the window the job delays itself to that instant.
  - In the window, it re-checks eligibility, entitlement (P4.5) and `RewindPrefs.notify`. It then claims the send with `updateMany({ where: { id, notifiedAt: null }, data: { notifiedAt: now } })`, and stops when that updates no row.
- **Season-open fan-out** (moved here from P8.2). The job re-checks eligibility at send time, so a member east of the server, whose 09:00 comes before 08:00 server time, would be skipped for good if season notifications were enqueued on completion during the night of 30 November. `afterRewindCompleted()` therefore enqueues a season notification only when the member is in the live audience. When `updateRewindSettings` (P7.12) changes the audience from `admins` to `all`, it calls new `enqueueSeasonReadyNotifications(year)`, which enqueues one `REWIND_NOTIFY` (dedup `rewind:notify:{year}:{userId}:season`) per completed season Rewind with `notifiedAt` null; each job delays itself into its member's 09:00 to 20:00 window.
- **Discord DM**, only when `discord` is in `rewindNotifyChannels`, the bot is enabled and the member has a `DiscordConnection`.
  - New `sendDiscordDirectMessage(discordUserId, content, signal)` in `lib/discord/api.ts` uses the REST API with `getDiscordBotToken()`: `POST /users/@me/channels`, then `POST /channels/{id}/messages`. It therefore works from any worker without the gateway lease.
  - The message reads "Your {serverName} Rewind 2026 is ready." with a link to `/rewind`. Discord error 50007 (DMs closed) is logged and not retried.
- **Banner.** `getRewindNotice(userId)` in `lib/wrapped/notify/notice.ts` returns the ready notice while the Rewind is completed, `notify` is on, `banner` is a channel and no `RewindView` exists since it was generated.
  - P6.3's AppShell notice slot renders it on member pages other than home.
  - P6.9's RewindCard uses the same unread rule for its pip, and keeps its ready state even with `notify` off (9.7).
- **"Notify me".** `notifyWhenRewindReady({ year })` in `actions/rewind-notify.ts` (Zod, session, and ownership of that year's row) sets `RewindPrefs.notify = true`. The generating state of `RewindStatusPanel` (P5.1) gains its button, `rewind-notify-me`, with the toast "We'll let you know". P6.11's `/account` switch writes the same field.
- **View tracking** (design 7.10). `recordRewindView({ wrappedId, sessionKey, page, shareAction? })` in `actions/rewind-views.ts` (Zod, session, ownership) upserts `RewindView` on `(wrappedId, sessionKey)`; add that unique index in a migration if P2.1 did not.
  - It keeps the highest `furthestPage`, increments `shareActions[kind]`, and stores no IP, user agent or referer.
  - `components/rewind/stage/use-record-view.ts` creates the `sessionKey` with `crypto.randomUUID()` once per open, in a ref and never in storage. It calls the action the first time each page is reached in that open, and P5.11's share sheet passes `image`, `save` or `link`.
  - The `admin-preview` and `preview` modes never call it.
- **Success measures** (design 1.4: opened, reached the centrefold, shared) come from `getRewindSuccessMeasures(year)` in `lib/wrapped/admin/measures.ts`, counted over `RewindView` and `RewindShare`. P7.8's dashboard shows them.

**Tests.**
- `lib/wrapped/notify/__tests__/window.test.ts`: 21:30 in Berlin moves to 09:00 the next day, 08:59 moves to 09:00, and 12:00 sends at once, including across a DST change.
- `lib/queue/jobs/__tests__/rewind-notify.test.ts`:
  - two jobs send one DM;
  - `notify` off, a lapsed subscriber, an unlinked member, a disabled bot and a channel list without `discord` each skip the DM;
  - error 50007 is not retried.
- `lib/discord/__tests__/send-dm.test.ts`, with fetch mocked: the two calls, the `Bot` authorisation header and the abort signal.
- `actions/__tests__/rewind-notify.test.ts` and `rewind-views.test.ts`: another member's year or `wrappedId` is refused, one write happens per new page per open, `furthestPage` never decreases, and share actions count by kind.
- `notice.test.ts`: the notice clears after the first view and stays off with `notify` off, while the card's ready state remains.
- `actions/__tests__/rewind-settings.test.ts` (P7.12's file): the `admins` to `all` change enqueues one notification per completed, un-notified member; saving again enqueues none; `all` to `admins` enqueues none. `rewind-notify.test.ts` adds: a completion outside the live audience enqueues nothing, and a Berlin member of a Chicago server gets one DM after the switch.
- `e2e/rewind/notify.spec.ts`: "Notify me" on a generating Rewind shows the toast, and for a completed Rewind `/account` shows the notice until `/rewind/2026` is opened.

**Integration.** P8.2's season open relies on these notifications, P8.5 adds the final-cut copy, and P9.1 and the 2027-01-15 review read the measures. P11.14 deletes `RewindView` rows after 120 days.

**Demo.** A seeded member's Rewind completes at 21:00 in their zone, and the DM arrives once, at 09:00 the next morning (a fake clock in the job test, or a real delayed job on staging). The notice shows on `/account` until the member opens their Rewind, and `RewindView` then holds one row with `furthestPage` 18.

**Done when.**
- [ ] `REWIND_NOTIFY` sends one Discord DM between 09:00 and 20:00 in the member's zone, and `notifiedAt` prevents duplicates.
- [ ] Switching the audience to `all` fans out one season notification per completed member, and completions outside the live audience enqueue none.
- [ ] The home card's ready state and the AppShell notice use the same unread rule.
- [ ] `notifyWhenRewindReady` turns notifications on, and `/account` can turn them off.
- [ ] `recordRewindView` upserts `RewindView` rows with no viewer data, and previews write none.
- [ ] The tests pass.
- [ ] If this step adds the `RewindView` unique index: dump taken before deploy; `prisma migrate status` clean.

### Step P7.15: Accessibility and low-end performance pass

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-11-19 to 2026-11-23. **Depends on:** P5.4, P7.1, P7.2.
- **Findings addressed:** RWV-09, RWV-13

**Objective.** Prove that the whole issue works with screen readers, forced colours and low-end phones before the soft launch. Run the manual VoiceOver and TalkBack scripts, add low-end mode, and fix until axe, the long-task gate and the bundle budget pass on every page of three fixtures. The step no longer waits for P7.4: the phone story is its scope, P7.4's spread brings its own axe and visual checks, and the gates below then cover the spread too because they are blocking CI jobs.

**Guidance.**
- **Manual scripts.** `e2e/manual/rewind-screen-reader.md` holds two scripts and a results table: VoiceOver on iOS 26 Safari (an iPhone 15, plus an iPhone SE at 375x548) and TalkBack on Android 16 Chrome (a Moto G Power class phone). They cover:
  - opening from the RewindCard, choosing a cut, and each page announced once by its heading after a swipe;
  - automatic turns announced through the live region while focus stays put;
  - the quiz radiogroup, the Table sheet, "Why this?", and the share sheet's switches and Copy link;
  - article mode from the first focusable element, Close, the share page and an archive article.
  The PR records the results with device, OS and browser. Every failure is fixed, or recorded with the reason it is not a defect. The run itself is an owner calendar item on 2026-11-23, about three hours with an iPhone and an Android phone; the agent work above lands from 2026-11-19 so that day only finds and confirms fixes.
- **Forced colours** (design 11.1). `e2e/a11y/rewind-forced-colors.a11y.spec.ts` runs `page.emulateMedia({ forcedColors: 'active' })` on chromium for every page of the heavy fixture, with baselines. It checks that hatching, outlines and data marks still draw (they are `currentColor` patterns), that fields map to `Canvas` and ink to `CanvasText`, and that focus rings stay visible. Fix any page that relies on a fill alone.
- **Low-end mode** (design 5.6, 11.2).
  - `lib/rewind/stage/low-end.ts` exports `isLowEnd({ hardwareConcurrency, deviceMemory, saveData })`, true at 4 cores or fewer, 2 GB or less, or Save-Data. `RewindScope` sets `data-low-end` from it in a layout effect, and the server reads the `Save-Data` request header so the first paint is already light.
  - Under `[data-low-end]`, the Rewind block of `app/globals.css` switches the nameplate stretch to the `scaleX(0.82)` to 1 version over 420 ms, and drops the paper-grain blend and the cover print-in.
  - `components/rewind/media/poster.tsx` then requests the smallest `w` that covers 1x instead of 2x.
- **Gates.** Delete `PENDING_PAGES` from P5.4's specs, so every page counts.
  - axe at wcag22aa allows 0 violations in story mode on every page of `heavy`, `median` and `light`, on chromium and webkit, at 390x844 and the small viewports. Article mode and the share page also run on firefox.
  - The perf project runs the three fixtures twice: normally, and as a low-end device through an init script that sets `hardwareConcurrency` to 2 and `deviceMemory` to 1. No long task may exceed 50 ms, and a page turn may cause at most 3 commits.
  - The 110 KB first-page budget is checked on `/rewind/2026` for each fixture, and each page chunk against 12 KB (design 11.2).
- **Likely fixes** to budget time for: prefetching only the neighbouring pages' islands, splitting the race and quiz islands, Archivo with `font-display: block` and its metric-adjusted fallback (CLS 0), and a grain tile of about 1.5 KB.
- RWV-09 and RWV-13 close here, verified on the whole issue rather than the core pages alone.

**Tests.**
- `lib/rewind/stage/__tests__/low-end.test.ts`: each trigger on its own, and missing browser APIs treated as not low-end.
- `components/rewind/stage/__tests__/rewind-scope.low-end.test.tsx`: the attribute is set, and the poster `w` drops.
- `app/__tests__/globals-rewind-low-end.test.ts`: the `[data-low-end]` rules exist and animate only `transform` and `opacity`.
- The axe, forced-colours, perf and budget specs above become blocking CI jobs. The manual scripts are the release gate for P7.16.

**Integration.** P7.16 needs these gates green and the scripts done. P8.1 freezes with them in place, and P8.3's P1 features must keep them green.

**Demo.** On a Moto G Power class phone, the heavy issue autoplays with the `scaleX` stretch and no grain, and the perf job prints a longest task under 50 ms. In Windows high contrast every hatched bar still shows. VoiceOver reads "Page 6 of 18: Top films" once on an automatic turn.

**Done when.**
- [ ] The VoiceOver (iOS 26) and TalkBack (Android 16) scripts have been run, their failures fixed and the results recorded in the PR.
- [ ] The forced-colours checks pass on every page.
- [ ] Low-end mode uses the `scaleX` stretch, drops the grain blend and loads the smallest posters.
- [ ] axe, the long-task gate and the bundle budget pass on every page of three fixtures.

### Step P7.16: Gallery review and admin soft launch

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-11-25 to 2026-11-27. **Depends on:** P7.11, P7.12, P7.15, P4.16.
- **Findings addressed:** none (design or research item)

**Objective.** Review the gallery with the owner and fix what blocks sign-off, then confirm the admin soft launch on 2026-11-27, which meets the "Gallery signed off and admin soft launch" milestone. Because admin-audience generation has run on production data since 2026-11-20 (P7.8), this step is a sign-off, not the first shakedown.

**Guidance.**
- **Review, 25 to 27 November.**
  - Run `npm run rewind:gallery` on the release candidate, then walk through `/admin/rewind/gallery` with the owner at phone and desktop sizes.
  - Keep the checklist in `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/gallery-signoff.md`. It covers:
    - each page against its mockup and design 4.3;
    - archetype names and long titles never broken inside a word;
    - title cards wherever art is missing, and the `tz.note` wording;
    - the privacy lines, and no name on unsigned cards;
    - the pocket edition and the postcard, including P7.3's habit rule;
    - the cut decisions for People, Setup and Next year.
  - Log each issue as a GitHub issue labelled `rewind-signoff` with P0, P1 or P2. Fix every P0 before 27 November. P1s move into P8's window or are cut through `rewindDisabledPages`.
  - **Hard cutoff for sign-off fixes: 12:00 on Monday 2026-11-30, server time.** A fix that misses it waits for the 12:00 deploy on 1 December, or its page or feature is turned off through `rewindDisabledPages`. P8.1 tags the commit that is on main at that time.
  - The owner records the sign-off in the file. Thanksgiving falls on 26 November, so the review is an owner calendar item on 25 November (about three hours) and 27 November (about two hours), and the launch may slip to 29 November without moving 1 December.
- **Production preflight.**
  - The soft-launch release is the commit on main at the 2026-11-24 release cut, plus sign-off fixes. Take a `pg_dump`, then deploy through P1.10's path. It carries the last pre-season migration, P8.2's audience payload (P7.8) and notification fan-out (P7.14), P1.10's entrypoint and P4.17's hardened image, so all of them run for a week before 1 December.
  - Check that P4.16's redaction is live: open a share link and an invite, then search the logs for unmasked tokens.
  - `/admin/rewind`'s preflight is green: Redis, Tautulli 2.17 or later, the model recorded in `model-selection.md`, and no model retiring before 2027-01-02.
  - P0.20's strip script has run, and a second run reports zeros.
- **Turn on**, in P7.12's section: `rewindEnabled` on and `rewindAudience = admins` have been on since the 2026-11-20 admin runs; confirm them, `rewindLlmMode = standard` and the budget at its season value. Each change writes `CONFIG_CHANGED`.
- **Generate.** Run Prepare season, then Generate all, from `/admin/rewind`. Under the admin audience only admins are generated, with `through` at the end of 26 November in each zone, so their covers read "Data through 26 November". P8.2's Prepare on 1 December regenerates everyone through 30 November.
- **Verify on real data:**
  - every admin's issue completes, at under $0.03 per member (NFR-9);
  - each admin opens their issue on an iPhone, an Android phone and a desktop browser;
  - a share link is created, unfurled in Discord, rotated and revoked (P7.5's page);
  - the ready DM arrives inside the window, and `RewindView` rows appear;
  - any new P0 is filed as `rewind-signoff`.
- **Rollback.** Turning `rewindEnabled` off hides `/rewind` and the card at once, with no data lost. Members never see an issue while the audience is `admins`.

**Tests.** This step adds no test files. Its gate is P7.15's blocking specs plus the full CI suite (unit, golden fixtures, visual, axe, perf and E2E) green on the release commit, and `npm run eval:rewind`'s offline checks on the selected recordings. The sign-off file records the CI run ids.

**Integration.** P8.1 starts its freeze candidate from the signed-off commit, P8.2 switches the audience to `all` at 08:00 on 1 December, and the 2026-11-27 milestone is checked against the sign-off file and the season dashboard.

**Demo.** On 27 November the season dashboard lists every admin as `completed`, with its cost. An admin opens their real issue on a phone, and a member account sees no Rewind card.

**Done when.**
- [ ] The owner has reviewed the gallery and signed off, and no P0 sign-off issue is open.
- [ ] Log redaction is verified in production, and every sign-off fix merged by 12:00 on 2026-11-30.
- [ ] `rewindEnabled` is on with `rewindAudience = admins`, and every admin's issue is generated on real data.
- [ ] The cost, share-link, notification and view checks pass in production.

### Step P7.17: Rewind operator runbook

- **Track:** docs. **Lane:** hardening. **Effort:** M. **Window:** 2026-11-24 to 2026-11-25. **Depends on:** P1.10, P7.8.
- **Findings addressed:** none (design or research item)

**Objective.** An operator can run the Rewind season from `docs/rewind.md` alone: requirements, flags, the soft launch, the season-open checklist hour by hour, monitoring, roll back and the final cut. It is written by 2026-11-25, so the 30 November rehearsal (P8.1) and the season open (P8.2) follow it rather than writing it. This is the docs half of the former P8.7; its code half, the safe upgrade path, is P1.10.

**Guidance.**
- **`docs/rewind.md`**, the runbook:
  - requirements: Redis (with the FR-50 messages), Node 22 or later, Tautulli 2.17 or later (the preflight warns below it about CVE-2026-31799), optional Overseerr, Sonarr and LLM provider (template-only without one), and `REWIND_CACHE_DIR`;
  - flags: design 13.2, P7.12's fields, the part keys of `rewindDisabledPages` in the P7 header's cut order (plan-level cuts first), and P8.1's lock with its exception rule;
  - the season: before-season from 20 November, the admin-audience runs from 20 November, the soft launch, P8.2's checklist hour by hour (with the 12:00 cutoff on 30 November and the 18:00 deploy blackout), daily monitoring, Retry failed, the budget cap, an LLM outage, Redis down, a slow Tautulli, and the 429 and 503 share pages;
  - backups: a dump before every deploy that carries a migration, per P1.10's `docs/operations.md`, and the migration calendar in the P8 header;
  - the final cut (completed by P8.5), the staging dry runs (P8.10 and P9.2), and roll back: P7.9 per member, P8.5's bulk script, `rewindEnabled` off as the kill switch, and a restore from the dump as the last resort;
  - season close on 31 January, and the error codes an admin can see (`TAUTULLI_USER_NOT_FOUND`, `WORKER_LOST`, `JOB_LOST`, `NOT_ENTITLED`, `JOINED_LATE`, `REDIS_UNAVAILABLE`).
- CLAUDE.md's Additional Resources lists `docs/rewind.md` beside P1.10's `docs/operations.md`.
- On 30 November, P8.1 updates only the runbook text with the rehearsal's timings and any sign-off change; nothing else in the docs is written that day.

**Tests.** `__tests__/docs/rewind-runbook.test.ts`: every flag in `lib/validations/rewind-settings.ts` and every key of `REWIND_FEATURES` (P8.3, once it exists) appears in `docs/rewind.md`, and every backticked path in the file exists.

**Integration.** P8.1's rehearsal and P8.2's checklist follow this runbook. P8.3 to P8.5 add their sections when they merge, and P11.24 builds the deployment docs on it.

**Demo.** A reader who has not seen the plan finds, in `docs/rewind.md`, what to do at 00:15 and 08:00 on 1 December, how to roll back one member, and which key turns off People.

**Done when.**
- [ ] `docs/rewind.md` covers the requirements, flags and cut keys, the season-open checklist, monitoring, roll back, the final cut and the Tautulli 2.17 warning.
- [ ] It is merged by 2026-11-25, and the runbook test passes.
