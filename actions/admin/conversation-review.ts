"use server"

/**
 * The conversation judge's admin actions: ask for a review, poll its status
 * and triage a finding. Reviews and triage are audited
 * (`CONVERSATION_REVIEW_REQUESTED`, `CONVERSATION_FINDING_TRIAGED`) with ids
 * and statuses only, never finding or note text.
 *
 * @module actions/admin/conversation-review
 */

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { refreshView } from "@/lib/actions/invalidate"
import { fail, ok } from "@/lib/actions/result"
import { enqueueReview } from "@/lib/judge/enqueue"
import { reviewJobState } from "@/lib/judge/job-state"
import { prisma } from "@/lib/prisma"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

const conversationInput = z.object({ conversationId: z.string().min(1).max(100) })

/**
 * Asks the judge to review an open admin assistant conversation, or returns
 * the review already queued or running for it. Refuses a Discord or ended
 * conversation (`CONFLICT`), and answers `UPSTREAM_UNAVAILABLE` while AI
 * features are off, without a conversation review model or while the job
 * queue is down. Rate limited per admin, since each review spends money.
 */
export const reviewConversation = adminAction({
  input: conversationInput,
  rateLimit: { name: "judge-review" },
  fallbackError: "Could not start the review",
  handler: async ({ conversationId }, { userId }) => {
    const result = await enqueueReview(
      { conversationId, trigger: "manual", requestedById: userId },
      {
        enqueue: (data) => enqueueFromRequest(JOB_TYPES.CONVERSATION_REVIEW, data),
        getJobState: (jobId) => reviewJobState(jobId),
      }
    )
    if (!result.ok) {
      switch (result.code) {
        case "NOT_FOUND":
          return fail("NOT_FOUND", "Conversation not found.")
        case "CONFLICT":
          return fail("CONFLICT", "Only an open admin assistant conversation can be reviewed.")
        case "LLM_DISABLED":
          return fail("UPSTREAM_UNAVAILABLE", "AI features are turned off in settings. Turn them on to review conversations.")
        case "UNAVAILABLE":
          return fail("UPSTREAM_UNAVAILABLE", "Set up a conversation review model first.")
        case "QUEUE_UNAVAILABLE":
          return fail("UPSTREAM_UNAVAILABLE", "The job queue is unavailable. Try again shortly.")
      }
    }
    const { reviewId, status } = result
    logAuditEvent(AuditEventType.CONVERSATION_REVIEW_REQUESTED, userId, { conversationId, reviewId, status })
    return ok({ reviewId, status })
  },
})

/**
 * The status and error code of a conversation's latest review, or null when
 * it has none. Refreshes the page once the review is done or failed.
 */
export const getConversationReviewStatus = adminAction({
  input: conversationInput,
  fallbackError: "Could not read the review status",
  handler: async ({ conversationId }) => {
    const latest = await prisma.conversationReview.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, errorCode: true },
    })
    if (!latest) return ok(null)
    if (latest.status === "done" || latest.status === "failed") refreshView()
    return ok({ reviewId: latest.id, status: latest.status, errorCode: latest.errorCode })
  },
})

/**
 * Triages a finding: fixed, won't fix or false alarm records who closed it
 * and when; open clears both. A given note replaces the stored one (an empty
 * note clears it); without one the note is kept.
 */
export const setFindingStatus = adminAction({
  input: z.object({
    findingId: z.string().min(1).max(100),
    status: z.enum(["open", "fixed", "wont_fix", "false_alarm"]),
    note: z.string().max(1000).optional(),
  }),
  fallbackError: "Could not save the finding",
  handler: async ({ findingId, status, note }, { userId }) => {
    const finding = await prisma.conversationFinding.findUnique({
      where: { id: findingId },
      select: { conversationId: true, status: true },
    })
    if (!finding) return fail("NOT_FOUND", "Finding not found.")

    const closing = status !== "open"
    const updated = await prisma.conversationFinding.updateMany({
      where: { id: findingId },
      data: {
        status,
        triagedById: closing ? userId : null,
        triagedAt: closing ? new Date() : null,
        ...(note !== undefined && { note: note === "" ? null : note }),
      },
    })
    if (updated.count === 0) return fail("NOT_FOUND", "Finding not found.")

    logAuditEvent(AuditEventType.CONVERSATION_FINDING_TRIAGED, userId, {
      findingId,
      conversationId: finding.conversationId,
      previousStatus: finding.status,
      status,
    })
    refreshView()
    return ok(null)
  },
})
