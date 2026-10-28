/**
 * @jest-environment node
 */

/**
 * `eraseMember` on PostgreSQL (P11.13, GAP-31): a fixture seeds one row in
 * every inventory table for one member; after the removal no table holds a
 * row that references the member's user id or Discord id, the admin's LLM
 * row about the member keeps its cost but loses its text, and the single
 * `MEMBER_ERASED` row holds no name or email.
 *
 * Stripe and the media servers are mocked; everything else is real. Gated by
 * `describePg` and run only by `npm run test:integration`. The suite touches
 * only rows it created, keyed by its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/lib/generated/prisma/client'
import { revokeServiceAccess } from '@/lib/members/access-actions'
import { eraseMember } from '@/lib/members/erase'
import { cancelStripeSubscription } from '@/lib/members/erase-external'
import { describePg } from '@/__tests__/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))
jest.mock('@/lib/members/access-actions', () => ({ revokeServiceAccess: jest.fn() }))
jest.mock('@/lib/members/erase-external', () => ({
  ...jest.requireActual('@/lib/members/erase-external'),
  cancelStripeSubscription: jest.fn(),
}))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const RUN = `p1113-${randomUUID().slice(0, 8)}`
const MEMBER = `${RUN}-member`
const ADMIN = `${RUN}-admin`
const DISCORD = `${RUN}-discord`
const EMAIL = `${RUN}@example.com`
const NAME = `Erase Fixture ${RUN}`

/** One row in every inventory table that can reference the member. */
async function seedMember(db: PrismaClient) {
  await db.user.create({ data: { id: ADMIN, name: `${RUN} admin`, isAdmin: true } })
  await db.user.create({
    data: { id: MEMBER, name: NAME, email: EMAIL, plexUserId: `${RUN}-plex`, plexAuthToken: 'plex-token' },
  })
  const wrapped = await db.plexWrapped.create({ data: { userId: MEMBER, year: 2026, data: '{}', status: 'completed' } })
  const generation = await db.rewindGeneration.create({
    data: { wrappedId: wrapped.id, userId: MEMBER, year: 2026, kind: 'admin', status: 'completed' },
  })
  const share = await db.rewindShare.create({
    data: { wrappedId: wrapped.id, tokenHash: `${RUN}-hash`, assetKey: `${RUN}-asset`, pages: [], cardFacts: {} },
  })
  await db.rewindShareVisitDay.create({ data: { shareId: share.id, day: new Date('2026-12-02'), count: 3 } })
  await db.rewindView.create({ data: { wrappedId: wrapped.id, sessionKey: `${RUN}-view`, edition: 'full' } })
  await db.wrappedShareVisit.create({ data: { wrappedId: wrapped.id, userAgent: 'test' } })
  await db.rewindPrefs.create({ data: { userId: MEMBER, year: 2026 } })
  await db.rewindExclusion.create({ data: { userId: MEMBER, ratingKey: '42', kind: 'film', title: 'Hidden' } })
  const conversation = await db.chatConversation.create({
    data: { userId: MEMBER, title: 'Is Plex up?', lastMessageAt: new Date(), messages: { create: [{ role: 'user', content: 'Is Plex up?' }] } },
  })
  const usage = { provider: 'openai', promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.5, prompt: 'stats', response: 'copy' }
  await db.lLMUsage.create({ data: { ...usage, userId: MEMBER, chatConversationId: conversation.id } })
  // An admin regeneration: the row is the admin's, its text is about the member
  await db.lLMUsage.create({ data: { ...usage, userId: ADMIN, wrappedId: wrapped.id, generationId: generation.id } })
  const adminConversation = await db.chatConversation.create({ data: { userId: ADMIN } })
  await db.discordChatSession.create({
    data: { discordUserId: DISCORD, discordChannelId: `${RUN}-dm`, chatConversationId: conversation.id, messages: [] },
  })
  // Left from an earlier link to another app account: only the Discord id finds it
  await db.discordChatSession.create({
    data: { discordUserId: DISCORD, discordChannelId: `${RUN}-old`, chatConversationId: adminConversation.id, messages: [] },
  })
  await db.discordConnection.create({ data: { userId: MEMBER, discordUserId: DISCORD, username: 'fixture', accessToken: 'at' } })
  await db.discordOAuthState.create({
    data: { userId: MEMBER, state: `${RUN}-state`, codeVerifier: 'v', expiresAt: new Date(Date.now() + 60_000) },
  })
  await db.discordPendingSelection.create({
    data: {
      discordUserId: DISCORD,
      channelId: `${RUN}-dm`,
      customId: `${RUN}-pick`,
      markType: 'FINISHED_WATCHING',
      results: [],
      expiresAt: new Date(Date.now() + 60_000),
    },
  })
  const log = { commandType: 'CHAT' as const, commandName: 'dm', channelId: `${RUN}-dm`, channelType: 'dm' }
  await db.discordCommandLog.create({ data: { ...log, discordUserId: DISCORD, userId: MEMBER, commandArgs: 'hello' } })
  await db.discordCommandLog.create({ data: { ...log, discordUserId: DISCORD, commandArgs: 'before linking' } })
  await db.userMediaMark.create({
    data: { userId: MEMBER, mediaType: 'MOVIE', plexRatingKey: '42', title: 'Marked', markType: 'FINISHED_WATCHING', markedVia: 'discord' },
  })
  await db.watchlistSyncSettings.create({ data: { userId: MEMBER, syncEnabled: true } })
  await db.watchlistSyncHistory.create({
    data: { userId: MEMBER, plexRatingKey: '43', guid: 'tmdb://43', mediaType: 'MOVIE', title: 'Wanted' },
  })
  const invite = await db.invite.create({ data: { code: `${RUN}-invite`, createdBy: ADMIN } })
  await db.inviteUsage.create({ data: { inviteId: invite.id, userId: MEMBER } })
  await db.subscription.create({
    data: { userId: MEMBER, stripeCustomerId: `${RUN}-cus`, stripeSubscriptionId: `${RUN}-sub`, status: 'ACTIVE' },
  })
  return { wrappedId: wrapped.id, generationId: generation.id, shareId: share.id, conversationId: conversation.id }
}

