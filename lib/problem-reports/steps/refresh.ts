/**
 * Refresh the details: Plex reads the item's details from its agent again
 * (docs/problem-reports.md, "Fixes").
 *
 * - A member's run, for "The title, poster or description is wrong", checks
 *   Plex's match first (`checkMatch`): a refresh can't fix a match to the
 *   wrong title, so a match that differs from Radarr's or Sonarr's, the
 *   episode order, or a match that can't be told goes to the server admin.
 *   Once Plex has the request, the report is fixed.
 * - An admin's run refreshes at once, and the report goes back to them to
 *   check the details and mark it fixed, since nothing here can tell whether
 *   they are right now.
 *
 * @module lib/problem-reports/steps/refresh
 */

import "server-only"

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { refreshPlexItem } from "@/lib/connections/plex-library-actions"
import { fixTraits } from "@/lib/problem-reports/fixes"
import { gateAndRecord } from "@/lib/problem-reports/ledger"
import { checkMatch } from "@/lib/problem-reports/match"
import { runOf } from "@/lib/problem-reports/steps/run-record"
import type { StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import type { ProblemReportFixPayload } from "@/lib/queue/types"

export async function runRefresh(report: StepReport, data: ProblemReportFixPayload, now: Date): Promise<StepOutcome> {
  const server = await getActivePlexServerConfig()
  if (!server) return { toAdmin: "UNAVAILABLE" }
  const member = data.trigger === "automatic"
  if (member) {
    const check = await checkMatch(server, report.plexRatingKey)
    if (check.verdict === "DIFFERS") return { toAdmin: "MISMATCH" }
    if (check.verdict === "UNKNOWN") return { toAdmin: check.reason }
  }

  const done: StepOutcome = member ? { fixed: true } : { toAdmin: "REFRESHED" }
  const gate = await gateAndRecord(
    {
      ...runOf(report, data),
      target: `plex:${report.titleKey}`,
      action: "REFRESH",
      traits: fixTraits("REFRESH"),
    },
    now
  )
  if (gate === "ALREADY_RAN") return done
  if (gate) return { toAdmin: gate }
  return (await refreshPlexItem(server, report.plexRatingKey)) ? done : { toAdmin: "REFRESH_FAILED" }
}
