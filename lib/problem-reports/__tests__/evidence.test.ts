/**
 * Report evidence from Tautulli: the reporter's last play of the title, and
 * whether it has played to the end since its file was added. Every failure
 * is soft.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildUser } from '@/__tests__/helpers/factories'
import { readHistory, type HistoryRow } from '@/lib/connections/tautulli-history'
import { getActiveService } from '@/lib/data/active-service'
import { memberLastPlay, readEvidence, tautulliUserIdOf } from '@/lib/problem-reports/evidence'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/connections/tautulli-history', () => ({ readHistory: jest.fn() }))
jest.mock('@/lib/data/active-service', () => ({ getActiveService: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const TAUTULLI = { url: 'http://tautulli.lan:8181', apiKey: 'key' }
const ONCE = { timeoutMs: 3000, attempts: 1 }
const ADDED = Date.parse('2026-10-01T00:00:00Z') / 1000
const play = (overrides: Partial<HistoryRow>): HistoryRow => ({
  ratingKey: '555', mediaType: 'movie', title: 'Heat', playedAt: new Date('2026-11-08T20:00:00Z'), transcoded: false, watched: false, ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockReset(prismaMock)
  jest.mocked(getActiveService).mockResolvedValue(TAUTULLI as never)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: '42' }))
})

describe('readEvidence', () => {
  it("records the member's last play and a full play since the file was added", async () => {
    jest.mocked(readHistory).mockImplementation(async (_config, params) =>
      params.user_id === 42
        ? [play({ player: 'Living Room', transcoded: true })]
        : [play({ watched: true, playedAt: new Date('2026-11-01T20:00:00Z') }), play({ watched: true, playedAt: new Date('2026-09-01T20:00:00Z') })]
    )

    const evidence = await readEvidence('member-1', { ratingKey: '555', type: 'movie', addedAt: ADDED })

    expect(evidence).toEqual({ lastPlay: { player: 'Living Room', transcoded: true, at: '2026-11-08T20:00:00.000Z' }, playedToEnd: true })
    expect(readHistory).toHaveBeenCalledWith(TAUTULLI, { user_id: 42, rating_key: '555', length: 1 }, ONCE)
    expect(readHistory).toHaveBeenCalledWith(TAUTULLI, { rating_key: '555', length: 50 }, ONCE)
  })

  it("reads a show's last play from its episodes, and says nothing about full plays", async () => {
    jest.mocked(readHistory).mockResolvedValue([play({ ratingKey: '7001', mediaType: 'episode', player: 'Phone' })])

    expect(await readEvidence('member-1', { ratingKey: '6999', type: 'show', addedAt: ADDED })).toEqual({
      lastPlay: { player: 'Phone', transcoded: false, at: '2026-11-08T20:00:00.000Z' },
      playedToEnd: null,
    })
    expect(readHistory).toHaveBeenCalledTimes(1)
    expect(readHistory).toHaveBeenCalledWith(TAUTULLI, { user_id: 42, grandparent_rating_key: '6999', length: 1 }, ONCE)
  })

  it('counts only full plays of the current file', async () => {
    jest.mocked(readHistory).mockImplementation(async (_config, params) =>
      params.user_id ? [] : [play({ watched: true, playedAt: new Date('2026-09-01T20:00:00Z') }), play({ watched: false })]
    )

    expect(await readEvidence('member-1', { ratingKey: '555', type: 'movie', addedAt: ADDED })).toEqual({
      lastPlay: null,
      playedToEnd: false,
    })
  })

  it.each([
    ['no Tautulli', () => jest.mocked(getActiveService).mockResolvedValue(null)],
    ['a database error', () => jest.mocked(getActiveService).mockRejectedValue(new Error('connection lost'))],
  ])('knows nothing with %s', async (_label, arrange) => {
    arrange()

    expect(await readEvidence('member-1', { ratingKey: '555', type: 'movie' })).toEqual({ lastPlay: null, playedToEnd: null })
  })

  it('knows no last play for a member without a numeric Plex id', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ plexUserId: 'not-a-plex-id' }))
    jest.mocked(readHistory).mockResolvedValue(null)

    expect(await readEvidence('member-1', { ratingKey: '555', type: 'movie' })).toEqual({ lastPlay: null, playedToEnd: null })
  })
})

describe('memberLastPlay', () => {
  it("reads the member's last play of a title", async () => {
    jest.mocked(readHistory).mockResolvedValue([play({ player: 'Phone' })])

    expect(await memberLastPlay('42', { ratingKey: '555', type: 'movie' })).toEqual({ player: 'Phone', transcoded: false, at: '2026-11-08T20:00:00.000Z' })
    expect(readHistory).toHaveBeenCalledWith(TAUTULLI, { user_id: 42, rating_key: '555', length: 1 }, ONCE)
  })

  it("reads a show's last play from its episodes", async () => {
    jest.mocked(readHistory).mockResolvedValue([play({ ratingKey: '7001', mediaType: 'episode' })])

    expect(await memberLastPlay('42', { ratingKey: '6999', type: 'show' })).not.toBeNull()
    expect(readHistory).toHaveBeenCalledWith(TAUTULLI, { user_id: 42, grandparent_rating_key: '6999', length: 1 }, ONCE)
  })

  it('is null for a member without a Plex account', async () => {
    expect(await memberLastPlay(null, { ratingKey: '555', type: 'movie' })).toBeNull()
    expect(readHistory).not.toHaveBeenCalled()
  })
})

describe('tautulliUserIdOf', () => {
  it.each([
    ['42', 42],
    ['not-a-plex-id', null],
    ['', null],
    [null, null],
  ])('reads %p as %p', (plexUserId, expected) => {
    expect(tautulliUserIdOf(plexUserId)).toBe(expected)
  })
})
