/**
 * A historical version whose LLM text the October 2026 privacy clean-up
 * removed shows the clean-up notice in place of the article (P0.20); one with
 * text renders as an archive article (P7.13).
 */

import { render, screen } from '@testing-library/react'

import HistoricalWrappedPage from '@/app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page'
import { getHistoricalWrappedData } from '@/actions/admin'
import { buildStoredV2Json } from '@/lib/wrapped/__tests__/fixtures'
import { parseStoredRewind } from '@/lib/wrapped/data/parse-stored'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/actions/admin', () => ({
  getHistoricalWrappedData: jest.fn(),
  getHistoricalWrappedVersions: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/components/admin/wrapped/historical-wrapped-selector-header', () => ({
  HistoricalWrappedSelectorHeader: ({ userId }: { userId: string }) => <div data-testid="selector-header">{userId}</div>,
}))

jest.mock('@/lib/rewind/fonts', () => ({ rewindFontVariables: 'rw-fonts' }))
jest.mock('@/lib/brand', () => ({ serverName: async () => 'Chester Family Plex' }))
jest.mock('@/lib/settings/app-settings', () => ({
  getAppSettings: async () => ({ locale: 'en-US', timeZone: 'UTC', serverName: 'Chester Family Plex' }),
  getFormat: async () => (await import('@/lib/utils/format')).bindFormat({ timeZone: 'America/Chicago', locale: 'en-US' }),
}))

const mockGetHistoricalWrappedData = getHistoricalWrappedData as jest.Mock

const version = {
  year: 2025,
  userId: 'user-1',
  userName: 'Mike',
  llmUsage: {
    id: 'usage-1',
    createdAt: new Date('2025-12-01T00:00:00Z'),
    provider: 'openai',
    model: 'gpt-5-mini',
    cost: 0.01,
    totalTokens: 1000,
  },
}

async function renderPage() {
  const ui = await HistoricalWrappedPage({
    params: Promise.resolve({ wrappedId: 'wrapped-1', llmUsageId: 'usage-1' }),
  })
  return render(<>{ui}</>)
}

describe('Admin historical Rewind version page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the clean-up notice when the version text was removed', async () => {
    mockGetHistoricalWrappedData.mockResolvedValue({ ...version, removed: true })

    await renderPage()

    expect(screen.getByTestId('llm-text-removed-notice')).toHaveTextContent(
      'Text removed in the October 2026 privacy clean-up'
    )
    expect(screen.queryByTestId('rewind-article-mode')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Mike's Rewind 2025" })).toBeInTheDocument()
    expect(screen.getByTestId('selector-header')).toHaveTextContent('user-1')
  })

  it('carries breadcrumbs back to the member and their Rewind tab, with the zoned version time (UI-21)', async () => {
    mockGetHistoricalWrappedData.mockResolvedValue({ ...version, removed: true })

    await renderPage()

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(crumbs).toHaveTextContent('Users/Mike/Rewind 2025/Version of Nov 30, 2025, 6:00 PM CST')
    expect(screen.getByRole('link', { name: 'Mike' })).toHaveAttribute('href', '/admin/users/user-1')
    expect(screen.getByRole('link', { name: 'Rewind 2025' })).toHaveAttribute('href', '/admin/users/user-1?tab=rewind')
    expect(screen.queryAllByRole('main')).toHaveLength(0)
  })

  it('shows the archive article, in the Rewind scope, for a version that has text', async () => {
    const stored = parseStoredRewind(buildStoredV2Json())
    if (stored.version !== 2) throw new Error('fixture is not v2')
    mockGetHistoricalWrappedData.mockResolvedValue({ ...version, removed: false, wrappedData: stored.legacy })

    await renderPage()

    expect(screen.getByTestId('rewind-scope')).toContainElement(screen.getByTestId('rewind-article-mode'))
    expect(screen.getByRole('heading', { level: 1, name: 'Chester Family Plex Rewind 2025' })).toBeInTheDocument()
    expect(screen.queryByTestId('llm-text-removed-notice')).not.toBeInTheDocument()
  })
})
