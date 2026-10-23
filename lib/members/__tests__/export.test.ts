/**
 * @jest-environment node
 *
 * The member export (P11.15, GAP-36): the strict `MemberExportV1` schema, no
 * secret-looking key in the output, every query scoped to the member, and
 * every model of `docs/privacy.md`'s "Member data" table either exported or
 * left out with a reason.
 */

import fs from 'fs'
import path from 'path'
import { mockReset } from 'jest-mock-extended'

import { buildPlexWrapped, buildRewindShare, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { assertNoSecretKeys } from '@/__tests__/utils/assert-no-secret-keys'
import { buildMemberExport } from '@/lib/members/export'
import { EXPORT_COVERAGE, MemberExportV1 } from '@/lib/members/export-schema'
import { fixtureRewind } from '@/lib/wrapped/data/__tests__/share-fixture'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/stripe/prices', () => ({ getPlanName: jest.fn().mockResolvedValue('Supporter') }))

const MEMBER = 'member-1'
const NOW = new Date('2027-01-27T10:00:00Z')
const AT = new Date('2026-12-01T09:00:00Z')

beforeEach(async () => {
  mockReset(prismaMock)
  prismaMock.user.findUniqueOrThrow.mockResolvedValue(
    buildUser({ id: MEMBER, name: 'Ann', email: 'ann@example.com', plexUserId: 'plex-1', plexAuthToken: 'secret-plex-token' })
  )
  prismaMock.plexWrapped.findMany.mockResolvedValue([
    buildPlexWrapped({ id: 'w-2026', userId: MEMBER, year: 2026, status: 'completed', data: JSON.stringify(await fixtureRewind('heavy')), edition: 'full', generatedAt: AT }),
    buildPlexWrapped({ id: 'w-2024', userId: MEMBER, year: 2024, status: 'completed', data: JSON.stringify({ version: 2, statistics: { moviesWatched: 3 } }), generatedAt: AT }),
    buildPlexWrapped({ id: 'w-bad', userId: MEMBER, year: 2023, status: 'completed', data: 'not json' }),
  ])
  prismaMock.rewindPrefs.findMany.mockResolvedValue([])
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
  prismaMock.rewindShare.findMany.mockResolvedValue([
    { ...buildRewindShare({ wrappedId: 'w-2026', tokenHash: 'hash-secret', assetKey: 'asset-secret', createdAt: AT, pages: ['cover'] }), wrapped: { year: 2026 } },
  ] as never)
  prismaMock.userMediaMark.findMany.mockResolvedValue([])
  prismaMock.watchlistSyncSettings.findUnique.mockResolvedValue(null)
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([])
  prismaMock.subscription.findUnique.mockResolvedValue({
    id: 's-1', userId: MEMBER, stripeCustomerId: 'cus_123', stripeSubscriptionId: 'sub_123', status: 'ACTIVE', priceId: 'price_1',
    currentPeriodEnd: AT, cancelAtPeriodEnd: false, canceledAt: null, plexInviteStatus: null, jellyfinAccessStatus: null, accessSkipCode: null, stripeEventAt: null, createdAt: AT, updatedAt: AT,
  })
  prismaMock.discordConnection.findUnique.mockResolvedValue({ username: 'ann', globalName: 'Ann', linkedAt: AT } as never)
  prismaMock.lLMUsage.findMany.mockResolvedValue([
    { chatConversationId: 'c-1', createdAt: AT, model: 'gpt-5-mini', prompt: '[{"role":"user","content":"hi"}]', response: 'Hello' },
  ] as never)
  prismaMock.discordCommandLog.findMany.mockResolvedValue([
    { commandType: 'CHAT', commandName: 'dm', channelType: 'dm', status: 'SUCCESS', argsLength: 2, createdAt: AT },
  ] as never)
})

describe('buildMemberExport', () => {
  it('builds a versioned export with no secret-looking key, token hash or Stripe id', async () => {
    const result = await buildMemberExport(MEMBER, NOW)

    expect(result).toMatchObject({ format: 'plex-manager-member-export', version: 1, exportedAt: NOW.toISOString() })
    expect(result.profile).toMatchObject({ name: 'Ann', services: ['plex'], plexUserId: 'plex-1' })
    expect(result.subscription).toEqual({
      status: 'ACTIVE', plan: 'Supporter', currentPeriodEnd: AT.toISOString(), cancelAtPeriodEnd: false, canceledAt: null,
    })
    expect(result.rewindShares[0]).toMatchObject({ year: 2026, status: 'active', pages: ['cover'] })
    expect(result.discordCommands).toEqual([
      { commandType: 'CHAT', commandName: 'dm', channelType: 'dm', status: 'SUCCESS', argsLength: 2, at: AT.toISOString() },
    ])
    assertNoSecretKeys(result)
    const text = JSON.stringify(result)
    for (const secret of ['secret-plex-token', 'hash-secret', 'asset-secret', 'cus_123', 'sub_123', 'price_1']) {
      expect(text).not.toContain(secret)
    }
  })

  it('copies v3 data as stored, reads v2 through the parser, and leaves unreadable data out', async () => {
    const { rewinds } = await buildMemberExport(MEMBER, NOW)

    expect(rewinds.map((row) => [row.year, row.version])).toEqual([[2026, 3], [2024, 2], [2023, null]])
    expect(rewinds[0].data).toEqual(JSON.parse(JSON.stringify(await fixtureRewind('heavy'))))
    expect(rewinds[1].data).toMatchObject({ statistics: { moviesWatched: 3 } })
    expect(rewinds[2].data).toBeNull()
  })

  it('scopes every query to the member', async () => {
    await buildMemberExport(MEMBER, NOW)

    const calls = [
      prismaMock.user.findUniqueOrThrow.mock.calls[0][0].where,
      prismaMock.plexWrapped.findMany.mock.calls[0][0]?.where,
      prismaMock.rewindPrefs.findMany.mock.calls[0][0]?.where,
      prismaMock.rewindExclusion.findMany.mock.calls[0][0]?.where,
      prismaMock.rewindShare.findMany.mock.calls[0][0]?.where,
      prismaMock.userMediaMark.findMany.mock.calls[0][0]?.where,
      prismaMock.watchlistSyncSettings.findUnique.mock.calls[0][0].where,
      prismaMock.watchlistSyncHistory.findMany.mock.calls[0][0]?.where,
      prismaMock.subscription.findUnique.mock.calls[0][0].where,
      prismaMock.discordConnection.findUnique.mock.calls[0][0].where,
      prismaMock.lLMUsage.findMany.mock.calls[0][0]?.where,
      prismaMock.discordCommandLog.findMany.mock.calls[0][0]?.where,
    ]
    for (const where of calls) {
      expect(JSON.stringify(where)).toContain(`"${MEMBER}"`)
    }
    expect(prismaMock.lLMUsage.findMany.mock.calls[0][0]).toMatchObject({ take: 500, orderBy: { createdAt: 'desc' } })
  })
})

describe('MemberExportV1', () => {
  it('rejects an extra key at the top and inside a section', async () => {
    const valid = await buildMemberExport(MEMBER, NOW)

    expect(MemberExportV1.safeParse(valid).success).toBe(true)
    expect(MemberExportV1.safeParse({ ...valid, plexAuthToken: 'x' }).success).toBe(false)
    expect(MemberExportV1.safeParse({ ...valid, profile: { ...valid.profile, plexAuthToken: 'x' } }).success).toBe(false)
  })
})

describe('inventory coverage', () => {
  const privacy = fs.readFileSync(path.resolve(__dirname, '../../../docs/privacy.md'), 'utf8')
  const memberTable = privacy.split('### Member data')[1].split('\n### ')[0]
  const memberModels = Array.from(memberTable.matchAll(/^\| `(\w+)` \|/gm), (match) => match[1])
  const exportSection = privacy.split('## Your data: export and single deletes')[1].split('\n## ')[0]

  it('reads the member models from docs/privacy.md', () => {
    expect(memberModels.length).toBeGreaterThan(15)
  })

  it.each(memberModels)('%s is exported or left out with a reason', (model) => {
    const entry = EXPORT_COVERAGE[model]
    expect(entry).toBeDefined()
    if (typeof entry === 'object') expect(entry.excluded.length).toBeGreaterThan(10)
    expect(exportSection).toContain(`\`${model}\``)
  })

  it('covers no model outside the member table', () => {
    expect(Object.keys(EXPORT_COVERAGE).filter((model) => !memberModels.includes(model))).toEqual([])
  })
})
