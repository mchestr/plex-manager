/**
 * Home's loaders (P10.21): the Plex Web link by the cached machine id with
 * its `{publicUrl}/web` fallback, the Jellyfin tile without the
 * `enabledForLogin` filter, the public-only Requests URL, and the greeting
 * by the member's zone.
 */

import { mockReset } from 'jest-mock-extended'
import { unstable_cache } from 'next/cache'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildJellyfinServer, buildPlexServer, buildUser } from '@/__tests__/helpers/factories'
import { getActiveAnnouncements } from '@/actions/announcements'
import { getPlexServerIdentity } from '@/lib/connections/plex-connection'
import { getHelpData, type HelpData } from '@/lib/member/help'
import { getHomeData, greetingFor, jellyfinLink, plexWebUrl } from '@/lib/member/home-data'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/cache', () => ({ unstable_cache: jest.fn((fn: () => unknown) => fn) }))
jest.mock('@/lib/connections/plex-connection', () => ({ getPlexServerIdentity: jest.fn() }))
jest.mock('@/lib/member/help', () => ({ getHelpData: jest.fn() }))
jest.mock('@/lib/brand', () => ({ serverName: jest.fn(async () => 'Northfield Plex') }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormatSettings: jest.fn(async () => ({ timeZone: 'America/New_York', locale: 'en-US' })),
}))
jest.mock('@/actions/announcements', () => ({ getActiveAnnouncements: jest.fn() }))
jest.mock('@/actions/watchlist', () => ({
  getWatchlistSyncSettings: jest.fn(async () => ({ success: false, code: 'INTERNAL', error: 'off' })),
}))

const HELP: HelpData = {
  service: 'plex',
  serverName: 'Northfield Plex',
  requestsUrl: null,
  discord: null,
  instructions: null,
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getPlexServerIdentity).mockReset()
  jest.mocked(getHelpData).mockResolvedValue(HELP)
  jest.mocked(getActiveAnnouncements).mockResolvedValue({ success: true, data: [] })
  prismaMock.plexServer.findFirst.mockResolvedValue(null)
  prismaMock.subscription.findUnique.mockResolvedValue(null)
})

describe('plexWebUrl', () => {
  it('caches the machine id for 24 hours under the plex-identity tag', () => {
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ['plex-identity'], {
      tags: ['plex-identity'],
      revalidate: 86_400,
    })
  })

  it('opens the server in Plex Web by its machine id', async () => {
    prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer())
    jest.mocked(getPlexServerIdentity).mockResolvedValue({ success: true, machineIdentifier: 'abc123' })

    await expect(plexWebUrl('https://plex.example.com')).resolves.toBe(
      'https://app.plex.tv/desktop/#!/media/abc123/com.plexapp.plugins.library'
    )
  })

  it("falls back to the server's own /web, then to nothing", async () => {
    prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer())
    jest.mocked(getPlexServerIdentity).mockResolvedValue({ success: false, error: 'down' })

    await expect(plexWebUrl('https://plex.example.com/')).resolves.toBe('https://plex.example.com/web')
    await expect(plexWebUrl(null)).resolves.toBeNull()
    await expect(plexWebUrl('javascript:alert(1)')).resolves.toBeNull()
  })
})

describe('jellyfinLink', () => {
  it("reads the active row's name and public URL without the enabledForLogin filter", async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer({ name: 'Basement Jelly', url: 'http://jellyfin:8096', publicUrl: 'https://jf.example.com' }))

    await expect(jellyfinLink()).resolves.toEqual({ name: 'Basement Jelly', url: 'https://jf.example.com/' })
    expect(prismaMock.jellyfinServer.findFirst.mock.calls[0][0]?.where).toEqual({ isActive: true })
  })

  it('uses the internal URL without a public one, and nothing without a row', async () => {
    prismaMock.jellyfinServer.findFirst.mockResolvedValueOnce(buildJellyfinServer({ name: 'Basement Jelly', url: 'http://jellyfin:8096', publicUrl: null }))
    await expect(jellyfinLink()).resolves.toEqual({ name: 'Basement Jelly', url: 'http://jellyfin:8096/' })

    prismaMock.jellyfinServer.findFirst.mockResolvedValueOnce(null)
    await expect(jellyfinLink()).resolves.toBeNull()
  })
})

