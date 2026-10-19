/**
 * One Overseerr request as the Rewind stats read it (design 7.2, RWP-06).
 *
 * Statuses use Overseerr's enums. Approved is APPROVED or COMPLETED;
 * available is an approved request whose media (`status4k` for a 4K request)
 * is AVAILABLE, or PARTIALLY_AVAILABLE for TV. Seerr's 6 and 7 (blocklisted,
 * deleted) are never available.
 *
 * @module lib/wrapped/sources/request-event
 */

import { MediaRequestStatus, MediaStatus, type OverseerrRequestRow } from "./schemas"

/** One request, as the Rewind stats read it. `createdAt` is epoch ms. */
export interface RequestEvent {
  id: number
  mediaType: "movie" | "tv"
  tmdbId: number | null
  createdAt: number
  requestedById: number | null
  is4k: boolean
  status: "pending" | "approved" | "declined" | "failed" | "completed" | "unknown"
  approved: boolean
  available: boolean
  /** Filled for a member's requests; empty in the server-wide pass. */
  genres: string[]
}

const STATUS_NAMES: Record<number, RequestEvent["status"]> = {
  [MediaRequestStatus.PENDING]: "pending",
  [MediaRequestStatus.APPROVED]: "approved",
  [MediaRequestStatus.DECLINED]: "declined",
  [MediaRequestStatus.FAILED]: "failed",
  [MediaRequestStatus.COMPLETED]: "completed",
}

/** Map a validated request row to a {@link RequestEvent} (genres empty). */
export function toRequestEvent(row: OverseerrRequestRow): RequestEvent {
  const approved = row.status === MediaRequestStatus.APPROVED || row.status === MediaRequestStatus.COMPLETED
  const mediaStatus = row.is4k ? row.media.status4k : row.media.status
  const onServer =
    mediaStatus === MediaStatus.AVAILABLE || (row.type === "tv" && mediaStatus === MediaStatus.PARTIALLY_AVAILABLE)
  return {
    id: row.id,
    mediaType: row.type,
    tmdbId: row.media.tmdbId ?? null,
    createdAt: Date.parse(row.createdAt),
    requestedById: row.requestedBy?.id ?? null,
    is4k: row.is4k ?? false,
    status: STATUS_NAMES[row.status] ?? "unknown",
    approved,
    available: approved && onServer,
    genres: [],
  }
}
