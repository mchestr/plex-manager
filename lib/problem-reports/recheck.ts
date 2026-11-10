/**
 * What the gates of a fix that replaces a file (a swap's two, a removal's
 * one) check again, in the same serializable transaction that records the
 * run or marks it replacing (docs/problem-reports.md, "Checked again before
 * a grab or a delete"):
 *
 * - **A member's swap** (`automatic`): automatic swaps are still in the mode
 *   it was claimed under and haven't changed since, so changing the mode
 *   never runs a backlog; and the limits (`./gate.ts`) still allow it, from
 *   the ledger and the member's "Swaps need approval". Before the grab the
 *   run's own row is left out of the title's count. Evidence isn't read
 *   again: it was the reason to start.
 * - **An admin's tap** (`web` or `mcp`, a swap or a removal): the admin is
 *   still an admin at each gate, and the run reached its first gate within
 *   15 minutes of the tap, as in `lib/queue/jobs/member-activity.ts`. A step
 *   that runs again after a crash finds its row first, so a tap never acts
 *   twice.
 *
 * The breaker is checked by the gate itself (`./ledger.ts`), which latches
 * it. Other fixes check nothing here.
 *
 * @module lib/problem-reports/recheck
 */

import "server-only"

import type { PrismaTransactionClient } from "@/lib/prisma"
import type { FixTrigger } from "@/lib/problem-reports/fixes"
import { decideSwap, type SwapRefusal } from "@/lib/problem-reports/gate"
import { getSwapSettings } from "@/lib/problem-reports/settings"
import { readSwapLedger } from "@/lib/problem-reports/swap-ledger"

/** How long an admin's tap holds before the run must reach its gate. */
export const APPROVAL_MS = 15 * 60 * 1000

export type RecheckRefusal = "AUTO_CHANGED" | "PAUSED" | "NEEDS_APPROVAL" | "NOT_PLAYED" | "TITLE_RECENT" | "OUT_OF_SWAPS" | "NOT_ADMIN" | "APPROVAL_EXPIRED"

/** The run as its gates see it. */
export interface RecheckedRun {
  /** Its ledger row's id. */
  id: string
  action: string
  trigger: FixTrigger
  reporterId: string
  actorUserId: string | null
  titleKey: string
  /** When it was claimed, in epoch milliseconds; a run queued before claims were timed has none. */
  claimedAt: number | undefined
  dryRun: boolean
}

/** At the first gate, which records the run, or the gate before the grab. */
export type GateStep = "record" | "replace"

const AT_RUN_TIME: Record<SwapRefusal, RecheckRefusal> = {
  OFF: "AUTO_CHANGED",
  PAUSED: "PAUSED",
  NEEDS_APPROVAL: "NEEDS_APPROVAL",
  NOT_PLAYED: "NOT_PLAYED",
  TITLE_RECENT: "TITLE_RECENT",
  OUT_OF_SWAPS: "OUT_OF_SWAPS",
}

async function memberSwap(tx: PrismaTransactionClient, run: RecheckedRun, now: Date, step: GateStep): Promise<RecheckRefusal | null> {
  const settings = await getSwapSettings(tx)
  const changed = settings.automaticSince !== null && (run.claimedAt ?? 0) < settings.automaticSince.getTime()
  if (settings.automatic === "OFF" || changed || (settings.automatic === "DRY_RUN") !== run.dryRun) return "AUTO_CHANGED"
  const member = await tx.user.findUnique({ where: { id: run.reporterId }, select: { swapsNeedApproval: true } })
  const ledger = await readSwapLedger(
    tx,
    { reporterId: run.reporterId, titleKey: run.titleKey, cooldownDays: settings.titleCooldownDays, ...(step === "replace" ? { excludeId: run.id } : {}) },
    now
  )
  const decided = decideSwap(
    { mode: settings.automatic, limits: settings, ledger, breakerTripped: false, needsApproval: member?.swapsNeedApproval ?? true, playedRecently: true },
    now
  )
  return decided.ok ? null : AT_RUN_TIME[decided.reason]
}

async function adminTap(tx: PrismaTransactionClient, run: RecheckedRun, now: Date, step: GateStep): Promise<RecheckRefusal | null> {
  const actor = run.actorUserId ? await tx.user.findUnique({ where: { id: run.actorUserId }, select: { isAdmin: true } }) : null
  if (!actor?.isAdmin) return "NOT_ADMIN"
  if (step === "record" && (run.claimedAt === undefined || now.getTime() - run.claimedAt > APPROVAL_MS)) return "APPROVAL_EXPIRED"
  return null
}

/** The refusal a gate hands back, or `null` when the run may act; see the module comment. */
export async function recheckRun(tx: PrismaTransactionClient, run: RecheckedRun, now: Date, step: GateStep): Promise<RecheckRefusal | null> {
  if (run.action === "SWAP" && run.trigger === "automatic") return memberSwap(tx, run, now, step)
  if ((run.action === "SWAP" || run.action === "REMOVE_AND_SEARCH") && run.trigger !== "automatic") return adminTap(tx, run, now, step)
  return null
}
