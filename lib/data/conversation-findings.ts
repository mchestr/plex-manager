/**
 * The conversation judge's reads, for the Findings tab, the conversation
 * page, the Calls badges and the `list_conversation_findings` MCP tool:
 * server-only, each admin-checked next to its data.
 *
 * ## Unverified findings
 *
 * A finding whose quote did not match what the judge saw is `unverified`
 * (`lib/judge/verify.ts`). The list hides those by default (`hideUnverified`)
 * and says how many it hid; every count (the stat tiles, the grouped view and
 * the badges' "N open") leaves them out whatever that filter says, so the
 * numbers match the default list. Only the conversation page shows every
 * finding, unverified ones last.
 *
 * Judge text (claim, evidence, suggestion, note, summary) quotes conversations
 * and tool output, so its readers render it as plain text. No read here
 * selects a message's tool log.
 *
 * @module lib/data/conversation-findings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import type {
  ConversationReviewStatus,
  ConversationReviewTrigger,
  EvidenceCheck,
  EvidenceSource,
  FindingSeverity,
  FindingStatus,
  FindingType,
  Prisma,
} from "@/lib/generated/prisma/client"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { prisma } from "@/lib/prisma"
import { dateRangeToInstants, type DayRange } from "@/lib/ui/date-range"

export type FindingFilters = {
  status?: FindingStatus
  type?: FindingType
  severity?: FindingSeverity
  tool?: string
  /** Default true: leave out `evidenceCheck: unverified` findings. */
  hideUnverified?: boolean
  /** On the finding's `createdAt`, in the server zone. */
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

export type ReviewView = {
  id: string
  status: ConversationReviewStatus
  errorCode: string | null
  trigger: ConversationReviewTrigger
  model: string | null
  cost: number
  reviewedThrough: Date | null
  completedAt: Date | null
  summary: string | null
}

export type ReviewBadge = { state: "none" | "clean" | "open" | "unverified_only"; open: number }

const FINDING_SELECT = {
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

/** The filters other than `hideUnverified`; the range is in `zone`. */
function filterWhere({ status, type, severity, tool, range }: FindingFilters, zone: string): Prisma.ConversationFindingWhereInput {
  return {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(severity ? { severity } : {}),
    ...(tool !== undefined ? { tool } : {}),
    ...(range ? { createdAt: dateRangeToInstants(range, zone) } : {}),
  }
}

/** One page of findings, newest first, with the count matching and the unverified ones the other filters match. */
export async function listFindings(
  filters: FindingFilters,
  zone: string,
  { page, pageSize }: { page: number; pageSize: number }
): Promise<{ rows: FindingRow[]; total: number; hiddenUnverified: number }> {
  await assertAdmin()
  const base = filterWhere(filters, zone)
  const where = (filters.hideUnverified ?? true) ? { AND: [base, VISIBLE] } : base
  const [rows, total, hiddenUnverified] = await Promise.all([
    prisma.conversationFinding.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, select: FINDING_SELECT }),
    prisma.conversationFinding.count({ where }),
    prisma.conversationFinding.count({ where: { AND: [base, { evidenceCheck: "unverified" }] } }),
  ])
  return { rows, total, hiddenUnverified }
}

/**
 * The open backlog by `(type, tool)`: open findings, the conversations they
 * are in and the newest, most open first. The status filter does not apply,
 * since every column counts open findings.
 */
