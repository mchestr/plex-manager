/**
 * Preview rows (TS 10.5, 10.6 step 8, X8): an `ItemRef` of a snapshot item,
 * and the Results columns with the requester names. A row never holds a
 * plex.tv id: each requester is a name, a status and a date. A requester
 * with no app account reads "Unknown member". Pure and client-safe; the
 * names are admin data, so only admin surfaces build rows.
 *
 * @module lib/cleanup/preview/rows
 */

import { requesterKind } from "@/lib/cleanup/engine/why"
import { applicableRequests, requesterName } from "@/lib/cleanup/engine/fields/request-set"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { ItemRef, RequestedBy, RequesterCell } from "@/lib/cleanup/types/preview"

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

/** The title of a snapshot item as screens show it. Bytes are a decimal string. */
export function itemRef(item: SnapshotItem): ItemRef {
  return {
    itemKey: item.key,
    level: item.level,
    title: item.title,
    year: item.year,
    seasonNumber: item.seasonNumber,
    episodeCount: item.episodeCount,
    seasonCount: item.level === "show" ? (item.show?.seasonsOnDisk ?? null) : null,
    posterKey: item.ratingKey,
    sectionId: item.sectionId,
    sizeBytes: item.sizeBytes === null ? null : String(item.sizeBytes),
  }
}

/** "never" with no counted play, null while Tautulli failed, else the ISO instant of the newest counted play. */
export function lastPlayedAt(item: SnapshotItem): string | "never" | null {
  if (!item.plays) return null
  return item.plays.lastCountedAt === null ? "never" : iso(item.plays.lastCountedAt)
}

/** The newer of the Plex and arr added dates (TS 4.2 Added), as an ISO instant. */
export function addedAt(item: SnapshotItem): string | null {
  const dates = [item.added.plex, item.added.arr].filter((t): t is number => t !== null)
  return dates.length === 0 ? null : iso(Math.max(...dates))
}

const STATUS = { member: "member", owner: "member", former: "former", unknown: "unknown" } as const

/**
 * The "Requested by" cell (UX 4.3.7, X8): one entry per requester, newest
 * request first, with the app name. "none" or "importList" with no request,
 * null while Overseerr failed.
 */
export function requestedBy(item: SnapshotItem, ctx: Pick<EvalContext, "users" | "live">): RequestedBy {
  const requests = applicableRequests(item)
  if (requests === null) return null
  if (requests.length === 0) return item.arr?.importList ? "importList" : "none"
  const cells: RequesterCell[] = []
  const seen = new Set<string | null>()
  for (const request of [...requests].sort((a, b) => b.at - a.at)) {
    if (seen.has(request.by)) continue
    seen.add(request.by)
    cells.push({ name: requesterName(request.by, ctx), status: STATUS[requesterKind(request.by, ctx)], at: iso(request.at) })
  }
  return cells
}

/** True when a cell names at least one requester: the rows list member names (`auditMemberListed`). */
export const namesRequesters = (cell: RequestedBy): boolean => Array.isArray(cell) && cell.length > 0
