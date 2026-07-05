/**
 * Tests for lib/discord/chat-session.ts - concurrency-safe session persistence.
 *
 * The prisma mock is transactional: `$transaction(fn)` invokes `fn(tx)` against
 * an in-memory store, so two overlapping calls exercise the real read → decide →
 * write ordering the transaction is meant to serialize.
 */

import {
  getOrCreateSession,
  appendTurn,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/lib/discord/chat-session"
import { prisma } from "@/lib/prisma"
import { type ChatMessage } from "@/actions/chatbot/types"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

// In-memory store shared by the transactional prisma mock.
interface SessionRow {
  id: string
  discordUserId: string
  discordChannelId: string
  chatConversationId: string
  messages: unknown
  isActive: boolean
  lastMessageAt: Date
}

let sessions: SessionRow[]
let conversationCounter: number
let sessionCounter: number

const createSpy = jest.fn()
const upsertSpy = jest.fn()

function findSession(where: {
  id?: string
  discordUserId_discordChannelId?: { discordUserId: string; discordChannelId: string }
}): SessionRow | undefined {
  if (where.id) {
    return sessions.find((s) => s.id === where.id)
  }
  const key = where.discordUserId_discordChannelId
  return sessions.find(
    (s) => s.discordUserId === key?.discordUserId && s.discordChannelId === key?.discordChannelId
  )
}

// A `tx`/`prisma`-shaped facade over the shared in-memory store.
const store = {
  chatConversation: {
    create: (args: { data: { userId: string } }) => {
      createSpy(args)
      conversationCounter += 1
      return Promise.resolve({ id: `conversation-${conversationCounter}`, userId: args.data.userId })
    },
  },
  discordChatSession: {
    findUnique: (args: { where: Parameters<typeof findSession>[0] }) =>
      Promise.resolve(findSession(args.where) ?? null),
    upsert: (args: {
      where: Parameters<typeof findSession>[0]
      update: Partial<SessionRow>
      create: Omit<SessionRow, "id">
    }) => {
      upsertSpy(args)
      const existing = findSession(args.where)
      if (existing) {
        Object.assign(existing, args.update)
        return Promise.resolve(existing)
      }
      sessionCounter += 1
      const row: SessionRow = {
        id: `session-${sessionCounter}`,
        isActive: true,
        lastMessageAt: new Date(),
        ...args.create,
      }
      sessions.push(row)
      return Promise.resolve(row)
    },
    update: (args: { where: { id: string }; data: Partial<SessionRow> }) => {
      const row = findSession(args.where)
      if (!row) throw new Error("session not found")
      Object.assign(row, args.data)
      return Promise.resolve(row)
    },
  },
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    // Default: run the callback immediately against the shared store.
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(store)),
  },
}))

const mockPrisma = prisma as unknown as { $transaction: jest.Mock }

beforeEach(() => {
  sessions = []
  conversationCounter = 0
  sessionCounter = 0
  createSpy.mockClear()
  upsertSpy.mockClear()
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(store))
})

describe("getOrCreateSession", () => {
  const params = { discordUserId: "discord-1", channelId: "channel-1", userId: "user-1" }

  it("creates a conversation and session when none exists", async () => {
    const result = await getOrCreateSession(params)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.chatConversationId).toBe("conversation-1")
    expect(result.history).toEqual([])
    expect(sessions).toHaveLength(1)
  })

  it("reuses an active, non-idle session without creating a conversation", async () => {
    sessions.push({
      id: "session-existing",
      discordUserId: "discord-1",
      discordChannelId: "channel-1",
      chatConversationId: "conversation-existing",
      messages: [{ role: "user", content: "hi", timestamp: 1 }],
      isActive: true,
      lastMessageAt: new Date(),
    })

    const result = await getOrCreateSession(params)

    expect(createSpy).not.toHaveBeenCalled()
    expect(result.id).toBe("session-existing")
    expect(result.chatConversationId).toBe("conversation-existing")
    expect(result.history).toEqual([
      { role: "user", content: "hi", timestamp: 1, sources: undefined },
    ])
  })

  it("resets an idle-expired session (new conversation, cleared history)", async () => {
    sessions.push({
      id: "session-old",
      discordUserId: "discord-1",
      discordChannelId: "channel-1",
      chatConversationId: "conversation-old",
      messages: [{ role: "user", content: "stale", timestamp: 1 }],
      isActive: true,
      lastMessageAt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000),
    })

    const result = await getOrCreateSession(params)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.chatConversationId).toBe("conversation-1")
    expect(result.history).toEqual([])
    // The unique tuple means the row was reset in place, not duplicated.
    expect(sessions).toHaveLength(1)
    expect(sessions[0].chatConversationId).toBe("conversation-1")
  })

  it("resets a session that is inactive even if recently used", async () => {
    sessions.push({
      id: "session-inactive",
      discordUserId: "discord-1",
      discordChannelId: "channel-1",
      chatConversationId: "conversation-inactive",
      messages: [],
      isActive: false,
      lastMessageAt: new Date(),
    })

    const result = await getOrCreateSession(params)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.chatConversationId).toBe("conversation-1")
  })

  it("does NOT create duplicate conversations under concurrency", async () => {
    // Serialize the two transactions: the second runs only after the first
    // commits (the guarantee Serializable isolation provides). Because the
    // unique tuple ensures a single row, the second call sees the fresh session
    // and creates nothing.
    let previous: Promise<unknown> = Promise.resolve()
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const run = previous.then(() => fn(store))
      previous = run.catch(() => undefined)
      return run
    })

    const [a, b] = await Promise.all([
      getOrCreateSession(params),
      getOrCreateSession(params),
    ])

    // Exactly one conversation created; both callers share it; single row.
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(sessions).toHaveLength(1)
    expect(a.chatConversationId).toBe(b.chatConversationId)
  })
})

