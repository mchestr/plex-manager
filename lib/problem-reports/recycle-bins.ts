/**
 * Members' swaps turn On only while each of Radarr and Sonarr that is set up
 * keeps a recycle bin (`GET /api/v3/config/mediamanagement`), so the copy a
 * bad swap replaced can be put back (docs/problem-reports.md, "Members'
 * swaps"). A service that can't be read counts as having none.
 *
 * @module lib/problem-reports/recycle-bins
 */

import "server-only"

import { getArrMediaManagement } from "@/lib/connections/arr-swap"
import { getActiveService } from "@/lib/data/active-service"

const SERVICES = [
  { kind: "radarr", name: "Radarr" },
  { kind: "sonarr", name: "Sonarr" },
] as const

/** The services set up without a recycle bin, or that couldn't be read; empty when members' swaps may turn On. */
export async function servicesWithoutRecycleBin(): Promise<("Radarr" | "Sonarr")[]> {
  const checked = await Promise.all(
    SERVICES.map(async ({ kind, name }) => {
      const row = await getActiveService(kind)
      if (!row) return null
      const management = await getArrMediaManagement(name, { url: row.url, apiKey: row.apiKey })
      return management.success && management.data.recycleBin ? null : name
    })
  )
  return checked.filter((name) => name !== null)
}
