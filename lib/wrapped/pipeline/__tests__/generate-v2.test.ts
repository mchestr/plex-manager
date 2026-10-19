/**
 * @jest-environment node
 */

/**
 * The v2 body the generation job runs (P2.17): every fetch and the LLM call
 * take the run's signal, usage carries the generation id, the model never
 * sees an email, the stored data carries no roster, and failures are typed.
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { assembleWrappedData } from '@/lib/wrapped/assemble-wrapped'
import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import { fetchOverseerrStatistics } from '@/lib/wrapped/overseerr-statistics'
import { generateRewindV2 } from '@/lib/wrapped/pipeline/generate-v2'
import { RewindGenerationError } from '@/lib/wrapped/pipeline/generation-error'
import { fetchPlexServerStatistics } from '@/lib/wrapped/server-statistics'
import {
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/tautulli-statistics'
import { buildLeaderboards, buildValidOutput, LEADERBOARD_MEMBER_EMAIL } from '@/lib/wrapped/__tests__/fixtures'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/wrapped/llm', () => ({ generateWrappedWithLLM: jest.fn() }))
jest.mock('@/lib/wrapped/tautulli-statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))
jest.mock('@/lib/wrapped/server-statistics', () => ({ fetchPlexServerStatistics: jest.fn() }))
jest.mock('@/lib/wrapped/overseerr-statistics', () => ({ fetchOverseerrStatistics: jest.fn() }))

const EMAIL = 'member.private@example.com'
const llm = jest.mocked(generateWrappedWithLLM)
const signal = new AbortController().signal
const input = { userId: 'user-1', year: 2026, wrappedId: 'wrapped-1', generationId: 'gen-1', signal }

const HISTORY = {
  tautulliUserId: '7',
  totalWatchTime: 60480,
  moviesWatchTime: 20160,
  showsWatchTime: 40320,
  moviesWatched: 85,
  showsWatched: 23,
  episodesWatched: 412,
  topMovies: [{ title: 'Dune: Part Three', watchTime: 165, playCount: 1, ratingKey: '101' }],
  topShows: [{ title: 'Severance', watchTime: 900, playCount: 18, episodesWatched: 18, ratingKey: '202' }],
  watchTimeByMonth: [],
}

function setUp(user: { name: string | null } = { name: 'Test User' }) {
  prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: EMAIL, plexUserId: 'plex-1', ...user } as never)
  prismaMock.plexServer.findFirst.mockResolvedValue({ name: 'Home', url: 'http://plex', token: 't' } as never)
  prismaMock.tautulli.findFirst.mockResolvedValue({ url: 'http://tautulli', apiKey: 'k' } as never)
  prismaMock.overseerr.findFirst.mockResolvedValue({ url: 'http://overseerr', apiKey: 'o' } as never)
  jest.mocked(fetchTautulliStatistics).mockResolvedValue({ success: true, data: HISTORY } as never)
  jest.mocked(fetchPlexServerStatistics).mockResolvedValue({ success: false, error: 'down' })
  jest.mocked(fetchOverseerrStatistics).mockResolvedValue({ success: false, error: 'down' })
  const leaderboards = buildLeaderboards()
  jest.mocked(fetchTopContentLeaderboards).mockResolvedValue({ success: true, data: leaderboards.topContent })
  jest.mocked(fetchWatchTimeLeaderboard).mockResolvedValue({ success: true, data: leaderboards.watchTime.leaderboard })
  // The real assembly step, so the test sees exactly what would be stored
  llm.mockImplementation(async (args) => ({
    success: true,
    data: assembleWrappedData({
      output: buildValidOutput(),
      statistics: args.statistics,
      userId: args.userId,
      userName: args.displayName,
      year: args.year,
    }),
  }))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  setUp()
})

describe('generateRewindV2', () => {
  it('passes the run signal to every fetch and the LLM, and tags the LLM usage with the generation', async () => {
    await generateRewindV2(input)

    expect(fetchTautulliStatistics).toHaveBeenCalledWith(expect.anything(), { plexUserId: 'plex-1' }, 2026, null, signal)
    expect(fetchPlexServerStatistics).toHaveBeenCalledWith(expect.anything(), expect.anything(), signal)
    expect(fetchOverseerrStatistics).toHaveBeenCalledWith(
      expect.anything(),
      { plexUserId: 'plex-1', email: EMAIL },
      2026,
      signal
    )
    expect(jest.mocked(fetchTopContentLeaderboards).mock.calls[0].at(-1)).toBe(signal)
    expect(fetchWatchTimeLeaderboard).toHaveBeenCalledWith(expect.anything(), 2026, signal)
    expect(llm).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wrappedId: 'wrapped-1', generationId: 'gen-1', signal })
    )
  })

  it('gives the prompt the leaderboards but returns no roster to store', async () => {
    const data = await generateRewindV2(input)

    expect(llm.mock.calls[0][0].statistics.leaderboards?.watchTime.userPosition).toBe(2)
    const raw = JSON.stringify(data)
    expect(data.statistics).not.toHaveProperty('leaderboards')
    for (const leaked of ['leaderboard', LEADERBOARD_MEMBER_EMAIL, 'Jon Snow', 'Alice Smith', 'asmith']) {
      expect(raw).not.toContain(leaked)
    }
    expect(data.userName).toBe('Test User')
  })

  it.each([
    ['a null name', null],
    ['an email used as the name', EMAIL],
  ])('sends "there" to the model and stores "Viewer" for %s', async (_label, name) => {
    setUp({ name })

    const data = await generateRewindV2(input)

    const args = llm.mock.calls[0][0]
    expect(args.promptName).toBe('there')
    expect(args.displayName).toBe('Viewer')
    expect(JSON.stringify(args.statistics)).not.toContain(EMAIL)
    expect(JSON.stringify(data)).not.toContain(EMAIL)
  })

  it('leaves out the optional sections that fail', async () => {
    jest.mocked(fetchWatchTimeLeaderboard).mockResolvedValue({ success: false, error: 'down' })

    await generateRewindV2(input)

    const statistics = llm.mock.calls[0][0].statistics
    expect(statistics).not.toHaveProperty('serverStats')
    expect(statistics).not.toHaveProperty('overseerrStats')
    expect(statistics).not.toHaveProperty('leaderboards')
  })

  async function failure(): Promise<RewindGenerationError> {
    const error = await generateRewindV2(input).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RewindGenerationError)
    return error as RewindGenerationError
  }

  it('fails a member missing from Tautulli for good, and a failed history read for a retry', async () => {
    jest.mocked(fetchTautulliStatistics).mockResolvedValue({
      success: false,
      code: 'TAUTULLI_USER_NOT_FOUND',
      error: 'copy',
    })
    expect(await failure()).toMatchObject({ code: 'TAUTULLI_USER_NOT_FOUND', retryable: false })

    jest.mocked(fetchTautulliStatistics).mockResolvedValue({ success: false, error: 'timeout' })
    expect(await failure()).toMatchObject({ code: 'UPSTREAM_ERROR', retryable: true })
  })

  it('fails as NOT_CONFIGURED without an active Plex or Tautulli server, or an LLM provider', async () => {
    prismaMock.tautulli.findFirst.mockResolvedValue(null)
    expect(await failure()).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false })
    expect(fetchTautulliStatistics).not.toHaveBeenCalled()

    setUp()
    llm.mockResolvedValue({ success: false, errorCode: 'NOT_CONFIGURED', error: 'x' })
    expect(await failure()).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false })
  })

  it.each([
    ['PROVIDER', true],
    ['SCHEMA', false],
    ['TRUNCATED', false],
  ] as const)('fails an LLM %s error as LLM_FAILED (retryable: %s)', async (errorCode, retryable) => {
    llm.mockResolvedValue({ success: false, errorCode, error: 'x' })

    expect(await failure()).toMatchObject({ code: 'LLM_FAILED', retryable })
  })
})
