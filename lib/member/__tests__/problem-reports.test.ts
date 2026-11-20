/**
 * What /report shows a member: their reports and the ones they follow, a
 * search filtered to their libraries, and the open sheet's title with its
 * episodes and open report.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getPlexShowEpisodes, searchPlexMedia, type PlexItemMetadata } from '@/lib/connections/plex'
import { getActivePlexServerConfig } from '@/lib/connections/plex-config'
import { recentlyWatched, watchingNow } from '@/lib/member/problem-report-titles'
import { getReportPageData } from '@/lib/member/problem-reports'
import { memberLibraryAccess, readMemberItem } from '@/lib/problem-reports/access'
import { memberLastPlay } from '@/lib/problem-reports/evidence'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({ getPlexShowEpisodes: jest.fn(), searchPlexMedia: jest.fn() }))
jest.mock('@/lib/connections/plex-config', () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock('@/lib/member/problem-report-titles', () => ({ watchingNow: jest.fn(), recentlyWatched: jest.fn() }))
jest.mock('@/lib/problem-reports/evidence', () => ({ memberLastPlay: jest.fn() }))
jest.mock('@/lib/problem-reports/access', () => ({
  ...jest.requireActual('@/lib/problem-reports/access'),
  memberLibraryAccess: jest.fn(),
  readMemberItem: jest.fn(),
}))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }
const SHOW: PlexItemMetadata = { ratingKey: '6999', type: 'show', title: 'The Office', year: 2005, guid: 'plex://show/office', ids: {}, librarySectionId: '2', parts: [], locations: [] }
const AT = new Date('2026-11-09T15:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.problemReport.findMany.mockResolvedValue([])
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId: 'member-plex' } as never)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(memberLibraryAccess).mockResolvedValue({ all: false, sections: new Set(['1']) })
  jest.mocked(watchingNow).mockResolvedValue([])
  jest.mocked(recentlyWatched).mockResolvedValue([])
  jest.mocked(memberLastPlay).mockResolvedValue(null)
})

describe('getReportPageData', () => {
  it("lists the member's reports and the ones they follow, in words", async () => {
    const report = { problem: 'wont_start', status: 'WITH_ADMIN', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'own', reporterId: 'member-1', events: [] },
      { ...report, id: 'followed', reporterId: 'member-2', events: [{ kind: 'ALSO_REPORTED', data: {}, createdAt: AT }] },
      { ...report, id: 'cancelled', reporterId: 'member-1', status: 'CLOSED', events: [{ kind: 'CLOSED', data: { reason: 'cancelled' }, createdAt: AT }] },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports).toEqual([
      { id: 'own', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: 'You sent it', at: AT.toISOString() }, canCancel: true },
      { id: 'followed', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: "You're following it", at: AT.toISOString() }, canCancel: false },
      { id: 'cancelled', title: 'Heat (1995)', problem: "Won't start", status: 'CLOSED', latest: { words: 'You cancelled it', at: AT.toISOString() }, canCancel: false },
    ])
  })

  it('searches only the libraries shared with the member, and only movies, shows and episodes', async () => {
    jest.mocked(searchPlexMedia).mockResolvedValue({
      success: true,
      data: [
        { ratingKey: '1', type: 'movie', title: 'Shared', year: 2001, librarySectionId: '1' },
        { ratingKey: '2', type: 'movie', title: 'Not shared', librarySectionId: '9' },
        { ratingKey: '3', type: 'episode', title: 'Pilot', grandparentTitle: 'The Office', parentIndex: 1, index: 1, librarySectionId: '1' },
        { ratingKey: '4', type: 'artist', title: 'A band', librarySectionId: '1' },
      ],
    })
    jest.mocked(memberLibraryAccess).mockResolvedValue({ all: false, sections: new Set(['1']) })

    const { search } = await getReportPageData('member-1', { q: 'sh' })

    expect(search).toEqual({
      error: null,
      results: [
        { ratingKey: '1', type: 'movie', title: 'Shared (2001)', posterKey: '1' },
        { ratingKey: '3', type: 'episode', title: 'The Office S1E1: Pilot', posterKey: '3' },
      ],
    })
  })

  it('does not search for one character, and says when the libraries cannot be read', async () => {
    expect((await getReportPageData('member-1', { q: 'a' })).search).toBeNull()

    jest.mocked(searchPlexMedia).mockResolvedValue({ success: true, data: [] })
    jest.mocked(memberLibraryAccess).mockResolvedValue(null)
    expect((await getReportPageData('member-1', { q: 'heat' })).search).toEqual({
      results: [],
      error: "We can't reach the server right now. Try again in a few minutes.",
    })
  })

  it("opens a show's sheet with its episodes and its open report", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: SHOW, server: SERVER })
    jest.mocked(getPlexShowEpisodes).mockResolvedValue({ ok: true, episodes: [{ ratingKey: '7001', title: 'Pilot', seasonNumber: 1, episodeNumber: 1 }] })
    prismaMock.problemReport.findUnique.mockResolvedValue({ id: 'open', reporterId: 'member-2', problem: 'missing_episodes', status: 'WITH_ADMIN', updatedAt: AT, events: [] } as never)

    const { selected } = await getReportPageData('member-1', { item: '6999' })

    expect(selected).toEqual({
      ratingKey: '6999',
      type: 'show',
      title: 'The Office (2005)',
      episodes: [{ ratingKey: '7001', label: 'S1E1: Pilot' }],
      openReport: { id: 'open', problem: 'Episodes are missing', status: 'WITH_ADMIN', since: AT.toISOString(), yours: false },
      lastPlay: null,
    })
    expect(memberLastPlay).toHaveBeenCalledWith('member-plex', expect.objectContaining({ ratingKey: '6999', type: 'show' }))
    expect(prismaMock.problemReport.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { activeKey: 'plex://show/office' } }))
  })

  it('reads Watching now and Recently watched with the libraries read once', async () => {
    const watching = [{ ratingKey: '7001', type: 'episode' as const, title: 'The Office S1E1: Pilot', posterKey: '6999' }]
    jest.mocked(watchingNow).mockResolvedValue(watching)

    const data = await getReportPageData('member-1', {})

    expect(data.watching).toEqual(watching)
    expect(data.recent).toEqual([])
    expect(memberLibraryAccess).toHaveBeenCalledTimes(1)
    expect(watchingNow).toHaveBeenCalledWith(SERVER, { plexUserId: 'member-plex', isOwner: false }, { all: false, sections: new Set(['1']) })
    expect(recentlyWatched).toHaveBeenCalledWith('member-plex', { all: false, sections: new Set(['1']) })
  })

  it('loads the rest of the page while Plex is down', async () => {
    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)

    const data = await getReportPageData('member-1', { q: 'heat' })

    expect(data).toMatchObject({ watching: null, recent: null, reports: [], search: { results: [], error: expect.any(String) } })
  })

  it('says why a title cannot be reported', async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: false, reason: 'NOT_FOUND' })

    expect((await getReportPageData('member-1', { item: '555' })).selected).toEqual({ error: "We couldn't find that title in your libraries." })
  })
})
