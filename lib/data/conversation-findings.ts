/**
 * The conversation judge's backlog reads, for the Findings tab and the
 * `list_conversation_findings` MCP tool: server-only, each admin-checked next
 * to its data. One conversation's review and the Calls badges are in
 * `lib/data/conversation-review.ts`.
 *
 * ## Unverified findings
 *
 * A finding whose quote did not match what the judge saw is `unverified`
 * (`lib/judge/verify.ts`). The list hides those by default (`hideUnverified`)
 * and says how many it hid; every count (the stat tiles, the grouped view and
 * the badges' "N open") leaves them out whatever that filter says, so the
 * numbers match the default list.
 *
 * ## The range
 *
 * The list and the groups take the range on the finding's `createdAt`. The
 * stat tiles read it as spec section 2 does ("Open, Fixed (in range) and
 * False alarm rate"): Open is the whole open backlog, whatever the range, and
 * Fixed and the false alarm rate count findings triaged (`triagedAt`) in it.
 *
 * Judge text (claim, evidence, suggestion, note) quotes conversations and tool
 * output, so its readers render it as plain text. No read here selects a
 * message's tool log. Listing findings is audited as `conversation-findings`,
 * with the filters only, never finding text.
 *
 * @module lib/data/conversation-findings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import type { EvidenceCheck, EvidenceSource, FindingSeverity, FindingStatus, FindingType, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import { dateRangeToInstants, type DayRange } from "@/lib/ui/date-range"

export type FindingFilters = {
  status?: FindingStatus
  type?: FindingType
  severity?: FindingSeverity
  tool?: string
  /** Default true: leave out `evidenceCheck: unverified` findings. Counts leave them out whatever it says. */
  hideUnverified?: boolean
  /** In the server zone: the finding's `createdAt`, except in {@link findingStats}. */
  range?: DayRange | null
}

export type FindingRow = {
  id: string
  conversationId: string
  messageId: string | null
  type: FindingType
  severity: FindingSeverity
  claim: string
  evidence: string
  suggestion: string
  tool: string | null
  evidenceSource: EvidenceSource
  evidenceCheck: EvidenceCheck
  status: FindingStatus
  note: string | null
  seenCount: number
  lastSeenAt: Date
  createdAt: Date
  triagedAt: Date | null
}

/** Every column of a {@link FindingRow}, and nothing else. */
export const FINDING_SELECT = {
  id: true,
  conversationId: true,
  messageId: true,
  type: true,
  severity: true,
  claim: true,
  evidence: true,
  suggestion: true,
  tool: true,
  evidenceSource: true,
  evidenceCheck: true,
  status: true,
  note: true,
  seenCount: true,
  lastSeenAt: true,
  createdAt: true,
  triagedAt: true,
} satisfies Record<keyof FindingRow, true>

const VISIBLE = { evidenceCheck: { not: "unverified" } } satisfies Prisma.ConversationFindingWhereInput

/** The status, type, severity and tool filters (not `hideUnverified` or the range). */
function filterWhere({ status, type, severity, tool }: FindingFilters): Prisma.ConversationFindingWhereInput {
  return {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(severity ? { severity } : {}),
    ...(tool !== undefined ? { tool } : {}),
  }
}

/** The range on `field`, in `zone`; nothing without a range. */
function inRange(field: "createdAt" | "triagedAt", range: DayRange | null | undefined, zone: string): Prisma.ConversationFindingWhereInput {
  return range ? { [field]: dateRangeToInstants(range, zone) } : {}
}

/**
 * One page of findings, newest first, with the count matching and the
 * unverified ones the other filters match. Audited with the filters (enums,
 * the flag, the tool name and the range's instants), never finding text.
 */
export async function listFindings(
  filters: FindingFilters,
  zone: string,
  { page, pageSize }: { page: number; pageSize: number }
): Promise<{ rows: FindingRow[]; total: number; hiddenUnverified: number }> {
  const session = await assertAdmin()
  const hideUnverified = filters.hideUnverified ?? true
  const window = filters.range ? dateRangeToInstants(filters.range, zone) : null
  await auditMemberListed("conversation-findings", session.user.id, {
    status: filters.status,
    type: filters.type,
    severity: filters.severity,
    tool: filters.tool,
    hideUnverified,
    from: window?.gte.toISOString(),
    to: window?.lt.toISOString(),
  })

  const base = { AND: [filterWhere(filters), inRange("createdAt", filters.range, zone)] }
  const where = hideUnverified ? { AND: [base, VISIBLE] } : base
  const [rows, total, hiddenUnverified] = await Promise.all([
    prisma.conversationFinding.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: FINDING_SELECT }),
    prisma.conversationFinding.count({ where }),
    prisma.conversationFinding.count({ where: { AND: [base, { evidenceCheck: "unverified" }] } }),
  ])
  return { rows, total, hiddenUnverified }
}

/**
 * The open backlog by `(type, tool)`: open findings created in the range, the
 * conversations they are in and the newest, most open first. Every column
 * counts open findings, so the status filter does not apply; unverified
 * findings never count.
 */
export async function groupFindings(
  filters: FindingFilters,
  zone: string
): Promise<Array<{ type: FindingType; tool: string | null; open: number; conversations: number; latest: Date }>> {
  await assertAdmin()
  const rows = await prisma.conversationFinding.groupBy({
    by: ["type", "tool", "conversationId"],
    where: { AND: [filterWhere({ ...filters, status: "open" }), inRange("createdAt", filters.range, zone), VISIBLE] },
    _count: { _all: true },
    _max: { createdAt: true },
  })
  const groups = new Map<string, { type: FindingType; tool: string | null; open: number; conversations: number; latest: Date }>()
  for (const row of rows) {
    const latest = row._max.createdAt ?? new Date(0)
    const key = JSON.stringify([row.type, row.tool])
    const group = groups.get(key)
    if (!group) groups.set(key, { type: row.type, tool: row.tool, open: row._count._all, conversations: 1, latest })
    else Object.assign(group, { open: group.open + row._count._all, conversations: group.conversations + 1, latest: latest > group.latest ? latest : group.latest })
  }
  return [...groups.values()].sort((a, b) => b.open - a.open || b.latest.getTime() - a.latest.getTime())
}

/**
 * The stat tiles, on the type, severity and tool filters (never the status
 * filter, and never unverified findings):
 *
 * - `open`: every open finding, whatever the range.
 * - `fixed`: findings fixed with `triagedAt` in the range, whenever created.
 * - `falseAlarmRate`: false alarms over every triaged finding (fixed, won't
 *   fix, false alarm) with `triagedAt` in the range; null with none.
 */
export async function findingStats(filters: FindingFilters, zone: string): Promise<{ open: number; fixed: number; falseAlarmRate: number | null }> {
  await assertAdmin()
  const base = filterWhere({ ...filters, status: undefined })
  const [open, triaged] = await Promise.all([
    prisma.conversationFinding.count({ where: { AND: [base, { status: "open" }, VISIBLE] } }),
    prisma.conversationFinding.groupBy({
      by: ["status"],
      where: { AND: [base, { status: { in: ["fixed", "wont_fix", "false_alarm"] } }, inRange("triagedAt", filters.range, zone), VISIBLE] },
      _count: { _all: true },
    }),
  ])
  const count = (status: FindingStatus) => triaged.find((row) => row.status === status)?._count._all ?? 0
  const closed = count("fixed") + count("wont_fix") + count("false_alarm")
  return { open, fixed: count("fixed"), falseAlarmRate: closed > 0 ? count("false_alarm") / closed : null }
}
