# Golden fixtures: how the expected values were derived

The JSON files here are written by `npm run rewind:fixtures` from
`evals/rewind/profiles/*.ts`. Never edit them by hand, and never let tooling
write an expected value: every value in `expected` is a literal (or plain
arithmetic on literals) typed into a profile.

## Method

1. **Built to be counted.** Each profile is a regular pattern (a weekday
   rhythm, fixed runtimes, explicit dates) chosen so that its totals,
   counts, streaks, gaps, peaks and ladders follow by arithmetic. The
   arithmetic sits in a comment next to each value in the profile.
2. **Checked a second way.** `evals/rewind/hand-tally.py` recomputes the same
   figures from the fixture JSON with Python's `zoneinfo`, sharing no code
   with `lib/wrapped/stats`. Run it with
   `python3 evals/rewind/hand-tally.py evals/rewind/fixtures/<id>.json`.
   Where a profile says a value was "counted with the tally script", the
   arithmetic depends on where hundreds of plays land (the heavy fixture's
   hour histogram, the 200-title list's milestone dates), so the tally is
   the derivation.
3. **Never copied from the module.** `__tests__/golden-stats.test.ts` runs
   each fixture through `fixture-source.ts` and the P2.7 modules and compares.
   When the two disagree, the PR decides which is wrong, with a test; a
   changed hand value needs the owner's review and a line in the change log
   of `evals/rewind/README.md`.

Shares are stored as the ratio of two counts (`ratio(423, 1258)`) and compared
to 9 decimal places.

## Facts, archetypes, pages and the P2.8 stats (P2.16)

`expected.facts`, `edition`, `archetype`, `omittedPages` and the P2.8 stats
sections (`taste`, `people`, `devices`, `requests`, `nextYear`) were derived
again in P2.16, independently of `lib/wrapped`:

1. **`hand-facts.py`** recomputes, from the fixture JSON, each archetype's
   score from P2.9's scorer table (with design 7.6's gates and tie-break
   order), the page rules and edition of design 4.3 and 4.5 (as
   `evals/rewind/README.md` states them), the P2.8 stats from the plan's
   "as merged" definitions (genre minutes split evenly, every credited
   actor earning a title's minutes, device shares over every play, requests
   joined through cached guids, left-for-later and library picks), and the
   en-US display of the facts the profiles check. Run it with
   `python3 evals/rewind/hand-facts.py evals/rewind/fixtures/<id>.json`.
2. **Facts that restate a hand-checked stat** (the calendar, streak, gap,
   clock times, milestones, race, lifetime) take their value from that stat
   in the profile and only their display from the en-US rules: U+00A0
   between number and unit, "Month D" dates, floored durations without
   zero parts, ceil for "Top N%".
3. **`__tests__/golden-facts.test.ts`** compares them with the code; a
   snapshot of every fact's display catches drift in the facts nobody
   checked by hand. Every value matched on first run once the two module
   fixes below were in.

## Per fixture

