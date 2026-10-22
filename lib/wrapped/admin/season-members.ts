/**
 * One page of the season console's member table (P7.8): the URL drives the
 * page and the status, edition and copy-source filters. Each row carries
 * status columns, the run's cost from an aggregate query and whether a share
 * link is on, never the token or the Rewind's data.
 *
 * @module lib/wrapped/admin/season-members
 */

import "server-only"

import type { Prisma } from "@/lib/generated/prisma/client"
import { usageTotalsForWrapped } from "@/lib/llm/usage-totals"
import { prisma } from "@/lib/prisma"

import { STUCK_AFTER_MS, stateWhere, type SeasonMemberState } from "./season"

export interface SeasonMemberFilters {
  state: SeasonMemberState | null
  edition: string | null
  copySource: string | null
}

export interface SeasonMemberRow {
  id: string
  name: string
  state: SeasonMemberState
  edition: string | null
  copySource: string | null
  /** When the stored facts were generated (the `factsHash` age). */
  factsAt: string | null
  lastGeneratedAt: string | null
  costUsd: number
  shared: boolean
  failureCode: string | null
}

function stateOf(
  wrapped: { status: string } | undefined,
  latest: { status: string; startedAt: Date | null; createdAt: Date } | undefined,
  now: number
): SeasonMemberState {
  if (latest && (latest.status === "running" || latest.status === "queued")) {
    const since = (latest.status === "running" ? latest.startedAt : latest.createdAt) ?? latest.createdAt
    return now - since.getTime() >= STUCK_AFTER_MS ? "stuck" : "generating"
  }
  if (wrapped?.status === "completed") return "ready"
  if (wrapped?.status === "failed") return "failed"
  return "notStarted"
}

function codeOf(error: Prisma.JsonValue | null): string | null {
  return error && typeof error === "object" && !Array.isArray(error) && typeof error.code === "string" ? error.code : null
}

/** The rows for one page and the total that matches the filters. */
export async function listSeasonMembers(
  year: number,
  filters: SeasonMemberFilters,
  page: { page: number; pageSize: number },
  now: number = Date.now()
): Promise<{ rows: SeasonMemberRow[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    AND: [
      { disabledAt: null, plexUserId: { not: null } },
      filters.state ? stateWhere(year, filters.state, now) : {},
      filters.edition ? { plexWrapped: { some: { year, edition: filters.edition } } } : {},
      filters.copySource ? { rewindGenerations: { some: { year, status: "completed", copySource: filters.copySource } } } : {},
    ],
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        plexWrapped: {
          where: { year },
          select: {
            id: true,
            status: true,
            edition: true,
            generatedAt: true,
            shares: { where: { revokedAt: null }, select: { id: true }, take: 1 },
          },
        },
        rewindGenerations: {
          where: { year, status: { not: "skipped" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, error: true, copySource: true, startedAt: true, finishedAt: true, createdAt: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ])

  const wrappedIds = users.flatMap((user) => user.plexWrapped.map((w) => w.id))
  const costs = await usageTotalsForWrapped(wrappedIds)

  const rows = users.map((user): SeasonMemberRow => {
    const wrapped = user.plexWrapped[0]
    const latest = user.rewindGenerations[0]
    return {
      id: user.id,
      name: user.name ?? user.email ?? user.id,
      state: stateOf(wrapped, latest, now),
      edition: wrapped?.edition ?? null,
      copySource: latest?.status === "completed" ? latest.copySource : null,
      factsAt: wrapped?.generatedAt?.toISOString() ?? null,
      lastGeneratedAt: latest?.finishedAt?.toISOString() ?? null,
      costUsd: (wrapped && costs.get(wrapped.id)?.cost) ?? 0,
      shared: (wrapped?.shares.length ?? 0) > 0,
      failureCode: latest?.status === "failed" ? codeOf(latest.error) : null,
    }
  })
  return { rows, total }
}
