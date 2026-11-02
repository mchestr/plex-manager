/**
 * The conversation judge's per-conversation reads, for the conversation page
 * and the Calls badges: server-only, each admin-checked next to its data. The
 * backlog reads (list, groups, stat tiles) are in
 * `lib/data/conversation-findings.ts`.
 *
 * The conversation page shows every finding, unverified ones last, since it is
 * where an admin can still check a quote; the badges' "N open" leaves
 * unverified findings out, like every other count. Reading one conversation's
 * review is audited as `conversation-review` against the conversation's owner,
 * only when it returns their text (a finding with its message, or a summary).
 * No read here selects a message's tool log.
 *
 * @module lib/data/conversation-review
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { FINDING_SELECT, type FindingRow } from "@/lib/data/conversation-findings"
import type { ConversationReviewStatus, ConversationReviewTrigger } from "@/lib/generated/prisma/client"
import { isLlmDisabled } from "@/lib/judge/guards"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"

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

/**
 * A conversation's latest review (any status) with its cost, and every
 * finding with the stored message it points at (index, role and text),
 * unverified ones included and last. Messages go only when the conversation
 * ends, which deletes its findings too, so a finding without its message is
 * left out rather than shown without one.
 *
 * `hasToolEvidence` counts any assistant message with a stored `toolLog`
 * (`[]` included). It does not decrypt or parse the log, so a log that no
 * longer decrypts or parses still counts here, while the judge prompt treats
 * such a log as not recorded (`parseToolLog` in `lib/judge/tool-log.ts` reads
 * it as null, which `lib/judge/build-prompt.ts` shows as "tool results not
 * recorded").
 *
 * `llmDisabled` is the master AI features switch (`isLlmDisabled`,
 * `lib/judge/guards.ts`): while it is off no review can start, whatever
 * `judgeConfigured` says, and the page says so.
 */
export async function getConversationReview(conversationId: string): Promise<{
  review: ReviewView | null
  findings: Array<FindingRow & { message: { index: number; role: "user" | "assistant"; content: string } }>
  hasToolEvidence: boolean
  judgeConfigured: boolean
  llmDisabled: boolean
  reviewable: boolean
}> {
  const session = await assertAdmin()
  const [owner, latest, order, findings, toolTurns, judge, conversation, llmDisabled] = await Promise.all([
    prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { userId: true } }),
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
    isLlmDisabled(),
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
  // Audited only when it returns the member's text: a finding with its message, or the review's summary
  if (owner && (withMessages.length > 0 || latest?.summary)) await auditMemberRead("conversation-review", owner.userId, session.user.id)

  return {
    review: latest ? { ...latest, cost: usage?._sum.cost ?? 0 } : null,
    findings: withMessages,
    hasToolEvidence: toolTurns > 0,
    judgeConfigured: judge !== null,
    llmDisabled,
    reviewable: conversation !== null,
  }
}

/**
 * The Calls badge for each conversation still in review scope
 * (`REVIEWABLE_CONVERSATION`): `none` without a finished review, `open` with
 * open findings that are verified or need no quote (counted),
 * `unverified_only` when every open finding is unverified, else `clean`. An
 * ended or Discord conversation gets no entry: ending keeps its done review
 * but deletes the findings, so a badge would call it clean.
 */
export async function reviewBadgesFor(conversationIds: string[]): Promise<Map<string, ReviewBadge>> {
  await assertAdmin()
  if (conversationIds.length === 0) return new Map()
  const [reviewable, reviewed, open] = await Promise.all([
    prisma.chatConversation.findMany({ where: { id: { in: conversationIds }, ...REVIEWABLE_CONVERSATION }, select: { id: true } }),
    prisma.conversationReview.groupBy({ by: ["conversationId"], where: { conversationId: { in: conversationIds }, status: "done" } }),
    prisma.conversationFinding.groupBy({
      by: ["conversationId", "evidenceCheck"],
      where: { conversationId: { in: conversationIds }, status: "open" },
      _count: { _all: true },
    }),
  ])
  const done = new Set(reviewed.map((row) => row.conversationId))
  const inScope = new Set(reviewable.map((row) => row.id))
  return new Map(
    conversationIds.filter((id) => inScope.has(id)).map((id): [string, ReviewBadge] => {
      if (!done.has(id)) return [id, { state: "none", open: 0 }]
      const rows = open.filter((row) => row.conversationId === id)
      const counted = rows.filter((row) => row.evidenceCheck !== "unverified").reduce((sum, row) => sum + row._count._all, 0)
      if (counted > 0) return [id, { state: "open", open: counted }]
      return [id, { state: rows.length > 0 ? "unverified_only" : "clean", open: 0 }]
    })
  )
}