describe('greetingFor', () => {
  // 23:00 UTC is 7 pm in New York and 8 am the next day in Tokyo
  const now = new Date('2026-10-21T23:00:00.000Z')

  it('greets by the hour in the given zone', () => {
    expect(greetingFor(now, 'America/New_York', 'Morgan Lee')).toBe('Good evening, Morgan')
    expect(greetingFor(now, 'Asia/Tokyo', 'Morgan Lee')).toBe('Good morning, Morgan')
    expect(greetingFor(new Date('2026-10-21T13:00:00.000Z'), 'UTC', 'Morgan')).toBe('Good afternoon, Morgan')
  })

  it('leaves the name out when there is none', () => {
    expect(greetingFor(now, 'UTC', null)).toBe('Good evening')
    expect(greetingFor(now, 'UTC', '  ')).toBe('Good evening')
  })
})

describe('getHomeData', () => {
  const now = new Date('2026-10-21T23:00:00.000Z')

  it("greets in the member's own zone, else the server zone", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      buildUser({ name: 'Morgan Lee', timezone: 'Asia/Tokyo', createdAt: new Date('2024-03-10T12:00:00Z') })
    )
    const data = await getHomeData('user-1', now)
    expect(data.greeting).toBe('Good morning, Morgan')
    // The account's creation date is not when the member started watching, so the home page claims no date
    expect(data).not.toHaveProperty('since')

    prismaMock.user.findUnique.mockResolvedValue(buildUser({ name: 'Morgan Lee', timezone: null }))
    await expect(getHomeData('user-1', now)).resolves.toMatchObject({ greeting: 'Good evening, Morgan' })
  })

  it('gives no Requests link without a public URL, and keeps three announcements', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser())
    jest.mocked(getActiveAnnouncements).mockResolvedValue({
      success: true,
      data: ['a', 'b', 'c', 'd'].map((id) => ({
        id,
        title: id,
        content: id,
        priority: 0,
        isActive: true,
        createdAt: now.toISOString(),
        expiresAt: null,
      })),
    })

    const data = await getHomeData('user-1', now)

    expect(data.quickLinks.requestsUrl).toBeNull()
    expect(data.announcements.map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(data.watchlist).toBeNull()
  })

  it("names a Jellyfin member's tile after the Jellyfin server", async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: null, jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' }))
    jest.mocked(getHelpData).mockResolvedValue({ ...HELP, service: 'jellyfin' })
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer({ name: 'Basement Jelly', url: 'http://jellyfin:8096', publicUrl: 'https://jf.example.com' }))

    const data = await getHomeData('user-1', now)

    expect(data.quickLinks.media).toEqual([
      { service: 'jellyfin', serverName: 'Basement Jelly', url: 'https://jf.example.com/' },
    ])
  })

  it('gives a member with both accounts both tiles, their own service first', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: 'plex-1', jellyfinUserId: 'jf-1', primaryAuthService: 'jellyfin' }))
    jest.mocked(getHelpData).mockResolvedValue({ ...HELP, service: 'jellyfin' })
    prismaMock.jellyfinServer.findFirst.mockResolvedValue(buildJellyfinServer({ name: 'Basement Jelly', url: 'http://jellyfin:8096', publicUrl: 'https://jf.example.com' }))
    prismaMock.plexServer.findFirst.mockResolvedValue(buildPlexServer({ publicUrl: 'https://plex.example.com' }))
    jest.mocked(getPlexServerIdentity).mockResolvedValue({ success: false, error: 'down' })

    const data = await getHomeData('user-1', now)

    expect(data.quickLinks.media.map((server) => [server.service, server.url])).toEqual([
      ['jellyfin', 'https://jf.example.com/'],
      ['plex', 'https://plex.example.com/web'],
    ])
  })
})