| Fixture | How the values follow |
|---|---|
| `heavy` | Built to the mockup: series 52,320 + films 26,100 = 78,420 minutes; 586 episodes, 31 series, 112 films (`heavy-plan.ts`). 45 days off chosen by hand: 1 and 25 March bound the 2-24 March streak, 4-12 May is the 9-day gap. 4 July is built from four films and three episodes (744 minutes); every other day is capped at 600. A cumulative-minutes curve lands each milestone on its mockup date. The race runners are pinned to months (Severance +330 a month, Rings of Power from September) so the lead changes once, in November, by 50 minutes. The late-start pattern was tuned until the tally read 423 of 1,258 plays after dark (33.6%, "34%"); the median, latest start, deepest binge and busiest day and week are tally values. Lifetime rows: 2023 from 11 Feb, 2024, 2025 to 30 Nov = 66,458 (+18%), December 2025; 3,940 hours in all. |
| `median` | 45 weeks x (60 + 60 + 120) = 10,800. Mondays, Wednesdays and Saturdays never touch, so the streak is 1 and the gap 2. 2025: 90 x 100 = 9,000, so +20%. One hidden film stays in the totals and leaves the lists. |
| `light` | The pocket mockup: 122 + 82 + 48 = 252 minutes in six plays; the 7 March episodes are a 3-minute-gap binge. |
| `postcard` | Two partial plays of one episode, 7 + 5 minutes, the same morning: same title, same day. |
| `extreme` | 312 days x 2 x 1,200 = 748,800 minutes; one stream live. Milestones at 40 hours a day: days 100, 125, 188 (first stream) and 250. |
| `seven-minutes` | 160 + 170 + 110 seconds = 440 s = 7 minutes (the parts floor to 5 + 1); the 110 s sample is under 120 s and 90%, so it adds minutes but no count. |
| `zero-films` | 48 Saturdays x 300 + one Sunday of 10 x 25. Longest binge (most minutes) and deepest (most episodes) are different binges. |
| `zero-series` | Film j runs [100..150][(j - 1) % 6]; plays listed one by one with their running total in the profile. |
| `single-title` | 48 Sundays x 3 x 22. The first week is clipped to 1 January. |
| `night-owl` | Friday binges cross midnight, so a binge's day differs from its night; hour counts 48/48/48/95/24 are listed in the profile, and the race overtake is month 9 from cumulative Wednesday counts. |
| `weekend-binger` | 20 weekends x 330 in the Sydney server zone, across the April DST change. |
| `rewatcher` | 15 x (81 + 116 + 117) + 12 x 22; the running total to each rung is in the profile. |
| `explorer` | 100 films on odd days, 30 pilots on even days to 1 March: days 1-61 all active. Every fifth film runs 100 minutes, the rest 25: 20 x 100 + 80 x 25 + 30 x 50 = 5,500. 130 titles in 91.7 hours is 14.2 per 10 hours (Explorer 100); films are 73% of minutes over 100 films (Festival Juror 98); hour 21 holds 30 of 130 plays (Golden Hour Viewer 92). |
| `credits-roller` | 16 films on the 8-runtime cycle (2 x 1,040) + 5 x 65 + 8 x 60 = 2,885; every play 100%, so completion scores 80. Films are 72% of minutes over 16 films (Festival Juror 74), the peak hour is 3 PM (Golden Hour Viewer 0), and no binge or weekend habit stands out. |
| `premiere-chaser` | Each play listed with its date; 26 of 30 within a day of release. |
| `no-overseerr` | 25 weeks x 220; the race tie-breaks are worked month by month in the profile. |
| `solo-server` | 27 Sundays x 180 + 22 x 30 + 294; 2025 is 48 x 100, so +21.1%. |
| `long-and-email-name` | 26 x 110 + 26 x 45; the name rules are facts, not stats. |
| `long-and-non-latin-titles` | 137 x 100 + 63 x 50, then Dune (2021) +155 and Fargo (2014) +50. Milestone dates from the tally (the list order sets them). |
| `hostile-titles` | Each play listed; the running total reaches 600 with Oppenheimer on 7 June. |

## What the goldens found

- `rankTitles(events, ctx, kind)` disambiguated titles only within the kind it
  was asked for, so the series list said "Fargo" while the bookends (ranked
  over everything) said "Fargo (2014)". Design 7.2 adds the year "when two
  keys share a title"; the fix settles display titles across every listed
  title before filtering by kind (`lib/wrapped/stats/rank.ts`, with a test).
- P2.16: the title lists, the quiz and the longest film took titles with
  no counted play, so `seven-minutes` listed a 110-second sample of The
  Simpsons as its No. 1 series; design 7.2 lists only counted plays
  (`lib/wrapped/stats/titles.ts`, with a test). And `normalizeTimeZone`
  returned ICU's legacy zone ids, so `tz.label` read "Asia/Saigon" for a
  member who chose Asia/Ho_Chi_Minh (`lib/utils/zoned-time.ts`, with a test).
- P2.16: `credits-roller` and `explorer` did not express their profiles
  (both scored Festival Juror), so their rows were rebuilt with the same
  intent; their stats were derived again.
- Every other hand value matched the P2.7 modules on first run, under
  `TZ=UTC`, `TZ=Australia/Sydney` and `TZ=America/Los_Angeles`. The mismatches
  met while building were in the fixtures (an episode-key collision, a film
  runtime miscounted, placeholder milestone dates) and were fixed there.
