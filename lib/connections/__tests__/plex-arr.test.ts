/**
 * Tests for findArrTitle: a Plex item to its Radarr movie or Sonarr series by
 * the ids Plex holds, never by title. Plex, Radarr and Sonarr answer with
 * recorded responses at `fetch`.
 */

import movieByTmdb from './fixtures/arr/radarr-movie-by-tmdb.json'
import seriesByTvdb from './fixtures/arr/sonarr-series-by-tvdb.json'
import { findArrTitle } from '@/lib/connections/plex-arr'
import { getActiveService } from '@/lib/data/active-service'

jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const PLEX = jest.requireActual<Record<'movie' | 'legacyMovie' | 'episode' | 'show', unknown>>(
  './fixtures/plex-metadata.json'
)
const SERVER = { url: 'http://plex.local:32400', token: 'owner-token' }
const RADARR = { name: 'Radarr', url: 'http://radarr.lan:7878', apiKey: 'radarr-key', publicUrl: null }
const SONARR = { name: 'Sonarr', url: 'http://sonarr.lan:8989', apiKey: 'sonarr-key', publicUrl: null }

const mockFetch = jest.fn()
let responses: Record<string, unknown> = {}

const plexItem = (ratingKey: string) => `${SERVER.url}/library/metadata/${ratingKey}?includeGuids=1`
const requested = () => mockFetch.mock.calls.map(([url]) => String(url))

beforeEach(() => {
  responses = {}
  mockFetch.mockReset()
  mockFetch.mockImplementation(async (input: unknown) => {
    const url = String(input)
    return url in responses
      ? { ok: true, status: 200, headers: new Headers(), json: async () => responses[url] }
      : { ok: false, status: 404, headers: new Headers(), json: async () => ({}) }
  })
  global.fetch = mockFetch as unknown as typeof fetch
  jest.mocked(getActiveService).mockImplementation((async (kind: string) =>
    kind === 'radarr' ? RADARR : kind === 'sonarr' ? SONARR : null) as typeof getActiveService)
})

describe('findArrTitle', () => {
  it("finds a movie in Radarr by its TMDB id", async () => {
    responses[plexItem('555')] = PLEX.movie
    responses[`${RADARR.url}/api/v3/movie?tmdbId=550`] = movieByTmdb

    expect(await findArrTitle(SERVER, '555')).toEqual({ service: 'radarr', id: 9, titleSlug: '550' })
    expect(mockFetch.mock.calls[1][1].headers['X-Api-Key']).toBe('radarr-key')
  })

  it("finds a legacy agent's movie by the IMDb id in its guid", async () => {
    responses[plexItem('556')] = PLEX.legacyMovie
    responses[`${RADARR.url}/api/v3/movie`] = movieByTmdb

    expect(await findArrTitle(SERVER, '556')).toEqual({ service: 'radarr', id: 9, titleSlug: '550' })
  })

  it("finds an episode's series through its show", async () => {
    responses[plexItem('7001')] = PLEX.episode
    responses[plexItem('6999')] = PLEX.show
    responses[`${SONARR.url}/api/v3/series?tvdbId=73244`] = seriesByTvdb

    expect(await findArrTitle(SERVER, '7001')).toEqual({ service: 'sonarr', id: 7, titleSlug: 'the-office-us' })
    expect(requested()).not.toContain(`${SONARR.url}/api/v3/series?tvdbId=110413`)
  })

  it('finds a show in Sonarr by its TVDB id', async () => {
    responses[plexItem('6999')] = PLEX.show
    responses[`${SONARR.url}/api/v3/series?tvdbId=73244`] = seriesByTvdb

    expect(await findArrTitle(SERVER, '6999')).toEqual({ service: 'sonarr', id: 7, titleSlug: 'the-office-us' })
  })

  it("finds nothing for an id Radarr doesn't have", async () => {
    responses[plexItem('555')] = PLEX.movie
    responses[`${RADARR.url}/api/v3/movie?tmdbId=550`] = []
    responses[`${RADARR.url}/api/v3/movie`] = []

    expect(await findArrTitle(SERVER, '555')).toBeNull()
  })

  it('asks nothing of Radarr for an item without ids', async () => {
    responses[plexItem('557')] = {
      MediaContainer: { librarySectionID: 1, Metadata: [{ ratingKey: '557', type: 'movie', title: 'Home Video', guid: 'local://557' }] },
    }

    expect(await findArrTitle(SERVER, '557')).toBeNull()
    expect(requested()).toEqual([plexItem('557')])
  })

  it('asks nothing of Radarr without an active Radarr', async () => {
    responses[plexItem('555')] = PLEX.movie
    jest.mocked(getActiveService).mockResolvedValue(null)

    expect(await findArrTitle(SERVER, '555')).toBeNull()
    expect(requested()).toEqual([plexItem('555')])
  })

  it('finds nothing when Plex has no such item', async () => {
    expect(await findArrTitle(SERVER, '999')).toBeNull()
    expect(requested()).toEqual([plexItem('999')])
  })

  it('finds nothing when Radarr fails', async () => {
    responses[plexItem('555')] = PLEX.movie

    expect(await findArrTitle(SERVER, '555')).toBeNull()
  })

  it('finds nothing for a type Radarr and Sonarr do not hold', async () => {
    responses[plexItem('800')] = {
      MediaContainer: { Metadata: [{ ratingKey: '800', type: 'season', title: 'Season 1', Guid: [{ id: 'tvdb://30001' }] }] },
    }

    expect(await findArrTitle(SERVER, '800')).toBeNull()
    expect(requested()).toEqual([plexItem('800')])
  })
})
