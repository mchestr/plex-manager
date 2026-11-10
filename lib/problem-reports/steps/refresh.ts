/**
 * Refresh the details: Plex reads the item's details from its agent again.
 * Only an admin starts it, and the report then goes back to them to check
 * the details and mark it fixed, since nothing here can tell whether they
 * are right now.
 *
 * @module lib/problem-reports/steps/refresh
 */

import "server-only"

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { refreshPlexItem } from "@/lib/connections/plex-library-actions"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { fixTraits } from "@/lib/problem-reports/fixes"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

export async function runRefresh(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  const gate = await gateAndRecord(
    { reportId: report.id, runToken: report.runToken, reporterId: report.reporterId, actorUserId: data.actorUserId, trigger: data.trigger, target: `plex:${report.plexRatingKey}`, action: "REFRESH", traits: fixTraits("REFRESH") },
    now
  )
  if (gate === "ALREADY_RAN") return { toAdmin: "REFRESHED" }
  if (gate) return { toAdmin: gate }
  return (await refreshPlexItem(server, report.plexRatingKey)) ? { toAdmin: "REFRESHED" } : { toAdmin: "REFRESH_FAILED" }
}
