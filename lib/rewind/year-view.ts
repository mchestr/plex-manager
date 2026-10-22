/**
 * What `/rewind/<year>` shows for the signed-in member (P5.1, design FR-1):
 * their v3 issue, their stored v1 or v2 Rewind as an archive article (P7.13), or a
 * status panel for every other state.
 *
 * ## Branches
 *
 * 1. A completed row is read through `parseStoredRewind()`:
 *    - v3 opens the issue. `rewindEnabled` and `rewindAudience` gate it for
 *      members until the season's launch; admins pass both flags;
 *    - v1 and v2 always open for their owner, as an archive article;
 *    - a row that does not parse shows `parse-error`.
 * 2. Otherwise the status rule of `deriveRewindStatus()` decides: a queued
 *    or running run shows `generating`, Redis missing or down `unavailable`
 *    (FR-50), and the latest failure `failed`, with its code.
 * 3. With nothing at all, the season year asks whether the member can have a
 *    Rewind (FR-48: `not-eligible`, or `unavailable` when the server lacks
 *    Plex or Tautulli) and else says it is not made yet; any other year is
 *    `not-found`. Redis is checked only for the season year, the one year a
 *    member can generate.
 *
 * @module
 */

import "server-only"

import { getUserPlexWrapped } from "@/actions/user-queries"
import { prisma } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { generationBlocker } from "@/lib/rewind/generation-guards"
import { deriveRewindStatus, failureCode, infraCode } from "@/lib/rewind/rewind-status"
import type { RewindPanelCode } from "@/lib/ui/error-copy"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import type { StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { RewindErrorCode } from "@/lib/wrapped/generation-errors"
import { getSeasonYear } from "@/lib/wrapped/season"

/** Every state `/rewind/<year>` shows on a status panel instead of an issue (ui-design-system 5.5). */
export type RewindStatusKind = "generating" | "failed" | "parse-error" | "not-found" | "unavailable" | "not-eligible"

export type RewindYearView =
  | { kind: "issue"; id: string; data: RewindDataV3 }
  | { kind: "legacy"; data: StoredWrappedData }
  | { kind: "panel"; panel: RewindStatusKind; code: RewindPanelCode | RewindErrorCode }

interface Viewer {
  userId: string
  isAdmin: boolean
}

const panel = (kind: RewindStatusKind, code: RewindPanelCode | RewindErrorCode): RewindYearView => ({
  kind: "panel",
  panel: kind,
  code,
})

/** Whether a member may open a v3 issue now: the feature is on and open to everyone. Admins always may. */
async function issueOpenTo({ isAdmin }: Viewer): Promise<boolean> {
  if (isAdmin) return true
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { rewindEnabled: true, rewindAudience: true },
  })
  return config?.rewindEnabled === true && config.rewindAudience === "all"
}

/** The member with nothing for the season year: can they have one at all (FR-48)? */
async function nothingYet(userId: string): Promise<RewindYearView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, plexUserId: true } })
  const blocker = user ? await generationBlocker(user) : "REWIND_NOT_ELIGIBLE"
  if (blocker === "REWIND_NOT_ELIGIBLE") return panel("not-eligible", "REWIND_NOT_ELIGIBLE")
  if (blocker) return panel("unavailable", "NOT_CONFIGURED")
  return panel("not-found", "REWIND_NOT_MADE")
}

/**
 * Resolves the view for the viewer's own Rewind of `year`. Only the viewer's
 * row is read: `getUserPlexWrapped` is asked for `viewer.userId` alone.
 */
export async function loadRewindYearView(viewer: Viewer, year: number): Promise<RewindYearView> {
  const { userId } = viewer
  const [result, seasonYear] = await Promise.all([getUserPlexWrapped({ userId, year }), getSeasonYear()])
  const row = result.success ? result.data : null

  if (row?.status === "completed") {
    const stored = parseStoredRewind(row.data)
    if (stored.version === 3) {
      return (await issueOpenTo(viewer)) ? { kind: "issue", id: row.id, data: stored.data } : panel("unavailable", "REWIND_NOT_OPEN")
    }
    if (stored.version === "invalid") return panel("parse-error", "REWIND_UNREADABLE")
    return { kind: "legacy", data: stored.legacy }
  }

  const latest = await prisma.rewindGeneration.findFirst({
    where: { userId, year, status: { not: "skipped" } },
    orderBy: { createdAt: "desc" },
    select: { status: true, error: true, startedAt: true },
  })
  const status = await deriveRewindStatus({
    wrapped: row && { status: row.status, error: row.error },
    latest,
    infra: year === seasonYear ? checkRewindInfra : async () => ({ ok: true }),
  })

  switch (status.state) {
    case "queued":
    case "running":
      return panel("generating", "REWIND_GENERATING")
    case "unavailable":
      return panel("unavailable", infraCode(status.errorCode) ?? "REDIS_UNAVAILABLE")
    case "failed":
      return panel("failed", failureCode(status.errorCode))
    case "completed":
    case "none":
      return year === seasonYear ? nothingYet(userId) : panel("not-found", "REWIND_NOT_FOUND")
  }
}
