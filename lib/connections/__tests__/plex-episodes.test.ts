/**
 * Tests for getPlexShowEpisodes: a show's episodes from
 * `GET /library/metadata/{ratingKey}/allLeaves`, in season and episode order,
 * with every version's files.
 */

import { getPlexShowEpisodes } from '@/lib/connections/plex-episodes'

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const SERVER = { url: 'http://plex.local:32400', token: 'owner-token' }
const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 300, status, json: () => Promise.resolve(body) })

const ALL_LEAVES = {
  MediaContainer: {
    size: 3,
    librarySectionID: 2,
    Metadata: [
      { ratingKey: '7012', type: 'episode', title: 'Diversity Day', parentIndex: 1, index: 2 },
      {
        ratingKey: '7001',
        type: 'episode',
        title: 'Pilot',
        parentIndex: 1,
        index: 1,
        Media: [{ Part: [{ file: '/tv/The Office/Season 1/S01E01.mkv' }] }, { Part: [{ file: '/tv/The Office/Season 1/S01E01.720p.mkv' }] }],
      },
      { ratingKey: '7101', type: 'episode', title: 'The Dundies', parentIndex: 2, index: 1 },
      { ratingKey: '7999', type: 'episode', title: 'Special' },
    ],
  },
}

beforeEach(() => {
  global.fetch = jest.fn()
})

describe('getPlexShowEpisodes', () => {
  it("lists a show's numbered episodes in order", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse(ALL_LEAVES))

    const result = await getPlexShowEpisodes(SERVER, '6999')

    expect(result).toEqual({
      ok: true,
      episodes: [
        { ratingKey: '7001', title: 'Pilot', seasonNumber: 1, episodeNumber: 1, files: ['/tv/The Office/Season 1/S01E01.mkv', '/tv/The Office/Season 1/S01E01.720p.mkv'] },
        { ratingKey: '7012', title: 'Diversity Day', seasonNumber: 1, episodeNumber: 2, files: [] },
        { ratingKey: '7101', title: 'The Dundies', seasonNumber: 2, episodeNumber: 1, files: [] },
      ],
    })
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('http://plex.local:32400/library/metadata/6999/allLeaves')
    expect(init.headers['X-Plex-Token']).toBe('owner-token')
  })

  it('reports a failed read', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, 500))

    expect(await getPlexShowEpisodes(SERVER, '6999')).toEqual({ ok: false })
  })

  it('rejects a rating key that is not digits before any request', async () => {
    expect(await getPlexShowEpisodes(SERVER, '6999/../1')).toEqual({ ok: false })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
