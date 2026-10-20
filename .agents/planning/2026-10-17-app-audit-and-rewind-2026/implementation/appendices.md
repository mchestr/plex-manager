> Part of the [implementation plan](plan.md): the index, timeline, milestones and progress checklist live there.

## Appendix D: Rewind requirements map

Every functional and non-functional requirement of `design/rewind-2026-design.md` section 3, with its priority, the steps that deliver it and the key that removes it without a deploy. Appendix D follows the phases and comes before the generated appendices A to C. The 2026-12-10 "Feature freeze" and 2026-12-12 "Rewind ship complete" milestones are checked against it: P8's `ship-check.md` walks the table row by row and records, for each row, the merged PRs, the production check and, for a P1 row, the date its flag was enabled.

How to read the last column:
- **Page key**: an entry in `Config.rewindDisabledPages` that removes a page or a part of a page, and renumbers the issue (P5.5, P7.12).
- **Feature key**: a P1 feature, off until `+<key>` is added to the same array (P8.3's `rewindFeatureOn`).
- **Plan cut N**: the plan-level cut list in the P7 header and Appendix B, applied before the design's list.
- **Never cut**: the ten core pages, sharing, privacy and accessibility, which the design's cut list never removes.

### Functional requirements

| Requirement | Priority | Delivered by | Flag or cut key |
|---|---|---|---|
| FR-1 Routes, redirects and archive years | P0 | P0.14, P5.1, P7.13 (archive articles, ship window), P11.18 (redirect kept after the season) | Never cut. Until P7.13 lands, stored years render through `WrappedYearView` (decision 29) |
| FR-2 One page registry, self-renumbering | P0 | P2.13, P5.5 | Never cut |
| FR-3 Up to 18 pages in six acts; ten core pages | P0 | P5.5, P5.6, P5.7 (core pages), P7.1, P7.2 (the other eight) | Page keys `people`, `setup`, `next-year` (design cut list, in that order); core pages never cut |
| FR-4 Cut choice on the cover | P0 | P5.5, P7.3 | Never cut |
| FR-5 Pocket edition and postcard thresholds | P0 | P5.9, P7.3 | Never cut |
| FR-6 Quiz holds autoplay, session-only answer | P0 | P5.6 | Never cut |
| FR-7 Hide this title | P0 | P7.7 | Never cut (privacy) |
| FR-8 Race scrubber and replay | P1 | P8.3, on P7.1's stored frames | Feature key `race.scrubber` (design cut list: keep autoplay and the final frame) |
| FR-9 Pick a day and the calendar grid | P1 | P8.3, on P5.7's per-day data | Feature keys `calendar.day-picker`, `calendar.grid` |
| FR-10 "Why this?" on the centrefold | P0 | P5.7, P5.8 | Never cut |
| FR-11 Compare with 2025 | P1 | P8.4, on P7.4's stored 2025 series | Feature key `number.compare-2025` |
| FR-12 Article mode | P0 | P5.12 | Never cut (accessibility) |
| FR-13 Story controls | P0 | P5.2, P5.3 | Never cut |
| FR-14 Autoplay rules | P0 | P5.2 | Never cut |
| FR-15 Slower pacing; first tap completes | P1 | P5.2 (slower pacing), P8.3 (first-tap completion) | Feature key `stage.tap-completes` |
| FR-16 Table control on every chart page | P0 | P5.3 | Never cut (accessibility) |
| FR-17 Desktop spread and Notes | P0 (Notes for three pages), P1 (Notes for the other seven core pages) | P7.4, P8.4 | Feature key `notes.core` (design cut list: Notes beyond Top shows, the calendar and the centrefold) |
| FR-18 Share cards for every page except Setup and Next year | P0 | P5.11 (core cards), P7.6 (the rest, ship window) | Plan cut 5: non-core pages keep Copy link only (decision 29) |
| FR-19 Share image, Save image, Copy link | P0 | P5.11 | Never cut (sharing) |
| FR-20 Opt-in public links: chosen pages, rotate, revoke, expiry | P0 | P0.19 (v2), P5.11 (v3), P7.5 | Never cut (sharing) |
| FR-21 Unsigned cards by default | P0 | P5.10, P5.11 | Never cut (privacy) |
| FR-22 Type-only cards by default; server-wide artwork switch | P0 | P5.10, P5.11, P7.12 | Never cut (privacy) |
| FR-23 Edit card | P1 | P8.4 | Feature key `share.edit-card`; plan cut 4 |
| FR-24 Save all cards | P1 | P8.4 | Feature key `share.save-all` |
| FR-25 Public share page | P0 | P0.11 (v2), P7.5 | Never cut (sharing) |
| FR-26 OG card | P0 | P7.5 | Never cut (sharing) |
| FR-27 Square card format | P2 | Not built in 2026; the format control stays hidden | Design cut list (already P2) |
| FR-28 Numbers only from code; LLM only through fact tokens | P0 | P2.9, P5.8, P5.9 | Never cut |
| FR-29 Member and server time zones | P0 | P2.2, P6.11 | Never cut |
| FR-30 Overseerr status mapping | P0 | P0.15, P2.4 | Never cut |
| FR-31 Server-wide yearly aggregate | P0 | P2.6, P2.9 | Never cut |
| FR-32 Persistent metadata cache | P0 | P2.6 | Never cut |
| FR-33 All 12 archetype scorers | P0 | P2.9, P2.16 | Never cut |
| FR-34 "Data through 30 November" and "Final cut" | P0 | P5.5, P6.9, P8.5, P9.3 | Never cut |
| FR-35 Weekly bins on public cards unless Daily detail | P0 | P5.11, P7.6 | Never cut (privacy) |
| FR-36 Admins can view your Rewind, said in the UI | P0 | P5.7, P6.9, P7.9 | Never cut (privacy) |
| FR-37 Server-size counts in-app only | P0 | P5.10, P7.2, P7.12 | Never cut (privacy) |
| FR-38 Strip stored rosters | P0 | P0.8, P0.20 | Never cut (privacy) |
| FR-39 Rewind queues, dedup ids, per-member lock, time limits, stale recovery | P0 | P2.5, P2.17 | Never cut |
| FR-40 Atomic regeneration | P0 | P2.17, P5.9 | Never cut |
| FR-41 Season progress, generate all, regenerate, final cut, preview | P0 | P7.8, P7.9, P8.5 | Never cut |
| FR-42 Playground on the production pipeline | P1 | P7.10 (dry runs), P8.8 | Plan cut 2: the v2 playground keeps working without minting tokens (P0.19) |
| FR-43 "Your Rewind is ready" notification | P1 | P7.14, P8.2 | None; the Discord DM is skipped when the bot is off or the member is unlinked |
| FR-44 Library and content-rating exclusions | P0 | P2.4, P2.6, P7.12 | Never cut (privacy) |
| FR-45 Managed accounts excluded by default | P0 | P5.9, P6.9, P7.12 | Never cut (privacy) |
| FR-46 Watched threshold and grouped history | P0 | P2.4 | Never cut |
| FR-47 Typed error on a failed Tautulli match | P0 | P0.9 | Never cut (privacy) |
| FR-48 Members without Plex history | P0 | P0.17, P5.1, P6.9 | Never cut |
| FR-49 Share page reads the database | P0 | P0.11, P7.5 | Never cut |
| FR-50 Redis required, with explanations | P0 | P1.5 (CI services), P2.5, P5.1, P6.9, P7.8 | Never cut |
| FR-51 Entitlement and lapsed read-only access | P0 | P4.5 (per-request enforcement), P5.1, P5.11, P6.9 | Never cut |

### Non-functional requirements

| Requirement | Delivered by | How it is checked |
|---|---|---|
| NFR-1 Correctness | P2.2, P2.7, P2.8, P2.10, P2.16, P5.5 | Fixture and four-zone DST tests; every `select()` over the 20 fixtures |
| NFR-2 Determinism | P2.13, P2.14, P5.10 | Byte-identical type-only cards; pixelmatch for cards with artwork |
| NFR-3 Robustness | P2.3, P2.8, P5.9, P7.2 | `AbortSignal` time limits; optional sources omit their pages |
| NFR-4 Accessibility | P1.7, P3.3, P5.3, P5.4, P5.12, P7.15 | axe at wcag22aa, 7:1 field contrast tests, the VoiceOver and TalkBack pass |
| NFR-5 Performance | P2.13, P5.4, P7.15 | Bundle and font budgets in P5.4's projects; the low-end pass |
| NFR-6 Motion | P1.8, P2.15, P5.2, P7.15 | P5.2's static check (no loops, only the allowed properties); reduced-motion tests |
| NFR-7 Privacy | P0.8, P2.4, P5.8, P5.10 | The fact-sheet-only LLM input; whole-segment key-snapshot tests |
| NFR-8 Security | P0.10, P4.3, P4.5, P5.10, P5.11 | Action helper tests, rate-limit tests, asset-key scope tests |
| NFR-9 Cost | P2.11, P5.13, P9.1, P9.2 | Bake-off cost figures; the season dashboard spend; the dry-run LLM share |
| NFR-10 Card rendering | P2.14, P5.10, P7.6 | Re-measured timings on the shipped Next version; prewarm |
| NFR-11 Maintainability | P1.8, P3.4, every step | Guardrail script and design-debt ratchet |
| NFR-12 Compatibility | P2.1, P7.13, P11.29 | Versioned stored-data parser; archive articles; the v2 viewer deletion in January |
| NFR-13 Schedule | P8.1, P8.2, P8.9 | The freeze lock on 2026-12-01; this table on 2026-12-10; the freeze gate on 2026-12-14 |
| NFR-14 Infrastructure | P1.5, P2.5 | Redis in the integration and E2E jobs; FR-50's checks |

---

## Review notes

The 2026-10-18 schedule review raised 43 issues: 2 blocking, 20 major and 21 minor. This revision applies all of them. The plan grew from 171 to 181 steps (187 PRs), and phase windows, the gantt, the milestones, Appendix B and Appendix C were regenerated from the revised skeleton. Every finding is still assigned or deferred: 240 assigned and RWV-14 deferred.

### Renumbered, split and moved steps

| Before | After | Why |
|---|---|---|
| P0.8 | P0.8 (projection and routes), P0.19 (opt-in links and token writers), P0.20 (strip script) | One M step held a projection, four route changes, share actions and UI, a five-part data script and a migration |
| P2.5 | P2.5 (queues, lock, semaphore, fail-fast Redis), P2.17 (generation job, actions, status hook) | Split by deliverable |
| P2.10 | P2.10 (fixtures and stats-level values, sign-off 2026-11-06), P2.16 (fact and archetype goldens, by 2026-11-10) | The goldens need P2.9 |
| P3.11, P3.12, P3.13 | P10.13, P10.14, P10.15 | The token codemod and sweeps have no Rewind consumer |
| P6.2, P6.4, P6.6, P6.7, P6.8, P6.10, P6.12 to P6.18 | P10.16 to P10.28, in that order | No Rewind consumer; sign-in, invite and onboarding would otherwise change in the week the season opens |
| P6.14's clean-up | P11.31 (dry-run audit, then a reviewed apply) | Destructive data change moved after the final cut |
| P4.4 | P11.32 | The setup claim protects only fresh installs and feeds the January wizard |
| P4.14 | P11.28 | Pairs with P11.2's watchlist lock |
| P7.10's playground swap | P8.8 | FR-42 is P1; plan-level cut 2 |
| P7.11's eval page | P11.30 | Off the soft-launch chain |
| P7.13's v2 deletion | P11.29 | Off the soft-launch chain; P7.13 keeps the archive articles in the ship window |
| P8.6 | Dropped | Batch final cut saved about $0.05 per 100 members and was never rehearsed |
| P8.7 | P1.10 (upgrade path, by 2026-11-03), P7.17 (runbook, by 2026-11-25) | Code parts must ship before the November migrations; the runbook before the rehearsal |
| P9.1's freeze gate | P8.9 (by 2026-12-09, `CODE_FREEZE` off) | The gate was added after the freeze began |
| (new) | P8.10, first final-cut dry run on staging by 2026-12-11 | First rehearsal before the code freeze; P9.2 becomes the second |
| P11.6's drift job | P1.5 | Every season migration is now gated; P11.6 keeps naming and `?schema=` |

### Capacity, lanes and the critical path (blocking 1 and 2, majors on lanes and sizing)

- Re-levelled to three lanes until the code freeze (Rewind, UI for Rewind, hardening), each with at most two open PRs, and four lanes in January. Every step's metadata line now names its lane, and multi-PR steps state their PR count.
- Defined S, M and L and review units in "How to use this plan", re-sized P1.5, P3.4, P5.2, P5.9, P7.8, P8.4, P8.5 and the January codemods, and counted PRs rather than steps in the weekly table.
- Weekly budget: about 18 review units a week, not the suggested 12. The Rewind P0 scope alone needs about 10 units a week from 2026-10-26 to 2026-11-24, so 12 is reachable only by cutting P0 pages before work starts. Appendix C decision 30 asks the owner to confirm 18 or name the cuts. No week before the season exceeds 18; the January lanes carry at most 11.5.
- Owner-only work is a dated calendar with time estimates, including the fixture sign-off, the golden review, the bake-off, the VoiceOver and TalkBack pass, the gallery review over Thanksgiving, 30 November, the season open, the flag enables and the final cut.
- Published the critical path with float to the 2026-11-24 release cut. The least float is P7.17 (0), P7.15 (1) and P7.2, P7.11, P7.14 and P5.13 (2).
- P7.16 now depends only on P7.11, P7.12, P7.15 and P4.16. P7.6's remaining cards and P7.13's archive articles moved to the ship window as late P0 items with fallbacks (Copy link only; `WrappedYearView`), recorded as decision 29.
- Plan-level cuts ahead of the design's list: the batch adapters (dropped), P8.8's playground swap, the eval page (January), P8.4's Edit card, then P7.6's non-core cards.
- Admin-audience generation runs on real data from 2026-11-20, and 30 November is limited to tag, dump, deploy and rehearse, with a 12:00 cutoff for sign-off fixes.
- Rewind-critical UI steps are marked in the P3 and P6 headers. P6.5 has P3.7's priority and fallback. P7.8's dependency on P6.1 and P7.12's dependency on the settings refresh became merge-order notes; P6.1 lands in the ship window. ui-design-system 9.2 departures are recorded as decision 28.
- P4.1, P4.12, P4.15 and P4.19 moved earlier inside P4; P4.20 lands by 2026-11-19, before the soft launch.

### Phase 0, migrations and the season-open release

- Day-0 rules in the P0 header: disable `docker-publish.yml` first thing on 2026-10-19, merge P0.3 then P0.4 before anything else, run E2E only against an `E2E_DATABASE_URL` ending in `_test`, and take a `pg_dump` before every deploy that carries a migration (command, encryption, off-host storage and 30-day deletion included).
- The P0 header names the subset the 2026-10-23 milestone needs, protects P1.1 and P1.6, and lets P0.15, P0.16, P0.17, P1.3 and P1.9 slip a week.
- P0.5 takes a dump before deploy. P0.20's script runs only after the P0.8 and P0.19 release is live, from a checkout, with stable dry-run counts.
- Every step that adds a migration lists "Dump taken before deploy; `prisma migrate status` clean" in its Done-when, including the January ones.
- The P8 header lists every pre-season migration by step and date; none falls between 2026-11-25 and 2027-01-02 except through P1.10's exception path.
- P8.2's two code changes (the generation audience and the notification fan-out) are Done-when items of P7.8 and P7.14, merged by 2026-11-24. P1.10 and P7.17 are dependencies of P8.1. The page data P8.3 and P8.4 need is stored by P5.7, P7.1 and P7.4, with schema tests, so P8.1 only verifies it.
- P2.2's migration uses `to_char(col + interval '12 hours', 'MM-DD')` and its test runs under `America/Los_Angeles`. P4.10's `processedAt` becomes `DateTime?` with no default, with a test. P1.2 and P2.1 use the drift commands that run on Prisma 7.2.0, and P2.1, which merges before the gate exists, records them in its PR.

### Final cut, requirements and milestones

- P8.5's Done-when names `scripts/rewind-validate.ts` and `validate-year.ts`; the validator runs against production on 2026-12-02. P8.10 rehearses the final cut on staging by 2026-12-11; P9.2 is the second rehearsal and writes no code.
- New Appendix D maps FR-1 to FR-51 and NFR-1 to NFR-14 to priority, steps and flag or cut key. The 12-10 and 12-12 milestones and `ship-check.md` walk it row by row.
- Milestones: Phase 0 on Friday 2026-10-23 and UI foundations on Friday 2026-11-06; the baselines criterion names P1.6's 20 screens; new milestones for the safe upgrade path (11-03), the fact goldens (11-10), the soft-launch release cut (11-24), the freeze candidate (11-30) and the first final-cut dry run (12-11); the 2027-01-15 review is owned by P11.18; the P8 header says 12:00, not 08:00, and that the noon deploy carries no sign-in-path change.
- Appendix C: every decision has a decide-by date and an explicit default. New decisions 28 (January moves), 29 (late P0 items), 30 (review capacity) and 31 (batch path dropped).
- Appendix B rewritten: plan-level cuts, float, review capacity, the migration path, the final-cut rehearsals and the live season in January.

### Step-level fixes

- P0.19: `savePlaygroundWrapped` never writes `shareToken`, with a test, and `__tests__/config/share-token-writers.test.ts` asserts that only `enableWrappedShareLink` does.
- P1.5: an `integration` job on `postgres:16` and `redis:7`, Redis in the E2E job, gated helpers that throw in CI when their variable is missing, the `schema-drift` job, and ten required checks. `E2E_TEST_MODE` uses `'true'` everywhere.
- P1.6: the baseline workflow pushes with a GitHub App token or a fine-grained PAT so checks run on the new head, with the fallback documented; the screen count matches the list.
- P2.3: the DUP-11 schema factory moved to P11.5.
- P2.4, P2.6 and P7.12: `contentRating` and `librarySectionId` are read and stored, rating exclusions apply in `getMemberEvents()` and fail closed, with an X-rated fixture test.
- P3.4: one `eslint/restricted-syntax.mjs` module with a fixture test per rule; the shadcn CLI is pinned and `init` runs only in a throwaway worktree.
- P4.5: the lapsed rule is enforced per request in `proxy.ts`, with a soft-navigation E2E and one header name.
- P4.1 and P4.17: `REWIND_CACHE_DIR` defaults to `.next/cache/rewind` and the image sets `/app/.next/cache/rewind`; the image smoke test renders a card in the container. The migration runs with `NODE_PATH=/opt/prisma-cli/node_modules`, HEALTHCHECK uses `?probe=live`, and the Dependabot instruction is gone.
- P5.2: a Rewind-scoped motion check (NFR-6) with one Jest case per rule. P5.10: the key-snapshot test matches whole key segments.
- P8.3 and P8.4: every P1 feature is default-off through `+<key>` entries, with a fresh-Config test and each enable recorded in `ship-check.md`.
- P10.14 keeps the users and settings codemod slices; the other areas fold into P10.1 to P10.6, and the playground and admin Rewind views join the skip list.
- P10.24 keeps only the column and step-id changes; P11.31 does the audited duplicate-row clean-up after the final cut.
- P11.1 and P11.3 run after 2027-01-31. P11.1 treats `ENCRYPTION_KEY` as the implicit `legacy` kid, so production installs without `ENCRYPTION_KEYS` keep writing.
- P11.18 adds the 2027-01-15 success review to the season-close clean-up.
- Stale references removed: `generateAllPlexWrapped` in P0.12 and P2.5, the dead file in P5.1, the duplicate deletion in P2.5.
- Missing dependencies added: P1.5 on P1.6 and P1.8, P3.2 on P4.1, P6.9 on P5.5. The backlog items carry the same lists.
- The backlog marks `[READY]` every item whose start date is within ten working days of 2026-10-19, and its instructions say "start date within two weeks".

---

## Appendix A: Traceability matrix

Every finding from the audit reports, generated from the plan skeleton. 240 of 241 findings are assigned to steps and 1 are deferred with a reason.

| Finding | Severity | Source | Addressed by |
|---|---|---|---|
| GAP-01 | high | additional-findings.md | P0.6 |
| GAP-02 | high | additional-findings.md | P11.28 |
| GAP-03 | medium | additional-findings.md | P11.28 |
| GAP-04 | medium | additional-findings.md | P4.11 |
| GAP-05 | low | additional-findings.md | P11.8 |
| GAP-06 | low | additional-findings.md | P11.8 |
| GAP-07 | low | additional-findings.md | P11.9 |
| GAP-08 | low | additional-findings.md | P11.8 |
| GAP-09 | low | additional-findings.md | P11.9 |
| GAP-10 | info | additional-findings.md | P11.8 |
| GAP-11 | medium | additional-findings.md | P1.10 |
| GAP-12 | medium | additional-findings.md | P11.7 |
| GAP-13 | medium | additional-findings.md | P11.7 |
| GAP-14 | medium | additional-findings.md | P1.10 |
| GAP-15 | low | additional-findings.md | P4.10 |
| GAP-16 | low | additional-findings.md | P11.24 |
| GAP-17 | low | additional-findings.md | P11.24 |
| GAP-18 | low | additional-findings.md | P4.1, P11.24 |
| GAP-19 | low | additional-findings.md | P11.6 |
| GAP-20 | low | additional-findings.md | P11.25 |
| GAP-21 | low | additional-findings.md | P11.26 |
| GAP-22 | low | additional-findings.md | P1.2, P11.26 |
| GAP-23 | medium | additional-findings.md | P11.11 |
| GAP-24 | medium | additional-findings.md | P11.10 |
| GAP-25 | medium | additional-findings.md | P11.12 |
| GAP-26 | low | additional-findings.md | P4.7 |
| GAP-27 | low | additional-findings.md | P11.10 |
| GAP-28 | low | additional-findings.md | P4.12 |
| GAP-29 | low | additional-findings.md | P10.21 |
| GAP-30 | info | additional-findings.md | P11.10 |
| GAP-31 | medium | additional-findings.md | P11.13 |
| GAP-32 | low | additional-findings.md | P11.16 |
| GAP-33 | low | additional-findings.md | P7.9, P11.16 |
| GAP-34 | low | additional-findings.md | P10.27 |
| GAP-35 | low | additional-findings.md | P11.14 |
| GAP-36 | low | additional-findings.md | P11.15 |
| GAP-37 | low | additional-findings.md | P0.8, P0.20, P5.11 |
| GAP-38 | low | additional-findings.md | P10.6 |
| GAP-39 | info | additional-findings.md | P4.13 |
| GAP-40 | medium | additional-findings.md | P2.2 |
| GAP-41 | low | additional-findings.md | P3.10 |
| GAP-42 | low | additional-findings.md | P10.2 |
| GAP-43 | low | additional-findings.md | P2.2, P3.10, P10.6 |
| GAP-44 | low | additional-findings.md | P11.17 |
| GAP-45 | low | additional-findings.md | P3.10 |
| GAP-46 | low | additional-findings.md | P3.10 |
| GAP-47 | info | additional-findings.md | P11.17 |
| BP-01 | critical | best-practices-and-ops.md | P0.1, P1.5 |
| BP-02 | high | best-practices-and-ops.md | P0.3 |
| BP-03 | medium | best-practices-and-ops.md | P0.18 |
| BP-04 | medium | best-practices-and-ops.md | P4.3, P11.5 |
| BP-05 | medium | best-practices-and-ops.md | P0.1, P3.2 |
| BP-06 | low | best-practices-and-ops.md | P11.5 |
| BP-07 | high | best-practices-and-ops.md | P0.4 |
| BP-08 | medium | best-practices-and-ops.md | P1.4 |
| BP-09 | medium | best-practices-and-ops.md | P1.3 |
| BP-10 | medium | best-practices-and-ops.md | P1.5, P5.4, P11.22 |
| BP-11 | low | best-practices-and-ops.md | P1.5 |
| BP-12 | high | best-practices-and-ops.md | P0.7 |
| BP-13 | medium | best-practices-and-ops.md | P4.2 |
| BP-14 | medium | best-practices-and-ops.md | P4.10 |
| BP-15 | medium | best-practices-and-ops.md | P4.2 |
| BP-16 | medium | best-practices-and-ops.md | P4.17 |
| BP-17 | medium | best-practices-and-ops.md | P4.17, P11.4 |
| BP-18 | low | best-practices-and-ops.md | P4.2 |
| BP-19 | low | best-practices-and-ops.md | P11.3 |
| BP-20 | low | best-practices-and-ops.md | P2.5, P11.3 |
| BP-21 | low | best-practices-and-ops.md | P1.5, P11.6 |
| BP-22 | medium | best-practices-and-ops.md | P2.5, P2.17, P7.8 |
| BP-23 | medium | best-practices-and-ops.md | P0.10, P0.11 |
| BP-24 | medium | best-practices-and-ops.md | P2.4, P2.6 |
| BP-25 | medium | best-practices-and-ops.md | P5.9, P8.8 |
| BP-26 | medium | best-practices-and-ops.md | P2.1 |
| BP-27 | medium | best-practices-and-ops.md | P4.3 |
| BP-28 | medium | best-practices-and-ops.md | P7.8 |
| BP-29 | medium | best-practices-and-ops.md | P10.1, P10.7 |
| BP-30 | medium | best-practices-and-ops.md | P10.1, P10.4, P11.21 |
| BP-31 | low | best-practices-and-ops.md | P11.19 |
| BP-32 | low | best-practices-and-ops.md | P10.7 |
| BP-33 | low | best-practices-and-ops.md | P8.8, P10.7 |
| BP-34 | low | best-practices-and-ops.md | P2.15, P5.4, P10.9, P11.29 |
| BP-35 | low | best-practices-and-ops.md | P7.5, P10.17 |
| BP-36 | low | best-practices-and-ops.md | P1.1 |
| BP-37 | low | best-practices-and-ops.md | P4.16, P11.4 |
| BP-38 | low | best-practices-and-ops.md | P2.15, P11.23 |
| BP-39 | low | best-practices-and-ops.md | P1.2, P11.26 |
| DUP-01 | medium | code-duplication.md | P0.9 |
| DUP-02 | medium | code-duplication.md | P5.9, P8.8 |
| DUP-03 | medium | code-duplication.md | P2.3 |
| DUP-04 | medium | code-duplication.md | P0.13, P2.11, P2.12 |
| DUP-05 | medium | code-duplication.md | P10.24, P11.31 |
| DUP-06 | medium | code-duplication.md | P4.3, P11.5 |
| DUP-07 | medium | code-duplication.md | P11.2 |
| DUP-08 | low | code-duplication.md | P11.29 |
| DUP-09 | low | code-duplication.md | P3.10 |
| DUP-10 | medium | code-duplication.md | P2.1 |
| DUP-11 | low | code-duplication.md | P11.5 |
| DUP-12 | medium | code-duplication.md | P1.1 |
| DUP-13 | medium | code-duplication.md | P1.2 |
| DUP-14 | medium | code-duplication.md | P3.4, P10.11, P10.14, P10.15 |
| DUP-15 | medium | code-duplication.md | P1.3 |
| DUP-16 | low | code-duplication.md | P1.2 |
| RWP-01 | high | rewind-pipeline-audit.md | P0.8, P0.20, P5.10 |
| RWP-02 | medium | rewind-pipeline-audit.md | P0.9 |
| RWP-03 | high | rewind-pipeline-audit.md | P2.2, P2.7 |
| RWP-04 | high | rewind-pipeline-audit.md | P0.14, P5.1 |
| RWP-05 | medium | rewind-pipeline-audit.md | P2.4 |
| RWP-06 | medium | rewind-pipeline-audit.md | P0.15, P2.4, P2.8, P7.2 |
| RWP-07 | medium | rewind-pipeline-audit.md | P2.4, P2.7 |
| RWP-08 | medium | rewind-pipeline-audit.md | P0.17, P6.9 |
| RWP-09 | medium | rewind-pipeline-audit.md | P0.11 |
| RWP-10 | low | rewind-pipeline-audit.md | P2.3 |
| RWP-11 | medium | rewind-pipeline-audit.md | P2.17 |
| RWP-12 | medium | rewind-pipeline-audit.md | P0.12 |
| RWP-13 | low | rewind-pipeline-audit.md | P5.9 |
| RWP-14 | medium | rewind-pipeline-audit.md | P2.17, P5.9 |
| RWP-15 | medium | rewind-pipeline-audit.md | P0.13, P2.11, P2.12 |
| RWP-16 | low | rewind-pipeline-audit.md | P2.9, P5.8 |
| RWP-17 | medium | rewind-pipeline-audit.md | P2.6, P11.12 |
| RWP-18 | medium | rewind-pipeline-audit.md | P2.6, P2.8, P2.9, P7.1 |
| RWP-19 | low | rewind-pipeline-audit.md | P5.9, P7.3 |
| RWP-20 | medium | rewind-pipeline-audit.md | P2.4, P2.17, P8.8 |
| RWP-21 | low | rewind-pipeline-audit.md | P2.1 |
| RWP-22 | low | rewind-pipeline-audit.md | P0.13, P2.11 |
| RWV-01 | high | rewind-visuals-audit.md | P2.13, P5.7 |
| RWV-02 | high | rewind-visuals-audit.md | P0.14, P5.1 |
| RWV-03 | high | rewind-visuals-audit.md | P5.2 |
| RWV-04 | high | rewind-visuals-audit.md | P5.2, P5.6, P7.4 |
| RWV-05 | high | rewind-visuals-audit.md | P0.11, P7.5 |
| RWV-06 | medium | rewind-visuals-audit.md | P5.10, P5.11, P7.6 |
| RWV-07 | high | rewind-visuals-audit.md | P5.5, P5.7, P6.9, P7.13 |
| RWV-08 | medium | rewind-visuals-audit.md | P2.13 |
| RWV-09 | high | rewind-visuals-audit.md | P2.15, P3.2, P5.3, P5.12, P7.15 |
| RWV-10 | medium | rewind-visuals-audit.md | P5.5, P5.7, P5.8 |
| RWV-11 | medium | rewind-visuals-audit.md | P5.5, P5.6, P7.1, P7.2, P7.3 |
| RWV-12 | medium | rewind-visuals-audit.md | P5.5, P11.29 |
| RWV-13 | low | rewind-visuals-audit.md | P5.2, P5.4, P7.15, P11.29 |
| RWV-14 | info | rewind-visuals-audit.md | Deferred: Info severity. Optional audio has no 2026 functional requirement, and Config.rewindAudio stays off by default. Whether to build it at all is Rewind open question 8, and this plan assumes it is not built in 2026. Revisit for Rewind 2027 together with narration and theme music, which the design already rules out for 2026 (Rewind 4.8). |
| SEC-01 | critical | security-audit.md | P0.1 |
| SEC-02 | high | security-audit.md | P0.3 |
| SEC-03 | medium | security-audit.md | P4.17 |
| SEC-04 | medium | security-audit.md | P4.1 |
| SEC-05 | low | security-audit.md | P0.3, P1.5 |
| SEC-06 | low | security-audit.md | P0.2 |
| SEC-07 | low | security-audit.md | P0.1, P11.23 |
| SEC-08 | high | security-audit.md | P0.5 |
| SEC-09 | medium | security-audit.md | P4.1 |
| SEC-10 | medium | security-audit.md | P4.7 |
| SEC-11 | medium | security-audit.md | P4.8 |
| SEC-12 | medium | security-audit.md | P4.7 |
| SEC-13 | low | security-audit.md | P4.9 |
| SEC-14 | low | security-audit.md | P0.5 |
| SEC-15 | low | security-audit.md | P0.4 |
| SEC-16 | high | security-audit.md | P0.8, P0.19, P5.10, P5.11, P7.5 |
| SEC-17 | medium | security-audit.md | P0.9 |
| SEC-18 | medium | security-audit.md | P0.18 |
| SEC-19 | low | security-audit.md | P4.3 |
| SEC-20 | low | security-audit.md | P3.8, P4.3, P10.17 |
| SEC-21 | low | security-audit.md | P0.16 |
| SEC-22 | high | security-audit.md | P0.12 |
| SEC-23 | medium | security-audit.md | P4.20 |
| SEC-24 | medium | security-audit.md | P0.10 |
| SEC-25 | medium | security-audit.md | P0.10 |
| SEC-26 | medium | security-audit.md | P0.11 |
| SEC-27 | medium | security-audit.md | P4.13 |
| SEC-28 | medium | security-audit.md | P4.5 |
| SEC-29 | medium | security-audit.md | P4.12 |
| SEC-30 | medium | security-audit.md | P10.25, P11.32 |
| SEC-31 | medium | security-audit.md | P4.6, P10.20 |
| SEC-32 | medium | security-audit.md | P11.1 |
| SEC-33 | low | security-audit.md | P11.1 |
| SEC-34 | low | security-audit.md | P11.1, P11.14 |
| SEC-35 | medium | security-audit.md | P0.6 |
| SEC-36 | low | security-audit.md | P2.3 |
| SEC-37 | medium | security-audit.md | P4.10 |
| SEC-38 | medium | security-audit.md | P4.10 |
| SEC-39 | medium | security-audit.md | P4.10 |
| SEC-40 | medium | security-audit.md | P4.10 |
| SEC-41 | low | security-audit.md | P4.10 |
| SEC-42 | medium | security-audit.md | P3.8, P4.15 |
| SEC-43 | medium | security-audit.md | P2.17, P5.9 |
| SEC-44 | medium | security-audit.md | P0.13, P2.11, P2.12 |
| SEC-45 | low | security-audit.md | P4.15 |
| SEC-46 | low | security-audit.md | P5.8 |
| SEC-47 | medium | security-audit.md | P4.18 |
| SEC-48 | medium | security-audit.md | P4.18 |
| SEC-49 | medium | security-audit.md | P11.2 |
| SEC-50 | low | security-audit.md | P4.19 |
| SEC-51 | low | security-audit.md | P4.19 |
| SEC-52 | low | security-audit.md | P11.2 |
| SEC-53 | low | security-audit.md | P0.1, P11.20 |
| SEC-54 | low | security-audit.md | P4.16 |
| SEC-55 | low | security-audit.md | P4.6, P10.20 |
| SEC-56 | low | security-audit.md | P4.3 |
| SEC-57 | low | security-audit.md | P3.8, P4.3 |
| UI-01 | high | ui-ux-audit.md | P1.1, P6.11 |
| UI-02 | high | ui-ux-audit.md | P0.14, P5.1, P6.9 |
| UI-03 | high | ui-ux-audit.md | P10.24, P10.25 |
| UI-04 | high | ui-ux-audit.md | P6.1 |
| UI-05 | medium | ui-ux-audit.md | P10.18 |
| UI-06 | medium | ui-ux-audit.md | P6.1, P7.9, P10.2, P10.6 |
| UI-07 | medium | ui-ux-audit.md | P3.2, P6.11, P10.21 |
| UI-08 | medium | ui-ux-audit.md | P10.3, P10.5 |
| UI-09 | high | ui-ux-audit.md | P5.2, P5.3, P5.12 |
| UI-10 | high | ui-ux-audit.md | P3.2, P3.6, P10.23, P10.28 |
| UI-11 | medium | ui-ux-audit.md | P3.2 |
| UI-12 | medium | ui-ux-audit.md | P1.7, P3.1, P3.3, P10.13, P10.14, P10.18 |
| UI-13 | medium | ui-ux-audit.md | P3.5, P6.5, P10.2, P10.20, P10.25 |
| UI-14 | medium | ui-ux-audit.md | P3.5, P3.6 |
| UI-15 | medium | ui-ux-audit.md | P2.15, P3.1, P5.3, P10.21, P10.23, P10.25 |
| UI-16 | high | ui-ux-audit.md | P3.1, P6.3, P7.5, P10.13, P10.21, P10.25 |
| UI-17 | high | ui-ux-audit.md | P3.4, P10.11, P10.13, P10.14, P10.19 |
| UI-18 | medium | ui-ux-audit.md | P3.1 |
| UI-19 | medium | ui-ux-audit.md | P6.1, P10.17, P10.27 |
| UI-20 | medium | ui-ux-audit.md | P2.13, P3.2 |
| UI-21 | medium | ui-ux-audit.md | P6.1, P6.5, P10.1, P10.4, P10.6 |
| UI-22 | medium | ui-ux-audit.md | P6.5, P10.3, P10.5 |
| UI-23 | medium | ui-ux-audit.md | P6.5, P10.1, P10.2, P10.3, P10.4, P10.18 |
| UI-24 | medium | ui-ux-audit.md | P3.9, P10.2, P10.5, P10.9 |
| UI-25 | medium | ui-ux-audit.md | P3.8, P10.5, P10.21, P10.22 |
| UI-26 | low | ui-ux-audit.md | P1.1, P3.9, P10.15 |
| UI-27 | low | ui-ux-audit.md | P3.4, P3.5, P10.19 |
| UI-28 | low | ui-ux-audit.md | P3.10, P10.1, P10.2, P10.18, P10.21 |
| UI-29 | medium | ui-ux-audit.md | P7.8, P7.9, P10.6, P10.8 |
| UI-30 | medium | ui-ux-audit.md | P6.3, P6.11, P10.22 |
| UI-31 | medium | ui-ux-audit.md | P10.19, P10.20 |
| UI-32 | low | ui-ux-audit.md | P6.1, P10.16 |
| UI-33 | medium | ui-ux-audit.md | P10.23, P10.25 |
| UI-34 | medium | ui-ux-audit.md | P10.21, P10.23 |
| UI-35 | medium | ui-ux-audit.md | P10.27 |
| UI-36 | medium | ui-ux-audit.md | P10.26 |
| UI-37 | medium | ui-ux-audit.md | P10.22, P10.28 |
| UI-38 | medium | ui-ux-audit.md | P10.21 |
| UI-39 | medium | ui-ux-audit.md | P3.9, P5.1, P7.5, P10.26 |
| UI-40 | low | ui-ux-audit.md | P10.26, P10.27, P10.28 |
| UI-41 | medium | ui-ux-audit.md | P10.1, P10.7, P10.16 |
| UI-42 | medium | ui-ux-audit.md | P3.6, P10.5, P10.18 |
| UI-43 | medium | ui-ux-audit.md | P8.8, P10.1, P10.4 |
| UI-44 | low | ui-ux-audit.md | P3.4, P10.17 |
| UI-45 | low | ui-ux-audit.md | P1.1 |
| UI-46 | low | ui-ux-audit.md | P10.11, P10.18 |

## Appendix B: Risks

- Rewind scope may not fit before the 2026-12-10 feature freeze. Mitigation: registry pages are independent, the ten core pages ship first, and rewindDisabledPages turns pages off without a deploy. Plan-level cuts apply first, in this order: (1) the final-cut batch adapters (former P8.6, a P2 item), already dropped for 2026; (2) P8.8's playground swap (FR-42 is P1); (3) the eval results page, already moved to January (P11.30); (4) P8.4's Edit card (FR-23, P1); (5) P7.6's non-core cards, whose pages keep Copy link only (decision 29). Then the design's list, in order: People (08); Setup (13); Next year (17), first the picks and Sonarr parts; the race scrubber (keep autoplay and the static final frame); the square card format (already P2); desktop Notes beyond Top shows, the calendar and the centrefold. The ten core pages (Bookends included), sharing, privacy and accessibility are never cut.
- The links nearest the 2026-11-24 release cut have little float: P7.17 none (it is due 2026-11-25), P7.15 one working day, and P7.2, P7.11, P7.14 and P5.13 two; P5.2, P5.5, P5.8 and P5.9 have four, and the UI foundations six to ten. Float is shared along a chain, so an upstream slip uses it up for every later link. Mitigation: the critical-path table in 'How to use this plan' is checked at every weekly review. P7.16 depends only on what the soft launch needs (P7.11's gallery, P7.12, P7.15 and P4.16), and P7.6, P7.13, the v2 deletion and the eval page are off the chain. Admin-audience generation runs on real data from 2026-11-20, so the soft launch is a sign-off rather than the first shakedown. Soft-launch fixes merge by 12:00 on 2026-11-30; a fix that misses the cutoff becomes a cut through rewindDisabledPages or a flag.
- Review time, not agent time, is the limit. The plan budgets about 18 review units a week before the season (S 0.5, M 1, L 2 or one per PR), across three lanes with at most two open PRs each, and no week before the season goes above 18. Mitigation: every step without a Rewind consumer moved to January (P10.13 to P10.28, P11.28, P11.29, P11.31, P11.32); owner-only work is a dated calendar item with its own time; when a week runs over, the next hardening-lane step slips first, because only P4.16 of that lane feeds the soft launch. Reaching 12 units a week would mean cutting Rewind P0 scope (decision 30).
- If the UI primitives miss the 2026-11-06 handoff, the story player is blocked. Mitigation: P3.7 is the UI lane's first priority after the base primitives; if it slips, Rewind builds its sheets on Base UI Dialog inside components/rewind and swaps them to Sheet afterwards. P6.5 has the same priority and fallback, and P7.8 and P7.12 no longer wait for P6.1 or a settings refresh.
- The Next 16.4.2 and React 19.3.1 upgrade could change behaviour or Satori output. Mitigation: full Jest and E2E runs in P0.1, production-mode E2E in CI from P1.5, cards re-measured in P2.14, and the og and Satori versions included in CARD_VERSION.
- The auth and session changes (P4.7, P4.8, P4.9) could lock members out during the season. Mitigation: P4.7 and P4.8 land by 2026-11-12 and P4.9 by 2026-11-23, with E2E on every sign-in path. No sign-in-path change merges from 2026-11-25 to 2026-12-10 except a security fix, and the sign-in, invite, onboarding and subscribe refreshes moved to January.
- Redis may be down or missing during the season. Mitigation: FR-50 fail-fast enqueue and explanations, the season dashboard preflight, idempotent jobs that resume after a restart, register() no longer blocking on Redis (P4.2), and the Docker health check (P4.17), whose liveness probe does not restart the app when only Redis is down.
- Tautulli may be slow or rate-limit during the bulk run. Mitigation: one server-wide history pass per batch, the Redis semaphore of 4 calls per upstream service across processes, per-batch caching, generation spread over the night of 30 November, and P4.20's throttles on the /mystats and resync scans, merged by 2026-11-19.
- A member could see wrong numbers or other members' data. Mitigation: every fact comes from one tested module and is checked against hand-checked fixtures (P2.10, P2.16), with four-zone DST tests. The strict toShareSafe allow-list has whole-segment key-snapshot, contract and pixel tests. The Phase 0 cleanup script strips stored rosters. Contributor thresholds apply (3 for community facts, 10 for rarity and medians), content-rating exclusions fail closed, and the back cover links to a report-a-problem queue.
- The model could drift, a provider could have an outage, or prices could change in December. Mitigation: the model and prompt are frozen; failing slots get one repair call on the budget model, then per-slot templates, so a Rewind completes without the LLM. The season budget cap applies, and prices are re-checked on 2026-12-01.
- Migrations deploy automatically on container start, and operators who upgrade with db push or migrate dev would skip the rewind_2026 data migration. Mitigation: the Phase 0 rule requires a pg_dump before every deploy that carries a migration; P1.10 makes db:deploy the documented path, with a pre-flight, SKIP_MIGRATIONS and backup and restore commands, by 2026-11-03, before the first season migration deploys; P1.5's schema-drift check gates every migration; the last pre-season migration ships in the 2026-11-24 release, and none lands from 2026-11-25 to 2027-01-02 except a named freeze exception.
- Thanksgiving (2026-11-26) falls inside the gallery review. Mitigation: the gallery is ready on 2026-11-20, the owner reviews on 2026-11-25 and 2026-11-27, the soft launch may slip to 2026-11-29 without moving 2026-12-01, and the 12:00 cutoff on 2026-11-30 still holds.
- The final cut could fail on production-like data during the code freeze. Mitigation: the validator ships in P8.5 and runs against production after the 2026-12-01 generation; P8.10 rehearses the final cut on staging by 2026-12-11, before the code freeze, so a failure is still ordinary work; P9.2 is the second rehearsal on 2026-12-28; and the untested batch path is dropped.
- January routing could break again. Mitigation: /rewind resolves the latest completed year, and an E2E test runs with the clock set to 2027-01-02 (P0.14, P5.1).
- Rewind stays live until 2027-01-31 while P10 and P11 run. Mitigation: P11.1 and P11.3, which change runtime pieces Rewind depends on, run after 2027-01-31; every January migration takes a dump first; and P5.4's Rewind projects stay required checks.
- The token codemod could produce enough visual churn to hide regressions. Mitigation: it runs in January (P10.13 to P10.15), one slice per PR with reviewed screenshot diffs, and a design-debt ratchet that only goes down.
- Web Share with files can lose user activation on iOS Safari. Mitigation: the share sheet prefetches the card File when it opens, and an E2E test covers it on webkit.

## Appendix C: Decisions needed from the owner

- Decision 1: Rewind Q1, season timing. Decide by 2026-10-20 (P2.1 adds the season fields on 2026-10-22 and P2.2 the season dates on 2026-10-26; P7.8, P8 and P9 follow from them). Planned as designed: open on 2026-12-01 with data through 30 November, and run the final cut on 1-2 January 2027. Confirm, or choose a later opening such as 15 December. If no answer arrives by then, the planned default applies.
- Decision 2: Rewind Q2, archetype colourways. Decide by 2026-11-09 (P5.2). Planned with the fixed twelve-ink palette and no admin recolouring. If no answer arrives by then, the planned default applies.
- Decision 3: Rewind Q3, artwork on public cards. Decide by 2026-11-12 (P5.10). Planned with artwork allowed on cards by default and members opting in per share. Confirm, or make it off by default. If no answer arrives by then, the planned default applies.
- Decision 4: Rewind Q4, server name on public cards. Decide by 2026-11-12 (P5.10). Planned on by default (rewindShowServerNameOnCards). If no answer arrives by then, the planned default applies.
- Decision 5: Rewind Q5, member time zones. Decide by 2026-10-20 (P2.1 adds User.timezone on 2026-10-22, and P2.2 and P6.11 use it). Planned with the optional User.timezone on /account. The alternative is to bucket by the server zone only. If no answer arrives by then, the planned default applies.
- Decision 6: Rewind Q6, archetype seals. Decide by 2026-11-09 (P5.2). Planned with the typographic stamp and no AI-generated seals. If no answer arrives by then, the planned default applies.
- Decision 7: Rewind Q7, quiz results. Decide by 2026-11-12 (P5.4 and P5.5). Planned as session-only. If no answer arrives by then, the planned default applies.
- Decision 8: Rewind Q8, sound. Decide by 2026-12-02 (the ship window). Planned as not built in 2026: rewindAudio stays off, and RWV-14 is deferred to 2027. Say if the paper-and-stamp cues should be added in the ship window. If no answer arrives by then, the planned default applies.
- Decision 9: Rewind Q9, default model. Decide by 2026-11-16 (P5.13, ahead of the 18-20 November bake-off). Planned so the bake-off decides by the selection rule. State any provider preference (Anthropic, OpenAI, or local Ollama for privacy). If no answer arrives by then, the planned default applies.
- Decision 10: Rewind Q10, member-triggered regeneration. Decide by 2026-11-02 (P2.17). Planned as resolved in review: 1 per 10 minutes and 3 per day before the season closes, and hiding a title triggers a regeneration with no LLM call. Say if regeneration should be admin-only instead. If no answer arrives by then, the planned default applies.
- Decision 11: Rewind Q11, lapsed subscribers. Decide by 2026-11-04 (P4.5). Planned as read-only access to completed Rewinds, enforced per request, with the right to stop or rotate links, and no new generation, cards or links. Confirm, or hide Rewind from lapsed members entirely. If no answer arrives by then, the planned default applies.
- Decision 12: UI Q1, server name. Decide by 2026-11-05 (P6.3's Wordmark). What should Config.serverName be? The seed says 'Test Plex Server'. Until it is set, the brand falls back to the Plex server's name. If no answer arrives by then, the planned default applies.
- Decision 13: UI Q2, light theme. Decide by 2027-02-15 (P10.10). Planned as dark only at launch, with light enabled in February 2027 behind its flag (P10.10). If no answer arrives by then, the planned default applies.
- Decision 14: UI Q3, the New on poster row. Decide by 2027-01-15 (P10.12). Planned to ship home without it before the season and add it in January (P10.12). If no answer arrives by then, the planned default applies.
- Decision 15: UI Q4, public artwork on sign-in and invite. Decide by 2027-01-19 (P10.26 and P10.27). Planned with none. If no answer arrives by then, the planned default applies.
- Decision 16: UI Q6, Overview page timing. Decide by 2027-02-08 (P10.8). Planned for after Rewind ships (P10.8). If no answer arrives by then, the planned default applies.
- Decision 17: UI Q7, settings structure. Decide by 2027-01-13 (P10.19). Planned as one page with a section nav. If no answer arrives by then, the planned default applies.
- Decision 18: UI Q8, uptime strip. Decide by 2027-01-14 (P11.9). Planned as hidden when Prometheus is not configured. If no answer arrives by then, the planned default applies.
- Decision 19: UI Q9, brand marks. Decide by 2027-01-13 (P10.19 and P10.25). Planned with generic lucide glyphs. If no answer arrives by then, the planned default applies.
- Decision 20: UI Q10, typed confirmation. Decide by 2027-01-11 (P10.18). Planned only for removing Plex access, plus the new delete-member action (P11.13). If no answer arrives by then, the planned default applies.
- Decision 21: UI Q11, date style. Decide by 2026-10-22 (P2.1 adds Config.locale, and P3.10 uses it from 2026-10-28). Planned with Config.locale defaulting to en-US. Say if this server should default to en-GB. If no answer arrives by then, the planned default applies.
- Decision 22: Admin page timing. Decide by 2026-10-23 (the end of the first week, before any page work is scheduled). ui-design-system 9.2 schedules the remaining admin pages (invites, shares, LLM usage, cost, queues, prompts, announcements, Discord, user detail, history) in its phase 3, by 2026-12-04. This plan moves them to January 2027 (P10), so that admin work lands after Rewind ships. Decision 28 extends the same move to the admin users and settings pages. Confirm. If no answer arrives by then, the planned default applies.
- Decision 23: Code freeze scope. Decide by 2026-12-09 (P8.9's freeze gate). The plan treats the 2026-12-14 code freeze as app-wide: only data and security fixes until the final cut. Confirm. If no answer arrives by then, the planned default applies.
- Decision 24: Rate limits without Redis. Decide by 2026-10-20 (P0.10, which starts on 2026-10-21). On installs without REDIS_URL, the new limiter falls back to an in-process store with the same keys, which is not shared across processes; Rewind itself still requires Redis (FR-50). Confirm, or require Redis for the limiter too. If no answer arrives by then, the planned default applies.
- Decision 25: Eval budget and fixtures. Decide by 2026-11-06 (P2.10 for the profiles and the budget, and P2.16 for the golden values, reviewed by 2026-11-10). Planned at about $5-15 per full candidate sweep plus about $5 for the judge. The owner signs off the fixture profiles and the budget on 2026-11-06 and reviews the hand-checked golden values by 2026-11-10. If no answer arrives by then, the planned default applies.
- Decision 26: CLAUDE.md timing. Decide by 2026-10-26 (P1.2, which starts on 2026-10-27). The CLAUDE.md corrections (GAP-22) move forward to the week of 2026-10-26, because every agent session reads that file. Confirm this exception to the rule that docs work waits until after the freeze. If no answer arrives by then, the planned default applies.
- Decision 27: Auth library. Decide by 2027-02-24 (P11.23's Better Auth spike; nothing before it depends on the answer). The plan runs only a Better Auth spike in February 2027 (P11.23); the decision to migrate off next-auth v4 follows the spike, and until then the app stays on next-auth v4. If no answer arrives by then, the planned default applies.
- Decision 28: January moves. Decide by 2026-10-23 (the end of the first week). ui-design-system 9.2 schedules the command menu, the status screens, admin users and settings, the home refresh, announcements, help, membership, onboarding, setup, invite, sign-in and subscribe by 2026-12-04, and its Phase 1 includes the token codemod. This plan moves them to January 2027 (P10.13 to P10.28), together with the watchlist sync (P11.28), the setup claim (P11.32), the v2 viewer deletion (P11.29) and the duplicate service-row clean-up (P11.31). None of them has a Rewind consumer, and the review capacity before the season goes to Rewind. Through the season those pages keep today's design on the new tokens. Confirm. If no answer arrives by then, the planned default applies.
- Decision 29: Late P0 items. Decide by 2026-11-20 (P7.6 and P7.13, which start on 2026-12-03). P7.6 (cards for the non-core pages, FR-18) and P7.13 (archive articles for stored years, FR-1) land in the ship window, by 2026-12-04, not before the opening. Until then non-core pages offer Copy link only, and stored v1 and v2 years render through WrappedYearView. If the ship window runs short, P7.6's non-core cards are the fifth plan-level cut and those pages keep Copy link only. Confirm. If no answer arrives by then, the planned default applies.
- Decision 30: Review capacity. Decide by 2026-10-23 (the end of the first week). The plan budgets about 18 review units a week before the season, not 12: Rewind's P0 scope alone needs about 10 a week from 2026-10-26 to 2026-11-24. Reaching 12 would mean cutting Rewind P0 pages (for example People, Setup and Next year) and the pocket edition before work starts. Confirm 18, or name the pages to cut. If no answer arrives by then, the planned default applies.
- Decision 31: Final-cut batch path. Decide by 2026-12-02 (the ship window). The final-cut batch adapters (former P8.6, a P2 item) are dropped for 2026: they saved about $0.05 per 100 members, and the batch path would have run for the first time in production on 1 January. The final cut runs interactively, as P8.10 and P9.2 rehearse it. Confirm. If no answer arrives by then, the planned default applies.
