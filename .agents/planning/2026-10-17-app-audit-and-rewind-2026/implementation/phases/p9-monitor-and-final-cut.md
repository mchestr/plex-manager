> Part of the [implementation plan](../plan.md): the index, timeline, milestones and progress checklist live there.

## Phase 9: Monitor and final cut

**Goal.** Monitor the season under the code freeze, dry-run the final cut on 2026-12-28 and run it on 2027-01-01/02. This phase operates and checks what P7 and P8 built (`design/rewind-2026-design.md` 9.6 and 13.1, rows "Monitor", "Final cut" and "Final-cut notifications"). It adds no features.

**Window.** 2026-12-15 to 2027-01-02. The code freeze from 2026-12-14 holds for the whole phase and lifts when P9.3 records the final cut. Two milestones fall inside it:
- "Final-cut dry run" (2026-12-28): on a staging copy, the dry run re-calls the LLM for fewer than 30% of members, and every Rewind validates against `RewindDataV3` (P9.2).
- "Final cut" (2027-01-02): every Rewind says "Final cut", failed items have been retried, and "Your Rewind now includes December" has been sent (P9.3).

**Tracks.** P9.1 (ops) runs for the whole window and owns the freeze rules. P9.2 and then P9.3 (rewind) run in sequence. One agent session working with the owner covers the phase, so no parallel lanes are needed. The dashboard has phone-width baselines (P7.8), so the daily check also works from a phone over the holidays.

