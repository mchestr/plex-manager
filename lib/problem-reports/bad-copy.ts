/**
 * The release behind the file a swap or a removal replaces, from the title's
 * history in Radarr or Sonarr (docs/problem-reports.md, "Swap the copy").
 *
 * The import whose `data.fileId` is the file's id names the download, and the
 * grab with that download id names the release, its info hash for a torrent,
 * and the history record to mark failed, which blocklists the release. A file
 * added by hand has no grab: a swap still passes over its scene name, and
 * nothing is marked failed. With no scene name either, nothing tells the
 * release apart from the search's, so a swap may take the same one again.
 *
 * @module lib/problem-reports/bad-copy
 */

import "server-only"

import { listTitleHistory, type ArrHistoryRecord } from "@/lib/connections/arr-upgrade"
import type { BadRelease } from "@/lib/problem-reports/candidates"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"

/** The bad copy: the releases a swap passes over, and its grab when the history has one. */
export interface BadCopy extends BadRelease {
  grab: { id: number; downloadId: string; title: string | null } | null
}

const newest = (records: ArrHistoryRecord[]) => [...records].sort((a, b) => b.at - a.at)[0]

/** The bad copy of a resolved file; null when the history can't be read. */
export async function findBadCopy(resolved: ResolvedFile): Promise<BadCopy | null> {
  const history = await listTitleHistory(resolved.config, { service: resolved.service, id: resolved.titleId })
  if (!history.success) return null
  // "downloadFolderImported", or the movie's or series' folder imported by hand
  const imported = newest(history.data.filter((record) => record.fileId === resolved.file.id && record.eventType.endsWith("Imported")))
  const downloadId = imported?.downloadId ?? null
  const grab = downloadId ? newest(history.data.filter((record) => record.eventType === "grabbed" && record.downloadId === downloadId)) : undefined
  const titles = [grab?.sourceTitle, imported?.sourceTitle, resolved.file.sceneName].filter((title): title is string => Boolean(title))
  return {
    titles: [...new Set(titles)],
    infoHash: grab?.infoHash ?? null,
    grab: grab && downloadId ? { id: grab.id, downloadId, title: grab.sourceTitle } : null,
  }
}