describePg('eraseMember on PostgreSQL', (databaseUrl) => {
  let ids: Awaited<ReturnType<typeof seedMember>>

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    ids = await seedMember(mockDb)
    jest.mocked(revokeServiceAccess).mockResolvedValue({ success: true, plex: 'removed' })
    jest.mocked(cancelStripeSubscription).mockResolvedValue({ success: true, status: 'canceled' })
  })

  afterAll(async () => {
    await mockDb.lLMUsage.deleteMany({ where: { userId: ADMIN } })
    await mockDb.invite.deleteMany({ where: { code: `${RUN}-invite` } })
    await mockDb.user.deleteMany({ where: { id: { in: [ADMIN, MEMBER] } } })
    await mockDb.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: [ADMIN, MEMBER] } }, { targetUserId: MEMBER }] } })
    await mockDb.$disconnect()
  })

  it('counts every inventory table on a dry run and changes nothing', async () => {
    const result = await eraseMember(MEMBER, { actorId: ADMIN, dryRun: true })

    expect(result.success).toBe(true)
    if (!result.success) return
    for (const [table, count] of Object.entries(result.data.counts)) {
      expect([table, count]).toEqual([table, table === 'discordChatSession' || table === 'discordCommandLog' ? 2 : 1])
    }
    expect(await mockDb.user.count({ where: { id: MEMBER } })).toBe(1)
    expect(cancelStripeSubscription).not.toHaveBeenCalled()
  })

  it('leaves no row that references the member, and audits ids only', async () => {
    const result = await eraseMember(MEMBER, { actorId: ADMIN, dryRun: false })
    expect(result).toMatchObject({ success: true, data: { outcome: { stripe: 'canceled' } } })

    const byUser = { where: { userId: MEMBER } }
    const byDiscord = { where: { discordUserId: DISCORD } }
    const remaining = await Promise.all([
      mockDb.user.count({ where: { id: MEMBER } }),
      mockDb.plexWrapped.count(byUser),
      mockDb.rewindGeneration.count(byUser),
      mockDb.rewindShare.count({ where: { id: ids.shareId } }),
      mockDb.rewindShareVisitDay.count({ where: { shareId: ids.shareId } }),
      mockDb.rewindView.count({ where: { wrappedId: ids.wrappedId } }),
      mockDb.wrappedShareVisit.count({ where: { wrappedId: ids.wrappedId } }),
      mockDb.rewindPrefs.count(byUser),
      mockDb.rewindExclusion.count(byUser),
      mockDb.lLMUsage.count(byUser),
      mockDb.chatConversation.count(byUser),
      mockDb.chatConversationMessage.count({ where: { conversationId: ids.conversationId } }),
      mockDb.discordChatSession.count(byDiscord),
      mockDb.discordCommandLog.count({ where: { OR: [{ userId: MEMBER }, { discordUserId: DISCORD }] } }),
      mockDb.discordPendingSelection.count(byDiscord),
      mockDb.discordConnection.count({ where: { OR: [{ userId: MEMBER }, { discordUserId: DISCORD }] } }),
      mockDb.discordOAuthState.count(byUser),
      mockDb.userMediaMark.count(byUser),
      mockDb.watchlistSyncSettings.count(byUser),
      mockDb.watchlistSyncHistory.count(byUser),
      mockDb.inviteUsage.count(byUser),
      mockDb.subscription.count(byUser),
    ])
    expect(remaining.every((count) => count === 0)).toBe(true)

    const adminUsage = await mockDb.lLMUsage.findFirstOrThrow({ where: { userId: ADMIN } })
    expect(adminUsage).toMatchObject({ prompt: null, response: null, cost: 0.5, generationId: null, wrappedId: null })

    const erased = await mockDb.auditLog.findMany({ where: { type: 'MEMBER_ERASED', targetUserId: MEMBER } })
    expect(erased).toHaveLength(1)
    const details = JSON.stringify(erased[0].details)
    expect(details).toContain(`${RUN}-cus`)
    expect(details).not.toContain(EMAIL)
    expect(details).not.toContain(NAME)
  })

  it('reports NOT_FOUND on a rerun once the member is gone', async () => {
    await expect(eraseMember(MEMBER, { actorId: ADMIN, dryRun: false })).resolves.toMatchObject({ code: 'NOT_FOUND' })
  })
})
