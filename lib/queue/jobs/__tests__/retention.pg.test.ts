/**
 * @jest-environment node
 */

/**
 * The retention sweep on PostgreSQL (P11.14): rows seeded either side of
 * every window; the first run reports exactly the rows past their window, the
 * second reports zeros; Rewind and assistant LLM text are split correctly; and
 * audit rows at 399 days stay while those at 401 go. Affiliate applications
 * and unused affiliate invites go after 365 days; admin invites and used
 * affiliate invites stay, and expired affiliate invites lose their label.
 *
 * The sweep reads the whole database, so a first run at the suite's clock
 * clears whatever earlier suites left behind before the fixture is seeded.
 * Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomUUID } from "node:crypto"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { runRetentionSweep } from "@/lib/queue/jobs/retention"
import { describePg } from "@/__tests__/helpers/integration"

let mockDb: PrismaClient
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `p1114-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const DISCORD = `${RUN}-discord`
const NOW = new Date("2027-07-15T03:30:00Z")
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)
const signal = new AbortController().signal

const usage = { userId: MEMBER, provider: "openai", promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.25, prompt: "p", response: "r" }

async function seed(db: PrismaClient) {
  await db.user.create({ data: { id: MEMBER, name: RUN } })
  const wrapped = await db.plexWrapped.create({ data: { userId: MEMBER, year: 2026, data: "{}", status: "completed" } })
  const generation = await db.rewindGeneration.create({
    data: { wrappedId: wrapped.id, userId: MEMBER, year: 2026, kind: "season", status: "completed", previousData: "{}" },
  })

  // Rewind text: 120 days. Assistant text: 90 days.
  const live = await db.chatConversation.create({ data: { userId: MEMBER } })
  const rewind = {
    kept: await db.lLMUsage.create({ data: { ...usage, generationId: generation.id, createdAt: ago(119) } }),
    nulled: await db.lLMUsage.create({ data: { ...usage, wrappedId: wrapped.id, createdAt: ago(121) } }),
    keptAt100: await db.lLMUsage.create({ data: { ...usage, createdAt: ago(100) } }),
  }
  const assistant = {
    kept: await db.lLMUsage.create({ data: { ...usage, chatConversationId: live.id, createdAt: ago(89) } }),
    nulled: await db.lLMUsage.create({ data: { ...usage, chatConversationId: live.id, createdAt: ago(91) } }),
    nulledAt100: await db.lLMUsage.create({ data: { ...usage, chatConversationId: live.id, createdAt: ago(100) } }),
  }

  // Assistant page history: 90 days after the last message, then the conversation ends
  const idleChat = await db.chatConversation.create({
    data: {
      userId: MEMBER,
      title: "Why did Plex restart?",
      lastMessageAt: ago(91),
      messages: { create: [{ role: "user", content: "q", createdAt: ago(92) }, { role: "assistant", content: "a", createdAt: ago(91) }] },
    },
  })
  const recentChat = await db.chatConversation.create({
    data: { userId: MEMBER, title: "Is Sonarr up?", lastMessageAt: ago(89), messages: { create: [{ role: "user", content: "q" }] } },
  })
  // A first reply that failed stores no turn, so its conversation counts from when it started
  const neverAnswered = await db.chatConversation.create({ data: { userId: MEMBER, createdAt: ago(91) } })
  const justStarted = await db.chatConversation.create({ data: { userId: MEMBER, createdAt: ago(89) } })

  // Conversations: 180 days after they end
  const ended = await db.chatConversation.create({ data: { userId: MEMBER, endedAt: ago(181) } })
  const endedUsage = await db.lLMUsage.create({ data: { ...usage, chatConversationId: ended.id, createdAt: ago(200) } })
  const recentlyEnded = await db.chatConversation.create({ data: { userId: MEMBER, endedAt: ago(179) } })

  // Discord chats: turns emptied after 1 idle day, the session gone after 30
  const chatty = await db.discordChatSession.create({
    data: { discordUserId: DISCORD, discordChannelId: `${RUN}-a`, chatConversationId: live.id, messages: [{ role: "user", content: "hi" }], lastMessageAt: ago(2) },
  })
  const idleConversation = await db.chatConversation.create({ data: { userId: MEMBER } })
  await db.discordChatSession.create({
    data: { discordUserId: DISCORD, discordChannelId: `${RUN}-b`, chatConversationId: idleConversation.id, messages: [], lastMessageAt: ago(31) },
  })

  const log = { discordUserId: DISCORD, commandType: "CHAT" as const, commandName: "assistant", channelId: "c", channelType: "dm" }
  const argsLog = await db.discordCommandLog.create({ data: { ...log, commandArgs: "args", createdAt: ago(8) } })
  await db.discordCommandLog.create({ data: { ...log, createdAt: ago(91) } })

  const share = await db.rewindShare.create({
    data: { wrappedId: wrapped.id, tokenHash: `${RUN}-hash`, assetKey: `${RUN}-asset`, pages: [], cardFacts: {} },
  })
  await db.rewindShareVisitDay.create({ data: { shareId: share.id, day: ago(91), count: 2 } })
  await db.rewindShareVisitDay.create({ data: { shareId: share.id, day: ago(89), count: 1 } })
  await db.rewindView.create({ data: { wrappedId: wrapped.id, sessionKey: `${RUN}-old`, edition: "full", createdAt: ago(121) } })
  await db.rewindView.create({ data: { wrappedId: wrapped.id, sessionKey: `${RUN}-new`, edition: "full", createdAt: ago(119) } })

  const item = { userId: MEMBER, guid: "plex://movie/1", mediaType: "MOVIE" as const, title: "Title" }
  await db.watchlistSyncHistory.create({ data: { ...item, plexRatingKey: `${RUN}-1`, status: "REMOVED_FROM_WATCHLIST", syncedAt: ago(31) } })
  await db.watchlistSyncHistory.create({ data: { ...item, plexRatingKey: `${RUN}-2`, status: "REMOVED_FROM_WATCHLIST", syncedAt: ago(29) } })
  await db.watchlistSyncHistory.create({ data: { ...item, plexRatingKey: `${RUN}-3`, status: "REQUESTED", syncedAt: ago(60) } })

  await db.discordOAuthState.create({ data: { userId: MEMBER, state: `${RUN}-state`, codeVerifier: "v", expiresAt: ago(2) } })
  await db.discordPendingSelection.create({
    data: { discordUserId: DISCORD, channelId: "c", customId: `${RUN}-pick`, markType: "FINISHED_WATCHING", results: [], expiresAt: ago(0.01) },
  })

  // Affiliate rows: 365 days; an expired invite loses its label at once
  const application = { userId: MEMBER, hoursAtApply: 100 }
  await db.affiliateApplication.create({ data: { ...application, status: "REFUSED", appliedAt: ago(370), decidedAt: ago(366) } })
  await db.affiliateApplication.create({ data: { ...application, status: "REFUSED", appliedAt: ago(370), decidedAt: ago(364) } })
  await db.affiliateApplication.create({ data: { ...application, status: "ENDED", appliedAt: ago(500), endedAt: ago(364) } })
  await db.affiliateApplication.create({ data: { ...application, status: "APPROVED", openUserId: MEMBER, appliedAt: ago(500), decidedAt: ago(499) } })
  const affiliate = { kind: "AFFILIATE" as const, affiliateUserId: MEMBER, label: "For Sam" }
  await db.invite.create({ data: { ...affiliate, code: `${RUN}-expired-old`, expiresAt: ago(366) } })
  await db.invite.create({ data: { ...affiliate, code: `${RUN}-cancelled-old`, cancelledAt: ago(366), expiresAt: ago(364) } })
  await db.invite.create({ data: { ...affiliate, code: `${RUN}-expired`, expiresAt: ago(10) } })
  await db.invite.create({ data: { ...affiliate, code: `${RUN}-live`, expiresAt: ago(-1) } })
  await db.invite.create({ data: { ...affiliate, label: null, code: `${RUN}-used`, expiresAt: ago(400), useCount: 1, joinedAt: ago(401) } })
  await db.invite.create({ data: { code: `${RUN}-admin`, expiresAt: ago(400) } })

  await db.auditLog.create({ data: { type: "TEST", actorUserId: RUN, createdAt: ago(399) } })
  await db.auditLog.create({ data: { type: "TEST", actorUserId: RUN, createdAt: ago(401) } })

  return {
    generation,
    rewind,
    assistant,
    idleChat,
    recentChat,
    neverAnswered,
    justStarted,
    ended,
    endedUsage,
    recentlyEnded,
    chatty,
    idleConversation,
    argsLog,
  }
}

describePg("the retention sweep on PostgreSQL", (databaseUrl) => {
  let fixture: Awaited<ReturnType<typeof seed>>

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    await runRetentionSweep({ now: NOW, signal })
    fixture = await seed(mockDb)
  })

  afterAll(async () => {
    await mockDb.auditLog.deleteMany({ where: { actorUserId: RUN } })
    await mockDb.discordCommandLog.deleteMany({ where: { discordUserId: DISCORD } })
    await mockDb.discordChatSession.deleteMany({ where: { discordUserId: DISCORD } })
    await mockDb.discordPendingSelection.deleteMany({ where: { discordUserId: DISCORD } })
    await mockDb.invite.deleteMany({ where: { code: { startsWith: RUN } } })
    await mockDb.user.deleteMany({ where: { id: MEMBER } })
    await mockDb.$disconnect()
  })

  it("reports the rows past their windows, then zeros on a second run", async () => {
    const first = await runRetentionSweep({ now: NOW, signal, batchSize: 1 })

    expect(first.aborted).toBe(false)
    expect(first.counts).toEqual({
      rewindLlmText: 1,
      assistantLlmText: 3,
      assistantChats: 2,
      chatConversations: 1,
      discordChatMessages: 1,
      discordChatSessions: 1,
      discordCommandArgs: 1,
      discordCommandLog: 1,
      shareVisitDays: 1,
      rewindViews: 1,
      watchlistRemoved: 1,
      discordOAuthStates: 1,
      discordPendingSelections: 1,
      rewindPreviousData: 1,
      auditLog: 1,
      affiliateApplications: 1,
      affiliateInvites: 2,
      affiliateInviteLabels: 1,
    })

    const second = await runRetentionSweep({ now: NOW, signal })
    expect(Object.values(second.counts).every((count) => count === 0)).toBe(true)

    const config = await mockDb.config.findUnique({ where: { id: "config" } })
    expect(config?.lastRetentionRunAt).toBeInstanceOf(Date)
    expect(config?.lastRetentionSummary).toEqual(second.counts)
  })

  it("splits Rewind and assistant text, keeping tokens and cost", async () => {
    const text = async (id: string) =>
      mockDb.lLMUsage.findUniqueOrThrow({ where: { id }, select: { prompt: true, response: true, cost: true, totalTokens: true } })

    expect(await text(fixture.rewind.kept.id)).toMatchObject({ prompt: "p", response: "r" })
    expect(await text(fixture.rewind.keptAt100.id)).toMatchObject({ prompt: "p", response: "r" })
    expect(await text(fixture.rewind.nulled.id)).toEqual({ prompt: null, response: null, cost: 0.25, totalTokens: 2 })
    expect(await text(fixture.assistant.kept.id)).toMatchObject({ prompt: "p", response: "r" })
    expect(await text(fixture.assistant.nulled.id)).toMatchObject({ prompt: null, response: null })
    expect(await text(fixture.assistant.nulledAt100.id)).toMatchObject({ prompt: null, response: null })
  })

  it("ends assistant page conversations idle past 90 days, removing their title and messages", async () => {
    const conversation = (id: string) =>
      mockDb.chatConversation.findUniqueOrThrow({ where: { id }, select: { endedAt: true, title: true, _count: { select: { messages: true } } } })

    expect(await conversation(fixture.idleChat.id)).toEqual({ endedAt: NOW, title: null, _count: { messages: 0 } })
    expect(await conversation(fixture.recentChat.id)).toEqual({ endedAt: null, title: "Is Sonarr up?", _count: { messages: 1 } })
    expect((await conversation(fixture.neverAnswered.id)).endedAt).toEqual(NOW)
    expect((await conversation(fixture.justStarted.id)).endedAt).toBeNull()
  })

  it("deletes ended conversations, keeping their usage cost without the link", async () => {
    expect(await mockDb.chatConversation.findUnique({ where: { id: fixture.ended.id } })).toBeNull()
    expect(await mockDb.chatConversation.findUnique({ where: { id: fixture.recentlyEnded.id } })).not.toBeNull()
    expect(await mockDb.lLMUsage.findUniqueOrThrow({ where: { id: fixture.endedUsage.id } })).toMatchObject({
      chatConversationId: null,
      prompt: null,
      cost: 0.25,
    })
  })

  it("empties idle chats, deletes long-idle ones and ends their conversation", async () => {
    expect(await mockDb.discordChatSession.findUniqueOrThrow({ where: { id: fixture.chatty.id } })).toMatchObject({ messages: [] })
    expect(await mockDb.discordChatSession.count({ where: { discordUserId: DISCORD } })).toBe(1)
    expect((await mockDb.chatConversation.findUniqueOrThrow({ where: { id: fixture.idleConversation.id } })).endedAt).toEqual(NOW)
  })

  it("keeps everything inside its window", async () => {
    expect(await mockDb.discordCommandLog.findUniqueOrThrow({ where: { id: fixture.argsLog.id } })).toMatchObject({ commandArgs: null })
    expect(await mockDb.discordCommandLog.count({ where: { discordUserId: DISCORD } })).toBe(1)
    expect(await mockDb.rewindShareVisitDay.count({ where: { share: { tokenHash: `${RUN}-hash` } } })).toBe(1)
    expect(await mockDb.rewindView.findMany({ where: { sessionKey: { startsWith: RUN } }, select: { sessionKey: true } })).toEqual([
      { sessionKey: `${RUN}-new` },
    ])
    const history = await mockDb.watchlistSyncHistory.findMany({ where: { userId: MEMBER }, select: { plexRatingKey: true }, orderBy: { plexRatingKey: "asc" } })
    expect(history.map((row) => row.plexRatingKey)).toEqual([`${RUN}-2`, `${RUN}-3`])
    expect((await mockDb.rewindGeneration.findUniqueOrThrow({ where: { id: fixture.generation.id } })).previousData).toBeNull()
  })

  it("deletes old ended applications and unused affiliate invites, keeping admin and used invites", async () => {
    const applications = await mockDb.affiliateApplication.findMany({ where: { userId: MEMBER }, select: { status: true } })
    expect(applications.map((row) => row.status).sort()).toEqual(["APPROVED", "ENDED", "REFUSED"])

    const invites = await mockDb.invite.findMany({ where: { code: { startsWith: RUN } }, select: { code: true, label: true }, orderBy: { code: "asc" } })
    expect(invites).toEqual([
      { code: `${RUN}-admin`, label: null },
      { code: `${RUN}-expired`, label: null },
      { code: `${RUN}-live`, label: "For Sam" },
      { code: `${RUN}-used`, label: null },
    ])
  })

  it("keeps audit rows at 399 days and deletes those at 401", async () => {
    const rows = await mockDb.auditLog.findMany({ where: { actorUserId: RUN } })
    expect(rows).toHaveLength(1)
    expect(rows[0].createdAt).toEqual(ago(399))
  })
})
