/**
 * @jest-environment node
 */

/**
 * `buildMemberExport` on PostgreSQL (P11.15): two members each hold a row in
 * every exported table; one member's export carries their own rows and
 * nothing of the other's. Gated by `describePg`; the suite touches only rows
 * keyed by its own run prefix.
 */

import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'

import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { buildMemberExport } from '@/lib/members/export'
import { describePg } from '@/test/helpers/integration'

let mockDb: PrismaClient
jest.mock('@/lib/prisma', () => ({
  get prisma() {
    return mockDb
  },
}))

const RUN = `p1115-${randomUUID().slice(0, 8)}`

async function seedMember(db: PrismaClient, tag: string) {
  const id = `${RUN}-${tag}`
  await db.user.create({ data: { id, name: `${id} name`, email: `${id}@example.com`, plexUserId: `${id}-plex`, plexAuthToken: `${id}-token` } })
  const wrapped = await db.plexWrapped.create({
    data: { userId: id, year: 2026, status: 'completed', data: JSON.stringify({ version: 2, statistics: { moviesWatched: 1 }, summary: `${id} summary` }) },
  })
  await db.rewindShare.create({ data: { wrappedId: wrapped.id, tokenHash: `${id}-hash`, assetKey: `${id}-asset`, pages: ['cover'], cardFacts: {} } })
  await db.rewindPrefs.create({ data: { userId: id, year: 2026 } })
  await db.rewindExclusion.create({ data: { userId: id, ratingKey: '42', kind: 'film', title: `${id} hidden` } })
  const conversation = await db.chatConversation.create({ data: { userId: id } })
  await db.lLMUsage.create({
    data: { userId: id, chatConversationId: conversation.id, provider: 'openai', promptTokens: 1, completionTokens: 1, totalTokens: 2, cost: 0.1, prompt: `${id} asks`, response: `${id} answer` },
  })
  await db.discordConnection.create({ data: { userId: id, discordUserId: `${id}-discord`, username: `${id} discord`, accessToken: `${id}-at`, refreshToken: `${id}-rt` } })
  await db.discordCommandLog.create({
    data: { discordUserId: `${id}-discord`, userId: id, commandType: 'MEDIA_MARK', commandName: 'mark', commandArgs: `${id} args`, channelId: `${id}-dm`, channelType: 'dm' },
  })
  await db.userMediaMark.create({
    data: { userId: id, mediaType: 'MOVIE', plexRatingKey: '42', title: `${id} marked`, markType: 'FINISHED_WATCHING', markedVia: 'discord' },
  })
  await db.watchlistSyncSettings.create({ data: { userId: id, syncEnabled: true } })
  await db.watchlistSyncHistory.create({ data: { userId: id, plexRatingKey: '43', guid: 'tmdb://43', mediaType: 'MOVIE', title: `${id} wanted` } })
  await db.subscription.create({ data: { userId: id, stripeCustomerId: `${id}-cus`, stripeSubscriptionId: `${id}-sub`, status: 'ACTIVE' } })
  return id
}

describePg('buildMemberExport on PostgreSQL', (databaseUrl) => {
  let ann: string
  let bob: string

  beforeAll(async () => {
    mockDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
    ann = await seedMember(mockDb, 'ann')
    bob = await seedMember(mockDb, 'bob')
  })

  afterAll(async () => {
    await mockDb.discordCommandLog.deleteMany({ where: { userId: { in: [ann, bob] } } })
    await mockDb.user.deleteMany({ where: { id: { in: [ann, bob] } } })
    await mockDb.$disconnect()
  })

  it("carries the member's own rows and nothing of the other member's", async () => {
    const result = await buildMemberExport(ann)
    const text = JSON.stringify(result)

    for (const own of ['name', 'summary', 'hidden', 'asks', 'answer', 'discord', 'marked', 'wanted']) {
      expect(text).toContain(`${ann} ${own}`)
    }
    expect(text).not.toContain(bob)
    for (const secret of ['token', 'hash', 'asset', 'at', 'rt', 'cus', 'sub']) {
      expect(text).not.toContain(`${ann}-${secret}"`)
    }
    expect(text).not.toContain(`${ann} args`)
    assertNoSecretKeys(result)
    expect(result.rewindShares).toHaveLength(1)
    expect(result.watchlist.settings).toMatchObject({ syncEnabled: true })
    expect(result.subscription).toMatchObject({ status: 'ACTIVE', plan: 'Membership' })
  })
})
