/**
 * The fix ledger (`ProblemFixLedger`): one row per run that did something,
 * which the limits read and nothing else writes. A run's row has the id
 * `<reportId>:<runToken>`, so a step that runs again after a crash finds its
 * own row and doesn't act twice.
 *
 * {@link gateAndRecord} reads the last day of the ledger, gates the run
 * (`gateFix`) and adds its row in one serializable transaction, with the
 * `PROBLEM_FIX_RUN` audit row, before the run touches Sonarr or Plex.
 *
 * @module lib/problem-reports/ledger
 */

import "server-only"

import { inSerializable } from "@/lib/db/serializable"
import { prisma } from "@/lib/prisma"
import { gateFix, type FixTraits, type FixTrigger, type GateRefusal } from "@/lib/problem-reports/fixes"
import { PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

/** What a run did, as the ledger records it: a scan of Plex is not a search. */
type LedgerAction = "LOOK_FOR_MISSING" | "BETTER_COPY" | "SCAN" | "REFRESH"

/** Ledger actions that send an indexer search, and ones that replace a file (none yet). */
const SEARCHES: LedgerAction[] = ["LOOK_FOR_MISSING", "BETTER_COPY"]
const REPLACES_FILE: LedgerAction[] = []

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
}

/**
 * Gates the run and records it. `null` when it may act now, the refusal when
 * it may not, or `ALREADY_RAN` when this run's row is there already.
 */
export async function gateAndRecord(run: RunRecord, now: Date): Promise<GateRefusal | "ALREADY_RAN" | null> {
  const id = ledgerId(run.reportId, run.runToken)
  return inSerializable(async (tx) => {
    if (await tx.problemFixLedger.findUnique({ where: { id }, select: { id: true } })) return "ALREADY_RAN"
    const since = (ms: number) => new Date(now.getTime() - ms)
    const settings = await tx.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { breakerTrippedAt: true } })
    const searchesToday = await tx.problemFixLedger.count({ where: { action: { in: SEARCHES }, startedAt: { gte: since(DAY_MS) } } })
    const replaced = (ms: number) =>
      REPLACES_FILE.length === 0 ? 0 : tx.problemFixLedger.count({ where: { action: { in: REPLACES_FILE }, startedAt: { gte: since(ms) } } })
    const counts = { searchesToday, replacementsLastHour: await replaced(HOUR_MS), replacementsToday: await replaced(DAY_MS) }

    const gate = gateFix(run.traits, counts, Boolean(settings?.breakerTrippedAt))
    if (!gate.ok) {
      if (gate.trips) {
        await tx.problemReportSettings.upsert({
          where: { id: PROBLEM_REPORT_SETTINGS_ID },
          create: { id: PROBLEM_REPORT_SETTINGS_ID, breakerTrippedAt: now },
          update: { breakerTrippedAt: now },
        })
      }
      return gate.reason
    }

    await tx.problemFixLedger.create({
      data: { id, target: run.target, action: run.action, trigger: run.trigger, reporterId: run.reporterId, actorUserId: run.actorUserId, reportId: run.reportId, startedAt: now },
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
      },
      tx
    )
    return null
  })
}

/** Ends a run's row with its outcome; a run that never reached the gate has no row. */
export async function endLedgerRow(reportId: string, runToken: number, outcome: string, now: Date): Promise<void> {
  await prisma.problemFixLedger.updateMany({ where: { id: ledgerId(reportId, runToken), endedAt: null }, data: { outcome, endedAt: now } })
}
