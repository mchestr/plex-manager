> Part of the [implementation plan](plan.md). The procedure is [P9.1](phases/p9-monitor-and-final-cut.md#step-p91-season-monitoring-and-the-first-success-review).

# Rewind 2026 season log

One dated line each morning (in `Config.timezone`) from 2026-12-15 to
2026-12-31, read off `/admin/rewind`. Counts, percentages, typed codes and
generation ids only: never a member name, title, email or token.

## Baseline

| Item | Value |
|---|---|
| Production image digest on 2026-12-14 | |
| `CODE_FREEZE` set to `on` (date, time) | |
| Freeze gate a required check on main | |

## Daily checks

Failed lists each typed code and what was done (retried once, logs read,
explained). Skipped counts the expected eligibility reasons.

| Date | Failed | Skipped (`NOT_ENTITLED` / `NO_PLEX_IDENTITY` / `MANAGED_ACCOUNT`) | Stuck | Not started | Spend vs cap (USD) | Cost per member (USD) | Final-cut headroom ok | Preflight green | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-12-15 | | | | | | | | | |

## Weekly checks (21 and 28 December)

| Date | Strip-leaderboards dry run: zero changes | One day of logs: no unmasked tokens, share paths, invite codes or IPs | Three public links: published cards only, unsigned cards nameless, `X-Robots-Tag: noindex` | `npm audit --omit=dev` and Dependabot: no new high or critical |
|---|---|---|---|---|
| 2026-12-21 | | | | |
| 2026-12-28 | | | | |

## Freeze exceptions

Each is a `hotfix/<slug>` PR labelled `freeze:data` or `freeze:security`, with
a regression test, a dump before deploy and a deploy by image digest.

| Date | PR | Label | Image digest | Members affected | Regenerated |
|---|---|---|---|---|---|
| | | | | | |

## Named exceptions the owner allowed

| Date | What | Why |
|---|---|---|
| | | |

## Freeze lifted

Set by P9.3 once `final-cut-log.md` is written: `CODE_FREEZE` to `off`, for
P10 and P11 from 2027-01-04.

| Date, time | By |
|---|---|
| | |
