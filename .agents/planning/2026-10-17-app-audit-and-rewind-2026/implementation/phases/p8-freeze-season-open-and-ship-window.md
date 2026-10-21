> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 8: Freeze, season open and ship window

**Goal.** Rewind's freeze and ship window (`design/rewind-2026-design.md` 13.1, NFR-13). It delivers:
- the freeze candidate on 2026-11-30: the last prompt edits, `rewind-2026.1` and the freeze lock, then tag, dump, deploy and rehearse, with nothing else landing that day;
- the season open on 2026-12-01: Prepare at 00:15 in the westernmost Rewind zone with data through 30 November, the audience switched to everyone at 08:00, one ready notification per member, and the validator run against production on 2026-12-02;
- the P1 items behind default-off flags (the race scrubber and replay, Pick a day, the calendar grid, first-tap completion, Compare with 2025, Edit card, Save all and the remaining Notes), the playground swap (P8.8), the validator and the final-cut job, all by the 2026-12-10 feature freeze;
- the CI freeze gate (P8.9) and a first final-cut dry run on staging (P8.10), both before the 2026-12-14 code freeze.

The season-open release is the soft-launch release plus its sign-off fixes. Everything it needs merged by the 2026-11-24 release cut: P1.10's upgrade path, P7.8's generation audience, P7.14's notification fan-out and P7.17's runbook (by 2026-11-25), so the soft launch exercised all of it. The final-cut batch adapters (formerly P8.6, a P2 item) are dropped for 2026: the saving was about $0.05 per 100 members, and the final cut runs interactively, as P8.10 and P9.2 rehearse it.

**Window.** 2026-11-30 to 2026-12-11. Milestones inside it:
- 2026-12-01, "Model freeze and season open": the model, `rewind-2026.1` and the catalogue are frozen; Prepare ran with data through 30 November; the audience became `all` at 08:00; 100% of eligible members have a completed Rewind, and the ready notifications went out (P8.1, P8.2).
- 2026-12-04, "Hardening track done": P4.11 and P4.13, P6.1's AdminShell and the late P0 items P7.6 and P7.13 have merged.
- 2026-12-10, "Feature freeze": every Rewind P0 and P1 row of Appendix D is merged, or cut through the cut list and `rewindDisabledPages`; the validator, the final-cut job and the freeze gate (with `CODE_FREEZE` off) are merged.
- 2026-12-11, "First final-cut dry run": P8.10 ran on staging with `--through=2026-12-10`, and the validator reported zero failures.
- 2026-12-12, "Rewind ship complete": every Appendix D row is verified in production, row by row in `ship-check.md`; `docs/rewind.md` is published (P7.17), and `RewindView` and `RewindShare` rows are recording (P7.14).
- 2026-12-14, "Code freeze": the owner sets `CODE_FREEZE` to `on` at 00:00, and from then on only data or security fixes merge, until the final cut (P9.3) has finished.

