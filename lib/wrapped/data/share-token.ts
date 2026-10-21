/**
 * The rule that decides whether a share token opens anything (design 6.2,
 * 6.6, SEC-16), in the two forms its callers need: `getShareSafeRewind`
 * reads the whole row and projects it, and proxy.ts reads only enough to send
 * the 404 status (`shareTokenKind`). Both follow the same order:
 *
 * 1. While `Config.rewindPublicLinks` is off, no token opens anything (no
 *    rows are deleted, so turning it back on restores every live link).
 * 2. A v3 link is found by `sha256(token)` on `RewindShare.tokenHash`, and is
 *    refused when revoked (rotation revokes the old row), expired, or not on
 *    a completed Rewind.
 * 3. Otherwise a v2 `PlexWrapped.shareToken` that survived Phase 0 opens its
 *    completed row, but only until the Rewind 2026 season closes
 *    (`v2LinksOpen`); P11.18 removes this branch.
 *
 * @module lib/wrapped/data/share-token
 */

import "server-only"

import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"
import { shareTokenSchema } from "@/lib/validations/params"
import { readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { getSeasonState } from "@/lib/wrapped/season"

/** The last season whose links may still be v2 tokens. */
const LAST_V2_SEASON = 2026

/** The SHA-256 hex of a share token, the only form of it the database holds. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Whether `Config.rewindPublicLinks` allows any public link; on when no config row exists yet. */
export async function publicLinksOn(): Promise<boolean> {
  const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindPublicLinks: true } })
  return config?.rewindPublicLinks ?? true
}

/**
 * Whether surviving v2 tokens still open: until the close of the 2026 season
 * (`Config.rewindSeasonCloses` in the server zone, 31 January 2027 by
 * default). After it the season year moves on, and they stop.
 */
export async function v2LinksOpen(now: Date = new Date()): Promise<boolean> {
  const season = await getSeasonState(now)
  return season.seasonYear <= LAST_V2_SEASON && now.getTime() < season.closesAt.getTime()
}

/**
 * Which kind of link `token` opens, from the cheapest reads that answer it,
 * or null when it opens nothing. A token that is not 43 base64url characters
 * costs no read.
 *
 * @throws When a database read fails
 */
export async function shareTokenKind(token: string, now: Date = new Date()): Promise<"v3" | "v2" | null> {
  if (!shareTokenSchema.safeParse(token).success) return null
  const [on, share] = await Promise.all([
    publicLinksOn(),
    prisma.rewindShare.findUnique({
      where: { tokenHash: hashShareToken(token) },
      select: { revokedAt: true, expiresAt: true, wrapped: { select: { id: true, status: true } } },
    }),
  ])
  if (!on) return null
  if (share) {
    const live = !share.revokedAt && !(share.expiresAt && share.expiresAt <= now)
    return live && readWrappedStatus(share.wrapped.status, share.wrapped.id) === "completed" ? "v3" : null
  }
  const wrapped = await prisma.plexWrapped.findUnique({ where: { shareToken: token }, select: { id: true, status: true } })
  if (!wrapped || readWrappedStatus(wrapped.status, wrapped.id) !== "completed") return null
  return (await v2LinksOpen(now)) ? "v2" : null
}
