/**
 * The limits on members' own swaps of the copy (docs/problem-reports.md,
 * "Members' swaps"), as pure rules over what the ledger and the settings
 * say. The sheet's words, the report and both gates of a run read the same
 * decision, so a member is never told one thing while another runs.
 *
 * | Rule              | Limit (default)                               | Refusal          |
 * |-------------------|-----------------------------------------------|------------------|
 * | Automatic swaps   | the setting is On or Dry run                  | `OFF`            |
 * | Server-wide       | 10 a day, and the breaker isn't tripped       | `PAUSED`         |
 * | Approval          | "Swaps need approval" is off for the member   | `NEEDS_APPROVAL` |
 * | Evidence          | played in the last 30 days, or watching now   | `NOT_PLAYED`     |
 * | Title             | none in its cooldown (14 days); under 2 in 60 | `TITLE_RECENT`   |
 * | Member            | 3 in any 7 days                               | `OUT_OF_SWAPS`   |
 *
 * The first rule that applies is the one the member hears. A member's swap
 * counts from its grab for 7 days, unless it ended without a new copy; a
 * title's limits count every attempt but dry runs. The counts come from the
 * ledger alone (`./swap-ledger.ts`), so deleting reports never resets them.
 *
 * @module lib/problem-reports/gate
 */

import type { ProblemAutomaticMode } from "@/lib/generated/prisma/client"

const DAY_MS = 24 * 60 * 60 * 1000
/** How long a member's swap counts against their allowance. */
export const WEEK_MS = 7 * DAY_MS
/** The loop guard: this many swaps of one title in 60 days leave it to the server admin. */
export const TITLE_LOOP = { swaps: 2, windowMs: 60 * DAY_MS }
/** How recent a member's play of a title must be for a swap. */
export const PLAYED_WITHIN_MS = 30 * DAY_MS

export interface SwapLimits {
  /** Swaps a member may spend in any 7 days. */
  weeklySwaps: number
  /** Days after a member's swap of a title before another. */
  titleCooldownDays: number
  /** Members' swaps a day, server-wide. */
  dailySwapCap: number
}

/** What the ledger says, as `./swap-ledger.ts` reads it. */
export interface SwapLedger {
  /** When each of the member's swaps that still count began replacing the file. */
  memberSwaps: Date[]
  /** Members' swaps of the title started within its cooldown. */
  titleRecent: number
  /** Swaps of the title from any trigger started in the last 60 days. */
  titleTwoMonths: number
  /** Members' swaps that began replacing a file in the last day, server-wide. */
  serverToday: number
}

export interface SwapFacts {
  mode: ProblemAutomaticMode
  limits: SwapLimits
  ledger: SwapLedger
  breakerTripped: boolean
  needsApproval: boolean
  /** The member played the title in the last 30 days, or is watching it now. */
  playedRecently: boolean
}

export type SwapRefusal = "OFF" | "PAUSED" | "NEEDS_APPROVAL" | "NOT_PLAYED" | "TITLE_RECENT" | "OUT_OF_SWAPS"

/** The member's swaps left now, of how many, and when the next one comes back. */
export interface Allowance {
  left: number
  of: number
  nextBack: Date | null
}

export type SwapDecision = { ok: true; dryRun: boolean; allowance: Allowance } | { ok: false; reason: SwapRefusal; until: Date | null }

const refuse = (reason: SwapRefusal, until: Date | null = null): SwapDecision => ({ ok: false, reason, until })

/**
 * The member's allowance over the rolling 7 days. With swaps left, the next
 * one back is the oldest's; with none, it's the one whose ageing out brings
 * the count under the limit.
 *
 * @internal
 */
export function allowance(memberSwaps: Date[], weeklySwaps: number, now: Date): Allowance {
  const counted = memberSwaps.filter((at) => now.getTime() - at.getTime() < WEEK_MS).sort((a, b) => a.getTime() - b.getTime())
  const left = Math.max(0, weeklySwaps - counted.length)
  const freeing = left > 0 ? counted[0] : counted[counted.length - weeklySwaps]
  return { left, of: weeklySwaps, nextBack: freeing ? new Date(freeing.getTime() + WEEK_MS) : null }
}

/** Whether a member's swap may run; see the module comment for the rules and their order. */
export function decideSwap(facts: SwapFacts, now: Date): SwapDecision {
  const { mode, limits, ledger } = facts
  if (mode === "OFF") return refuse("OFF")
  if (facts.breakerTripped || ledger.serverToday >= limits.dailySwapCap) return refuse("PAUSED")
  if (facts.needsApproval) return refuse("NEEDS_APPROVAL")
  if (!facts.playedRecently) return refuse("NOT_PLAYED")
  if (ledger.titleRecent > 0 || ledger.titleTwoMonths >= TITLE_LOOP.swaps) return refuse("TITLE_RECENT")
  const left = allowance(ledger.memberSwaps, limits.weeklySwaps, now)
  if (left.left === 0) return refuse("OUT_OF_SWAPS", left.nextBack)
  return { ok: true, dryRun: mode === "DRY_RUN", allowance: left }
}