No new feature code lands from 10 to 12 December. Every P1 feature ships with its flag off (P8.3's `rewindFeatureOn`). The owner turns each flag on in production after checking it on the heavy test member, and records the enable, with the date and the check, in `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/ship-check.md`, which walks Appendix D row by row. A flag that misbehaves stays off, which is the cut list in action.

**Tracks.** The Rewind lane runs P8.1 on 30 November and P8.2 on 1 December, then P8.5 (validator first), P8.3 and P8.4, then P8.10. The UI lane runs P6.1, P7.6 and P7.13 from 3 December, then P8.8. The hardening lane runs P4.11 and P4.13, then P8.9. Each lane keeps at most two PRs open.

**Calendar rules.**
- **30 November is tag, dump, deploy and rehearse.** Sign-off fixes merge by 12:00 server time (P7.16's cutoff). P8.1 then tags `rewind-2026.1`, the owner takes the dump and deploys by 18:00, and the staging rehearsal of P8.2 runs that evening. Nothing else merges that day.
- **Deploy blackout.** Nothing deploys between 18:00 on 2026-11-30 and 12:00 on 2026-12-01, server time. Other work merges to main from 12:00 on 1 December, and the noon deploy carries no sign-in-path change.
- **Sign-in path.** No change to sign-in, callback, invite, onboarding or subscribe merges between 2026-11-25 and 2026-12-10, except a security fix. The January moves (P10.23 to P10.28) keep those screens out of the window.
- **The freeze holds from 2026-12-01.** P8.3 to P8.5 and P8.8 add no fact id, copy slot, prompt text or other content that the lock covers. They read the page data that the season generation already stored (page 02's 2025 series from P7.4, page 10's per-day minutes and titles from P5.7, page 11's frames from P7.1), so no member is regenerated for a P1 feature; P8.1 only verifies that this data exists.
- **Migration calendar.** No migration merges between 2026-11-25 and 2027-01-02, except as a named freeze exception that ships through P1.10's backup-first path (a dump, then `SKIP_MIGRATIONS=true` on all but one replica). The last pre-season migrations, all in the soft-launch release, are:

  | Step | Migration | Due |
  |---|---|---|
  | P0.5 | `clear_jellyfin_username_emails` | 2026-10-21 |
  | P0.20 | `llmusage_text_nullable` | 2026-10-22 |
  | P2.1 | `rewind_2026` | 2026-10-23 |
  | P1.2 | `drop_user_watch_intent` | 2026-10-27 |
  | P2.2 | `rewind_season_month_day` | 2026-10-27 |
  | P4.6 | `audit_log` | 2026-11-06 |
  | P4.7 | `user_session_version` | 2026-11-10 |
  | P5.9 | `prompt_template_kind` | 2026-11-12 |
  | P7.7 | `rewind_exclusion_title` | 2026-11-17 |
  | P4.10 | `stripe_event_processing` | 2026-11-19 |
  | P4.20 | `llm_spend_caps` | 2026-11-19 |
  | P7.14 | `RewindView` unique index, only if P2.1 lacks it | 2026-11-20 |
  | P4.18 | `discord_last_watched_hours` | 2026-11-24 |

  The next migrations are January's: P11.28, P11.2, P10.21, P11.32, P10.24, P10.2, P10.6, P11.8, P11.1, P11.3, P10.10 and P11.18. A `__tests__/config/migration-calendar.test.ts` reads the timestamps of the folders in `prisma/migrations` and fails if any falls between 2026-11-25 and 2027-01-02 without a matching entry in `season-log.md`'s exception list.

**Ordering that matters.**
- `lib/rewind/features.ts` is created by P8.3 and extended by P8.4. Both add their keys to P7.12's `lib/validations/rewind-settings.ts`.
- `lib/wrapped/pipeline/copy-step.ts`: P8.1 adds the frozen model, then P8.5 the `changed-slots` policy. Rebase in that order.
- `lib/queue/jobs/rewind.ts` and `JOB_TYPES`: P8.5 adds `REWIND_FINAL_CUT`. `lib/rewind/stage/keymap.ts` and `use-stage-gestures.ts` change in P8.3 only.
- `docs/rewind.md` is P7.17's, and P8.3 to P8.5 each update their section when they merge.

### Step P8.1: Freeze candidate: tag, dump, deploy and rehearse

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-11-30 to 2026-11-30. **Depends on:** P7.16, P5.13, P7.17.
- **Findings addressed:** none (design or research item)

**Objective.** Open the season on a measured prompt and a model that cannot drift. Make the last prompt edits, drop the release-candidate suffix so `PROMPT_VERSION` reads `rewind-2026.1`, and commit a lock that fails CI if the model, the prompt or the fact catalogue changes. Then tag, dump, deploy and rehearse; 30 November carries nothing else. Re-check the frozen models' prices on 2026-12-01.

**Guidance.**
- **Start** from the commit on main at 12:00, P7.16's cutoff for sign-off fixes. The only copy changes allowed on the day are `rewind-signoff` issues labelled copy or prompt, merged before that time.
- **Last prompt edits** in `lib/wrapped/prompt/rewind-2026.ts`. Then run the offline gate (`npx jest evals/rewind`) and one full sweep of the selected model: `npm run eval:rewind -- --model=<selected> --judge=<other family> --record` (one candidate sweep from P2.10's budget). Freeze only at 98% or more first-pass grounding (design 8.6); otherwise revert the edit that caused the drop. The new recordings replace the selected model's, so P5.13's CI gate and P5.9's golden snapshots run on the frozen text.
- **Version.** `PROMPT_VERSION = 'rewind-2026.1'`, dropping P5.13's `-rc.N` suffix. As `cacheKey`, it becomes OpenAI's `prompt_cache_key` (design 8.1).
- **Checks before freezing.**
  - An LLM slot in `lib/wrapped/copy/slots.ts` that lists `window.finalCut` as an identity fact re-calls the LLM for every full-issue member on 1 January, which would break P9.2's under-30% target. Window wording belongs to templates (design 8.3), so that list should be empty, or each entry needs a reason recorded in the lock.
  - Verify that the stored page data holds what P8.3 and P8.4 render: page 02's `lastYearDaily` (P7.4), page 10's per-day minutes with a top `ratingKey` and the key-to-title map (P5.7), and page 11's `frames` (P7.1). Their schema tests already guarantee it; this check runs the validator's page-schema pass over one admin's soft-launch issue. Nothing is added to the data contract on this day.
- **The lock.** `scripts/rewind-freeze.ts --write` writes `lib/wrapped/freeze/rewind-2026.1.lock.json` with `frozenAt: '2026-12-01'`, and `--check` compares. It holds sha256 values of P2.9's `canonicalJson` for:
  - the prompt: `PROMPT_VERSION`, `systemPrompt('')`, `z.toJSONSchema(RewindCopyV3Wire)`, `COPY_SLOTS` (ids, `maxChars`, `allowedFacts`, `identity` and `bands`), the grounding lists (banned phrases, number words, quantifier thresholds and the word-list hash), the 60 poster lines and the slot fallback templates;
  - the catalogue: `CATALOGUE_VERSION` and each entry's id, group, unit and format. `statsVersion` stays outside, because a stats bug fix is a data fix;
  - the model: `{ provider, modelId, budgetModelId, effort: 'low', maxOutputTokens: 1800 }` from `evals/rewind/selected.json`.
  - Headlines, Notes and UI strings are outside the lock, so typo fixes and P8.3 and P8.4's text never trip it. Changing the lock needs a reason line, the owner's sign-off in the PR and a new version (`rewind-2026.2`). After 2026-12-14 only a data or security fix qualifies.
- **The model at runtime.** `getFrozenRewindModel()` in `lib/llm/registry.ts` returns the lock's model with the key of the active `wrapped` `LLMProvider` row. If the row names another provider, the copy step uses templates and logs one warning, and P7.8's preflight row turns red. `updateLLMProviderForPurpose` (`actions/admin/admin-llm-providers.ts`) refuses a provider or model change for `wrapped` from `rewindSeasonOpens` to `rewindSeasonCloses` ("Rewind's model is frozen until the season closes on 31 January"), because member and hide regenerations still run after the final cut. Key rotation and the assistant's purpose stay open, and `rewindLlmMode` remains the emergency switch.
- **Ship.** Tag the commit `rewind-2026.1` and deploy it on 30 November through P1.10's path: a dump first, then the deploy, before 18:00. The release carries no migration (the P8 header's calendar), so `prisma migrate status` reports nothing pending. `/admin/rewind` then shows the model, `rewind-2026.1` and "Frozen 1 December".
- **Rehearse** on staging that evening: P8.2's `scripts/rewind-season-open.ts --rehearse` (it refuses unless `REWIND_STAGING=1`) enqueues the season-open Prepare at once with `audience: 'all'`, then the audience is switched. Record the timings in `ship-check.md`, and update only the timings and any sign-off change in P7.17's runbook.
- **Prices on 2026-12-01** (design 8.2). Compare the `lib/llm/models.ts` entries for the frozen default and budget models, the judge and `gemini-4-argon` (whose price doubles that day) with the providers' price pages. Update changed prices with `asOf: '2026-12-01'`, confirm `retiresOn` is after 2027-01-02, and append the check to `model-selection.md`. Prices are not frozen; `costUsd()` takes the dated entry.

**Tests.**
- `lib/wrapped/freeze/__tests__/rewind-freeze.test.ts` recomputes every hash and compares it with the lock, and a failure names its section ("systemPrompt changed"). Cases prove that one changed word in the system block, a new fact id and a moved band threshold each fail, while a headline change passes.
- `scripts/__tests__/rewind-freeze.test.ts`: `--check` exits 1 on drift, and the locked model is priced, supports structured outputs and does not retire before 2027-01-02 according to `lookupModel()`.
- `actions/__tests__/admin-llm-providers.freeze.test.ts`: a `wrapped` model change is refused on 2026-12-05 and allowed on 2027-02-01; a key rotation is allowed; the assistant is never blocked.
- `copy-step.test.ts` gains the mismatched-provider case (template copy and one warning), and `models.test.ts` checks that the frozen pair carries `asOf` 2026-12-01 or later.

**Integration.** CI runs `npx tsx scripts/rewind-freeze.ts --check` next to Jest. P7.8's preflight reads the lock, P7.10's dry runs and P8.8's playground can still try other prompt versions, and P8.5 calls `getFrozenRewindModel()`. `docs/rewind.md` (P7.17) explains the lock and its exception rule, and P8.1 checks the selected model against the committed `evals/rewind/results/*.json`.

**Demo.** Change one word of the system block, and `npx jest rewind-freeze` fails naming it. Switching the Rewind model in settings is refused with the freeze message, while rotating the key works. The season dashboard shows the frozen model and version.

**Done when.**
- [ ] The last prompt edits reach 98% or more first-pass grounding on all 20 fixtures, and their recordings are committed.
- [ ] `PROMPT_VERSION` is `rewind-2026.1`, and the lock covers the model, the prompt and the catalogue, with a CI check that fails on any change.
- [ ] The Rewind model cannot be changed in settings until the season closes, and a provider mismatch falls back to templates.
- [ ] The page data that P8.3 and P8.4 need is verified in the stored soft-launch issues, with no change to the data contract on the day.
- [ ] The tag, the dump and the deploy happened before 18:00 on 30 November, and the staging rehearsal's timings are in `ship-check.md`.
- [ ] Prices were re-checked on 2026-12-01 and recorded in `model-selection.md`.

### Step P8.2: Season open

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-12-01 to 2026-12-01. **Depends on:** P8.1, P7.8, P7.14.
- **Findings addressed:** none (design or research item)

**Objective.** Generate every member's issue overnight with data through 30 November, check it, then open Rewind to everyone at 08:00 and send each member one ready notification. The step is done when 100% of eligible members have a completed Rewind.

**Guidance.**
- **Code.** This step merges no code. Its two former code changes, the generation audience in the Prepare payload and the notification fan-out on the audience switch, are P7.8's and P7.14's, in the soft-launch release.
- **30 November, evening.**
  - The season-open release is live with P8.1's lock, deployed through P1.10's upgrade path, and the pre-deploy dump is kept (encrypted, off the host, for 30 days).
  - `/admin/rewind`'s preflight is green: Redis, Tautulli 2.17 or later, the frozen model priced, the budget cap at its season value, and the expected entitlement skip count.
  - The dashboard shows the run time ("02:15 in America/Chicago, which is 00:15 in America/Los_Angeles") and "generates for Everyone", and the delayed job `rewind:prepare:2026:<through>` is in BullMQ.
  - `rewindEnabled` is on, `rewindAudience` is `admins` and `rewindLlmMode` is `standard`.
- **00:15 in the westernmost zone.** Prepare runs the aggregate (through 30 November 23:59:59 in each member's zone), the metadata warm batches and Generate all, at about 10 to 15 minutes per 100 members (design 9.5). The admins' soft-launch issues ("Data through 26 November") are regenerated with the rest.
- **00:15 to 08:00: verify on the dashboard.**
  - Every eligible member is `completed`; use "Retry failed" until no failure is left. Template copy counts as completed (design 1.4).
  - Each skip carries an eligibility reason, not an error: `NOT_ENTITLED`, `NO_PLEX_IDENTITY`, `TAUTULLI_USER_NOT_FOUND`, `MANAGED_ACCOUNT` or `JOINED_LATE`.
  - Spend stays under $0.03 per member and under the cap, with no budget banner.
  - The admins open their own issues on a phone and see "Data through 30 November". Members' issues are checked through counts and validation only, because each admin preview writes an audited read (P7.9).
- **08:00 in the server zone.** The owner sets Audience to "Everyone" in P7.12's section. That writes `CONFIG_CHANGED`, fans out the notifications, and turns each member's RewindCard from before-season to ready with its unread pip (P6.9, P7.14).
- **During the day:** DMs arrive inside each member's window, `RewindView` rows appear as members open their issues, new share links work, and no new P0 issue is open.
- **2 December:** once P8.5's first PR (the validator) merges, run `scripts/rewind-validate.ts --year=2026` read-only against production from a checkout. It must report zero failures for the 1 December generation; any failure is a data fix with a regeneration of the affected members.
- **If something breaks:** `rewindEnabled` off hides Rewind at once with no data lost, a bad issue is rolled back per member (P7.9), and an LLM outage still leaves complete template-copy issues (design 8.5). P7.17's `docs/rewind.md` has the full list.

**Tests.**
- The unit tests for the two former code changes live with P7.8 (eligibility and the Prepare payload) and P7.14 (the fan-out).
- `e2e/rewind/season-open.spec.ts`: under `admins`, a member sees the before-season card while an admin sees the ready card; after the switch, the member sees the ready card with its pip.
- Rehearsal on staging on 30 November (P8.1): `scripts/rewind-season-open.ts --rehearse` enqueues the season-open Prepare at once with `audience: 'all'` (it refuses unless `REWIND_STAGING=1`), then the audience is switched, and the timings go into `ship-check.md`.

**Integration.** `ensureSeasonPrepareScheduled()` (P7.8) is the only scheduler, and P7.12's save is the switch, which runs P7.14's fan-out. The dashboard's counts prove the 2026-12-01 milestone, and P7.17's runbook carries this checklist. Daily monitoring continues into P9.1.

**Demo.** At 07:55 the season dashboard shows every eligible member completed, each skipped member with a reason, and the season spend. At 08:00 the owner switches the audience: a member's home card turns ready, and their Discord DM arrives inside their window.

**Done when.**
- [ ] Prepare ran at 00:15 in the westernmost Rewind zone with data through 30 November, for every eligible member.
- [ ] 100% of eligible members have a completed Rewind, and every skip carries an eligibility reason.
- [ ] `rewindAudience` became `all` at 08:00, and each member received one ready notification inside their window.
- [ ] `RewindView` rows are recording, and spend is within the cap and under $0.03 per member.

### Step P8.3: P1 story features

- **Track:** rewind. **Lane:** Rewind. **Effort:** M. **Window:** 2026-12-02 to 2026-12-03. **Depends on:** P7.1, P5.3.
- **Findings addressed:** none (design or research item)

**Objective.** Add four P1 interactions on the season's stored data, each behind its own default-off flag: the race scrubber and replay (FR-8), the "Pick a day" sheet, the roving-focus calendar grid where cells are 24 px or more (FR-9), and a first tap that completes a running count-up (FR-15).

**Guidance.**
- **Flags, default off.** New `lib/rewind/features.ts` exports `REWIND_FEATURES` (`race.scrubber`, `calendar.day-picker`, `calendar.grid` and `stage.tap-completes`; P8.4 adds its own) and `rewindFeatureOn(config, key)`.
  - Every P1 feature is off until the owner enables it: `rewindFeatureOn` returns true only when `Config.rewindDisabledPages` holds the enable entry `+<key>` (for example `+race.scrubber`) and not the plain key. The array already exists, and P7.2 extended it with part keys, so no migration is needed. A deploy can therefore never switch an unchecked interaction on for every member; there is no "add the key before the deploy" step to forget.
  - P7.12's section lists the keys under "Features added in December" as switches that write or remove the `+` entry, each audited as `CONFIG_CHANGED`. The owner records every enable in `ship-check.md` (P8 header).
  - Server Components read the flags and pass booleans to the islands. The scrubber is on the design's cut list (design 13.3); off, the race keeps its autoplay and static final frame.
- **Keymap first.** P5.2's `keyToCommand` turns pages on arrow keys anywhere in the stage, which would fight a slider or a grid. Add `isCompositeWidgetTarget(target)`: inside `[role=slider]`, `[role=grid]`, `[role=radiogroup]` and `[role=tablist]`, the arrows, Home, End and Page keys belong to the widget. Esc still closes.
- **Race scrubber and replay** (`components/rewind/pages/race-controls.tsx`, design 4.3 page 11), in P7.1's empty slots:
  - after the single autoplay run, or at once on a revisit or under reduced motion, show `Slider` from `components/ui/slider.tsx` (`rewind-race-scrubber`, `data-rw-interactive`). It runs from 0 to `frames.length - 1`, which is 11 frames during the season and 12 after the final cut, and `getAriaValueText` gives the month from `Intl.DateTimeFormat(Config.locale, { month: 'long', timeZone: 'UTC' })`;
  - Replay (`rewind-race-play`, `ink-outline pill`) reruns P7.1's animator from January;
  - `race-animator.tsx` gains `seek(frame)`, which sets each bar's `scaleX` and `translateY` from `lib/rewind/viz/race.ts` and the race clock, with no React commit per frame;
  - pointer down or focus dispatches `INTERACT_START`, and release or blur `INTERACT_END`, so autoplay pauses while scrubbing;
  - a page-level `aria-live="polite"` line, debounced by 400 ms, reads "Standings after August: Severance first, Shogun second, ...".
- **Pick a day** (`components/rewind/sheets/day-picker-sheet.tsx`, `Sheet side="bottom" grabber`, `rewind-day-picker-sheet`):
  - the 44 px "Pick a day" button (`rewind-day-picker`, `ink-outline pill`, `aria-haspopup="dialog"`) fills P5.7's slot under the grid and dispatches `OPEN_SHEET`;
  - the month selector is a `SegmentedControl` (`aria-label="Month"`) laid out as two rows of three-letter months, each with a 44 px hit area, opening on the month of the biggest day;
  - each day is a 44 px row, such as "4 Jul, 12 h 24 m, mostly *The Bear*", and a day without plays reads "4 Jul, no plays". Titles hidden through P7.7 are already gone from the regenerated page data;
  - closing resumes autoplay only if it was playing (`CLOSE_SHEET`).
- **Calendar grid** (`components/rewind/calendar/calendar-grid.tsx`) in P7.4's calendar Notes and P5.12's article mode. The server renders P5.12's month tables, which stay readable without JavaScript. On hydration the island adds `role="grid"`, `row`, `rowheader` (the month) and `gridcell` with a roving `tabindex` (one cell 0, the rest -1). Left and Right move a day, Up and Down move to the same date in the next month row (clamped), and Home and End go to the row's ends. Each cell is labelled with its day-row text, and Enter shows it in a detail line under the grid.
- **First tap completes a count-up** (design 4.6). New `lib/rewind/stage/running-animations.ts` keeps a per-page set of handles with `complete()`: P5.5's odometer and the nameplate stretch register their Motion controls, and CSS and WAAPI animations come from `article.getAnimations({ subtree: true })`, leaving out `.rw-progress`. In `use-stage-gestures.ts`, a forward tap first calls `completeRunning(page)`; if that finished something, the tap stops there, otherwise it dispatches `NEXT`. Swipes, keys and buttons always advance, and the dwell is untouched.
- Each island loads through `next/dynamic` and stays inside the 12 KB page-chunk budget.

**Tests.**
- `lib/rewind/__tests__/features.test.ts`: on a fresh `Config` every `REWIND_FEATURES` key is off; `+race.scrubber` turns that one on; a plain `race.scrubber` beside it turns it off again; an unknown `+key` is rejected by P7.12's schema.
- `lib/rewind/stage/__tests__/keymap.test.ts`: arrows inside a slider, a grid cell or a radio return no command, and Esc still closes.
- `components/rewind/pages/__tests__/race-controls.test.tsx` (user-event): the controls appear after the run, and at once under reduced motion; ArrowRight gives `aria-valuetext` "September"; the live line updates once per debounce; dragging pauses autoplay; Replay restarts; a 12-frame fixture reaches "December"; with the flag off neither control renders.
- `components/rewind/sheets/__tests__/day-picker-sheet.test.tsx`: the arrows move the month; rows are 44 px with the right text, including "no plays"; a hidden title never appears; opening pauses, and closing resumes only from `playing`.
- `components/rewind/calendar/__tests__/calendar-grid.test.tsx`: the server render is a plain table; after hydration exactly one cell has `tabindex="0"`; the arrows, Home and End move focus.
- `lib/rewind/stage/__tests__/running-animations.test.ts` and a `story-stage` case: the first tap completes the odometer and the second advances; `.rw-progress` is never finished; with the flag off a tap advances at once.
- `e2e/rewind/p1-story.spec.ts` (chromium and webkit): the scrubber by keyboard and touch, Pick a day at 390x844 and 375x548, the grid at 1440x900, and first-tap completion on page 02. axe passes on the sheet and the grid, P7.15's perf gate stays green, and baselines cover the race controls, the open sheet and the Notes grid.

**Integration.** P7.1's race slots, P5.7's calendar slot, P7.4's Notes and P5.12's article calendar now hold real controls. The flags join P7.12's section and the flag table in `docs/rewind.md`, and the 10 to 12 December routine turns them on.

**Demo.** On the heavy member's race, the bars run once; scrubbing to August announces the standings, and Replay runs them again. On the calendar, "Pick a day" opens July at "4 Jul, 12 h 24 m, mostly The Bear". On desktop, the arrow keys walk the Notes grid without turning the page. On page 02, the first tap lands the odometer and the second turns the page.

**Done when.**
- [x] The race scrubber (Slider with month `aria-valuetext`) and Replay work by touch, mouse and keyboard, and pause autoplay while in use.
- [x] "Pick a day" opens a bottom sheet with a month selector and 44 px day rows.
- [x] The desktop Notes and article calendars are a grid with roving focus, and remain a table without JavaScript.
- [x] The first tap completes a running count-up or stretch, and the second advances.
- [ ] Each feature has its own flag, off on a fresh `Config` until its `+key` is set, and the unit, E2E, visual, axe and perf checks pass. (Flags and unit tests done; `e2e/rewind/p1-story.spec.ts` is written but not run, and no visual baselines were added: the coordinator runs E2E, axe and perf.)

(as merged: `lib/rewind/features.ts` exports `REWIND_FEATURES` (key and label), `rewindFeatureFlags(config)` and `rewindFeatureOn`; P8.4 appends its entries to `REWIND_FEATURES`, and `lib/validations/rewind-settings.ts` accepts each feature's `+key` and plain key through `REWIND_DISABLED_PAGE_ENTRIES`, with no further edit there. Server code passes the flags down as `IssueContext.features`, `NotesContext.features`, `ArticleContext.features` and `StoryStage`'s `tapCompletes`. The Notes and article calendar is a new `ArticleBlock` kind, `calendar`, holding the month tables (the server render) and the grid's month rows. The count-ups on page 02 are CSS animations, not Motion controls, so `running-animations.ts` finishes `article.getAnimations({ subtree: true })` only and keeps no handle registry. The Settings section lists the switches under "Features added in December". Owner: enable each `+key` in production after checking it on the heavy member, and record it in `ship-check.md`.)

### Step P8.4: P1 comparison, Edit card, Save all and remaining Notes

- **Track:** rewind. **Lane:** Rewind. **Effort:** L, 2 PRs. **Window:** 2026-12-04 to 2026-12-09. **Depends on:** P7.4, P7.6.
- **Findings addressed:** none (design or research item)

**Objective.** Add "Compare with 2025" on page 02 (FR-11, G8), Edit card on the centrefold and back-cover posters (FR-23, moved here from P7.6), "Save all {n} cards" as one ZIP built in the browser (FR-24), and Notes for the seven core pages that still show only their summary (FR-17), each behind a default-off flag. Two PRs: the comparison and the Notes first, then Edit card and Save all.

**Guidance.**
- **Flags.** Add `number.compare-2025`, `share.edit-card`, `share.save-all` and `notes.core` to P8.3's `REWIND_FEATURES`, all default off. With `notes.core` off, those pages keep their srSummary, which is the last item on the design's cut list (design 13.3); with `share.edit-card` off, the posters keep P5.11's default stats (plan-level cut 4).
- **Compare with 2025** (design 4.3 page 02).
  - `lib/rewind/viz/soundtrack.ts` gains `variant: 'compare'`. It takes both years' daily minutes over the window `time.vsLastYear` uses (1 January to 30 November during the season, full years after the final cut), smooths each to a trailing 7-day average on one shared scale, and returns an `above` path (2026, solid), a mirrored `below` path (2025, hatched) and legend anchors.
  - `components/rewind/pages/number-compare.tsx` is a client island around P3.7's `Toggle` (`rewind-compare-2025`, `aria-pressed`, `data-rw-interactive`, "Compare with 2025"). Pressing it crossfades the strip over 240 ms, or swaps it at once under reduced motion, and the figure's label becomes a compare summary ("2026 above, 2025 below, as 7-day averages. 2026 was ahead in 9 of 11 months.").
  - It reads P7.4's stored `lastYearDaily`. The toggle is hidden when that series is missing or sums to zero, like the stamp. Cards never show the comparison.
- **Edit card** (design 6.3, G9): `components/rewind/share/edit-card.tsx` (`rewind-edit-card`), in the share sheet for the centrefold and the back cover only.
  - "Three stats on the poster" is a P3.5 `Checkbox` group with the description "Choose three". Once three are checked, the rest are disabled.
  - The allow-list is `CardFactId` in `lib/wrapped/data/share-safe.ts`: hours, series hours, films, episodes, the percentile (offered only at top 25% or better), peak hour, longest streak, archetype rarity (a percentage on public cards), top genre and completion. `cardFactOptions(rewind)` filters it for each member.
  - The default stays P5.11's rule: when the poster's own graphic already shows a stat (the centrefold clock shows the peak hour), the next allowed stat takes its place. On the back cover, the chosen stats become the billing block's tail line.
  - Choices save to `RewindPrefs.cardFacts` through `saveRewindSharePrefs()`, and to an existing link through `updateRewindShare`. The owner route validates its `facts=` query against the member's options.
- **Save all cards** (`components/rewind/share/save-all.tsx`, `rewind-save-all`), in P5.7's back-cover slot and in P5.11's share sheet.
  - The label is "Save all {n} cards" through `Intl.PluralRules`, with `n = eligibleCards(rewind, options).length` (P7.6) under the current share options: 15 for the heavy member with Daily detail off.
  - Pin `fflate@0.8.2` exactly, and load it with `import('fflate')` on the first click, outside the 110 KB first-page budget.
  - Fetch the owner card URLs (P5.10's route, with the same options) three at a time, under an `AbortController` that cancels when the sheet closes. Each PNG is pushed into a streaming `Zip` as a `ZipPassThrough` entry, stored because PNG is already compressed, and named from the folio and registry name (`01-cover.png`, `02-the-number.png`). fflate's worker-based async API is not used, so the CSP needs no `blob:` worker.
  - A polite live region reads "Saving 4 of 15", then `rewind-2026-cards.zip` downloads through an object URL and `<a download>`. A 429 waits once for `retry-after`. If cards still fail, the ZIP keeps the rest and a toast reads "Saved 14 of 15 cards. Try again for the rest."
  - A lapsed member sees "Sharing needs an active membership" with a link to `/subscribe` (FR-51). Each Save all records one `save` share action through `recordRewindView` (P7.14).
- **Notes for the seven other core pages** (FR-17), as `notes(data, facts)` builders that return P5.12's `ArticleBlock`s, in new `lib/rewind/notes/*.ts` modules outside the frozen templates:
  - 01 Cover: the contents with folios, the data window with `tz.note`, and a line on the serial ("No. K7Q4 links your cards without naming you");
  - 02 The number: the counting rule, monthly minutes for both years, the milestone dates, and how 2025 was recomputed;
  - 03 Bookends: the first and last plays with date, time and zone, and links to the member's earlier Rewind years;
  - 04 Guess: only the rules until the quiz is answered or skipped in this session, then the top four series with minutes, so the Notes never spoil the quiz;
  - 06 Top films: every film in a table with plays, minutes and whether it was finished;
  - 09 The clock: the 24 hours and the 7 weekdays as tables, with the after-dark rule ("started 10 PM to 4 AM");
  - 18 Back cover: the billing block as a definition list, the eligible cards, and the privacy lines (admins can view, the AI disclosure, report a problem).

**Tests.**
- `lib/rewind/viz/__tests__/soundtrack-compare.test.ts`: 7-day averages on known series, one shared scale, the same window for both years in the season and after the final cut, and deterministic paths.
- `components/rewind/pages/__tests__/number-compare.test.tsx`: Space toggles `aria-pressed` and the summary; the toggle is absent without 2025 history and with the flag off; a tap on it never turns the page.
- `components/rewind/share/__tests__/edit-card.test.tsx` (user-event): a fourth box is disabled, the percentile appears only at top 25% or better, and the choice reaches the preview URL. An action test refuses a `facts=` id outside the member's options, and with the flag off the control does not render.
- `components/rewind/share/__tests__/save-all.test.tsx` (fetch mocked): 15 and 16 cards for heavy by Daily detail; the progress text; one failed card gives the partial toast; a lapsed member is blocked; one `save` action is recorded.
- `lib/rewind/share/__tests__/zip.test.ts` uses real fflate: `unzipSync` on the output gives the expected names and bytes.
- `lib/rewind/notes/__tests__/*.test.ts` on `heavy`, `median` and `light`: deterministic blocks, Guess hiding its answer until answered, and every time naming its zone.
- `e2e/rewind/p1-share.spec.ts` (chromium and webkit): `page.waitForEvent('download')` yields a ZIP with 15 entries; the compare toggle works on page 02; the seven Notes render at 1440x900 and 1366x768, with axe on the spread. Baselines cover the compare state and the Notes, and the first-page budget check still passes.

**Integration.** Save all fills the back-cover slot and the share sheet, and P7.4's Notes column renders the new builders. The flags join P7.12's section and `docs/rewind.md`. P9.1's success review counts the `save` actions.

**Demo.** On page 02, "Compare with 2025" mirrors last year under this one. On the back cover, "Save all 15 cards" downloads a ZIP that opens to 15 posters. At 1440x900 every core page has real Notes, and Guess shows its answer only after the quiz.

**Done when.**
- [ ] "Compare with 2025" is a Toggle with `aria-pressed`, draws mirrored 7-day averages on one scale, and is hidden without 2025 data.
- [ ] Edit card offers the three-stat allow-list on the centrefold and back cover, saved in the prefs and on links.
- [ ] "Save all {n} cards" builds the ZIP in the browser with fflate, and its count comes from `eligibleCards()`.
- [ ] The seven remaining core pages have Notes, and the Guess Notes never spoil the quiz.
- [ ] Each feature has its own default-off flag, and the unit, E2E, visual and budget checks pass.

### Step P8.5: Validator and final-cut job

- **Track:** rewind. **Lane:** Rewind. **Effort:** L, 2 PRs. **Window:** 2026-12-02 to 2026-12-07. **Depends on:** P5.9, P7.8.
- **Findings addressed:** none (design or research item)

**Objective.** On 1 January every issue is regenerated with the full year almost for free. Facts, pages and cards are recomputed, and the LLM is called only for slots whose identity facts changed or whose bands were crossed. The wording switches to "Final cut", and December's readers are told their issue now includes December. A read-only validator, the first of the step's two PRs, checks every stored 2026 Rewind: it runs against production on 2026-12-02, after the season generation, and again in every dry run and after the final cut.

**Guidance.**
- **PR 1, the validator** (by 2026-12-02). `scripts/rewind-validate.ts --year=2026 [--final-cut]` (tsx, read-only, run from a checkout, never shipped in the runtime image). Its pure core, `lib/wrapped/maintenance/validate-year.ts`, follows P0.20's layout. For every eligible member's 2026 row it checks that:
  - `parseStoredRewind()` returns version 3, and every page passes `registry[type].schema`, so the viewer would drop none;
  - every kept LLM slot passes `groundSlot` against the stored facts, and `copyMeta.slotHashes` equal `slotDependencyHash()`, and `factsHash` matches;
  - each active `RewindShare`'s `toShareSafe()` output passes P5.10's key allow-list;
  - with `--final-cut`, also that `window.finalCut` is true and `finalCutAt` is set.
  The script prints counts per code, never a title or a name, and lists skipped members by reason. Run it against production on 2026-12-02 and record the zero-failure result in `ship-check.md`.
- **PR 2, the final-cut job** (by 2026-12-07), below.
- **One window rule.** New `resolveDataWindow({ year, zone, now })` in `lib/wrapped/time/zone.ts` returns the season window (through 30 November 23:59:59.999, or the end of yesterday when earlier) until 1 January 00:00 in the member's zone, and the full year with `finalCut: true` after it. The fan-outs, member requests, admin regenerations, P7.7's hide runs and the stale sweep's re-runs all use it; otherwise a title hidden on 3 January would roll the issue back to "Data through 30 November".
- **`lib/wrapped/pipeline/final-cut.ts`** (design 7.1) exports the pure `planFinalCut(stored, next)`. For each slot of the selected pages it compares P5.8's `slotDependencyHash` with `stored.copyMeta.slotHashes`, and returns `keep` or `regenerate` with a reason: `identity-changed`, `band-crossed`, `page-newly-selected` or `edition-changed`. A changed archetype regenerates the archetype slots, and a pocket member who crossed into the full issue gets every slot.
- **Copy policy.** P5.9's copy step gains `copyPolicy: 'changed-slots'`. It keeps the stored text of `keep` slots and sends only the `regenerate` slots, on `getFrozenRewindModel()` and `rewind-2026.1`, with the same grounding, single repair and per-slot fallback. The season budget cap still applies, and `copyMeta.slotHashes` is rewritten for every slot.
- **`REWIND_FINAL_CUT`** on `rewind-batch` (dedup `rewind:final:{year}`, no retries) uses P7.8's step pattern:
  1. `REWIND_SERVER_AGGREGATE` for the full year (`through` 31 December), with archetype counts and medians;
  2. `REWIND_METADATA_WARM` for titles first watched in December;
  3. `REWIND_GENERATE_ALL` with `kind: 'final-cut'` (dedup `rewind:all:{year}:final-cut`), one child per eligible member with `copyPolicy: 'changed-slots'`. A member without a completed season issue gets a full generation, and `JOINED_LATE` stays skipped.
  Each write sets `PlexWrapped.finalCutAt` and `dataThrough`, keeps the season version in `previousData` (design 7.9), and prewarms the cards for the new `factsHash`.
- **Scheduling.** Generalise P7.8's helper into `latestLocalInstant(monthDay, time, zones)` in `zone.ts`. `ensureFinalCutScheduled(year)` keeps one delayed job for the latest 1 January 00:30 across `Config.timezone` and the members' zones, re-ensured at worker start and by the stale sweep. P7.8's "Run final cut" enables itself after that instant.
- **Wording** (design 9.6 step 4, FR-34, G12) comes from P5.8's templates keyed on `window.finalCut`, so nothing new is written: "Data through 30 November" becomes "Final cut", "December is still being written." and "so far" disappear, the stamp reads "+18% on 2025", the soundtrack's December fills in, the race gains a twelfth frame, and the small multiples lose the faded December. Check that every page schema accepts 12 months.
- **Notifications** (design 9.6 step 5). `REWIND_NOTIFY` gains `kind: 'final-cut'`, "Your {serverName} Rewind 2026 now includes December.", sent to members with a `RewindView` from before 1 January, from 09:00 on 2 January in their zone. The season send already set `notifiedAt`, so the claim compares two columns through a Prisma field reference, `updateMany({ where: { id, OR: [{ notifiedAt: null }, { notifiedAt: { lt: prisma.plexWrapped.fields.finalCutAt } }] } })`, and needs no new column. `getRewindNotice()` uses the same copy for them.
- **Dry runs** for P8.10 and P9.2. `scripts/rewind-final-cut.ts --year=2026 [--through=2026-12-10] [--with-llm] [--apply]` plans by default, makes no LLM call (changed slots get templates) and validates every result with PR 1's validator. It prints the re-call share, the reasons and the cost estimate. `--apply` enqueues `REWIND_FINAL_CUT` itself, with the simulated full-year window and `window.finalCut: true`; with an early `through` it refuses unless `REWIND_STAGING=1`, which only staging sets (add it to P4.1's `envSchema`). Production never sets it.
- **Bulk roll back.** `scripts/rewind-rollback-final-cut.ts` (dry run by default, like P0.20's script) calls P7.9's `rollbackRewind()` for each member whose latest completed generation is `final-cut`, one audited transaction each. A bad final cut is the failure that the single rollback exists for.

**Tests.**
- `lib/wrapped/maintenance/__tests__/validate-year.test.ts`, on fixtures: a valid season v3 row passes, and a valid final-cut row passes with `--final-cut`. A page that fails its schema, a kept slot over `maxChars` after re-rendering, a token on an unselected page, `finalCut: false` under `--final-cut`, a stale slot hash and a projection with an `email` key each fail with their own code, and the output contains no title or name.
- `lib/wrapped/pipeline/__tests__/final-cut.test.ts`: a deck whose numbers only grew is kept; a changed `series[1].title`, a crossed `hours.afterDarkShare` band and a newly selected page regenerate; a pocket member who became full gets every slot.
- `final-cut.golden.test.ts`: `evals/rewind/fixtures/december/` holds a deterministic December extension per fixture (P2.10's generator gains `--december`). Each fixture runs the season, then the final cut, in dry-run mode on recordings. Fewer than 30% of the 20 re-call the LLM, every result parses as `RewindDataV3`, no string contains "so far", "still being written" or "Data through", the cover reads "Final cut", and pocket and postcard make zero calls.
- `lib/wrapped/time/__tests__/resolve-data-window.test.ts`: 31 December 23:59 and 1 January 00:00 in Los Angeles and Sydney, under `TZ=UTC`.
- `lib/queue/jobs/__tests__/rewind-final-cut.test.ts` (with `TEST_REDIS_URL`): steps in order, refusal before the latest 1 January 00:30, `previousData` holding the season version, and a re-run as a no-op. `rewind-notify.test.ts` adds the final-cut kind: once per member, December readers only, never before 2 January 09:00.
- Script tests: the plan writes nothing, an early `--apply` refuses without the variable, and the bulk roll back is idempotent.

**Integration.** P7.8's button and the scheduled job enqueue `REWIND_FINAL_CUT`, interactively (the batch adapters were dropped for 2026). P8.10 runs the script on staging by 2026-12-11 and P9.2 again on 2026-12-28, and P9.3 runs the job on 1 January. This step writes the final-cut, validator and roll-back sections of `docs/rewind.md`.

**Demo.** On the December fixtures, the script prints "18 of 20 keep all copy, 2 re-call (series[1].title changed; afterDark band crossed)", and the heavy cover reads "Final cut" with December drawn in. A hide dated 3 January keeps "Final cut".

**Done when.**
- [ ] `REWIND_FINAL_CUT` recomputes the full-year aggregate and fans out `final-cut` jobs, scheduled for 1 January 00:30 in the westernmost zone.
- [ ] Only slots with a changed identity fact, a crossed band or a newly selected page call the LLM, and fewer than 30% of the fixtures re-call.
- [ ] Every later 2026 regeneration keeps the full-year window, and the template wording reads "Final cut".
- [ ] The final-cut notification reaches December's readers once, from 2 January.
- [ ] `scripts/rewind-validate.ts` and `lib/wrapped/maintenance/validate-year.ts` are merged with their tests, and the validator reported zero failures against production on 2026-12-02.
- [ ] The fixture dry-run tests pass, and the dry-run and bulk roll-back scripts exist.

### Step P8.8: Playground on the production pipeline (P1)

- **Track:** rewind. **Lane:** UI. **Effort:** M. **Window:** 2026-12-08 to 2026-12-09. **Depends on:** P7.10, P6.1.
- **Findings addressed:** DUP-02, BP-25, RWP-20, UI-43, BP-33

**Objective.** The playground runs the production pipeline, not a copy of it: P7.10's dry runs on a member or a golden fixture, with the whole trail and a live story preview. The copied statistics route, the v2 playground client and their API routes are deleted. FR-42 is a P1 requirement, so this is the first plan-level cut (P7 header): if it is not merged by the 2026-12-10 feature freeze, it moves to January and the v2 playground stays, minting no tokens since P0.19.

**Guidance.**
- **Route.** `app/admin/rewind/playground/page.tsx` (design 10.2) is a Server Component that passes everything as props instead of fetching from API routes (BP-33):
  - the members (id and name only) and the fixture ids, read with `fs` from `evals/rewind/fixtures/`, a folder listed in `outputFileTracingIncludes` for this route;
  - the configured providers and models from `lib/llm/models.ts`;
  - the prompt versions from `lib/wrapped/prompt/rewind-2026.ts` (the frozen one and the current `-rc`), and the `rewind-style-guide` PromptTemplate rows.
  - `next.config.js` redirects `/admin/playground` here, mapping `templateId` to `styleGuideId`. Repoint `components/admin/prompts/prompt-template-actions.tsx:79` and the nav item.
- **Dry runs** come from P7.10: the form calls its `estimateRewindDryRun` and `startRewindDryRun`, and polls `getRewindDryRun(id)` with TanStack Query. A paid run shows its estimate in a `ConfirmDialog` first.
- **Panes** live in `components/admin/rewind/playground/`, each under about 250 lines. State sits in a `use-playground.ts` reducer hook instead of 13 `useState` calls (UI-43). The panes are:
  - the form, built from `FormField`s;
  - the fact sheet as a DataTable of fact ids and displays, and the page selection with the reason for each omitted page;
  - the raw output, the rendered copy with tokens highlighted through `renderCopy`, and the grounding issues per slot with the repair and fallback trail;
  - usage and cost, and for a member, a diff against the stored Rewind;
  - the preview: an iframe of `/rewind/{year}?preview=<id>` in a Dialog, with that preview's cards.
- **Preview.** The preview pane is an iframe of P7.10's `/rewind/{year}?preview=<id>` in a Dialog, with that preview's cards from P7.10's preview card route. Its story preview joins `ASSISTANT_HIDDEN` (P6.1).
- **Deletions** (DUP-02, BP-25, RWP-20, BP-33):
  - `components/admin/playground/*`, including `wrapped-playground.tsx` (394 lines) and `test-configuration.tsx` (430 lines), with their tests, and `app/admin/playground/page.tsx`;
  - `app/api/admin/playground/statistics/route.ts`, `app/api/admin/plex/users/route.ts`, and `app/api/admin/models/route.ts` once P2.12's form no longer calls it;
  - `actions/prompt-test.ts`, and `actions/playground-wrapped.ts`, whose `savePlaygroundWrapped` published admin-written Rewinds behind a member's link (GAP-33);
  - `lib/wrapped/pipeline/generate-v2.ts` with `collectV2Statistics`, and every v2 module that `knip --production` then reports (expected: `llm.ts`, `api-calls.ts`, `parse-llm-output.ts`, `mock-data.ts` and `assemble-wrapped.ts`). `statistics.ts` stays for Discord until P11.12, and `prompt-template.ts` for the prompts editor until P10.4.

**Tests.**
- P7.10's action, job and preview tests stay green.
- `components/admin/rewind/playground/__tests__/*.test.tsx` and `use-playground.test.ts`: each pane renders a recorded trail, and the highlighted tokens match their fact ids.
- `e2e/admin/rewind-playground.spec.ts`: `/admin/playground` redirects, and a `heavy` fixture run in "Templates only" shows every pane and an iframe containing `rewind-stage`. `knip --production` stays clean, and the design-debt counts drop.

**Integration.** P7.8's table gains "Open in playground" (`?subject=<userId>`). P8.1 froze the prompt version this page lists as the default; the page can still try other versions in dry runs. P10.4 splits the prompt editor beside it, and P11.29 deletes the remaining v2 viewer once this step has removed the playground's imports. CLAUDE.md's integration notes point the playground at `generateUserRewind`.

**Demo.** Pick the `hostile-titles` fixture and the default model. The estimate appears first, then the fact sheet, the selection, the grounding trail with the injection title held inside a token, and the cost. Open the preview, step to Top shows and close it. `/admin/playground` lands here.

**Done when.**
- [ ] `/admin/rewind/playground` runs `generateUserRewind` in dry-run mode on a member or a fixture, with model, prompt-version and style-guide inputs.
- [ ] It shows the facts, the page selection, the raw output, the grounding trail and the cost, and previews through `?preview=`.
- [ ] A paid run shows its estimate first, and P7.10's limit of 10 dry runs per 10 minutes applies.
- [ ] The copied statistics route, the v2 playground client and their API routes are deleted, and `/admin/playground` redirects.

### Step P8.9: CI freeze gate, off until the code freeze

- **Track:** ops. **Lane:** hardening. **Effort:** S. **Window:** 2026-12-09 to 2026-12-09. **Depends on:** P1.5.
- **Findings addressed:** none (design or research item)

**Objective.** The code freeze is enforced by CI from its first minute, by a gate that was merged and tested before the freeze rather than added during it. Moved here from P9.1.

**Guidance.**
- Add `.github/workflows/freeze-gate.yml`. It is CI only and changes no application code.
  - On `pull_request` to main, while the repository variable `CODE_FREEZE` is `on`, it fails unless the PR is labelled `freeze:data` or `freeze:security`. PRs that touch only `.agents/planning/**` pass. While the variable is `off` or unset, it passes.
  - Create the variable and the labels now: `gh variable set CODE_FREEZE --body off`, `gh label create freeze:data` and `gh label create freeze:security`.
  - The owner makes the gate a required check next to Build once it has passed on main.
- **Test it before the freeze**, with the variable set to `on` for ten minutes and back to `off`: an unlabelled throwaway PR fails, a `freeze:data` PR passes, and a planning-only PR passes. Record the run ids in `ship-check.md`.
- **Flip it on schedule.** The owner sets `CODE_FREEZE` to `on` at 00:00 server time on 2026-12-14 (an owner calendar item), and P9.3 sets it back to `off` after the final cut.

**Tests.** `actionlint` passes on the workflow, and the three throwaway PRs above are the behavioural test.

**Integration.** P9.1's freeze rules rely on the gate; P9.3 lifts it.

**Demo.** With `CODE_FREEZE=on`, an unlabelled PR shows a failed "Freeze gate" check with the message naming the two labels; with the label it passes.

**Done when.**
- [ ] `freeze-gate.yml` and the two labels exist, the gate is a required check, and `CODE_FREEZE` is `off`.
- [ ] The three throwaway PRs behaved as expected, with run ids recorded, before 2026-12-10.

### Step P8.10: First final-cut dry run on staging

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-12-11 to 2026-12-11. **Depends on:** P8.5.
- **Findings addressed:** none (design or research item)

**Objective.** Rehearse the final cut end to end on a staging copy of production before the code freeze, so a failure can still be fixed as ordinary work. P9.2 repeats it on 2026-12-28 as the second rehearsal.

**Guidance.**
- Build staging exactly as P9.2 describes: restore the latest dump into `plex_manager_staging` (which also rehearses the restore path), run the production image digest, give staging its own throwaway `redis:7`, set `REWIND_STAGING=1`, and neutralise the outbound side effects (Discord, watchlist sync, Stripe keys, notification channels) with the saved statements.
- Run `scripts/rewind-final-cut.ts --year=2026 --through=2026-12-10 --with-llm --apply` (P8.5). This runs the real path: the full-year aggregate with archetype counts and medians, `kind: 'final-cut'` children, `window.finalCut: true` and the slot diff.
- Measure, in `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/final-cut-dry-run.md`: the re-call rate (pass mark under 30%; real data stops three weeks short of 31 December, so treat anything above 20% as a warning), the reasons for re-calls, the cost per member, the timings and any Tautulli 429s.
- Run P8.5's validator with `--final-cut` against staging. It must report zero failures.
- A failure is fixed in an ordinary PR before 2026-12-14 and the dry run repeated on 2026-12-11. Tear staging down the same day.

**Tests.** No new test files; the gate is the validator's zero-failure run and the recorded re-call rate.

**Integration.** P9.2 reruns the same procedure on 2026-12-28 with `--through=2026-12-27`, and P9.3 relies on both.

**Demo.** The dry-run report shows a re-call rate under 30% with its reasons, and the validator prints zero failures.

**Done when.**
- [ ] The final cut ran on a staging copy with `--through=2026-12-10`, with its own Redis and every outbound side effect neutralised.
- [ ] The validator reported zero failures, the re-call rate and its reasons are recorded, and staging is torn down.
