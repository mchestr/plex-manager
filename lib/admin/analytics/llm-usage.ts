/**
 * The LLM usage list's reads (P10.2), for server code only.
 *
 * ## Group before paginating (UI-23)
 *
 * A list row is a group: an assistant conversation's calls, or one call on
 * its own. `LLMUsage.groupKey` holds `chatConversationId ?? id` (backfilled
 * by the `p102_llm_usage_group_key` migration, written by `recordUsage`), so
 * the page is one `groupBy` on it, newest group first, and only then are that
 * page's rows loaded. No conversation splits across two pages, and the count
 * is the number of groups. No query selects a prompt or response.
 *
 * @module lib/admin/analytics/llm-usage
 */

import "server-only"

import type { Route } from "next"

import { llmConversation, llmUsageDetail } from "@/lib/admin/routes"
import { publicUserSelect } from "@/lib/dto/user"
import type { Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { dateRangeToInstants, type DayRange } from "@/lib/ui/date-range"

export const LLM_PURPOSES = ["rewind", "assistant", "discord"] as const
type LlmPurpose = (typeof LLM_PURPOSES)[number]

export interface LlmUsageFilters {
  userId?: string
  purpose?: LlmPurpose
  model?: string
  /** A Rewind year: calls for that year's Rewind. */
  year?: number
  range: DayRange | null
}

export interface LlmUsageGroupRow {
  key: string
  href: Route
  userId: string
  memberName: string
  /** The group's first call, ISO. */
  startedAt: string
  calls: number
  model: string | null
  tokens: number
  cost: number
  context: string
}

export interface LlmUsagePage {
  rows: LlmUsageGroupRow[]
  /** Groups matching the filters. */
  total: number
  totals: { calls: number; tokens: number; cost: number }
}

const PURPOSE_WHERE: Record<LlmPurpose, Prisma.LLMUsageWhereInput> = {
  rewind: { OR: [{ wrappedId: { not: null } }, { generationId: { not: null } }] },
  assistant: { chatConversation: { is: { discordSessions: { none: {} } } } },
  discord: { chatConversation: { is: { discordSessions: { some: {} } } } },
}

/** The `where` for the filters; the range is in `zone`. @internal */
export function usageWhere(filters: LlmUsageFilters, zone: string): Prisma.LLMUsageWhereInput {
  const and: Prisma.LLMUsageWhereInput[] = []
  if (filters.userId) and.push({ userId: filters.userId })
  if (filters.model) and.push({ model: filters.model })
  if (filters.purpose) and.push(PURPOSE_WHERE[filters.purpose])
  if (filters.year !== undefined) {
    and.push({ OR: [{ wrapped: { is: { year: filters.year } } }, { generation: { is: { year: filters.year } } }] })
  }
  if (filters.range) {
    const { gte, lt } = dateRangeToInstants(filters.range, zone)
    and.push({ createdAt: { gte, lt } })
  }
  return and.length > 0 ? { AND: and } : {}
}

function contextLabel(row: {
  chatConversationId: string | null
  chatConversation: { _count: { discordSessions: number } } | null
  wrapped: { year: number } | null
  generation: { year: number } | null
}, calls: number): string {
  const callCount = `${calls} ${calls === 1 ? "call" : "calls"}`
  if (row.chatConversationId) {
    return `${row.chatConversation && row.chatConversation._count.discordSessions > 0 ? "Discord" : "Assistant"} conversation, ${callCount}`
  }
  const year = row.wrapped?.year ?? row.generation?.year
  return year !== undefined ? `Rewind ${year}` : "Standalone call"
}

/** One page of groups, newest first. */
export async function listUsageGroups(
  filters: LlmUsageFilters,
  zone: string,
  { page, pageSize }: { page: number; pageSize: number },
): Promise<LlmUsagePage> {
  const where = usageWhere(filters, zone)

  const [groups, allGroups, totals] = await Promise.all([
    prisma.lLMUsage.groupBy({
      by: ["groupKey"],
      where,
      orderBy: [{ _max: { createdAt: "desc" } }, { groupKey: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      _sum: { totalTokens: true, cost: true },
      _count: { _all: true },
    }),
    prisma.lLMUsage.groupBy({ by: ["groupKey"], where }),
    prisma.lLMUsage.aggregate({ where, _sum: { totalTokens: true, cost: true }, _count: { _all: true } }),
  ])

  const rows = groups.length
    ? await prisma.lLMUsage.findMany({
        where: { AND: [where, { groupKey: { in: groups.map((group) => group.groupKey) } }] },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          groupKey: true,
          userId: true,
          model: true,
          createdAt: true,
          chatConversationId: true,
          chatConversation: { select: { _count: { select: { discordSessions: true } } } },
          wrapped: { select: { year: true } },
          generation: { select: { year: true } },
          user: { select: publicUserSelect },
        },
      })
    : []

  const byGroup = new Map<string, typeof rows>()
  for (const row of rows) byGroup.set(row.groupKey, [...(byGroup.get(row.groupKey) ?? []), row])

  return {
    total: allGroups.length,
    totals: { calls: totals._count._all, tokens: totals._sum.totalTokens ?? 0, cost: totals._sum.cost ?? 0 },
    rows: groups.flatMap((group) => {
      const calls = byGroup.get(group.groupKey)
      if (!calls?.length) return []
      const first = calls[0]
      const last = calls[calls.length - 1]
      return [
        {
          key: group.groupKey,
          href: first.chatConversationId ? llmConversation(first.chatConversationId) : llmUsageDetail(first.id),
          userId: first.userId,
          memberName: first.user.name || first.user.email || "Unknown member",
          startedAt: first.createdAt.toISOString(),
          calls: group._count._all,
          model: last.model,
          tokens: group._sum.totalTokens ?? 0,
          cost: group._sum.cost ?? 0,
          context: contextLabel(first, group._count._all),
        },
      ]
    }),
  }
}

export interface LlmUsageFilterOptions {
  members: Array<{ id: string; name: string }>
  models: string[]
}

/** The members and models that have calls, for the filter Selects. */
export async function getUsageFilterOptions(): Promise<LlmUsageFilterOptions> {
  const [members, models] = await Promise.all([
    prisma.lLMUsage.findMany({ distinct: ["userId"], select: { user: { select: publicUserSelect } } }),
    prisma.lLMUsage.findMany({ distinct: ["model"], where: { model: { not: null } }, select: { model: true } }),
  ])
  return {
    members: members
      .map(({ user }) => ({ id: user.id, name: user.name || user.email || "Unknown member" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    models: models.flatMap((row) => (row.model ? [row.model] : [])).sort(),
  }
}
