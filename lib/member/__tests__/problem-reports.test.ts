/**
 * What /report shows a member: their reports and the ones they follow, a
 * search filtered to their libraries, and the open sheet's title with its
 * episodes and open report.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { getPlexShowEpisodes, searchPlexMedia, type PlexItemMetadata } from '@/lib/connections/plex'
import { getActiveService } from '@/lib/data/active-service'
import { getActivePlexServerConfig } from '@/lib/connections/plex-config'
import { recentlyWatched, watchingNow } from '@/lib/member/problem-report-titles'
import { getReportPageData } from '@/lib/member/problem-reports'
import { memberLibraryAccess, readMemberItem } from '@/lib/problem-reports/access'
import { readEvidence } from '@/lib/problem-reports/evidence'
import { memberFixesFor } from '@/lib/problem-reports/member-swap'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/plex', () => ({ getPlexShowEpisodes: jest.fn(), searchPlexMedia: jest.fn() }))
jest.mock('@/lib/connections/plex-config', () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock('@/lib/member/problem-report-titles', () => ({ watchingNow: jest.fn(), recentlyWatched: jest.fn() }))
jest.mock('@/lib/problem-reports/evidence', () => ({ readEvidence: jest.fn() }))
jest.mock('@/lib/problem-reports/member-swap', () => ({ memberFixesFor: jest.fn() }))
jest.mock('@/lib/settings/app-settings', () => ({
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'UTC', locale: 'en-US' }),
}))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
jest.mock('@/lib/problem-reports/access', () => ({
  ...jest.requireActual('@/lib/problem-reports/access'),
  memberLibraryAccess: jest.fn(),
  readMemberItem: jest.fn(),
}))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }
const SHOW: PlexItemMetadata = { ratingKey: '6999', type: 'show', title: 'The Office', year: 2005, guid: 'plex://show/office', ids: {}, librarySectionId: '2', media: [], locations: [] }
const AT = new Date('2026-11-09T15:00:00Z')

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  prismaMock.problemReport.findMany.mockResolvedValue([])
  prismaMock.problemReportEvent.findMany.mockResolvedValue([])
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId: 'member-plex' } as never)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(SERVER)
  jest.mocked(memberLibraryAccess).mockResolvedValue({ all: false, sections: new Set(['1']) })
  jest.mocked(watchingNow).mockResolvedValue([])
  jest.mocked(recentlyWatched).mockResolvedValue([])
  jest.mocked(readEvidence).mockResolvedValue({ lastPlay: null, playedToEnd: null })
  jest.mocked(memberFixesFor).mockResolvedValue({ swap: null, matchFixes: false })
  jest.mocked(getActiveService).mockResolvedValue(null)
})

describe('getReportPageData', () => {
  it("lists the member's reports and the ones they follow, in words", async () => {
    const report = { problem: 'wont_start', status: 'WITH_ADMIN', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: null }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'own', reporterId: 'member-1', events: [] },
      { ...report, id: 'followed', reporterId: 'member-2', events: [{ kind: 'ALSO_REPORTED', data: {}, createdAt: AT }] },
      { ...report, id: 'cancelled', reporterId: 'member-1', status: 'CLOSED', events: [{ kind: 'CLOSED', data: { reason: 'cancelled' }, createdAt: AT }] },
      {
        ...report,
        id: 'cancelled-followed',
        reporterId: 'member-2',
        status: 'CLOSED',
        // The newest step, as the query takes it: the reporter's cancel after this member followed
        events: [{ kind: 'CLOSED', data: { reason: 'cancelled' }, createdAt: AT }],
      },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports).toEqual([
      { id: 'own', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: 'You sent it', at: AT.toISOString() }, canCancel: true, canAsk: false, askPlays: false, statusSub: null, note: null },
      { id: 'followed', title: 'Heat (1995)', problem: "Won't start", status: 'WITH_ADMIN', latest: { words: "You're following it", at: AT.toISOString() }, canCancel: false, canAsk: false, askPlays: false, statusSub: null, note: null },
      { id: 'cancelled', title: 'Heat (1995)', problem: "Won't start", status: 'CLOSED', latest: { words: 'You cancelled it', at: AT.toISOString() }, canCancel: false, canAsk: false, askPlays: false, statusSub: 'Cancelled', note: null },
      {
        id: 'cancelled-followed',
        title: 'Heat (1995)',
        problem: "Won't start",
        status: 'CLOSED',
        latest: { words: 'The member who reported it cancelled it', at: AT.toISOString() },
        canCancel: false,
        canAsk: false, askPlays: false,
        statusSub: 'By the member who reported it',
        note: null,
      },
    ])
  })

  it("says what a running fix is doing, and when a fix found the missing episodes", async () => {
    const report = { problem: 'missing_episodes', title: 'The Office', year: 2005, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: null }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'fixing', reporterId: 'member-1', status: 'FIXING', action: 'LOOK_FOR_MISSING', events: [] },
      { ...report, id: 'found', reporterId: 'member-1', status: 'FIXED', action: 'LOOK_FOR_MISSING', events: [{ kind: 'FIXED', data: { reason: 'fix', action: 'LOOK_FOR_MISSING' }, createdAt: AT }] },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports.map(({ id, latest, statusSub }) => ({ id, words: latest.words, statusSub }))).toEqual([
      { id: 'fixing', words: 'You sent it', statusSub: 'Looking for the episodes' },
      { id: 'found', words: 'The missing episodes are on the server now', statusSub: null },
    ])
  })

  it("shows a report whose swap is only a dry run as with the server admin", async () => {
    const report = { problem: 'wont_start', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: null, reporterId: 'member-1', action: 'SWAP', events: [] }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'dry', status: 'FIXING' },
      { ...report, id: 'real', status: 'FIXING' },
      { ...report, id: 'sent', status: 'WITH_ADMIN' },
    ] as never)
    prismaMock.problemReportEvent.findMany.mockResolvedValue([
      { reportId: 'dry', data: { action: 'SWAP', trigger: 'automatic', dryRun: true } },
      { reportId: 'real', data: { action: 'SWAP', trigger: 'web' } },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports.map(({ id, status, statusSub }) => ({ id, status, statusSub }))).toEqual([
      { id: 'dry', status: 'WITH_ADMIN', statusSub: null },
      { id: 'real', status: 'FIXING', statusSub: 'Swapping the copy' },
      { id: 'sent', status: 'WITH_ADMIN', statusSub: null },
    ])
    expect(prismaMock.problemReportEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { reportId: { in: ['dry', 'real'] }, kind: 'FIX_STARTED' } }))
  })

  it('says when a better copy came, or none did, and lets the member who reported it ask the server admin once', async () => {
    const report = { problem: 'blurry', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: null }
    const none = { kind: 'CLOSED', data: { reason: 'no_better_copy' }, createdAt: AT }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'better', reporterId: 'member-1', status: 'FIXED', action: 'BETTER_COPY', events: [{ kind: 'FIXED', data: { reason: 'fix', action: 'BETTER_COPY' }, createdAt: AT }] },
      { ...report, id: 'swapped', reporterId: 'member-1', status: 'FIXED', action: 'SWAP', events: [{ kind: 'FIXED', data: { reason: 'fix', action: 'SWAP', release: 'Heat.GOOD', blocklisted: true }, createdAt: AT }] },
      { ...report, id: 'none', reporterId: 'member-1', status: 'CLOSED', action: 'BETTER_COPY', events: [none] },
      { ...report, id: 'none-followed', reporterId: 'member-2', status: 'CLOSED', action: 'BETTER_COPY', events: [none] },
      { ...report, id: 'asked', reporterId: 'member-1', status: 'WITH_ADMIN', action: 'BETTER_COPY', events: [{ kind: 'REOPENED', data: null, createdAt: AT }] },
      { ...report, id: 'asked-followed', reporterId: 'member-2', status: 'WITH_ADMIN', action: 'BETTER_COPY', events: [{ kind: 'REOPENED', data: null, createdAt: AT }] },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports.map(({ id, latest, statusSub, canAsk }) => ({ id, words: latest.words, statusSub, canAsk }))).toEqual([
      { id: 'better', words: 'A better copy is on the server now', statusSub: null, canAsk: false },
      { id: 'swapped', words: 'A different copy is on the server now', statusSub: null, canAsk: false },
      { id: 'none', words: "We looked, but there's no better copy right now", statusSub: 'No better copy right now', canAsk: true },
      { id: 'none-followed', words: "We looked, but there's no better copy right now", statusSub: 'No better copy right now', canAsk: false },
      { id: 'asked', words: 'You sent it to the server admin', statusSub: null, canAsk: false },
      { id: 'asked-followed', words: "It's with the server admin now", statusSub: null, canAsk: false },
    ])
  })

  it('asks the member who reported a swapped title whether it plays, for 7 days and until they answer', async () => {
    jest.useFakeTimers({ now: new Date(AT.getTime() + 6 * 24 * 60 * 60 * 1000), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
    const report = { problem: 'wont_start', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: null, status: 'FIXED' }
    const fixed = (action: string) => [{ kind: 'FIXED', data: { reason: 'fix', action }, createdAt: AT }]
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'swapped', reporterId: 'member-1', action: 'SWAP', events: fixed('SWAP') },
      { ...report, id: 'removed', reporterId: 'member-1', action: 'REMOVE_AND_SEARCH', events: fixed('REMOVE_AND_SEARCH') },
      { ...report, id: 'answered', reporterId: 'member-1', action: 'SWAP', events: [{ kind: 'PLAYS', data: null, createdAt: AT }] },
      { ...report, id: 'followed', reporterId: 'member-2', action: 'SWAP', events: fixed('SWAP') },
      { ...report, id: 'better', reporterId: 'member-1', action: 'BETTER_COPY', events: fixed('BETTER_COPY') },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})
    expect(reports.map(({ id, askPlays, latest }) => ({ id, askPlays, words: latest.words }))).toEqual([
      { id: 'swapped', askPlays: true, words: 'A different copy is on the server now' },
      { id: 'removed', askPlays: true, words: 'A new copy is on the server now' },
      { id: 'answered', askPlays: false, words: 'You said it plays' },
      { id: 'followed', askPlays: false, words: 'A different copy is on the server now' },
      { id: 'better', askPlays: false, words: 'A better copy is on the server now' },
    ])

    jest.setSystemTime(new Date(AT.getTime() + 8 * 24 * 60 * 60 * 1000))
    expect((await getReportPageData('member-1', {})).reports[0].askPlays).toBe(false)
    jest.useRealTimers()
  })

  it("shows the server admin's note to the member who reported it, and only to them", async () => {
    const report = { problem: 'wont_start', title: 'Heat', year: 1995, showTitle: null, seasonNumber: null, episodeNumber: null, createdAt: AT, memberNote: 'Swapped the copy.' }
    prismaMock.problemReport.findMany.mockResolvedValue([
      { ...report, id: 'fixed', reporterId: 'member-1', status: 'FIXED', events: [{ kind: 'FIXED', data: { reason: 'admin' }, createdAt: AT }] },
      { ...report, id: 'closed', reporterId: 'member-1', status: 'CLOSED', events: [{ kind: 'CLOSED', data: { reason: 'admin' }, createdAt: AT }] },
      { ...report, id: 'followed', reporterId: 'member-2', status: 'FIXED', events: [{ kind: 'FIXED', data: { reason: 'admin' }, createdAt: AT }] },
    ] as never)

    const { reports } = await getReportPageData('member-1', {})

    expect(reports.map(({ id, latest, statusSub, note }) => ({ id, words: latest.words, statusSub, note }))).toEqual([
      { id: 'fixed', words: 'The server admin fixed it', statusSub: null, note: 'Swapped the copy.' },
      { id: 'closed', words: 'The server admin closed it', statusSub: 'By the server admin', note: 'Swapped the copy.' },
      { id: 'followed', words: 'The server admin fixed it', statusSub: null, note: null },
    ])
    expect(prismaMock.problemReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ events: expect.objectContaining({ where: { OR: [{ kind: { in: ['CLOSED', 'FIXED', 'REOPENED', 'PLAYS'] } }, { kind: 'ALSO_REPORTED', actorUserId: 'member-1' }] } }) }) })
    )
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

  it("opens a show's sheet with its episodes and its open report, and says which fixers are set up", async () => {
    jest.mocked(getActiveService).mockImplementation((async (kind: string) => (kind === 'sonarr' ? { id: 'sonarr-1' } : null)) as never)
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: SHOW, server: SERVER })
    jest.mocked(getPlexShowEpisodes).mockResolvedValue({ ok: true, episodes: [{ ratingKey: '7001', title: 'Pilot', seasonNumber: 1, episodeNumber: 1, files: [] }] })
    prismaMock.problemReport.findUnique.mockResolvedValue({ id: 'open', reporterId: 'member-2', problem: 'missing_episodes', status: 'WITH_ADMIN', updatedAt: AT, events: [] } as never)

    const { selected } = await getReportPageData('member-1', { item: '6999' })

    expect(selected).toEqual({
      ratingKey: '6999',
      type: 'show',
      title: 'The Office (2005)',
      episodes: [{ ratingKey: '7001', label: 'S1E1: Pilot' }],
      openReport: { id: 'open', problem: 'Episodes are missing', status: 'WITH_ADMIN', since: AT.toISOString(), yours: false },
      lastPlay: null,
      playedToEnd: null,
      fixers: { radarr: false, sonarr: true },
      swap: null,
      matchFixes: false,
    })
    expect(getActiveService).toHaveBeenCalledWith('sonarr')
    expect(getActiveService).toHaveBeenCalledWith('radarr')
    expect(readEvidence).toHaveBeenCalledWith('member-1', expect.objectContaining({ ratingKey: '6999', type: 'show' }))
    expect(memberFixesFor).toHaveBeenCalledWith({ userId: 'member-1', item: SHOW, server: SERVER, lastPlay: null }, expect.any(Function), expect.any(Date))
    expect(prismaMock.problemReport.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { activeKey: 'plex://show/office' } }))
  })

  it("shows another member's open report whose swap is only a dry run as with the server admin", async () => {
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...SHOW, ratingKey: '555', type: 'movie' }, server: SERVER })
    prismaMock.problemReport.findUnique.mockResolvedValue({ id: 'open', reporterId: 'member-2', problem: 'wont_start', status: 'FIXING', updatedAt: AT, events: [] } as never)
    prismaMock.problemReportEvent.findMany.mockResolvedValue([{ reportId: 'open', data: { action: 'SWAP', trigger: 'automatic', dryRun: true } }] as never)

    const { selected } = await getReportPageData('member-1', { item: '555' })

    expect(selected).toMatchObject({ openReport: { id: 'open', status: 'WITH_ADMIN' } })
  })

  it("passes on the member's swap offer and the evidence for a movie", async () => {
    const offer = { ok: true as const, left: 2, of: 3, nextBack: 'Nov 13' }
    jest.mocked(readMemberItem).mockResolvedValue({ ok: true, item: { ...SHOW, ratingKey: '555', type: 'movie' }, server: SERVER })
    jest.mocked(readEvidence).mockResolvedValue({ lastPlay: { player: 'Living Room', transcoded: false, at: AT.toISOString() }, playedToEnd: false })
    jest.mocked(memberFixesFor).mockResolvedValue({ swap: offer, matchFixes: true })

    const { selected } = await getReportPageData('member-1', { item: '555' })

    expect(selected).toMatchObject({ playedToEnd: false, swap: offer, matchFixes: true, lastPlay: { player: 'Living Room' } })
    const [, formatDay] = jest.mocked(memberFixesFor).mock.calls[0]
    expect(formatDay(new Date('2026-11-13T12:00:00Z'))).toBe('Nov 13')
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
