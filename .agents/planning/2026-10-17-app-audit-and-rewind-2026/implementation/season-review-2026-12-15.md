> Part of the [implementation plan](plan.md). The procedure is [P9.1](phases/p9-monitor-and-final-cut.md#step-p91-season-monitoring-and-the-first-success-review), "Success review".

# Rewind 2026 success review, 2026-12-15

One row per design 1.4 success measure. Status is on track or at risk; an
action stays inside the freeze: a non-core page with a confirmed rendering bug
goes into `rewindDisabledPages`, a low open rate gets an Announcements post,
and anything else becomes a `rewind-2027` issue. The ready notification is
never re-sent. The 2027-01-15 review reuses this table.

| Measure | Target | Value | Source | Status | Action |
|---|---|---|---|---|---|
| Opened (interim; due 2026-12-31) | 70% | | `getRewindSuccessMeasures(2026)`: distinct members with a view over members with a completed Rewind | | |
| Reached the centrefold | | | `getRewindSuccessMeasures(2026)` over `RewindView` | | |
| Shared | | | `getRewindSuccessMeasures(2026)` over `RewindShare` | | |
| Generation success | 100% | | Completed `RewindGeneration` rows over eligible members (template copy counts) | | |
| Grounding (fixtures) | 98% | | The frozen model's committed results in `evals/rewind/results/` | | |
| Grounding (live proxy) | | | `copySource` split over full editions: llm / repair / mixed / template | | |
| Cost per member | under $0.03 | | `lib/llm/usage-totals.ts` | | |
| Leaks | 0 | | The release commit's CI run | | |
| Axe | 0 violations | | The release commit's CI run | | |
| Frame budget | | | The release commit's CI run (Rewind Performance) | | |
| Wrong numbers | 0 confirmed | | Member reports via `/help#support` and Discord, each confirmed or rejected | | |

## Opened, final figure (2026-12-31)

| Value | Status | Action |
|---|---|---|
| | | |
