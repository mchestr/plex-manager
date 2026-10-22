/**
 * Home's "New on" row loader (P10.12) on recorded-shape Plex JSON: only the
 * member's shared movie and show sections are read, items merge by
 * `addedAt` with a cap of 12, the caption meta, the week count, the cache,
 * and an empty row on any Plex failure.
 */

import { mockReset } from 'jest-mock-extended'

import { buildPlexServer, buildUser } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getSharedSectionKeys, rememberItemSectionKey } from '@/lib/connections/plex-shared-sections'
import { clearNewOnCaches, getNewOn, newOnMeta } from '@/lib/member/new-on'
import { plexServerId } from '@/lib/rewind/item-links'

import sectionsFixture from './fixtures/plex-library-sections.json'
import moviesFixture from './fixtures/plex-section-1-recent.json'
import showsFixture from './fixtures/plex-section-2-recent.json'
import weekFixture from './fixtures/plex-section-week-count.json'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex-shared-sections', () => ({
  getSharedSectionKeys: jest.fn(),
  rememberItemSectionKey: jest.fn(),
}))
jest.mock('@/lib/rewind/item-links', () => ({ plexServerId: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const SERVER = buildPlexServer({ url: 'http://plex.local:32400', adminPlexUserId: 'owner-plex-id', publicUrl: 'https://plex.example.com' })
const MEMBER = { userId: 'member-1', isAdmin: false }
const MACHINE_ID = 'abc123machine'
const NOW = 1767700000 * 1000

const mockFetch = jest.fn()

function respond(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/** Answers like a Plex server with the four fixture sections; `fail` sections answer 500. */
function plexServes({ fail = [] as string[], noCount = false } = {}) {
  mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
    const { pathname, searchParams } = new URL(url)
    if (pathname === '/library/sections') return respond(200, sectionsFixture)
    const section = pathname.match(/^\/library\/sections\/(\d+)\/all$/)?.[1]
    if (!section) return respond(404)
    if (fail.includes(section)) return respond(500)
    const size = (init.headers as Record<string, string>)['X-Plex-Container-Size']
    if (size === '0') {
      if (noCount) return respond(200, { MediaContainer: { size: 0 } })
      expect(searchParams.get('addedAt>>')).toBe(String(NOW / 1000 - 7 * 24 * 60 * 60))
      return respond(200, weekFixture)
    }
    return respond(200, section === '1' ? moviesFixture : section === '2' ? showsFixture : { MediaContainer: { size: 0, totalSize: 0 } })
  })
}

function sectionCalls(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => new URL(String(url)).pathname)
    .filter((path) => path !== '/library/sections')
}

beforeEach(() => {
  mockReset(prismaMock)
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
  clearNewOnCaches()
  jest.mocked(getSharedSectionKeys).mockReset()
  jest.mocked(rememberItemSectionKey).mockReset()
  jest.mocked(plexServerId).mockResolvedValue(MACHINE_ID)
  prismaMock.plexServer.findFirst.mockResolvedValue(SERVER)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: 'member-plex-id' }))
})

