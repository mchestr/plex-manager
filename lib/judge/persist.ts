/**
 * Writes a finished review and its findings in one transaction, keeping each
 * finding by its fingerprint.
 *
 * ## Process
 *
 * 1. Lock the conversation row (`reviewLockedAt`, the way `saveTurn` takes it),
 *    so a review finishing and the conversation ending serialise. An ended
 *    conversation writes nothing.
 * 2. Mark the review `done`, conditional on it still `running` with this run's
 *    token. Either count at 0 throws {@link ReviewSuperseded}, which rolls the
 *    transaction back.
 * 3. For each finding, by `(conversationId, fingerprint)`:
 *
 * | stored row                                                  | write                                                        | counted as |
 * |-------------------------------------------------------------|--------------------------------------------------------------|------------|
 * | none                                                        | create it                                                    | inserted   |
 * | `open`                                                      | new evidence, `reviewId`, seen (conditional on still `open`) | updated    |
 * | `open`, `verified` or `not_applicable`; repeat `unverified` | `reviewId` and seen only (conditional on still `open`)       | suppressed |
 * | triaged                                                     | seen only (`seenCount + 1`, `lastSeenAt`)                    | suppressed |
 *
 * ## Special cases
 *
 * - A repeat never downgrades evidence: an `unverified` repeat of a `verified`
 *   or `not_applicable` open row keeps the stored claim, evidence, suggestion,
 *   `evidenceSource`, `evidenceCheck` and `severity`, so `updated` always
 *   means the evidence was refreshed.
 * - An open row triaged mid-run matches 0 on its conditional update, keeps its
 *   new status and only counts as seen.
 * - A review never deletes findings; only triage closes one.
 *
 * The transaction holds the conversation's row lock, so it never makes an LLM
 * or Redis call. The extension encrypts the text fields, so they go in as
 * plaintext.
 *
 * @module lib/judge/persist
 */

import { fingerprintOf } from "@/lib/judge/fingerprint"
import { type VerifiedFinding } from "@/lib/judge/verify"
import { type PrismaTransactionClient } from "@/lib/prisma"

/** The review ended, moved to another run, or lost its conversation before its results were written. */
export class ReviewSuperseded extends Error {
  constructor() {
    super("The review was superseded before its results were written")
    this.name = "ReviewSuperseded"
  }
}

type PersistInput = {
  reviewId: string
  conversationId: string
  findings: VerifiedFinding[]
  summary: string
  model: string
  promptVersion: string
  reviewedThrough: Date
  runToken: number
}

type PersistCounts = { inserted: number; updated: number; suppressed: number }
type Outcome = keyof PersistCounts

const evidenceOf = (finding: VerifiedFinding) => ({
  claim: finding.claim,
  evidence: finding.evidence,
  suggestion: finding.suggestion,
  evidenceSource: finding.evidenceSource,
  evidenceCheck: finding.evidenceCheck,
  severity: finding.severity,
})

async function persistFinding(tx: PrismaTransactionClient, input: PersistInput, finding: VerifiedFinding, now: Date): Promise<Outcome> {
  const fingerprint = fingerprintOf(finding)
  const stored = await tx.conversationFinding.findUnique({
    where: { conversationId_fingerprint: { conversationId: input.conversationId, fingerprint } },
    select: { id: true, status: true, evidenceCheck: true },
  })
  if (!stored) {
    await tx.conversationFinding.create({
      data: {
        reviewId: input.reviewId,
        conversationId: input.conversationId,
        messageId: finding.messageId,
        fingerprint,
        type: finding.type,
        tool: finding.tool,
        ...evidenceOf(finding),
        lastSeenAt: now,
      },
    })
    return "inserted"
  }
  const seen = { seenCount: { increment: 1 }, lastSeenAt: now }
  if (stored.status === "open") {
    const downgrade = finding.evidenceCheck === "unverified" && stored.evidenceCheck !== "unverified"
    const { count } = await tx.conversationFinding.updateMany({
      where: { id: stored.id, status: "open" },
      data: { reviewId: input.reviewId, ...seen, ...(downgrade ? {} : evidenceOf(finding)) },
    })
    if (count > 0) return downgrade ? "suppressed" : "updated"
  }
  await tx.conversationFinding.updateMany({ where: { id: stored.id }, data: seen })
  return "suppressed"
}

export async function persistReview(tx: PrismaTransactionClient, input: PersistInput): Promise<PersistCounts> {
  const now = new Date()
  const locked = await tx.chatConversation.updateMany({ where: { id: input.conversationId, endedAt: null }, data: { reviewLockedAt: now } })
  if (locked.count === 0) throw new ReviewSuperseded()
  const done = await tx.conversationReview.updateMany({
    where: { id: input.reviewId, status: "running", runToken: input.runToken },
    data: {
      status: "done",
      errorCode: null,
      summary: input.summary,
      model: input.model,
      promptVersion: input.promptVersion,
      reviewedThrough: input.reviewedThrough,
      completedAt: now,
    },
  })
  if (done.count === 0) throw new ReviewSuperseded()

  const counts: PersistCounts = { inserted: 0, updated: 0, suppressed: 0 }
  // At most 20 findings (judgeOutputSchema) at 3 statements each (the findUnique, the conditional open
  // update, the seen update): 60 here, 62 with the two above, all while the row lock is held
  for (const finding of input.findings) counts[await persistFinding(tx, input, finding, now)] += 1
  return counts
}