describe("appendTurn", () => {
  const userMessage: ChatMessage = { role: "user", content: "question", timestamp: 100 }
  const assistantMessage: ChatMessage = { role: "assistant", content: "answer", timestamp: 200 }

  beforeEach(() => {
    sessions.push({
      id: "session-1",
      discordUserId: "discord-1",
      discordChannelId: "channel-1",
      chatConversationId: "conversation-1",
      messages: [],
      isActive: true,
      lastMessageAt: new Date(0),
    })
  })

  it("appends the user and assistant turns to the current history", async () => {
    await appendTurn({
      sessionId: "session-1",
      userMessage,
      assistantMessage,
      chatConversationId: "conversation-1",
    })

    const row = sessions[0]
    expect(row.messages).toEqual([userMessage, assistantMessage])
    expect(row.isActive).toBe(true)
    expect(row.chatConversationId).toBe("conversation-1")
  })

  it("re-reads current history so a concurrently-added turn is not clobbered", async () => {
    // Simulate a concurrent turn that landed AFTER the caller's own history
    // snapshot but BEFORE this append commits. appendTurn must re-read it.
    sessions[0].messages = [
      { role: "user", content: "concurrent-q", timestamp: 50 },
      { role: "assistant", content: "concurrent-a", timestamp: 60 },
    ]

    await appendTurn({
      sessionId: "session-1",
      userMessage,
      assistantMessage,
      chatConversationId: "conversation-1",
    })

    const row = sessions[0]
    expect(row.messages).toEqual([
      { role: "user", content: "concurrent-q", timestamp: 50, sources: undefined },
      { role: "assistant", content: "concurrent-a", timestamp: 60, sources: undefined },
      userMessage,
      assistantMessage,
    ])
  })

  it("two overlapping appends both survive (neither turn is lost)", async () => {
    // Force strict serialization so the read-modify-write of each transaction
    // is atomic relative to the other.
    let previous: Promise<unknown> = Promise.resolve()
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const run = previous.then(() => fn(store))
      previous = run.catch(() => undefined)
      return run
    })

    const turnA = {
      sessionId: "session-1",
      userMessage: { role: "user" as const, content: "A-q", timestamp: 1 },
      assistantMessage: { role: "assistant" as const, content: "A-a", timestamp: 2 },
      chatConversationId: "conversation-1",
    }
    const turnB = {
      sessionId: "session-1",
      userMessage: { role: "user" as const, content: "B-q", timestamp: 3 },
      assistantMessage: { role: "assistant" as const, content: "B-a", timestamp: 4 },
      chatConversationId: "conversation-1",
    }

    await Promise.all([appendTurn(turnA), appendTurn(turnB)])

    const contents = (sessions[0].messages as ChatMessage[]).map((m) => m.content)
    expect(contents).toEqual(["A-q", "A-a", "B-q", "B-a"])
  })

  it("trims to the history limit, keeping the most recent turns", async () => {
    // Pre-fill with 12 entries (HISTORY_LIMIT); adding 2 more should trim 2 off the front.
    sessions[0].messages = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `old-${i}`,
      timestamp: i,
    }))

    await appendTurn({
      sessionId: "session-1",
      userMessage,
      assistantMessage,
      chatConversationId: "conversation-1",
    })

    const messages = sessions[0].messages as ChatMessage[]
    expect(messages).toHaveLength(12)
    expect(messages[messages.length - 2]).toEqual(userMessage)
    expect(messages[messages.length - 1]).toEqual(assistantMessage)
    // The two oldest (old-0, old-1) were dropped.
    expect(messages[0].content).toBe("old-2")
  })
})
