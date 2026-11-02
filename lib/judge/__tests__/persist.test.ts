/**
 * @jest-environment node
 */

/**
 * Persisting a review (spec §4, step 6): findings are kept by fingerprint, an
 * open row is updated in place without ever downgrading its evidence, a
 * triaged row only counts as seen, nothing is deleted, and a run that lost its
 * conversation or its run token writes nothing.
 */

import { mockReset } from "jest-mock-extended"

import { buildConversationFinding } from "@/__tests__/helpers/factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"

import { fingerprintOf } from "../fingerprint"
import { persistReview, ReviewSuperseded } from "../persist"
import { type VerifiedFinding } from "../verify"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const tx = asAppTransactionClient(prismaMock)
const REVIEWED_THROUGH = new Date(Date.UTC(2026, 9, 1, 12))

function finding(overrides: Partial<VerifiedFinding> = {}): VerifiedFinding {
  return {
    messageIndex: 1,
    messageId: "message-1",
    type: "wrong_fact",
    severity: "high",
    evidenceSource: "tool_result",
    claim: "The answer says 12 members.",
    evidence: '"total": 9',
    suggestion: "Use the tool's total.",
    tool: "get_users",
    evidenceCheck: "verified",
    ...overrides,
  }
}

const fingerprint = fingerprintOf(finding())

function input(findings: VerifiedFinding[] = []) {
  return {
    reviewId: "review-2",
    conversationId: "conversation-1",
    findings,
    summary: "One wrong count.",
    model: "judge-model",
    promptVersion: "v1",
    reviewedThrough: REVIEWED_THROUGH,
    runToken: 3,
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.conversationReview.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.conversationFinding.findUnique.mockResolvedValue(null)
  prismaMock.conversationFinding.updateMany.mockResolvedValue({ count: 1 })
})

const seenOnly = (id: string) => ({
  where: { id },
  data: { seenCount: { increment: 1 }, lastSeenAt: expect.any(Date) },
})

