/**
 * @jest-environment node
 */

/**
 * The assistant page's stored history on PostgreSQL, through the app's
 * client: a turn's title and messages are encrypted in the tables and read
 * back as the next turn's context, deleting a conversation removes its history
 * but keeps the row and its usage link (which the spend caps count), and a turn
 * for a conversation that ended meanwhile stores nothing.
 *
 * Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomBytes, randomUUID } from "node:crypto"

import { describePg } from "@/test/helpers/integration"

const RUN = `history-${randomUUID().slice(0, 8)}`
const USER = `${RUN}-user`

describePg("the assistant page history on PostgreSQL", (databaseUrl) => {
  let prisma: typeof import("@/lib/prisma").prisma
  let history: typeof import("@/lib/chatbot/history")

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.ENCRYPTION_KEYS = `k1:${randomBytes(32).toString("base64")}`
    jest.resetModules()
    prisma = require("@/lib/prisma").prisma
    history = require("@/lib/chatbot/history")
    await prisma.user.create({ data: { id: USER, name: RUN } })
  })

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: USER } })
    await prisma.$disconnect()
  })

  it("stores a turn encrypted and reads it back as the next turn's context", async () => {
    const conversation = await prisma.chatConversation.create({ data: { userId: USER } })
    const answeredAt = Date.now()

    const stored = await history.saveTurn({
      conversationId: conversation.id,
      question: { content: "Why is Plex buffering?", at: new Date(answeredAt - 5000) },
      answer: {
        role: "assistant",
        content: "It is transcoding.",
        timestamp: answeredAt,
        sources: [{ tool: "get_plex_sessions", description: "Plex sessions" }],
      },
      title: "Why is Plex buffering?",
    })

    expect(stored).toBe(true)
    const [raw] = await prisma.$queryRaw<Array<{ title: string }>>`SELECT "title" FROM "ChatConversation" WHERE id = ${conversation.id}`
    const rawMessages = await prisma.$queryRaw<Array<{ content: string }>>`SELECT "content" FROM "ChatConversationMessage" WHERE "conversationId" = ${conversation.id}`
    expect(raw.title).toMatch(/^enc:v2:k1:/)
    expect(rawMessages.map((message) => message.content)).toEqual([expect.stringMatching(/^enc:v2:k1:/), expect.stringMatching(/^enc:v2:k1:/)])
    expect(JSON.stringify([raw, rawMessages])).not.toMatch(/buffering|transcoding/)

    const context = await history.contextFor(conversation.id, { role: "user", content: "Still?", timestamp: Date.now() })
    expect(context.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "user", content: "Why is Plex buffering?" },
      { role: "assistant", content: "It is transcoding." },
      { role: "user", content: "Still?" },
    ])
    expect(context[1].sources).toEqual([{ tool: "get_plex_sessions", description: "Plex sessions" }])
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversation.id } })).title).toBe("Why is Plex buffering?")
  })

  it("ends a deleted conversation, removes its history and keeps its usage link", async () => {
    const conversation = await prisma.chatConversation.create({
      data: { userId: USER, title: "Is Sonarr up?", lastMessageAt: new Date(), messages: { create: [{ role: "user", content: "Is Sonarr up?" }] } },
    })
    const usage = await prisma.lLMUsage.create({
      data: { userId: USER, chatConversationId: conversation.id, provider: "openai", promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.1 },
    })

    expect(await history.endConversation(`${RUN}-someone-else`, conversation.id)).toBe(false)
    expect(await history.endConversation(USER, conversation.id)).toBe(true)
    expect(await history.endConversation(USER, conversation.id)).toBe(false)

    expect(
      await prisma.chatConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        select: { endedAt: true, title: true, _count: { select: { messages: true } } },
      })
    ).toEqual({ endedAt: expect.any(Date), title: null, _count: { messages: 0 } })
    expect((await prisma.lLMUsage.findUniqueOrThrow({ where: { id: usage.id } })).chatConversationId).toBe(conversation.id)
  })

  it("stores nothing for a conversation that ended while the answer was written", async () => {
    const conversation = await prisma.chatConversation.create({ data: { userId: USER, endedAt: new Date() } })

    const stored = await history.saveTurn({
      conversationId: conversation.id,
      question: { content: "q", at: new Date() },
      answer: { role: "assistant", content: "a", timestamp: Date.now() },
    })

    expect(stored).toBe(false)
    expect(await prisma.chatConversationMessage.count({ where: { conversationId: conversation.id } })).toBe(0)
  })
})