**Ground rules.**
- Routine levers need no deploy. Each is either a `Config` change through P7.12's Rewind settings section, audited as `CONFIG_CHANGED`, or an audited season-dashboard action (P7.8, P7.9). Only a freeze exception (P9.1) is deployed.
- The phase keeps four records in `.agents/planning/2026-10-17-app-audit-and-rewind-2026/implementation/`: `season-log.md`, `season-review-2026-12-15.md`, `final-cut-dry-run.md` and `final-cut-log.md`. They are committed, so they hold counts, percentages, typed codes and generation ids only. They never hold member names, titles, emails or tokens.
- This phase writes no code. The read-only validator (P8.5) and the freeze gate (P8.9) were merged and tested before the freeze, and the validator runs from a checkout, outside the runtime image (P0.20's operator path).

### Step P9.1: Season monitoring and the first success review

- **Track:** ops. **Lane:** Rewind. **Effort:** S. **Window:** 2026-12-15 to 2026-12-31. **Depends on:** P8.2, P8.9.
- **Findings addressed:** none (design or research item)

**Objective.** Check every day through December that every eligible member's Rewind is complete, that no run is stuck and that spend stays within budget. Review the design 1.4 success measures on 2026-12-15, and hold the code freeze so that only data or security fixes merge until the final cut.

**Guidance.**
- **Daily check** (each morning in `Config.timezone`, logged as one dated line in `season-log.md`), on `/admin/rewind` (P7.8):
  - **Failed** should be 0. Filter the member DataTable by `failed` and read each typed code: `TIMEOUT`, `UPSTREAM_ERROR`, `LLM_FAILED`, `WORKER_LOST`, `JOB_LOST` or P0.9's `TAUTULLI_USER_NOT_FOUND`. Run Retry failed once. If a member fails a second time, read the Rewind job logs for that generation id before retrying again.
  - **Skipped** reasons from P5.9's eligibility (`NOT_ENTITLED`, `NO_PLEX_IDENTITY`, `MANAGED_ACCOUNT`) are expected. Count them; there is nothing to fix.
  - **Stuck** should be 0. `REWIND_STALE_SWEEP` (P2.17) turns a run that is still `running` after 15 minutes into `WORKER_LOST` within one 10-minute cycle. If the tile stays non-zero for more than 25 minutes, the sweep or the `rewind-aux` Worker is down. Check `/api/health` (P4.17), then restart the container; P4.2's SIGTERM handler drains the workers first.
  - **Not started** counts eligible members with no 2026 row. They are usually members who joined after Prepare and fall outside P7.3's late-joiner rule. Run Generate all, which skips completed members whose `factsHash` is unchanged, instead of regenerating members one by one.
  - **Spend.** Compare the spend tile (`getRewindSeasonSpend(2026)`) with `rewindLlmBudgetUsd`, and the cost per member with $0.03 (NFR-9). Check `/admin/cost-analysis` for the assistant and Discord spend that P4.20 caps. The cap must leave room for the final cut: P7.8's Run final cut estimate plus 50%. If it does not, raise the cap in P7.12's section.
  - **Preflight rows** stay green: Redis, Tautulli 2.17 or later, and the frozen model with no `retiresOn` before 2027-01-02.
- **Weekly checks** (21 and 28 December):
  - Run the `npm run rewind:strip-leaderboards` dry run from a checkout against production (P0.8). It must report zero changes, which shows that no roster has come back into stored data.
  - Search one day of logs for unmasked share tokens, `/rewind/s/` paths, invite codes and client IPs (P4.16).
  - Open three live public links in a private window. Each shows only its published cards, unsigned cards carry no name, and `curl -I` returns `X-Robots-Tag: noindex`.
  - Run `npm audit --omit=dev` on main and read the Dependabot alerts. A new high or critical advisory is a security fix.
- **Freeze rules** (the plan's decision "Code freeze scope").
  - **What may merge.** A data fix corrects wrong numbers, wrong stored data or failing generations, for example a confirmed stats bug, a broken source mapping or a data script. A security fix closes an advisory, a leak or an access bug. Everything else, copy polish and P1 follow-ups included, becomes a GitHub issue labelled `rewind-2027` or waits for P10 and P11 on 2027-01-04. The owner may record a named exception in `season-log.md`.
  - **Frozen inputs.** The model, the `rewind-2026.1` prompt and the fact catalogue cannot change: P8.1's freeze test fails any PR that touches them.
  - **Freeze gate.** P8.9 merged `.github/workflows/freeze-gate.yml` before the freeze and tested it, and the owner set `CODE_FREEZE` to `on` at 00:00 on 2026-12-14. While it is on, a PR to main fails unless it is labelled `freeze:data` or `freeze:security`, or touches only `.agents/planning/**`.
  - **Each exception:**
    - work on a `hotfix/<slug>` branch, with a regression test and the full P1.5 suite green;
    - take a dump before the deploy (P1.10), and deploy by image digest;
    - log the PR, the digest and the number of members affected in `season-log.md`. Record the production digest on 2026-12-14 as the baseline.
    - If the fix changes facts, regenerate the affected members with admin Regenerate. Copy is reused wherever the `copySlots` dependencies did not change.
  - **Dependabot.** Version PRs stay open until 2027-01-04. Security PRs go through the exception path.
- **Success review, 2026-12-15.** Write `season-review-2026-12-15.md` with one row per design 1.4 measure: target, value, source, status (on track or at risk) and action.
  - **Opened, reached the centrefold, shared** come from `getRewindSuccessMeasures(2026)` (P7.14) over `RewindView` and `RewindShare`. "Opened" is distinct members with a view divided by members with a completed Rewind. Its 70% target falls due on 2026-12-31, so the 12-15 figure is interim; add the final figure to the review file on 2026-12-31.
  - **Generation success** is completed `RewindGeneration` rows divided by eligible members. The target is 100%, and template copy counts.
  - **Grounding** has two sources. The 98% fixture rate comes from the frozen model's committed results in `evals/rewind/results/` (P5.13; the evals page itself is P11.30 in January). Production's split of `copySource` (`llm`, `repair`, `mixed`, `template`) over full editions serves as a live proxy.
  - **Cost per member** comes from `lib/llm/usage-totals.ts`. Leaks, axe and the frame budget come from the release commit's CI run. Wrong numbers come from member reports through `/help#support` and Discord (P10.22), each logged as confirmed or rejected.
  - **Actions** stay inside the freeze:
    - a non-core page with a confirmed rendering bug goes into `rewindDisabledPages`;
    - a low open rate gets a post on the existing Announcements page;
    - everything else becomes a `rewind-2027` issue.
    - The ready notification is never re-sent.

**Tests.** This step adds no test files of its own. Every freeze-exception PR adds a regression test in the matching `__tests__/` directory before it merges:
- a stats bug adds a case to the module's test and, when it changes facts, updates the P2.10 fixture expectation;
- a leak adds the key to P5.10's key-snapshot test.

The full CI suite, P5.4's Rewind projects and P8.1's freeze test stay green on every merge. Check the gate with throwaway PRs: an unlabelled PR fails, a `freeze:data` PR passes, and a planning-only PR passes.

**Integration.** The daily log and the review feed P9.2's go or no-go and the 2027-01-15 success review, which reuses the review file's table. P9.3 sets `CODE_FREEZE` to `off` once the final cut is recorded. The `rewind-2027` issues seed next year's design, and P11.14 later applies retention windows to the `RewindView` rows read here.

**Demo.** On 2026-12-15, `/admin/rewind` shows 0 failed, 0 stuck and 0 not started, the spend tile under the cap with the final-cut headroom, and the success measures. The review file fills every row of design 1.4, and an unlabelled throwaway PR is blocked.

**Done when.**
- [ ] `season-log.md` has a dated entry for each day from 2026-12-15 to 2026-12-31, and each failure was retried, explained or counted as an expected skip.
- [ ] No run stayed stuck past one sweep cycle, and season spend stayed under the cap with the final-cut headroom.
- [ ] `season-review-2026-12-15.md` records every design 1.4 measure, including the 2026-12-31 open rate.
- [ ] The freeze gate is a required check, and every merge after 2026-12-14 is a labelled data or security fix with a regression test.

### Step P9.2: Second final-cut dry run

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2026-12-28 to 2026-12-28. **Depends on:** P8.5, P8.10.
- **Findings addressed:** none (design or research item)

**Objective.** Show again, on a fresh staging copy of production, that the final cut works before it runs for real. This is the second rehearsal: P8.10 ran the first on 2026-12-11, before the code freeze, so this one should only confirm. It must re-call the LLM for fewer than 30% of members, and every resulting Rewind must validate against `RewindDataV3` and its page schemas.

**Guidance.**
- **Staging copy**, built on the morning of 28 December on the production host or the same private network:
  - Restore the latest dump (`pg_dump -Fc`, P1.10) into a new database, `plex_manager_staging`, with `pg_restore`. Then run `prisma migrate deploy`, which should apply nothing. This also rehearses the restore path before 1 January.
  - Run the production image digest recorded in `season-log.md`, not a fresh build.
  - Give staging its own Redis, a throwaway `redis:7` container. Never point staging at production Redis: the queue names are identical, so staging workers would take production jobs and contend for production's locks.
  - **Environment:** the production `ENCRYPTION_KEY`, so the stored service keys decrypt; a new `NEXTAUTH_SECRET`; both app URLs on `http://127.0.0.1:3100` (loopback passes P4.1's check), reached through an SSH tunnel; `ENABLE_DISCORD_BOT=false` and `ENABLE_WATCHLIST_SYNC=false`; and never `E2E_TEST_MODE`.
  - **Neutralise side effects** in the staging database before the first boot, and save the statements in `final-cut-dry-run.md`:
    - set `DiscordIntegration.isEnabled` and `botEnabled` to false and `botToken` to null, because a second gateway login with the same token would disturb the production bot; set `Config.watchlistSyncEnabled` to false, so staging files no Overseerr requests;
    - set `rewindNotifyChannels` to `["banner"]`, which exercises `REWIND_NOTIFY` without sending DMs; null `stripeSecretKey` and `stripeWebhookSecret` but leave `stripeEnabled` as it is, so entitlement skips match production;
    - set `rewindLlmBudgetUsd` to P7.8's estimate plus 50%. LLM calls are real and are billed to the production key.
  - After boot, make sure no season job ran. If staging enqueued a `REWIND_SEASON_PREPARE` for 2026, which already fired in production, remove it.
- **Run.** Trigger `REWIND_FINAL_CUT` for 2026 with `through` at 23:59:59 on 27 December in each member's zone, the last full day, through the simulation switch that P8.5 provides for its fixture dry runs. Production never sets that switch.
  - This runs the real path: the full-year aggregate with archetype counts and medians, `kind: 'final-cut'` children, `window.finalCut: true` and the `copySlots` diff.
  - If P8.5 shipped no switch, run the staging worker under libfaketime at 2027-01-01 08:30 UTC instead. Tautulli then has data up to 28 December, which makes the same test.
  - Run it in the evening, when production is quiet. Staging's semaphore of 4 Tautulli calls is separate from production's, so together they can reach 8.
- **Measure**, recording each result in `final-cut-dry-run.md`:
  - **Re-call rate.** Divide the completed `kind: 'final-cut'` generations with `llmCalls > 0` by all completed final-cut generations, and also report the rate for full editions only. The pass mark is under 30%. Real data stops four days short of 31 December, so treat anything above 25% as a warning.
  - **Reasons for re-calls**, from P8.5's per-slot diff: an identity fact changed, a band was crossed, a page changed eligibility, or `window.finalCut` flipped. If one slot accounts for most re-calls, its `copySlots` entry is probably wrong, for example an LLM slot that lists `window.finalCut`, which design 8.3 reserves for templates.
  - **Validation.** Run P8.5's `scripts/rewind-validate.ts --year=2026 --final-cut` (tsx, read-only, from a checkout), which P8.10 already ran on 2026-12-11. For every eligible member's 2026 row it checks that:
    - `parseStoredRewind()` returns version 3, and every page passes `registry[type].schema`, so the viewer would drop none;
    - `window.finalCut` is true and `finalCutAt` is set;
    - every kept LLM slot passes `groundSlot` against the new facts. Rule 7 (length) matters because tokens grow, and rule 5 because a page can drop out;
    - the kept slots' `copyMeta.slotHashes` equal `slotDependencyHash()`, and `factsHash` matches;
    - each active `RewindShare`'s `toShareSafe()` output passes P5.10's key allow-list.

    The script prints counts per code, never a title or a name, and lists skipped members by reason.
  - **Operations:** the cost per member, under $0.005 (NFR-9); the time from enqueue to the last completion, the aggregate pass duration and any Tautulli 429s; the card prewarm count and the growth of `REWIND_CACHE_DIR` (`du -sh` before and after).
  - **Notification recipients** of the final-cut `REWIND_NOTIFY` must equal the members with a December `RewindView` and `notify` on. They must not be zero because of the `notifiedAt` stamp left by the season notification.
  - **Spot checks** in the staging admin preview: a full, a pocket and a postcard issue each say "Final cut" on the cover, page 02 and the back cover, the December segment of the soundtrack is drawn, and "December is still being written" no longer appears. Rehearse one Roll back (P7.9) and its undo, and time them.
- **Go or no-go**, recorded in `final-cut-dry-run.md`. A failure is fixed only under P9.1's rules, as a data fix or an exception the owner records (for example to correct a `copySlots` entry), and the dry run is repeated on 29 or 30 December. If validation passes but the re-call rate stays high, the owner may accept the cost, which the budget cap bounds.
- **Teardown** the same day: stop the staging containers and drop its database and Redis, so its copy of member data and tokens does not linger and its own delayed final cut never fires.
- **Production schedule.** Confirm that production holds exactly one delayed `REWIND_FINAL_CUT` with dedup id `rewind:final:2026`, set for 00:30 on 1 January in the westernmost zone. With a Chicago server and one Los Angeles member, that is 02:30 in Chicago, or 08:30 UTC. Confirm also that Run final cut stays disabled until then.

**Tests.**
- On the release commit, rerun P8.5's fixture dry-run tests, P5.9's golden tests and `npm run rewind:gallery` with the final-cut fixtures.
- Do not point the Playwright suites at staging. P0.4's guard refuses any database other than the test database, by design.

**Integration.** P9.3 runs only after a recorded go. P9.3 reuses the validator, read-only, against production. The staging procedure moves into `docs/rewind.md` once the freeze lifts. The "Final-cut dry run" milestone is checked against `final-cut-dry-run.md`.

**Demo.** On staging, the simulated final cut completes. The report gives a re-call rate under 30% with its reasons, and the validator prints zero failures. The heavy member's admin preview says "Final cut", with December drawn in the soundtrack.

**Done when.**
- [ ] The final cut ran on a staging copy of production, with its own Redis and every outbound side effect neutralised.
- [ ] Fewer than 30% of members re-called the LLM, and the reasons are recorded.
- [ ] Every eligible member's 2026 Rewind validates: version 3, every page schema, `finalCut` set, kept slots grounded, and share projections inside the allow-list.
- [ ] The cost, the timings and the notification recipient count are recorded, and a roll back and its undo were rehearsed.
- [ ] The go decision is recorded, staging is torn down, and production's 1 January schedule is confirmed.

### Step P9.3: Final cut and final-cut notifications

- **Track:** rewind. **Lane:** Rewind. **Effort:** S. **Window:** 2027-01-01 to 2027-01-02. **Depends on:** P9.2.
- **Findings addressed:** none (design or research item)

**Objective.** Run the final cut in production, so that every eligible member's Rewind includes December and says "Final cut". Retry whatever fails, tell the members who read their issue in December, then record the run and lift the code freeze.

**Guidance.**
- **31 December** (afternoon, `Config.timezone`):
  - Take a `pg_dump -Fc` of production (P1.10) and record its file name in `final-cut-log.md`.
  - Check that the preflight is green, and that the frozen model in `lib/llm/models.ts` has no `retiresOn` on or before 2027-01-02. Re-check its price, as on 2026-12-01.
  - Make sure the budget leaves room for P7.8's final-cut estimate plus 50%. Past the cap, the changed slots of the remaining members get template copy.
  - Confirm that the delayed `REWIND_FINAL_CUT` is still set for the instant P9.2 confirmed. If a member has since moved to a zone further west, P8.5 moves the job.
  - The final cut runs interactively (the batch adapters were dropped for 2026). Check that `REWIND_CACHE_DIR` has room for a second set of cards.
- **1 January, 00:30 in the westernmost zone.** The job fires on its own. It computes the full-year aggregate, then fans out one `kind: 'final-cut'` child per eligible member, with `through` at 23:59:59 on 31 December in that member's zone. About 80% of members keep their copy and re-render with the new numbers. The rest regenerate only their changed slots, on the frozen model and prompt (design 9.6).
  - The fan-out runs interactively and finishes in about the time P9.2 measured.
  - Check the season dashboard in the morning and the evening: final-cut generations by status, failures by typed code, and spend against P9.2's cost. Run Retry failed for upstream and worker failures, and check that the retried generations carry `kind: 'final-cut'`.
- **2 January:**
  - Retry failed items with Retry failed. Repeat until no eligible member's latest final-cut generation is `failed`.
  - From a checkout, run P8.5's validator read-only against production with `--year=2026 --final-cut`. It must report zero failures, and no eligible member's 2026 row may lack `window.finalCut`.
  - Spot-check through the admin preview. Each preview writes an audited read, so keep to a handful. A full, a pocket and a postcard issue say "Final cut" on the cover, page 02 and the back cover, with December in the soundtrack. One live public link serves the new cards, because their cache key changed with `factsHash`, and still serves only its published pages.
  - **Notifications.** `REWIND_NOTIFY` with `kind: 'final-cut'` sends "Your Rewind now includes December". It goes by Discord DM between 09:00 and 20:00 in each member's zone, once each (dedup id `rewind:notify:2026:{userId}:final-cut`), and only to members with a December `RewindView` and `notify` on. Compare the number sent with P9.2's recipient count. The banner follows P7.14's unread rule.
- **Members the final cut skips.** Eligibility skips some members: lapsed subscribers (`NOT_ENTITLED`, FR-51), `NO_PLEX_IDENTITY` and managed accounts. Their season issue keeps "Data through 30 November". List them in the log by reason, with counts. "Every Rewind" in the done criteria means every eligible member's Rewind.
- **If something goes wrong:**
  - Setting `rewindLlmMode` to `off` stops spend at once, and changed slots then use templates.
  - Roll back (P7.9) restores one bad issue to the season version from `previousData`.
  - After a data fix under P9.1's rules, Run final cut again. It re-processes only the members whose final-cut facts changed.
  - Restoring the 31 December dump is the last resort, because it loses every member action taken since.
  - Tautulli writes history when a stream stops, so a play still running at 00:30 is missed. An admin can regenerate that member later in January.
- **Close the run.**
  - Write `final-cut-log.md`: the start and end times, counts by status and copy source, the re-call rate next to P9.2's, the cost per member (target under $0.005), the retries, the notifications sent, and the skips by reason.
  - Then set the repository variable `CODE_FREEZE` to `off`, and note in `season-log.md` that the freeze has lifted for P10 and P11 from 2027-01-04.

**Tests.** This step adds no test files. Its gate, recorded in `final-cut-log.md`, is:
- the release commit's CI is green, with nothing merged since the freeze except labelled fixes;
- P8.5's validator reports zero failures against production;
- the admin-preview spot checks pass, and the notification count matches.

**Integration.** The "Final cut" milestone on 2027-01-02 is checked against `final-cut-log.md`. Lifting `CODE_FREEZE` opens P10 and P11. P11.18's season-close cleanup depends on this step, and the 2027-01-15 success review reads the final-cut rows. After the freeze lifts, the staging and final-cut procedures move into `docs/rewind.md`.

**Demo.** On 2 January the season dashboard shows a completed final-cut generation for every eligible member, and the validator prints zero failures. On a member's phone the issue says "Final cut" with December drawn in, and the Discord DM "Your Rewind now includes December" arrives during the member's waking hours.

**Done when.**
- [ ] `REWIND_FINAL_CUT` ran at 00:30 on 1 January in the westernmost zone, interactively.
- [ ] Failed and expired items were retried interactively, and no eligible member's latest final-cut generation is `failed`.
- [ ] Every eligible member's Rewind says "Final cut" and validates, and skipped members are listed by reason.
- [ ] "Your Rewind now includes December" reached each member who opened their issue in December once, during their waking hours.
- [ ] The cost and timings are recorded in `final-cut-log.md`, and the code freeze is lifted.
