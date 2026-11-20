/**
 * Exits from Leaving soon (TS 8.4 step 3 and 5, TS 8.6, E5): the verdict of
 * one holding rule for one item, the kind of an exit, and `exitItem()`, the
 * one write that takes a row out. The run, the act step and the actions
 * share them. Server-only.
 *
 * An exit runs in one transaction: it deletes the row by `id` and
 * `updatedAt` (optimistic), creates the `CleanupOutcome` from the row and
 * its why, and writes the audit row with the same `tx`. A delete that
 * matches zero rows writes nothing and reports a skip: an action changed the
 * row, and the next run checks it again. The act step's exits after an arr
 * call match `{ id, state: "deleting" }` instead (safety-r4-3, r5-4). A Keep
 * or an exclusion runs the exit in its own transaction with `rollback`, so a
 * zero-row exit rolls the whole action back (E33).
 *
 * @module lib/cleanup/run/exit
 */

import "server-only"

import { causeCode } from "@/lib/cleanup/engine/why"
import type { CompiledRule, ItemResult } from "@/lib/cleanup/engine/types"
import type { OutcomeDetail, OutcomeKind, OutcomeReason } from "@/lib/cleanup/outcomes"
import { parseArrRef } from "@/lib/cleanup/schema/runtime"
import { type CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

/** The verdict of one holding rule (TS 8.4 step 3): keep it (maybe with a hold code), or drop it with a reason. */
export type RuleVerdict = { keep: true; holdCode?: string } | { keep: false; reason: OutcomeReason; detail?: OutcomeDetail }

const PROTECTION_REASONS: Partial<Record<string, OutcomeReason>> = { g1: "kept", g3: "excluded", g2: "markedKeepForever" }
const NEW_CONTENT_FIELDS = new Set(["show.lastEpisodeAdded", "library.added"])
const RELEASE_REASONS = new Set(["ruleOff", "libraryRemoved", "notInLibrary"])

function failedVerdict(compiled: CompiledRule, clauseId: string, result: ItemResult, sinceS: number): RuleVerdict {
  const clause = compiled.clauses.find((c) => c.id === clauseId)
  const fields = clause ? (clause.kind === "condition" ? [clause.condition.field] : clause.conditions.map((c) => c.field)) : []
  const lastPlay = result.item.plays?.lastCountedAt ?? null
  if (fields.some((field) => field.startsWith("watch.")) && lastPlay !== null && lastPlay > sinceS) return { keep: false, reason: "played" }
  if (fields.some((field) => NEW_CONTENT_FIELDS.has(field))) return { keep: false, reason: "newContent" }
  return { keep: false, reason: "conditionFailed", detail: { conditionId: clauseId } }
}

/**
 * Steps 3.2 to 3.6 of TS 8.4 for a rule without blocks, the first that
 * applies: a protection that protects, a failed clause (`played` for a
 * `watch.*` clause with a counted play after `sinceS`, the entry in epoch
 * seconds), an unknown (keep, with the first cause as `holdCode`), a match
 * state that cannot delete (`notManaged`), else a match.
 */
export function ruleVerdict(compiled: CompiledRule, result: ItemResult, sinceS: number): RuleVerdict {
  const protects = result.protections.find((p) => p.verdict === "protects")
  if (protects) {
    const reason = PROTECTION_REASONS[protects.id]
    return reason ? { keep: false, reason } : { keep: false, reason: "protected", detail: { protectionId: protects.id } }
  }
  const failed = result.clauses.find((c) => c.verdict === "fail")
  if (failed) return failedVerdict(compiled, failed.id, result, sinceS)
  const unknowns = [...result.clauses, ...result.protections].filter((c) => c.verdict === "unknown")
  if (unknowns.length > 0 || result.match.state === "unknown") {
    const cause = unknowns.find((c) => c.cause)?.cause
    return { keep: true, holdCode: cause ? causeCode(cause) : "matchUnknown" }
  }
  if (result.match.state !== "matched") return { keep: false, reason: "notManaged", detail: result.match.cause ? { code: result.match.cause } : {} }
  return { keep: true }
}

/** The kind of an exit (TS 8.4 step 5): a held item is `released`, and so is any item for `ruleOff`, `libraryRemoved` and `notInLibrary`. */
export function exitKind(state: string, reason: string): "rescued" | "released" {
  return state === "held" || RELEASE_REASONS.has(reason) ? "released" : "rescued"
}

/** A zero-row exit inside a caller's transaction that asked for `rollback` (E33). */
export class ExitSkippedError extends Error {
  constructor(readonly itemKey: string) {
    super("cleanup.exit_skipped")
    this.name = "ExitSkippedError"
  }
}

export interface ExitOptions {
  kind: OutcomeKind
  reason: OutcomeReason
  detail?: OutcomeDetail
  runId?: string | null
  actorId: string
  /** `updatedAt` (the default): the row as it was read. `deleting`: `{ id, state: "deleting" }`, the act step after an arr call. */
  match?: "updatedAt" | "deleting"
  /** The Why to store. Default: the row's. */
  why?: Prisma.InputJsonValue
  outcome?: { freedBytes?: bigint; alreadyGone?: boolean; approvedBy?: string | null }
  /** The per-item audit event. Default: `CLEANUP_ITEM_RESCUED` for a rescue, none for the other kinds. Null: none. */
  audit?: AuditEventType | null
  /** More audit details (the act step's deletion fields). */
  auditDetails?: Record<string, unknown>
  /** Run in the caller's transaction. With `rollback`, a zero-row exit throws {@link ExitSkippedError}. */
  tx?: PrismaTransactionClient
  rollback?: boolean
}

export type ExitResult = { exited: true; outcomeId: string; detail: OutcomeDetail } | { exited: false }

/** The detail of an exit: a rescue or a release of a record that a failed delete left unmonitored names its service (safety-r3-6). */
function exitDetail(row: CleanupItem, options: ExitOptions): OutcomeDetail {
  const arr = options.kind === "rescued" || options.kind === "released" ? parseArrRef(row.arr) : null
  return arr?.unmonitored ? { ...options.detail, stillUnmonitored: arr.service } : { ...options.detail }
}

function outcomeData(row: CleanupItem, options: ExitOptions, detail: OutcomeDetail): Prisma.CleanupOutcomeUncheckedCreateInput {
  const extra = options.outcome ?? {}
  const why = options.why ?? (row.why === null ? Prisma.JsonNull : (row.why as Prisma.InputJsonValue))
  return {
    itemKey: row.itemKey, level: row.level, titleKey: row.titleKey, sectionId: row.sectionId, ratingKey: row.ratingKey, title: row.title,
    year: row.year, seasonNumber: row.seasonNumber, kind: options.kind, reason: options.reason,
    detail: Object.keys(detail).length > 0 ? detail : Prisma.DbNull, ruleIds: row.ruleIds, action: row.action, sizeBytes: row.sizeBytes,
    freedBytes: extra.freedBytes ?? 0n, alreadyGone: extra.alreadyGone ?? false,
    approvedBy: extra.approvedBy === undefined ? row.approvedBy : extra.approvedBy,
    enteredAt: row.enteredAt, leaveOn: row.leaveOn, why, runId: options.runId ?? null,
  }
}

function auditOf(row: CleanupItem, options: ExitOptions, detail: OutcomeDetail): { type: AuditEventType; details: Record<string, unknown> } | null {
  const type = options.audit === undefined ? (options.kind === "rescued" ? AuditEventType.CLEANUP_ITEM_RESCUED : null) : options.audit
  if (type === null) return null
  const details: Record<string, unknown> = { ...(options.runId ? { runId: options.runId } : {}), itemKey: row.itemKey, level: row.level, ruleIds: row.ruleIds }
  if (type === AuditEventType.CLEANUP_ITEM_RESCUED) Object.assign(details, { reason: options.reason }, Object.keys(detail).length > 0 ? { detail } : {})
  return { type, details: { ...details, ...options.auditDetails } }
}

/**
 * Takes one row out of Leaving soon (TS 8.6 "exit"): deletes it, creates its
 * outcome and writes its audit row, in one transaction. A delete that matches
 * zero rows writes nothing and gives `{ exited: false }`.
 */
export async function exitItem(row: CleanupItem, options: ExitOptions): Promise<ExitResult> {
  const detail = exitDetail(row, options)
  const audit = auditOf(row, options, detail)
  const write = async (tx: PrismaTransactionClient): Promise<ExitResult> => {
    const where = options.match === "deleting" ? { id: row.id, state: "deleting" } : { id: row.id, updatedAt: row.updatedAt }
    const { count } = await tx.cleanupItem.deleteMany({ where })
    if (count === 0) {
      if (options.rollback) throw new ExitSkippedError(row.itemKey)
      return { exited: false }
    }
    const outcome = await tx.cleanupOutcome.create({ data: outcomeData(row, options, detail), select: { id: true } })
    if (audit) await recordAuditEvent(audit.type, options.actorId, audit.details, tx)
    return { exited: true, outcomeId: outcome.id, detail }
  }
  return options.tx ? write(options.tx) : prisma.$transaction((tx) => write(tx))
}
