/**
 * readHistory: Tautulli `get_history` rows for one member or one title,
 * newest first, parsed down to what problem reports use. No IP address or
 * machine id survives the parse.
 */

import { readHistory } from '@/lib/connections/tautulli-history'

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const CONFIG = { url: 'http://tautulli.lan:8181', apiKey: 'tautulli-key' }
const ROW = {
  rating_key: 7001, parent_rating_key: 7000, grandparent_rating_key: 6999, media_type: 'episode', title: 'Pilot',
  grandparent_title: 'The Office', parent_media_index: 1, media_index: 1, year: 2005, section_id: 2,
  started: 1762700000, date: 1762700000, player: 'Living Room', transcode_decision: 'transcode', watched_status: 1,
  ip_address: '10.0.0.5', machine_id: 'abc123', user: 'someone',
}
const envelope = (data: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ response: { result: 'success', message: null, data } }) })

beforeEach(() => {
  global.fetch = jest.fn()
})

describe('readHistory', () => {
  it("reads a member's plays of a title, without their address or device id", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(envelope({ recordsTotal: 1, data: [ROW, { rating_key: 'x' }] }))

    const rows = await readHistory(CONFIG, { user_id: 42, rating_key: '7001', length: 1 })

    expect(rows).toEqual([
      {
        ratingKey: '7001', grandparentRatingKey: '6999', mediaType: 'episode', title: 'Pilot', showTitle: 'The Office',
        seasonNumber: 1, episodeNumber: 1, year: 2005, sectionId: '2', playedAt: new Date(1762700000 * 1000),
        player: 'Living Room', transcoded: true, watched: true,
      },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/10\.0\.0\.5|abc123|someone/)
    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ cmd: 'get_history', user_id: '42', rating_key: '7001', length: '1' })
  })

  it('reads a movie row without show fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(
      envelope({ data: [{ ...ROW, rating_key: '555', parent_rating_key: '', grandparent_rating_key: '', media_type: 'movie', title: 'Heat', grandparent_title: '', parent_media_index: '', media_index: '', transcode_decision: 'direct play', watched_status: 0.5 }] })
    )

    const [row] = (await readHistory(CONFIG, { rating_key: '555', length: 10 })) ?? []

    expect(row).toMatchObject({ ratingKey: '555', mediaType: 'movie', grandparentRatingKey: undefined, showTitle: undefined, transcoded: false, watched: false })
  })

  it('reports a failed read as null', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) })

    expect(await readHistory(CONFIG, { user_id: 42, length: 50 })).toBeNull()
  })
})
