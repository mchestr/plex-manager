/**
 * The public share page renders only the share-safe projection and asks
 * search engines not to index it (P0.8: RWP-01, SEC-16).
 */

import SharedWrappedPage, { generateMetadata } from '@/app/(app)/wrapped/share/[token]/page'
import { WrappedShareSummary } from '@/components/wrapped/wrapped-share-summary'
import type { ShareSafeRewindV2 } from '@/lib/wrapped/data/share-safe-v2'
import { notFound } from 'next/navigation'
import { isValidElement } from 'react'

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('@/lib/utils', () => ({
  getBaseUrl: () => 'http://localhost:3000',
}))

jest.mock('@/components/wrapped/wrapped-share-summary', () => ({
  WrappedShareSummary: () => null,
}))

const projection: ShareSafeRewindV2 = {
  year: 2026,
  ownerName: 'Mike',
  summary: 'A <highlight>big</highlight> year.',
  archetypeName: 'The Midnight Marathoner',
  totals: { minutes: 6000, movies: 12, shows: 4, episodes: 40 },
  months: [{ month: 3, minutes: 600 }],
  topMovies: [{ title: 'Dune: Part Three', minutes: 165, plays: 1, ratingKey: '101' }],
  topShows: [{ title: 'Severance', minutes: 900, plays: 18, episodes: 18 }],
}

function mockApiResponse(status: number, body: unknown) {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  })
}

const params = (token: string) => ({ params: Promise.resolve({ token }) })

describe('shared wrapped page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('sets noindex and names the owner from the projection', async () => {
    mockApiResponse(200, { success: true, wrapped: projection })

    const metadata = await generateMetadata(params('token-1'))

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe("Mike's 2026 Plex Wrapped")
    expect(metadata.description).toBe('A big year.')
  })

  it('sets noindex on the not-found metadata', async () => {
    mockApiResponse(404, { success: false })

    const metadata = await generateMetadata(params('missing'))

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe('Plex Wrapped - Share Not Found')
  })

  it('passes only the projection and token to the summary', async () => {
    mockApiResponse(200, { success: true, wrapped: projection })

    const element = await SharedWrappedPage(params('token-1'))

    expect(isValidElement(element)).toBe(true)
    expect(element.type).toBe(WrappedShareSummary)
    expect(element.props).toEqual({ rewind: projection, shareToken: 'token-1' })
  })

  it('renders not found rather than pass on a response with extra keys', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    mockApiResponse(200, {
      success: true,
      wrapped: { ...projection, data: { statistics: { leaderboards: {} } } },
    })

    await expect(SharedWrappedPage(params('token-1'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
