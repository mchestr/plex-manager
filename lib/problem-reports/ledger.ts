/**
 * The fix ledger (`ProblemFixLedger`): one row per run that did something,
 * which the limits read and nothing else writes. A run's row has the id
 * `<reportId>:<runToken>`, so a step that runs again after a crash finds its
 * own row and doesn't act twice.
 *
 * {@link gateAndRecord} reads the last day of the ledger, gates the run
 * (`gateFix`) and adds its row in one serializable transaction, with the
 * `PROBLEM_FIX_RUN` audit row, before the run touches Radarr, Sonarr or
 * Plex. A swap searches first and replaces the file only once it has a
 * release: {@link gateReplace} gates that second step in its own
 * serializable transaction and marks the row `replacedAt`, which is what the
 * breaker counts. A removal deletes at once, so its row is created replacing.
 * A row counts whatever follows: a grab Radarr or Sonarr refuses, or a
 * removal that stops before deleting, still uses a replacement. A gate that
 * trips the breaker queues the admins' alert.
 *
 * @module lib/problem-reports/ledger
 */

import "server-only"

import { inSerializable } from "@/lib/db/serializable"
import { prisma, type PrismaTransactionClient } from "@/lib/prisma"
import { queueBreakerAlert } from "@/lib/problem-reports/breaker-alert"
import { gateFix, type FixTraits, type FixTrigger, type GateRefusal } from "@/lib/problem-reports/fixes"
import { PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

/** What a run did, as the ledger records it: a scan of Plex is not a search. */
type LedgerAction = "LOOK_FOR_MISSING" | "BETTER_COPY" | "SWAP" | "REMOVE_AND_SEARCH" | "SCAN" | "REFRESH"

/** Ledger actions that send an indexer search: a swap's interactive search, and a removal's search, included. */
const SEARCHES: LedgerAction[] = ["LOOK_FOR_MISSING", "BETTER_COPY", "SWAP", "REMOVE_AND_SEARCH"]

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** A run's row id. @internal */
export const ledgerId = (reportId: string, runToken: number) => `${reportId}:${runToken}`

export interface RunRecord {
  reportId: string
  runToken: number
  reporterId: string
  actorUserId: string | null
  trigger: FixTrigger
  /** What it acts on: `sonarr:series:<id>`, `radarr:movie:<id>`, `sonarr:episode:<ids>`, `plex:<rating key>`. */
  target: string
  action: LedgerAction
  traits: FixTraits
  /** The run replaces the file as soon as it is recorded: a removal. */
  replaces?: boolean
  /** The file it acts on and the release it replaces, for the audit row. */
  file?: { id: number; release: string | null }
}

type Tx = PrismaTransactionClient

const since = (now: Date, ms: number) => new Date(now.getTime() - ms)

/** The day's searches and the hour's and day's replacements, as `gateFix` reads them; replacements only when they matter. */
async function counts(tx: Tx, traits: FixTraits, now: Date) {
  const searchesToday = traits.searches ? await tx.problemFixLedger.count({ where: { action: { in: SEARCHES }, startedAt: { gte: since(now, DAY_MS) } } }) : 0
  const replaced = (ms: number) => (traits.replacesFile ? tx.problemFixLedger.count({ where: { replacedAt: { gte: since(now, ms) } } }) : 0)
  return { searchesToday, replacementsLastHour: await replaced(HOUR_MS), replacementsToday: await replaced(DAY_MS) }
}

/** Gates in the transaction, latching the breaker when this refusal trips it. */
async function gate(tx: Tx, traits: FixTraits, now: Date): Promise<{ refusal: GateRefusal | null; tripped: boolean }> {
  const settings = await tx.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { breakerTrippedAt: true } })
  const decided = gateFix(traits, await counts(tx, traits, now), Boolean(settings?.breakerTrippedAt))
  if (decided.ok) return { refusal: null, tripped: false }
  if (decided.trips) {
    await tx.problemReportSettings.upsert({
      where: { id: PROBLEM_REPORT_SETTINGS_ID },
      create: { id: PROBLEM_REPORT_SETTINGS_ID, breakerTrippedAt: now },
      update: { breakerTrippedAt: now },
    })
  }
  return { refusal: decided.reason, tripped: decided.trips }
}

