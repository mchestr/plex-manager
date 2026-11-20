/**
 * "The title, poster or description is wrong", as a member sends it
 * (docs/problem-reports.md, "Fixes"): Refresh the details starts when
 * Radarr (for a movie) or Sonarr (for a show or episode) is set up, so the
 * run can check Plex's match against it first; otherwise the report goes to
 * the server admin. The check itself runs in the fix, where waiting on
 * Radarr or Sonarr doesn't keep the member waiting.
 *
 * @module lib/problem-reports/report-details
 */

import "server-only"

import { getActiveService } from "@/lib/data/active-service"

export type MemberDetailsDecision = { startsFix: true } | { startsFix: false; reason: "NO_RADARR" | "NO_SONARR" }

export async function decideDetailsForMember(type: string): Promise<MemberDetailsDecision> {
  const service = type === "movie" ? "radarr" : "sonarr"
  if (await getActiveService(service)) return { startsFix: true }
  return { startsFix: false, reason: service === "radarr" ? "NO_RADARR" : "NO_SONARR" }
}
