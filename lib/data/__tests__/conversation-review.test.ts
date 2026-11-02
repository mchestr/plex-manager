/**
 * @jest-environment node
 */

/**
 * One conversation's review and the Calls badges: admin only, each finding
 * with its stored message (never the tool log), unverified findings last, the
 * review's cost, whether a judge is configured and the conversation
 * reviewable, the badges' four states, and the read's audit against the
 * conversation's owner, which carries no finding text.
 */

import { mockReset } from "jest-mock-extended"

import { buildConversationFinding, buildConversationReview } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { selected } from "@/__tests__/helpers/prisma-select"
import { assertAdmin } from "@/lib/admin"
import { getConversationReview, reviewBadgesFor } from "@/lib/data/conversation-review"
import { REVIEWABLE_CONVERSATION } from "@/lib/judge/scope"
import { auditMemberRead } from "@/lib/security/audit-log"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditMemberRead: jest.fn() }))

const findingGroupBy = prismaMock.conversationFinding.groupBy as jest.Mock
const reviewGroupBy = prismaMock.conversationReview.groupBy as jest.Mock
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12))

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(auditMemberRead).mockReset().mockResolvedValue(undefined)
})

describe("getConversationReview", () => {
  const messages = [
    { id: "m1", role: "user", content: "How many libraries?", createdAt: at(1) },
    { id: "m2", role: "assistant", content: "Twelve.", createdAt: at(1) },
    { id: "m3", role: "user", content: "And users?", createdAt: at(2) },
    { id: "m4", role: "assistant", content: "Forty.", createdAt: at(2) },
  ] as const

  beforeEach(() => {
    prismaMock.chatConversation.findUnique.mockResolvedValue({ userId: "member-1" } as never)
    prismaMock.conversationReview.findFirst.mockResolvedValue(null)
    prismaMock.chatConversationMessage.findMany.mockImplementation(((args: { where: { id?: { in: string[] } } }) =>
      Promise.resolve(messages.filter((message) => !args.where.id || args.where.id.in.includes(message.id)))) as never)
    prismaMock.conversationFinding.findMany.mockResolvedValue([])
    prismaMock.chatConversationMessage.count.mockResolvedValue(0)
    prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "judge-1" } as never)
    prismaMock.chatConversation.findFirst.mockResolvedValue({ id: "conversation-1" } as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: null } } as never)
  })

  it("getConversationReview returns each finding's stored message without the tool log", async () => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([buildConversationFinding({ id: "f1", messageId: "m4", evidenceCheck: "verified" })])

    const { findings } = await getConversationReview("conversation-1")

    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toEqual({ index: 3, role: "assistant", content: "Forty." })
    const order = prismaMock.chatConversationMessage.findMany.mock.calls[0]?.[0]
    expect(order?.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }])
    for (const [args] of prismaMock.chatConversationMessage.findMany.mock.calls) expect(args?.select).not.toHaveProperty("toolLog")
  })

  it("getConversationReview returns unverified findings too, verified and not_applicable first", async () => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([
      buildConversationFinding({ id: "unverified", messageId: "m2", evidenceCheck: "unverified" }),
      buildConversationFinding({ id: "verified", messageId: "m4", evidenceCheck: "verified" }),
      buildConversationFinding({ id: "no-quote", messageId: "m2", evidenceCheck: "not_applicable", type: "misread_question" }),
    ])

    const { findings } = await getConversationReview("conversation-1")

    expect(findings.map((finding) => finding.id)).toEqual(["no-quote", "verified", "unverified"])
    expect(JSON.stringify(prismaMock.conversationFinding.findMany.mock.calls[0]?.[0]?.where)).not.toContain("evidenceCheck")
  })

  it("review cost sums the review's LLMUsage rows", async () => {
    const row = buildConversationReview({ id: "review-2", status: "done", model: "claude-opus-5-5", summary: "Two problems.", completedAt: at(3), reviewedThrough: at(2) })
    prismaMock.conversationReview.findFirst.mockImplementation(((args: { select?: Record<string, unknown> }) => Promise.resolve(selected(row, args.select))) as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _sum: { cost: 0.042 } } as never)

    const { review } = await getConversationReview("conversation-1")

    expect(prismaMock.lLMUsage.aggregate).toHaveBeenCalledWith({ where: { conversationReviewId: "review-2" }, _sum: { cost: true } })
    expect(review).toEqual({
      id: "review-2",
      status: "done",
      errorCode: null,
      trigger: "manual",
      model: "claude-opus-5-5",
      cost: 0.042,
      reviewedThrough: at(2),
      completedAt: at(3),
      summary: "Two problems.",
    })
    expect(JSON.stringify(prismaMock.conversationReview.findFirst.mock.calls[0]?.[0]?.orderBy)).toContain('"createdAt":"desc"')
  })

  it("gives no review and no cost read before the first review", async () => {
    const result = await getConversationReview("conversation-1")

    expect(result.review).toBeNull()
    expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
  })

  it("judgeConfigured is false without an active judge provider, and reviewable is false for a Discord or ended conversation", async () => {
    expect(await getConversationReview("conversation-1")).toMatchObject({ judgeConfigured: true, reviewable: true })

    prismaMock.lLMProvider.findFirst.mockResolvedValue(null)
    prismaMock.chatConversation.findFirst.mockResolvedValue(null)
    expect(await getConversationReview("conversation-1")).toMatchObject({ judgeConfigured: false, reviewable: false })

    expect(prismaMock.lLMProvider.findFirst).toHaveBeenCalledWith({ where: { isActive: true, purpose: "judge" }, select: { id: true } })
    expect(prismaMock.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: "conversation-1", ...REVIEWABLE_CONVERSATION }, select: { id: true } })
  })

  it("has tool evidence when an assistant message has a tool log, an empty one included", async () => {
    expect((await getConversationReview("conversation-1")).hasToolEvidence).toBe(false)

    prismaMock.chatConversationMessage.count.mockResolvedValue(1)
    expect((await getConversationReview("conversation-1")).hasToolEvidence).toBe(true)
    expect(prismaMock.chatConversationMessage.count).toHaveBeenCalledWith({ where: { conversationId: "conversation-1", role: "assistant", toolLog: { not: null } } })
  })

  it("audits the read against the conversation's owner, with no finding text", async () => {
    prismaMock.conversationFinding.findMany.mockResolvedValue([
      buildConversationFinding({ messageId: "m4", evidenceCheck: "verified", claim: "CLAIM-TEXT", evidence: "EVIDENCE-TEXT", suggestion: "SUGGESTION-TEXT", note: "NOTE-TEXT" }),
    ])

    await getConversationReview("conversation-1")

    expect(prismaMock.chatConversation.findUnique).toHaveBeenCalledWith({ where: { id: "conversation-1" }, select: { userId: true } })
    expect(auditMemberRead).toHaveBeenCalledTimes(1)
    expect(auditMemberRead).toHaveBeenCalledWith("conversation-review", "member-1", "admin-1")
    const audited = JSON.stringify(jest.mocked(auditMemberRead).mock.calls)
    for (const text of ["CLAIM-TEXT", "EVIDENCE-TEXT", "SUGGESTION-TEXT", "NOTE-TEXT", "Forty."]) expect(audited).not.toContain(text)
  })

  it("audits nothing when there is no finding and no review summary to show", async () => {
    await getConversationReview("conversation-1")

    prismaMock.conversationReview.findFirst.mockResolvedValue({
      id: "review-1", status: "running", errorCode: null, trigger: "manual", model: null, reviewedThrough: null, completedAt: null, summary: null,
    } as never)
    await getConversationReview("conversation-1")

    expect(auditMemberRead).not.toHaveBeenCalled()
  })

  it("audits a review's summary even when it raised no finding", async () => {
    prismaMock.conversationReview.findFirst.mockResolvedValue({
      id: "review-1", status: "done", errorCode: null, trigger: "manual", model: "judge-model", reviewedThrough: at(2), completedAt: at(2), summary: "SUMMARY-TEXT",
    } as never)

    await getConversationReview("conversation-1")

    expect(auditMemberRead).toHaveBeenCalledWith("conversation-review", "member-1", "admin-1")
    expect(JSON.stringify(jest.mocked(auditMemberRead).mock.calls)).not.toContain("SUMMARY-TEXT")
  })

  it("audits nothing for a conversation that does not exist", async () => {
    prismaMock.chatConversation.findUnique.mockResolvedValue(null)

    await getConversationReview("missing")

    expect(auditMemberRead).not.toHaveBeenCalled()
  })
})

