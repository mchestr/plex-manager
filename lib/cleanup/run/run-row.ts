/**
 * The run row (TS 8.3 steps 2, 12 and 13): every run kind (`run`, `dryRun`,
 * `act`) creates one `CleanupRun` row at its start and finishes it with its
 * counts, its blocks and its `CLEANUP_RUN` audit row. An admin run that
 * finds the claim busy writes only the audit row. Server-only.
 *
 * The counts of rescued, deleted and failed titles, and the bytes freed,
 * come from the outcome rows of the run, so the run (`run.ts`) and the act
 * job (TS 9.3) count them the same way. An audit write that fails is logged
 * and does not fail the run.
 *
 * @module lib/cleanup/run/run-row
 */

import "server-only"

import type { Block, RunOutcome } from "@/lib/cleanup/blocks"
import type { RunRuleEntry } from "@/lib/cleanup/schema/stats"
import { prisma } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_RUN")

/** The counts of a run row. `freedBytes` is a string (a `BigInt` sum). */
export interface RunCounts { checked: number; matched: number; joined: number; held: number; rescued: number; deleted: number; failed: number
  deferred: number; freedBytes: string }
export type RunKind = "run" | "dryRun" | "act"
export interface FinishInput { kind: RunKind; trigger: string; actorId: string; outcome: RunOutcome; blocks: Block[]
  entries: Omit<RunRuleEntry, "rescued" | "deleted" | "failed">[]; checked: number; matched: number; joined: number; held: number; deferred: number }

const ZERO = { rescued: 0, deleted: 0, failed: 0 }
const NONE = { checked: 0, matched: 0, joined: 0, held: 0, deferred: 0 }

/** Creates a run row. The schedule's actor is stored as null. */
export async function createRunRow(input: { kind: RunKind; trigger: string; actorId: string; snapshotId?: string | null; ruleIds?: string[] }): Promise<string> {
  const { id } = await prisma.cleanupRun.create({ data: { kind: input.kind, trigger: input.trigger, actorId: input.actorId === SYSTEM_ACTOR ? null : input.actorId,
    snapshotId: input.snapshotId ?? null, ruleIds: input.ruleIds ?? [] }, select: { id: true } })
  return id
}

/** Finishes a run row (TS 8.3 step 12) and writes `CLEANUP_RUN` (step 13, logged on failure). Rescues, deletions and failures count its outcomes. */
export async function finishRun(runId: string, input: FinishInput): Promise<RunCounts> {
  const outcomes = await prisma.cleanupOutcome.findMany({ where: { runId }, select: { kind: true, ruleIds: true, freedBytes: true } })
  const byRule = new Map<string, typeof ZERO>()
  const total = { ...ZERO }
  let freed = 0n
  for (const { kind, ruleIds, freedBytes } of outcomes) {
    const key = kind === "rescued" ? "rescued" : kind === "deleted" ? "deleted" : kind === "failed" ? "failed" : null
    freed += freedBytes
    if (!key) continue
    total[key] += 1
    for (const id of ruleIds) byRule.set(id, { ...ZERO, ...byRule.get(id), [key]: (byRule.get(id)?.[key] ?? 0) + 1 })
  }
  const { checked, matched, joined, held, deferred, outcome, blocks, kind, trigger } = input
  const counts = { checked, matched, joined, held, deferred, ...total }
  const entries = input.entries.map((entry) => ({ ...entry, ...(byRule.get(entry.ruleId) ?? ZERO) }))
  await prisma.cleanupRun.update({ where: { id: runId }, data: { ...counts, freedBytes: freed, outcome, blocks, entries, finishedAt: new Date() } })
  const details = { runId, kind, trigger, outcome, ...counts, freedBytes: freed.toString(), blocks: blocks.map((block) => block.code) }
  await recordAuditEvent(AuditEventType.CLEANUP_RUN, input.actorId, details).catch((error: unknown) => logger.error("cleanup.run_audit_failed", error, { runId }))
  return { ...counts, freedBytes: freed.toString() }
}

/** A run row with outcome `busy`: the last busy retry of the night, or of an act job. */
export async function busyRunRow(kind: RunKind, trigger: string, actorId: string): Promise<void> {
  const runId = await createRunRow({ kind, trigger, actorId })
  await finishRun(runId, { kind, trigger, actorId, outcome: "busy", blocks: [{ code: "busy" }], entries: [], ...NONE })
}

/** The audit row of an admin run that found the claim busy: `CLEANUP_RUN` with `runId: null` (TS 8.3 step 3). Logged on failure. */
export async function auditBusyRun(trigger: string, actorId: string): Promise<void> {
  await recordAuditEvent(AuditEventType.CLEANUP_RUN, actorId, { runId: null, kind: "run", trigger, outcome: "busy", blocks: ["busy"] })
    .catch((error: unknown) => logger.error("cleanup.run_audit_failed", error, { runId: null }))
}
