/**
 * Watching now and Recently watched on /report: only the member's own
 * streams, only their libraries, and one row per movie or show.
 */

import { getPlexSessions } from '@/lib/connections/plex'
import { readHistory, type HistoryRow } from '@/lib/connections/tautulli-history'
import { getActiveService } from '@/lib/data/active-service'
import { recentlyWatched, watchingNow } from '@/lib/member/problem-report-titles'
import { tautulliUserIdOf } from '@/lib/problem-reports/evidence'

jest.mock('@/lib/connections/plex', () => ({ getPlexSessions: jest.fn() }))
jest.mock('@/lib/connections/tautulli-history', () => ({ readHistory: jest.fn() }))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
jest.mock('@/lib/problem-reports/evidence', () => ({ tautulliUserIdOf: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const SERVER = { name: 'Home', url: 'http://plex.local:32400', token: 'owner-token', adminPlexUserId: 'owner', machineIdentifier: 'm' }
const SECTION_1 = { all: false as const, sections: new Set(['1']) }
const MEMBER = { plexUserId: '42', isOwner: false }

const session = (overrides: Record<string, unknown>) => ({
  ratingKey: '7001', type: 'episode', title: 'Pilot', grandparentTitle: 'The Office', grandparentRatingKey: '6999',
  parentIndex: 1, index: 1, librarySectionID: '1', User: { id: '42' }, ...overrides,
})
const play = (overrides: Partial<HistoryRow>): HistoryRow => ({
  ratingKey: '555', mediaType: 'movie', title: 'Heat', year: 1995, sectionId: '1', playedAt: new Date('2026-11-08T20:00:00Z'), transcoded: false, watched: true, ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getActiveService).mockResolvedValue({ url: 'http://tautulli.lan:8181', apiKey: 'key' } as never)
  jest.mocked(tautulliUserIdOf).mockResolvedValue(42)
})

describe('watchingNow', () => {
  it("lists the member's own streams in their libraries, each once", async () => {
    jest.mocked(getPlexSessions).mockResolvedValue({
      success: true,
      data: {
        MediaContainer: {
          Metadata: [
            session({}),
            session({ Player: { title: 'Phone' } }),
            session({ ratingKey: '8001', title: 'Someone else', User: { id: '77' } }),
            session({ ratingKey: '9001', title: 'Unshared', librarySectionID: '9' }),
            session({ ratingKey: '9101', type: 'track', title: 'A song' }),
          ],
        },
      },
    })

    expect(await watchingNow(SERVER, MEMBER, SECTION_1)).toEqual([
      { ratingKey: '7001', type: 'episode', title: 'The Office S1E1: Pilot', posterKey: '6999' },
    ])
  })

  it("counts the owner's streams as Plex user 1", async () => {
    jest.mocked(getPlexSessions).mockResolvedValue({ success: true, data: { MediaContainer: { Metadata: [session({ User: { id: '1' } })] } } })

    expect(await watchingNow(SERVER, { plexUserId: 'owner', isOwner: true }, { all: true })).toHaveLength(1)
  })

  it('is null when Plex cannot be read, and empty without a Plex account', async () => {
    jest.mocked(getPlexSessions).mockResolvedValue({ success: false, error: 'Plex returned HTTP 500' })

    expect(await watchingNow(SERVER, MEMBER, SECTION_1)).toBeNull()
    expect(await watchingNow(SERVER, { plexUserId: null, isOwner: false }, SECTION_1)).toEqual([])
  })
})

describe('recentlyWatched', () => {
  it('lists one row per movie and per show, newest first, in the member libraries', async () => {
    jest.mocked(readHistory).mockResolvedValue([
      play({ ratingKey: '7012', mediaType: 'episode', title: 'Diversity Day', grandparentRatingKey: '6999', showTitle: 'The Office', seasonNumber: 1, episodeNumber: 2 }),
      play({ ratingKey: '7001', mediaType: 'episode', title: 'Pilot', grandparentRatingKey: '6999', showTitle: 'The Office', seasonNumber: 1, episodeNumber: 1 }),
      play({}),
      play({}),
      play({ ratingKey: '556', title: 'Unshared', sectionId: '9' }),
    ])

    expect(await recentlyWatched('member-1', SECTION_1)).toEqual([
      { ratingKey: '7012', type: 'episode', title: 'The Office S1E2: Diversity Day', posterKey: '6999' },
      { ratingKey: '555', type: 'movie', title: 'Heat (1995)', posterKey: '555' },
    ])
    expect(readHistory).toHaveBeenCalledWith({ url: 'http://tautulli.lan:8181', apiKey: 'key' }, { user_id: 42, length: 100 })
  })

  it('is empty for a member Tautulli does not know, and null without Tautulli', async () => {
    jest.mocked(tautulliUserIdOf).mockResolvedValue(null)
    expect(await recentlyWatched('member-1', SECTION_1)).toEqual([])

    jest.mocked(getActiveService).mockResolvedValue(null)
    expect(await recentlyWatched('member-1', SECTION_1)).toBeNull()
  })

  it('is null when Tautulli fails', async () => {
    jest.mocked(readHistory).mockResolvedValue(null)
    expect(await recentlyWatched('member-1', SECTION_1)).toBeNull()

    jest.mocked(getActiveService).mockRejectedValue(new Error('connection lost'))
    expect(await recentlyWatched('member-1', SECTION_1)).toBeNull()
  })
})
