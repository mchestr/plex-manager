/**
 * The four tiles of the Kept and excluded tab (UX 4.8, TS 10.5): member
 * Keeps with the members who keep, admin exclusions with an end date, Keep
 * forever marks, and the Keeps that end in the next 7 days. Server-only.
 *
 * A protection counts while it protects: active and not past its end
 * (`activeProtectionWhere`). Kept titles count once each, also when two
 * members keep one title. Keep forever marks count once per Plex item.
 *
 * @module lib/cleanup/screens/protections/tiles
 */

import "server-only"

import { activeProtectionWhere } from "@/lib/cleanup/protections"
import type { ProtectionTiles } from "@/lib/cleanup/types/list-parts"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

/** "Ending in 7 days" (UX 4.8). */
const ENDING_SOON_MS = 7 * 86_400_000

const activeOf = (now: Date, where: Prisma.CleanupProtectionWhereInput): Prisma.CleanupProtectionWhereInput => ({
  AND: [activeProtectionWhere(now), where],
})

/** The tiles at `now`. `keepDays` is how long a new Keep lasts (`options.members.keepDays`). */
export async function readProtectionTiles(now: Date, keepDays: number): Promise<ProtectionTiles> {
  const soon = new Date(now.getTime() + ENDING_SOON_MS)
  const [keeps, excludes, withEnd, marks, endingSoon] = await Promise.all([
    prisma.cleanupProtection.findMany({ where: activeOf(now, { kind: "memberKeep" }), select: { itemKey: true, memberId: true } }),
    prisma.cleanupProtection.count({ where: activeOf(now, { kind: "adminExclude" }) }),
    prisma.cleanupProtection.count({ where: activeOf(now, { kind: "adminExclude", expiresAt: { not: null } }) }),
    prisma.userMediaMark.findMany({ where: { markType: "KEEP_FOREVER" }, distinct: ["plexRatingKey"], select: { plexRatingKey: true } }),
    prisma.cleanupProtection.count({ where: activeOf(now, { kind: "memberKeep", expiresAt: { lte: soon } }) }),
  ])
  return {
    keeps: {
      count: new Set(keeps.map((keep) => keep.itemKey)).size,
      members: new Set(keeps.flatMap((keep) => (keep.memberId ? [keep.memberId] : []))).size,
      keepDays,
    },
    excludes: { count: excludes, withEnd },
    keepForever: { count: marks.length },
    endingSoon: { count: endingSoon },
  }
}