describe("persistReview", () => {
  it("empty findings marks done and writes nothing", async () => {
    await expect(persistReview(tx, input())).resolves.toEqual({ inserted: 0, updated: 0, suppressed: 0 })

    expect(prismaMock.chatConversation.updateMany).toHaveBeenCalledWith({
      where: { id: "conversation-1", endedAt: null },
      data: { reviewLockedAt: expect.any(Date) },
    })
    expect(prismaMock.conversationReview.updateMany).toHaveBeenCalledWith({
      where: { id: "review-2", status: "running", runToken: 3 },
      data: {
        status: "done",
        errorCode: null,
        summary: "One wrong count.",
        model: "judge-model",
        promptVersion: "v1",
        reviewedThrough: REVIEWED_THROUGH,
        completedAt: expect.any(Date),
      },
    })
    expect(prismaMock.chatConversation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prismaMock.conversationReview.updateMany.mock.invocationCallOrder[0],
    )
    expect(prismaMock.conversationFinding.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
  })

  it("inserts a finding with no row for its fingerprint", async () => {
    await expect(persistReview(tx, input([finding()]))).resolves.toEqual({ inserted: 1, updated: 0, suppressed: 0 })

    expect(prismaMock.conversationFinding.findUnique).toHaveBeenCalledWith({
      where: { conversationId_fingerprint: { conversationId: "conversation-1", fingerprint } },
      select: { id: true, status: true, evidenceCheck: true },
    })
    expect(prismaMock.conversationFinding.create).toHaveBeenCalledWith({
      data: {
        reviewId: "review-2",
        conversationId: "conversation-1",
        messageId: "message-1",
        fingerprint,
        type: "wrong_fact",
        severity: "high",
        tool: "get_users",
        claim: "The answer says 12 members.",
        evidence: '"total": 9',
        suggestion: "Use the tool's total.",
        evidenceSource: "tool_result",
        evidenceCheck: "verified",
        lastSeenAt: expect.any(Date),
      },
    })
  })

  it("open finding updated in place, with the new evidenceSource, evidenceCheck and severity", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(
      buildConversationFinding({ id: "finding-1", fingerprint, status: "open", evidenceCheck: "unverified", evidenceSource: "earlier_message", severity: "low" }),
    )

    await expect(persistReview(tx, input([finding()]))).resolves.toEqual({ inserted: 0, updated: 1, suppressed: 0 })

    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "finding-1", status: "open" },
      data: {
        reviewId: "review-2",
        seenCount: { increment: 1 },
        lastSeenAt: expect.any(Date),
        claim: "The answer says 12 members.",
        evidence: '"total": 9',
        suggestion: "Use the tool's total.",
        evidenceSource: "tool_result",
        evidenceCheck: "verified",
        severity: "high",
      },
    })
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
  })

  it("an unverified repeat of a verified open finding keeps the verified evidence and only counts as seen", async () => {
    for (const stored of ["verified", "not_applicable"] as const) {
      prismaMock.conversationFinding.updateMany.mockClear()
      prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ id: "finding-1", fingerprint, status: "open", evidenceCheck: stored }))

      await expect(persistReview(tx, input([finding({ evidenceCheck: "unverified", claim: "A paraphrase." })]))).resolves.toEqual({
        inserted: 0,
        updated: 1,
        suppressed: 0,
      })

      expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledTimes(1)
      expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
        where: { id: "finding-1", status: "open" },
        data: { reviewId: "review-2", seenCount: { increment: 1 }, lastSeenAt: expect.any(Date) },
      })
    }
  })

  it("an unverified repeat of an unverified open finding takes the new evidence", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ id: "finding-1", fingerprint, status: "open", evidenceCheck: "unverified" }))

    await persistReview(tx, input([finding({ evidenceCheck: "unverified", claim: "A paraphrase." })]))

    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith({
      where: { id: "finding-1", status: "open" },
      data: expect.objectContaining({ claim: "A paraphrase.", evidenceCheck: "unverified" }),
    })
  })

  it("a prior open finding not returned this run stays open and unchanged", async () => {
    await expect(persistReview(tx, input([finding({ messageId: "message-3", messageIndex: 3 })]))).resolves.toEqual({
      inserted: 1,
      updated: 0,
      suppressed: 0,
    })

    // Only the new fingerprint is looked up; the prior row is never read or written
    expect(prismaMock.conversationFinding.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.conversationFinding.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId_fingerprint: { conversationId: "conversation-1", fingerprint: fingerprintOf(finding({ messageId: "message-3" })) } } }),
    )
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.update).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.deleteMany).not.toHaveBeenCalled()
  })

  it("fixed, false_alarm and wont_fix stay closed and count as seen", async () => {
    for (const status of ["fixed", "false_alarm", "wont_fix"] as const) {
      prismaMock.conversationFinding.updateMany.mockClear()
      prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ id: "finding-1", fingerprint, status }))

      await expect(persistReview(tx, input([finding()]))).resolves.toEqual({ inserted: 0, updated: 0, suppressed: 1 })

      expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledTimes(1)
      expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledWith(seenOnly("finding-1"))
    }
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
  })

  it("a finding triaged mid-run keeps its status", async () => {
    prismaMock.conversationFinding.findUnique.mockResolvedValue(buildConversationFinding({ id: "finding-1", fingerprint, status: "open" }))
    prismaMock.conversationFinding.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })

    await expect(persistReview(tx, input([finding()]))).resolves.toEqual({ inserted: 0, updated: 0, suppressed: 1 })

    expect(prismaMock.conversationFinding.updateMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: "finding-1", status: "open" } }))
    expect(prismaMock.conversationFinding.updateMany).toHaveBeenNthCalledWith(2, seenOnly("finding-1"))
    for (const [call] of prismaMock.conversationFinding.updateMany.mock.calls) expect(call.data).not.toHaveProperty("status")
  })

  it("never calls deleteMany", async () => {
    prismaMock.conversationFinding.findUnique
      .mockResolvedValueOnce(buildConversationFinding({ id: "finding-1", status: "open" }))
      .mockResolvedValueOnce(buildConversationFinding({ id: "finding-2", status: "fixed" }))
      .mockResolvedValueOnce(null)

    await expect(
      persistReview(
        tx,
        input([finding({ messageId: "message-1" }), finding({ messageId: "message-3", messageIndex: 3 }), finding({ messageId: "message-5", messageIndex: 5 })]),
      ),
    ).resolves.toEqual({ inserted: 1, updated: 1, suppressed: 1 })

    expect(prismaMock.conversationFinding.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.delete).not.toHaveBeenCalled()
  })

  it("throws ReviewSuperseded when the review is no longer running, or its runToken has moved on", async () => {
    prismaMock.conversationReview.updateMany.mockResolvedValue({ count: 0 })

    await expect(persistReview(tx, input([finding()]))).rejects.toBeInstanceOf(ReviewSuperseded)

    expect(prismaMock.conversationReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "review-2", status: "running", runToken: 3 } }))
    expect(prismaMock.conversationFinding.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
  })

  it("throws ReviewSuperseded and writes nothing when the conversation has ended", async () => {
    prismaMock.chatConversation.updateMany.mockResolvedValue({ count: 0 })

    await expect(persistReview(tx, input([finding()]))).rejects.toBeInstanceOf(ReviewSuperseded)

    expect(prismaMock.conversationReview.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.create).not.toHaveBeenCalled()
    expect(prismaMock.conversationFinding.updateMany).not.toHaveBeenCalled()
  })
})
