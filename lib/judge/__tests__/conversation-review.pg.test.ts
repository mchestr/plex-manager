/**
 * @jest-environment node
 */

/**
 * Conversation reviews as PostgreSQL runs them: `enqueueReview`'s row lock
 * under READ COMMITTED, where two concurrent calls would otherwise each see
 * no open review and each insert one.
 *
 * Gated by `describePg` (__tests__/helpers/integration.ts) and run only by
 * `npm run test:integration`. The suite only touches rows under its own run
 * prefix, plus the active `judge` provider row it adds when none exists.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { describePg } from "@/__tests__/helpers/integration"
import { PrismaClient } from "@/lib/generated/prisma/client"
import { enqueueReview } from "@/lib/judge/enqueue"

let mockDb: PrismaClient | null = null
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))

const RUN = `judge-${randomUUID()}`

describePg("conversation reviews on PostgreSQL", (databaseUrl) => {
  let db: PrismaClient
  let addedProviderId: string | null = null
  let n = 0

  /** An open admin assistant conversation owned by a new user. */
  async function conversation(): Promise<string> {
    n += 1
    const userId = `${RUN}-${n}`
    await db.user.create({ data: { id: userId } })
    const row = await db.chatConversation.create({ data: { userId, lastMessageAt: new Date() }, select: { id: true } })
    return row.id
  }

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    mockDb = db
    const active = await db.lLMProvider.findFirst({ where: { isActive: true, purpose: "judge" }, select: { id: true } })
    if (!active) {
      const added = await db.lLMProvider.create({
        data: { provider: "openai", purpose: "judge", apiKey: "test-key", model: "gpt-6-luna", isActive: true },
        select: { id: true },
      })
      addedProviderId = added.id
    }
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { startsWith: RUN } } })
    if (addedProviderId) await db.lLMProvider.delete({ where: { id: addedProviderId } })
    await db.$disconnect()
  })

  it("two concurrent enqueueReview calls on one conversation create exactly one review", async () => {
    // A few rounds, so the race is not won by timing alone
    for (let round = 0; round < 5; round += 1) {
      const conversationId = await conversation()
      const enqueue = jest.fn(async (_data: { reviewId: string }) => ({ ok: true as const }))
      const deps = { enqueue, getJobState: async () => null }
      const input = { conversationId, trigger: "manual" as const, requestedById: null }

      const results = await Promise.all([enqueueReview(input, deps), enqueueReview(input, deps)])

      const reviews = await db.conversationReview.findMany({ where: { conversationId }, select: { id: true, status: true } })
      expect(reviews).toEqual([{ id: expect.any(String), status: "queued" }])
      const [review] = reviews
      expect(results).toEqual(
        expect.arrayContaining([
          { ok: true, reviewId: review?.id, status: "queued", created: true },
          { ok: true, reviewId: review?.id, status: "queued", created: false },
        ])
      )
      expect(enqueue).toHaveBeenCalledTimes(1)
      expect(enqueue).toHaveBeenCalledWith({ reviewId: review?.id })
    }
  })
})
