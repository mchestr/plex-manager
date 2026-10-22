/**
 * @jest-environment node
 *
 * The ready notice (P7.14): it shows until the first view after the
 * Rewind was generated, stays off with notify off or without the banner
 * channel, and shares its unread rule with the home card's pip.
 */

import { mockReset } from 'jest-mock-extended'

import { buildConfig, buildPlexWrapped, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getRewindNotice, isRewindUnread, notifyChannels } from '@/lib/wrapped/notify/notice'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/server-zone', () => ({ serverZone: jest.fn(async () => 'America/Chicago') }))

const NOW = new Date('2026-12-05T18:00:00Z')
const GENERATED = new Date('2026-12-01T07:00:00Z')

let viewedAt: Date[]

beforeEach(() => {
  mockReset(prismaMock)
  viewedAt = []
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'all', rewindNotifyChannels: ['discord', 'banner'] }))
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'member-1', isAdmin: false }))
  prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ id: 'wrapped-1', userId: 'member-1', year: 2026, status: 'completed', generatedAt: GENERATED }))
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindView.findMany.mockImplementation((async () => viewedAt.filter((at) => at >= GENERATED).map((createdAt) => ({ createdAt }))) as never)
})

describe('getRewindNotice', () => {
  it('shows the ready notice for the season year until the first view', async () => {
    expect(await getRewindNotice('member-1', NOW)).toEqual({ kind: 'rewind-ready', year: 2026 })

    viewedAt.push(new Date('2026-12-05T17:00:00Z'))

    expect(await getRewindNotice('member-1', NOW)).toBeNull()
  })

  it('stays off with notify off', async () => {
    prismaMock.rewindPrefs.findUnique.mockResolvedValue({ notify: false } as never)

    expect(await getRewindNotice('member-1', NOW)).toBeNull()
  })

  it('stays off without the banner channel', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'all', rewindNotifyChannels: ['discord'] }))

    expect(await getRewindNotice('member-1', NOW)).toBeNull()
  })

  it('stays off for a member while only admins see Rewind', async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindEnabled: true, rewindAudience: 'admins' }))

    expect(await getRewindNotice('member-1', NOW)).toBeNull()
  })

  it('stays off while the Rewind is generating', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ status: 'generating' }))

    expect(await getRewindNotice('member-1', NOW)).toBeNull()
  })
})

describe('isRewindUnread', () => {
  it('is unread with no view since it was generated', () => {
    expect(isRewindUnread(GENERATED, [])).toBe(true)
    expect(isRewindUnread(GENERATED, [new Date('2026-11-30T00:00:00Z')])).toBe(true)
  })

  it('is read after a view since it was generated, whatever notify says', () => {
    // The card keeps its ready state and only drops the pip; notify plays no part in the rule
    expect(isRewindUnread(GENERATED, [new Date('2026-12-02T00:00:00Z')])).toBe(false)
  })
})

describe('notifyChannels', () => {
  it('keeps the known channels of a stored list', () => {
    expect(notifyChannels(['banner', 'email', 'discord'])).toEqual(['discord', 'banner'])
    expect(notifyChannels('discord')).toEqual([])
    expect(notifyChannels(null)).toEqual([])
  })
})