describe('getNewOn', () => {
  it('reads only the movie and show sections shared with the member', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['1', '3']))
    plexServes()

    const row = await getNewOn(MEMBER, NOW)

    expect(getSharedSectionKeys).toHaveBeenCalledWith(expect.objectContaining({ url: SERVER.url }), 'member-plex-id')
    expect(new Set(sectionCalls())).toEqual(new Set(['/library/sections/1/all']))
    expect(row.items.map((item) => item.ratingKey)).toEqual(moviesFixture.MediaContainer.Metadata.map((m) => m.ratingKey))
    expect(row.items.every((item) => item.kind === 'movie')).toBe(true)
  })

  it('pages with the container headers, sorted by addedAt for films and series', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['1', '2']))
    plexServes()

    await getNewOn(MEMBER, NOW)

    const recent = mockFetch.mock.calls.find(([url, init]) => String(url).includes('/sections/2/all') && init.headers['X-Plex-Container-Size'] === '12')
    expect(recent).toBeDefined()
    const [url, init] = recent!
    expect(new URL(url).searchParams.get('sort')).toBe('addedAt:desc')
    expect(new URL(url).searchParams.get('type')).toBe('2')
    expect(init.headers).toEqual(expect.objectContaining({ 'X-Plex-Token': SERVER.token, 'X-Plex-Container-Start': '0' }))
  })

  it('merges sections by addedAt and keeps 12', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    plexServes()

    const row = await getNewOn(MEMBER, NOW)

    expect(row.items).toHaveLength(12)
    expect(row.items.slice(0, 4).map((item) => item.title)).toEqual(['Glasshouse', 'Northbound', 'Low Season', 'Kestrel'])
    const added = [...moviesFixture.MediaContainer.Metadata, ...showsFixture.MediaContainer.Metadata]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 12)
      .map((m) => m.ratingKey)
    expect(row.items.map((item) => item.ratingKey)).toEqual(added)
  })

  it('maps each title with its Plex web link and hands its section to the poster route', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    plexServes()

    const row = await getNewOn(MEMBER, NOW)

    expect(row.items[1]).toEqual({
      ratingKey: '70210',
      title: 'Northbound',
      year: 2026,
      kind: 'show',
      seasons: 1,
      href: `https://app.plex.tv/desktop/#!/server/${MACHINE_ID}/details?key=%2Flibrary%2Fmetadata%2F70210`,
    })
    expect(rememberItemSectionKey).toHaveBeenCalledWith(expect.objectContaining({ url: SERVER.url }), '50101', '1')
    expect(rememberItemSectionKey).toHaveBeenCalledWith(expect.objectContaining({ url: SERVER.url }), '70210', '2')
  })

  it('falls back to the server web app without a machine id', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    jest.mocked(plexServerId).mockRejectedValue(new Error('Plex identity unavailable'))
    plexServes()

    const row = await getNewOn(MEMBER, NOW)

    expect(row.items[0].href).toBe('https://plex.example.com/web')
  })

  it('counts the titles added in the last week across sections', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    plexServes()

    const row = await getNewOn(MEMBER, NOW)

    // three movie and show sections, 19 each
    expect(row.addedThisWeek).toBe(57)
  })

  it('drops the count when a server does not report totalSize', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    plexServes({ noCount: true })

    const row = await getNewOn(MEMBER, NOW)

    expect(row.items).toHaveLength(12)
    expect(row.addedThisWeek).toBeNull()
  })

  it('reads every section for an admin without asking plex.tv', async () => {
    plexServes()

    const row = await getNewOn({ userId: 'admin-1', isAdmin: true }, NOW)

    expect(getSharedSectionKeys).not.toHaveBeenCalled()
    expect(row.items).toHaveLength(12)
  })

  it('answers a repeat view from the cache with no request', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set(['2', '1']))
    plexServes()
    await getNewOn(MEMBER, NOW)
    const calls = mockFetch.mock.calls.length

    const row = await getNewOn(MEMBER, NOW)

    expect(mockFetch).toHaveBeenCalledTimes(calls)
    expect(row.items).toHaveLength(12)
  })

  it('gives an empty row when Plex fails, and does not cache it', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    plexServes({ fail: ['2'] })

    expect(await getNewOn(MEMBER, NOW)).toEqual({ items: [], addedThisWeek: null })

    plexServes()
    expect((await getNewOn(MEMBER, NOW)).items).toHaveLength(12)
  })

  it('gives an empty row when Plex cannot be reached at all', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue('all')
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    expect(await getNewOn(MEMBER, NOW)).toEqual({ items: [], addedThisWeek: null })
  })

  it('gives an empty row when plex.tv cannot say what is shared', async () => {
    jest.mocked(getSharedSectionKeys).mockResolvedValue(null)

    expect((await getNewOn(MEMBER, NOW)).items).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('gives an empty row to a member without a Plex account or share', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: null }))
    expect((await getNewOn(MEMBER, NOW)).items).toEqual([])

    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: 'member-plex-id' }))
    jest.mocked(getSharedSectionKeys).mockResolvedValue(new Set())
    plexServes()
    expect((await getNewOn(MEMBER, NOW)).items).toEqual([])
    expect(sectionCalls()).toEqual([])
  })

  it('gives an empty row with no Plex server or a database error', async () => {
    prismaMock.plexServer.findFirst.mockResolvedValue(null)
    expect((await getNewOn(MEMBER, NOW)).items).toEqual([])

    prismaMock.plexServer.findFirst.mockRejectedValue(new Error('db down'))
    expect((await getNewOn(MEMBER, NOW)).items).toEqual([])
  })
})

describe('newOnMeta', () => {
  it('reads "Film, 2026" and "Series, season 1"', () => {
    expect(newOnMeta({ kind: 'movie', year: 2026, seasons: null })).toBe('Film, 2026')
    expect(newOnMeta({ kind: 'show', year: 2026, seasons: 1 })).toBe('Series, season 1')
    expect(newOnMeta({ kind: 'movie', year: null, seasons: null })).toBe('Film')
    expect(newOnMeta({ kind: 'show', year: null, seasons: null })).toBe('Series')
  })
})