export async function groupFindings(
  filters: FindingFilters,
  zone: string
): Promise<Array<{ type: FindingType; tool: string | null; open: number; conversations: number; latest: Date }>> {
  await assertAdmin()
  const rows = await prisma.conversationFinding.groupBy({
    by: ["type", "tool", "conversationId"],
    where: { AND: [filterWhere({ ...filters, status: "open" }, zone), VISIBLE] },
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

/** The stat tiles: open and fixed findings, and false alarms over triaged ones (null with none triaged). The status filter does not apply. */
export async function findingStats(filters: FindingFilters, zone: string): Promise<{ open: number; fixed: number; falseAlarmRate: number | null }> {
  await assertAdmin()
  const rows = await prisma.conversationFinding.groupBy({
    by: ["status"],
    where: { AND: [filterWhere({ ...filters, status: undefined }, zone), VISIBLE] },
    _count: { _all: true },
  })
  const count = (status: FindingStatus) => rows.find((row) => row.status === status)?._count._all ?? 0
  const triaged = count("fixed") + count("wont_fix") + count("false_alarm")
  return { open: count("open"), fixed: count("fixed"), falseAlarmRate: triaged > 0 ? count("false_alarm") / triaged : null }
}

/**
 * A conversation's latest review (any status) with its cost, and every
 * finding with the stored message it points at (index, role and text),
 * unverified ones included and last. Messages go only when the conversation
 * ends, which deletes its findings too, so a finding without its message is
 * left out rather than shown without one.
 */
export async function getConversationReview(conversationId: string): Promise<{
  review: ReviewView | null
  findings: Array<FindingRow & { message: { index: number; role: "user" | "assistant"; content: string } }>
  hasToolEvidence: boolean
  judgeConfigured: boolean
  reviewable: boolean
}> {
  await assertAdmin()
  const [latest, order, findings, toolTurns, judge, conversation] = await Promise.all([
    prisma.conversationReview.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, errorCode: true, trigger: true, model: true, reviewedThrough: true, completedAt: true, summary: true },
    }),
    // A message's index is its position in this order, the one the judge saw
    prisma.chatConversationMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true } }),
    prisma.conversationFinding.findMany({ where: { conversationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: FINDING_SELECT }),
    prisma.chatConversationMessage.count({ where: { conversationId, role: "assistant", toolLog: { not: null } } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "judge" }, select: { id: true } }),
    prisma.chatConversation.findFirst({ where: { id: conversationId, ...REVIEWABLE_CONVERSATION }, select: { id: true } }),
  ])

  const messageIds = [...new Set(findings.flatMap((finding) => (finding.messageId ? [finding.messageId] : [])))]
  const [usage, messages] = await Promise.all([
    latest ? prisma.lLMUsage.aggregate({ where: { conversationReviewId: latest.id }, _sum: { cost: true } }) : null,
    messageIds.length > 0
      ? prisma.chatConversationMessage.findMany({ where: { conversationId, id: { in: messageIds } }, select: { id: true, role: true, content: true } })
      : [],
  ])

  const indexOf = new Map(order.map((message, index) => [message.id, index]))
  const byId = new Map(messages.map((message) => [message.id, message]))
  const withMessages = findings.flatMap((finding) => {
    const message = finding.messageId ? byId.get(finding.messageId) : undefined
    const index = message ? indexOf.get(message.id) : undefined
    return message && index !== undefined ? [{ ...finding, message: { index, role: message.role, content: message.content } }] : []
  })
  const unverified = (finding: FindingRow) => (finding.evidenceCheck === "unverified" ? 1 : 0)
  withMessages.sort((a, b) => unverified(a) - unverified(b) || a.message.index - b.message.index)

  return {
    review: latest ? { ...latest, cost: usage?._sum.cost ?? 0 } : null,
    findings: withMessages,
    hasToolEvidence: toolTurns > 0,
    judgeConfigured: judge !== null,
    reviewable: conversation !== null,
  }
}

/**
 * The Calls badge for each conversation: `none` without a finished review,
 * `open` with open findings that are verified or need no quote (counted),
 * `unverified_only` when every open finding is unverified, else `clean`.
 */
export async function reviewBadgesFor(conversationIds: string[]): Promise<Map<string, ReviewBadge>> {
  await assertAdmin()
  if (conversationIds.length === 0) return new Map()
  const [reviewed, open] = await Promise.all([
    prisma.conversationReview.groupBy({ by: ["conversationId"], where: { conversationId: { in: conversationIds }, status: "done" } }),
    prisma.conversationFinding.groupBy({
      by: ["conversationId", "evidenceCheck"],
      where: { conversationId: { in: conversationIds }, status: "open" },
      _count: { _all: true },
    }),
  ])
  const done = new Set(reviewed.map((row) => row.conversationId))
  return new Map(
    conversationIds.map((id): [string, ReviewBadge] => {
      if (!done.has(id)) return [id, { state: "none", open: 0 }]
      const rows = open.filter((row) => row.conversationId === id)
      const counted = rows.filter((row) => row.evidenceCheck !== "unverified").reduce((sum, row) => sum + row._count._all, 0)
      if (counted > 0) return [id, { state: "open", open: counted }]
      return [id, { state: rows.length > 0 ? "unverified_only" : "clean", open: 0 }]
    })
  )
}
