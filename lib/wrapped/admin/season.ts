/**
 * The season console's queries (P7.8): the StatGrid counts, the member table
 * and the confirm dialogs' cost estimates. Every query reads status columns,
 * counts and sums, never `PlexWrapped.data` or LLM text (BP-22, BP-28).
 *
 * A member's season state:
 *
 * | State | When |
 * |---|---|
 * | `stuck` | a run has been `running` (or `queued`) for 15 minutes or more |
 * | `generating` | a run is `queued` or `running` |
 * | `ready` | the Rewind is `completed` |
 * | `failed` | the Rewind is `failed` |
 * | `notStarted` | anything else |
 *
 * Members are enabled users with a Plex identity.
 *
 * @module lib/wrapped/admin/season
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export const STUCK_AFTER_MS = 15 * 60 * 1000

export type SeasonMemberState = "ready" | "generating" | "failed" | "stuck" | "notStarted"

export const SEASON_STATES: readonly SeasonMemberState[] = ["ready", "generating", "failed", "stuck", "notStarted"]

export interface SeasonCounts {
  ready: number
  generating: number
  failed: number
  stuck: number
  notStarted: number
  byEdition: Record<string, number>
  /** Completed runs this year by copy source (`llm`, `repair`, `template`, `mixed`). */
  byCopySource: Record<string, number>
}

const MEMBER: Prisma.UserWhereInput = { disabledAt: null, plexUserId: { not: null } }
const ACTIVE = { in: ["queued", "running"] }

function stuckRun(year: number, now: number): Prisma.RewindGenerationWhereInput {
  const cutoff = new Date(now - STUCK_AFTER_MS)
  return {
    year,
    OR: [
      { status: "running", startedAt: { lt: cutoff } },
      { status: "queued", createdAt: { lt: cutoff } },
    ],
  }
}

/** The `User` filter for one state. */
export function stateWhere(year: number, state: SeasonMemberState, now: number = Date.now()): Prisma.UserWhereInput {
  switch (state) {
    case "stuck":
      return { rewindGenerations: { some: stuckRun(year, now) } }
    case "generating":
      return { rewindGenerations: { some: { year, status: ACTIVE } } }
    case "ready":
      return { plexWrapped: { some: { year, status: "completed" } } }
    case "failed":
      return { plexWrapped: { some: { year, status: "failed" } } }
    case "notStarted":
      return {
        plexWrapped: { none: { year, status: { in: ["completed", "failed", "generating"] } } },
        rewindGenerations: { none: { year, status: ACTIVE } },
      }
  }
}

/** The StatGrid and the progress poll: counts only. */
export async function getSeasonCounts(year: number, now: number = Date.now()): Promise<SeasonCounts> {
  const count = (state: SeasonMemberState) => prisma.user.count({ where: { ...MEMBER, ...stateWhere(year, state, now) } })
  const [ready, generating, failed, stuck, notStarted, editions, sources] = await Promise.all([
    count("ready"),
    count("generating"),
    count("failed"),
    count("stuck"),
    count("notStarted"),
    prisma.plexWrapped.groupBy({ by: ["edition"], where: { year, status: "completed" }, _count: { _all: true } }),
    prisma.rewindGeneration.groupBy({ by: ["copySource"], where: { year, status: "completed" }, _count: { _all: true } }),
  ])
  return {
    ready,
    generating,
    failed,
    stuck,
    notStarted,
    byEdition: Object.fromEntries(editions.map((row) => [row.edition ?? "legacy", row._count._all])),
    byCopySource: Object.fromEntries(sources.map((row) => [row.copySource ?? "none", row._count._all])),
  }
}

/** The members a run would generate and whether their stored Rewind already covers `through`, for the estimate. */
export async function getSeasonCandidates(year: number, through: Date, scope: "all" | "failed") {
  const rows = await prisma.user.findMany({
    where: {
      ...MEMBER,
      rewindGenerations: { none: { year, status: ACTIVE } },
      ...(scope === "failed" && { plexWrapped: { some: { year, status: "failed" } } }),
    },
    select: {
      isAdmin: true,
      plexWrapped: { where: { year }, select: { status: true, edition: true, dataThrough: true } },
    },
  })
  return rows.map((row) => {
    const wrapped = row.plexWrapped[0]
    return {
      isAdmin: row.isAdmin,
      edition: wrapped?.edition ?? null,
      unchanged: wrapped?.status === "completed" && wrapped.dataThrough?.getTime() === through.getTime(),
    }
  })
}
