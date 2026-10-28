/**
 * @jest-environment node
 */

/**
 * The assistant page's stored history on PostgreSQL, through the app's
 * client: a turn's title and messages are encrypted in the tables and read
 * back as the next turn's context (text that looks encrypted reads back as
 * typed), two tabs' turns stored at once keep each
 * question beside its answer, deleting a conversation (or demoting its admin)
 * removes its history
 * but keeps the row and its usage link (which the spend caps count), and a turn
 * for a conversation that ended meanwhile stores nothing.
 *
 * Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomBytes, randomUUID } from "node:crypto"

import { describePg } from "@/__tests__/helpers/integration"

const RUN = `history-${randomUUID().slice(0, 8)}`
const USER = `${RUN}-user`

describePg("the assistant page history on PostgreSQL", (databaseUrl) => {
  let prisma: typeof import("@/lib/prisma").prisma
  let history: typeof import("@/lib/chatbot/history")
  let crypto: typeof import("@/lib/security/crypto")

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.ENCRYPTION_KEYS = `k1:${randomBytes(32).toString("base64")}`
    jest.resetModules()
    prisma = require("@/lib/prisma").prisma
    history = require("@/lib/chatbot/history")
    crypto = require("@/lib/security/crypto")
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

  it("reads a message pasted as a stored secret's ciphertext back as typed, never as the secret", async () => {
    const conversation = await prisma.chatConversation.create({ data: { userId: USER } })
    const pasted = crypto.encryptSecret("sk_live_secret")

    await history.saveTurn({
      conversationId: conversation.id,
      question: { content: pasted, at: new Date(Date.now() - 1000) },
      answer: { role: "assistant", content: pasted, timestamp: Date.now() },
      title: pasted,
    })

    const context = await history.contextFor(conversation.id, { role: "user", content: "next", timestamp: Date.now() })
    expect(context.map((message) => message.content)).toEqual([pasted, pasted, "next"])
    expect((await prisma.chatConversation.findUniqueOrThrow({ where: { id: conversation.id } })).title).toBe(pasted)
  })

  it("keeps each question beside its answer when two tabs' turns are stored at once", async () => {
    const conversation = await prisma.chatConversation.create({ data: { userId: USER } })
    const t = Date.now()
    const turn = (question: string, askedAt: number, answer: string, answeredAt: number) =>
      history.saveTurn({
        conversationId: conversation.id,
        question: { content: question, at: new Date(askedAt) },
        answer: { role: "assistant", content: answer, timestamp: answeredAt },
      })

    // Asked a second apart in two tabs; each answer came after both questions
    await Promise.all([turn("Is Plex up?", t, "Plex is up.", t + 8000), turn("Is Sonarr up?", t + 1000, "Sonarr is up.", t + 9000)])

    const rows = await prisma.chatConversationMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { content: true },
    })
    // Either turn can take the lock first
    expect([
      ["Is Plex up?", "Plex is up.", "Is Sonarr up?", "Sonarr is up."],
      ["Is Sonarr up?", "Sonarr is up.", "Is Plex up?", "Plex is up."],
    ]).toContainEqual(rows.map((row) => row.content))
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

  it("ends all of a demoted admin's page conversations, and no Discord or other user's conversation", async () => {
    const demoted = `${RUN}-demoted`
    await prisma.user.create({ data: { id: demoted, name: demoted } })
    const withHistory = { title: "Who has an invite?", lastMessageAt: new Date(), messages: { create: [{ role: "user" as const, content: "Who has an invite?" }] } }
    const page = await prisma.chatConversation.create({ data: { userId: demoted, ...withHistory } })
    const discord = await prisma.chatConversation.create({ data: { userId: demoted } })
    await prisma.discordChatSession.create({ data: { discordUserId: `${RUN}-discord`, discordChannelId: `${RUN}-dm`, chatConversationId: discord.id, messages: [] } })
    const others = await prisma.chatConversation.create({ data: { userId: USER, ...withHistory } })

    expect(await prisma.$transaction((tx) => history.endConversationsOf(tx, demoted))).toBe(1)

    const state = (id: string) =>
      prisma.chatConversation.findUniqueOrThrow({ where: { id }, select: { endedAt: true, title: true, _count: { select: { messages: true } } } })
    expect(await state(page.id)).toEqual({ endedAt: expect.any(Date), title: null, _count: { messages: 0 } })
    expect((await state(discord.id)).endedAt).toBeNull()
    expect(await state(others.id)).toEqual({ endedAt: null, title: "Who has an invite?", _count: { messages: 1 } })
    await prisma.user.delete({ where: { id: demoted } })
  })

  it("stores an admin's turn only while they are still an admin", async () => {
    const former = `${RUN}-former-admin`
    await prisma.user.create({ data: { id: former, name: former, isAdmin: false, role: "support" } })
    const conversation = await prisma.chatConversation.create({ data: { userId: former } })
    const turn = (asAdmin: boolean) =>
      history.saveTurn({
        conversationId: conversation.id,
        question: { content: "Which invite codes are active?", at: new Date() },
        answer: { role: "assistant", content: "Active invite codes: ...", timestamp: Date.now() },
        asAdmin,
      })

    // Their session still said admin when the turn started, the demotion has committed since
    expect(await turn(true)).toBe(false)
    expect(await prisma.chatConversationMessage.count({ where: { conversationId: conversation.id } })).toBe(0)
    // A turn they start as Support is theirs to keep
    expect(await turn(false)).toBe(true)
    await prisma.user.delete({ where: { id: former } })
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
