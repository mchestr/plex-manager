/**
 * Tests for getPlexItemMetadata: one item's ids, section, files and folders
 * from `GET /library/metadata/{ratingKey}?includeGuids=1`.
 */

import { getPlexItemMetadata } from '@/lib/connections/plex-metadata'

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const FIXTURES = jest.requireActual<Record<'movie' | 'legacyMovie' | 'episode' | 'show', unknown>>(
  './fixtures/plex-metadata.json'
)
const SERVER = { url: 'http://plex.local:32400', token: 'owner-token' }

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, statusText: 'OK', json: () => Promise.resolve(body) }
}

function abortError() {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

beforeEach(() => {
  global.fetch = jest.fn()
})

describe('getPlexItemMetadata', () => {
  it("reads a movie's ids, section and files with the owner token", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(FIXTURES.movie))

    const lookup = await getPlexItemMetadata(SERVER, '555')

    expect(lookup).toEqual({
      status: 'found',
      item: {
        ratingKey: '555',
        type: 'movie',
        title: 'Fight Club',
        year: 1999,
        addedAt: 1700000000,
        guid: 'plex://movie/5d776b59ad5437001f79c6f8',
        ids: { imdb: 'tt0137523', tmdb: 550, tvdb: 194 },
        librarySectionId: '1',
        media: [{ optimized: false, parts: [{ file: '/data/movies/Fight Club (1999)/Fight Club (1999) Bluray-1080p.mkv', size: 10947358412 }] }],
        locations: [],
      },
    })
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://plex.local:32400/library/metadata/555?includeGuids=1')
    expect(url).not.toContain('owner-token')
    expect(init.headers['X-Plex-Token']).toBe('owner-token')
    expect(init.headers.Accept).toBe('application/json')
  })

  it('reads the ids of a legacy agent from its guid', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(FIXTURES.legacyMovie))

    const lookup = await getPlexItemMetadata(SERVER, '556')

    expect(lookup).toMatchObject({ status: 'found', item: { ids: { imdb: 'tt0137523' }, librarySectionId: '4' } })
  })

  it("reads an episode's show", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(FIXTURES.episode))

    const lookup = await getPlexItemMetadata(SERVER, '7001')

    expect(lookup).toMatchObject({
      status: 'found',
      item: {
        type: 'episode',
        title: 'Pilot',
        grandparentRatingKey: '6999',
        showTitle: 'The Office',
        seasonNumber: 1,
        episodeNumber: 1,
        ids: { tvdb: 110413 },
      },
    })
  })

  it("reads a show's folders", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(FIXTURES.show))

    const lookup = await getPlexItemMetadata(SERVER, '6999')

    expect(lookup).toMatchObject({
      status: 'found',
      item: { type: 'show', ids: { tvdb: 73244 }, locations: ['/data/tv/The Office (US)'], media: [] },
    })
  })

  it("keeps each version's files apart and marks the versions Plex optimized", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: '555',
              type: 'movie',
              title: 'Up',
              Media: [
                { Part: [{ file: '/movies/Up (2009)/Up CD1.mkv', size: 1 }, { file: '/movies/Up (2009)/Up CD2.mkv', size: 2 }] },
                { proxyType: 42, Part: [{ file: '/optimized/Up.mp4' }] },
                { proxyType: 'odd' },
              ],
            },
          ],
        },
      })
    )

    expect(await getPlexItemMetadata(SERVER, '555')).toMatchObject({
      status: 'found',
      item: {
        media: [
          { optimized: false, parts: [{ file: '/movies/Up (2009)/Up CD1.mkv', size: 1 }, { file: '/movies/Up (2009)/Up CD2.mkv', size: 2 }] },
          { optimized: true, parts: [{ file: '/optimized/Up.mp4' }] },
          { optimized: false, parts: [] },
        ],
      },
    })
  })

  it('takes the section from the container when the item has none', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ MediaContainer: { librarySectionID: '3', Metadata: [{ ratingKey: '555', type: 'movie', title: 'Up' }] } })
    )

    expect(await getPlexItemMetadata(SERVER, '555')).toMatchObject({ status: 'found', item: { librarySectionId: '3' } })
  })

  it('reports a Plex 404 as a missing item', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 404))

    expect(await getPlexItemMetadata(SERVER, '555')).toEqual({ status: 'missing' })
  })

  it.each([
    ['a Plex 401', () => Promise.resolve(jsonResponse({}, 401))],
    ['a Plex 500', () => Promise.resolve(jsonResponse({}, 500))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
    ['an aborted request', () => Promise.reject(abortError())],
    ['a container without items', () => Promise.resolve(jsonResponse({ MediaContainer: { size: 0 } }))],
    ['an item without a title', () => Promise.resolve(jsonResponse({ MediaContainer: { Metadata: [{ ratingKey: '555', type: 'movie' }] } }))],
  ])('reports %s as unknown', async (_label, response) => {
    ;(global.fetch as jest.Mock).mockImplementation(response)

    expect(await getPlexItemMetadata(SERVER, '555')).toEqual({ status: 'unknown' })
  })

  it('times out a body that stalls', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(abortError()))),
      })
    )

    const started = Date.now()
    expect(await getPlexItemMetadata(SERVER, '555', { timeoutMs: 50 })).toEqual({ status: 'unknown' })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it.each(['../555', '555/children', '555?x=1', 'abc', ''])(
    'rejects the rating key %p before any request',
    async (ratingKey) => {
      expect(await getPlexItemMetadata(SERVER, ratingKey)).toEqual({ status: 'missing' })
      expect(global.fetch).not.toHaveBeenCalled()
    }
  )
})
