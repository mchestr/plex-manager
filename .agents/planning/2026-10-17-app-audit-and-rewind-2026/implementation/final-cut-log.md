> Part of the [implementation plan](plan.md). The procedure is [P9.3](phases/p9-monitor-and-final-cut.md#step-p93-final-cut-and-final-cut-notifications) and `docs/rewind.md`, "The final cut".

# Rewind 2026 final cut

Counts, percentages, typed codes and generation ids only: never a member name,
title, email or token. Paste script output as printed.

## 31 December preflight

| Item | Value |
|---|---|
| `pg_dump -Fc` file name | |
| Preflight green (Redis, Tautulli 2.17+, frozen model) | |
| Frozen model has no `retiresOn` on or before 2027-01-02; price re-checked | |
| Budget leaves P7.8's final-cut estimate plus 50% | |
| One delayed `REWIND_FINAL_CUT`, dedup id `rewind:final:2026`, at the instant P9.2 confirmed | |
| `REWIND_CACHE_DIR` has room for a second set of cards | |

## Run

| Item | Value |
|---|---|
| Started (UTC) | |
| Last completion (UTC) | |
| Final-cut generations by status | |
| Failures by typed code, and retries | |
| Copy source split (llm / repair / mixed / template) | |
| Re-call rate (all; full editions), next to P9.2's | |
| Cost per member (target under $0.005) | |

## 2 January checks

- [ ] No eligible member's latest final-cut generation is `failed`
- [ ] `scripts/rewind-validate.ts --year=2026 --final-cut` against production: zero failures (output below)
- [ ] Admin-preview spot checks: a full, a pocket and a postcard issue say "Final cut" on the cover, page 02 and the back cover, with December in the soundtrack
- [ ] One live public link serves the new cards and only its published pages
- [ ] "Your Rewind now includes December" sent: count, next to P9.2's recipient count

```
(validator output)
```

## Skipped members, by reason

| Reason | Count |
|---|---|
| `NOT_ENTITLED` | |
| `NO_PLEX_IDENTITY` | |
| `MANAGED_ACCOUNT` | |

## Close

- [ ] Release commit's CI green, with nothing merged since the freeze except labelled fixes
- [ ] `CODE_FREEZE` set to `off`, and noted in `season-log.md`