describe("reviewBadgesFor", () => {
  it("reviewBadgesFor gives none, clean, open and unverified_only", async () => {
    reviewGroupBy.mockResolvedValue([{ conversationId: "clean" }, { conversationId: "open" }, { conversationId: "unverified" }])
    findingGroupBy.mockResolvedValue([
      { conversationId: "open", evidenceCheck: "verified", _count: { _all: 2 } },
      { conversationId: "open", evidenceCheck: "not_applicable", _count: { _all: 1 } },
      { conversationId: "open", evidenceCheck: "unverified", _count: { _all: 5 } },
      { conversationId: "unverified", evidenceCheck: "unverified", _count: { _all: 2 } },
    ])

    const badges = await reviewBadgesFor(["none", "clean", "open", "unverified"])

    expect(Object.fromEntries(badges)).toEqual({
      none: { state: "none", open: 0 },
      clean: { state: "clean", open: 0 },
      open: { state: "open", open: 3 },
      unverified: { state: "unverified_only", open: 0 },
    })
    const reviewArgs = reviewGroupBy.mock.calls[0]?.[0]
    expect(reviewArgs?.where).toEqual({ conversationId: { in: ["none", "clean", "open", "unverified"] }, status: "done" })
    expect(JSON.stringify(findingGroupBy.mock.calls[0]?.[0]?.where)).toContain('"status":"open"')
  })

  it("reads nothing for no conversations", async () => {
    expect((await reviewBadgesFor([])).size).toBe(0)
    expect(reviewGroupBy).not.toHaveBeenCalled()
  })
})

describe("the admin check", () => {
  it("assertAdmin is called", async () => {
    const forbidden = new Error("PM_FORBIDDEN")
    jest.mocked(assertAdmin).mockRejectedValue(forbidden)

    await expect(getConversationReview("conversation-1")).rejects.toBe(forbidden)
    await expect(reviewBadgesFor(["conversation-1"])).rejects.toBe(forbidden)

    expect(assertAdmin).toHaveBeenCalledTimes(2)
    expect(prismaMock.conversationFinding.findMany).not.toHaveBeenCalled()
    expect(prismaMock.conversationReview.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.chatConversation.findUnique).not.toHaveBeenCalled()
    expect(reviewGroupBy).not.toHaveBeenCalled()
    expect(findingGroupBy).not.toHaveBeenCalled()
    expect(auditMemberRead).not.toHaveBeenCalled()
  })
})
