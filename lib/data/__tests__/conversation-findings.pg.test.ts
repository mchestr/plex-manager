/**
 * @jest-environment node
 */

/**
 * The stat tiles and the grouped backlog on PostgreSQL (spec section 2:
 * "Open, Fixed (in range) and False alarm rate"): Open is the whole open
 * backlog whatever the range, Fixed and the false alarm rate go by the triage
 * date, the groups count open findings whatever the status filter, and
 * unverified findings count nowhere.
 *
 * Gated by `describePg` and run only by `npm run test:integration`. Every
 * finding carries this run's tool name and every read filters on it, so other
 * suites' rows in the shared database never count.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { findingStats, groupFindings } from "@/lib/data/conversation-findings"
import { PrismaClient, type Prisma } from "@/lib/generated/prisma/client"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn().mockResolvedValue({ user: { id: "admin-1" } }) }))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))

const RUN = `findings-pg-${randomUUID().slice(0, 8)}`
const ZONE = "UTC"
const OCTOBER = { from: "2026-10-01", to: "2026-10-31" }
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)

describePg("finding stats and groups", (databaseUrl) => {
  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await mockDb.user.create({ data: { id: RUN } })
    const conversations = await Promise.all(
      ["a", "b"].map((name) => mockDb.chatConversation.create({ data: { id: `${RUN}-${name}`, userId: RUN, lastMessageAt: new Date() }, select: { id: true } }))
    )
    const [first, second] = conversations.map((row) => row.id) as [string, string]
    const reviews = await Promise.all(
      [first, second].map((conversationId) => mockDb.conversationReview.create({ data: { conversationId, trigger: "manual", status: "done" }, select: { id: true, conversationId: true } }))
    )
    const reviewOf = new Map(reviews.map((review) => [review.conversationId, review.id]))

    let n = 0
    const finding = (data: Partial<Prisma.ConversationFindingUncheckedCreateInput> & { createdAt: Date }): Prisma.ConversationFindingUncheckedCreateInput => {
      n += 1
      const conversationId = data.conversationId ?? first
      return {
        reviewId: reviewOf.get(conversationId) ?? "",
        conversationId,
        type: "wrong_fact",
        severity: "high",
        claim: "claim",
        evidence: "evidence",
        suggestion: "suggestion",
        tool: RUN,
        evidenceSource: "tool_result",
        evidenceCheck: "verified",
        fingerprint: `${RUN}-${n}`,
        ...data,
      }
    }
    await mockDb.conversationFinding.createMany({
      data: [
        // Created before October and fixed in it: Fixed
        finding({ createdAt: day("2026-09-15"), status: "fixed", triagedAt: day("2026-10-10") }),
        finding({ createdAt: day("2026-07-01"), status: "fixed", triagedAt: day("2026-10-02") }),
        // Created in October and fixed after it: not Fixed
        finding({ createdAt: day("2026-10-05"), status: "fixed", triagedAt: day("2026-11-05") }),
        finding({ createdAt: day("2026-10-06"), status: "false_alarm", triagedAt: day("2026-10-20") }),
        finding({ createdAt: day("2026-10-07"), status: "wont_fix", triagedAt: day("2026-10-21") }),
        // Open before the range and in it: both Open
        finding({ createdAt: day("2026-08-01") }),
        finding({ createdAt: day("2026-10-10") }),
        // Unverified: never counted
        finding({ createdAt: day("2026-10-10"), evidenceCheck: "unverified" }),
        finding({ createdAt: day("2026-09-01"), status: "false_alarm", triagedAt: day("2026-10-15"), evidenceCheck: "unverified" }),
        // Another severity, in the second conversation
        finding({ createdAt: day("2026-10-11"), severity: "low", conversationId: second }),
      ],
    })
  })

  afterAll(async () => {
    await mockDb.user.deleteMany({ where: { id: RUN } })
    await mockDb.$disconnect()
  })

  it("Open counts the whole backlog, Fixed and the false alarm rate go by triagedAt in the range", async () => {
    // The status filter never applies to the tiles
    expect(await findingStats({ tool: RUN, severity: "high", status: "open", range: OCTOBER }, ZONE)).toEqual({ open: 2, fixed: 2, falseAlarmRate: 1 / 4 })
  })

  it("counts every triage without a range, and none in a range with no triage", async () => {
    expect(await findingStats({ tool: RUN, severity: "high" }, ZONE)).toEqual({ open: 2, fixed: 3, falseAlarmRate: 1 / 5 })
    expect(await findingStats({ tool: RUN, severity: "high", range: { from: "2027-01-01", to: "2027-01-31" } }, ZONE)).toEqual({ open: 2, fixed: 0, falseAlarmRate: null })
  })

  it("groups the open findings whatever the status filter, by distinct conversations", async () => {
    expect(await groupFindings({ tool: RUN, status: "fixed" }, ZONE)).toEqual([
      { type: "wrong_fact", tool: RUN, open: 3, conversations: 2, latest: day("2026-10-11") },
    ])
    expect(await groupFindings({ tool: RUN, severity: "high", range: OCTOBER }, ZONE)).toEqual([
      { type: "wrong_fact", tool: RUN, open: 1, conversations: 1, latest: day("2026-10-10") },
    ])
  })
})
