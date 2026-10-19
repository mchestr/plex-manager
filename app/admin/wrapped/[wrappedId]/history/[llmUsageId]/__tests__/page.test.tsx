/**
 * A historical version whose LLM text the October 2026 privacy clean-up
 * removed shows the clean-up notice in place of the viewer (P0.20).
 */

import { render, screen } from '@testing-library/react'

import HistoricalWrappedPage from '@/app/admin/wrapped/[wrappedId]/history/[llmUsageId]/page'
import { getHistoricalWrappedData } from '@/actions/admin'

jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/actions/admin', () => ({
  getHistoricalWrappedData: jest.fn(),
}))

jest.mock('@/components/admin/wrapped/historical-wrapped-selector-header', () => ({
  HistoricalWrappedSelectorHeader: ({ userId }: { userId: string }) => <div data-testid="selector-header">{userId}</div>,
}))

jest.mock('@/components/wrapped/wrapped-viewer-wrapper', () => ({
  WrappedViewerWrapper: () => <div data-testid="wrapped-viewer" />,
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
    expect(screen.queryByTestId('wrapped-viewer')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Mike's 2025 Wrapped" })).toBeInTheDocument()
    expect(screen.getByTestId('selector-header')).toHaveTextContent('user-1')
  })

  it('shows the viewer for a version that has text', async () => {
    mockGetHistoricalWrappedData.mockResolvedValue({ ...version, removed: false, wrappedData: { year: 2025, userId: 'user-1' } })

    await renderPage()

    expect(screen.getByTestId('wrapped-viewer')).toBeInTheDocument()
    expect(screen.queryByTestId('llm-text-removed-notice')).not.toBeInTheDocument()
  })
})