/** Tells the admins once a gate tripped the breaker, after its transaction committed. */
async function afterGate<T>(result: { value: T; tripped: boolean }, now: Date): Promise<T> {
  if (result.tripped) await queueBreakerAlert(now)
  return result.value
}

/**
 * Gates the run and records it. `null` when it may act now, the refusal when
 * it may not, or `ALREADY_RAN` when this run's row is there already.
 */
export async function gateAndRecord(run: RunRecord, now: Date): Promise<GateRefusal | "ALREADY_RAN" | null> {
  const id = ledgerId(run.reportId, run.runToken)
  const result = await inSerializable(async (tx): Promise<{ value: GateRefusal | "ALREADY_RAN" | null; tripped: boolean }> => {
    if (await tx.problemFixLedger.findUnique({ where: { id }, select: { id: true } })) return { value: "ALREADY_RAN", tripped: false }
    const { refusal, tripped } = await gate(tx, run.traits, now)
    if (refusal) return { value: refusal, tripped }

    await tx.problemFixLedger.create({
      data: {
        id,
        target: run.target,
        action: run.action,
        trigger: run.trigger,
        reporterId: run.reporterId,
        actorUserId: run.actorUserId,
        reportId: run.reportId,
        startedAt: now,
        ...(run.replaces ? { replacedAt: now } : {}),
      },
    })
    await recordAuditEvent(
      AuditEventType.PROBLEM_FIX_RUN,
      run.actorUserId ?? run.reporterId,
      {
        targetUserId: run.reporterId,
        reportId: run.reportId,
        action: run.action,
        trigger: run.trigger,
        askedBy: run.actorUserId ?? run.reporterId,
        approvedBy: run.trigger === "automatic" ? null : run.actorUserId,
        dryRun: false,
        ...(run.file ? { fileId: run.file.id, replacedRelease: run.file.release } : {}),
      },
      tx
    )
    return { value: null, tripped: false }
  })
  return afterGate(result, now)
}

/**
 * Gates a swap's replacement of the file once it has a release, and marks
 * its row. `ALREADY_REPLACED` when the row is marked already, so a step
 * delivered again grabs once; `NO_RUN` without the run's row.
 */
export async function gateReplace(run: { reportId: string; runToken: number }, now: Date): Promise<"BREAKER" | "ALREADY_REPLACED" | "NO_RUN" | null> {
  const id = ledgerId(run.reportId, run.runToken)
  const result = await inSerializable(async (tx): Promise<{ value: "BREAKER" | "ALREADY_REPLACED" | "NO_RUN" | null; tripped: boolean }> => {
    const row = await tx.problemFixLedger.findUnique({ where: { id }, select: { replacedAt: true } })
    if (!row) return { value: "NO_RUN", tripped: false }
    if (row.replacedAt) return { value: "ALREADY_REPLACED", tripped: false }
    const { refusal, tripped } = await gate(tx, { searches: false, replacesFile: true }, now)
    if (refusal) return { value: "BREAKER", tripped }
    await tx.problemFixLedger.update({ where: { id }, data: { replacedAt: now } })
    return { value: null, tripped: false }
  })
  return afterGate(result, now)
}

/** Ends a run's row with its outcome; a run that never reached the gate has no row. */
export async function endLedgerRow(reportId: string, runToken: number, outcome: string, now: Date): Promise<void> {
  await prisma.problemFixLedger.updateMany({ where: { id: ledgerId(reportId, runToken), endedAt: null }, data: { outcome, endedAt: now } })
}
