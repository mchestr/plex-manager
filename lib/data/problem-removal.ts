/**
 * What Remove the file and search will do to a report's title, for its
 * confirm (docs/problem-reports.md, "Remove the file and search"): the
 * release Radarr or Sonarr will blocklist, whether their recycle bin keeps
 * the file, and whether Plex empties its trash after a scan, which can bring
 * the title back as a new item. Read fresh, as the fix reads it when it runs.
 *
 * @module lib/data/problem-removal
 */

import "server-only"

import { getArrMediaManagement } from "@/lib/connections/arr-swap"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { plexEmptiesTrash } from "@/lib/connections/plex-file-state"
import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { findBadCopy } from "@/lib/problem-reports/bad-copy"
import { resolveFile } from "@/lib/problem-reports/resolve"

export interface RemovalFacts {
  service: "Radarr" | "Sonarr"
  /** The release marked failed, so it is blocklisted; null when the file has no grab in the history. */
  blocklists: string | null
  /** Whether a recycle bin keeps the deleted file; null when it couldn't be read. */
  recycleBin: boolean | null
  /** Whether Plex empties its trash after every scan; null when it couldn't be read. */
  emptiesTrash: boolean | null
}

/** The removal's facts for an open report, or null when its file or its history can't be read right now. */
export async function getRemovalFacts(reportId: string): Promise<RemovalFacts | null> {
  await assertAdmin()
  const [report, server] = await Promise.all([prisma.problemReport.findUnique({ where: { id: reportId }, select: { plexRatingKey: true } }), getActivePlexServerConfig()])
  if (!report || !server) return null
  const resolution = await resolveFile(server, report.plexRatingKey)
  if (!resolution.ok) return null

  const { resolved } = resolution
  const service = resolved.service === "radarr" ? "Radarr" : "Sonarr"
  const [bad, management, emptiesTrash] = await Promise.all([findBadCopy(resolved), getArrMediaManagement(service, resolved.config), plexEmptiesTrash(server)])
  if (!bad) return null
  return {
    service,
    blocklists: bad.grab?.title ?? null,
    recycleBin: management.success ? management.data.recycleBin : null,
    emptiesTrash,
  }
}
